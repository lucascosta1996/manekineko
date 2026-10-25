/** Explorer publication has no wallet or transaction capability. Runtime checks alone
 * cannot establish that people can read a contract's code on a block explorer. */
import { readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Interface } from 'ethers';
import { advanceVerification, verificationJob, type VerificationJob } from '../season-runner/explorer-verification.ts';
import { durable, exclusive } from '../protocol-v12/rehearsal/store.mts';
export type SourceSpec = { name: string; address: string; args: readonly unknown[] };
export type PublishedJob = VerificationJob & { published?: boolean; verification?: "etherscan-exact" | "sourcify-exact"; sourcifyGuid?: string };
export async function exactSourceJob(chainId: number, spec: SourceSpec): Promise<PublishedJob> {
  if (!/^Manekineko[A-Za-z0-9]+$/.test(spec.name) && spec.name !== 'V12RehearsalFunding') throw new Error('Unknown contract artifact.');
  const root = new URL('../../apps/contracts/artifacts/', import.meta.url);
  const artifact = JSON.parse(await readFile(new URL(`contracts/${spec.name === "V12RehearsalFunding" ? "test/" : ""}${spec.name}.sol/${spec.name}.json`, root), 'utf8'));
  const build = JSON.parse(await readFile(new URL(`build-info/${artifact.buildInfoId}.json`, root), 'utf8'));
  if (!build.input?.sources?.[artifact.inputSourceName]?.content) throw new Error('Exact compiler input unavailable.');
  return verificationJob({ chainId, address: spec.address, contractName: `${artifact.inputSourceName}:${spec.name}`, compiler: `v${build.solcLongVersion}`, sourceCode: JSON.stringify(build.input), constructorArguments: new Interface(artifact.abi).encodeDeploy([...spec.args]).slice(2) });
}
/** Require the actual source and ABI to be readable, not just a submission GUID,
 * a generic API success, or a similar-bytecode match at another contract address. */
export function publishedSourceMatches(job: PublishedJob, result: unknown): boolean {
  return sourceMatches(job, result, false);
}
function sourceMatches(job: PublishedJob, result: unknown, allowSimilar: boolean): boolean {
  try {
    const data = result as { status: string; result: Record<string, string>[] };
    const row = data.result[0];
    if (data.status !== '1' || !row.SourceCode || (row.SimilarMatch && (!allowSimilar || !/^0x[0-9a-f]{40}$/i.test(row.SimilarMatch))) || row.Proxy === '1' || row.ContractName !== job.contractName.split(':').at(-1) || row.CompilerVersion !== job.compiler || (!(allowSimilar && row.SimilarMatch) && (row.ConstructorArguments ?? '').toLowerCase().replace(/^0x/, '') !== job.constructorArguments.toLowerCase())) return false;
    const abi = JSON.parse(row.ABI);
    if (!Array.isArray(abi) || !abi.some(entry => entry.type === 'function')) return false;
    const raw = row.SourceCode.startsWith('{{') ? row.SourceCode.slice(1, -1) : row.SourceCode;
    const published = JSON.parse(raw), expected = JSON.parse(job.sourceCode);
    return Object.entries(expected.sources).every(([path, source]) => published.sources?.[path]?.content === (source as { content: string }).content);
  } catch { return false; }
}
async function explorerSource(job: PublishedJob, apiKey: string, fetcher: typeof fetch = fetch): Promise<unknown> {
  const url = new URL('https://api.etherscan.io/v2/api');
  for (const [key, value] of Object.entries({ chainid: String(job.chainId), module: 'contract', action: 'getsourcecode', address: job.address, apikey: apiKey })) url.searchParams.set(key, value);
  try {
    const response = await fetcher(url.toString(), { signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!response.ok) { await response.body?.cancel(); return false; }
    return await response.json();
  } catch { return false; } // Never leak an authenticated explorer URL through a network error.
}
export async function readPublishedSource(job: PublishedJob, apiKey: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  return publishedSourceMatches(job, await explorerSource(job, apiKey, fetcher));
}
/** A Similar Match on Etherscan alone never passes. Require a second public
 * service's exact creation AND runtime match, the original source and constructor. */
export function sourcifySourceMatches(job: PublishedJob, result: any): boolean {
  try {
    if (result.match !== 'exact_match' || result.creationMatch !== 'exact_match' || result.runtimeMatch !== 'exact_match' ||
      result.chainId !== String(job.chainId) || result.address.toLowerCase() !== job.address.toLowerCase() ||
      result.compilation.compilerVersion !== job.compiler.replace(/^v/, '') || result.compilation.fullyQualifiedName !== job.contractName ||
      (result.creationBytecode.transformationValues?.constructorArguments ?? '').toLowerCase().replace(/^0x/, '') !== job.constructorArguments.toLowerCase() ||
      !Array.isArray(result.abi) || !result.abi.some((e: any) => e.type === 'function')) return false;
    return Object.entries(JSON.parse(job.sourceCode).sources).every(([path, source]) => result.sources?.[path]?.content === (source as {content:string}).content);
  } catch { return false; }
}
async function exactSourcify(job: PublishedJob, fetcher: typeof fetch, save: () => Promise<void>): Promise<boolean> {
  try {
    const url = `https://sourcify.dev/server/v2/contract/${job.chainId}/${job.address}?fields=all`;
    const response = await fetcher(url, {signal:AbortSignal.timeout(20000),redirect:'error'});
    if (response.ok && sourcifySourceMatches(job, await response.json())) return true;
    await response.body?.cancel().catch(() => {});
    if (!job.sourcifyGuid) {
      const submitted = await fetcher(`https://sourcify.dev/server/v2/verify/${job.chainId}/${job.address}`, {
        method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(30000),redirect:'error',
        body:JSON.stringify({stdJsonInput:JSON.parse(job.sourceCode),compilerVersion:job.compiler.replace(/^v/,''),contractIdentifier:job.contractName}),
      });
      const result = await submitted.json() as {verificationId?:string};
      if (submitted.ok && /^[0-9a-f-]{36}$/i.test(result.verificationId ?? '')) {job.sourcifyGuid=result.verificationId;await save();}
    }
  } catch { /* Network or pending verification never produces a release certificate. */ }
  return false;
}
export async function publishSources(chainId: number, specs: SourceSpec[], journal: string, options: { apiKey: string; fetcher?: typeof fetch; passes?: number; wait?: (ms: number) => Promise<void> }) {
  if (!options.apiKey || ![1, 11155111].includes(chainId) || !specs.length) throw new Error('Explorer key and public-network contracts are required.');
  const expected = await Promise.all(specs.map(spec => exactSourceJob(chainId, spec)));
  let jobs: Record<string, PublishedJob> = {};
  // Lock before reading or creating the journal so concurrent workers cannot
  // overwrite a saved GUID or publication receipt.
  await mkdir(dirname(journal), {recursive: true, mode: 0o700});
  const unlock = await exclusive(journal + '.lock');
  try {
    try { jobs = JSON.parse(await readFile(journal, 'utf8')); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    for (const job of expected) {
      const key = job.address.toLowerCase(), previous = jobs[key];
      if (previous && previous.fingerprint !== job.fingerprint) throw new Error('Publication journal differs from the exact deployment build.');
      jobs[key] = { ...(previous ?? job), published: false };
    }
    const save = () => durable(journal, jobs);
    await save();
    for (let pass = 0; pass < (options.passes ?? 1); pass++) {
      for (const job of expected.map(j => jobs[j.address.toLowerCase()])) {
        if (job.published) continue;
        const source = await explorerSource(job, options.apiKey, options.fetcher);
        if (publishedSourceMatches(job, source)) { job.published = true; job.verification = 'etherscan-exact'; job.state = 'verified'; delete job.reason; }
        else if (sourceMatches(job, source, true)) {
          if (await exactSourcify(job, options.fetcher ?? fetch, save)) { job.published = true; job.verification = 'sourcify-exact'; job.state = 'verified'; delete job.reason; }
        }
        else {
          await advanceVerification(job, { apiKey: options.apiKey, now: Date.now(), fetcher: options.fetcher, save });
          // A successful status response still needs readable source on a subsequent pass.
        }
        await save();
      }
      if (expected.every(j => jobs[j.address.toLowerCase()].published)) return expected.map(j => jobs[j.address.toLowerCase()]).map(j => ({ address: j.address, contract: j.contractName, sourceFingerprint: j.fingerprint, verification: j.verification, exactSource: j.verification === "sourcify-exact" ? `https://sourcify.dev/server/v2/contract/${chainId}/${j.address}?fields=all` : `https://${chainId === 11155111 ? "sepolia." : ""}etherscan.io/address/${j.address}#code`, explorer: `https://${chainId === 11155111 ? 'sepolia.' : ''}etherscan.io/address/${j.address}#code`, published: true as const }));
      if (expected.some(j => jobs[j.address.toLowerCase()].state === 'failed')) throw new Error('Explorer rejected source verification; review the exact build journal.');
      if (pass + 1 < (options.passes ?? 1)) await (options.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(15000);
    }
    throw new Error('Explorer publication is pending or unavailable. Resume with the same journal; this release is not ready.');
  } finally { await unlock(); }
}
