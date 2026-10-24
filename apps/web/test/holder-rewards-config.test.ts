import assert from "node:assert/strict";
import test from "node:test";
import {
  protocolConfig,
  validateProtocolConfig,
} from "../../../packages/protocol/src/config.ts";
const pins = {
  controller: "0x" + "11".repeat(20),
  chainId: 11155111,
  codeHash: "0x" + "22".repeat(32),
  rpcUrl: "https://public.invalid",
};
test("V13 needs a separate holder pool pin; V12 remains backward compatible", () => {
  assert.equal(validateProtocolConfig(pins).holderRewardsCodeHash, undefined);
  assert.throws(
    () => validateProtocolConfig({ ...pins, version: 13 }),
    /holder rewards runtime pin/
  );
  assert.throws(
    () =>
      validateProtocolConfig({
        ...pins,
        version: 13,
        holderRewardsCodeHash: "0x",
      }),
    /holder rewards runtime pin/
  );
  const valid = validateProtocolConfig({
    ...pins,
    version: 13,
    holderRewardsCodeHash: pins.codeHash,
  });
  assert.equal(valid.version, 13);
  assert.equal(valid.holderRewardsCodeHash, pins.codeHash);
  assert.throws(
    () =>
      validateProtocolConfig({
        ...valid,
        rpcUrl: "https://user:secret@public.invalid",
      }),
    /public HTTPS/
  );
});
test("partial V13 configuration cannot silently fall back to a V12 deployment", () => {
  const keys = Object.keys(process.env).filter(
    (k) => k.startsWith("NEXT_PUBLIC_V12_") || k.startsWith("NEXT_PUBLIC_V13_")
  );
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  keys.forEach((k) => delete process.env[k]);
  try {
    Object.assign(process.env, {
      NEXT_PUBLIC_V12_CONTROLLER: pins.controller,
      NEXT_PUBLIC_V12_CHAIN_ID: "11155111",
      NEXT_PUBLIC_V12_CONTROLLER_CODE_HASH: pins.codeHash,
      NEXT_PUBLIC_V12_RPC_URL: pins.rpcUrl,
    });
    assert.equal(protocolConfig()?.version, undefined);
    process.env.NEXT_PUBLIC_V13_HOLDER_REWARDS_CODE_HASH = pins.codeHash;
    assert.throws(() => protocolConfig(), /V13 deployment pins/);
    Object.assign(process.env, {
      NEXT_PUBLIC_V13_CONTROLLER: pins.controller,
      NEXT_PUBLIC_V13_CHAIN_ID: "11155111",
      NEXT_PUBLIC_V13_CONTROLLER_CODE_HASH: pins.codeHash,
      NEXT_PUBLIC_V13_RPC_URL: pins.rpcUrl,
    });
    assert.equal(protocolConfig()?.version, 13);
    assert.equal(protocolConfig(1), null);
  } finally {
    Object.keys(process.env)
      .filter(
        (k) =>
          k.startsWith("NEXT_PUBLIC_V12_") || k.startsWith("NEXT_PUBLIC_V13_")
      )
      .forEach((k) => delete process.env[k]);
    Object.assign(process.env, saved);
  }
});
