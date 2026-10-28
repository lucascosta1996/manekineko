import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifySocialAccountInput } from '../lib/social-account-service.ts';
const credentials = { apiKey: 'fictional-key', apiKeySecret: 'fictional-secret', accessToken: 'fictional-token', accessTokenSecret: 'fictional-token-secret' };
const input = { revision: 0, enabled: false, handle: '@tincta_test', expectedAccountId: '123', publicBaseUrl: 'https://tincta.xyz', credentials };
const profile = { chainId: '11155111' as const, revision: 1, enabled: false, handle: 'tincta_test', expectedAccountId: '123', publicBaseUrl: 'https://tincta.xyz', credentialsConfigured: true, updatedAt: '2026-10-28T00:00:00Z' };
test('new credentials are verified against the numeric ID and returned handle before saving', async () => {
  let calls = 0;
  const result = await verifySocialAccountInput(input, { saved: async () => { throw new Error('unexpected saved read'); }, verify: async (actual, id) => { calls++; assert.deepEqual(actual, credentials); assert.equal(id, '123'); return { id, username: 'Tincta_Test' }; } });
  assert.equal(calls, 1); assert.equal(result.handle, 'Tincta_Test'); assert.equal(result.enabled, false);
});
test('blank credentials retain the saved account, but cannot silently change its identity', async () => {
  const { credentials: omitted, ...blank } = input; let verified = 0;
  const dependencies = { saved: async () => ({ profile, credentials }), verify: async () => { verified++; return { id: '123', username: 'tincta_test' }; } };
  await verifySocialAccountInput(blank, dependencies); assert.equal(verified, 1);
  await assert.rejects(verifySocialAccountInput({ ...blank, expectedAccountId: '456' }, dependencies), /requires all four/); assert.equal(verified, 1);
});
test('mismatched handles, wrong accounts and incomplete secrets are rejected', async () => {
  const saved = async () => ({ profile, credentials });
  for (const account of [{ id: '456', username: 'tincta_test' }, { id: '123', username: 'another_account' }]) await assert.rejects(verifySocialAccountInput(input, { saved, verify: async () => account }), /same X account/);
  await assert.rejects(verifySocialAccountInput({ ...input, credentials: { apiKey: 'fictional' } }, { saved, verify: async () => { throw new Error('must not call X'); } }), /all four/);
});
