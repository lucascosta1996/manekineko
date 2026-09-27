import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { AFFILIATE_PROGRAM_SQL } from "../lib/affiliates/queries.ts";

const url=process.env.AFFILIATE_PROGRAM_TEST_DATABASE_URL;
test("program discovery joins text schedule chains to bigint collection chains without crossing networks",{skip:!url},async()=>{
  assert(["localhost","127.0.0.1"].includes(new URL(url!).hostname),"Regression requires isolated local PostgreSQL");
  const db=new pg.Client({connectionString:url});await db.connect();
  const id="369e50fc-47f3-496f-938d-53e5ea0f9d02";
  try{
    await db.query("BEGIN");
    await db.query(`CREATE TEMP TABLE manekineko_collections(id uuid,name text,chain_id bigint,round_id bigint,min_affiliate_referrals integer,affiliate_payout_cap_bps integer,winner_count integer,second_prize_bps integer,sale_start_at timestamptz,contract_version text,prize_bps integer,affiliate_pool_bps integer,mint_price_wei numeric,max_supply integer,algorithm_version text);
      CREATE TEMP TABLE manekineko_affiliate_programs(collection_id uuid,mode text,contract_version text,affiliate_rates_bps integer[],max_slots integer,enrollment_enabled boolean,enrollment_signer text);
      CREATE TEMP TABLE manekineko_deployments(collection_id uuid,contract_address text,factory_address text,status text,mint_deadline timestamptz);
      CREATE TEMP TABLE manekineko_season_runtime_public(chain_id text,payload jsonb,updated_at timestamptz);`);
    await db.query("INSERT INTO manekineko_collections(id,name,chain_id,round_id,contract_version) VALUES($1,'Lunar Stone',11155111,1,'affiliate-v10')",[id]);
    await db.query("INSERT INTO manekineko_affiliate_programs(collection_id,contract_version) VALUES($1,'affiliate-v10')",[id]);
    const initial=(await db.query(AFFILIATE_PROGRAM_SQL,[id])).rows[0];assert.equal(initial.collectionName,"Lunar Stone");assert.equal(initial.enrollmentOpensAt,null);
    await db.query("INSERT INTO manekineko_season_runtime_public VALUES('11155111',$1,'2030-01-01'),('1',$2,'2030-01-02')",[
      {collections:[{id,enrollmentOpensAt:"2030-01-01T12:00:00Z"}]},{collections:[{id,enrollmentOpensAt:"2030-01-02T12:00:00Z"}]},
    ]);
    const joined=(await db.query(AFFILIATE_PROGRAM_SQL,[id])).rows[0];assert.equal(joined.chainId,11155111);assert.equal(joined.enrollmentOpensAt,"2030-01-01T12:00:00Z");
  }finally{await db.query("ROLLBACK");await db.end();}
});
