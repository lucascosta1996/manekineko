import test from 'node:test';
import assert from 'node:assert/strict';
import { retryableExecutorError, executionAffordable } from './executor.mts';
test('watch retries only classified transport failures, never security, nonce, journal or revert errors', () => {
  for (const code of ['NETWORK_ERROR', 'SERVER_ERROR', 'TIMEOUT']) assert.equal(retryableExecutorError({ code }), true);
  for (const error of [new Error('Controller pin mismatch'), new Error('Executor journal mismatch'), { code: 'CALL_EXCEPTION' }, { code: 'NONCE_EXPIRED' }, { code: 'UNKNOWN_ERROR' }])
    assert.equal(retryableExecutorError(error), false);
});

test('executor costs cannot exceed the remaining budget or assume an unearned reward', () => {
  assert.equal(executionAffordable(100n, 2n, 0n, 200n), true);
  assert.equal(executionAffordable(100n, 2n, 1n, 200n), false);
  assert.equal(executionAffordable(100n, 2n, 0n, 0n), false);
  assert.equal(executionAffordable(100n, 2n, 201n, 200n), false);
  assert.equal(executionAffordable(100n, 2n, -1n, 200n), false);
  assert.equal(executionAffordable(0n, 2n, 0n, 200n), false);
});
