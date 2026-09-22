import assert from "node:assert/strict";
import { test } from "node:test";
import { checkStagingProviders, stagingProviderConfig, stagingProviderErrorMessage } from "./staging-provider-check.mjs";

const TOKEN = "fictional-test-token-for-provider";
const KEY = "FICTIONALTESTETHERSCANKEY123456789";
const NOW = 1_790_000_000_000;
const fixture = () => ({
  MANEKINEKO_CHAIN_ID: "11155111",
  SEPOLIA_RPC_URL: `https://test-endpoint.ethereum-sepolia.quiknode.pro/${TOKEN}/`,
  AFFILIATE_RPC_URL_11155111: `https://test-endpoint.ethereum-sepolia.quiknode.pro/${TOKEN}/`,
  ETHERSCAN_API_KEY: KEY,
});
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
function mockFetch({ chain = "0xaa36a7", age = 10, etherscanResult, rpcFailure = false } = {}) {
  const calls = [];
  const fetchImpl = async (input, options) => {
    const url = new URL(input); calls.push({ url, options });
    assert.equal(options.redirect, "error");
    if (url.hostname === "api.etherscan.io") {
      assert.equal(url.pathname, "/v2/api");
      assert.equal(url.searchParams.get("chainid"), "11155111");
      assert.equal(url.searchParams.get("module"), "contract");
      assert.equal(url.searchParams.get("action"), "getabi");
      assert.equal(url.searchParams.get("address"), "0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B");
      assert.equal(url.searchParams.get("apikey"), KEY);
      return json(etherscanResult ?? { status: "1", message: "OK", result: JSON.stringify([{ type: "function", name: "requestRandomWords" }]) });
    }
    if (rpcFailure) throw new Error(`Secret upstream failure at ${url.href} with ${KEY}`);
    const body = JSON.parse(options.body);
    assert.equal(options.method, "POST");
    assert.ok(["eth_chainId", "eth_getBlockByNumber"].includes(body.method));
    return json({ jsonrpc: "2.0", id: body.id, result: body.method === "eth_chainId" ? chain : {
      number: "0xc35000", timestamp: `0x${(BigInt(NOW / 1000) - BigInt(age)).toString(16)}`, hash: `0x${"a".repeat(64)}`,
    } });
  };
  return { fetchImpl, calls, now: () => NOW };
}

test("checks a dedicated RPC and Etherscan with only three read requests, without disclosing credentials", async () => {
  const mock = mockFetch();
  const report = await checkStagingProviders(fixture(), mock);
  assert.equal(report.chainId, 11155111);
  assert.equal(report.rpc[0].blockAgeSeconds, 10);
  assert.equal(report.rpc[0].usage, "contracts and web");
  assert.equal(report.etherscan.apiVersion, 2);
  assert.equal(mock.calls.length, 3);
  assert.equal(JSON.stringify(report).includes(TOKEN), false);
  assert.equal(JSON.stringify(report).includes(KEY), false);
});

test("checks separate web and deployment endpoint credentials independently", async () => {
  const env = fixture(); env.AFFILIATE_RPC_URL_11155111 = `https://eth-sepolia.g.alchemy.com/v2/${TOKEN}`;
  const mock = mockFetch();
  const report = await checkStagingProviders(env, mock);
  assert.deepEqual(report.rpc.map(({ usage }) => usage), ["contracts", "web"]);
  assert.equal(mock.calls.length, 5);
});

for (const url of [
  `https://test-endpoint.quiknode.pro/${TOKEN}`,
  `https://eth-sepolia.g.alchemy.com/v2/${TOKEN}`,
  `https://sepolia.infura.io/v3/${TOKEN}`,
]) test(`recognizes an authenticated endpoint for ${new URL(url).hostname}`, () => {
  assert.ok(stagingProviderConfig({ ...fixture(), SEPOLIA_RPC_URL: url }).rpc.provider);
});

for (const [label, change] of [
  ["mainnet configuration", (env) => { env.MANEKINEKO_CHAIN_ID = "1"; }],
  ["HTTP", (env) => { env.SEPOLIA_RPC_URL = env.SEPOLIA_RPC_URL.replace("https:", "http:"); }],
  ["arbitrary destination", (env) => { env.SEPOLIA_RPC_URL = `https://example.com/${TOKEN}`; }],
  ["lookalike hostname", (env) => { env.SEPOLIA_RPC_URL = `https://test.quiknode.pro.attacker.example/${TOKEN}`; }],
  ["userinfo confusion", (env) => { env.SEPOLIA_RPC_URL = `https://test.quiknode.pro@attacker.example/${TOKEN}`; }],
  ["URL credentials", (env) => { env.SEPOLIA_RPC_URL = `https://user:password@test.quiknode.pro/${TOKEN}`; }],
  ["custom port", (env) => { env.SEPOLIA_RPC_URL = `https://test.quiknode.pro:8443/${TOKEN}`; }],
  ["query", (env) => { env.SEPOLIA_RPC_URL += "?target=another"; }],
  ["fragment", (env) => { env.SEPOLIA_RPC_URL += "#part"; }],
  ["missing endpoint token", (env) => { env.SEPOLIA_RPC_URL = "https://test.quiknode.pro/"; }],
  ["missing web RPC", (env) => { delete env.AFFILIATE_RPC_URL_11155111; }],
  ["missing Etherscan key", (env) => { delete env.ETHERSCAN_API_KEY; }],
  ["placeholder Etherscan key", (env) => { env.ETHERSCAN_API_KEY = "YourApiKeyTokenYourApiKeyToken"; }],
]) test(`rejects ${label} before making any request`, async () => {
  const env = fixture(); change(env);
  const mock = mockFetch();
  await assert.rejects(() => checkStagingProviders(env, mock));
  assert.equal(mock.calls.length, 0);
});

test("rejects an RPC reporting Mainnet without continuing to block or Etherscan requests", async () => {
  const mock = mockFetch({ chain: "0x1" });
  await assert.rejects(() => checkStagingProviders(fixture(), mock), /chain mismatch/);
  assert.equal(mock.calls.length, 1);
});

for (const age of [301, -31]) test(`rejects invalid block freshness (${age} seconds)`, async () => {
  const mock = mockFetch({ age });
  await assert.rejects(() => checkStagingProviders(fixture(), mock), /stale or/);
  assert.equal(mock.calls.length, 2);
});

for (const etherscanResult of [
  { status: "0", message: "NOTOK", result: `Invalid API Key ${KEY}` },
  { jsonrpc: "2.0", id: 83, error: { message: KEY } },
  { status: "1", message: "OK-Missing/Invalid API Key, rate limit of 1/5sec applied", result: "[]" },
  { status: "1", message: "OK", result: "[]" },
  { status: "1", message: "OK", result: "not valid JSON" },
]) test("rejects Etherscan key/errors or invalid ABI without raw provider details", async () => {
  await assert.rejects(() => checkStagingProviders(fixture(), mockFetch({ etherscanResult })), (error) => {
    assert.equal(error.message.includes(KEY), false); return true;
  });
});

test("network failures are sanitized before reaching callers or the CLI", async () => {
  await assert.rejects(() => checkStagingProviders(fixture(), mockFetch({ rpcFailure: true })), (error) => {
    assert.equal(error.message.includes(TOKEN), false);
    assert.equal(error.message.includes(KEY), false);
    return true;
  });
  assert.equal(stagingProviderErrorMessage(new Error(`${TOKEN} ${KEY}`)).includes(KEY), false);
});
