import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { readMirrorConfigs, fingerprint } from '../lib/nft-mirror/config.ts';
import { MirrorStore } from '../lib/nft-mirror/store.ts';
import {V16MirrorStore} from '../lib/nft-mirror/v16-store.ts';
import { mirrorSource } from '../lib/nft-mirror/runner.ts';
import { IndexerError } from '../lib/types.ts';
import type { MirrorChain, MirrorCollection, CachedNft, MintEvent } from '../lib/nft-mirror/types.ts';
import { queryDirectory, queryGallery, queryMintActivity } from '../../web/lib/nft-mirror/queries.ts';
import { galleryIdentity, galleryPage } from '../../web/lib/nft-mirror/model.ts';

const hash = (n: number) => `0x${n.toString(16).padStart(64,'0')}`;
const config = {chainId:11155111,controller:`0x${'1'.repeat(40)}`,codeHash:hash(99),version:13 as const,
  fromBlock:10,confirmations:2,blockRange:2000,rpcUrl:'https://example.invalid/private-key'};
const c: MirrorCollection = {chainId:config.chainId,controller:config.controller,address:`0x${'2'.repeat(40)}`,roundId:1,
  name:'Mirror study',seasonId:hash(1),seasonName:'Study',color:'#330000',textColor:'#FFFFFF',renderer:`0x${'3'.repeat(40)}`,deploymentBlock:10,cursor:null};
const image = 'data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800"><text x="20" y="20">1 2 3 4</text></svg>').toString('base64');
const artwork = (tokenId: number): CachedNft => ({metadata:{name:`Mirror study #${tokenId}`,description:'Test fixture',image,
  attributes:['A','B','C','D'].map((trait_type,i)=>({trait_type,value:i+1}))},numbers:[1,2,3,4],code:291});
const mint = (tokenId: number): MintEvent => ({tokenId,block:11,blockHash:hash(11),transaction:hash(tokenId+100),burned:false});

test('mirror pins reject unsafe networks, unconfirmed indexing, duplicates and malformed profiles without leaking credentials',()=>{
  const read = (values: unknown) => readMirrorConfigs({NFT_MIRROR_SOURCES_JSON:JSON.stringify(values)});
  assert.equal(read([config])[0].controller,config.controller);
  assert.deepEqual(readMirrorConfigs({}),[]);
  assert.equal(read([{...config,version:14,genesisCodeHash:hash(14)}])[0].version,14);
  for (const value of [[{...config,version:14}],[config,config],[{...config,chainId:31337}],[{...config,fromBlock:-1}],[{...config,confirmations:0}],
    [{...config,chainId:1,confirmations:2}],[{...config,version:11}],[{...config,rpcUrl:'http://private.invalid/secret'}],{}]) {
    assert.throws(()=>read(value),error=>error instanceof Error && error.message === 'invalid_nft_mirror_configuration');
  }
  assert.equal(fingerprint(config),fingerprint({...config,rpcUrl:'https://rotated.invalid/key'}));
});
test('gallery inputs have a strict bounded page size and chain/address namespace',()=>{
  assert.equal(galleryPage(undefined),1); assert.equal(galleryPage('2'),2);
  for (const value of ['0','-1','1.5','9999','1e2','', ['1','2']]) assert.throws(()=>galleryPage(value));
  assert.equal(galleryIdentity('31337',c.address),null);
  assert.equal(galleryIdentity('1','0x'+'0'.repeat(40)),null);
  assert.equal(galleryIdentity('1',c.address)?.chainId,1);
});

test('mirror SQL: leases, retries, atomic replay, reorgs and paginated database-only reads',{
  skip:process.env.TEST_INDEXER_DATABASE !== '1' ? 'Requires an explicitly isolated local PostgreSQL database.' : false,
},async t=>{
  const connectionString=process.env.DATABASE_URL!;
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(connectionString).hostname));
  const schema='nft_mirror_'+randomUUID().replaceAll('-','');
  const admin=new pg.Client({connectionString}); await admin.connect();
  let pool: pg.Pool | undefined;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool=new pg.Pool({connectionString,max:8,options:`-c search_path=${schema},public`});
    for(const file of ['033_nft_mirror.sql','034_genesis_v14_mirror.sql','035_genesis_nft_gallery.sql','036_v16_nft_mirror.sql','037_v17_accelerated_rehearsal.sql']) await pool.query(await readFile(new URL('../../../database/migrations/'+file,import.meta.url),'utf8'));
    const db=pool, query=(sql: string,values: unknown[])=>db.query(sql,values);
    const stores=Array.from({length:4},()=>new MirrorStore(db,config));
    const leases=await Promise.all(stores.map(s=>s.claim()));
    assert.equal(leases.filter(Boolean).length,1);
    const store=stores[leases.findIndex(Boolean)];
    const check=async()=>{};
    await store.verified(true,{number:20,hash:hash(20)});
    await store.discover([c],{number:20,hash:hash(20)},check);
    const events=Array.from({length:49},(_,i)=>mint(i+1));
    await assert.rejects(store.events(c,events,{number:20,hash:hash(20)},true,async()=>{throw new IndexerError('canonical_block_changed');}));
    assert.equal((await query('SELECT * FROM manekineko_nft_mirror_tokens',[])).rowCount,0);
    assert.equal((await store.nextCollection())!.cursor,null);
    await store.events(c,events,{number:20,hash:hash(20)},true,check);
    await store.events(c,events,{number:20,hash:hash(20)},true,check);
    assert.equal((await query('SELECT * FROM manekineko_nft_mirror_tokens',[])).rowCount,49);
    await store.events(c,[{...mint(2),burned:true}],{number:20,hash:hash(20)},true,check);
    for(const event of events) await store.cache(c,event.tokenId,event.blockHash,artwork(event.tokenId),check);
    assert.equal(await store.pending(),null);
    const directory=await queryDirectory(query,[config],1);
    assert.equal(directory.total,1); assert.equal(directory.collections[0].ready,49);
    const first=(await queryGallery(query,[config],c.chainId,c.address,1))!, second=(await queryGallery(query,[config],c.chainId,c.address,2))!, last=(await queryGallery(query,[config],c.chainId,c.address,3))!;
    assert.deepEqual(first.tokens.map(t=>t.tokenId),Array.from({length:24},(_,i)=>i+1));
    assert.deepEqual(second.tokens.map(t=>t.tokenId),Array.from({length:24},(_,i)=>i+25));
    assert.deepEqual(last.tokens.map(t=>t.tokenId),[49]);
    assert.ok(first.tokens[1].burned); assert.equal(first.tokens[0].image,image);
    assert.equal(await queryGallery(query,[{...config,codeHash:hash(123)}],c.chainId,c.address,1),null);
    await store.verified(false);
    assert.equal(await queryGallery(query,[config],c.chainId,c.address,1),null);
    await store.verified(true);
    const genesis: MirrorCollection={...c,kind:'genesis',address:'0x'+'4'.repeat(40),roundId:0,name:'Tincta Genesis',seasonName:'Before the first season'};
    await store.discover([genesis],{number:20,hash:hash(20)},check);
    await store.events(genesis,events,{number:20,hash:hash(20)},true,check);
    for(const event of events) await store.cache(genesis,event.tokenId,event.blockHash,{...artwork(event.tokenId),numbers:[],code:null},check);
    const mixed=await queryDirectory(query,[config],1);
    assert.equal(mixed.total,1);assert.equal(mixed.genesis?.length,1);assert.equal(mixed.genesis?.[0].ready,49);
    const genesisLast=(await queryGallery(query,[config],c.chainId,genesis.address,3))!;
    assert.equal(genesisLast.collection.kind,'genesis');assert.deepEqual(genesisLast.tokens.map(t=>t.tokenId),[49]);assert.deepEqual(genesisLast.tokens[0].numbers,[]);
    await t.test('mint activity is bounded, groups batch mints, and excludes stale or untrusted sources',async()=>{
      await store.events(genesis,[50,51].map(tokenId=>({...mint(tokenId),block:19,transaction:hash(900)})),{number:20,hash:hash(20)},true,check);
      const activity=await queryMintActivity(query,[config]);
      assert.equal(activity.events.length,20);
      assert.ok(activity.events.some(event=>event.kind==='paid'));
      const batch=activity.events.filter(event=>event.transaction===hash(900));
      assert.equal(batch.length,1);assert.equal(batch[0].kind,'genesis');assert.equal(batch[0].tokenId,51);
      assert.equal((await queryMintActivity(query,[{...config,codeHash:hash(123)}])).events.length,0);
      assert.deepEqual(await queryMintActivity(async()=>{throw new Error('Must not query without pins');},[]),{events:[]});
      await db.query("UPDATE manekineko_nft_mirror_sources SET verified_at=now()-interval '4 minutes'");
      assert.equal((await queryMintActivity(query,[config])).events.length,0);
      await store.verified(false);assert.equal((await queryMintActivity(query,[config])).events.length,0);
      await store.verified(true,{number:1000,hash:hash(1000)});
      assert.equal((await queryMintActivity(query,[config])).events.length,0);
      await store.verified(true,{number:20,hash:hash(20)});
      await store.events(genesis,[{...mint(51),block:19,transaction:hash(900),burned:true}],{number:20,hash:hash(20)},true,check);
      assert.equal((await queryMintActivity(query,[config])).events.find(event=>event.transaction===hash(900))?.tokenId,50);
      const mainConfig={...config,chainId:1},mainStore=new MirrorStore(db,mainConfig),mainCollection={...c,chainId:1};
      await mainStore.claim();await mainStore.verified(true,{number:100,hash:hash(100)});
      await mainStore.discover([mainCollection],{number:100,hash:hash(100)},check);
      await mainStore.events(mainCollection,[{...mint(1),block:90}],{number:100,hash:hash(100)},true,check);
      const both=await queryMintActivity(query,[config,mainConfig]);
      assert.equal(both.events.filter(event=>event.chainId===1).length,1);
      assert.equal(both.events.filter(event=>event.chainId===11155111).length,20);
      await mainStore.release();await db.query('DELETE FROM manekineko_nft_mirror_sources WHERE chain_id=1');
    });
    await assert.rejects(db.query("UPDATE manekineko_nft_mirror_tokens SET kind='paid' WHERE collection_address=$1",[genesis.address]));
    await db.query('DELETE FROM manekineko_nft_mirror_collections WHERE address=$1',[genesis.address]);
    await store.release();

    await t.test('catch-up uses queued mints, retries artwork failures, preserves cache and removes reorged mints',async()=>{
      let fork=false,failToken=true,artCalls=0;
      const chain: MirrorChain={
        head:async()=>({number:22,hash:hash(fork?122:22)}),
        block:async number=>({number,hash:hash(fork && number>=10 ? number+100 : number)}),verify:async()=>{},
        discover:async(from)=>from<=10?[c]:[],
        events:async(_c,from)=>from<=11 ? [mint(1),mint(2)] : [],
        artwork:async(_c,id)=>{artCalls++; if(failToken && id===2) throw new Error('private provider URL'); return artwork(id);},
      };
      const run=()=>mirrorSource(config,chain,new MirrorStore(db,config),Date.now()+10000);
      assert.equal((await run()).ok,true);
      assert.equal(artCalls,0,'Ordinary reads do not download cached immutable artwork again.');
      fork=true;
      assert.equal((await run()).ok,false);
      assert.equal((await queryGallery(query,[config],c.chainId,c.address,1))!.collection.minted,2);
      assert.equal((await queryGallery(query,[config],c.chainId,c.address,1))!.tokens.length,1);
      assert.equal((await query('SELECT count(*)::int AS n FROM manekineko_nft_mirror_tokens WHERE attempts>0',[])).rows[0].n,1);
      failToken=false; await query("UPDATE manekineko_nft_mirror_tokens SET retry_after='epoch'",[]);
      assert.equal((await run()).ok,true);
      assert.equal((await queryGallery(query,[config],c.chainId,c.address,1))!.tokens.length,2);
      const after=artCalls; assert.equal((await run()).ok,true); assert.equal(artCalls,after);
      chain.verify=async()=>{throw new IndexerError('collection_trust_mismatch');};
      assert.equal((await run()).ok,false);
      assert.equal(await queryGallery(query,[config],c.chainId,c.address,1),null);
    });
    await t.test('V16 collections at one address keep serials, artwork, burns and cursors isolated from each other and history',async()=>{
      const v16={...config,controller:'0x'+'6'.repeat(40),version:16 as const};
      const store16=new V16MirrorStore(db,v16);assert.ok(await store16.claim());await store16.verified(true,{number:22,hash:hash(22)});
      const first={...c,address:v16.controller,controller:v16.controller,renderer:v16.controller,roundId:1,name:'First'},second={...c,address:v16.controller,controller:v16.controller,renderer:v16.controller,roundId:2,name:'Second'};
      await store16.discover([first,second],{number:22,hash:hash(22)},check);
      for(const item of [first,second]){await store16.events(item,[mint(1)],{number:22,hash:hash(22)},true,check);await store16.cache(item,1,hash(11),artwork(1),check);}
      assert.equal((await queryDirectory(query,[v16],1)).total,2);
      assert.equal(await queryGallery(query,[v16],v16.chainId,v16.controller,1),null,'V16 gallery URLs require an explicit collection ID');
      const read=async(id:number)=>(await queryGallery(query,[v16],v16.chainId,v16.controller,1,id))!;
      assert.equal((await read(1)).collection.name,'First');assert.equal((await read(2)).collection.name,'Second');
      await store16.events(first,[{...mint(1),burned:true}],{number:22,hash:hash(22)},true,check);
      assert.equal((await read(1)).tokens[0].burned,true);assert.equal((await read(2)).tokens[0].burned,false);
      await store16.resetCollection(first.address,1);assert.equal((await read(1)).collection.minted,0);assert.equal((await read(2)).collection.minted,1);
      assert.equal((await queryMintActivity(query,[v16])).events[0].collectionId,2);
      await store16.release();
    });
    await t.test('V17 permits only Sepolia and keeps its single-address gallery IDs separate from V16',async()=>{
      const fast={...config,controller:'0x'+'7'.repeat(40),version:17 as const},store17=new V16MirrorStore(db,fast);
      assert.ok(await store17.claim());await store17.verified(true,{number:22,hash:hash(22)});
      const item={...c,address:fast.controller,controller:fast.controller,renderer:fast.controller,roundId:1,name:'Fast first'};
      await store17.discover([item],{number:22,hash:hash(22)},check);await store17.events(item,[mint(1)],{number:22,hash:hash(22)},true,check);await store17.cache(item,1,hash(11),artwork(1),check);
      assert.equal(await queryGallery(query,[fast],fast.chainId,fast.controller,1),null);
      assert.equal((await queryGallery(query,[fast],fast.chainId,fast.controller,1,1))!.collection.collectionId,1);
      await assert.rejects(db.query("INSERT INTO manekineko_nft_mirror_sources(chain_id,controller,fingerprint,code_hash,version,from_block) VALUES(1,$1,$2,$3,17,1)",['0x'+'8'.repeat(40),'x',hash(1)]));await store17.release();
    });
    await t.test('expired workers cannot commit after lease takeover',async()=>{
      const old=new MirrorStore(db,config); assert.ok(await old.claim());
      await query("UPDATE manekineko_nft_mirror_sources SET lease_until=now()-interval '1 second'",[]);
      const next=new MirrorStore(db,config); assert.ok(await next.claim());
      await assert.rejects(old.resetSource(),/lease_expired/);
      await old.release(); assert.equal(await new MirrorStore(db,config).claim(),null);
      await next.release();
    });
  } finally { await pool?.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
});
