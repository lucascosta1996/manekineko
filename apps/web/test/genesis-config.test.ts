import assert from 'node:assert/strict';
import test from 'node:test';
import { protocolConfig, validateProtocolConfig } from '../../../packages/protocol/src/config.ts';
const pins = { version: 14 as const, controller: '0x' + '11'.repeat(20), chainId: 11155111, codeHash: '0x' + '22'.repeat(32), holderRewardsCodeHash: '0x' + '33'.repeat(32), genesisCodeHash: '0x' + '44'.repeat(32), rpcUrl: 'https://public.invalid' };
test('V14 requires its own Genesis runtime hash as well as a holder pool pin', () => {
  assert.equal(validateProtocolConfig(pins).version, 14);
  assert.equal(validateProtocolConfig(pins).genesisCodeHash, pins.genesisCodeHash);
  assert.throws(() => validateProtocolConfig({ ...pins, genesisCodeHash: undefined }), /Genesis runtime pin/);
  assert.throws(() => validateProtocolConfig({ ...pins, holderRewardsCodeHash: undefined }), /holder rewards runtime pin/);
});
test('incomplete V14 pins cannot fall back to V13; Sepolia configuration does not configure Mainnet', () => {
  const keys = Object.keys(process.env).filter(k => /^NEXT_PUBLIC_V1[234]_/.test(k));
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  keys.forEach(k => delete process.env[k]);
  try {
    Object.assign(process.env, { NEXT_PUBLIC_V13_SEPOLIA_CONTROLLER: pins.controller, NEXT_PUBLIC_V13_SEPOLIA_CONTROLLER_CODE_HASH: pins.codeHash, NEXT_PUBLIC_V13_SEPOLIA_HOLDER_REWARDS_CODE_HASH: pins.holderRewardsCodeHash, NEXT_PUBLIC_V13_SEPOLIA_RPC_URL: pins.rpcUrl });
    assert.equal(protocolConfig(11155111)?.version, 13);
    process.env.NEXT_PUBLIC_V14_SEPOLIA_GENESIS_CODE_HASH = pins.genesisCodeHash;
    assert.throws(() => protocolConfig(11155111), /holder rewards runtime pin/);
    Object.assign(process.env, { NEXT_PUBLIC_V14_SEPOLIA_CONTROLLER: pins.controller, NEXT_PUBLIC_V14_SEPOLIA_CONTROLLER_CODE_HASH: pins.codeHash, NEXT_PUBLIC_V14_SEPOLIA_HOLDER_REWARDS_CODE_HASH: pins.holderRewardsCodeHash, NEXT_PUBLIC_V14_SEPOLIA_RPC_URL: pins.rpcUrl });
    assert.equal(protocolConfig(11155111)?.version, 14);
    assert.equal(protocolConfig(1), null);
  } finally {
    Object.keys(process.env).filter(k => /^NEXT_PUBLIC_V1[234]_/.test(k)).forEach(k => delete process.env[k]);
    Object.assign(process.env, saved);
  }
});
