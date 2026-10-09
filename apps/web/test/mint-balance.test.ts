import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEther } from 'ethers';
import { checkMintBalance } from '../lib/affiliates/mint-balance.ts';
import { walletError } from '../lib/affiliates/wallet.ts';

test('mint explains missing payment funds and the exact-payment gas shortfall', () => {
  for (const balance of ['0', '0.009', '0.01']) {
    assert.throws(() => checkMintBalance(parseEther(balance), parseEther('0.01'), 11155111), /Insufficient Sepolia ETH.*0.01 Sepolia ETH plus a network fee.*No transaction was submitted/);
  }
  assert.doesNotThrow(() => checkMintBalance(parseEther('0.02'), parseEther('0.01'), 11155111));
});
test('RPC gas balance failures stay actionable when ethers wraps them', () => {
  assert.match(walletError({code:'CALL_EXCEPTION',info:{error:{message:'insufficient funds for gas * price + value'}}}), /Insufficient ETH/);
  assert.match(walletError({code:'UNKNOWN_ERROR',error:{message:'insufficient balance'}}), /Insufficient ETH/);
  assert.match(walletError({code:'CALL_EXCEPTION',message:'execution reverted'}), /contract could not confirm/);
});
