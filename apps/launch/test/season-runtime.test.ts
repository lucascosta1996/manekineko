import assert from "node:assert/strict";
import test from "node:test";
import { encryptRuntimeSecret, decryptRuntimeSecret, runtimeEncryptionConfigured } from "../lib/season-runtime-crypto.ts";
import { assertRuntimeArtifact, runtimeProfileInput } from "../lib/season-runtime.ts";
import { seasonRuntimePreviews } from "../lib/season-runtime-preview.ts";
import { runtimeArtifact, runtimePlan } from "./season-runtime.fixture.ts";

const env = { SEASON_RUNNER_MASTER_KEY: Buffer.alloc(32, 7).toString("base64") };
test("runtime secrets use authenticated encryption bound to the network and account", () => {
  const value = "fictional-test-key", context = "x-profile:11155111:123";
  const first = encryptRuntimeSecret(value, context, env), second = encryptRuntimeSecret(value, context, env);
  assert.notEqual(first, second); assert(!first.includes(value));
  assert.equal(decryptRuntimeSecret(first, context, env), value);
  assert.throws(() => decryptRuntimeSecret(first, "x-profile:1:123", env), /could not be authenticated/);
  assert.throws(() => decryptRuntimeSecret(first, context, { SEASON_RUNNER_MASTER_KEY: Buffer.alloc(32, 8).toString("base64") }), /could not be authenticated/);
  const parts = first.split("."); parts[3] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => decryptRuntimeSecret(parts.join("."), context, env), /could not be authenticated/);
  assert.equal(runtimeEncryptionConfigured({}), false);
  assert.equal(runtimeEncryptionConfigured(env), true);
});
test("X account changes require valid IDs, HTTPS origin and complete replacement credentials", () => {
  const value = { revision: 0, enabled: true, handle: "@tincta_test", expectedAccountId: "123", publicBaseUrl: "https://tincta.xyz" };
  assert.equal(runtimeProfileInput(value).credentials, null);
  assert.equal(runtimeProfileInput(value).handle, "tincta_test");
  assert.throws(() => runtimeProfileInput({ ...value, credentials: { apiKey: "x" } }), /all four/);
  assert.throws(() => runtimeProfileInput({ ...value, publicBaseUrl: "https://user:secret@tincta.xyz" }), /HTTPS origin/);
  assert.throws(() => runtimeProfileInput({ ...value, publicBaseUrl: "http://tincta.xyz" }), /HTTPS origin/);
  for (const publicBaseUrl of ["https://127.0.0.1", "https://localhost", "https://preview.example.com"]) assert.throws(() => runtimeProfileInput({ ...value, publicBaseUrl }), /public HTTPS website/);
  assert.throws(() => runtimeProfileInput({ ...value, expectedAccountId: "@tincta" }), /numeric/);
});
test("execution rejects historical contracts, disabled social and stale first openings", () => {
  assert.doesNotThrow(() => assertRuntimeArtifact(runtimeArtifact(), new Date("2030-01-01")));
  const v8 = runtimeArtifact(); delete v8.steps[0].payload.contract.maxMintsPerWallet;
  assert.throws(() => assertRuntimeArtifact(v8), /prepared V9/);
  const disabled = runtimeArtifact(); disabled.social!.enabled = false;
  assert.throws(() => assertRuntimeArtifact(disabled), /Enable X/);
  assert.throws(() => assertRuntimeArtifact(runtimeArtifact(), new Date("2036-01-01")), /already past/);
});
test("saved season provides all eight event types and distinct collection previews", () => {
  const plan = runtimePlan(), previews = seasonRuntimePreviews(plan);
  assert.equal(previews.length, 14);
  assert.equal(new Set(previews.map(item => item.message.event)).size, 8);
  assert.equal(new Set(previews.map(item => item.key)).size, 14);
  assert(previews.every(item => item.message.post.startsWith("[Sepolia test]")));
  assert(previews.every(item => item.imageUrl.includes("revision=2")));
  const incomplete = runtimePlan(); incomplete.plan.steps[0].payload.contract.winnerCount = "0";
  assert.doesNotThrow(() => seasonRuntimePreviews(incomplete));
});
