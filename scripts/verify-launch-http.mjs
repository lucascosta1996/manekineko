import assert from "node:assert/strict";

const origin = process.env.LAUNCH_PUBLIC_ORIGIN ?? "http://localhost:3200";
const url = new URL(origin);
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("HTTP regression checks are restricted to the local launch app.");
if (!process.env.LAUNCH_USERNAME || !process.env.LAUNCH_PASSWORD) throw new Error("Load an existing local account credential file without printing its contents.");
let cookie = "";
let checks = 0;
async function pass(label, check) { await check(); checks++; console.log(`PASS ${label}`); }
async function request(path, { method = "GET", body, authenticated = false, requestOrigin = origin } = {}) {
  return fetch(`${origin}/api/launch${path}`, {
    method, signal: AbortSignal.timeout(15_000),
    headers: { Origin: requestOrigin, "Content-Type": "application/json", ...(authenticated ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
try {
  const unknown = "11111111-1111-4111-8111-111111111111";
  await pass("configuration and automation routes require a live session", async () => {
    for (const [path, method, body] of [
      ["/configurations", "GET"], ["/configurations", "POST", {}],
      [`/configurations/${unknown}`, "GET"], [`/configurations/${unknown}`, "PUT", {}],
      [`/configurations/${unknown}/finalize`, "POST", { revision: 1 }], [`/configurations/${unknown}/export`, "GET"],
      ["/automations", "GET"], ["/automations", "POST", {}],
      [`/automations/${unknown}`, "GET"], [`/automations/${unknown}`, "PUT", {}],
      [`/automations/${unknown}/validate`, "POST", { revision: 1 }],
      [`/automations/${unknown}/prepare`, "POST", { revision: 1 }], [`/automations/${unknown}/export`, "GET"],
    ]) {
      const response = await request(path, { method, body });
      assert.equal(response.status, 401, `${method} ${path}`);
      assert.match(response.headers.get("cache-control"), /no-store/);
    }
  });
  await pass("the automation page redirects anonymous visitors back through login", async () => {
    const response = await fetch(`${origin}/automations`, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
    assert.ok([303, 307].includes(response.status));
    const destination = new URL(response.headers.get("location"), origin);
    assert.equal(destination.pathname, "/seasons");
    const protectedPage = await fetch(destination, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
    assert.ok([303, 307].includes(protectedPage.status));
    assert.equal(new URL(protectedPage.headers.get("location"), origin).pathname, "/login");
    assert.equal(new URL(protectedPage.headers.get("location"), origin).searchParams.get("next"), "/seasons");
  });
  await pass("cross-origin login is rejected before credentials are checked", async () => {
    const response = await request("/auth/login", { method: "POST", body: {}, requestOrigin: "https://untrusted.example" });
    assert.equal(response.status, 403); assert.equal(response.headers.get("set-cookie"), null);
  });
  await pass("real password login issues an opaque HttpOnly SameSite session", async () => {
    const response = await request("/auth/login", { method: "POST", body: { username: process.env.LAUNCH_USERNAME, password: process.env.LAUNCH_PASSWORD } });
    assert.equal(response.status, 200);
    const header = response.headers.get("set-cookie");
    assert.match(header, /HttpOnly/i); assert.match(header, /SameSite=Strict/i);
    assert.ok(!header.includes(process.env.LAUNCH_PASSWORD));
    cookie = header.split(";")[0];
    assert.match(response.headers.get("cache-control"), /no-store/);
  });
  await pass("authenticated database reads succeed and writes reject a foreign origin", async () => {
    const read = await request("/configurations", { authenticated: true });
    assert.equal(read.status, 200); assert.ok(Array.isArray((await read.json()).configurations));
    const write = await request("/configurations", { method: "POST", authenticated: true, requestOrigin: "https://untrusted.example", body: {} });
    assert.equal(write.status, 403);
    const automations = await request("/automations", { authenticated: true });
    assert.equal(automations.status, 200);
    const list = await automations.json();
    assert.ok(Array.isArray(list.automations));
    assert.ok(list.automations.every(item => !("plan" in item)), "Plan lists return bounded summaries, not every nested payload.");
    assert.equal((await request("/automations", { method: "POST", authenticated: true, requestOrigin: "https://untrusted.example", body: {} })).status, 403);
    assert.equal((await request("/automations", { method: "POST", authenticated: true, body: { plan: {}, enabled: true } })).status, 400);
  });
  await pass("logout revokes the server-side session even if the old cookie is reused", async () => {
    const response = await request("/auth/logout", { method: "POST", authenticated: true, body: {} });
    assert.equal(response.status, 200);
    assert.equal((await request("/configurations", { authenticated: true })).status, 401);
    cookie = "";
  });
  console.log(`${checks} HTTP checks passed. No launch configurations changed.`);
} finally {
  if (cookie) await request("/auth/logout", { method: "POST", authenticated: true, body: {} }).catch(() => {});
}
