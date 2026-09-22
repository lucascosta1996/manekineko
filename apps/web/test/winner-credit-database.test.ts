import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { WINNER_CREDIT_SOURCES, WINNER_CREDIT_TARGET } from "../lib/winner-credits/queries.ts";

const url = process.env.WINNER_CREDIT_TEST_DATABASE_URL;
const wallet="0x1111111111111111111111111111111111111111",recipient="0x2222222222222222222222222222222222222222",factory="0x3333333333333333333333333333333333333333";
const collection=(id:number)=>`00000000-0000-4000-8000-${id.toString().padStart(12,"0")}`;
const hash=`0x${"a".repeat(64)}`;

test("winner credit discovery uses settled holders, canonical deployed sources, and stable pages",{skip:!url},async()=>{
  const parsed=new URL(url!);
  assert.ok(["127.0.0.1","localhost"].includes(parsed.hostname),"Query regression must use an explicitly isolated local database");
  const client=new pg.Client({connectionString:url});await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TEMP TABLE manekineko_collections(id uuid, name text, chain_id bigint, round_id numeric, contract_version text, algorithm_version text, mint_price_wei numeric,winner_count integer) ON COMMIT DROP;
      CREATE TEMP TABLE manekineko_deployments(collection_id uuid, chain_id bigint, contract_address text, factory_address text, status text) ON COMMIT DROP;
      CREATE TEMP TABLE manekineko_collection_history(id uuid,status text,is_mock boolean) ON COMMIT DROP;
      CREATE TEMP TABLE manekineko_history_winners(collection_id uuid,winning_holder text,prize_recipient text,token_id integer,paid_at timestamptz) ON COMMIT DROP;
      CREATE TEMP TABLE manekineko_collection_awards(collection_id uuid, rank integer, token_id integer, claimed boolean, winning_holder text, paid_at timestamptz, block_number bigint, block_hash text) ON COMMIT DROP;
      CREATE TEMP TABLE manekineko_collection_state(collection_id uuid,prize_paid boolean,block_number bigint,block_hash text,winning_token_id integer) ON COMMIT DROP;
      CREATE TEMP TABLE manekineko_indexer_checkpoints(collection_id uuid,block_number bigint,block_hash text,trust_fingerprint text) ON COMMIT DROP;
    `);
    async function add(id:number, options:{version?:string;algorithm?:string;chain?:number;deployed?:boolean;mock?:boolean;paid?:boolean;holder?:string;contract?:string;fingerprint?:string|null;blockHash?:string;status?:string;winner?:number}={}) {
      const cid=collection(id),chain=options.chain??11155111,version=options.version??"affiliate-v5";
      await client.query("INSERT INTO manekineko_collections VALUES($1,$2,$3,$4,$5,$6,10000,$7)",[cid,`Collection ${id}`,chain,id,version,options.algorithm??(version==="affiliate-v6"?"unique-rank-v3":"unique-rank-v2"),["affiliate-v8","affiliate-v9","affiliate-v10"].includes(version)?6:null]);
      await client.query("INSERT INTO manekineko_deployments VALUES($1,$2,$3,$4,$5)",[cid,chain,options.contract??`0x${id.toString(16).padStart(40,"0")}`,factory,options.deployed===false?"undeployed":"deployed"]);
      await client.query("INSERT INTO manekineko_collection_history VALUES($1,$2,$3)",[cid,options.status??"completed",options.mock??false]);
      await client.query("INSERT INTO manekineko_history_winners VALUES($1,$2,$3,3,'2026-09-19T00:00:00Z')",[cid,options.holder??wallet,recipient]);
      await client.query("INSERT INTO manekineko_collection_state VALUES($1,$2,100,$3,$4)",[cid,options.paid??true,hash,options.winner??3]);
      await client.query("INSERT INTO manekineko_indexer_checkpoints VALUES($1,100,$2,$3)",[cid,options.blockHash??hash,options.fingerprint===undefined?"verified":options.fingerprint]);
    }
    await add(1);await add(2,{version:"affiliate-v6"});
    await add(3,{chain:1});await add(4,{deployed:false});await add(5,{contract:"malformed"});
    await add(6,{mock:true});await add(7,{paid:false});await add(8,{algorithm:"unique-rank-v3"});
    await add(9,{fingerprint:null});await add(10,{blockHash:`0x${"b".repeat(64)}`});await add(11,{winner:4});
    await add(12,{status:"refunded"});await add(13,{holder:recipient});
    const sources=async(address=wallet,page=1,size=10,chain:number|null=11155111)=>(await client.query(WINNER_CREDIT_SOURCES,[address,chain,size,(page-1)*size])).rows[0];
    const results=await sources();assert.equal(results.total,2);assert.deepEqual(results.items.map((item:{collectionId:string})=>item.collectionId),[collection(1),collection(2)]);
    assert.equal(results.items[0].winningHolder,wallet,"award the settled winning holder, never redirected prize recipient");
    assert.equal((await sources(recipient)).total,1,"prize recipients receive no credit unless independently the winning holder");
    assert.equal((await sources(wallet,1,10,1)).total,1);
    assert.equal((await sources(wallet,1,10,null)).total,3);
    assert.equal((await sources(wallet,1,1)).items[0].collectionId,collection(1));
    assert.equal((await sources(wallet,2,1)).items[0].collectionId,collection(2));
    assert.equal((await sources(wallet,3,1)).total,2);assert.deepEqual((await sources(wallet,3,1)).items,[]);
    assert.equal((await client.query(WINNER_CREDIT_TARGET,[collection(2),11155111])).rows[0].contractVersion,"affiliate-v6");
    assert.equal((await client.query(WINNER_CREDIT_TARGET,[collection(3),11155111])).rows.length,0);
    assert.equal((await client.query(WINNER_CREDIT_TARGET,[collection(4),11155111])).rows.length,0);
    await add(14,{version:"affiliate-v7",algorithm:"unique-rank-v4",status:"awaiting_prize",paid:false});
    await client.query("INSERT INTO manekineko_collection_awards VALUES($1,1,3,false,NULL,NULL,100,$3),($1,2,9,true,$2,'2026-09-20T00:00:00Z',100,$3)",[collection(14),wallet,hash]);
    const ranked=await sources();assert.equal(ranked.total,3);assert.equal(ranked.items[0].collectionId,collection(14));assert.equal(ranked.items[0].awardRank,2);assert.equal(ranked.items[0].tokenId,"9");
    assert.equal((await client.query(WINNER_CREDIT_TARGET,[collection(14),11155111])).rows[0].contractVersion,"affiliate-v7");
    await client.query("UPDATE manekineko_collection_awards SET claimed=true,winning_holder=$2,paid_at='2026-09-20T00:00:00Z' WHERE collection_id=$1 AND rank=1",[collection(14),wallet]);
    const both=await sources();assert.equal(both.total,4);assert.deepEqual(both.items.slice(0,2).map((item:{awardRank:number})=>item.awardRank),[1,2]);
    await client.query("UPDATE manekineko_collection_awards SET block_hash=$2 WHERE collection_id=$1 AND rank=2",[collection(14),`0x${"b".repeat(64)}`]);
    assert.equal((await sources()).total,3,"rank-two reorg mismatch must be excluded independently");
    await add(15,{version:"affiliate-v8",algorithm:"unique-rank-v5",status:"awaiting_prize",paid:false});
    for(let rank=1;rank<=7;rank++) await client.query("INSERT INTO manekineko_collection_awards VALUES($1,$2,$3,$4,$5,'2026-09-21T00:00:00Z',100,$6)",[collection(15),rank,rank+10,rank===6||rank===7,wallet,hash]);
    assert.equal((await sources()).total,4,"only the claimed sixth award is eligible; rank seven is outside this collection");
    const sixth=(await sources()).items[0];assert.equal(sixth.awardRank,6);assert.equal(sixth.tokenId,"16");
    assert.equal((await client.query(WINNER_CREDIT_TARGET,[collection(15),11155111])).rows[0].contractVersion,"affiliate-v8");
    await client.query("UPDATE manekineko_collection_awards SET claimed=true WHERE collection_id=$1",[collection(15)]);
    const six=await sources();assert.equal(six.total,9);assert.deepEqual(six.items.slice(0,6).map((item:{awardRank:number})=>item.awardRank),[1,2,3,4,5,6]);
    await client.query("UPDATE manekineko_collection_awards SET block_hash=$2 WHERE collection_id=$1 AND rank=6",[collection(15),`0x${"b".repeat(64)}`]);
    assert.equal((await sources()).total,8,"rank-six reorg mismatch must not invalidate the other five settled awards");

    await add(16,{version:"affiliate-v10",algorithm:"unique-rank-v6",status:"awaiting_prize",paid:false});
    await client.query("INSERT INTO manekineko_collection_awards VALUES($1,6,19,true,$2,'2026-09-22T00:00:00Z',100,$3)",[collection(16),wallet,hash]);
    assert.equal((await sources()).total,9);
    assert.equal((await sources()).items[0].contractVersion,"affiliate-v10");
    assert.equal((await sources()).items[0].awardRank,6);
    assert.equal((await client.query(WINNER_CREDIT_TARGET,[collection(16),11155111])).rows[0].contractVersion,"affiliate-v10");
    await client.query("UPDATE manekineko_collections SET algorithm_version='unique-rank-v5' WHERE id=$1",[collection(16)]);
    assert.equal((await sources()).total,8);
    assert.equal((await client.query(WINNER_CREDIT_TARGET,[collection(16),11155111])).rows.length,0,"V10 cannot use the earlier algorithm");
  } finally { await client.query("ROLLBACK");await client.end(); }
});
