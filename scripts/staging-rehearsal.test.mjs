import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, stat, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Wallet, Transaction, keccak256 } from "ethers";
import { REHEARSAL_POLICY as P, parseRehearsalArguments, actionIntent, validateJournal, validateProgress, validateScores, validateReceipt, executeStage, iface } from "./run-sepolia-rehearsal.mjs";
import { prepareEntry, reconcileEntry, validateSigned, validateWalletCode, assertWalletCodeAt, safeError, privateStore, withRehearsalLock } from "./staging-rehearsal-journal.mjs";

// Published local fixture keys only; no real staging file or network is opened.
const roles = Object.keys(P.wallets);
const signers = Object.fromEntries(roles.map((role, index) => [role, new Wallet(`0x${String(index + 1).repeat(64)}`)]));
const policy = { ...P, wallets: Object.fromEntries(roles.map(role => [role, signers[role].address])) };
const delegateRuntime = "0x60006000fd";
const delegateDesignator = `0xef0100${P.affiliateDelegation.address.slice(2)}`;
const delegatedPolicy = { ...policy, affiliateDelegation: { ...P.affiliateDelegation, codeHash: keccak256(delegateRuntime),
  wallets: Object.fromEntries(["AFFILIATE_A", "AFFILIATE_B", "AFFILIATE_C"].map(role => [role, policy.wallets[role]])) } };
const blockHash = `0x${"aa".repeat(32)}`;
const ids = { AFFILIATE_A: "1", AFFILIATE_B: "2", AFFILIATE_C: "3" };
const clone = value => structuredClone(value);
function fixture() {
  let journal = null, network = policy.chainId, nonceConflict = false, saveFailure = false, ambiguous = false, beforeBroadcastHook = null;
  let signerLoads = 0, priority = 1_000_000n, missing = false, code = "0x", balance = 1_000_000_000_000_000_000n;
  const entries = new Map(), receipts = new Map(), nonces = Object.fromEntries(roles.map(role => [policy.wallets[role], 0]));
  const state = { blockNumber: 1000, mintDeadline: policy.mintDeadline, timestamp: Number(policy.mintDeadline) - 3600, phase: 0n, saleActivated: false, totalMinted: 0n,
    totalMintRevenue: 0n, totalReferredMints: 0n, totalAffiliateAccrued: 0n, totalAffiliateClaimed: 0n, totalRefunded: 0n, cancelled: false,
    registeredAffiliates: Object.entries(ids).map(([role, id]) => ({ id: BigInt(id), wallet: policy.wallets[role] })), optionalAffiliate: null,
    affiliateCount: 3n, balance: 0n, randomnessRequested: false, randomnessReceived: false, requestId: 0n, revealed: false, drawCounter: 0n,
    drawOffset: 0n, winningTokenId: 0n, highestScore: 0n, prizePaid: false, prizePaidAmount: 0n, prizeRecipient: "0x0000000000000000000000000000000000000000",
    subscriptionClosed: false, vrfNativeBalance: 300_000_000_000_000_000n, withdrawableBalance: 0n, tokenOwners: [],
    affiliates: Object.fromEntries(Object.entries(ids).map(([role, id]) => [role, { id: BigInt(id), wallet: policy.wallets[role], referred: 0n, accrued: 0n, claimed: 0n, claimable: 0n }])) };
  const apply = tx => {
    const parsed = iface.parseTransaction({ data: tx.data, value: tx.value });
    const args = parsed.args;
    if (parsed.name === "activateSale") { state.saleActivated = true; state.phase = 1n; }
    else if (["mint", "mintWithAffiliate"].includes(parsed.name)) {
      for (let i = 0n; i < args.quantity; i++) state.tokenOwners.push({ tokenId: Number(state.totalMinted + i + 1n), owner: args.to });
      state.totalMinted += args.quantity; state.totalMintRevenue += tx.value; state.balance += tx.value;
      if (parsed.name === "mintWithAffiliate") {
        state.totalReferredMints += args.quantity;
        const affiliate = Object.values(state.affiliates).find(item => item.id === args.affiliateId); affiliate.referred += args.quantity;
      }
      if (state.totalMinted === 20n) {
        state.phase = 2n; state.totalAffiliateAccrued = policy.affiliateA + policy.affiliateB;
        state.affiliates.AFFILIATE_A.accrued = state.affiliates.AFFILIATE_A.claimable = policy.affiliateA;
        state.affiliates.AFFILIATE_B.accrued = state.affiliates.AFFILIATE_B.claimable = policy.affiliateB;
      }
    } else if (parsed.name === "requestRandomness") { state.randomnessRequested = true; state.requestId = 99n; state.phase = 3n; }
    else if (parsed.name === "finalizeDraw") {
      state.revealed = true; state.drawCounter++; state.drawOffset = 7n; state.winningTokenId = 13n; state.highestScore = 20n;
      state.scores = state.tokenOwners.map(({ tokenId, owner }) => {
        const score = 1n + ((BigInt(tokenId) - 1n + state.drawOffset) % 20n), n = score - 1n;
        return { tokenId, owner, score, code: n, numbers: [((n >> 12n) & 15n) + 1n, ((n >> 8n) & 15n) + 1n, ((n >> 4n) & 15n) + 1n, (n & 15n) + 1n] };
      }); state.phase = 5n;
    } else if (parsed.name === "distributePrize") {
      state.prizePaid = true; state.prizePaidAmount = policy.prize; state.prizeRecipient = state.scores.find(item => item.tokenId === 13).owner;
      state.balance -= policy.prize; state.withdrawableBalance = policy.operator; state.phase = 6n;
    } else if (parsed.name === "claimAffiliateCommission") {
      const affiliate = Object.values(state.affiliates).find(item => item.wallet === tx.from);
      state.balance -= affiliate.claimable; state.totalAffiliateClaimed += affiliate.claimable;
      affiliate.claimed += affiliate.claimable; affiliate.claimable = 0n;
    } else if (parsed.name === "withdraw") { state.balance -= args.amount; state.withdrawableBalance -= args.amount; }
    else if (parsed.name === "withdrawRandomnessFunding") { state.subscriptionClosed = true; state.vrfNativeBalance = undefined; }
  };
  const provider = {
    send: async method => {
      if (method === "eth_getCode") return code;
      assert.equal(method, "eth_chainId"); return `0x${network.toString(16)}`;
    },
    getBalance: async () => balance,
    getTransactionCount: async address => (nonces[address] ?? 0) + (nonceConflict ? 1 : 0),
    getBlock: async number => ({ number: number === "latest" ? 1000 : number, hash: blockHash, timestamp: Math.floor(Date.now() / 1000), baseFeePerGas: 1_000_000_000n }),
    getFeeData: async () => ({ maxPriorityFeePerGas: priority }),
    call: async () => "0x", estimateGas: async () => 100000n,
    getTransactionReceipt: async hash => missing ? null : receipts.get(hash) ?? null,
    getTransaction: async hash => missing ? null : entries.get(hash) ?? null,
    broadcastTransaction: async raw => {
      const tx = Transaction.from(raw);
      assert.ok(journal?.entries.some(item => item.hash === tx.hash && item.rawTransaction === raw), "signed bytes must be saved before broadcast");
      if (beforeBroadcastHook) await beforeBroadcastHook(tx);
      if (!entries.has(tx.hash)) {
        assert.equal(nonces[tx.from], tx.nonce); nonces[tx.from]++;
        entries.set(tx.hash, tx);
        receipts.set(tx.hash, { hash: tx.hash, from: tx.from, to: tx.to, status: 1, blockNumber: 999, blockHash, gasUsed: 100000n, gasPrice: 1_000_000_000n, logs: [] }); apply(tx);
      }
      if (ambiguous) { ambiguous = false; throw new Error("PRIVATE_RPC_CREDENTIAL_SIGNED_BYTES"); }
      return { hash: tx.hash };
    },
  };
  const store = { load: async () => clone(journal), save: async value => { if (saveFailure) throw new Error("PRIVATE_PATH"); journal = clone(value); } };
  const loadSigner = async role => { signerLoads++; return signers[role]; };
  return { provider, store, state, policy, loadSigner, readSnapshot: async () => clone(state), receiptValidator: async intent => intent.action.startsWith("finalize-") ? { drawRevealed: true } : null,
    reconcileOptions: { polls: 2, wait: async () => {} }, output: () => {},
    get journal() { return journal; }, set journal(value) { journal = value; }, get signerLoads() { return signerLoads; }, entries, receipts, nonces,
    set network(value) { network = value; }, set priority(value) { priority = value; }, set nonceConflict(value) { nonceConflict = value; },
    set saveFailure(value) { saveFailure = value; }, set ambiguous(value) { ambiguous = value; }, set missing(value) { missing = value; }, set code(value) { code = value; }, set balance(value) { balance = value; },
    set beforeBroadcastHook(value) { beforeBroadcastHook = value; },
  };
}
const run = (mock, stage) => executeStage({ ...mock, stage });

test("wallet code policy accepts ordinary EOAs and only the pinned affiliate delegation", () => {
  for (const role of roles) assert.doesNotThrow(() => validateWalletCode(role, "0x", null, P));
  for (const role of ["AFFILIATE_A", "AFFILIATE_B", "AFFILIATE_C"]) assert.doesNotThrow(() => validateWalletCode(role, delegateDesignator, P.affiliateDelegation.codeHash, P));
  for (const role of ["DEPLOYER", "BUYER_A", "BUYER_B"]) assert.throws(() => validateWalletCode(role, delegateDesignator, P.affiliateDelegation.codeHash, P), /undelegated EOA/);
  for (const code of ["0xef0100", `${delegateDesignator}00`, `0xef0100${"11".repeat(20)}`, "0x60006000fd", `0xef0200${P.affiliateDelegation.address.slice(2)}`]) assert.throws(() => validateWalletCode("AFFILIATE_A", code, P.affiliateDelegation.codeHash, P), /delegation differs/);
  for (const hash of [null, keccak256("0x"), "0x1234"]) assert.throws(() => validateWalletCode("AFFILIATE_A", delegateDesignator, hash, P), /runtime hash/);
  assert.throws(() => validateWalletCode("AFFILIATE_A", delegateDesignator, P.affiliateDelegation.codeHash, policy), /undelegated EOA/);
  assert.throws(() => validateWalletCode("AFFILIATE_A", delegateDesignator, P.affiliateDelegation.codeHash, { ...P, chainId: 1n }), /undelegated EOA/);
  assert.throws(() => validateWalletCode("UNKNOWN", "0x", null, P), /not pinned/);
});

test("wallet and delegate code reads use the same canonical snapshot or latest tag", async () => {
  for (const tag of [{ blockHash, requireCanonical: true }, "latest"]) {
    const calls = [];
    const provider = { send: async (method, params) => {
      calls.push([method, params]);
      assert.equal(method, "eth_getCode"); assert.deepEqual(params[1], tag);
      if (params[0] === delegatedPolicy.wallets.AFFILIATE_A) return delegateDesignator;
      assert.equal(params[0], delegatedPolicy.affiliateDelegation.address); return delegateRuntime;
    } };
    await assertWalletCodeAt(provider, "AFFILIATE_A", delegatedPolicy, tag);
    assert.equal(calls.length, 2);
  }
});

function delegatedProvider(mock, runtime = () => delegateRuntime) {
  const originalSend = mock.provider.send;
  mock.provider.send = async (method, params) => {
    if (method === "eth_getCode") {
      if (params[0] === delegatedPolicy.affiliateDelegation.address) return runtime();
      if (Object.values(delegatedPolicy.affiliateDelegation.wallets).includes(params[0])) return delegateDesignator;
    }
    return originalSend(method, params);
  };
}

test("pinned delegated affiliate claims retain exact EOA signing, nonce, fees and calldata", async () => {
  const mock = fixture(); delegatedProvider(mock);
  const intent = actionIntent("claim-affiliate-a", ids, delegatedPolicy);
  let saved;
  const entry = await prepareEntry({ intent, policy: delegatedPolicy, provider: mock.provider, signer: signers.AFFILIATE_A, nonce: 0, savePrepared: async value => { saved = value; } });
  const tx = validateSigned(entry, intent, delegatedPolicy);
  assert.equal(saved, entry); assert.equal(tx.from, policy.wallets.AFFILIATE_A);
  assert.equal(tx.type, 2); assert.equal(tx.nonce, 0); assert.equal(tx.to, P.round); assert.equal(tx.value, 0n);
  assert.equal(tx.data, intent.data); assert.ok(tx.maxFeePerGas <= P.feeCap); assert.equal(tx.authorizationList, null);
  assert.equal(mock.entries.size, 0);
  for (const [mutate, pattern] of [[item => { item.nonceConflict = true; }, /nonce changed/], [item => { item.priority = 4_000_000_000n; }, /5 gwei cap/]]) {
    const guarded = fixture(); delegatedProvider(guarded); mutate(guarded); let signed = false;
    await assert.rejects(() => prepareEntry({ intent, policy: delegatedPolicy, provider: guarded.provider,
      signer: { getAddress: async () => policy.wallets.AFFILIATE_A, signTransaction: async () => { signed = true; } }, nonce: 0, savePrepared: async () => {} }), pattern);
    assert.equal(signed, false);
  }
});

test("changed delegate code during gas checks stops before signing or saving", async () => {
  const mock = fixture(); let runtime = delegateRuntime; delegatedProvider(mock, () => runtime);
  mock.provider.estimateGas = async () => { runtime = "0x6000"; return 100000n; };
  let signed = false, saved = false;
  await assert.rejects(() => prepareEntry({ intent: actionIntent("claim-affiliate-a", ids, delegatedPolicy), policy: delegatedPolicy, provider: mock.provider,
    signer: { getAddress: async () => policy.wallets.AFFILIATE_A, signTransaction: async () => { signed = true; } }, nonce: 0, savePrepared: async () => { saved = true; } }), /runtime hash/);
  assert.equal(signed, false); assert.equal(saved, false); assert.equal(mock.entries.size, 0);
});

test("saved affiliate claims revalidate delegate runtime immediately before broadcast", async () => {
  const mock = fixture(); let runtime = delegateRuntime; delegatedProvider(mock, () => runtime);
  const intent = actionIntent("claim-affiliate-a", ids, delegatedPolicy);
  const entry = await prepareEntry({ intent, policy: delegatedPolicy, provider: mock.provider, signer: signers.AFFILIATE_A, nonce: 0, savePrepared: async () => {} });
  let broadcasts = 0;
  mock.provider.broadcastTransaction = async () => { broadcasts++; assert.fail("must not broadcast with changed delegation"); };
  await assert.rejects(() => reconcileEntry({ entry, intent, policy: delegatedPolicy, provider: mock.provider, save: async () => {}, polls: 1,
    beforeBroadcast: async () => { runtime = "0x6000"; } }), /runtime hash/);
  assert.equal(broadcasts, 0); assert.equal(entry.state, "prepared");
});

test("CLI is read-only by default with only three fixed explicit stages", () => {
  assert.deepEqual(parseRehearsalArguments([]), { stage: "status", execute: false });
  for (const stage of ["sellout", "draw", "settle"]) assert.deepEqual(parseRehearsalArguments(["--execute", stage]), { stage, execute: true });
  for (const args of [["--execute"], ["--execute", "mainnet"], ["--execute", "sellout", "--rpc", "http://evil"], ["--recipient", "0x1"]]) assert.throws(() => parseRehearsalArguments(args));
  assert.throws(() => actionIntent("enrollAffiliate", ids));
});
test("missing affiliate enrollment stops before journal creation or key loading", async () => {
  const mock = fixture(); mock.state.affiliateCount = 0n; mock.state.affiliates.AFFILIATE_A.id = 0n;
  await assert.rejects(() => run(mock, "sellout"), /Enrollment gate/);
  assert.equal(mock.journal, null); assert.equal(mock.signerLoads, 0); assert.equal(mock.entries.size, 0);
});
test("missing journal on an already active collection refuses to reconstruct a second run", async () => {
  const mock = fixture(); mock.state.saleActivated = true;
  await assert.rejects(() => run(mock, "sellout"), /no longer pristine/);
  assert.equal(mock.signerLoads, 0);
});
test("complete offline lifecycle preserves exact economics and repeated stages send nothing", async () => {
  const mock = fixture();
  const sold = await run(mock, "sellout"); assert.equal(sold.totalMinted, 20n); assert.equal(mock.entries.size, 5);
  await run(mock, "sellout"); assert.equal(mock.entries.size, 5);
  const waiting = await run(mock, "draw"); assert.equal(waiting.waitingFor, "awaiting_real_VRF"); assert.equal(mock.entries.size, 5);
  mock.state.randomnessReceived = true;
  await run(mock, "draw"); assert.equal(mock.entries.size, 6); validateScores(mock.state, policy);
  const complete = await run(mock, "settle");
  assert.equal(complete.prizePaidEth, "0.001"); assert.equal(mock.state.affiliates.AFFILIATE_A.claimed, policy.affiliateA);
  assert.equal(mock.state.affiliates.AFFILIATE_B.claimed, policy.affiliateB); assert.equal(mock.state.affiliates.AFFILIATE_C.claimed, 0n);
  assert.equal(mock.state.balance, 0n); assert.equal(mock.state.subscriptionClosed, true); assert.equal(mock.entries.size, 11);
  assert.equal(mock.journal.entries.filter(entry => entry.action === "request-randomness").length, 1);
  await run(mock, "settle"); assert.equal(mock.entries.size, 11);
  validateJournal(mock.journal, policy);
});
test("uncertain submission reconciles the saved hash without signing the same action again", async () => {
  const mock = fixture(); mock.ambiguous = true;
  await assert.rejects(() => run(mock, "sellout"));
  assert.equal(mock.journal.entries.length, 1); assert.equal(mock.journal.entries[0].state, "prepared");
  const original = mock.journal.entries[0].rawTransaction;
  await run(mock, "sellout");
  assert.equal(mock.journal.entries[0].rawTransaction, original); assert.equal(mock.entries.size, 5); assert.equal(mock.signerLoads, 5);
});
test("saved unbroadcast transaction rechecks collection state before any rebroadcast", async () => {
  const mock = fixture();
  mock.provider.broadcastTransaction = async () => { throw new Error("UNCERTAIN before network write"); };
  await assert.rejects(() => run(mock, "sellout"));
  assert.equal(mock.journal.entries[0].state, "prepared");
  mock.state.totalMinted = 1n; mock.state.totalMintRevenue = policy.mintPrice;
  let broadcasts = 0; mock.provider.broadcastTransaction = async () => { broadcasts++; assert.fail("must not rebroadcast changed collection"); };
  await assert.rejects(() => run(mock, "sellout"), /Live mint\/referral state/);
  assert.equal(broadcasts, 0);
});
test("latest-block outside activity also prevents a saved transaction rebroadcast", async () => {
  const mock = fixture(); mock.provider.broadcastTransaction = async () => { throw new Error("not broadcast"); };
  await assert.rejects(() => run(mock, "sellout"));
  mock.readSnapshot = async (_provider, _policy, options) => options?.confirmations === 1 ? { ...clone(mock.state), totalMinted: 1n } : clone(mock.state);
  let broadcasts = 0; mock.provider.broadcastTransaction = async () => { broadcasts++; };
  await assert.rejects(() => run(mock, "sellout"), /Live mint\/referral state/); assert.equal(broadcasts, 0);
});
test("same total with unexpected token ownership or referrals stops the next stage", async () => {
  const mock = fixture(); await run(mock, "sellout");
  mock.state.tokenOwners[0].owner = policy.wallets.AFFILIATE_C;
  await assert.rejects(() => run(mock, "draw"), /token ownership/);
  mock.state.tokenOwners[0].owner = policy.wallets.BUYER_A; mock.state.affiliates.AFFILIATE_A.referred = 5n;
  await assert.rejects(() => run(mock, "draw"), /mint\/referral/);
});
test("outside affiliate claim cannot be silently adopted as settlement evidence", async () => {
  const mock = fixture(); await run(mock, "sellout");
  mock.state.affiliates.AFFILIATE_A.claimed = policy.affiliateA; mock.state.totalAffiliateClaimed = policy.affiliateA;
  mock.state.balance -= policy.affiliateA;
  await assert.rejects(() => run(mock, "draw"), /outside claims and recipients/);
});
test("outside prize delivery or subscription recovery is not silently adopted", async () => {
  const mock = fixture(); await run(mock, "sellout");
  mock.state.prizePaid = true;
  await assert.rejects(() => run(mock, "draw"), /outside actions/);
});
test("changed draw counter cannot result in a new random seed or an unbounded continuation", async () => {
  const mock = fixture(); await run(mock, "sellout"); mock.state.randomnessReceived = true; await run(mock, "draw");
  mock.state.drawCounter = 100n;
  await assert.rejects(() => run(mock, "settle"), /bounded attempts/);
});
test("missing confirmed receipt stops without replacement", async () => {
  const mock = fixture(); await run(mock, "sellout"); mock.missing = true;
  await assert.rejects(() => run(mock, "draw"), /confirmed transaction is missing/);
  assert.equal(mock.entries.size, 5);
});
for (const [label, mutate, pattern] of [
  ["wrong chain", mock => { mock.network = 1n; }, /Wrong network/],
  ["fee cap", mock => { mock.priority = 4_000_000_000n; }, /5 gwei cap/],
  ["nonce conflict", mock => { mock.nonceConflict = true; }, /nonce changed/],
  ["delegated EOA", mock => { mock.code = "0xef0100"; }, /undelegated EOA/],
  ["balance", mock => { mock.balance = 0n; }, /insufficient balance/],
]) test(`preparation rejects ${label} before signed bytes are saved`, async () => {
  const mock = fixture(); mutate(mock); let saved = false;
  await assert.rejects(() => prepareEntry({ intent: actionIntent("activate", ids, policy), policy, provider: mock.provider, signer: signers.DEPLOYER, nonce: 0, savePrepared: async () => { saved = true; } }), pattern);
  assert.equal(saved, false); assert.equal(mock.entries.size, 0);
});
test("raw transactions are tied to fixed calldata, recipient, amount, signer and fee policy", async () => {
  const intent = actionIntent("mint-affiliate-a", ids, policy);
  const rawTransaction = await signers.BUYER_A.signTransaction({ type: 2, chainId: policy.chainId, nonce: 0, to: intent.to, data: intent.data, value: intent.value, gasLimit: 200000n, maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1_000_000n });
  const entry = { action: intent.action, role: intent.role, rawTransaction, hash: Transaction.from(rawTransaction).hash, nonce: 0, state: "prepared" };
  validateSigned(entry, intent, policy);
  for (const change of [{ data: "0x" }, { value: intent.value + 1n }, { to: policy.wallets.AFFILIATE_C }, { role: "BUYER_B" }]) assert.throws(() => validateSigned(entry, { ...intent, ...change }, policy));
});
test("private errors redact credential and signed-payload diagnostics", () => {
  assert.ok(!safeError(new Error("PRIVATE_RPC_CREDENTIAL_SIGNED_BYTES")).includes("PRIVATE_RPC"));
});
test("journal store is private, exclusive and refuses symlink replacement", async () => {
  const folder = await mkdtemp(join(tmpdir(), "nko-rehearsal-")); const directory = pathToFileURL(folder + "/");
  try {
    const store = await privateStore(directory); await store.save({ sample: true });
    assert.equal((await stat(join(folder, "rehearsal-journal.json"))).mode & 0o077, 0);
    assert.deepEqual(await store.load(), { sample: true });
    await withRehearsalLock(directory, async () => { await assert.rejects(() => withRehearsalLock(directory, async () => {}), /locked/); });
    await rm(join(folder, "rehearsal-journal.json")); await symlink(join(folder, "other"), join(folder, "rehearsal-journal.json"));
    await assert.rejects(() => store.save({ sample: false }));
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("optional original wallet registration is preserved without payouts", async () => {
  const mock = fixture();
  mock.state.optionalAffiliate = { id: 4n, wallet: policy.optionalAffiliate, referred: 0n, accrued: 0n, claimed: 0n };
  mock.state.registeredAffiliates.push({ id: 4n, wallet: policy.optionalAffiliate }); mock.state.affiliateCount = 4n;
  await run(mock, "sellout"); assert.equal(mock.journal.optionalAffiliateId, "4");
  mock.state.optionalAffiliate.referred = 1n;
  await assert.rejects(() => run(mock, "draw"), /zero-referral/);
});
test("unrecognized or later affiliate enrollment prevents activation/resume", async () => {
  const mock = fixture(); mock.state.registeredAffiliates.push({ id: 4n, wallet: policy.wallets.BUYER_A }); mock.state.affiliateCount = 4n;
  await assert.rejects(() => run(mock, "sellout"), /unexpected wallet/); assert.equal(mock.signerLoads, 0);
});
test("outside nonrevealing finalization is detected before a first draw attempt", async () => {
  const mock = fixture(); await run(mock, "sellout"); mock.state.randomnessReceived = true; mock.state.drawCounter = 8n;
  await assert.rejects(() => run(mock, "draw"), /without a journaled/);
});

function eventReceipt(name, args) {
  const encoded = iface.encodeEventLog(iface.getEvent(name), args);
  return { logs: [{ address: P.round, topics: encoded.topics, data: encoded.data }] };
}
test("real claim receipt validates wallet, destination and amount", () => {
  const intent = actionIntent("claim-affiliate-a", ids);
  validateReceipt(intent, eventReceipt("AffiliateCommissionClaimed", [1, P.wallets.AFFILIATE_A, P.wallets.AFFILIATE_A, P.affiliateA]));
  for (const args of [[1, P.wallets.AFFILIATE_A, P.wallets.BUYER_A, P.affiliateA], [1, P.wallets.AFFILIATE_A, P.wallets.AFFILIATE_A, P.affiliateA + 1n], [1, P.wallets.AFFILIATE_B, P.wallets.AFFILIATE_A, P.affiliateA]]) assert.throws(() => validateReceipt(intent, eventReceipt("AffiliateCommissionClaimed", args)), /expected AffiliateCommissionClaimed/);
});
test("real prize receipt rejects any redirected or incorrectly sized payment", () => {
  const intent = actionIntent("distribute-prize", ids);
  validateReceipt(intent, eventReceipt("PrizeDelivered", [13, P.wallets.BUYER_A, P.wallets.BUYER_A, P.prize]));
  for (const args of [[13, P.wallets.BUYER_A, P.wallets.DEPLOYER, P.prize], [13, P.wallets.BUYER_A, P.wallets.BUYER_A, P.prize + 1n], [13, P.wallets.AFFILIATE_A, P.wallets.AFFILIATE_A, P.prize]]) assert.throws(() => validateReceipt(intent, eventReceipt("PrizeDelivered", args)), /expected PrizeDelivered/);
});
test("real operator and VRF recovery receipts require the pinned operator", () => {
  const intent = actionIntent("withdraw-operator", ids);
  validateReceipt(intent, eventReceipt("Withdrawn", [P.wallets.DEPLOYER, P.operator]));
  assert.throws(() => validateReceipt(intent, eventReceipt("Withdrawn", [P.wallets.BUYER_A, P.operator])));
  assert.throws(() => validateReceipt(intent, eventReceipt("Withdrawn", [P.wallets.DEPLOYER, P.operator + 1n])));
  const recovery = actionIntent("recover-vrf", ids);
  validateReceipt(recovery, eventReceipt("RandomnessFundingWithdrawn", [P.wallets.DEPLOYER]));
  assert.throws(() => validateReceipt(recovery, eventReceipt("RandomnessFundingWithdrawn", [P.wallets.BUYER_A])));
});
test("real mint receipts require the planned token range, payer and recipient", () => {
  const intent = actionIntent("mint-affiliate-b", ids);
  validateReceipt(intent, eventReceipt("Minted", [P.wallets.BUYER_B, P.wallets.BUYER_B, 5, 6]));
  for (const args of [[P.wallets.BUYER_B, P.wallets.BUYER_B, 6, 6], [P.wallets.BUYER_B, P.wallets.BUYER_A, 5, 6], [P.wallets.BUYER_B, P.wallets.BUYER_B, 5, 5]]) assert.throws(() => validateReceipt(intent, eventReceipt("Minted", args)), /expected Minted/);
});
test("real finalization receipts preserve whether draw progressed or revealed", () => {
  const intent = actionIntent("finalize-0", ids);
  assert.deepEqual(validateReceipt(intent, eventReceipt("DrawProgress", [8])), { drawRevealed: false });
  assert.deepEqual(validateReceipt(intent, eventReceipt("WinnerDetermined", [13, 20, P.prize])), { drawRevealed: true });
  assert.throws(() => validateReceipt(intent, { logs: [] }));
});
