import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertLaunchOrigin, boundedLaunchJson, hashLaunchPassword, launchAuthResponse,
  launchCookieName, launchCookieOptions, launchNetworkSubject, launchPublicOrigin,
  launchRateDigest, launchSessionDigest, newLaunchSessionToken, normalizedLaunchUsername,
  validateNewLaunchPassword, verifyLaunchPassword,
} from "../lib/launch-auth-policy.ts";

const development = { NODE_ENV: "development", LAUNCH_PUBLIC_ORIGIN: "http://localhost:3200" };
const production = { NODE_ENV: "production", LAUNCH_PUBLIC_ORIGIN: "https://launch.example.com", LAUNCH_RATE_LIMIT_SECRET: "a".repeat(32) };
function request(origin: string, source = origin, extra: Record<string, string> = {}) {
  return new Request(`${source}/api/launch/configurations`, { method: "POST", headers: { origin, "content-type": "application/json", ...extra }, body: "{}" });
}

test("passwords use independent random salts and strong scrypt; incorrect, absent and malformed hashes fail", async () => {
  const password = "Long correct horse battery staple 🔒";
  const first = await hashLaunchPassword(password);
  const second = await hashLaunchPassword(password);
  assert.match(first, /^scrypt\$131072\$8\$1\$/);
  assert.notEqual(first, second);
  assert.equal(await verifyLaunchPassword(password, first), true);
  assert.equal(await verifyLaunchPassword("incorrect password", first), false);
  assert.equal(await verifyLaunchPassword(password, null), false);
  assert.equal(await verifyLaunchPassword(password, "malformed"), false);
});

test("password and account provisioning reject unbounded input without trimming passwords", () => {
  assert.throws(() => validateNewLaunchPassword("short"));
  assert.throws(() => validateNewLaunchPassword("x".repeat(129)));
  assert.doesNotThrow(() => validateNewLaunchPassword(" spaced password is preserved "));
  assert.equal(normalizedLaunchUsername(" Operator "), "operator");
  assert.throws(() => normalizedLaunchUsername("x OR 1=1"));
});

test("only exact configured origins are accepted, with no forwarded-host fallback", () => {
  assert.doesNotThrow(() => assertLaunchOrigin(request("http://localhost:3200"), development));
  assert.doesNotThrow(() => assertLaunchOrigin(request("https://launch.example.com"), production));
  assert.throws(() => assertLaunchOrigin(request("https://evil.example", "https://launch.example.com"), production));
  assert.throws(() => assertLaunchOrigin(request("https://launch.example.com", "https://evil.example", { "x-forwarded-host": "launch.example.com" }), production));
  assert.throws(() => assertLaunchOrigin(request("https://launch.example.com", undefined, { "sec-fetch-site": "cross-site" }), production));
  assert.throws(() => launchPublicOrigin({ NODE_ENV: "production" }));
  assert.throws(() => launchPublicOrigin({ NODE_ENV: "production", LAUNCH_PUBLIC_ORIGIN: "http://localhost:3200" }));
  assert.throws(() => launchPublicOrigin({ ...production, LAUNCH_PUBLIC_ORIGIN: "https://launch.example.com/path" }));
});

test("session tokens have 256 bits of randomness and only digests are stored", () => {
  const first = newLaunchSessionToken(), second = newLaunchSessionToken();
  assert.equal(first.length, 43);
  assert.notEqual(first, second);
  assert.match(launchSessionDigest(first)!, /^[a-f0-9]{64}$/);
  assert.notEqual(launchSessionDigest(first), first);
  assert.equal(launchSessionDigest("not-a-session"), null);
  assert.equal(launchCookieName(production), "__Host-manekineko-launch");
  assert.deepEqual(launchCookieOptions(production), { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 28_800 });
});

test("login throttling trusts only the configured hosting platform and hashes network identifiers", () => {
  assert.equal(launchNetworkSubject(request("https://launch.example.com", undefined, { "x-forwarded-for": "192.0.2.2", "x-vercel-forwarded-for": "192.0.2.3" }), production), "unverified-network");
  assert.equal(launchNetworkSubject(request("https://launch.example.com", undefined, { "x-vercel-forwarded-for": "192.0.2.3" }), { ...production, VERCEL: "1" }), "192.0.2.3");
  assert.equal(launchNetworkSubject(request("https://launch.example.com", undefined, { "x-vercel-forwarded-for": "192.0.2.3, 192.0.2.4" }), { ...production, VERCEL: "1" }), "unverified-network");
  assert.equal(launchNetworkSubject(request("https://launch.example.com", undefined, { "x-vercel-forwarded-for": "2001:0db8:0:0:0:0:0:1" }), { ...production, VERCEL: "1" }), "2001:db8::1");
  assert.notEqual(launchRateDigest("192.0.2.3", production), launchRateDigest("192.0.2.4", production));
  assert.throws(() => launchRateDigest("anything", { NODE_ENV: "production" }));
});

test("JSON parsing bounds streamed bodies and requires an object and JSON content type", async () => {
  await assert.rejects(() => boundedLaunchJson(new Request("http://localhost", { method: "POST", body: "{}" })), /JSON request/);
  for (const body of ["[]", "null", "broken"]) {
    await assert.rejects(() => boundedLaunchJson(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body })), /JSON object/);
  }
  await assert.rejects(() => boundedLaunchJson(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "x".repeat(2_049) }) }), 2_048), /too large/);
  assert.deepEqual(await boundedLaunchJson(request("http://localhost:3200")), {});
});

test("unexpected failures return a sanitized no-store response", async () => {
  const response = launchAuthResponse(new Error("sensitive internal database details"));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.doesNotMatch(await response.text(), /sensitive internal/);
});
