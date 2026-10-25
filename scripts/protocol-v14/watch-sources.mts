/** Offchain source publisher. Never deploys, prepares a collection, signs or posts
 * to X. Run alongside a future release to verify newly prepared collections. */
import { Contract, JsonRpcProvider, keccak256, toUtf8Bytes } from 'ethers';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { durable, privateRead } from '../protocol-v12/rehearsal/store.mts';
import { publishSources } from './source-publication.mts';
import { explorerTransport } from './explorer-fetch.mts';
import type { DeploymentExpectation } from './verify-deployment.mts';
import { publicationCurrent } from './publication-report.mts';
export { publicationCurrent } from './publication-report.mts';
async function main() {
  const [manifest, directory, mode] = process.argv.slice(2);
  if (!manifest || !directory || !['--once', '--watch'].includes(mode) || !process.env.ETHERSCAN_API_KEY) throw new Error('Usage: watch-sources.mts expectation.json private-output-directory --once|--watch; explorer key required.');
  const expected: DeploymentExpectation = JSON.parse(await readFile(manifest,'utf8'));
  const urls = [process.env.V14_VERIFY_RPC_URL, process.env.V14_VERIFY_SECONDARY_RPC_URL];
  if (![1,11155111].includes(expected.chainId) || !urls.every(Boolean) || new URL(urls[0]!).hostname === new URL(urls[1]!).hostname) throw new Error('Two independent public-network RPCs required.');
  const providers = urls.map(url => new JsonRpcProvider(url));
  const outputDir = resolve(directory); await mkdir(outputDir,{recursive:true,mode:0o700});
  try {
    do {
      const observed = await Promise.all(providers.map(async provider => {
        if (Number((await provider.getNetwork()).chainId) !== expected.chainId || keccak256(await provider.getCode(expected.controller)) !== expected.controllerCodeHash) throw new Error('Deployment pin mismatch.');
        return Number(await new Contract(expected.controller,['function roundCount() view returns (uint256)'],provider).roundCount());
      }));
      if (observed[0] !== observed[1]) throw new Error('RPC collection counts disagree; retry after confirmation.');
      const finalCounts = await Promise.all(providers.map(async p => {
        const final = await p.getBlock('finalized');
        return Number(await new Contract(expected.controller,['function roundCount() view returns (uint256)'],p).roundCount({blockTag:final!.number}));
      }));
      if (finalCounts.some(n => n !== observed[0])) {
        if (mode === '--once') throw new Error('New collection is awaiting finality.');
        await new Promise(r => setTimeout(r, 60000)); continue;
      }
      const output = resolve(outputDir, `collections-${observed[0]}.json`);
      let previous: unknown;
      try { previous = JSON.parse(await readFile(output,'utf8')); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
      if (!publicationCurrent(previous,expected,observed[0])) {
        if (previous) throw new Error('Existing release report has a different identity. Preserve it and select the matching deployment directory.');
        // This child only verifies/publishes. Its successful report requires the
        // full two-RPC runtime check and source readback, including all new rounds.
        const status = await new Promise<number>(resolveStatus => {
          const child = spawn(process.execPath,['--import','tsx',new URL('./verify-deployment.mts',import.meta.url).pathname,resolve(manifest),output],{stdio:'inherit'});
          child.on('error',()=>resolveStatus(1)); child.on('exit',code=>resolveStatus(code??1));
        });
        if (status !== 0) throw new Error('Source publication incomplete; restart with the same directory to resume.');
      }
      const rehearsalDirectory = process.env.V14_REHEARSAL_STATE_DIRECTORY;
      if (rehearsalDirectory) {
        let state: any;
        try { state = JSON.parse(await privateRead(resolve(rehearsalDirectory,'state.json'))); } catch(e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
        if (state?.funder) {
          const helper = JSON.parse(await readFile(new URL('../../apps/contracts/artifacts/contracts/test/V12RehearsalFunding.sol/V12RehearsalFunding.json',import.meta.url),'utf8'));
          const deployment = Object.values(state.journals).flatMap((j: any) => j.transactions).find((t: any) => t.action === 'deploy:funder' && t.state === 'confirmed') as any;
          if (!deployment) throw new Error('Missing confirmed helper deployment.');
          for (const p of providers) {
            const receipt = await p.getTransactionReceipt(deployment.hash);
            if (receipt?.status !== 1 || receipt.from !== state.bank || receipt.contractAddress !== state.funder || keccak256(await p.getCode(state.funder)) !== keccak256(helper.deployedBytecode)) throw new Error('Funding helper runtime or receipt mismatch.');
          }
          const path = resolve(outputDir,'funding-helper.json'); let previous: any;
          try { previous = JSON.parse(await privateRead(path)); } catch(e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
          if (!previous) {
            const transport = explorerTransport();
            try { const [publication] = await publishSources(expected.chainId,[{name:'V12RehearsalFunding',address:state.funder,args:[]}],path+'.sources.json',{apiKey:process.env.ETHERSCAN_API_KEY!,passes:24,fetcher:transport.fetcher});
              await durable(path,{controller:expected.controller,...publication});
            } finally { await transport.close(); }
          } else if (previous.controller !== expected.controller || previous.address !== state.funder || !previous.published) throw new Error('Funding source report identity differs.');
        }
      }
      if (mode === '--once') break;
      await new Promise(resolveWait=>setTimeout(resolveWait,60000));
    } while (true);
  } finally { providers.forEach(p=>p.destroy()); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(()=>{
  console.error('Source publisher stopped: publication is incomplete or deployment checks failed. Inspect the private journal and resume with the same deployment inputs.'); process.exitCode=1;
});
