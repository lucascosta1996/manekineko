import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { getAddress, Interface } from "ethers";

const ORIGIN = "https://eth-sepolia.blockscout.com";
const ABI = new Interface(["function tokenURI(uint256) view returns(string)"]);
const RETRYABLE_POLL_ERRORS = new Set(["request_failed", "http_502", "http_503", "http_504"]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const HELP = `Check on-chain Sepolia NFT metadata against Blockscout (read-only by default).
Usage: node --env-file=.env.staging.local scripts/refresh-nft-explorer.mjs \\
  --contract ADDRESS --from 1 --to 20 [--refresh] [--output PATH]

SEPOLIA_RPC_URL must be an HTTPS read-only Sepolia RPC endpoint.
At most 20 tokens per invocation; IDs must be between 1 and 65536.
--refresh submits a public Blockscout metadata refresh only for stale tokens.
Refreshes are spaced at least 5 seconds apart, with up to 60 seconds of polling.
Only transient polling GET failures are retried inside that deadline; PATCH is never retried.
HTTP 429, authentication errors, and challenges stop the run; nothing is bypassed.
A queue acknowledgement is not success: metadata must match the on-chain JSON.
No database, wallet, signer, private key, or blockchain transaction is used.
Exit codes: 0 = all matched; 2 = stale in check-only mode; 1 = stopped/error.
`;
class CheckError extends Error { constructor(code) { super(code); this.code = code; } }
const fail = code => { throw new CheckError(code); };

export function parseArgs(args) {
  if (args.length === 1 && args[0] === "--help") return { help: true };
  const values = {}, seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (!["--contract", "--from", "--to", "--refresh", "--output"].includes(key) || seen.has(key)) fail("invalid_arguments");
    seen.add(key);
    if (key === "--refresh") values.refresh = true;
    else { const value = args[++index]; if (!value || value.startsWith("--")) fail("invalid_arguments"); values[key.slice(2)] = value; }
  }
  let contract;
  try { contract = getAddress(values.contract).toLowerCase(); } catch { fail("invalid_contract"); }
  if (/^0x0{40}$/.test(contract)) fail("invalid_contract");
  for (const key of ["from", "to"]) if (!/^[1-9][0-9]{0,4}$/.test(values[key] ?? "") || Number(values[key]) > 65536) fail("invalid_token_range");
  const from = Number(values.from), to = Number(values.to);
  if (to < from || to - from + 1 > 20) fail("invalid_token_range");
  return { contract, from, to, refresh: values.refresh === true, output: values.output };
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export function metadataEqual(expected, actual) { return canonical(expected) === canonical(actual); }
function validMetadata(value) {
  return value && typeof value === "object" && !Array.isArray(value) && typeof value.image === "string" && Array.isArray(value.attributes);
}
export function decodeTokenUri(uri) {
  if (typeof uri !== "string" || uri.length > 200000 || !uri.startsWith("data:application/json;base64,")) fail("unsupported_token_uri");
  const encoded = uri.slice("data:application/json;base64,".length);
  const bytes = Buffer.from(encoded, "base64");
  if (!encoded || bytes.toString("base64") !== encoded) fail("invalid_onchain_metadata");
  let value;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { fail("invalid_onchain_metadata"); }
  if (!validMetadata(value)) fail("invalid_onchain_metadata");
  return value;
}

async function jsonRequest(url, options, fetcher, timeoutMs = 10000) {
  try {
    const response = await fetcher(url, { ...options, redirect: "error", signal: AbortSignal.timeout(Math.max(1, Math.min(10000, timeoutMs))), headers: { Accept: "application/json", ...options.headers } });
    if (response.status === 429) fail("rate_limited");
    if ([401, 403].includes(response.status)) fail("authentication_or_challenge_required");
    if (!response.ok) fail(`http_${response.status}`);
    if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) fail("unexpected_response_or_challenge");
    const body = await response.text();
    if (body.length > 1000000) fail("response_too_large");
    return JSON.parse(body);
  } catch (error) { if (error instanceof CheckError) throw error; fail("request_failed"); }
}

/** Injectable reads/clock let tests prove pacing and stop conditions without any network calls. */
export async function checkTokens(options, dependencies) {
  const fetcher = dependencies.fetch ?? fetch, pause = dependencies.sleep ?? sleep, now = dependencies.now ?? Date.now;
  const results = []; let lastRefresh = -Infinity;
  for (let tokenId = options.from; tokenId <= options.to; tokenId++) {
    const entry = { tokenId: String(tokenId) }; results.push(entry);
    try {
      const expected = await dependencies.readMetadata(tokenId);
      if (!validMetadata(expected)) fail("invalid_onchain_metadata");
      const endpoint = `${ORIGIN}/api/v2/tokens/${options.contract}/instances/${tokenId}`;
      const read = async timeout => (await jsonRequest(endpoint, { method: "GET" }, fetcher, timeout)).metadata;
      let actual = await read();
      entry.expectedAttributes = expected.attributes; entry.previousAttributes = actual?.attributes ?? null;
      if (metadataEqual(expected, actual)) entry.status = "matched";
      else if (!options.refresh) entry.status = "stale";
      else {
        await pause(Math.max(0, 5000 - (now() - lastRefresh)));
        lastRefresh = now();
        const acknowledged = await jsonRequest(`${endpoint}/refetch-metadata`, { method: "PATCH" }, fetcher);
        if (acknowledged?.message !== "OK") fail("refresh_not_acknowledged");
        entry.refreshAcknowledged = true;
        const deadline = now() + 60000;
        while (now() < deadline) {
          await pause(Math.min(2000, deadline - now()));
          if (now() >= deadline) break;
          try { actual = await read(deadline - now()); }
          catch (error) {
            if (error instanceof CheckError && RETRYABLE_POLL_ERRORS.has(error.code)) continue;
            throw error;
          }
          if (metadataEqual(expected, actual)) break;
        }
        if (!metadataEqual(expected, actual)) fail("refresh_not_confirmed");
        entry.status = "refreshed";
      }
      entry.imageMatches = expected.image === actual?.image;
      entry.attributesMatch = metadataEqual(expected.attributes, actual?.attributes);
      entry.metadataMatches = metadataEqual(expected, actual);
      dependencies.onProgress?.(entry);
    } catch (error) {
      entry.status = "failed"; entry.error = error instanceof CheckError ? error.code : "verification_failed";
      dependencies.onProgress?.(entry); break;
    }
  }
  return { contract: options.contract, chainId: 11155111, explorer: ORIGIN, refresh: options.refresh,
    from: options.from, to: options.to, checkedAt: new Date(now()).toISOString(), results,
    complete: results.length === options.to - options.from + 1 && results.every(item => item.metadataMatches) };
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) { console.log(HELP); return; }
    const rpcUrl = process.env.SEPOLIA_RPC_URL;
    if (!rpcUrl || new URL(rpcUrl).protocol !== "https:") fail("sepolia_rpc_not_configured");
    let id = 0;
    const rpc = async (method, params) => {
      const requestId = ++id;
      const body = await jsonRequest(rpcUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }) }, fetch);
      if (body.jsonrpc !== "2.0" || body.id !== requestId || body.error || body.result == null) fail("rpc_read_failed");
      return body.result;
    };
    if (BigInt(await rpc("eth_chainId", [])) !== 11155111n) fail("wrong_rpc_network");
    const block = await rpc("eth_getBlockByNumber", ["latest", false]);
    if (!/^0x[0-9a-f]{64}$/i.test(block.hash) || !/^0x[0-9a-f]+$/i.test(block.number)) fail("invalid_reference_block");
    const report = await checkTokens(options, { readMetadata: async tokenId => {
      const raw = await rpc("eth_call", [{ to: options.contract, data: ABI.encodeFunctionData("tokenURI", [tokenId]) }, { blockHash: block.hash, requireCanonical: true }]);
      return decodeTokenUri(ABI.decodeFunctionResult("tokenURI", raw)[0]);
    }, onProgress: item => console.error(`NFT ${item.tokenId}: ${item.status}${item.error ? ` (${item.error})` : ""}`) });
    const canonicalBlock = await rpc("eth_getBlockByNumber", [block.number, false]);
    report.referenceBlock = { number: BigInt(block.number).toString(), hash: block.hash };
    report.canonical = canonicalBlock.hash?.toLowerCase() === block.hash.toLowerCase();
    if (!report.canonical) { report.complete = false; report.error = "reference_block_reorganized"; }
    if (options.output) await writeFile(options.output, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.complete ? 0 : report.canonical && report.results.every(item => item.status !== "failed") && !options.refresh ? 2 : 1;
  } catch (error) { console.error(JSON.stringify({ error: error instanceof CheckError ? error.code : "explorer_verification_failed" })); process.exitCode = 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
