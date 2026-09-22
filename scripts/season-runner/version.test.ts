import { test } from "node:test";
import assert from "node:assert/strict";
import { seasonVersionPolicy, supportedHistoricalSource } from "./version.ts";
import { registryPins } from "./config.ts";

test("V10 worker requires its exact registry generations and never borrows V9 pins", () => {
  const p = seasonVersionPolicy("affiliate-v10");
  assert.equal(p.componentVersion, "V10"); assert.equal(p.algorithmVersion, "unique-rank-v6");
  assert.equal(p.eligibilityVersion, "affiliate-eligibility-v5"); assert.equal(p.creditsVersion, "winner-credits-v6");
  assert.equal(seasonVersionPolicy().contractVersion, "affiliate-v9");
  assert.throws(() => seasonVersionPolicy("affiliate-v8"), /unsupported/);
  const pin = (prefix: string, digit: string) => ({ [`${prefix}_ADDRESS_11155111`]: `0x${digit.repeat(40)}`, [`${prefix}_CODEHASH_11155111`]: `0x${digit.repeat(64)}` });
  const old = { ...pin("AFFILIATE_ELIGIBILITY_V4", "1"), ...pin("WINNER_CREDITS_V5", "2") };
  assert.throws(() => registryPins(11155111, old, "affiliate-v10"), /v10_registry/);
  const env = { ...old, ...pin("AFFILIATE_ELIGIBILITY_V5", "3"), ...pin("WINNER_CREDITS_V6", "4") };
  assert.equal(registryPins(11155111, env, "affiliate-v10").credits.address, `0x${"4".repeat(40)}`);
  assert.equal(registryPins(11155111, env).credits.address, `0x${"2".repeat(40)}`);
});
test("historical source imports use original version/algorithm pairs and cannot masquerade as V10", () => {
  for (const [version,algorithm] of [["affiliate-v6","unique-rank-v3"],["affiliate-v7","unique-rank-v4"],["affiliate-v8","unique-rank-v5"],["affiliate-v9","unique-rank-v5"]]) {
    assert(supportedHistoricalSource("affiliate-v10",version,algorithm));
    assert(!supportedHistoricalSource("affiliate-v10",version,"unique-rank-v6"));
  }
  assert(!supportedHistoricalSource("affiliate-v10","affiliate-v10","unique-rank-v6"));
  assert(!supportedHistoricalSource("affiliate-v9","affiliate-v9","unique-rank-v5"));
});
