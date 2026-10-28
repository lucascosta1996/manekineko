import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertAccountRevision, loadLaunchSocialAccount, fixedLaunchSocialAccountSource } from './social-account.ts';
const profile = { chainId: '11155111' as const, revision: 1, enabled: true, handle: 'fictional_test', expectedAccountId: '123', publicBaseUrl: 'https://tincta.xyz', credentialsConfigured: true, updatedAt: '2026-10-28T00:00:00Z' };
test('delivery stops when account settings change, disappear or posting is disabled', () => {
  assert.doesNotThrow(() => assertAccountRevision(profile, profile, true));
  for (const current of [null, { ...profile, revision: 2 }, { ...profile, expectedAccountId: '456' }, { ...profile, publicBaseUrl: 'https://app.tincta.xyz' }, { ...profile, enabled: false }]) assert.throws(() => assertAccountRevision(profile, current, true), /changed or posting is disabled/);
  assert.doesNotThrow(() => assertAccountRevision({ ...profile, enabled: false }, { ...profile, enabled: false }, false));
});
test('Launch credentials are explicit V16 Sepolia configuration, with no legacy fallback', async () => {
  const config = { version: 16 as const, chainId: 11155111, controller: '0x' + '11'.repeat(20), controllerCodeHash: '0x' + '22'.repeat(32), rpcUrl: 'https://rpc.invalid', appUrl: 'https://tincta.xyz', xAccountId: '123' };
  assert.equal(await loadLaunchSocialAccount(config, '--observe', {}), undefined);
  await assert.rejects(loadLaunchSocialAccount({ ...config, accountSource: 'launch' }, '--publish', {}), /dedicated V16/);
  await assert.rejects(loadLaunchSocialAccount({ ...config, chainId: 1, accountSource: 'launch' }, '--publish', { MANEKINEKO_CHAIN_ID: '1', DATABASE_URL: 'unused' }), /dedicated V16/);
});

test('watch retains its reviewed account and stops on changes between iterations', async () => {
  let loads = 0, changed = false;
  const config = { version: 16 as const, chainId: 11155111, controller: '0x' + '11'.repeat(20), controllerCodeHash: '0x' + '22'.repeat(32), rpcUrl: 'https://rpc.example', appUrl: 'https://tincta.xyz', xAccountId: '123' };
  const source = fixedLaunchSocialAccountSource(async () => { loads++; return { config, credentials: { apiKey: 'fictional', apiKeySecret: 'fictional', accessToken: 'fictional', accessTokenSecret: 'fictional' }, assertCurrent: async () => { if (changed) throw new Error('Profile changed'); } }; });
  const first = await source(config, '--publish'); assert.equal(await source(config, '--publish'), first); assert.equal(loads, 1);
  changed = true; await assert.rejects(source(config, '--publish'), /Profile changed/); assert.equal(loads, 1);
  await assert.rejects(source({ ...config, xAccountId: '456' }, '--publish'), /configuration changed/);
});
