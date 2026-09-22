import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOptions, resolveArtifactRoot, stableSeriesId, verifyJournalTerms, snapshotFromValues, confirmReceipt, persistCollection, inspectMockRemoval, removeMockRecords, DEMO_COLLECTION_IDS, DEMO_HISTORY_IDS } from './sync-staging-collection.mjs';
import { resolve } from 'node:path';

const owner = '0x1111111111111111111111111111111111111111';
const signer = '0x2222222222222222222222222222222222222222';
const hash = `0x${'a'.repeat(64)}`;
const appearance = { seasonId: `0x${'12'.repeat(32)}`, seasonName: 'First season', collectionColor: '#003366', textColor: '#FFFFFF' };
const config = { name:'Sepolia test', symbol:'TEST', chainId:'11155111',maxSupply:'20',mintPriceWei:'100000000000000',mintDurationSeconds:'86400',initialOwner:owner,
  vrfCoordinator:'0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B',keyHash:'0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae',requestConfirmations:'64',callbackGasLimit:'200000',randomnessFundingWei:'300000000000000000',maxAffiliateSlots:'20',enrollmentSigner:signer,prizeBps:'5000',affiliatePoolBps:'1000',affiliateRatesBps:[],activateSale:false };
const artifact = { contractVersion:'affiliate-v5',contract:config,operations:{factoryMode:'new',deployerAddress:owner,factoryOwnerAddress:owner} };
const terms = {name:config.name,symbol:config.symbol,roundId:'1',maxSupply:'20',mintPrice:config.mintPriceWei,mintDeadline:'186400',initialOwner:owner,vrfCoordinator:config.vrfCoordinator,keyHash:config.keyHash,requestConfirmations:'64',callbackGasLimit:'200000',maxAffiliateSlots:'20',enrollmentSigner:signer,prizeBps:'5000',affiliatePoolBps:'1000'};
const journal = {state:'funded-enrollment-open',preflight:{chainId:'11155111',from:owner,config:terms,randomnessFundingWei:config.randomnessFundingWei,activateSale:false},transactions:['deploy-factory','create-round','fund-randomness'].map(action=>({action,state:'confirmed',hash}))};
const args = ['--journal','journal.json','--manifest','export.json','--expected-hash','a'.repeat(64),'--collection-id','3342c115-3d41-4cb4-be45-fa103178f0ff'];
const values = {phase:0n,saleActivated:false,totalMinted:0n,totalMintRevenue:0n,refundedCount:0n,totalRefunded:0n,randomnessRequested:false,randomnessReceived:false,requestId:0n,randomWord:0n,revealed:false,winningTokenId:0n,highestScore:0n,prizePaid:false,prizeRecipient:owner,prizePaidAmount:0n};
const bigintTerms = {...terms,maxSupply:20n,mintPrice:100000000000000n,prizeBps:5000n};

test('preview is the default; database mutation is explicit',()=>{assert.equal(parseOptions(args).write,false);assert.equal(parseOptions([...args,'--write','--remove-mocks']).write,true);});
test('isolated artifact root is explicit, local, and keeps the production default',()=>{
  assert.match(resolveArtifactRoot(), /apps\/contracts\/artifacts$/);
  const isolated='.vercel/sepolia-v8/artifact-project/artifacts';
  assert.equal(parseOptions([...args,'--artifact-root',isolated]).artifactRoot,resolve(isolated));
  assert.equal(parseOptions(args).artifactRoot,undefined);
  for(const invalid of ['',' ', 'https://untrusted.example/artifacts', '\0'])assert.throws(()=>resolveArtifactRoot(invalid));
  assert.throws(()=>parseOptions([...args,'--artifact-root']));
  assert.throws(()=>parseOptions([...args,'--artifact-root',isolated,'--artifact-root',isolated]));
});
test('malformed IDs, unknown overrides and repeated flags fail closed',()=>{assert.throws(()=>parseOptions([...args,'--chain','1']));assert.throws(()=>parseOptions([...args,'--write','--write']));assert.throws(()=>parseOptions(args.slice(0,-1).concat('1')));});
test('series identity is stable and factory-specific',()=>{assert.equal(stableSeriesId(owner),stableSeriesId(owner.toUpperCase().replace('0X','0x')));assert.notEqual(stableSeriesId(owner),stableSeriesId(signer));});
test('journal must match reviewed immutable config and deployment-derived deadline',()=>{const parsed=verifyJournalTerms(journal,artifact,100000);assert.equal(parsed.mintDeadline,186400n);assert.equal(parsed.maxSupply,20n);});
for(const field of ['maxSupply','mintPrice','mintDeadline','prizeBps','affiliatePoolBps','enrollmentSigner']) test(`rejects journal ${field} drift`,()=>{const changed=structuredClone(journal);changed.preflight.config[field]=field==='enrollmentSigner'?owner:'1';assert.throws(()=>verifyJournalTerms(changed,artifact,100000));});
test('rejects unconfirmed, unexpected or wrong-chain journal',()=>{for(const mutate of [j=>j.state='needs-reconciliation',j=>j.preflight.chainId='1',j=>j.transactions[1].state='submitted',j=>j.transactions.push({action:'activate-sale',state:'confirmed',hash})]){const j=structuredClone(journal);mutate(j);assert.throws(()=>verifyJournalTerms(j,artifact,100000));}});
test('pending activation publishes no fabricated mint, winner or randomness',()=>{const result=snapshotFromValues(values,bigintTerms);assert.equal(result.phase,'pending_activation');assert.equal(result.totalMinted,0);assert.equal(result.winningTokenId,null);assert.equal(result.randomnessWord,null);assert.equal(result.prizeRecipient,null);});
test('zero VRF request ID and random word remain valid when requested/fulfilled',()=>{const result=snapshotFromValues({...values,phase:4n,randomnessRequested:true,randomnessReceived:true,totalMinted:20n,totalMintRevenue:2000000000000000n},bigintTerms);assert.equal(result.randomnessRequestId,'0');assert.equal(result.randomnessWord,'0');});
test('winner requires unique maximum; payout must preserve reviewed prize',()=>{assert.throws(()=>snapshotFromValues({...values,revealed:true,winningTokenId:1n,highestScore:19n},bigintTerms));assert.throws(()=>snapshotFromValues({...values,prizePaid:true},bigintTerms));assert.throws(()=>snapshotFromValues({...values,totalMinted:2n,totalMintRevenue:1n},bigintTerms));});
function receiptProvider(overrides={}) {return {getTransactionReceipt:async()=>({status:1,blockNumber:10,blockHash:hash,...overrides.receipt}),getTransaction:async()=>({chainId:11155111n,from:owner,...overrides.tx}),getBlock:async()=>({hash:overrides.blockHash??hash})};}
test('only confirmed canonical successful receipt from deployer is accepted',async()=>{const entry={hash,blockNumber:10,blockHash:hash};await confirmReceipt(receiptProvider(),entry,11,owner);for(const overrides of [{receipt:{status:0}},{tx:{from:signer}},{tx:{chainId:1n}},{blockHash:'wrong'}])await assert.rejects(confirmReceipt(receiptProvider(overrides),entry,11,owner));await assert.rejects(confirmReceipt(receiptProvider(),entry,9,owner));});
const snapshot={contractVersion:'affiliate-v5',algorithmVersion:'unique-rank-v2',collectionId:args.at(-1),contract:terms,state:snapshotFromValues(values,bigintTerms),round:signer,seriesId:stableSeriesId(owner),blockNumber:20,blockHash:hash,enrollmentEnabled:false};
test('database preview does not issue catalog mutations',async()=>{const queries=[];const client={query:async(sql)=>{queries.push(sql);return{rows:[]}}};const report=await persistCollection(client,snapshot);assert.equal(report.mode,'preview');assert.ok(queries.at(-1)==='ROLLBACK');assert.ok(queries.every(sql=>!/^INSERT|^UPDATE|^DELETE/.test(sql)));});
test('an existing ID from another deployment cannot be relabeled',async()=>{const queries=[];const client={query:async(sql)=>{queries.push(sql);return{rows:sql.includes('SELECT c.*')?[{series_id:'other'}]:[]}}};await assert.rejects(persistCollection(client,snapshot,{write:true}),/refusing to relabel/);assert.equal(queries.at(-1),'ROLLBACK');assert.ok(!queries.some(sql=>sql.startsWith('INSERT')));});
test('mock selection is explicit and excludes chain provenance',async()=>{const queries=[];const client={query:async(sql,args)=>{queries.push({sql,args});return{rows:[]}}};assert.deepEqual(await inspectMockRemoval(client),{catalog:[],history:[]});assert.deepEqual(queries[0].args[0],DEMO_COLLECTION_IDS);assert.deepEqual(queries[1].args[0],DEMO_HISTORY_IDS);assert.match(queries[0].sql,/d.status='undeployed'/);assert.match(queries[0].sql,/d.transaction_hash IS NULL/);assert.match(queries[0].sql,/manekineko_collection_state/);assert.match(queries[1].sql,/h.is_mock=true/);});
test('stale mock removal preview never deletes',async()=>{const client={query:async(sql)=>{assert.ok(!sql.startsWith('DELETE'));return{rows:[]}}};await assert.rejects(removeMockRecords(client,{catalog:[DEMO_COLLECTION_IDS[0]],history:[]}),/changed/);});

test('V6 journal requires its explicit V3 algorithm while V5 rejects that marker',()=>{
  const v6={...artifact,contractVersion:'affiliate-v6',contract:{...config,...appearance,algorithmVersion:'unique-rank-v3'},operations:{...artifact.operations,affiliateEligibilityAddress:owner}};
  const v6Journal={...journal,state:'funded-awaiting-affiliate-registration',preflight:{...journal.preflight,config:{...terms,...appearance,affiliateEligibility:owner}}};
  assert.equal(verifyJournalTerms(v6Journal,v6,100000).maxSupply,20n);
  assert.throws(()=>verifyJournalTerms({...v6Journal,preflight:{...v6Journal.preflight,config:{...terms,...appearance}}},v6,100000),/affiliateEligibility/);
  assert.throws(()=>verifyJournalTerms(v6Journal,{...v6,operations:artifact.operations},100000),/holder-eligibility/);
  assert.throws(()=>verifyJournalTerms(v6Journal,{...v6,operations:{...v6.operations,affiliateEligibilityAddress:signer}},100000),/affiliateEligibility/);
  assert.throws(()=>verifyJournalTerms(journal,{...v6,contractVersion:'affiliate-v5'},100000));
  assert.throws(()=>verifyJournalTerms(journal,{...artifact,contractVersion:'affiliate-v6'},100000));
});
test('V6 journal binds reviewed season identity, exact display names and colors',()=>{
  const v6={...artifact,contractVersion:'affiliate-v6',contract:{...config,...appearance,algorithmVersion:'unique-rank-v3'},operations:{...artifact.operations,affiliateEligibilityAddress:owner}};
  const v6Journal={...journal,state:'funded-awaiting-affiliate-registration',preflight:{...journal.preflight,config:{...terms,...appearance,affiliateEligibility:owner}}};
  for (const changes of [{seasonId:hash},{seasonName:'first season'},{name:'sepolia test'},{collectionColor:'#FFFFFF'},{textColor:'#000000'}]) {
    assert.throws(()=>verifyJournalTerms({...v6Journal,preflight:{...v6Journal.preflight,config:{...v6Journal.preflight.config,...changes}}},v6,100000),/Journal differs/);
  }
});
test('catalog preview rejects mixed or absent algorithm version pairs before insertion',async()=>{
  const client={query:async()=>({rows:[]})};
  await assert.rejects(persistCollection(client,{...snapshot,contractVersion:'affiliate-v6'}),/version pair/);
  await assert.rejects(persistCollection(client,{...snapshot,algorithmVersion:undefined}),/version pair/);
  await assert.rejects(persistCollection(client,{...snapshot,contractVersion:'affiliate-v6',algorithmVersion:'unique-rank-v3'}),/Season ID/);
  const result=await persistCollection(client,{...snapshot,contract:{...snapshot.contract,...appearance},contractVersion:'affiliate-v6',algorithmVersion:'unique-rank-v3'});
  assert.equal(result.mode,'preview');
});

test('V6 archive persistence independently verifies the inverse before any write',async()=>{
  const queries=[];const client={query:async(sql)=>{queries.push(sql);return {rows:[]}}};
  const winner={numbers:[10,15,9,7],code:'40582',score:'20',key:'0x7fe7c3d8b5fe2a4a1b90463986ed0d1378bf9a137a8bd17c4fd1860f628507cb'};
  const current={...snapshot,contract:{...snapshot.contract,...appearance},contractVersion:'affiliate-v6',algorithmVersion:'unique-rank-v3',archive:{status:'completed',winner}};
  assert.equal((await persistCollection(client,current)).mode,'preview');
  for(const override of [{key:hash},{numbers:[1,1,1,20]},{code:'19'},{score:'19'}]) {
    await assert.rejects(persistCollection(client,{...current,archive:{...current.archive,winner:{...winner,...override}}},{write:true}));
  }
  assert.ok(!queries.some(sql=>/^INSERT|^UPDATE|^DELETE/.test(sql)));
});

const v7Config={...config,...appearance,algorithmVersion:'unique-rank-v4',prizeBps:'6000',affiliatePoolBps:'2000',secondPrizeBps:'2000',minAffiliateReferrals:'2',affiliatePayoutCapBps:'3000',saleStartAt:'100900'};
const v7Artifact={...artifact,contractVersion:'affiliate-v7',contract:v7Config,operations:{...artifact.operations,affiliateEligibilityAddress:owner}};
const v7Terms={...terms,...appearance,prizeBps:'6000',affiliatePoolBps:'2000',affiliateEligibility:owner,secondPrizeBps:'2000',minAffiliateReferrals:'2',affiliatePayoutCapBps:'3000',saleStartAt:'100900',mintDeadline:'187300'};
const v7Journal={...journal,version:2,configTimestamp:'100000',state:'funded-awaiting-affiliate-registration',preflight:{...journal.preflight,configTimestamp:'100000',config:v7Terms}};
const v7Snapshot={...snapshot,contractVersion:'affiliate-v7',algorithmVersion:'unique-rank-v4',contract:v7Terms,factory:owner,owner,round:signer,deploymentBlock:10,deploymentTransactionHash:hash,mintDurationSeconds:'86400',deployedAt:'1970-01-02T03:46:40.000Z',archive:null};

test('V7 admission binds version 2 journal, both prizes, referral threshold, cap and fixed opening',()=>{
  const parsed=verifyJournalTerms(v7Journal,v7Artifact,100000);
  assert.equal(parsed.saleStartAt,100900n);assert.equal(parsed.mintDeadline,187300n);assert.equal(parsed.secondPrizeBps,2000n);
  for(const field of ['secondPrizeBps','minAffiliateReferrals','affiliatePayoutCapBps','saleStartAt']) {
    const changed=structuredClone(v7Journal);changed.preflight.config[field]='1';
    assert.throws(()=>verifyJournalTerms(changed,v7Artifact,100000),new RegExp(field));
  }
  assert.throws(()=>verifyJournalTerms({...v7Journal,version:1},v7Artifact,100000),/version 2 journal/);
  assert.throws(()=>verifyJournalTerms({...v7Journal,configTimestamp:'100001'},v7Artifact,100000),/canonical constructor timestamp/);
  assert.throws(()=>verifyJournalTerms(v7Journal,{...v7Artifact,contract:{...v7Config,algorithmVersion:'unique-rank-v3'}},100000),/V7 requires/);
  assert.throws(()=>verifyJournalTerms(v7Journal,{...v7Artifact,operations:artifact.operations},100000),/holder-eligibility/);
});

test('V7 snapshot accepts either independently claimed prize without fabricating a shared recipient',()=>{
  const c={...bigintTerms,prizeBps:6000n,secondPrizeBps:2000n};
  const sold={...values,phase:5n,awardCount:2n,totalMinted:20n,totalMintRevenue:2000000000000000n,revealed:true,winningTokenId:3n,highestScore:20n};
  for(const paid of [0n,400000000000000n,800000000000000n,1200000000000000n]) {
    const result=snapshotFromValues({...sold,prizePaidAmount:paid,prizePaid:paid===1200000000000000n},c);
    assert.equal(result.prizePaidWei,String(paid));assert.equal(result.prizeRecipient,null);assert.equal(result.prizeTransactionHash,null);
  }
  assert.throws(()=>snapshotFromValues({...sold,awardCount:1n},c),/exactly two/);
  assert.throws(()=>snapshotFromValues({...sold,prizePaidAmount:1n},c),/cumulative prize/);
});

test('V7 catalog writes immutable terms and leaves all snapshot and archive ingestion to the indexer',async()=>{
  const queries=[];const client={query:async(sql,args)=>{queries.push({sql,args});return {rows:sql.startsWith('SELECT * FROM manekineko_affiliate_programs')?[{mode:'live',contract_version:'affiliate-v7',max_slots:20,enrollment_signer:signer,affiliate_rates_bps:[]}]:[]};}};
  const result=await persistCollection(client,v7Snapshot,{write:true});
  assert.equal(result.mode,'written');assert.equal(result.statePersistence,'indexer-owned');assert.equal(result.indexingRequired,true);
  const insertion=queries.find(item=>item.sql.startsWith('INSERT INTO manekineko_collections'));
  assert.ok(insertion);assert.match(insertion.sql,/second_prize_bps,min_affiliate_referrals,affiliate_payout_cap_bps,sale_start_at/);
  assert.deepEqual(insertion.args.slice(18),['2000','2','3000','1970-01-02T04:01:40.000Z',null]);
  assert.ok(!queries.some(({sql})=>/^INSERT INTO manekineko_collection_state|^INSERT INTO manekineko_collection_history|^INSERT INTO manekineko_history_winners|^INSERT INTO manekineko_collection_awards/.test(sql)));
  assert.equal(queries.at(-1).sql,'COMMIT');
});

test('V7 rejects legacy archive injection and incomplete immutable terms before writing',async()=>{
  const queries=[];const client={query:async(sql)=>{queries.push(sql);return {rows:[]};}};
  await assert.rejects(persistCollection(client,{...v7Snapshot,archive:{status:'completed',winner:{}}},{write:true}),/normalized awards/);
  for(const field of ['secondPrizeBps','minAffiliateReferrals','affiliatePayoutCapBps','saleStartAt']) {
    const missing=structuredClone(v7Snapshot);delete missing.contract[field];
    await assert.rejects(persistCollection(client,missing,{write:true}),new RegExp(field));
  }
  assert.ok(!queries.some(sql=>/^INSERT|^UPDATE|^DELETE/.test(sql)));
});

test('existing V7 economic and fixed launch terms cannot be relabeled',async()=>{
  const c=v7Snapshot.contract;
  const existing={series_id:v7Snapshot.seriesId,chain_id:11155111,round_id:c.roundId,name:c.name,symbol:c.symbol,max_supply:c.maxSupply,mint_price_wei:c.mintPrice,mint_duration_seconds:'86400',contract_version:'affiliate-v7',prize_bps:c.prizeBps,affiliate_pool_bps:c.affiliatePoolBps,algorithm_version:'unique-rank-v4',randomness_provider:'chainlink-vrf-v2.5',contract_address:signer,factory_address:owner,transaction_hash:hash,deployment_block:10,season_id:c.seasonId,season_name:c.seasonName,collection_color:c.collectionColor,text_color:c.textColor,second_prize_bps:c.secondPrizeBps,min_affiliate_referrals:c.minAffiliateReferrals,affiliate_payout_cap_bps:c.affiliatePayoutCapBps,sale_start_at:new Date('1970-01-02T04:01:40.000Z'),block_number:null};
  for(const field of ['second_prize_bps','min_affiliate_referrals','affiliate_payout_cap_bps','sale_start_at']) {
    const queries=[];const client={query:async(sql)=>{queries.push(sql);return {rows:sql.includes('SELECT c.*')?[{...existing,[field]:field==='sale_start_at'?new Date(0):'1'}]:[]};}};
    await assert.rejects(persistCollection(client,v7Snapshot,{write:true}),new RegExp(field));
    assert.ok(!queries.some(sql=>/^INSERT|^UPDATE|^DELETE/.test(sql)));
  }
});

const {secondPrizeBps:_v7Prize,...v8BaseConfig}=v7Config;
const v8Config={...v8BaseConfig,algorithmVersion:'unique-rank-v5',winnerCount:'6'};
const {secondPrizeBps:_v7Term,...v8BaseTerms}=v7Terms;
const v8Terms={...v8BaseTerms,winnerCount:'6'};
const v8Artifact={...v7Artifact,contractVersion:'affiliate-v8',contract:v8Config};
const v8Journal={...v7Journal,preflight:{...v7Journal.preflight,config:v8Terms}};
const v8Snapshot={...v7Snapshot,contractVersion:'affiliate-v8',algorithmVersion:'unique-rank-v5',contract:v8Terms};

test('V8 admission binds six equal awards and rejects count, allocation, version or schedule drift',()=>{
  const parsed=verifyJournalTerms(v8Journal,v8Artifact,100000);
  assert.equal(parsed.winnerCount,6n);assert.equal(parsed.prizeBps,6000n);assert.equal(parsed.secondPrizeBps,undefined);
  assert.equal(parsed.saleStartAt,100900n);assert.equal(parsed.mintDeadline,187300n);
  for(const field of ['winnerCount','prizeBps','minAffiliateReferrals','affiliatePayoutCapBps','saleStartAt']) {
    const changed=structuredClone(v8Journal);changed.preflight.config[field]='1';
    assert.throws(()=>verifyJournalTerms(changed,v8Artifact,100000),new RegExp(field));
  }
  for(const change of [{winnerCount:'0'},{winnerCount:'11'},{winnerCount:'06'},{winnerCount:'7'},{maxSupply:'5'},{prizeBps:'6001'},{secondPrizeBps:'0'},{algorithmVersion:'unique-rank-v4'}])
    assert.throws(()=>verifyJournalTerms(v8Journal,{...v8Artifact,contract:{...v8Config,...change}},100000));
  assert.throws(()=>verifyJournalTerms({...v8Journal,version:1},v8Artifact,100000),/version 2 journal/);
  assert.throws(()=>verifyJournalTerms({...v8Journal,configTimestamp:'100001'},v8Artifact,100000),/canonical constructor timestamp/);
  assert.throws(()=>verifyJournalTerms(v8Journal,{...v8Artifact,operations:artifact.operations},100000),/holder-eligibility/);
});

test('V8 snapshot handles zero through six independently claimed equal prizes without a shared recipient',()=>{
  const c={...bigintTerms,prizeBps:6000n,winnerCount:6n};
  const sold={...values,phase:5n,awardCount:6n,totalMinted:20n,totalMintRevenue:2000000000000000n,revealed:true,winningTokenId:3n,highestScore:20n};
  for(let paidCount=0n;paidCount<=6n;paidCount++) {
    const paid=200000000000000n*paidCount;
    const result=snapshotFromValues({...sold,prizePaidAmount:paid,prizePaid:paidCount===6n},c);
    assert.equal(result.prizePaidWei,String(paid));assert.equal(result.prizePaid,paidCount===6n);
    assert.equal(result.prizeRecipient,null);assert.equal(result.prizeTransactionHash,null);
  }
  for(const change of [{awardCount:2n},{awardCount:7n},{prizePaidAmount:1n},{prizePaidAmount:1400000000000000n},{prizePaidAmount:-1n},{revealed:false,prizePaidAmount:200000000000000n}])
    assert.throws(()=>snapshotFromValues({...sold,...change},c));
  for(const change of [{winnerCount:7n},{winnerCount:21n},{prizeBps:6001n}])assert.throws(()=>snapshotFromValues(sold,{...c,...change}));
});

test('V8 catalog records winner count with no legacy split and leaves award snapshots to the indexer',async()=>{
  const queries=[];const client={query:async(sql,args)=>{queries.push({sql,args});return {rows:sql.startsWith('SELECT * FROM manekineko_affiliate_programs')?[{mode:'live',contract_version:'affiliate-v8',max_slots:20,enrollment_signer:signer,affiliate_rates_bps:[]}]:[]};}};
  const result=await persistCollection(client,v8Snapshot,{write:true});
  assert.equal(result.statePersistence,'indexer-owned');assert.equal(result.indexingRequired,true);
  const series=queries.find(item=>item.sql.startsWith('INSERT INTO manekineko_series'));
  assert.deepEqual(series.args,[v8Snapshot.seriesId,v8Snapshot.contract.seasonName]);
  const insertion=queries.find(item=>item.sql.startsWith('INSERT INTO manekineko_collections'));
  assert.match(insertion.sql,/sale_start_at,winner_count/);
  assert.deepEqual(insertion.args.slice(18),[null,'2','3000','1970-01-02T04:01:40.000Z','6']);
  assert.ok(!queries.some(({sql})=>/^INSERT INTO manekineko_collection_state|^INSERT INTO manekineko_collection_history|^INSERT INTO manekineko_history_winners|^INSERT INTO manekineko_collection_awards/.test(sql)));
  assert.equal(queries.at(-1).sql,'COMMIT');
});

test('V8 malformed prize terms and legacy archive injection fail before catalog writes',async()=>{
  const queries=[];const client={query:async(sql)=>{queries.push(sql);return {rows:[]};}};
  for(const change of [{winnerCount:undefined},{winnerCount:'0'},{winnerCount:'11'},{winnerCount:'7'},{maxSupply:'5'},{prizeBps:'6001'},{secondPrizeBps:'0'}])
    await assert.rejects(persistCollection(client,{...v8Snapshot,contract:{...v8Terms,...change}},{write:true}));
  await assert.rejects(persistCollection(client,{...v8Snapshot,archive:{status:'completed',winner:{}}},{write:true}),/normalized awards/);
  await assert.rejects(persistCollection(client,{...v8Snapshot,algorithmVersion:'unique-rank-v4'},{write:true}),/version pair/);
  assert.ok(!queries.some(sql=>/^INSERT|^UPDATE|^DELETE/.test(sql)));
});

test('existing V8 winner count cannot be relabeled or replaced by a V7 prize split',async()=>{
  const c=v8Terms;
  const existing={series_id:v8Snapshot.seriesId,chain_id:11155111,round_id:c.roundId,name:c.name,symbol:c.symbol,max_supply:c.maxSupply,mint_price_wei:c.mintPrice,mint_duration_seconds:'86400',contract_version:'affiliate-v8',prize_bps:c.prizeBps,affiliate_pool_bps:c.affiliatePoolBps,algorithm_version:'unique-rank-v5',randomness_provider:'chainlink-vrf-v2.5',contract_address:signer,factory_address:owner,transaction_hash:hash,deployment_block:10,season_id:c.seasonId,season_name:c.seasonName,collection_color:c.collectionColor,text_color:c.textColor,second_prize_bps:null,winner_count:'6',min_affiliate_referrals:c.minAffiliateReferrals,affiliate_payout_cap_bps:c.affiliatePayoutCapBps,sale_start_at:new Date('1970-01-02T04:01:40.000Z'),block_number:null};
  for(const [field,value] of [['winner_count','3'],['second_prize_bps','2000']]) {
    const queries=[];const client={query:async(sql)=>{queries.push(sql);return {rows:sql.includes('SELECT c.*')?[{...existing,[field]:value}]:[]};}};
    await assert.rejects(persistCollection(client,v8Snapshot,{write:true}),new RegExp(field));
    assert.ok(!queries.some(sql=>/^INSERT|^UPDATE|^DELETE/.test(sql)));
  }
});

const v10Config={...v8Config,algorithmVersion:'unique-rank-v6',maxMintsPerWallet:'20'};
const v10Artifact={...v8Artifact,contractVersion:'affiliate-v10',contract:v10Config};
const v10Snapshot={...v8Snapshot,contractVersion:'affiliate-v10',algorithmVersion:'unique-rank-v6'};
test('V10 finalized admission requires its exact algorithm, cap and timestamp-bound terms',()=>{
  const parsed=verifyJournalTerms(v8Journal,v10Artifact,100000);
  assert.equal(parsed.winnerCount,6n);assert.equal(parsed.prizeBps,6000n);
  for(const change of [{algorithmVersion:'unique-rank-v5'},{maxMintsPerWallet:'19'},{maxMintsPerWallet:undefined}])
    assert.throws(()=>verifyJournalTerms(v8Journal,{...v10Artifact,contract:{...v10Config,...change}},100000));
  assert.throws(()=>verifyJournalTerms({...v8Journal,version:1},v10Artifact,100000),/version 2 journal/);
});
test('V10 catalog records permanent-identity version and leaves dynamic award state to canonical indexer',async()=>{
  const queries=[];const client={query:async(sql,args)=>{queries.push({sql,args});return {rows:sql.startsWith('SELECT * FROM manekineko_affiliate_programs')?[{mode:'live',contract_version:'affiliate-v10',max_slots:20,enrollment_signer:signer,affiliate_rates_bps:[]}]:[]};}};
  const result=await persistCollection(client,v10Snapshot,{write:true});
  assert.equal(result.statePersistence,'indexer-owned');
  const insertion=queries.find(item=>item.sql.startsWith('INSERT INTO manekineko_collections'));
  assert.equal(insertion.args[12],'unique-rank-v6');assert.equal(insertion.args[13],'affiliate-v10');
  assert.deepEqual(insertion.args.slice(18),[null,'2','3000','1970-01-02T04:01:40.000Z','6']);
  assert.ok(!queries.some(({sql})=>/^INSERT INTO manekineko_collection_state|^INSERT INTO manekineko_collection_history|^INSERT INTO manekineko_history_winners|^INSERT INTO manekineko_collection_awards/.test(sql)));
});
test('V10 rejects old algorithm and legacy archive before any catalog writes',async()=>{
  const queries=[];const client={query:async(sql)=>{queries.push(sql);return {rows:[]};}};
  await assert.rejects(persistCollection(client,{...v10Snapshot,algorithmVersion:'unique-rank-v5'},{write:true}),/version pair/);
  await assert.rejects(persistCollection(client,{...v10Snapshot,archive:{status:'completed',winner:{}}},{write:true}),/normalized awards/);
  assert.ok(!queries.some(sql=>/^INSERT|^UPDATE|^DELETE/.test(sql)));
});
