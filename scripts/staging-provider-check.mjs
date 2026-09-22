import { lstat, readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { pathToFileURL } from "node:url";

const CHAIN_ID = 11155111n;
const ETHERSCAN_URL = "https://api.etherscan.io/v2/api";
const MAX_BLOCK_AGE_SECONDS = 300;
// Official Sepolia VRF coordinator: https://docs.chain.link/vrf/v2-5/supported-networks
const SEPOLIA_VRF_COORDINATOR = "0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B";
class StagingProviderError extends Error {}
const fail = (message) => { throw new StagingProviderError(message); };

function dedicatedRpc(value) {
  let url;
  try { url = new URL(value); } catch { fail("Configure a dedicated HTTPS Sepolia RPC URL."); }
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash) {
    fail("Sepolia RPC requires HTTPS without a custom port, user information, query or fragment.");
  }
  const quicknode = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.ethereum-sepolia)?\.quiknode\.pro$/.test(url.hostname);
  const alchemy = url.hostname === "eth-sepolia.g.alchemy.com";
  const infura = url.hostname === "sepolia.infura.io";
  if (!quicknode && !alchemy && !infura) fail("Use a recognized QuickNode, Alchemy or Infura Sepolia endpoint.");
  const path = quicknode ? /^\/[a-zA-Z0-9_-]{20,128}\/?$/ : alchemy ? /^\/v2\/[a-zA-Z0-9_-]{20,128}\/?$/ : /^\/v3\/[a-zA-Z0-9_-]{20,128}\/?$/;
  if (!path.test(url.pathname)) fail("The dedicated Sepolia RPC endpoint is missing its authentication token.");
  return { url: url.href, provider: quicknode ? "QuickNode" : alchemy ? "Alchemy" : "Infura" };
}

/** Pure configuration validation; importing this module does not read secrets. */
export function stagingProviderConfig(env) {
  if (env.MANEKINEKO_CHAIN_ID !== "11155111") fail("Staging providers require MANEKINEKO_CHAIN_ID=11155111.");
  const rpc = dedicatedRpc(env.SEPOLIA_RPC_URL);
  const affiliateRpc = dedicatedRpc(env.AFFILIATE_RPC_URL_11155111);
  const key = env.ETHERSCAN_API_KEY;
  if (typeof key !== "string" || !/^[a-zA-Z0-9]{20,128}$/.test(key) || /your|example|placeholder/i.test(key)) {
    fail("Set a real ETHERSCAN_API_KEY in the private staging environment.");
  }
  return { rpc, affiliateRpc, etherscanKey: key };
}

function quantity(value, label) {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/i.test(value)) fail(`${label} returned an invalid numeric response.`);
  return BigInt(value);
}

async function safeJson(fetchImpl, url, options, label) {
  try {
    const response = await fetchImpl(url, { ...options, redirect: "error", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) fail(`${label} request failed. Check provider access, quota and availability.`);
    // Provider diagnostics and response bodies may contain credentials; never log them.
    const reader = response.body?.getReader();
    if (!reader) fail(`${label} returned no response body.`);
    const chunks = [];
    let length = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > 1_048_576) { await reader.cancel(); fail(`${label} returned an oversized response.`); }
      chunks.push(Buffer.from(part.value));
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof StagingProviderError) throw error;
    fail(`${label} request failed. Check provider access, quota and availability.`);
  }
}

async function rpcRequest(fetchImpl, url, method, params, id) {
  const result = await safeJson(fetchImpl, url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id }),
  }, "Sepolia RPC");
  if (!result || result.jsonrpc !== "2.0" || result.id !== id || result.error) fail("Sepolia RPC rejected the read-only request.");
  return result.result;
}

/** Reads only chain ID, the latest block and a known coordinator's verified ABI. */
export async function checkStagingProviders(env, { fetchImpl = fetch, now = () => Date.now() } = {}) {
  const config = stagingProviderConfig(env);
  const endpoints = config.rpc.url === config.affiliateRpc.url
    ? [{ ...config.rpc, usage: "contracts and web" }]
    : [{ ...config.rpc, usage: "contracts" }, { ...config.affiliateRpc, usage: "web" }];
  const rpc = [];
  for (const endpoint of endpoints) {
    const chainId = quantity(await rpcRequest(fetchImpl, endpoint.url, "eth_chainId", [], 1), "Sepolia RPC");
    if (chainId !== CHAIN_ID) fail("RPC chain mismatch: staging requires Ethereum Sepolia (11155111).");
    const block = await rpcRequest(fetchImpl, endpoint.url, "eth_getBlockByNumber", ["latest", false], 2);
    const number = quantity(block?.number, "Sepolia RPC block");
    const timestamp = quantity(block?.timestamp, "Sepolia RPC block");
    if (number === 0n || timestamp > BigInt(Number.MAX_SAFE_INTEGER) || !/^0x[0-9a-f]{64}$/i.test(block?.hash ?? "")) fail("Sepolia RPC returned an invalid latest block.");
    const ageSeconds = Math.floor(now() / 1000) - Number(timestamp);
    if (ageSeconds > MAX_BLOCK_AGE_SECONDS || ageSeconds < -30) fail("Sepolia RPC latest block is stale or its timestamp is in the future.");
    rpc.push({ provider: endpoint.provider, usage: endpoint.usage, blockNumber: number.toString(), blockAgeSeconds: ageSeconds });
  }
  // V2 takes the network explicitly. The API host cannot be overridden by env values.
  // ABI access is free on every supported chain, unlike some proxy/data endpoints.
  // https://docs.etherscan.io/supported-chains
  const etherscan = new URL(ETHERSCAN_URL);
  etherscan.search = new URLSearchParams({ chainid: CHAIN_ID.toString(), module: "contract", action: "getabi", address: SEPOLIA_VRF_COORDINATOR, apikey: config.etherscanKey }).toString();
  const result = await safeJson(fetchImpl, etherscan, { method: "GET" }, "Etherscan V2");
  if (!result || result.status !== "1" || result.message !== "OK" || result.error || typeof result.result !== "string") fail("Etherscan V2 did not accept the key or read request. Check activation, quota and key validity.");
  let abi;
  try { abi = JSON.parse(result.result); } catch { fail("Etherscan V2 returned an invalid ABI response."); }
  if (!Array.isArray(abi) || !abi.some(entry => entry?.type === "function" && entry.name === "requestRandomWords")) fail("Etherscan V2 did not return the expected verified coordinator ABI.");
  return { chainId: Number(CHAIN_ID), rpc, etherscan: { apiVersion: 2, verifiedAbiReadable: true, checkedAddress: SEPOLIA_VRF_COORDINATOR } };
}

export function stagingProviderErrorMessage(error) {
  return error instanceof StagingProviderError ? error.message : "Provider check failed. Credentials and provider error details were withheld.";
}

export async function runStagingProviderCheck(args = process.argv.slice(2)) {
  if (args.length) fail("Usage: node scripts/staging-provider-check.mjs");
  const path = new URL("../.env.staging.local", import.meta.url);
  const stat = await lstat(path);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0) fail(".env.staging.local must be a private regular file (chmod 600).");
  // Never load ambient process variables, development dotenv files or wallet keys.
  const report = await checkStagingProviders(parseEnv(await readFile(path, "utf8")));
  console.log(JSON.stringify(report, null, 2));
  console.log("Read-only Sepolia provider checks passed. No transactions were signed or sent.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await runStagingProviderCheck(); }
  catch (error) { console.error(stagingProviderErrorMessage(error)); process.exitCode = 1; }
}
