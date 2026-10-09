import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
const url=new URL(process.env.DATABASE_URL??'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.endsWith('_v11_test'))throw Error('Use an isolated local _v11_test database.');
const db=new pg.Client({connectionString:url.href});
try{await db.connect();await db.query('BEGIN');
const base=(await db.query('SELECT to_jsonb(c) row FROM manekineko_collections c LIMIT 1')).rows[0].row;
const terms={...base,id:randomUUID(),slug:'v11-test-'+randomUUID(),round_id:991,contract_version:'affiliate-v11',algorithm_version:'unique-rank-v6',randomness_provider:'chainlink-vrf-v2.5',reveal_delay_blocks:null,prize_bps:6000,winner_count:6,affiliate_pool_bps:2000,min_affiliate_referrals:1,affiliate_payout_cap_bps:0,sale_start_at:'2026-10-06T01:00:00Z',mint_duration_seconds:86400,season_id:'0x'+'77'.repeat(32),season_name:'V11 migration test',collection_color:'#330000',text_color:'#FFFFFF'};
async function insert(row){await db.query('INSERT INTO manekineko_collections SELECT (jsonb_populate_record(NULL::manekineko_collections,$1)).*',[JSON.stringify(row)])}
await insert(terms);
for(const patch of [{affiliate_payout_cap_bps:3000},{min_affiliate_referrals:2},{algorithm_version:'unique-rank-v5'},{winner_count:null}]){await db.query('SAVEPOINT invalid');await assert.rejects(()=>insert({...terms,...patch,id:randomUUID(),slug:randomUUID(),round_id:992}));await db.query('ROLLBACK TO SAVEPOINT invalid');}
await insert({...terms,id:randomUUID(),slug:randomUUID(),round_id:993,contract_version:'affiliate-v10',affiliate_payout_cap_bps:3000,min_affiliate_referrals:100});
await db.query('SAVEPOINT old');await assert.rejects(()=>insert({...terms,id:randomUUID(),slug:randomUUID(),round_id:994,contract_version:'affiliate-v10'}));await db.query('ROLLBACK TO SAVEPOINT old');
const payload={contract:{algorithmVersion:'unique-rank-v6',maxMintsPerWallet:'20',affiliatePoolBps:'2000',winnerCount:'6',minAffiliateReferrals:'1',affiliatePayoutCapBps:'0',saleStartAt:'4600',maxSupply:'1000',prizeBps:'6000'}};
assert.equal((await db.query('SELECT manekineko_launch_payload_version($1) v',[payload])).rows[0].v,'affiliate-v11');
payload.contract.affiliatePayoutCapBps='3000';assert.equal((await db.query('SELECT manekineko_launch_payload_version($1) v',[payload])).rows[0].v,'affiliate-v10');
console.log('V11 insert, payout/qualification/algorithm constraints, and historical V10 terms passed.');
}finally{await db.query('ROLLBACK').catch(()=>{});await db.end()}
