import test from 'node:test';
import assert from 'node:assert/strict';
import { Interface, type Provider } from 'ethers';
import { refundTransaction, validRefundNumber } from '../../../packages/protocol/src/refunds.ts';
import { collectionTiming } from '../../../packages/protocol/src/timing.ts';
import { v16Abi } from '../../../packages/protocol/src/v16.ts';
import type { Snapshot } from '../../../packages/protocol/src/chain.ts';
const address = '0x1111111111111111111111111111111111111111', holder = '0x2222222222222222222222222222222222222222';
const config = { version: 17 as const, chainId: 11155111 as const, controller: address, codeHash: '0x' + '1'.repeat(64), rpcUrl: 'https://fixture.invalid' };
const state = (minted: bigint) => ({ protocolVersion: 17, block: 123, round: { address, id: 1, name: 'Aster Atlas', phase: 7, minted, soldOutAt: 0n } }) as Snapshot;
const iface = new Interface(v16Abi);
function provider(owner = holder, failure?: Error) {
  return { call: async () => { if (failure) throw failure; return iface.encodeFunctionResult('ownerOf', [owner]); } } as unknown as Provider;
}
test('zero-mint collection has no refund action and needs no owner RPC', async () => {
  await assert.rejects(refundTransaction(null as unknown as Provider, config, state(0n), 1n, holder), /No paid NFTs were minted/);
  const timing = collectionTiming(state(0n).round!, 0);
  assert.equal(timing.label, 'Minting ended');
  assert.equal(timing.value, 'No tickets minted');
});
test('serials outside the minted range cannot reach ownership or signing', async () => {
  for (const value of ['', '0', '-1', '1.2', '2', '131073']) assert.equal(validRefundNumber(value, 1n), false);
  assert.equal(validRefundNumber('1', 1n), true);
  await assert.rejects(refundTransaction(null as unknown as Provider, config, state(1n), 2n, holder), /never minted in Aster Atlas/);
});
test('a paid ticket refund binds the collection-scoped serial and current holder', async () => {
  const request = await refundTransaction(provider(), config, state(1n), 1n, holder);
  const call = iface.parseTransaction({ data: request.data! })!;
  assert.equal(call.name, 'refund');
  assert.equal(call.args[0], 131073n);
  assert.equal(call.args[1], holder);
  await assert.rejects(refundTransaction(provider(address), config, state(1n), 1n, holder), /wallet that currently holds this paid NFT/);
});
test('burned NFTs are distinct from unavailable ownership verification', async () => {
  const missing = Object.assign(new Error('execution reverted'), { code: 'CALL_EXCEPTION', data: iface.encodeErrorResult('ERC721NonexistentToken', [131073n]) });
  await assert.rejects(refundTransaction(provider(holder, missing), config, state(1n), 1n, holder), /may already have been refunded/);
  await assert.rejects(refundTransaction(provider(holder, new Error('RPC unavailable')), config, state(1n), 1n, holder), /RPC unavailable/);
  const undecodable = Object.assign(new Error('unknown revert'), { code: 'CALL_EXCEPTION', data: '0x' });
  await assert.rejects(refundTransaction(provider(holder, undecodable), config, state(1n), 1n, holder), e => (e as { code: string; data: string }).code === 'CALL_EXCEPTION' && (e as { data: string }).data === '0x');
});
