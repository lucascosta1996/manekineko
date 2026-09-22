import { parseEnv } from "node:util";
import { pathToFileURL } from "node:url";
import { JsonRpcProvider, FetchRequest, Wallet, Interface, keccak256, formatEther } from "ethers";
import roundAbi from "@manekineko/contract-abi/round-v5" with { type: "json" };
import { FUNDING_POLICY, validateWalletManifest } from "./fund-staging-wallets.mjs";
import { stagingProviderConfig } from "./staging-provider-check.mjs";
import { fail, json, sameAddress, safeError, readPrivate, privateStore, withRehearsalLock, validateSigned, prepareEntry, reconcileEntry, assertWalletCodeAt } from "./staging-rehearsal-journal.mjs";

const root = new URL("../", import.meta.url);
export const iface = new Interface(roundAbi);
const factoryIface = new Interface(["function rounds(uint256) view returns (address)", "function owner() view returns (address)"]);
const coordinatorIface = new Interface(["function getSubscription(uint256) view returns (uint96 balance,uint96 nativeBalance,uint64 reqCount,address owner,address[] consumers)"]);
const affiliateRoles = ["AFFILIATE_A", "AFFILIATE_B", "AFFILIATE_C"];
export const REHEARSAL_POLICY = Object.freeze({
  chainId: 11155111n, round: "0xAfFd7dc1B6A0D8974040F3216316240B724715A9", factory: "0xfF48d290d0dEbbF676831d589567D1Ed70C4BdB1",
  factoryCodeHash: "0x0506d7089f0fc7bc03544701b7e10fe06549d09c4100d09fe021e492e43308d3",
  coordinator: "0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B", mintDeadline: 1789772544n,
  subscriptionId: 103058561048376410383872347119185591978055392290283064210153112727896766115860n,
  keyHash: "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae",
  mintPrice: 100_000_000_000_000n, prize: 1_000_000_000_000_000n,
  affiliateA: 80_000_000_000_000n, affiliateB: 120_000_000_000_000n, operator: 800_000_000_000_000n,
  optionalAffiliate: FUNDING_POLICY.source,
  feeCap: 5_000_000_000n, maxGas: 2_000_000n, confirmations: 2,
  wallets: Object.freeze({ DEPLOYER: FUNDING_POLICY.deployer, ...Object.fromEntries(FUNDING_POLICY.recipients.map(({ role, address }) => [role, address])) }),
  affiliateDelegation: Object.freeze({
    address: "0x63c0c19a282a1b52b07dd5a65b58948a07dae32b",
    codeHash: "0x9270f73d98e7ed6978677bf0550038289efd510e67e700d024502d62510fc1e4",
    wallets: Object.freeze(Object.fromEntries(FUNDING_POLICY.recipients.filter(({ role }) => affiliateRoles.includes(role)).map(({ role, address }) => [role, address]))),
  }),
});
const P = REHEARSAL_POLICY;
const mintActions = ["mint-affiliate-a", "mint-affiliate-b", "mint-organic"];
const fixedOrder = ["activate", ...mintActions, "request-randomness", ...Array.from({ length: 8 }, (_, i) => `finalize-${i}`), "distribute-prize", "claim-affiliate-a", "claim-affiliate-b", "withdraw-operator", "recover-vrf"];
export function parseRehearsalArguments(args) {
  if (args.length === 0) return { stage: "status", execute: false };
  if (args.length === 2 && args[0] === "--execute" && ["sellout", "draw", "settle"].includes(args[1])) return { stage: args[1], execute: true };
  fail("Usage: node scripts/run-sepolia-rehearsal.mjs [--execute sellout|draw|settle]. Default is read-only status.");
}

export function actionIntent(action, affiliateIds, policy = P) {
  const make = (role, method, args = [], value = 0n) => ({ action, role, to: policy.round, data: iface.encodeFunctionData(method, args), value });
  switch (action) {
    case "activate": return make("DEPLOYER", "activateSale");
    case "mint-affiliate-a": return make("BUYER_A", "mintWithAffiliate", [policy.wallets.BUYER_A, 4, affiliateIds.AFFILIATE_A], policy.mintPrice * 4n);
    case "mint-affiliate-b": return make("BUYER_B", "mintWithAffiliate", [policy.wallets.BUYER_B, 6, affiliateIds.AFFILIATE_B], policy.mintPrice * 6n);
    case "mint-organic": return make("BUYER_A", "mint", [policy.wallets.BUYER_A, 10], policy.mintPrice * 10n);
    case "request-randomness": return make("DEPLOYER", "requestRandomness");
    case "distribute-prize": return make("DEPLOYER", "distributePrize");
    case "claim-affiliate-a": return make("AFFILIATE_A", "claimAffiliateCommission", [policy.wallets.AFFILIATE_A]);
    case "claim-affiliate-b": return make("AFFILIATE_B", "claimAffiliateCommission", [policy.wallets.AFFILIATE_B]);
    case "withdraw-operator": return make("DEPLOYER", "withdraw", [policy.wallets.DEPLOYER, policy.operator]);
    case "recover-vrf": return make("DEPLOYER", "withdrawRandomnessFunding", [policy.wallets.DEPLOYER]);
    default: if (/^finalize-[0-7]$/.test(action)) return make("DEPLOYER", "finalizeDraw", [8]);
  }
  fail("Unknown or unbounded rehearsal action.");
}
export function validateJournal(journal, policy = P) {
  if (journal?.version !== 1 || journal.chainId !== String(policy.chainId) || journal.round !== policy.round || journal.factory !== policy.factory ||
      journal.feeCap !== String(policy.feeCap) || !Array.isArray(journal.entries) || journal.entries.length > fixedOrder.length ||
      !journal.startingNonces || !journal.affiliateIds) fail("Journal does not match this fixed Sepolia rehearsal.");
  for (const role of Object.keys(policy.wallets)) if (!Number.isSafeInteger(journal.startingNonces[role]) || journal.startingNonces[role] < 0) fail("Invalid journal nonce anchor.");
  const ids = affiliateRoles.map(role => journal.affiliateIds[role]);
  if (journal.optionalAffiliateId !== null && (typeof journal.optionalAffiliateId !== "string" || !/^(?:[1-9]|1[0-9]|20)$/.test(journal.optionalAffiliateId) || ids.includes(journal.optionalAffiliateId))) fail("Journal optional affiliate ID is invalid.");
  if (ids.some(id => typeof id !== "string" || !/^(?:[1-9]|1[0-9]|20)$/.test(id)) || new Set(ids).size !== 3) fail("Journal affiliate IDs are invalid.");
  let last = -1;
  const used = Object.fromEntries(Object.keys(policy.wallets).map(role => [role, 0]));
  journal.entries.forEach((entry, index) => {
    const order = fixedOrder.indexOf(entry.action);
    if (order < 0 || order <= last || (index < journal.entries.length - 1 && entry.state !== "confirmed")) fail("Invalid journal stage progression.");
    last = order;
    const intent = actionIntent(entry.action, journal.affiliateIds, policy);
    validateSigned(entry, intent, policy);
    if (entry.action.startsWith("finalize-") && (typeof entry.drawCounterBefore !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(entry.drawCounterBefore))) fail("Finalization journal lacks its saved draw counter.");
    if (entry.nonce !== journal.startingNonces[entry.role] + used[entry.role]++) fail("Journal signer nonce sequence differs from its anchor.");
  });
  // Minting must never skip a prerequisite even if an edited journal still has sorted entries.
  const actions = journal.entries.map(entry => entry.action);
  for (const action of mintActions) if (actions.includes(action)) {
    const preceding = ["activate", ...mintActions].slice(0, ["activate", ...mintActions].indexOf(action));
    if (preceding.some(required => !actions.includes(required))) fail("Journal skipped a required mint stage.");
  }
}
async function readAt(provider, address, contract, method, args, tag) {
  const raw = await provider.send("eth_call", [{ to: address, data: contract.encodeFunctionData(method, args ?? []) }, tag]);
  const decoded = contract.decodeFunctionResult(method, raw);
  return decoded.length === 1 ? decoded[0] : decoded;
}
export async function snapshot(provider, policy = P, { confirmations = policy.confirmations } = {}) {
  if (BigInt(await provider.send("eth_chainId", [])) !== policy.chainId) fail("Wrong network; this runner supports Ethereum Sepolia only.");
  const latest = await provider.getBlock("latest");
  if (!latest?.hash || Date.now() / 1000 - latest.timestamp > 300 || latest.timestamp > Date.now() / 1000 + 30) fail("RPC returned a stale or invalid latest block.");
  const block = await provider.getBlock(latest.number - confirmations + 1);
  if (!block?.hash) fail("Confirmed block unavailable.");
  const tag = { blockHash: block.hash, requireCanonical: true };
  const read = (name, args = []) => readAt(provider, policy.round, iface, name, args, tag);
  const fields = ["owner", "roundId", "maxSupply", "mintPrice", "mintDeadline", "prizeBps", "affiliatePoolBps", "maxAffiliateSlots", "enrollmentSigner", "vrfCoordinator", "subscriptionId", "keyHash", "requestConfirmations", "callbackGasLimit", "saleActivated", "affiliateCount", "totalMinted", "totalMintRevenue", "totalReferredMints", "totalAffiliateAccrued", "totalAffiliateClaimed", "totalRefunded", "cancelled", "randomnessRequested", "requestId", "randomnessReceived", "revealed", "drawCounter", "drawOffset", "winningTokenId", "highestScore", "prizePaid", "prizeRecipient", "prizePaidAmount", "subscriptionClosed", "phase", "withdrawableBalance"];
  const state = { blockNumber: block.number, blockHash: block.hash, timestamp: block.timestamp, affiliates: {} };
  for (let start = 0; start < fields.length; start += 8) for (const [name, value] of await Promise.all(fields.slice(start, start + 8).map(async name => [name, await read(name)]))) state[name] = value;
  if (!sameAddress(state.owner, policy.wallets.DEPLOYER) || state.roundId !== 1n || state.maxSupply !== 20n || state.mintPrice !== policy.mintPrice || state.mintDeadline !== policy.mintDeadline ||
      state.prizeBps !== 5000n || state.affiliatePoolBps !== 1000n || state.maxAffiliateSlots !== 20n || !sameAddress(state.enrollmentSigner, FUNDING_POLICY.enrollment) ||
      !sameAddress(state.vrfCoordinator, policy.coordinator) || state.subscriptionId !== policy.subscriptionId || state.keyHash !== policy.keyHash || state.requestConfirmations !== 64n || state.callbackGasLimit !== 200000n) fail("Live collection immutable terms or ownership differ from the pinned rehearsal.");
  const factoryCode = await provider.send("eth_getCode", [policy.factory, tag]);
  if (keccak256(factoryCode) !== policy.factoryCodeHash || !sameAddress(await readAt(provider, policy.factory, factoryIface, "rounds", [1], tag), policy.round) ||
      !sameAddress(await readAt(provider, policy.factory, factoryIface, "owner", [], tag), policy.wallets.DEPLOYER)) fail("Collection factory provenance or ownership differs from the pinned deployment.");
  for (const role of affiliateRoles) {
    const id = await read("affiliateIdOf", [policy.wallets[role]]);
    const wallet = id ? await read("affiliateWallet", [id]) : null;
    if (id && !sameAddress(wallet, policy.wallets[role])) fail("Affiliate reverse mapping is inconsistent.");
    state.affiliates[role] = { id, wallet, referred: await read("affiliateReferredMints", [id]), accrued: await read("affiliateAccrued", [id]), claimed: await read("affiliateClaimed", [id]), claimable: await read("affiliateClaimable", [id]) };
  }
  state.registeredAffiliates = [];
  for (let start = 1; start <= 20; start += 5) {
    for (const item of await Promise.all(Array.from({ length: 5 }, (_, i) => start + i).map(async id => ({ id: BigInt(id), wallet: await read("affiliateWallet", [id]) })))) {
      if (item.wallet !== "0x0000000000000000000000000000000000000000") state.registeredAffiliates.push(item);
    }
  }
  const optional = state.registeredAffiliates.find(item => sameAddress(item.wallet, policy.optionalAffiliate));
  state.optionalAffiliate = optional ? { ...optional, referred: await read("affiliateReferredMints", [optional.id]), accrued: await read("affiliateAccrued", [optional.id]), claimed: await read("affiliateClaimed", [optional.id]) } : null;
  state.balance = BigInt(await provider.send("eth_getBalance", [policy.round, tag]));
  state.wallets = {};
  for (const [role, address] of Object.entries(policy.wallets)) {
    const [, balance] = await Promise.all([assertWalletCodeAt(provider, role, policy, tag), provider.send("eth_getBalance", [address, tag])]);
    state.wallets[role] = { address, balance: BigInt(balance) };
  }
  if (!state.subscriptionClosed) {
    const sub = await readAt(provider, policy.coordinator, coordinatorIface, "getSubscription", [policy.subscriptionId], tag);
    if (!sameAddress(sub.owner, policy.round) || sub.consumers.length !== 1 || !sameAddress(sub.consumers[0], policy.round)) fail("VRF subscription ownership or consumer changed.");
    state.vrfNativeBalance = sub.nativeBalance; state.vrfRequestCount = sub.reqCount;
  }
  state.tokenOwners = [];
  for (let tokenId = 1; tokenId <= Number(state.totalMinted); tokenId++) state.tokenOwners.push({ tokenId, owner: await read("ownerOf", [tokenId]) });
  if (state.revealed) {
    state.scores = [];
    for (let tokenId = 1; tokenId <= 20; tokenId++) {
      const [combination, owner] = await Promise.all([read("combination", [tokenId]), read("ownerOf", [tokenId])]);
      state.scores.push({ tokenId, numbers: [...combination.numbers], code: combination.code, score: combination.result, owner });
    }
    validateScores(state, policy);
  }
  if ((await provider.getBlock(block.number))?.hash !== block.hash) fail("Snapshot block changed while reading; retry without sending.");
  return state;
}
export function validateScores(state, policy = P) {
  if (!state.revealed || state.scores?.length !== 20 || state.highestScore !== 20n || state.drawOffset < 0n || state.drawOffset >= 20n || state.winningTokenId !== 20n - state.drawOffset) fail("Revealed ranking is inconsistent.");
  const seen = new Set();
  for (const item of state.scores) {
    const id = BigInt(item.tokenId), expected = 1n + ((id - 1n + state.drawOffset) % 20n);
    const score = 1n + item.numbers.reduce((sum, digit, index) => sum + (digit - 1n) * (16n ** BigInt(3 - index)), 0n);
    if (item.numbers.length !== 4 || item.numbers.some(n => n < 1n || n > 16n) || item.score !== expected || item.score !== score || item.code !== score - 1n || seen.has(item.score.toString())) fail("NFT combination or uniqueness verification failed.");
    if (!sameAddress(item.owner, policy.wallets.BUYER_A) && !sameAddress(item.owner, policy.wallets.BUYER_B)) fail("A rehearsal NFT moved outside the pinned buyer wallets.");
    seen.add(item.score.toString());
  }
  if (state.scores.filter(item => item.score === 20n).length !== 1) fail("Ranking must have exactly one winning NFT.");
}
export function validateEnrollmentMembership(state, policy = P) {
  if (!Array.isArray(state.registeredAffiliates) || state.affiliateCount !== BigInt(state.registeredAffiliates.length) || affiliateRoles.some(role => !state.affiliates[role].id)) fail("Enrollment gate: the three pinned affiliates must complete real application enrollment before activation.");
  const allowed = [...affiliateRoles.map(role => policy.wallets[role]), policy.optionalAffiliate];
  if (state.registeredAffiliates.some(item => !allowed.some(address => sameAddress(address, item.wallet))) || new Set(state.registeredAffiliates.map(item => item.wallet.toLowerCase())).size !== state.registeredAffiliates.length ||
      affiliateRoles.some(role => !state.registeredAffiliates.some(item => item.id === state.affiliates[role].id && sameAddress(item.wallet, policy.wallets[role])))) fail("Affiliate enrollment contains an unexpected wallet or mapping.");
  if (state.optionalAffiliate && (!sameAddress(state.optionalAffiliate.wallet, policy.optionalAffiliate) || state.optionalAffiliate.referred !== 0n || state.optionalAffiliate.accrued !== 0n || state.optionalAffiliate.claimed !== 0n)) fail("The optional original wallet must remain a zero-referral, zero-payout affiliate in this rehearsal.");
  if (state.registeredAffiliates.length !== (state.optionalAffiliate ? 4 : 3)) fail("Unexpected affiliate membership count.");
  return state.optionalAffiliate?.id.toString() ?? null;
}
function enrollmentReady(state) { try { validateEnrollmentMembership(state); return true; } catch { return false; } }
export function validateProgress(state, journal, policy = P) {
  if (state.cancelled || state.totalRefunded !== 0n) fail("Collection is cancelled or refunded; sellout rehearsal must stop.");
  const optionalAffiliateId = validateEnrollmentMembership(state, policy);
  if (optionalAffiliateId !== journal.optionalAffiliateId || affiliateRoles.some(role => state.affiliates[role].id.toString() !== journal.affiliateIds[role])) fail("Enrolled affiliate membership differs from the original rehearsal journal.");
  const done = action => journal.entries.some(entry => entry.action === action && entry.state === "confirmed");
  const minted = (done("mint-affiliate-a") ? 4n : 0n) + (done("mint-affiliate-b") ? 6n : 0n) + (done("mint-organic") ? 10n : 0n);
  if (state.saleActivated !== done("activate") || state.totalMinted !== minted || state.totalMintRevenue !== minted * policy.mintPrice ||
      state.totalReferredMints !== (done("mint-affiliate-a") ? 4n : 0n) + (done("mint-affiliate-b") ? 6n : 0n) ||
      state.affiliates.AFFILIATE_A.referred !== (done("mint-affiliate-a") ? 4n : 0n) || state.affiliates.AFFILIATE_B.referred !== (done("mint-affiliate-b") ? 6n : 0n) || state.affiliates.AFFILIATE_C.referred !== 0n) fail("Live mint/referral state differs from the journal; stop and reconcile outside activity.");
  if (state.tokenOwners?.length !== Number(minted) || state.tokenOwners.some(({ tokenId, owner }, index) => tokenId !== index + 1 || !sameAddress(owner, tokenId >= 5 && tokenId <= 10 ? policy.wallets.BUYER_B : policy.wallets.BUYER_A))) fail("Rehearsal token ownership differs from the expected buyer and mint order.");
  for (const entry of journal.entries.filter(item => item.action.startsWith("finalize-") && item.state === "confirmed")) {
    if (typeof entry.drawCounterBefore !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(entry.drawCounterBefore) || state.drawCounter <= BigInt(entry.drawCounterBefore)) fail("Finalization did not advance its saved deterministic draw counter.");
  }
  const lastFinalization = journal.entries.filter(item => item.action.startsWith("finalize-") && item.state === "confirmed").at(-1);
  if (!lastFinalization && state.drawCounter !== 0n) fail("Draw counter advanced without a journaled finalization.");
  if (lastFinalization && (state.drawCounter > BigInt(lastFinalization.drawCounterBefore) + 8n || (!lastFinalization.proof?.drawRevealed && state.drawCounter !== BigInt(lastFinalization.drawCounterBefore) + 8n))) fail("Draw counter advanced beyond the journaled bounded attempts; reconcile external finalization.");
  if (minted === 20n) {
    if (state.totalAffiliateAccrued !== policy.affiliateA + policy.affiliateB || state.affiliates.AFFILIATE_A.accrued !== policy.affiliateA || state.affiliates.AFFILIATE_B.accrued !== policy.affiliateB || state.affiliates.AFFILIATE_C.accrued !== 0n) fail("Affiliate pool allocation differs from 4/6/10 rehearsal economics.");
  } else if (state.totalAffiliateAccrued !== 0n) fail("Affiliate pool vested before sellout.");
  for (const [role, action, amount] of [["AFFILIATE_A", "claim-affiliate-a", policy.affiliateA], ["AFFILIATE_B", "claim-affiliate-b", policy.affiliateB], ["AFFILIATE_C", null, 0n]]) {
    if (state.affiliates[role].claimed !== (action && done(action) ? amount : 0n)) fail("Affiliate payout differs from its confirmed journal action; reconcile outside claims and recipients.");
  }
  if (state.prizePaid !== done("distribute-prize") || state.subscriptionClosed !== done("recover-vrf") || state.randomnessRequested !== done("request-randomness")) fail("Prize, subscription or randomness-request state differs from the confirmed journal; reconcile outside actions.");
  if (state.revealed !== Boolean(lastFinalization?.proof?.drawRevealed)) fail("Reveal state differs from the confirmed finalization receipt.");
  if (state.totalAffiliateClaimed !== state.affiliates.AFFILIATE_A.claimed + state.affiliates.AFFILIATE_B.claimed) fail("Unexpected total affiliate claims.");
  if (state.prizePaid) {
    const winner = state.scores?.find(item => BigInt(item.tokenId) === state.winningTokenId);
    if (!winner || !sameAddress(state.prizeRecipient, winner.owner) || state.prizePaidAmount !== policy.prize) fail("Prize recipient or amount differs from the winning holder.");
  }
  const expectedBalance = state.totalMintRevenue - state.totalAffiliateClaimed - state.prizePaidAmount - (done("withdraw-operator") ? policy.operator : 0n);
  if (state.balance !== expectedBalance) fail("Contract balance differs from mint receipts minus recorded payouts; reconcile external funding or withdrawals.");
  return { done, minted };
}
export function validateReceipt(intent, receipt) {
  const events = receipt.logs.filter(log => sameAddress(log.address, P.round)).map(log => { try { return iface.parseLog(log); } catch { return null; } }).filter(Boolean);
  const expect = (name, check = () => true) => { const matches = events.filter(event => event.name === name && check(event.args)); if (matches.length !== 1) fail(`Confirmed ${intent.action} lacks its exact expected ${name} event.`); };
  const address = P.wallets[intent.role];
  if (mintActions.includes(intent.action)) {
    const position = mintActions.indexOf(intent.action), quantities = [4n, 6n, 10n], first = [1n, 5n, 11n];
    expect("Minted", args => sameAddress(args.payer, address) && sameAddress(args.recipient, address) && args.firstTokenId === first[position] && args.quantity === quantities[position]);
  } else if (intent.action === "activate") expect("SaleActivated", args => args.roundId === 1n);
  else if (intent.action === "request-randomness") expect("RandomnessRequested", args => args.subscriptionId === P.subscriptionId);
  else if (intent.action === "distribute-prize") expect("PrizeDelivered", args => sameAddress(args.holder, args.recipient) && args.amount === P.prize && [P.wallets.BUYER_A, P.wallets.BUYER_B].some(wallet => sameAddress(args.holder, wallet)));
  else if (intent.action.startsWith("claim-affiliate")) expect("AffiliateCommissionClaimed", args => sameAddress(args.wallet, address) && sameAddress(args.recipient, address) && args.amount === (intent.role === "AFFILIATE_A" ? P.affiliateA : P.affiliateB));
  else if (intent.action === "withdraw-operator") expect("Withdrawn", args => sameAddress(args.recipient, P.wallets.DEPLOYER) && args.amount === P.operator);
  else if (intent.action === "recover-vrf") expect("RandomnessFundingWithdrawn", args => sameAddress(args.recipient, P.wallets.DEPLOYER));
  else if (intent.action.startsWith("finalize-")) {
    const drawEvents = events.filter(event => ["WinnerDetermined", "DrawProgress"].includes(event.name));
    if (drawEvents.length !== 1) fail("Draw finalization lacks its expected progress or winner event.");
    return { drawRevealed: drawEvents[0].name === "WinnerDetermined" };
  }
  return null;
}
function publicReport(state, journal, stage) {
  return { mode: stage, chainId: 11155111, round: P.round, checkedAt: new Date().toISOString(), confirmedBlock: state.blockNumber,
    deadlineUtc: new Date(Number(state.mintDeadline) * 1000).toISOString(), phase: state.phase, totalMinted: state.totalMinted, saleActivated: state.saleActivated,
    enrollmentReady: enrollmentReady(state), affiliates: state.affiliates, optionalAffiliate: state.optionalAffiliate,
    randomnessRequested: state.randomnessRequested, requestId: state.requestId, randomnessReceived: state.randomnessReceived,
    revealed: state.revealed, winningTokenId: state.winningTokenId, highestScore: state.highestScore, scores: state.scores,
    prizePaid: state.prizePaid, prizeRecipient: state.prizeRecipient, prizePaidEth: formatEther(state.prizePaidAmount),
    contractBalanceEth: formatEther(state.balance), vrfNativeBalanceEth: state.vrfNativeBalance === undefined ? null : formatEther(state.vrfNativeBalance), subscriptionClosed: state.subscriptionClosed,
    transactions: journal?.entries.map(({ action, hash, state: status, blockNumber, gasUsed, gasPrice }) => ({ action, hash, status, blockNumber, gasUsed, gasPrice })) ?? [],
    note: stage === "status" ? "Read-only; no signing keys loaded. Enrollment must pass the real application admission flow before activation." : "Signed transactions are kept in the private journal. Resume the same stage; never delete the journal to retry." };
}
export async function executeStage({ stage, provider, store, loadSigner, policy = P, output = value => console.log(json(value)), readSnapshot = snapshot, receiptValidator = validateReceipt, reconcileOptions = {} }) {
  let journal = await store.load();
  let state = await readSnapshot(provider, policy);
  if (!journal) {
    if (stage !== "sellout") fail("Start with the sellout stage and preserve its private journal.");
    if (state.saleActivated || state.totalMinted !== 0n || state.randomnessRequested || state.prizePaid) fail("Collection is no longer pristine; reconcile outside activity before creating a journal.");
    const optionalAffiliateId = validateEnrollmentMembership(state, policy);
    const startingNonces = {};
    for (const [role, address] of Object.entries(policy.wallets)) {
      const latest = await provider.getTransactionCount(address, "latest"), pending = await provider.getTransactionCount(address, "pending");
      if (latest !== pending) fail("A pinned wallet has a pending transaction; wait and reconcile before starting.");
      startingNonces[role] = latest;
    }
    journal = { version: 1, chainId: String(policy.chainId), round: policy.round, factory: policy.factory, feeCap: String(policy.feeCap),
      createdAt: new Date().toISOString(), optionalAffiliateId, affiliateIds: Object.fromEntries(affiliateRoles.map(role => [role, state.affiliates[role].id.toString()])), startingNonces, entries: [] };
    await store.save(journal);
  }
  validateJournal(journal, policy);
  const save = () => store.save(journal);
  const beforeBroadcast = async (intent, entry) => {
    validateProgress(await readSnapshot(provider, policy), journal, policy);
    const current = await readSnapshot(provider, policy, { confirmations: 1 });
    validateProgress(current, journal, policy);
    const action = intent.action;
    if (["activate", ...mintActions].includes(action) && current.timestamp >= Number(policy.mintDeadline) - 300) fail("Mint deadline is too close; prepared transaction will not be broadcast.");
    if (action === "activate" && (current.saleActivated || current.vrfNativeBalance < 100_000_000_000_000_000n)) fail("Activation preconditions changed before broadcast.");
    if (mintActions.includes(action) && (!current.saleActivated || current.totalMinted !== [0n, 4n, 10n][mintActions.indexOf(action)])) fail("Mint stage preconditions changed before broadcast.");
    if (action === "request-randomness" && (current.totalMinted !== 20n || current.randomnessRequested)) fail("Randomness request preconditions changed before broadcast.");
    if (action.startsWith("finalize-") && (!current.randomnessReceived || current.revealed || current.drawCounter !== BigInt(entry.drawCounterBefore))) fail("Deterministic draw preconditions changed before broadcast.");
    if (action === "distribute-prize" && (!current.revealed || current.prizePaid)) fail("Prize preconditions changed before broadcast.");
    if (action.startsWith("claim-affiliate-") && current.affiliates[intent.role].claimable !== (intent.role === "AFFILIATE_A" ? policy.affiliateA : policy.affiliateB)) fail("Affiliate claim preconditions changed before broadcast.");
    if (action === "withdraw-operator" && (!current.prizePaid || current.withdrawableBalance !== policy.operator)) fail("Operator withdrawal preconditions changed before broadcast.");
    if (action === "recover-vrf" && (!current.randomnessReceived || current.subscriptionClosed || current.balance !== 0n)) fail("VRF recovery preconditions changed before broadcast.");
  };
  // Reconcile every prior receipt, including the exact prepared hash after an interrupted submission.
  for (const entry of journal.entries) await reconcileEntry({ entry, intent: actionIntent(entry.action, journal.affiliateIds, policy), policy, provider, save, validateReceipt: receiptValidator, beforeBroadcast, ...reconcileOptions });
  state = await readSnapshot(provider, policy); validateProgress(state, journal, policy);
  async function send(action) {
    if (journal.entries.some(entry => entry.action === action)) fail("Attempted to repeat an already journaled action.");
    const prior = journal.entries.at(-1);
    if (prior && fixedOrder.indexOf(prior.action) >= fixedOrder.indexOf(action)) fail("Action order would move backward; reconcile the existing journal.");
    state = await readSnapshot(provider, policy); validateProgress(state, journal, policy);
    if (["activate", ...mintActions].includes(action) && state.timestamp >= Number(policy.mintDeadline) - 300) fail("Less than five minutes remain before the immutable mint deadline. Do not start another mint stage.");
    const intent = actionIntent(action, journal.affiliateIds, policy);
    const nonce = journal.startingNonces[intent.role] + journal.entries.filter(entry => entry.role === intent.role).length;
    const entry = await prepareEntry({ intent, policy, provider, signer: await loadSigner(intent.role), nonce, savePrepared: async item => { if (action.startsWith("finalize-")) item.drawCounterBefore = state.drawCounter.toString(); journal.entries.push(item); await save(); } });
    output({ action, state: "prepared", hash: entry.hash });
    await reconcileEntry({ entry, intent, policy, provider, save, validateReceipt: receiptValidator, beforeBroadcast, ...reconcileOptions });
    output({ action, state: "confirmed", hash: entry.hash, blockNumber: entry.blockNumber });
    state = await readSnapshot(provider, policy); validateProgress(state, journal, policy);
  }
  if (stage === "sellout") {
    if (!state.saleActivated) {
      if (state.vrfNativeBalance < 100_000_000_000_000_000n) fail("VRF funding is below the rehearsal's 0.10 ETH minimum; investigate before activation.");
      await send("activate");
    }
    for (const action of mintActions) if (!journal.entries.some(entry => entry.action === action)) await send(action);
    if (!state.randomnessRequested) await send("request-randomness");
  } else if (stage === "draw") {
    if (state.totalMinted !== 20n || !state.randomnessRequested) fail("Sellout and the single randomness request must complete first.");
    if (!state.randomnessReceived) return { ...publicReport(state, journal, stage), waitingFor: "awaiting_real_VRF", nextStep: "Rerun draw after the genuine Chainlink callback; no replacement randomness request is created." };
    // One bounded finalization transaction per invocation. The deterministic stream is never reset.
    if (!state.revealed) {
      const attempts = journal.entries.filter(entry => entry.action.startsWith("finalize-")).length;
      if (attempts >= 8) fail("Eight finalization transactions were attempted. Inspect deterministic draw progress before continuing.");
      await send(`finalize-${attempts}`);
    }
  } else if (stage === "settle") {
    if (!state.revealed) fail("A verified revealed ranking is required before payouts.");
    validateScores(state, policy);
    if (!state.prizePaid) await send("distribute-prize");
    if (state.affiliates.AFFILIATE_A.claimed === 0n) await send("claim-affiliate-a");
    if (state.affiliates.AFFILIATE_B.claimed === 0n) await send("claim-affiliate-b");
    if (!journal.entries.some(entry => entry.action === "withdraw-operator")) {
      if (state.withdrawableBalance !== policy.operator) fail("Operator withdrawable amount differs from the fixed 0.0008 ETH budget.");
      await send("withdraw-operator");
    }
    if (!state.subscriptionClosed) await send("recover-vrf");
    if (!state.prizePaid || state.balance !== 0n || state.totalAffiliateClaimed !== policy.affiliateA + policy.affiliateB || !state.subscriptionClosed) fail("Settlement is incomplete; reconcile the journal.");
  }
  return publicReport(state, journal, stage);
}
export async function runRehearsal(args = process.argv.slice(2)) {
  const options = parseRehearsalArguments(args);
  const env = parseEnv(await readPrivate(new URL(".env.staging.local", root)));
  const manifest = JSON.parse(await readPrivate(new URL(".vercel/staging-wallet-addresses.json", root)));
  validateWalletManifest(manifest);
  const request = new FetchRequest(stagingProviderConfig(env).rpc.url); request.timeout = 15000;
  const provider = new JsonRpcProvider(request, Number(P.chainId), { staticNetwork: true, cacheTimeout: -1, batchMaxCount: 8 });
  const directory = new URL(".vercel/sepolia-20-ticket/", root);
  const store = await privateStore(directory);
  try {
    if (!options.execute) {
      const journal = await store.load(); if (journal) validateJournal(journal);
      console.log(json(publicReport(await snapshot(provider), journal, "status"))); return;
    }
    const result = await withRehearsalLock(directory, () => executeStage({ stage: options.stage, provider, store,
      loadSigner: async role => {
        if (!Object.hasOwn(P.wallets, role) || role === "AFFILIATE_C") fail("No signing capability exists for this role in the rehearsal.");
        const field = `${role}_PRIVATE_KEY`;
        const text = await readPrivate(new URL(".env.staging.wallets.local", root));
        const lines = text.split(/\r?\n/).filter(line => line.startsWith(`${field}=`));
        if (lines.length !== 1) fail("Dedicated rehearsal key field is missing or duplicated.");
        const signer = new Wallet(parseEnv(lines[0])[field]);
        if (!sameAddress(signer.address, P.wallets[role])) fail("Dedicated rehearsal key differs from its pinned wallet.");
        return signer;
      },
    }));
    console.log(json(result));
  } finally { provider.destroy(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await runRehearsal(); } catch (error) { console.error(safeError(error)); process.exitCode = 1; }
}
