import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyVrfSettings, type DeploymentExpectation } from './verify-deployment.mts';

test('deployment verification checks network VRF policy even before a first round exists', () => {
  const settings = {
    coordinator: '0xD7f86b4b8Cae7D942340FF628F82735b7a20893a',
    keyHash: '0x8077df514608a09f83e4e8d300645594e5d7234665448ba83f51a50f842bd3d9',
    confirmations: 64, callbackGas: 200000,
  } as DeploymentExpectation['settings'];
  assert.doesNotThrow(() => verifyVrfSettings(1, settings));
  assert.throws(() => verifyVrfSettings(11155111, settings), /coordinator or lane/);
  assert.throws(() => verifyVrfSettings(1, { ...settings, keyHash: '0x' + '00'.repeat(32) }), /coordinator or lane/);
  assert.throws(() => verifyVrfSettings(1, { ...settings, confirmations: 1 }), /confirmation or callback/);
  assert.throws(() => verifyVrfSettings(1, { ...settings, callbackGas: 99999 }), /confirmation or callback/);
  assert.throws(() => verifyVrfSettings(8453, settings), /Unsupported/);
});
