import productionAbi from '@manekineko/contract-abi/tincta-rewards' with {type:'json'};
import {verifyTincta} from '../../../../packages/protocol/src/tincta.ts';
import {Contract,Interface,ZeroAddress,ZeroHash,keccak256,type JsonRpcProvider,type Log} from 'ethers';
import abi from '@manekineko/contract-abi/protocol-v16' with {type:'json'};
import v17Abi from '@manekineko/contract-abi/protocol-v17' with {type:'json'};
import {decodeGenesisMetadata,decodeOnChainMetadata} from '@manekineko/contract-abi/onchain-metadata';
import {derivePermanentCombinationKey,deriveTinctaPermanentCombinationKey,encodePermanentCombination} from '@manekineko/contract-abi/permanent-combinations';
import {normalizeSeasonAppearance} from '@manekineko/contract-abi/season-appearance';
import {ensure} from '../types.ts';
import type {MirrorConfig} from './config.ts';
import type {Anchor,CachedNft,MirrorChain,MirrorCollection,MintEvent} from './types.ts';
import {decodeWalletEvents,walletEventTopics} from './wallet-activity.ts';
const iface=new Interface(abi),zeroTopic='0x'+'0'.repeat(64);
export class V16MirrorChain implements MirrorChain{
  private provider:JsonRpcProvider; private config:MirrorConfig; private contract:Contract;
  constructor(provider:JsonRpcProvider,config:MirrorConfig){this.provider=provider;this.config=config;this.contract=new Contract(config.controller,config.version===18?productionAbi:config.version===17?v17Abi:abi,provider);}
  async block(number:number):Promise<Anchor>{const b=await this.provider.getBlock(number);ensure(b?.hash,'canonical_block_unavailable');return{number,hash:b.hash.toLowerCase()};}
  async head(){const b=await this.provider.getBlock('latest');ensure(b&&Math.abs(Date.now()/1000-b.timestamp)<180,'chain_head_stale');return this.block(Math.max(0,b.number-this.config.confirmations));}
  async verify(anchor:Anchor){
    const c=this.config,at={blockTag:anchor.number};
    ensure((c.version===16||c.version===17||c.version===18)&&c.chainId===(c.version===18?1:11155111)&&BigInt(await this.provider.send('eth_chainId',[]))===BigInt(c.chainId),'collection_trust_mismatch');
    if(c.version===18)await verifyTincta(this.provider,c.controller,anchor.number);
    const code=await this.provider.getCode(c.controller,anchor.number);
    ensure(code!=='0x'&&keccak256(code)===c.codeHash&&(c.fromBlock===0||await this.provider.getCode(c.controller,c.fromBlock-1)==='0x'),'collection_trust_mismatch');
    ensure(await this.contract.CONTRACT_VERSION(at)===(c.version===18?'tincta-rewards-1':`tincta-v${c.version}`)&&await this.contract.GENESIS_SUPPLY(at)===(c.version===17?20n:1000n)&&await this.contract.GENESIS_MAX_MINTS_PER_WALLET(at)===2n,'collection_trust_mismatch');
    if(c.version===17)ensure(await this.contract.REHEARSAL_MODE(at)===true&&await this.contract.RANDOMNESS_TIMEOUT(at)===900n,'collection_trust_mismatch');
  }
  private check(logs:Log[],from:number,to:Anchor){ensure(logs.length<=140000&&logs.every(l=>!l.removed&&l.blockNumber>=from&&l.blockNumber<=to.number),'canonical_block_changed');}
  async walletEvents(from:number,to:Anchor){
    return decodeWalletEvents(await this.provider.getLogs({address:this.config.controller,fromBlock:from,toBlock:to.number,topics:[walletEventTopics]}),this.config,from,to);
  }
  async discover(from:number,to:Anchor):Promise<MirrorCollection[]>{
    const c=this.config,logs=await this.provider.getLogs({address:c.controller,fromBlock:from,toBlock:to.number,topics:[iface.getEvent('CollectionPrepared')!.topicHash]});this.check(logs,from,to);
    const common={chainId:c.chainId,address:c.controller,controller:c.controller,renderer:c.controller,cursor:null};
    const output:MirrorCollection[]=[{...common,kind:'genesis',roundId:0,name:'Tincta Genesis',seasonName:'Before the first season',seasonId:ZeroHash,color:'#FFFFFF',textColor:'#000000',deploymentBlock:c.fromBlock}];
    for(const log of logs){
      const id=Number(iface.parseLog(log)!.args.collectionId);ensure(id>=1&&id<=256,'collection_trust_mismatch');
      const p=await this.contract.collection(id,{blockTag:to.number}),appearance=normalizeSeasonAppearance({seasonId:p.seasonId,seasonName:p.seasonName,collectionColor:p.color,textColor:p.textColor});
      output.push({...common,kind:'paid',roundId:id,name:p.name,seasonName:appearance.seasonName,seasonId:appearance.seasonId,color:appearance.collectionColor,textColor:appearance.textColor,deploymentBlock:log.blockNumber});
    }
    return output;
  }
  async events(c:MirrorCollection,from:number,to:Anchor):Promise<MintEvent[]>{
    const topic=iface.getEvent('Transfer')!.topicHash;
    const groups=await Promise.all([[topic,zeroTopic],[topic,null,zeroTopic]].map(topics=>this.provider.getLogs({address:c.address,fromBlock:from,toBlock:to.number,topics})));
    const logs=groups.flat().sort((a,b)=>a.blockNumber-b.blockNumber||a.index-b.index);this.check(logs,from,to);
    return logs.flatMap(log=>{const e=iface.parseLog(log)!,token=BigInt(e.args.tokenId),id=Number(token>>17n),serial=Number(token&131071n);
      if(id!==c.roundId)return[];
      ensure(serial>=1&&serial<=(id===0?1000:65536),'mint_accounting_mismatch');
      return[{tokenId:serial,block:log.blockNumber,blockHash:log.blockHash.toLowerCase(),transaction:log.transactionHash.toLowerCase(),burned:e.args.to.toLowerCase()===ZeroAddress}];
    });
  }
  async artwork(c:MirrorCollection,serial:number,anchor:Anchor,mintBlock?:number):Promise<CachedNft>{
    ensure(mintBlock!==undefined&&mintBlock>=c.deploymentBlock&&mintBlock<=anchor.number,'mint_accounting_mismatch');
    const global=(BigInt(c.roundId)<<17n)|BigInt(serial);
    // Read the original mint block so refunded/burned NFTs keep their actual artwork.
    const uri=await this.contract.tokenURI(global,{blockTag:mintBlock});
    if(c.roundId===0)return{metadata:decodeGenesisMetadata(uri,serial),numbers:[],code:null};
    const at={blockTag:anchor.number},[terms,key]=await Promise.all([this.contract.terms(c.roundId,at),this.contract.combinationKey(c.roundId,at)]);
    const deriveKey=this.config.version===18?deriveTinctaPermanentCombinationKey:derivePermanentCombinationKey;
    ensure(serial<=Number(terms.supply)&&key===deriveKey({chainId:c.chainId,collectionAddress:c.address,roundId:c.roundId,seasonId:c.seasonId,maxSupply:terms.supply}),'collection_trust_mismatch');
    const identity=encodePermanentCombination(serial,key),metadata=decodeOnChainMetadata(uri,this.config.version===18?'tincta-rewards-1':this.config.version===17?'tincta-v17':'tincta-v16'),attrs=new Map(metadata.attributes.map(a=>[a.trait_type,a.value]));
    ensure(metadata.name===`${c.name} #${serial}`&&attrs.size===5&&['A','B','C','D'].every((k,i)=>attrs.get(k)===identity.numbers[i])&&attrs.get('Combination code')===Number(identity.combinationCode),'metadata_identity_mismatch');
    return{metadata,numbers:identity.numbers,code:Number(identity.combinationCode)};
  }
}
