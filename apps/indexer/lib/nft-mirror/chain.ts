import { Contract, Interface, ZeroAddress, ZeroHash, getAddress, keccak256, type JsonRpcProvider, type Log } from 'ethers';
import { decodeGenesisMetadata, decodeOnChainMetadata } from '@manekineko/contract-abi/onchain-metadata';
import { derivePermanentCombinationKey, encodePermanentCombination } from '@manekineko/contract-abi/permanent-combinations';
import { normalizeSeasonAppearance } from '@manekineko/contract-abi/season-appearance';
import { ensure } from '../types.ts';
import type { MirrorConfig } from './config.ts';
import type { Anchor, CachedNft, MirrorChain, MirrorCollection, MintEvent } from './types.ts';

const controllerAbi = [
  'function CONTRACT_VERSION() view returns (string)', 'function rounds(uint256) view returns (address)',
  'function renderer() view returns (address)', 'function voting() view returns (address)',
  'function genesis() view returns (address)',
  'event RoundCreated(uint256 indexed roundId,address indexed round,address indexed roundOwner)',
];
const roundAbi = [
  'function CONTRACT_VERSION() view returns (string)', 'function roundId() view returns (uint256)',
  'function voting() view returns (address)', 'function renderer() view returns (address)',
  'function name() view returns (string)', 'function seasonName() view returns (string)',
  'function seasonId() view returns (bytes32)', 'function collectionColor() view returns (string)',
  'function textColor() view returns (string)', 'function maxSupply() view returns (uint256)',
  'function combinationKey() view returns (bytes32)',
  'event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)',
];
const rendererAbi = [
  'function tokenURI((bytes32 seasonId,string seasonName,string collectionName,string collectionColor,string textColor),uint256,uint256[4],uint256) pure returns (string)',
];
const controllerInterface = new Interface(controllerAbi), roundInterface = new Interface(roundAbi);
const lower = (value: string) => getAddress(value).toLowerCase();
const ZERO_TOPIC = '0x' + '0'.repeat(64);
const genesisAbi = ['function CONTRACT_VERSION() view returns (string)', 'function controller() view returns (address)',
  'function voting() view returns (address)', 'function MAX_SUPPLY() view returns (uint256)',
  'function MINT_DURATION() view returns (uint256)', 'function tokenURI(uint256) view returns (string)'];

export class RpcMirrorChain implements MirrorChain {
  private controller: Contract;
  private provider: JsonRpcProvider;
  private config: MirrorConfig;
  constructor(provider: JsonRpcProvider, config: MirrorConfig) {
    this.provider=provider; this.config=config;
    this.controller = new Contract(config.controller,controllerAbi,provider);
  }
  async block(number: number): Promise<Anchor> {
    const block = await this.provider.getBlock(number);
    ensure(block?.hash, 'canonical_block_unavailable');
    return {number,hash:block.hash.toLowerCase()};
  }
  async head(): Promise<Anchor> {
    const latest = await this.provider.getBlock('latest');
    ensure(latest && Date.now()/1000 - latest.timestamp < 300 && latest.timestamp < Date.now()/1000 + 60, 'chain_head_stale');
    return this.block(Math.max(0,latest.number-this.config.confirmations));
  }
  async verify(anchor: Anchor): Promise<void> {
    const [chainId,code] = await Promise.all([
      this.provider.send('eth_chainId',[]), this.provider.getCode(this.config.controller,anchor.number),
    ]);
    ensure(Number(BigInt(chainId)) === this.config.chainId && code !== '0x'
      && keccak256(code) === this.config.codeHash, 'collection_trust_mismatch');
    // Starting after deployment would silently omit earlier collections/mints.
    ensure(this.config.fromBlock === 0 || await this.provider.getCode(this.config.controller,this.config.fromBlock-1) === '0x', 'collection_trust_mismatch');
    ensure(await this.controller.CONTRACT_VERSION({blockTag:anchor.number}) === `season-controller-v${this.config.version}`, 'collection_trust_mismatch');
  }
  private checkLogs(logs: Log[], from: number, to: Anchor): void {
    ensure(logs.length <= 140000 && logs.every(log => !log.removed && log.blockNumber >= from && log.blockNumber <= to.number), 'canonical_block_changed');
  }
  async discover(from: number, to: Anchor): Promise<MirrorCollection[]> {
    const logs = await this.provider.getLogs({address:this.config.controller,fromBlock:from,toBlock:to.number,
      topics:[controllerInterface.getEvent('RoundCreated')!.topicHash]});
    this.checkLogs(logs,from,to);
    ensure(logs.length <= 256,'collection_trust_mismatch');
    const output: MirrorCollection[] = [];
    const blockTag = to.number;
    if (this.config.version === 14) {
      const address = lower(await this.controller.genesis({blockTag}));
      // Historical discovery can precede the one-time Genesis binding.
      if (address !== ZeroAddress) {
        const g = new Contract(address,genesisAbi,this.provider);
        const [code,version,controller,voting,expectedVoting,supply,duration] = await Promise.all([
          this.provider.getCode(address,blockTag),g.CONTRACT_VERSION({blockTag}),g.controller({blockTag}),
          g.voting({blockTag}),this.controller.voting({blockTag}),g.MAX_SUPPLY({blockTag}),g.MINT_DURATION({blockTag}),
        ]);
        ensure(code !== '0x' && keccak256(code) === this.config.genesisCodeHash && version === 'genesis-v14'
          && lower(controller) === this.config.controller && lower(voting) === lower(expectedVoting)
          && supply === 1000n && duration === 86400n,'collection_trust_mismatch');
        output.push({kind:'genesis',chainId:this.config.chainId,address,controller:this.config.controller,roundId:0,
          name:'Tincta Genesis',seasonName:'Before the first season',seasonId:ZeroHash,color:'#FFFFFF',textColor:'#000000',
          renderer:address,deploymentBlock:this.config.fromBlock,cursor:null});
      }
    }
    for (const log of logs) {
      const event = controllerInterface.parseLog(log)!;
      const address = lower(event.args.round), roundId = Number(event.args.roundId);
      const round = new Contract(address,roundAbi,this.provider);
      const [registered,version,id,voting,renderer,expectedVoting,expectedRenderer,name,seasonName,seasonId,color,textColor] = await Promise.all([
        this.controller.rounds(roundId,{blockTag}),round.CONTRACT_VERSION({blockTag}),round.roundId({blockTag}),
        round.voting({blockTag}),round.renderer({blockTag}),this.controller.voting({blockTag}),this.controller.renderer({blockTag}),
        round.name({blockTag}),round.seasonName({blockTag}),round.seasonId({blockTag}),round.collectionColor({blockTag}),round.textColor({blockTag}),
      ]);
      ensure(roundId > 0 && roundId <= 256 && Number(id) === roundId && lower(registered) === address
        && version === `affiliate-v${this.config.version === 14 ? 13 : this.config.version}` && lower(voting) === lower(expectedVoting)
        && lower(renderer) === lower(expectedRenderer) && typeof name === 'string' && name.length > 0
        && new TextEncoder().encode(name).length <= 80, 'collection_trust_mismatch');
      const appearance = normalizeSeasonAppearance({seasonId,seasonName,collectionColor:color,textColor});
      output.push({chainId:this.config.chainId,address,controller:this.config.controller,roundId,name,
        seasonName:appearance.seasonName,seasonId:appearance.seasonId,color:appearance.collectionColor,
        textColor:appearance.textColor,renderer:lower(renderer),deploymentBlock:log.blockNumber,cursor:null});
    }
    return output;
  }
  async events(collection: MirrorCollection, from: number, to: Anchor): Promise<MintEvent[]> {
    // Only primary mints and burns matter to this gallery. No ownership claims are made here.
    const topic = roundInterface.getEvent('Transfer')!.topicHash;
    const [mints,burns] = await Promise.all([
      this.provider.getLogs({address:collection.address,fromBlock:from,toBlock:to.number,topics:[topic,ZERO_TOPIC]}),
      this.provider.getLogs({address:collection.address,fromBlock:from,toBlock:to.number,topics:[topic,null,ZERO_TOPIC]}),
    ]);
    const logs = [...mints,...burns].sort((a,b)=>a.blockNumber-b.blockNumber || a.index-b.index);
    this.checkLogs(logs,from,to);
    return logs.map(log => {
      const event = roundInterface.parseLog(log)!;
      const tokenId = Number(event.args.tokenId);
      ensure(Number.isSafeInteger(tokenId) && tokenId > 0 && tokenId <= (collection.kind === 'genesis' ? 1000 : 65536),'mint_accounting_mismatch');
      return {tokenId,block:log.blockNumber,blockHash:log.blockHash.toLowerCase(),transaction:log.transactionHash.toLowerCase(),burned:lower(event.args.to) === ZeroAddress};
    });
  }
  async artwork(collection: MirrorCollection, tokenId: number, anchor: Anchor): Promise<CachedNft> {
    if (collection.kind === 'genesis') {
      ensure(this.config.version === 14 && keccak256(await this.provider.getCode(collection.address,anchor.number)) === this.config.genesisCodeHash,'collection_trust_mismatch');
      const uri = await new Contract(collection.address,genesisAbi,this.provider).tokenURI(tokenId,{blockTag:anchor.number});
      return {metadata:decodeGenesisMetadata(uri,tokenId),numbers:[],code:null};
    }
    const round = new Contract(collection.address,roundAbi,this.provider);
    const [supply,key] = await Promise.all([round.maxSupply({blockTag:anchor.number}),round.combinationKey({blockTag:anchor.number})]);
    ensure(tokenId <= Number(supply) && key === derivePermanentCombinationKey({chainId:collection.chainId,
      collectionAddress:collection.address,roundId:collection.roundId,seasonId:collection.seasonId,maxSupply:supply}), 'collection_trust_mismatch');
    const identity = encodePermanentCombination(tokenId,key);
    // This is exactly the immutable renderer used by round.tokenURI(). Calling it directly
    // also preserves the original artwork of confirmed minted NFTs subsequently burned for refunds.
    const renderer = new Contract(collection.renderer,rendererAbi,this.provider);
    const uri = await renderer.tokenURI([collection.seasonId,collection.seasonName,collection.name,collection.color,collection.textColor],
      tokenId,identity.numbers,identity.combinationCode,{blockTag:anchor.number});
    // Both current round versions deliberately retain the deployed V11 renderer's metadata lineage.
    const metadata = decodeOnChainMetadata(uri,'affiliate-v11');
    const attrs = new Map(metadata.attributes.map(a=>[a.trait_type,a.value]));
    ensure(metadata.name === `${collection.name} #${tokenId}` && attrs.size === 5
      && ['A','B','C','D'].every((key,i)=>attrs.get(key) === identity.numbers[i])
      && attrs.get('Combination code') === Number(identity.combinationCode), 'metadata_identity_mismatch');
    return {metadata,numbers:identity.numbers,code:Number(identity.combinationCode)};
  }
}
