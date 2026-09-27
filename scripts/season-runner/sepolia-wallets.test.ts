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
test("first mint funds only the required shortfall from existing operator ETH and journals the transfer", async () => {
  const f = rehearsalFixture(false);
  await assert.rejects(runSepoliaRehearsalStep(f.options, `0x${"12".repeat(20)}`), ChainPendingError);
  assert.equal(f.writes.length, 1);
  const signed = Transaction.from(f.writes[0]); assert.equal(signed.from, f.operator.address); assert.equal(signed.to, f.wallets[0].address);
  assert.equal(signed.value, 20n * 10_000n + 2_500_000n * 100n);
  assert.equal(f.state.journals[f.operator.address].transactions[0].state, "submitted");
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
