import { Contract, getAddress, keccak256, type Provider } from 'ethers';
import controllerAbi from '@manekineko/contract-abi/season-controller-v14' with { type: 'json' };
import genesisAbi from '@manekineko/contract-abi/genesis-v14' with { type: 'json' };
import votingAbi from '@manekineko/contract-abi/voting-v14' with { type: 'json' };
import type { ProtocolConfig } from './config.ts';
import type { Snapshot } from './chain.ts';
import {v16Abi} from './v16.ts';

export type GenesisState = {
  version?:16|17; primaryMints?:bigint|null; maxMints?:bigint; soldOutAt?:bigint;
  address: string; start: bigint; end: bigint; minted: bigint; supply: bigint;
  open: boolean; walletMinted: boolean | null;
};
export async function readGenesis(provider: Provider, config: ProtocolConfig, block: number, timestamp: number, voting: string, wallet?: string): Promise<GenesisState> {
  if (config.version !== 14 || !config.genesisCodeHash) throw new Error('Genesis is not configured.');
  const at = { blockTag: block };
  const c = new Contract(config.controller, controllerAbi, provider);
  const address = getAddress(await c.genesis(at));
  const code = await provider.getCode(address, block);
  if (code === '0x' || keccak256(code).toLowerCase() !== config.genesisCodeHash.toLowerCase()) throw new Error('The free mint contract could not be verified. Signing is disabled.');
  const g = new Contract(address, genesisAbi, provider);
  const [boundController, boundVoting, version, supply, duration, start, end, minted, open, source, walletMinted] = await Promise.all([
    g.controller(at), g.voting(at), g.CONTRACT_VERSION(at), g.MAX_SUPPLY(at), g.MINT_DURATION(at), g.startsAt(at), g.endsAt(at), g.totalMinted(at), g.mintOpen(at),
    new Contract(voting, votingAbi, provider).genesis(at), wallet ? g.hasMinted(wallet, at) : Promise.resolve(null),
  ]);
  if (getAddress(boundController) !== getAddress(config.controller) || getAddress(boundVoting) !== getAddress(voting) || getAddress(source) !== address || version !== 'genesis-v14' || supply !== 1000n || duration !== 86400n || minted > supply || (start === 0n ? end !== 0n || minted !== 0n : end !== start + duration) || open !== (start !== 0n && BigInt(timestamp) >= start && BigInt(timestamp) < end && minted < supply)) throw new Error('Free mint policy verification failed.');
  return { address, start, end, minted, supply, open, walletMinted };
}

/** Called against a fresh snapshot before review and again before the wallet prompt. */
export async function genesisMintTransaction(state: Snapshot) {
  const g = state.genesis;
  if((g?.version===16||g?.version===17)){
    if(!state.sealed||!g.open||g.primaryMints===null||g.primaryMints===undefined||g.primaryMints>=2n)throw new Error('This wallet cannot mint another Genesis NFT.');
    return {...await new Contract(g.address,v16Abi).mintGenesis.populateTransaction(),value:0n};
  }
  if (!g || state.count !== 0 || !state.sealed || !g.open) throw new Error('The free mint is closed.');
  if (g.walletMinted === null) throw new Error('Connect a wallet to check its free mint.');
  if (g.walletMinted) throw new Error('This wallet has already minted its free NFT.');
  return { ...await new Contract(g.address, genesisAbi).mint.populateTransaction(), value: 0n };
}
