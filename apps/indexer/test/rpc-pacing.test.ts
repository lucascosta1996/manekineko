import test from 'node:test';
import assert from 'node:assert/strict';
import { RpcPacer } from '../lib/rpc-pacing.ts';
import { errorCode } from '../lib/types.ts';

test('concurrent factory batches share pacing counted by RPC methods', async () => {
  let now = 0;
  const pacer = new RpcPacer(() => now, async delay => { now += delay; });
  const times: number[] = [];
  await Promise.all([10,10,1,10].map(async count => { await pacer.acquire(count); times.push(now); }));
  assert.deepEqual(times, [0,750,1500,1575]);
  now = 10000;
  await pacer.acquire(10);
  await pacer.acquire(10);
  assert.equal(now,10750, 'Idle time must not allow accumulated bursts');
});
test('invalid batches cannot poison the pacing queue', async () => {
  const pacer = new RpcPacer(() => 0, async () => {});
  await assert.rejects(pacer.acquire(11), /invalid_rpc_batch_size/);
  await pacer.acquire(1);
});
test('provider throttling is classified without leaking request data', () => {
  assert.equal(errorCode({code:'CALL_EXCEPTION',info:{error:{code:-32007,message:'50/second request limit reached https://secret.invalid'}}}), 'rpc_rate_limited');
  assert.equal(errorCode({error:{code:429,message:'Too many requests'}}),'rpc_rate_limited');
  assert.equal(errorCode(new Error('https://secret.invalid')),'dependency_unavailable');
});
