import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, stat, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Interface, Transaction, Wallet } from "ethers";
import type { Provider } from "ethers";
import { assertSepolia, ensureSepoliaWallets, runSepoliaRehearsalStep, type SepoliaRehearsalState } from "./sepolia-wallets.ts";
import { ChainPendingError } from "./chain-transactions.ts";

test("encrypted vault creates exactly 50 wallets once, reuses them and rejects wrong keys or public permissions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tincta-vault-test-")), path = join(directory, "wallets.json"), masterKey = "ab".repeat(32);
  try {
    const first = await ensureSepoliaWallets({ chainId: 11155111, path, masterKey, create: true });
    const second = await ensureSepoliaWallets({ chainId: 11155111, path, masterKey, create: true });
    assert.equal(first.length, 50); assert.equal(new Set(first.map(wallet => wallet.address)).size, 50);
    assert.deepEqual(second.map(wallet => wallet.address), first.map(wallet => wallet.address));
    const contents = await readFile(path, "utf8");
    for (const wallet of first) assert.equal(contents.includes(wallet.privateKey.slice(2)), false);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    await assert.rejects(ensureSepoliaWallets({ chainId: 11155111, path, masterKey: "cd".repeat(32) }), /authentication/);
    await chmod(path, 0o644); await assert.rejects(ensureSepoliaWallets({ chainId: 11155111, path, masterKey }), /private regular/);
    await chmod(path, 0o600); await writeFile(path, "");
    await assert.rejects(ensureSepoliaWallets({ chainId: 11155111, path, masterKey, create: true }), /authentication/);
    assert.equal(await readFile(path, "utf8"), "", "An existing damaged vault must never silently create replacement wallets");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("rehearsal refuses Mainnet before creating files, inspecting wallets or accessing a provider", async () => {
  assert.throws(() => assertSepolia(1), /forbidden/);
  await assert.rejects(ensureSepoliaWallets({ chainId: 1, path: "/must-not-write", masterKey: "ab".repeat(32), create: true }), /forbidden/);
  await assert.rejects(runSepoliaRehearsalStep({ chainId: 1 } as never, "unused"), /forbidden/);
});

function rehearsalFixture(funded: boolean, primary = 0n, remaining = 1000n, version = "affiliate-v9", algorithm = "unique-rank-v5") {
  const wallets = Array.from({ length: 50 }, () => new Wallet(Wallet.createRandom().privateKey)), operator = new Wallet(Wallet.createRandom().privateKey);
  const iface = new Interface([
    "function CONTRACT_VERSION() view returns(string)", "function ALGORITHM_VERSION() view returns(string)", "function MAX_MINTS_PER_WALLET() view returns(uint256)",
    "function maxSupply() view returns(uint256)", "function totalMinted() view returns(uint256)", "function mintPrice() view returns(uint256)",
    "function mintedPerWallet(address) view returns(uint256)", "function saleActivated() view returns(bool)", "function mintDeadline() view returns(uint256)",
    "function revealed() view returns(bool)", "function refundsAvailable() view returns(bool)", "function mint(address,uint256) payable",
  ]);
  const state: SepoliaRehearsalState = { journals: {}, refunds: {}, funding: {} }, writes: string[] = [];
  const provider = {
    getNetwork: async () => ({ chainId: 11155111n }), getBlock: async (tag: unknown) => ({ number: tag === "latest" ? 101 : Number(tag), hash: `0x${"ab".repeat(32)}`, timestamp: 100, baseFeePerGas: 10n }),
    getBalance: async (address: string) => address === operator.address || funded ? 10n ** 20n : 0n,
    getFeeData: async () => ({ maxPriorityFeePerGas: 2n }), getTransactionCount: async () => 0,
    getTransactionReceipt: async () => null, getTransaction: async () => null, estimateGas: async () => 100_000n,
    broadcastTransaction: async (raw: string) => { writes.push(raw); return { hash: Transaction.from(raw).hash }; },
    call: async (request: { data: string }) => {
      const parsed = iface.parseTransaction(request)!;
      const values: Record<string, unknown> = { CONTRACT_VERSION: version, ALGORITHM_VERSION: algorithm, MAX_MINTS_PER_WALLET: 20n, maxSupply: 1000n, totalMinted: 1000n - remaining, mintPrice: 10_000n, mintedPerWallet: primary, saleActivated: true, mintDeadline: 1000n, revealed: false, refundsAvailable: false };
      return iface.encodeFunctionResult(parsed.name, [values[parsed.name]]);
    },
  } as unknown as Provider;
  return { state, writes, wallets, operator, iface, options: { chainId: 11155111, provider, operator, wallets, execute: true, state, saveState: async () => {}, maxFeePerGasWei: "100", maxTotalSpendWei: String(10n ** 21n), confirmations: 2 } };
}

function manualFixture() {
  const f = rehearsalFixture(true, 0n, 1000n, "affiliate-v10", "unique-rank-v6"), round = `0x${"12".repeat(20)}`;
  const iface = new Interface([...f.iface.fragments,
    "function saleStartAt() view returns(uint256)", "function affiliateIdOf(address) view returns(uint256)", "function affiliateWallet(uint256) view returns(address)",
    "function affiliateAccrued(uint256) view returns(uint256)", "function affiliateEqualShare() view returns(uint256)", "function affiliateQualifiedCount() view returns(uint256)", "function affiliatePoolAmount() view returns(uint256)", "function affiliateClaimed(uint256) view returns(uint256)",
    "function awardCount() view returns(uint256)", "function prizeClaimed(uint256) view returns(bool)", "function winningTokenIds(uint256) view returns(uint256)", "function ownerOf(uint256) view returns(address)",
    "function mintWithAffiliate(address,uint256,uint256) payable", "function claimPrizeForRank(uint256,address)",
    "event AffiliateReferralRecorded(uint256 indexed id,address indexed payer,address indexed recipient,uint256 firstTokenId,uint256 quantity)",
  ]);
  const control = { enrolled: false, manualMints: false, revealed: false, paid: false, commissionPaid: false, transferred: false, wrongReferral: false };
  const provider = f.options.provider as any, original = provider.call;
  provider.call = async (request: { data: string }) => {
    const call = iface.parseTransaction(request)!;
    const values: Record<string, unknown> = { saleStartAt: 0n, mintDeadline: 86400n, affiliateIdOf: control.enrolled ? 1n : 0n, affiliateWallet: f.wallets[0].address,
      affiliateAccrued: 1000n, affiliateEqualShare: 1000n, affiliateQualifiedCount: 1n, affiliatePoolAmount: 2000n, affiliateClaimed: control.commissionPaid ? 1000n : 0n,
      awardCount: 1n, prizeClaimed: control.paid, winningTokenIds: 42n, ownerOf: f.wallets[control.transferred ? 3 : 2].address,
      revealed: control.revealed, totalMinted: control.revealed ? 1000n : control.manualMints ? 40n : 0n,
      mintedPerWallet: control.revealed ? 20n : control.manualMints && call.args.length > 0 && [f.wallets[0].address, f.wallets[1].address].includes(call.args[0]) ? 20n : 0n };
    return call.name in values ? iface.encodeFunctionResult(call.name, [values[call.name]]) : original(request);
  };
  provider.provider = provider;
  provider.getLogs = async () => {
    const log = iface.encodeEventLog(iface.getEvent("AffiliateReferralRecorded")!, [1n, f.wallets[1].address, f.wallets[1].address, 1n, control.wrongReferral ? 1n : 20n]);
    return [{ ...log, address: round, blockNumber: 100, blockHash: `0x${"ab".repeat(32)}`, transactionHash: `0x${"cd".repeat(32)}`, transactionIndex: 0, index: 1, removed: false }];
  };
  const scenario = { kind: "manual-affiliate-sellout" as const, chainId: 11155111 as const, collectionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", affiliateWallet: f.wallets[0].address, buyerWallet: f.wallets[1].address, manualMintsPerWallet: 20 as const, expectedOutcome: "manual-prize-and-commission-claimed" as const, maxFeePerGasWei: f.options.maxFeePerGasWei, maxTotalSpendWei: f.options.maxTotalSpendWei };
  return { ...f, control, iface, round, options: { ...f.options, scenario } };
}

test("manual roles persist before purchases, wait for actual enrollment and buyer referral, and bots never sign with either role", async () => {
  const f = manualFixture();
  assert.equal((await runSepoliaRehearsalStep(f.options, f.round)).action, "manual-checkpoint");
  assert.equal(f.state.manual![f.round].checkpoint, "awaiting-enrollment"); assert.equal(f.writes.length, 0);
  const resumed = structuredClone(f.state); f.options.state = resumed;
  f.control.enrolled = true;
  assert.equal((await runSepoliaRehearsalStep(f.options, f.round)).action, "manual-checkpoint");
  assert.equal(resumed.manual![f.round].checkpoint, "awaiting-manual-mints");
  f.control.manualMints = true;
  await assert.rejects(runSepoliaRehearsalStep(f.options, f.round), ChainPendingError);
  const tx = Transaction.from(f.writes[0]), call = f.iface.parseTransaction(tx)!;
  assert.equal(tx.from, f.wallets[2].address); assert.equal(call.name, "mintWithAffiliate"); assert.equal(call.args[2], 1n);
  assert.equal(resumed.manual![f.round].referralReceipts?.[0].quantity, "20");
  assert.equal(resumed.journals[f.wallets[0].address], undefined); assert.equal(resumed.journals[f.wallets[1].address], undefined);
});

test("manual post-draw winner reservation survives restart, holds unpaid rights and waits for both explicit claims", async () => {
  const f = manualFixture(); await runSepoliaRehearsalStep(f.options, f.round);
  Object.assign(f.control, { enrolled: true, manualMints: true, revealed: true });
  const result = await runSepoliaRehearsalStep(f.options, f.round);
  assert.equal(result.action, "manual-checkpoint"); assert.equal(f.writes.length, 0);
  const saved = f.state.manual![f.round]; assert.equal(saved.winner?.address, f.wallets[2].address); assert.equal(saved.winner?.tokenId, "42");
  f.options.state = structuredClone(f.state);
  await runSepoliaRehearsalStep(f.options, f.round); assert.equal(f.writes.length, 0);
  f.control.transferred = true; await assert.rejects(runSepoliaRehearsalStep(f.options, f.round), /manual_winning_ticket_owner_changed/);
  f.control.paid = true;
  assert.equal((await runSepoliaRehearsalStep(f.options, f.round)).action, "manual-checkpoint");
  f.control.commissionPaid = true;
  assert.equal((await runSepoliaRehearsalStep(f.options, f.round)).action, "settled");
  assert.equal(f.options.state.manual![f.round].checkpoint, "complete"); assert.equal(f.writes.length, 0);
});

test("one manual referral unlocks bot-paid gifts without consuming either reserved signer or exceeding twenty recipients' mints", async () => {
  const f=manualFixture(),options={...f.options,scenario:{...f.options.scenario,manualMintPlan:"one-referral-then-gifts" as const}};
  await runSepoliaRehearsalStep(options,f.round);
  f.control.enrolled=true;f.control.wrongReferral=true; // Fixture emits exactly one genuine buyer referral.
  const provider=options.provider as any,original=provider.call,receipts=new Map<string,any>();
  let affiliateMints=0n,buyerMints=1n;
  provider.call=async(request:any)=>{const call=f.iface.parseTransaction(request)!;
    if(call.name==="mintedPerWallet")return f.iface.encodeFunctionResult(call.name,[call.args[0]===f.wallets[0].address?affiliateMints:call.args[0]===f.wallets[1].address?buyerMints:0n]);
    if(call.name==="totalMinted")return f.iface.encodeFunctionResult(call.name,[affiliateMints+buyerMints]);
    return original(request);
  };
  provider.getTransactionReceipt=async(hash:string)=>receipts.get(hash)??null;
  provider.getTransactionCount=async()=>receipts.size;
  for(const [recipient,quantity] of [[f.wallets[0].address,20n],[f.wallets[1].address,19n]] as const){
    await assert.rejects(runSepoliaRehearsalStep(options,f.round),ChainPendingError);
    const tx=Transaction.from(f.writes.at(-1)!),call=f.iface.parseTransaction(tx)!;
    assert.equal(tx.from,f.wallets[2].address);assert.equal(call.name,"mint");assert.equal(call.args[0],recipient);assert.equal(call.args[1],quantity);
    assert.equal(tx.value,quantity*10000n);
    receipts.set(tx.hash!,{hash:tx.hash,status:1,from:tx.from,to:tx.to,blockNumber:100,blockHash:`0x${"ab".repeat(32)}`,gasUsed:100000n,gasPrice:22n});
    if(recipient===f.wallets[0].address)affiliateMints=20n;else buyerMints=20n;
    assert.equal((await runSepoliaRehearsalStep(options,f.round)).action,"reconciled");
  }
  assert.equal(f.state.manual![f.round].referralReceipts?.[0].quantity,"1");
  await assert.rejects(runSepoliaRehearsalStep(options,f.round),ChainPendingError);
  const normal=f.iface.parseTransaction(Transaction.from(f.writes.at(-1)!))!;
  assert.equal(normal.name,"mintWithAffiliate");assert.equal(normal.args[0],f.wallets[2].address);assert.equal(normal.args[1],20n);
  assert.equal(f.state.journals[f.wallets[0].address],undefined);assert.equal(f.state.journals[f.wallets[1].address],undefined);
});

test("manual rehearsal fails closed for wrong referral, attaching after purchases, changed roles or recycling", async () => {
  const f = manualFixture();
  await assert.rejects(runSepoliaRehearsalStep({ ...f.options, recycleOperatorFunds: true }, f.round), /unrecycled/);
  f.control.manualMints = true;
  await assert.rejects(runSepoliaRehearsalStep(f.options, f.round), /precede_purchases/);
  f.control.manualMints = false; await runSepoliaRehearsalStep(f.options, f.round);
  await assert.rejects(runSepoliaRehearsalStep({ ...f.options, scenario: undefined }, f.round), /original_scenario/);
  Object.assign(f.control, { enrolled: true, manualMints: true, wrongReferral: true });
  await assert.rejects(runSepoliaRehearsalStep(f.options, f.round), /verified_affiliate_link/); assert.equal(f.writes.length, 0);
});
test("first mint funds only the required shortfall from existing operator ETH and journals the transfer", async () => {
  const f = rehearsalFixture(false);
  await assert.rejects(runSepoliaRehearsalStep(f.options, `0x${"12".repeat(20)}`), ChainPendingError);
  assert.equal(f.writes.length, 1);
  const signed = Transaction.from(f.writes[0]); assert.equal(signed.from, f.operator.address); assert.equal(signed.to, f.wallets[0].address);
  assert.equal(signed.value, 20n * 10_000n + 2_500_000n * 100n);
  assert.equal(f.state.journals[f.operator.address].transactions[0].state, "submitted");
});
test("explicit prize settlement signs as the winning holder and pays only the actual operator", async () => {
  for (const mode of ["valid", "unrevealed", "wrong-owner"] as const) {
    const f = rehearsalFixture(true, 20n, 0n, "affiliate-v10", "unique-rank-v6");
    const iface = new Interface([...f.iface.fragments, "function owner() view returns(address)", "function awardCount() view returns(uint256)", "function prizeClaimed(uint256) view returns(bool)", "function winningTokenIds(uint256) view returns(uint256)", "function ownerOf(uint256) view returns(address)", "function claimPrizeForRank(uint256,address)"]);
    const provider = f.options.provider as any, original = provider.call;
    provider.call = async (request: { data: string }) => {
      const call = iface.parseTransaction(request)!;
      const values: Record<string, unknown> = { revealed: mode !== "unrevealed", owner: mode === "wrong-owner" ? f.wallets[1].address : f.operator.address, awardCount: 1n, prizeClaimed: false, winningTokenIds: 208n, ownerOf: f.wallets[0].address };
      return call.name in values ? iface.encodeFunctionResult(call.name, [values[call.name]]) : original(request);
    };
    await assert.rejects(runSepoliaRehearsalStep({ ...f.options, settlePrizesToOperator: true }, `0x${"12".repeat(20)}`), mode === "valid" ? ChainPendingError : /prize_settlement_requires_revealed_owned_round/);
    if (mode !== "valid") { assert.equal(f.writes.length, 0); continue; }
    const tx = Transaction.from(f.writes[0]), call = iface.parseTransaction(tx)!;
    assert.equal(tx.from, f.wallets[0].address); assert.equal(tx.value, 0n); assert.equal(call.name, "claimPrizeForRank"); assert.equal(call.args[0], 1n); assert.equal(call.args[1], f.operator.address);
  }
});
test("mint step uses existing balances, respects prior primary mints and remaining collection supply", async () => {
  for (const [primary, remaining, expected] of [[0n, 1000n, 20n], [19n, 900n, 1n], [0n, 7n, 7n]]) {
    const f = rehearsalFixture(true, primary, remaining);
    await assert.rejects(runSepoliaRehearsalStep(f.options, `0x${"12".repeat(20)}`), ChainPendingError);
    assert.equal(f.writes.length, 1); assert.equal(Object.keys(f.state.funding).length, 0);
    const signed = Transaction.from(f.writes[0]), call = f.iface.parseTransaction(signed)!;
    assert.equal(signed.from, f.wallets[0].address); assert.equal(call.name, "mint"); assert.equal(call.args[0], f.wallets[0].address); assert.equal(call.args[1], expected); assert.equal(signed.value, expected * 10_000n);
  }
});

test("V10 rehearsal mints with its exact algorithm and never accepts a relabeled V9 draw", async () => {
  const valid = rehearsalFixture(true, 19n, 900n, "affiliate-v10", "unique-rank-v6");
  await assert.rejects(runSepoliaRehearsalStep(valid.options, `0x${"12".repeat(20)}`), ChainPendingError);
  const minted = valid.iface.parseTransaction(Transaction.from(valid.writes[0]))!;
  assert.equal(minted.name, "mint"); assert.equal(minted.args[1], 1n);
  const invalid = rehearsalFixture(true, 0n, 1000n, "affiliate-v10", "unique-rank-v5");
  await assert.rejects(runSepoliaRehearsalStep(invalid.options, `0x${"12".repeat(20)}`), /exact draw algorithm/);
  assert.equal(invalid.writes.length, 0);
});

test("refund scenario survives restart after each signed mint, stops at three and reconciles every refund burn",async()=>{
  const f=rehearsalFixture(true,0n,1000n,"affiliate-v10","unique-rank-v6");
  const scenario={kind:"refund-3-30m" as const,chainId:11155111 as const,collectionId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",mintTarget:3 as const,durationSeconds:1800 as const,expectedOutcome:"unsold/refundable" as const,maxTotalSpendWei:f.options.maxTotalSpendWei,maxFeePerGasWei:f.options.maxFeePerGasWei};
  const iface=new Interface([...f.iface.fragments,"function saleStartAt() view returns(uint256)","function randomnessRequested() view returns(bool)","function totalAffiliateAccrued() view returns(uint256)","function totalRefunded() view returns(uint256)","function ownerOf(uint256) view returns(address)","function refund(uint256,address)","error ERC721NonexistentToken(uint256)"]);
  const round=`0x${"12".repeat(20)}`,hash=`0x${"ab".repeat(32)}`,primary=new Map<string,bigint>(),owners=new Map<number,string>(),receipts=new Map<string,any>();let minted=0n,refunded=0n,expired=false;
  const provider=f.options.provider as any;
  provider.getBlock=async(tag:unknown)=>({number:tag==="latest"?101:Number(tag),hash,timestamp:expired?1910:100,baseFeePerGas:10n});
  provider.getTransactionCount=async(address:string)=>[...receipts.values()].filter(r=>r.from===address).length;
  provider.getTransactionReceipt=async(hash:string)=>receipts.get(hash)??null;
  provider.call=async(request:{data:string})=>{
    const call=iface.parseTransaction(request)!;
    if(call.name==="ownerOf"&&!owners.has(Number(call.args[0])))throw Object.assign(new Error("burned"),{data:iface.encodeErrorResult("ERC721NonexistentToken",[call.args[0]])});
    const values:Record<string,unknown>={CONTRACT_VERSION:"affiliate-v10",ALGORITHM_VERSION:"unique-rank-v6",MAX_MINTS_PER_WALLET:20n,maxSupply:1000n,totalMinted:minted,mintPrice:10000n,mintedPerWallet:primary.get(String(call.args.length?call.args[0]:""))??0n,saleActivated:true,mintDeadline:1900n,saleStartAt:100n,revealed:false,refundsAvailable:expired,randomnessRequested:false,totalAffiliateAccrued:0n,totalRefunded:refunded,ownerOf:owners.get(Number(call.args.length?call.args[0]:0))};
    return iface.encodeFunctionResult(call.name,[values[call.name]]);
  };
  function confirm(){const tx=Transaction.from(f.writes.at(-1)!),call=iface.parseTransaction(tx)!;receipts.set(tx.hash!,{hash:tx.hash,status:1,from:tx.from,to:tx.to,blockNumber:100,blockHash:hash,gasUsed:100000n,gasPrice:22n});
    if(call.name==="mint"){assert.equal(call.args[1],1n);primary.set(tx.from!,1n);owners.set(Number(++minted),String(call.args[0]));}
    else{assert.equal(call.name,"refund");owners.delete(Number(call.args[0]));refunded+=10000n;}
  }
  for(let i=0;i<3;i++){
    await assert.rejects(runSepoliaRehearsalStep({...f.options,scenario},round),ChainPendingError);assert.equal(f.writes.length,i+1);confirm();
    assert.equal((await runSepoliaRehearsalStep({...f.options,scenario},round)).action,"reconciled");
  }
  assert.equal((await runSepoliaRehearsalStep({...f.options,scenario},round)).action,"waiting-for-refund-expiry");assert.equal(f.writes.length,3);
  expired=true;
  for(let i=0;i<3;i++){
    await assert.rejects(runSepoliaRehearsalStep({...f.options,scenario},round),ChainPendingError);confirm();
    await runSepoliaRehearsalStep({...f.options,scenario},round);
  }
  assert.equal((await runSepoliaRehearsalStep({...f.options,scenario},round)).action,"refunded");
  assert.equal(f.writes.length,6);assert.equal(owners.size,0);assert.equal(refunded,30000n);
  assert.deepEqual(f.state.scenarios![round].verifiedRefunds,[1,2,3]);
  assert.equal((await runSepoliaRehearsalStep({...f.options,scenario},round)).action,"refunded");assert.equal(f.writes.length,6);
});

test("affiliate scenario requires real enrollment, signs paid referrals and claims from the enrolled wallet", async () => {
  for (const mode of ["unenrolled", "referral", "commission"] as const) {
    const f = rehearsalFixture(true, 0n, mode === "commission" ? 0n : 1000n, "affiliate-v10", "unique-rank-v6");
    const affiliate = f.wallets[1];
    const scenario = { kind: "affiliate-sellout" as const, chainId: 11155111 as const, collectionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", affiliateWallet: affiliate.address, affiliateId: 7, expectedOutcome: "soldout/commission-claimed" as const, maxTotalSpendWei: f.options.maxTotalSpendWei, maxFeePerGasWei: f.options.maxFeePerGasWei };
    const iface = new Interface([...f.iface.fragments,
      "function affiliateWallet(uint256) view returns(address)", "function affiliateMinimumReferrals() view returns(uint256)",
      "function affiliateAccrued(uint256) view returns(uint256)", "function affiliateEqualShare() view returns(uint256)",
      "function affiliateQualifiedCount() view returns(uint256)", "function affiliatePoolAmount() view returns(uint256)",
      "function affiliateClaimable(uint256) view returns(uint256)", "function mintWithAffiliate(address,uint256,uint256) payable", "function claimAffiliateCommission(address)",
    ]);
    const provider = f.options.provider as any, originalCall = provider.call;
    provider.call = async (request: { data: string }) => {
      const call = iface.parseTransaction(request)!;
      const values: Record<string, unknown> = { affiliateWallet: mode === "unenrolled" ? `0x${"00".repeat(20)}` : affiliate.address, affiliateMinimumReferrals: 1n, affiliateAccrued: 2000n, affiliateEqualShare: 2000n, affiliateQualifiedCount: 1n, affiliatePoolAmount: 2000n, affiliateClaimable: 2000n };
      return call.name in values ? iface.encodeFunctionResult(call.name, [values[call.name]]) : originalCall(request);
    };
    await assert.rejects(runSepoliaRehearsalStep({ ...f.options, scenario }, `0x${"12".repeat(20)}`), mode === "unenrolled" ? /genuine_enrolled_affiliate/ : ChainPendingError);
    if (mode === "unenrolled") { assert.equal(f.writes.length, 0); continue; }
    assert.equal(f.writes.length, 1);
    const signed = Transaction.from(f.writes[0]), call = iface.parseTransaction(signed)!;
    assert.equal(call.name, mode === "referral" ? "mintWithAffiliate" : "claimAffiliateCommission");
    assert.equal(signed.from, mode === "referral" ? f.wallets[0].address : affiliate.address);
    assert.equal(call.args[0], signed.from);
    if (mode === "referral") { assert.equal(call.args[2], 7n); assert.equal(signed.value, 200000n); }
  }
});

test("a later manual-wallet gas shortfall creates a new funding intent instead of replaying a confirmed transfer",async()=>{
 const f=manualFixture(),recipient=f.wallets[0],base=`fund:${f.round}:${recipient.address}:manual-role`;
 const provider=f.options.provider as any,receipts=new Map<string,any>();let balance=0n;
 provider.getBalance=async(a:string)=>a===recipient.address?balance:10n**20n;
 provider.getTransactionReceipt=async(hash:string)=>receipts.get(hash)??null;
 provider.getTransactionCount=async()=>receipts.size;
 await assert.rejects(runSepoliaRehearsalStep(f.options,f.round),ChainPendingError);
 const first=Transaction.from(f.writes[0]);
 receipts.set(first.hash!,{hash:first.hash,status:1,from:first.from,to:first.to,blockNumber:100,blockHash:`0x${"ab".repeat(32)}`,gasUsed:100000n,gasPrice:22n});
 balance=first.value;
 assert.equal((await runSepoliaRehearsalStep(f.options,f.round)).action,"reconciled");
 balance-=1000n; // The human wallet paid an enrollment transaction fee.
 await assert.rejects(runSepoliaRehearsalStep(f.options,f.round),ChainPendingError);
 assert.equal(f.writes.length,2);const topup=Transaction.from(f.writes[1]);assert.equal(topup.to,recipient.address);assert.equal(topup.value,1000n);
 assert(f.state.journals[f.operator.address].transactions.some(t=>t.action===`${base}:topup:1`));
});
