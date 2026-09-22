import test from "node:test";
import assert from "node:assert/strict";
import { Interface, keccak256, ZeroAddress, ZeroHash } from "ethers";
import { buildLegacyCreditChain } from "@manekineko/contract-abi/winner-credit-proof";
import { CREDIT_REGISTRY, createCreditSnapshot, registryConfig, type RpcRead } from "../lib/winner-credits/chain.ts";
import { parseWinnerCreditQuery, registrySupportsCredit, availableLifetimeRewards, winnerCreditKey, type WinnerCreditSource } from "../lib/winner-credits/model.ts";
import { RpcReadReverted, RpcReadUnavailable, createReadRpc, createRpcReadLimiter } from "../lib/affiliates/rpc-read-transport.ts";

const registry = "0x1111111111111111111111111111111111111111";
const factory = "0x2222222222222222222222222222222222222222";
const sourceAddress = "0x3333333333333333333333333333333333333333";
const wallet = "0x4444444444444444444444444444444444444444";
const targetAddress = "0x5555555555555555555555555555555555555555";
const ancestorRegistry = "0x8888888888888888888888888888888888888888";
const previousRegistry = "0x7777777777777777777777777777777777777777";
const other = "0x6666666666666666666666666666666666666666";
const code = "0x6001600055";
const codeHash = keccak256(code);
const blockHash = `0x${"a".repeat(64)}`;
const now = 1_800_000_000;
const source: WinnerCreditSource = { collectionId: "3342c115-3d41-4cb4-be45-fa103178f0ff", name: "Source", chainId:11155111, roundId:"1", contractAddress:sourceAddress, factoryAddress:factory, contractVersion:"affiliate-v6", winningHolder:wallet, tokenId:"3" };
const targetRecord = { ...source, collectionId:"8fa5f8c0-6ef4-47f6-9af3-60b8101c9321", name:"Target", roundId:"2", contractAddress:targetAddress, mintPriceWei:"10000" };
const env = {
  WINNER_CREDITS_ADDRESS_11155111:registry, WINNER_CREDITS_CODEHASH_11155111:codeHash,
  AFFILIATE_TRUSTED_FACTORY_V10_11155111:factory, AFFILIATE_TRUSTED_FACTORY_CODEHASH_V10_11155111:codeHash,
  AFFILIATE_TRUSTED_FACTORY_V8_11155111:factory, AFFILIATE_TRUSTED_FACTORY_CODEHASH_V8_11155111:codeHash,
  AFFILIATE_TRUSTED_FACTORY_V7_11155111:factory, AFFILIATE_TRUSTED_FACTORY_CODEHASH_V7_11155111:codeHash,
  AFFILIATE_TRUSTED_FACTORY_V6_11155111:factory, AFFILIATE_TRUSTED_FACTORY_CODEHASH_V6_11155111:codeHash,
  AFFILIATE_TRUSTED_FACTORY_V5_11155111:factory, AFFILIATE_TRUSTED_FACTORY_CODEHASH_V5_11155111:codeHash,
};
const FACTORY = new Interface(["function rounds(uint256) view returns(address)"]);
const ROUND = new Interface([
  "function CONTRACT_VERSION() view returns(string)","function ALGORITHM_VERSION() view returns(string)","function roundId() view returns(uint256)",
  "function prizePaid() view returns(bool)","function winningHolder() view returns(address)","function prizePaidAt() view returns(uint256)","function winningTokenId() view returns(uint256)",
  "function prizeClaimed(uint256) view returns(bool)", "function awardHolder(uint256) view returns(address)", "function awardPaidAt(uint256) view returns(uint64)", "function awardCount() view returns(uint256)", "function finalizedAt() view returns(uint256)", "function winningTokenIds(uint256) view returns(uint256)", "function saleStartAt() view returns(uint256)",
  "function remainingMints(address) view returns(uint256)", "function mintPrice() view returns(uint256)","function saleActivated() view returns(bool)","function cancelled() view returns(bool)","function mintDeadline() view returns(uint256)","function totalMinted() view returns(uint256)","function maxSupply() view returns(uint256)",
]);
function fixture(options: { version?: string; beneficiary?: string; used?: boolean; registered?: boolean; balance?: bigint; root?: string; wrongHolder?: boolean; wrongFactory?: boolean; stale?: boolean; reorg?: boolean; simulation?: "revert" | "outage"; minted?: bigint; active?: boolean; rewardsOnly?: boolean; registryVersion?: string; redeemedSource?: string; missingLifetimeGetter?: boolean; prior?: boolean; priorUsed?: boolean; ancestorUsed?: boolean; ancestor?: boolean; redeemedRank?: number; awardClaimed?: boolean; awardPaidAt?: bigint; startAt?: bigint; remaining?: bigint; priorVersion?: string; priorSponsor?: bigint; priorRoot?: string } = {}) {
  const calls: Array<{method:string;params:unknown[]}> = [];
  const rpc: RpcRead = async (method, params) => {
    calls.push({method,params});
    if (method === "eth_chainId") return "0xaa36a7";
    if (method === "eth_getBlockByNumber") return { number:"0x100", timestamp:`0x${(now - (options.stale ? 500 : 0)).toString(16)}`, hash: options.reorg && params[0] !== "latest" ? `0x${"b".repeat(64)}` : blockHash };
    assert.deepEqual(params[1],{blockHash,requireCanonical:true},"all state must use the same canonical block hash");
    if (method === "eth_getCode") return code;
    assert.equal(method,"eth_call");
    const tx=params[0] as {to:string;data:string;from?:string};
    const iface=[registry,previousRegistry,ancestorRegistry].includes(tx.to)?CREDIT_REGISTRY:tx.to===factory?FACTORY:ROUND;
    const parsed=iface.parseTransaction({data:tx.data})!;
    const name=parsed.name;
    let values:unknown[];
    if([registry,previousRegistry,ancestorRegistry].includes(tx.to)) {
      const prior = tx.to===previousRegistry, ancestor = tx.to===ancestorRegistry;
      const spentSource = ancestor ? (options.ancestorUsed?sourceAddress:ZeroAddress) : prior ? (options.priorUsed?sourceAddress:ZeroAddress) : options.redeemedSource??(options.used?sourceAddress:ZeroAddress);
      switch(name) {
        case "WINNER_CREDITS_VERSION":values=[ancestor?"winner-credits-v2":prior?(options.priorVersion ?? (options.ancestor?"winner-credits-v3":"winner-credits-v2")):options.registryVersion??"winner-credits-v2"];break;
        case "previousRegistry":values=[ancestor?ZeroAddress:prior?(options.ancestor?ancestorRegistry:ZeroAddress):options.prior?previousRegistry:ZeroAddress];break;
        case "redeemedAwardRank":values=[options.redeemedRank??2];break;
        case "lifetimeRewardUsed":values=[Boolean(options.used||options.priorUsed||options.ancestorUsed||options.redeemedSource)];break;
        case "redeemedSource":if(options.missingLifetimeGetter)throw new RpcReadReverted("0x12345678");values=[spentSource];break;
        case "legacyMerkleRoot":values=[prior ? options.priorRoot ?? options.root ?? ZeroHash : options.root??ZeroHash];break;
        case "totalSponsorBalance":values=[prior ? options.priorSponsor ?? 0n : 0n];break;
        case "approvedFactoryCodeHash":values=[codeHash];break;
        case "collections":values=[factory,parsed.args[0].toLowerCase()===targetAddress?2n:1n,options.registered===false?0n:parsed.args[0].toLowerCase()===targetAddress?2n:1n,BigInt(now-50),codeHash,options.rewardsOnly??false];break;
        case "credits":case "creditsForAward":{
          const isSpent=parsed.args[0].toLowerCase()===spentSource && (parsed.name!=="creditsForAward" || parsed.args[1]===BigInt(options.redeemedRank??2));
          values=[isSpent?wallet:options.beneficiary??ZeroAddress,(options.version==="affiliate-v5"||options.rewardsOnly)?0n:1n,BigInt(now-100),isSpent?targetAddress:ZeroAddress,isSpent?5n:0n];if(name==="creditsForAward")values=[values];break;
        }
        case "sponsorBalance":values=[options.balance??10000n];break;
        case "redeem":case "claimAndRedeem":case "redeemLegacy":case "redeemAward":case "claimAndRedeemAward":
          assert.equal(tx.from,wallet);
          if(options.simulation==="revert")throw new RpcReadReverted("0x12345678");
          if(options.simulation==="outage")throw new RpcReadUnavailable();
          values=[5n];break;
        default:throw new Error(name);
      }
    } else if(tx.to===factory) values=[options.wrongFactory?other:parsed.args[0]===1n?sourceAddress:targetAddress];
    else {
      const target=tx.to===targetAddress;
      const valuesByName:Record<string,unknown>={CONTRACT_VERSION:options.version??"affiliate-v6",remainingMints: options.remaining ?? 20n,ALGORITHM_VERSION:options.version==="affiliate-v10"?"unique-rank-v6":options.version==="affiliate-v5"?"unique-rank-v2":options.version==="affiliate-v8"?"unique-rank-v5":options.version==="affiliate-v7"?"unique-rank-v4":"unique-rank-v3",roundId:target?2n:1n,prizeClaimed:options.awardClaimed??true,awardHolder:options.wrongHolder?other:wallet,awardPaidAt:options.awardPaidAt??BigInt(now-50),awardCount:["affiliate-v8","affiliate-v10"].includes(options.version??"")?6n:2n,finalizedAt:BigInt(now-100),winningTokenIds:["affiliate-v8","affiliate-v10"].includes(options.version??"")?BigInt(parsed.args.length?parsed.args[0]:1)+2n:parsed.args.length>0&&parsed.args[0]===2n?9n:3n,saleStartAt:options.startAt??BigInt(now-10),prizePaid:true,winningHolder:options.wrongHolder?other:wallet,prizePaidAt:BigInt(now-100),winningTokenId:3n,mintPrice:10000n,saleActivated:options.active??true,cancelled:false,mintDeadline:BigInt(now+100),totalMinted:options.minted??5n,maxSupply:20n};
      values=[valuesByName[name]];
    }
    return iface.encodeFunctionResult(name,values);
  };
  return {rpc,calls};
}
const manifest={schemaVersion:1 as const,chains:[]};

test("winner query rejects malformed/zero addresses, UUIDs and pagination",()=>{
  assert.equal(parseWinnerCreditQuery(new URLSearchParams({wallet})).wallet,wallet);
  const invalidQueries: Record<string,string>[] = [{wallet:ZeroAddress},{wallet:"bad"},{wallet,collectionId:"not-a-uuid"},{wallet,page:"0"},{wallet,page:"1.5"},{wallet,page:"1000000"}];
  for(const query of invalidQueries) assert.throws(()=>parseWinnerCreditQuery(new URLSearchParams(query)));
});
test("registry configuration is absent or a strict address/hash pair",()=>{
  assert.equal(registryConfig(11155111,{}),null);
  assert.throws(()=>registryConfig(11155111,{WINNER_CREDITS_ADDRESS_11155111:registry}));
  assert.throws(()=>registryConfig(11155111,{...env,WINNER_CREDITS_CODEHASH_11155111:ZeroHash}));
});
test("native credit belongs to settled holder, is simulated from that wallet, and is canonical",async()=>{
  const {rpc,calls}=fixture();const snapshot=await createCreditSnapshot(11155111,env,rpc,now*1000);
  const credit=await snapshot.credit(source,wallet,manifest);
  assert.equal(credit.available,true);assert.equal(credit.claimed,false);
  const target=await snapshot.target(targetRecord);assert.equal(target.ready,true);
  assert.equal((await snapshot.forTarget(credit,target,wallet)).available,true);
  await snapshot.assertCanonical();
  assert.ok(calls.some(({method,params})=>method==="eth_call"&&(params[0] as {from?:string}).from===wallet));
});
test("credits are not transferable and used credits never become available",async()=>{
  const f=fixture({beneficiary:wallet,used:true});const snapshot=await createCreditSnapshot(11155111,env,f.rpc,now*1000);
  const credit=await snapshot.credit(source,wallet,manifest);assert.equal(credit.used,true);assert.equal(credit.available,false);assert.equal(credit.redeemedTokenId,"5");
  const mismatch=fixture({beneficiary:other});const wrong=await createCreditSnapshot(11155111,env,mismatch.rpc,now*1000);
  await assert.rejects(wrong.credit(source,wallet,manifest),/beneficiary/);
  const holder=fixture({wrongHolder:true});const wrongHolder=await createCreditSnapshot(11155111,env,holder.rpc,now*1000);
  await assert.rejects(wrongHolder.credit(source,wallet,manifest),/holder/);
});
test("wrong factories, stale data, changed canonical block and codehash mismatch fail closed",async()=>{
  const stale=fixture({stale:true});await assert.rejects(createCreditSnapshot(11155111,env,stale.rpc,now*1000),/stale/);
  const normal=fixture();await assert.rejects(createCreditSnapshot(11155111,{...env,WINNER_CREDITS_CODEHASH_11155111:`0x${"b".repeat(64)}`},normal.rpc,now*1000),/deployment/);
  const wrong=fixture({wrongFactory:true});const snapshot=await createCreditSnapshot(11155111,env,wrong.rpc,now*1000);await assert.rejects(snapshot.credit(source,wallet,manifest),/provenance/);
  const reorganized=await createCreditSnapshot(11155111,env,fixture({reorg:true}).rpc,now*1000);await assert.rejects(reorganized.assertCanonical(),/Ethereum changed/);
});
test("no registration, sponsorship, active sale or supply means no redemption",async()=>{
  for(const options of [{registered:false},{balance:9999n},{active:false},{minted:20n}]){
    const snapshot=await createCreditSnapshot(11155111,env,fixture(options).rpc,now*1000);
    const target=await snapshot.target(targetRecord);assert.equal(target.ready,false);assert.ok(target.reason);
  }
});
test("contract denial is unavailable eligibility but provider failure must be an error",async()=>{
  for(const simulation of ["revert","outage"] as const){
    const snapshot=await createCreditSnapshot(11155111,env,fixture({simulation}).rpc,now*1000);
    const credit=await snapshot.credit(source,wallet,manifest),target=await snapshot.target(targetRecord);
    if(simulation==="revert")assert.equal((await snapshot.forTarget(credit,target,wallet)).available,false);
    else await assert.rejects(snapshot.forTarget(credit,target,wallet),RpcReadUnavailable);
  }
});
test("legacy evidence must match root, source, holder, token, settlement and network",async()=>{
  const chain=buildLegacyCreditChain(11155111,[{sourceRound:sourceAddress,holder:wallet,tokenId:"3",paidAt:String(now-100),transactionHash:`0x${"c".repeat(64)}`}]);
  const snapshot=await createCreditSnapshot(11155111,env,fixture({version:"affiliate-v5",root:chain.root}).rpc,now*1000);
  const legacy={...source,contractVersion:"affiliate-v5" as const};
  const credit=await snapshot.credit(legacy,wallet,{schemaVersion:1,chains:[chain]});assert.equal(credit.available,true);assert.equal(credit.legacy,true);
  assert.equal((await snapshot.credit(legacy,wallet,manifest)).available,false);
  await assert.rejects(snapshot.credit({...legacy,tokenId:"4"},wallet,{schemaVersion:1,chains:[chain]}),/proof/);
  const otherChain={...chain,chainId:1};assert.equal((await snapshot.credit(legacy,wallet,{schemaVersion:1,chains:[otherChain]})).available,false);
});
test("RPC simulation opts into sanitized typed reverts without disguising them as downtime",async()=>{
  const fetcher=(async(_url,init)=>{const request=JSON.parse(String(init?.body));return Response.json({jsonrpc:"2.0",id:request.id,error:{code:3,message:"private provider detail",data:"0x12345678"}});}) as typeof fetch;
  const options={fetch:fetcher,limiter:createRpcReadLimiter({minIntervalMs:0})};
  await assert.rejects(createReadRpc("https://rpc.test",options)("eth_call",[]),RpcReadUnavailable);
  await assert.rejects(createReadRpc("https://rpc.test",{...options,allowCallReverts:true})("eth_call",[]),RpcReadReverted);
});

test("late source registration is offered only after its settled holder is verified",async()=>{
  const snapshot=await createCreditSnapshot(11155111,env,fixture({registered:false}).rpc,now*1000);
  const credit=await snapshot.credit(source,wallet,manifest);assert.equal(credit.available,false);assert.equal(credit.canRegisterSource,true);
  const wrong=await createCreditSnapshot(11155111,env,fixture({registered:false,wrongHolder:true}).rpc,now*1000);
  await assert.rejects(wrong.credit(source,wallet,manifest),/holder/);
});
test("late source-only registrations award credits but cannot accept sponsored mints",async()=>{
  const snapshot=await createCreditSnapshot(11155111,env,fixture({rewardsOnly:true,beneficiary:wallet}).rpc,now*1000);
  assert.equal((await snapshot.credit(source,wallet,manifest)).available,true);
  const target=await snapshot.target(targetRecord);assert.equal(target.ready,false);assert.match(target.reason!,/does not accept/);
});

test("multiple qualifying wins still offer one lifetime reward per network",async()=>{
  const snapshot=await createCreditSnapshot(11155111,env,fixture().rpc,now*1000);
  const first=await snapshot.credit(source,wallet,manifest);
  const another={...first,collectionId:targetRecord.collectionId,contractAddress:other};
  assert.equal(availableLifetimeRewards([first,another]),1);
  assert.equal(availableLifetimeRewards([{...first,available:false},{...another,available:false}]),0);
});
test("a reward spent through an off-page source blocks every other win and late registration",async()=>{
  const f=fixture({redeemedSource:other,registered:false});
  const snapshot=await createCreditSnapshot(11155111,env,f.rpc,now*1000);
  const redemption=await snapshot.walletRedemption(wallet);
  assert.deepEqual(redemption,{sourceRound:other,targetRound:targetAddress,tokenId:"5"});
  const next=await snapshot.credit(source,wallet,manifest);
  assert.equal(next.available,false);assert.equal(next.used,false);assert.equal(next.canRegisterSource,false);
  assert.match(next.reason!,/already used its lifetime/);
  assert.equal(f.calls.filter(call=>call.method==="eth_call"&&CREDIT_REGISTRY.parseTransaction({data:(call.params[0] as {data:string}).data})?.name==="redeemedSource").length,1,"read lifetime status once at the same block, independent of pagination");
});
test("the canonical lifetime getter is mandatory even when no source wins are queried",async()=>{
  const snapshot=await createCreditSnapshot(11155111,env,fixture({missingLifetimeGetter:true}).rpc,now*1000);
  await assert.rejects(snapshot.walletRedemption(wallet));
  await assert.rejects(createCreditSnapshot(11155111,env,fixture({registryVersion:"winner-credits-v1"}).rpc,now*1000),/deployment/);
});


test("V3 discovers both awards independently while exposing only one lifetime reward", async () => {
  const f=fixture({version:"affiliate-v7",registryVersion:"winner-credits-v3"});
  const snapshot=await createCreditSnapshot(11155111,env,f.rpc,now*1000);
  const first=await snapshot.credit({...source,contractVersion:"affiliate-v7",awardRank:1},wallet,manifest);
  const second=await snapshot.credit({...source,contractVersion:"affiliate-v7",awardRank:2,tokenId:"9"},wallet,manifest);
  assert.equal(first.available,true);assert.equal(second.available,true);assert.notEqual(winnerCreditKey(first),winnerCreditKey(second));
  assert.equal(availableLifetimeRewards([first,second]),1);
  const target=await snapshot.target({...targetRecord,contractVersion:"affiliate-v7"});
  assert.equal((await snapshot.forTarget(second,target,wallet)).available,true);
  const simulation=f.calls.find(({method,params})=>method==="eth_call"&&CREDIT_REGISTRY.parseTransaction({data:(params[0] as {data:string}).data})?.name==="claimAndRedeemAward");
  assert.ok(simulation);assert.equal(CREDIT_REGISTRY.parseTransaction({data:(simulation.params[0] as {data:string}).data})!.args[1],2n);
});

test("V3 rank-two redemption blocks rank one without attributing the spent reward to it", async () => {
  const snapshot=await createCreditSnapshot(11155111,env,fixture({version:"affiliate-v7",registryVersion:"winner-credits-v3",used:true,redeemedRank:2}).rpc,now*1000);
  const redemption=await snapshot.walletRedemption(wallet);assert.equal(redemption?.awardRank,2);
  const first=await snapshot.credit({...source,contractVersion:"affiliate-v7",awardRank:1},wallet,manifest);
  const second=await snapshot.credit({...source,contractVersion:"affiliate-v7",awardRank:2,tokenId:"9"},wallet,manifest);
  assert.equal(first.used,false);assert.equal(first.available,false);assert.equal(second.used,true);assert.equal(second.available,false);
});

test("V3 migration verifies the pinned prior registry and never restores spent lifetime credits", async () => {
  const opts={version:"affiliate-v7",registryVersion:"winner-credits-v3",prior:true,priorUsed:true};
  await assert.rejects(createCreditSnapshot(11155111,env,fixture(opts).rpc,now*1000),/independently pinned/);
  const migrationEnv={...env,WINNER_CREDITS_PREVIOUS_ADDRESS_11155111:previousRegistry,WINNER_CREDITS_PREVIOUS_CODEHASH_11155111:codeHash};
  const snapshot=await createCreditSnapshot(11155111,migrationEnv,fixture(opts).rpc,now*1000);
  const redeemed=await snapshot.walletRedemption(wallet);assert.equal(redeemed?.registryAddress,previousRegistry);assert.equal(redeemed?.awardRank,1);
  const credit=await snapshot.credit({...source,contractVersion:"affiliate-v7",awardRank:2,tokenId:"9"},wallet,manifest);
  assert.equal(credit.available,false);assert.match(credit.reason!,/already used its lifetime/);
  await assert.rejects(createCreditSnapshot(11155111,{...migrationEnv,WINNER_CREDITS_PREVIOUS_CODEHASH_11155111:`0x${"d".repeat(64)}`},fixture(opts).rpc,now*1000),/Previous.*deployment/);
});

test("rank-two credits require their own claimed holder, token and chronological settlement", async () => {
  const ranked={...source,contractVersion:"affiliate-v7" as const,awardRank:2,tokenId:"9"};
  for(const options of [{awardClaimed:false},{wrongHolder:true},{awardPaidAt:BigInt(now+1)}]) {
    const snapshot=await createCreditSnapshot(11155111,env,fixture({version:"affiliate-v7",registryVersion:"winner-credits-v3",...options}).rpc,now*1000);
    await assert.rejects(snapshot.credit(ranked,wallet,manifest),/settlement/);
  }
  const snapshot=await createCreditSnapshot(11155111,env,fixture({version:"affiliate-v7",registryVersion:"winner-credits-v3"}).rpc,now*1000);
  await assert.rejects(snapshot.credit({...ranked,tokenId:"3"},wallet,manifest),/settlement/);
  await assert.rejects(snapshot.credit({...ranked,awardRank:3},wallet,manifest),/rank/);
});

test("V2 cannot redeem V7 awards and scheduled V7 targets remain closed until start",async()=>{
  const v2=await createCreditSnapshot(11155111,env,fixture({version:"affiliate-v7"}).rpc,now*1000);
  const credit=await v2.credit({...source,contractVersion:"affiliate-v7",awardRank:2,tokenId:"9"},wallet,manifest);
  assert.equal(credit.available,false);assert.match(credit.reason!,/V3/);
  const v3=await createCreditSnapshot(11155111,env,fixture({version:"affiliate-v7",registryVersion:"winner-credits-v3",startAt:BigInt(now+1)}).rpc,now*1000);
  const target=await v3.target({...targetRecord,contractVersion:"affiliate-v7"});assert.equal(target.ready,false);assert.match(target.reason!,/not opened/);
});


test("V4 verifies all six V8 awards but grants only one lifetime sponsored mint",async()=>{
  const f=fixture({version:"affiliate-v8",registryVersion:"winner-credits-v4"});
  const snapshot=await createCreditSnapshot(11155111,env,f.rpc,now*1000);
  const awards=await Promise.all(Array.from({length:6},(_,i)=>snapshot.credit({...source,contractVersion:"affiliate-v8",awardRank:i+1,tokenId:String(i+3)},wallet,manifest)));
  assert.ok(awards.every(award=>award.available));assert.equal(new Set(awards.map(winnerCreditKey)).size,6);
  assert.equal(availableLifetimeRewards(awards),1);
  const target=await snapshot.target({...targetRecord,contractVersion:"affiliate-v8"});
  assert.equal((await snapshot.forTarget(awards[5],target,wallet)).available,true);
  const simulation=f.calls.find(({method,params})=>method==="eth_call"&&CREDIT_REGISTRY.parseTransaction({data:(params[0] as {data:string}).data})?.name==="claimAndRedeemAward");
  assert.equal(CREDIT_REGISTRY.parseTransaction({data:(simulation!.params[0] as {data:string}).data})!.args[1],6n);
  await assert.rejects(snapshot.credit({...source,contractVersion:"affiliate-v8",awardRank:7,tokenId:"9"},wallet,manifest),/settlement/);
  const old=await createCreditSnapshot(11155111,env,fixture({version:"affiliate-v8",registryVersion:"winner-credits-v3"}).rpc,now*1000);
  assert.match((await old.credit({...source,contractVersion:"affiliate-v8",awardRank:6,tokenId:"8"},wallet,manifest)).reason!,/V4/);
  assert.equal((await old.target({...targetRecord,contractVersion:"affiliate-v8"})).ready,false);
});

test("a V4 rank-six redemption blocks the other five awards",async()=>{
  const snapshot=await createCreditSnapshot(11155111,env,fixture({version:"affiliate-v8",registryVersion:"winner-credits-v4",used:true,redeemedRank:6}).rpc,now*1000);
  assert.equal((await snapshot.walletRedemption(wallet))?.awardRank,6);
  for(let rank=1;rank<=6;rank++) {
    const award=await snapshot.credit({...source,contractVersion:"affiliate-v8",awardRank:rank,tokenId:String(rank+2)},wallet,manifest);
    assert.equal(award.available,false);assert.equal(award.used,rank===6);
  }
});

test("V4 follows independently pinned V3 to V2 lineage without restoring used rewards",async()=>{
  const opts={version:"affiliate-v8",registryVersion:"winner-credits-v4",prior:true,ancestor:true,ancestorUsed:true};
  const priorEnv={...env,WINNER_CREDITS_PREVIOUS_ADDRESS_11155111:previousRegistry,WINNER_CREDITS_PREVIOUS_CODEHASH_11155111:codeHash};
  await assert.rejects(createCreditSnapshot(11155111,priorEnv,fixture(opts).rpc,now*1000),/independently pinned/);
  const lineageEnv={...priorEnv,WINNER_CREDITS_ANCESTOR_ADDRESS_11155111:ancestorRegistry,WINNER_CREDITS_ANCESTOR_CODEHASH_11155111:codeHash};
  const snapshot=await createCreditSnapshot(11155111,lineageEnv,fixture(opts).rpc,now*1000);
  const spent=await snapshot.walletRedemption(wallet);assert.equal(spent?.registryAddress,ancestorRegistry);assert.equal(spent?.awardRank,1);
  const sixth=await snapshot.credit({...source,contractVersion:"affiliate-v8",awardRank:6,tokenId:"8"},wallet,manifest);
  assert.equal(sixth.available,false);assert.match(sixth.reason!,/already used its lifetime/);
  await assert.rejects(createCreditSnapshot(11155111,{...lineageEnv,WINNER_CREDITS_ANCESTOR_CODEHASH_11155111:`0x${"d".repeat(64)}`},fixture(opts).rpc,now*1000),/Previous.*deployment/);
});


test("V10 credits require V6, preserve V5 lifetime use, and check the target wallet allowance",async()=>{
 for (const version of ["winner-credits-v2","winner-credits-v3","winner-credits-v4","winner-credits-v5"]) assert.equal(registrySupportsCredit("affiliate-v10",version),false);
 assert.equal(registrySupportsCredit("affiliate-v10","winner-credits-v6"),true);
 assert.equal(registrySupportsCredit("affiliate-v9","winner-credits-v6"),true);
 const record={...source,contractVersion:"affiliate-v10" as const,awardRank:6,tokenId:"8"};
 const f=fixture({version:"affiliate-v10",registryVersion:"winner-credits-v6"});
 const current=await createCreditSnapshot(11155111,env,f.rpc,now*1000);
 const credit=await current.credit(record,wallet,manifest), target=await current.target({...targetRecord,contractVersion:"affiliate-v10"});
 assert.equal(credit.available,true); assert.equal(target.ready,true); assert.equal((await current.forTarget(credit,target,wallet)).available,true);
 const capped=await createCreditSnapshot(11155111,env,fixture({version:"affiliate-v10",registryVersion:"winner-credits-v6",remaining:0n}).rpc,now*1000);
 assert.match((await capped.forTarget(credit,target,wallet)).reason!,/20 mints/);
 const migrationEnv={...env,WINNER_CREDITS_PREVIOUS_ADDRESS_11155111:previousRegistry,WINNER_CREDITS_PREVIOUS_CODEHASH_11155111:codeHash};
 const options={version:"affiliate-v10",registryVersion:"winner-credits-v6",prior:true,priorVersion:"winner-credits-v5",priorUsed:true,redeemedRank:6};
 const migrated=await createCreditSnapshot(11155111,migrationEnv,fixture(options).rpc,now*1000);
 assert.equal((await migrated.walletRedemption(wallet))?.registryAddress,previousRegistry);
 assert.equal((await migrated.credit(record,wallet,manifest)).available,false);
 for (const change of [{priorSponsor:1n},{priorRoot:`0x${"b".repeat(64)}`}]) await assert.rejects(createCreditSnapshot(11155111,migrationEnv,fixture({...options,...change}).rpc,now*1000),/historical proofs/);
 await assert.rejects(createCreditSnapshot(11155111,env,fixture(options).rpc,now*1000),/independently pinned/);
});

test("V6 verifies all four independently pinned ancestors without truncating lifetime history",async()=>{
 const addresses=[registry,previousRegistry,ancestorRegistry,other,"0x9999999999999999999999999999999999999999"];
 const pins:Record<string,string>={...env};
 for(let i=1;i<5;i++) {
  const label=i===1?"PREVIOUS":i===2?"ANCESTOR":`ANCESTOR_${i-1}`;
  pins[`WINNER_CREDITS_${label}_ADDRESS_11155111`]=addresses[i];pins[`WINNER_CREDITS_${label}_CODEHASH_11155111`]=codeHash;
 }
 const rpc:RpcRead=async(method,params)=>{
  if(method==="eth_chainId")return "0xaa36a7";
  if(method==="eth_getBlockByNumber")return {number:"0x100",timestamp:`0x${now.toString(16)}`,hash:blockHash};
  if(method==="eth_getCode")return code;
  const tx=params[0] as {to:string;data:string}, index=addresses.indexOf(tx.to), call=CREDIT_REGISTRY.parseTransaction({data:tx.data})!;
  assert.ok(index>=0);
  const answers:Record<string,unknown[]>={WINNER_CREDITS_VERSION:[`winner-credits-v${6-index}`],previousRegistry:[addresses[index+1]??ZeroAddress],legacyMerkleRoot:[ZeroHash],totalSponsorBalance:[0n],redeemedSource:[index===4?sourceAddress:ZeroAddress],lifetimeRewardUsed:[true],credits:[wallet,0n,BigInt(now-100),targetAddress,5n]};
  return CREDIT_REGISTRY.encodeFunctionResult(call.name,answers[call.name]);
 };
 const snapshot=await createCreditSnapshot(11155111,pins,rpc,now*1000);
 assert.equal((await snapshot.walletRedemption(wallet))?.registryAddress,addresses[4]);
 const missing={...pins};delete missing.WINNER_CREDITS_ANCESTOR_3_CODEHASH_11155111;
 await assert.rejects(createCreditSnapshot(11155111,missing,rpc,now*1000),/independently pinned/);
});
