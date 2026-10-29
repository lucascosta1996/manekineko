import {Interface,type Log} from 'ethers';
import abi from '@manekineko/contract-abi/protocol-v16' with {type:'json'};
import type pg from 'pg';
import {ensure} from '../types.ts';
import type {Anchor} from './types.ts';
import type {MirrorConfig} from './config.ts';

const iface=new Interface(abi);
export const walletEventTopics=['Transfer','Paid'].map(name=>iface.getEvent(name)!.topicHash);
export type WalletEvent={block:number;blockHash:string;index:number;transaction:string;type:'transfer'|'payment';collection:number;token:number;sender:string|null;recipient:string;amount:string|null;kind:number|null};
export function decodeWalletEvents(logs:Pick<Log,'address'|'data'|'topics'|'blockNumber'|'blockHash'|'transactionHash'|'index'|'removed'>[],config:Pick<MirrorConfig,'controller'>,from:number,to:Anchor):WalletEvent[]{
  ensure(logs.length<=140000,'mint_accounting_mismatch');
  const seen=new Set<string>();
  return logs.map((log):WalletEvent=>{
    const key=`${log.blockNumber}:${log.index}`;
    ensure(!seen.has(key)&&!log.removed&&log.address.toLowerCase()===config.controller.toLowerCase()&&log.blockNumber>=from&&log.blockNumber<=to.number,'canonical_block_changed');seen.add(key);
    const event=iface.parseLog(log);ensure(event?.name==='Transfer'||event?.name==='Paid','collection_trust_mismatch');
    const transfer=event.name==='Transfer',token=BigInt(event.args.tokenId),collection=transfer?Number(token>>17n):Number(event.args.collectionId),serial=Number(token&131071n);
    ensure(collection>=0&&collection<=256&&(token===0n&&!transfer||Number(token>>17n)===collection&&serial>=1&&serial<=(collection===0?1000:65536)),'mint_accounting_mismatch');
    const kind=transfer?null:Number(event.args.kind);ensure(kind===null||kind>=0&&kind<=6,'collection_trust_mismatch');
    return{block:log.blockNumber,blockHash:log.blockHash.toLowerCase(),index:log.index,transaction:log.transactionHash.toLowerCase(),type:transfer?'transfer':'payment',collection,token:Number(token),sender:transfer?event.args.from.toLowerCase():null,recipient:(transfer?event.args.to:event.args.recipient).toLowerCase(),amount:transfer?null:String(event.args.amount),kind};
  }).sort((a,b)=>a.block-b.block||a.index-b.index);
}
export async function storeWalletEvents(client:pg.PoolClient,config:MirrorConfig,events:WalletEvent[],to:Anchor,caughtUp:boolean,check:()=>Promise<void>){
  if(events.length){
    const inserted=await client.query(`INSERT INTO manekineko_wallet_activity
      (chain_id,controller,block_number,block_hash,log_index,transaction_hash,event_type,collection_id,token_id,sender,recipient,amount_wei,payment_kind)
      SELECT $1,$2,e.block,e."blockHash",e.index,e.transaction,e.type,e.collection,e.token,e.sender,e.recipient,e.amount,e.kind
      FROM jsonb_to_recordset($3::jsonb) AS e(block bigint,"blockHash" text,index integer,transaction text,type text,collection integer,token integer,sender text,recipient text,amount numeric,kind integer)
      ON CONFLICT (chain_id,controller,block_number,log_index) DO UPDATE SET block_hash=excluded.block_hash
      WHERE manekineko_wallet_activity.block_hash=excluded.block_hash AND manekineko_wallet_activity.transaction_hash=excluded.transaction_hash
        AND manekineko_wallet_activity.event_type=excluded.event_type AND manekineko_wallet_activity.token_id=excluded.token_id
        AND manekineko_wallet_activity.collection_id=excluded.collection_id AND manekineko_wallet_activity.recipient=excluded.recipient
        AND manekineko_wallet_activity.sender IS NOT DISTINCT FROM excluded.sender
        AND manekineko_wallet_activity.amount_wei IS NOT DISTINCT FROM excluded.amount_wei
        AND manekineko_wallet_activity.payment_kind IS NOT DISTINCT FROM excluded.payment_kind
      RETURNING log_index`,[config.chainId,config.controller,JSON.stringify(events)]);
    ensure(inserted.rowCount===events.length,'canonical_block_changed');
  }
  await check();
  await client.query(`UPDATE manekineko_nft_mirror_sources SET wallet_cursor_block=$3,wallet_cursor_hash=$4,
    wallet_synced_at=CASE WHEN $5 THEN now() ELSE wallet_synced_at END WHERE chain_id=$1 AND controller=$2`,[config.chainId,config.controller,to.number,to.hash,caughtUp]);
}
