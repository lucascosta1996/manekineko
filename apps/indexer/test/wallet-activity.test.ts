import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {Interface,ZeroAddress} from 'ethers';
import abi from '@manekineko/contract-abi/protocol-v16' with {type:'json'};
import {decodeWalletEvents,type WalletEvent} from '../lib/nft-mirror/wallet-activity.ts';
import {V16MirrorStore} from '../lib/nft-mirror/v16-store.ts';
import {queryWalletProfile} from '../../web/lib/wallet-profile/queries.ts';
const hash=(n:number)=>'0x'+n.toString(16).padStart(64,'0'),address=(n:number)=>'0x'+n.toString(16).padStart(40,'0');
const config={chainId:11155111,controller:address(1),codeHash:hash(1),version:17 as const,fromBlock:10,confirmations:2,blockRange:2000,rpcUrl:'https://unused.invalid'};
const owner=address(2),other=address(3),anchor={number:100,hash:hash(100)};
const iface=new Interface(abi),global=(n:number)=>(2<<17)|n;
const transfer=(token:number,from:string,to:string,block:number,index:number):WalletEvent=>({block,blockHash:hash(block),index,transaction:hash(block*100+index),type:'transfer',collection:token>>17,token,sender:from,recipient:to,amount:null,kind:null});
const payment=(kind:number,amount:string,index:number,recipient=owner):WalletEvent=>({block:20,blockHash:hash(20),index,transaction:hash(2000+index),type:'payment',collection:2,token:kind===0||kind===1?global(index):0,sender:null,recipient,amount,kind});
test('wallet events retain global IDs, exact wei and log ordering; reject orphaned or foreign logs',()=>{
  const log=(name:string,args:unknown[],index:number)=>({...iface.encodeEventLog(iface.getEvent(name)!,args),address:config.controller,blockNumber:20,blockHash:hash(20),transactionHash:hash(20),index,removed:false});
  const paid=log('Paid',[2,global(15),owner,900719925474099312345n,0],2),moved=log('Transfer',[ZeroAddress,owner,global(15)],1);
  const events=decodeWalletEvents([paid,moved],config,10,anchor);
  assert.equal(events[0].type,'transfer');assert.equal(events[1].amount,'900719925474099312345');assert.equal(events[0].token,262159);
  assert.throws(()=>decodeWalletEvents([{...paid,removed:true}],config,10,anchor));
  assert.throws(()=>decodeWalletEvents([{...paid,address:other}],config,10,anchor));
  assert.throws(()=>decodeWalletEvents([paid,paid],config,10,anchor));
  assert.throws(()=>decodeWalletEvents([log('Paid',[1,global(15),owner,1,0],3)],config,10,anchor));
});
test('wallet SQL preserves exact payments and current ownership through transfer, burn, pagination, replay and reorg',{
  skip:process.env.TEST_INDEXER_DATABASE!=='1'?'Requires an isolated localhost database.':false,
},async()=>{
  const connectionString=process.env.DATABASE_URL!;assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(connectionString).hostname));
  const schema='wallet_'+randomUUID().replaceAll('-',''),admin=new pg.Client({connectionString});await admin.connect();let pool:pg.Pool|undefined;
  try{
    await admin.query(`CREATE SCHEMA ${schema}`);pool=new pg.Pool({connectionString,options:`-c search_path=${schema},public`});
    for(const file of ['033_nft_mirror.sql','034_genesis_v14_mirror.sql','035_genesis_nft_gallery.sql','036_v16_nft_mirror.sql','037_v17_accelerated_rehearsal.sql','038_wallet_activity.sql'])await pool.query(await readFile(new URL('../../../database/migrations/'+file,import.meta.url),'utf8'));
    const db=pool,query=(sql:string,values:unknown[])=>db.query(sql,values),store=new V16MirrorStore(db,config),check=async()=>{};
    assert.ok(await store.claim());await store.verified(true,anchor);
    const incoming=Array.from({length:28},(_,i)=>transfer(global(i+1),ZeroAddress,owner,11,i));
    await store.walletEvents(incoming,{number:15,hash:hash(15)},false,check);
    assert.equal((await queryWalletProfile(query,config,owner)).status,'syncing');
    const events=[transfer(global(1),owner,other,16,0),transfer(global(2),owner,ZeroAddress,16,1),transfer(global(3),owner,other,17,0),transfer(global(3),other,owner,17,1),payment(0,'900719925474099312345',1),payment(2,'133333333333333',2),payment(1,'100000000000000',3),payment(0,'999',4,other)];
    await store.walletEvents(events,anchor,true,check);await store.walletEvents(events,anchor,true,check);
    let result=await queryWalletProfile(query,config,owner);
    assert.equal(result.status,'ready');assert.equal(result.owned,26);assert.equal(result.nfts.length,24);assert.equal(result.nfts[0].tokenId,global(3));
    assert.equal(result.totals.find(t=>t.kind===0)?.amountWei,'900719925474099312345');assert.equal(result.totals.find(t=>t.kind===0)?.count,1);assert.equal(result.paymentsTotal,3);
    assert.deepEqual((await queryWalletProfile(query,config,owner,2)).nfts.map(n=>n.tokenId),[global(27),global(28)]);
    await assert.rejects(()=>store.walletEvents([{...events[4],amount:'1'}],anchor,true,check));
    await assert.rejects(()=>store.walletEvents([payment(3,'444',5)],anchor,true,async()=>{throw new Error('canonical_block_changed');}));
    assert.equal((await queryWalletProfile(query,config,owner)).paymentsTotal,3);
    const otherSource=new V16MirrorStore(db,{...config,controller:address(4)});assert.ok(await otherSource.claim());await otherSource.verified(true,anchor);await otherSource.walletEvents([payment(0,'111',1)],anchor,true,check);await otherSource.release();
    assert.equal((await queryWalletProfile(query,config,owner)).paymentsTotal,3);
    assert.equal((await queryWalletProfile(query,{...config,codeHash:hash(999)},owner)).status,'unavailable');
    await store.verified(false);result=await queryWalletProfile(query,config,owner);assert.equal(result.status,'unavailable');assert.deepEqual(result.totals,[]);assert.deepEqual(result.nfts,[]);
    await store.resetSource();assert.equal((await db.query('SELECT count(*)::integer AS n FROM manekineko_wallet_activity WHERE controller=$1',[config.controller])).rows[0].n,0);
    await store.verified(true,anchor);assert.equal((await queryWalletProfile(query,config,owner)).status,'syncing');await store.release();
    await assert.rejects(()=>store.walletEvents([payment(3,'444',5)],anchor,true,check));
  }finally{await pool?.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
