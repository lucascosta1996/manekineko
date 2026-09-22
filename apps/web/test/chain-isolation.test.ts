import assert from "node:assert/strict";
import test from "node:test";
import { chainEnabled, configuredChainId } from "../lib/chain-policy.ts";

test("Sepolia staging excludes Mainnet and unrelated collection networks", () => {
  const env = { MANEKINEKO_CHAIN_ID: "11155111" };
  assert.equal(configuredChainId(env), 11155111);
  assert.equal(chainEnabled(11155111, env), true);
  for (const chain of [1, 31337, 0, Number.NaN]) assert.equal(chainEnabled(chain, env), false);
  assert.equal(chainEnabled(1, {}), true);
  assert.equal(chainEnabled(11155111, {}), true);
});

test("malformed network restrictions fail closed instead of enabling a multi-chain catalog", () => {
  for (const value of ["sepolia", "31337", "11155111 ", "011155111"]) {
    assert.throws(() => chainEnabled(1, { MANEKINEKO_CHAIN_ID: value }), /restriction is invalid/);
    assert.throws(() => chainEnabled(11155111, { MANEKINEKO_CHAIN_ID: value }), /restriction is invalid/);
  }
});
