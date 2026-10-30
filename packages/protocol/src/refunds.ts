import { Contract, getAddress, type Provider } from 'ethers';
import { roundAbi, type Snapshot } from './chain.ts';
import type { ProtocolConfig } from './config.ts';
import { v16Abi, v16RoundTransaction, v16Token } from './v16.ts';

export function validRefundNumber(value: string, minted: bigint) {
  return /^[1-9][0-9]*$/.test(value) && BigInt(value) <= minted;
}

/** Recheck the selected collection and current holder before either wallet review. */
export async function refundTransaction(provider: Provider, config: ProtocolConfig, state: Snapshot, serial: bigint, recipient: string) {
  const r = state.round;
  if (!r || r.phase !== 7) throw new Error('Refunds are not available for this collection.');
  if (r.minted === 0n) throw new Error('No paid NFTs were minted in this collection. There are no mint payments to refund.');
  if (serial < 1n || serial > r.minted) throw new Error(`NFT #${serial} was never minted in ${r.name}. Choose a paid NFT from this collection.`);
  const single = config.version === 16 || config.version === 17 || config.version === 18;
  const c = new Contract(r.address, single ? v16Abi : roundAbi, provider);
  let holder: string;
  try {
    holder = getAddress(await c.ownerOf(single ? v16Token(r.id, serial) : serial, { blockTag: state.block }));
  } catch (error) {
    let missing = false;
    const data = (error as { data?: unknown } | null)?.data;
    if (typeof data === 'string') {
      try { missing = c.interface.parseError(data)?.name === 'ERC721NonexistentToken'; } catch { /* Preserve an undecodable RPC error. */ }
    }
    if (missing) throw new Error('This ticket no longer exists. It may already have been refunded.');
    throw error;
  }
  if (holder !== getAddress(recipient)) throw new Error('Connect the wallet that currently holds this paid NFT to claim its refund.');
  return single ? v16RoundTransaction(state, 'refund', [serial, recipient]) : c.refund.populateTransaction(serial, recipient);
}
