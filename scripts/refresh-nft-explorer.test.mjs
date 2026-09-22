import assert from "node:assert/strict";
import test from "node:test";
import { checkTokens, decodeTokenUri, metadataEqual, parseArgs } from "./refresh-nft-explorer.mjs";

const contract = `0x${"a".repeat(40)}`;
const expected = { name: "NFT", image: "data:image/svg+xml;base64,PHN2Zy8+", attributes: [{ trait_type: "Score", value: 20 }] };
const stale = { ...expected, attributes: [{ trait_type: "Status", value: "Sealed" }] };
const options = { contract, from: 1, to: 2, refresh: false };
const args = ["--contract", contract, "--from", "1", "--to", "20"];

test("CLI requires an exact contract and bounded explicit range; defaults to read-only", () => {
  assert.deepEqual(parseArgs(args), { contract, from: 1, to: 20, refresh: false, output: undefined });
  assert.equal(parseArgs([...args, "--refresh", "--output", "/tmp/public-evidence.json"]).refresh, true);
  assert.deepEqual(parseArgs(["--help"]), { help: true });
  for (const invalid of [[], [...args, "--refresh", "--refresh"], [...args, "--unknown"], [...args, "--output"],
    ["--contract", contract, "--from", "0", "--to", "2"], ["--contract", contract, "--from", "1", "--to", "21"],
    ["--contract", contract, "--from", "2", "--to", "1"], ["--contract", contract, "--from", "65536", "--to", "65537"],
    ["--contract", `0x${"0".repeat(40)}`, "--from", "1", "--to", "1"], ["--contract", "https://evil.invalid", "--from", "1", "--to", "1"]]) {
    assert.throws(() => parseArgs(invalid));
  }
});

test("metadata comparison sorts nested object keys, preserves array order and detects stale images or traits", () => {
  assert.equal(metadataEqual(expected, { attributes: [{ value: 20, trait_type: "Score" }], image: expected.image, name: "NFT" }), true);
  assert.equal(metadataEqual(expected, stale), false);
  assert.equal(metadataEqual(expected, { ...expected, image: "different" }), false);
  assert.equal(metadataEqual({ a: [1, 2] }, { a: [2, 1] }), false);
  const uri = "data:application/json;base64," + Buffer.from(JSON.stringify(expected)).toString("base64");
  assert.deepEqual(decodeTokenUri(uri), expected);
  for (const bad of ["https://evil.invalid/metadata", uri + "!", "data:application/json;base64,e30=", uri + "A".repeat(200000)]) assert.throws(() => decodeTokenUri(bad));
});

function dependencies(handler) {
  let clock = 10000;
  const calls = [];
  return { calls, readMetadata: async () => expected, now: () => clock, sleep: async ms => { assert.ok(ms >= 0); clock += ms; },
    fetch: async (url, init) => { calls.push({ url, method: init.method, at: clock }); assert.equal(new URL(url).origin, "https://eth-sepolia.blockscout.com"); return handler(url, init, calls); } };
}

test("check-only mode never submits PATCH, and distinguishes stale from already matching metadata", async () => {
  const deps = dependencies(url => Response.json({ metadata: url.endsWith("/1") ? expected : stale }));
  const report = await checkTokens(options, deps);
  assert.deepEqual(report.results.map(item => item.status), ["matched", "stale"]);
  assert.equal(report.complete, false);
  assert.ok(deps.calls.every(call => call.method === "GET"));
});

test("refreshes only stale tokens, enforces spacing and verifies actual GET metadata after queue acknowledgement", async () => {
  const queued = new Set();
  const deps = dependencies((url, init) => {
    if (init.method === "PATCH") { queued.add(url.replace("/refetch-metadata", "")); return Response.json({ message: "OK" }); }
    return Response.json({ metadata: queued.has(url) ? expected : stale });
  });
  const report = await checkTokens({ ...options, refresh: true }, deps);
  assert.equal(report.complete, true);
  assert.ok(report.results.every(item => item.status === "refreshed" && item.metadataMatches && item.imageMatches && item.attributesMatch));
  const writes = deps.calls.filter(call => call.method === "PATCH");
  assert.equal(writes.length, 2);
  assert.ok(writes[1].at - writes[0].at >= 5000);
  const matched = dependencies(() => Response.json({ metadata: expected }));
  assert.equal((await checkTokens({ ...options, refresh: true }, matched)).complete, true);
  assert.ok(matched.calls.every(call => call.method === "GET"));
});

test("queue OK is not success: stale data stops after bounded polling and does not refresh subsequent tokens", async () => {
  const deps = dependencies((_url, init) => Response.json(init.method === "PATCH" ? { message: "OK" } : { metadata: stale }));
  const report = await checkTokens({ ...options, refresh: true }, deps);
  assert.equal(report.complete, false);
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].refreshAcknowledged, true);
  assert.equal(report.results[0].error, "refresh_not_confirmed");
  assert.equal(deps.now(), 70000);
  assert.equal(deps.calls.filter(call => call.method === "PATCH").length, 1);
});

test("rate limits, authentication errors and HTML challenges stop immediately without retry or bypass headers", async () => {
  for (const [response, code] of [[new Response("limited", { status: 429 }), "rate_limited"],
    [new Response("challenge", { status: 403 }), "authentication_or_challenge_required"],
    [new Response("login", { status: 401 }), "authentication_or_challenge_required"],
    [new Response("<html>challenge</html>", { headers: { "Content-Type": "text/html" } }), "unexpected_response_or_challenge"]]) {
    const deps = dependencies((_url, init) => { assert.deepEqual(init.headers, { Accept: "application/json" }); return response; });
    const report = await checkTokens({ ...options, refresh: true }, deps);
    assert.equal(report.results.length, 1); assert.equal(report.results[0].error, code);
    assert.equal(deps.calls.length, 1); assert.equal(deps.calls[0].method, "GET");
  }
});

test("provider or fetch errors never expose a private RPC URL or nested response body", async () => {
  const deps = dependencies(() => { throw new Error("https://private.rpc/SECRET_TOKEN"); });
  const report = await checkTokens(options, deps);
  assert.equal(report.results[0].error, "request_failed");
  assert.equal(JSON.stringify(report).includes("SECRET_TOKEN"), false);
});

test("polling tolerates only transient GET failures and can verify a refresh after 20 seconds", async () => {
  let queued = false, attempts = 0;
  const deps = dependencies((_url, init) => {
    if (init.method === "PATCH") { queued = true; return Response.json({ message: "OK" }); }
    if (!queued) return Response.json({ metadata: stale });
    attempts++;
    if (attempts === 1) throw new Error("Temporary network timeout");
    if (attempts < 5) return new Response("Unavailable", { status: [502, 503, 504][attempts - 2] });
    return Response.json({ metadata: deps.now() >= 40000 ? expected : stale });
  });
  const report = await checkTokens({ ...options, to: 1, refresh: true }, deps);
  assert.equal(report.complete, true);
  assert.equal(report.results[0].status, "refreshed");
  assert.ok(deps.now() >= 40000 && deps.now() <= 70000);
  assert.equal(deps.calls.filter(call => call.method === "PATCH").length, 1);
});

test("polling stops immediately on rate limits, authentication or challenges, and never retries PATCH", async () => {
  for (const status of [429, 401, 403, 200]) {
    let queued = false;
    const deps = dependencies((_url, init) => {
      if (init.method === "PATCH") { queued = true; return Response.json({ message: "OK" }); }
      return queued ? new Response("<html>Stopped</html>", { status, headers: { "Content-Type": "text/html" } }) : Response.json({ metadata: stale });
    });
    const report = await checkTokens({ ...options, refresh: true }, deps);
    assert.equal(report.results[0].status, "failed");
    assert.equal(deps.calls.length, 3);
  }
  const rejected = dependencies((_url, init) => init.method === "PATCH" ? new Response("Unavailable", { status: 503 }) : Response.json({ metadata: stale }));
  assert.equal((await checkTokens({ ...options, refresh: true }, rejected)).results[0].error, "http_503");
  assert.equal(rejected.calls.length, 2);
  const unavailable = dependencies(() => new Response("Unavailable", { status: 503 }));
  assert.equal((await checkTokens({ ...options, refresh: true }, unavailable)).results[0].error, "http_503");
  assert.equal(unavailable.calls.length, 1);
});

test("repeated transient polling failures remain bounded by the same 60-second deadline", async () => {
  let queued = false;
  const deps = dependencies((_url, init) => {
    if (init.method === "PATCH") { queued = true; return Response.json({ message: "OK" }); }
    return queued ? new Response("Unavailable", { status: 504 }) : Response.json({ metadata: stale });
  });
  const report = await checkTokens({ ...options, refresh: true }, deps);
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].error, "refresh_not_confirmed");
  assert.equal(deps.now(), 70000);
  assert.equal(deps.calls.filter(call => call.method === "PATCH").length, 1);
});
