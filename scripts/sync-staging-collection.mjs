import { readFile, lstat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { parseEnv } from 'node:util';
import { Contract, ContractFactory, JsonRpcProvider, getAddress, keccak256, ZeroAddress } from 'ethers';
import pg from 'pg';
import { verifyLaunchExport } from '../apps/launch/lib/launch-export.ts';
import { parseV5Config } from '../packages/contracts/src/v5-config.ts';
import { parseV10Config } from "../packages/contracts/src/v10-config.ts";
import { derivePermanentCombinationKey } from "../packages/contracts/src/permanent-combinations.ts";
import { parseV9Config } from "../packages/contracts/src/v9-config.ts";
import { parseV8Config } from '../packages/contracts/src/v8-config.ts';
import { parseV7Config } from '../packages/contracts/src/v7-config.ts';
import { parseV6Config } from '../packages/contracts/src/v6-config.ts';
import { decodeScrambledCombination } from '../packages/contracts/src/scrambled-rank.ts';
import { normalizeSeasonAppearance } from '../packages/contracts/src/season-appearance.ts';
import { matchesRuntime } from '../apps/contracts/scripts/runtime-match.ts';
import { loadStagingDatabaseConfig, inspectStagingDatabase } from './staging-database.mjs';
import { stagingProviderConfig } from './staging-provider-check.mjs';

const ROOT = new URL('../', import.meta.url);
const DEFAULT_ARTIFACT_ROOT = fileURLToPath(new URL('apps/contracts/artifacts/', ROOT));
const CHAIN = 11155111n;
const PHASES = ['pending_activation', 'minting', 'awaiting_request', 'awaiting_randomness', 'awaiting_finalization', 'awaiting_prize', 'complete', 'refundable'];
export const DEMO_COLLECTION_IDS = ['8fa5f8c0-6ef4-47f6-9af3-60b8101c9321', 'bd7a641e-125b-4d83-a7ec-9a5c87622002'];
export const DEMO_HISTORY_IDS = Array.from({ length: 8 }, (_, i) => `ad348b5a-8ad4-4719-82c4-0e2d5800200${i + 1}`);
class SyncError extends Error {}
const assert = (value, message) => { if (!value) throw new SyncError(message); };
const json = (value) => JSON.stringify(value, (_, x) => typeof x === 'bigint' ? x.toString() : x, 2);
const lower = (value) => getAddress(value).toLowerCase();
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const iso = (timestamp) => new Date(Number(timestamp) * 1000).toISOString();
function expectedGateAddress(address, env, version) {
  const prefix=version==='V10'?'AFFILIATE_ELIGIBILITY_V5':version==='V9'?'AFFILIATE_ELIGIBILITY_V4':version==='V8'?'AFFILIATE_ELIGIBILITY_V3':version==='V7'?'AFFILIATE_ELIGIBILITY_V2':'AFFILIATE_ELIGIBILITY';
  assert(address && same(address, env[`${prefix}_ADDRESS_11155111`])
    && /^0x[0-9a-f]{64}$/i.test(env[`${prefix}_CODEHASH_11155111`] ?? ''), 'Configure the finalized canonical affiliate eligibility pins.');
  return getAddress(address);
}

export function parseOptions(args) {
  const result = { write: false, removeMocks: false, enableEnrollment: false };
  const values = { '--journal': 'journal', '--manifest': 'manifest', '--expected-hash': 'expectedHash', '--collection-id': 'collectionId', '--output': 'output', '--artifact-root': 'artifactRoot' };
  const flags = { '--write': 'write', '--remove-mocks': 'removeMocks', '--enable-enrollment': 'enableEnrollment' };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    assert(!seen.has(option), 'Do not repeat options.'); seen.add(option);
    if (flags[option]) result[flags[option]] = true;
    else { assert(values[option] && args[i + 1] && !args[i + 1].startsWith('--'), 'Unsupported or incomplete sync option.'); result[values[option]] = args[++i]; }
  }
  assert(result.journal && result.manifest && /^[a-f0-9]{64}$/.test(result.expectedHash ?? '') && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(result.collectionId ?? ''), 'Supply --journal, --manifest, --expected-hash and --collection-id.');
  if (result.artifactRoot !== undefined) result.artifactRoot = resolveArtifactRoot(result.artifactRoot);
  return result;
}

export function resolveArtifactRoot(value = DEFAULT_ARTIFACT_ROOT) {
  assert(typeof value === 'string' && value.trim().length > 0 && !value.includes('\0') && !/^[a-z][a-z0-9+.-]*:\/\//i.test(value), 'Artifact root must be a local directory path.');
  return resolve(value);
}

export function stableSeriesId(factory) {
  const digest = createHash('sha256').update(`manekineko:11155111:${lower(factory)}`).digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

export function verifyJournalTerms(journal, artifact, timestamp) {
  assert(['affiliate-v5', 'affiliate-v6', 'affiliate-v7', 'affiliate-v8', "affiliate-v9", "affiliate-v10"].includes(artifact.contractVersion) && artifact.contract.chainId === String(CHAIN), 'Only finalized Sepolia V5 through V10 configurations are supported.');
  assert((journal.state === 'funded-enrollment-open' || ['affiliate-v6', 'affiliate-v7', 'affiliate-v8', "affiliate-v9", "affiliate-v10"].includes(artifact.contractVersion) && journal.state === 'funded-awaiting-affiliate-registration') && String(journal.preflight?.chainId) === String(CHAIN), 'Deployment journal is not confirmed and funded on Sepolia.');
  if (['affiliate-v7','affiliate-v8','affiliate-v9','affiliate-v10'].includes(artifact.contractVersion)) assert(journal.version === 2 && journal.configTimestamp === String(timestamp) && journal.preflight.configTimestamp === String(timestamp), 'Ranked awards require a version 2 journal bound to its canonical constructor timestamp.');
  const parsed = (artifact.contractVersion === "affiliate-v10" ? parseV10Config : artifact.contractVersion === "affiliate-v9" ? parseV9Config : artifact.contractVersion === "affiliate-v8" ? parseV8Config : artifact.contractVersion === 'affiliate-v7' ? parseV7Config : artifact.contractVersion === 'affiliate-v6' ? parseV6Config : parseV5Config)(artifact.contract, CHAIN, BigInt(timestamp));
  const expected = { ...parsed.config, roundId: BigInt(journal.preflight.config.roundId) };
  if (['affiliate-v6', 'affiliate-v7', 'affiliate-v8', "affiliate-v9", "affiliate-v10"].includes(artifact.contractVersion)) {
    assert(artifact.operations.affiliateEligibilityAddress && lower(artifact.operations.affiliateEligibilityAddress) !== ZeroAddress, 'V6–V10 registration requires its finalized holder-eligibility registry.');
    expected.affiliateEligibility = getAddress(artifact.operations.affiliateEligibilityAddress);
  }
  assert(expected.roundId > 0n, 'Invalid factory round ID.');
  for (const [key, value] of Object.entries(expected)) assert(["name", "symbol", "seasonName"].includes(key) ? journal.preflight.config[key] === value : same(journal.preflight.config[key], value), `Journal differs from finalized ${key}.`);
  assert(same(journal.preflight.from, artifact.operations.deployerAddress), 'Deployment signer differs from finalized configuration.');
  assert(same(journal.preflight.randomnessFundingWei, parsed.randomnessFundingWei) && journal.preflight.activateSale === false, 'Journal funding or activation differs from finalized configuration.');
  assert(Array.isArray(journal.transactions) && journal.transactions.every(x => x.state === 'confirmed' && /^0x[0-9a-f]{64}$/i.test(x.hash)), 'Journal contains unconfirmed transactions.');
  const actions = journal.transactions.map(x => x.action);
  const expectedActions = artifact.operations.factoryMode === 'new' ? ['deploy-factory', 'create-round', 'fund-randomness'] : ['create-round', 'fund-randomness'];
  assert(JSON.stringify(actions) === JSON.stringify(expectedActions), 'Journal transaction sequence is unexpected.');
  if (artifact.operations.factoryMode === 'existing') assert(same(journal.factory, artifact.operations.factoryAddress), 'Factory differs from finalized existing factory.');
  return expected;
}

async function artifact(name, artifactRoot = DEFAULT_ARTIFACT_ROOT) {
  assert(/^Manekineko(?:Factory|Round|Renderer|RoundDeployer|AffiliateEligibility)(?:V(?:[2-9]|10))?$/.test(name), 'Unsupported local artifact name.');
  return JSON.parse(await readFile(join(resolveArtifactRoot(artifactRoot), 'contracts', `${name}.sol`, `${name}.json`), 'utf8'));
}
async function canonical(provider, block) { assert((await provider.getBlock(block.number))?.hash === block.hash, 'Canonical block changed; repeat synchronization.'); }

export async function confirmReceipt(provider, entry, snapshotNumber, sender) {
  const [receipt, tx] = await Promise.all([provider.getTransactionReceipt(entry.hash), provider.getTransaction(entry.hash)]);
  assert(receipt?.status === 1 && tx && tx.chainId === CHAIN && same(tx.from, sender), 'Deployment receipt or transaction provenance is invalid.');
  assert(receipt.blockNumber === Number(entry.blockNumber) && receipt.blockHash === entry.blockHash && receipt.blockNumber <= snapshotNumber, 'Deployment journal receipt block differs or is not sufficiently confirmed.');
  assert((await provider.getBlock(receipt.blockNumber))?.hash === receipt.blockHash, 'Deployment receipt is not canonical.');
  return { receipt, tx };
}

export function snapshotFromValues(values, config) {
  const v8 = config.winnerCount !== undefined;
  const ranked = v8 || config.secondPrizeBps !== undefined;
  const phase = PHASES[Number(values.phase)];
  assert(phase, 'Unknown contract phase.');
  assert(values.totalMinted <= config.maxSupply && values.totalMintRevenue === values.totalMinted * config.mintPrice, 'Contract mint accounting differs from immutable configuration.');
  assert(values.totalRefunded === values.refundedCount * config.mintPrice, 'Refund accounting does not match ticket price.');
  assert(!values.revealed || (values.winningTokenId > 0n && values.winningTokenId <= config.maxSupply && values.highestScore === config.maxSupply), 'Finalized collection does not have its unique highest rank.');
  if (ranked) {
    if(v8){
      const count=BigInt(config.winnerCount),total=values.totalMintRevenue*config.prizeBps/10000n;
      assert(count>=1n&&count<=10n&&count<=config.maxSupply&&config.prizeBps>0n&&config.prizeBps%count===0n&&values.awardCount===count,"V8 award count differs from equal-prize configuration.");
      const each=total/count;
      assert(values.prizePaidAmount>=0n&&values.prizePaidAmount<=total&&(values.prizePaidAmount===0n||(values.revealed&&each>0n&&values.prizePaidAmount%each===0n)),"V8 cumulative prize accounting mismatch.");
    }else{
    assert(values.awardCount === 2n, 'V7 must expose exactly two awards.');
    const total = values.totalMintRevenue * config.prizeBps / 10000n;
    const second = values.totalMintRevenue * BigInt(config.secondPrizeBps) / 10000n;
    assert([0n, total - second, second, total].includes(values.prizePaidAmount) && (values.prizePaidAmount === 0n || values.revealed), 'V7 cumulative prize accounting mismatch.');
    }
  }
  assert(!values.prizePaid || (values.revealed && values.prizePaidAmount === values.totalMintRevenue * config.prizeBps / 10000n), 'Prize accounting mismatch.');
  return {
    phase, totalMinted: Number(values.totalMinted), totalMintRevenueWei: String(values.totalMintRevenue),
    settledCount: values.revealed ? Number(config.maxSupply) : 0, refundedCount: Number(values.refundedCount), totalRefundedWei: String(values.totalRefunded),
    winningTokenId: values.revealed ? Number(values.winningTokenId) : null, highestScore: values.revealed ? String(values.highestScore) : null,
    randomnessState: values.randomnessReceived ? 'fulfilled' : values.randomnessRequested ? 'pending' : 'not_requested',
    randomnessRequestId: values.randomnessRequested ? String(values.requestId) : null, randomnessWord: values.randomnessReceived ? String(values.randomWord) : null,
    prizePaid: values.prizePaid, prizeRecipient: values.prizePaid && !ranked ? lower(values.prizeRecipient) : null, prizePaidWei: String(values.prizePaidAmount), prizeTransactionHash: null,
  };
}

async function eventLogs(provider, address, topic, from, to) {
  const logs = [];
  // Bounded queries work with provider range limits; no unbounded eth_getLogs query.
  for (let start = from; start <= to; start += 1000) logs.push(...await provider.getLogs({ address, topics: [topic], fromBlock: start, toBlock: Math.min(to, start + 999) }));
  return logs;
}

export async function readVerifiedCollection(provider, journal, artifactConfig, collectionId, { env = {}, enableEnrollment = false, artifactRoot = DEFAULT_ARTIFACT_ROOT } = {}) {
  artifactRoot = resolveArtifactRoot(artifactRoot);
  assert(BigInt(await provider.send('eth_chainId', [])) === CHAIN, 'RPC is not Ethereum Sepolia.');
  const latest = await provider.getBlock('latest');
  assert(latest?.hash && Date.now() / 1000 - latest.timestamp < 300, 'RPC head is missing or stale.');
  const block = await provider.getBlock(latest.number - 2);
  assert(block?.hash, 'Cannot pin a confirmed snapshot block.');
  const preflightBlock = await provider.getBlock(journal.preflight.blockNumber);
  assert(preflightBlock?.hash === journal.preflight.blockHash, 'Deployment preflight block is not canonical.');
  if (journal.version === 2) assert(String(preflightBlock.timestamp) === journal.configTimestamp && String(journal.preflight.configTimestamp) === journal.configTimestamp, 'Journal constructor timestamp differs from its canonical initial block.');
  const config = verifyJournalTerms(journal, artifactConfig, preflightBlock.timestamp);
  const contractVersion = artifactConfig.contractVersion;
  const version = contractVersion === "affiliate-v10" ? "V10" : contractVersion === "affiliate-v9" ? "V9" : contractVersion === "affiliate-v8" ? "V8" : contractVersion === 'affiliate-v7' ? 'V7' : contractVersion === 'affiliate-v6' ? 'V6' : 'V5';
  const ranked = ['V7','V8','V9','V10'].includes(version);
  const algorithmVersion = version === 'V10' ? 'unique-rank-v6' : ['V8','V9'].includes(version) ? 'unique-rank-v5' : version === 'V7' ? 'unique-rank-v4' : version === 'V6' ? 'unique-rank-v3' : 'unique-rank-v2';
  const names = ['Factory', 'Round', 'Renderer', 'RoundDeployer'].map(component => `Manekineko${component}${version}`);
  const artifacts = await Promise.all(names.map(name => artifact(name, artifactRoot)));
  const addresses = [journal.factory, journal.round, journal.renderer, journal.deployer].map(getAddress);
  const codes = await Promise.all(addresses.map(address => provider.getCode(address, block.number)));
  for (let i = 0; i < 4; i++) assert(matchesRuntime(codes[i], artifacts[i]), `${names[i]} runtime differs from pinned local artifact.`);
  assert(keccak256(codes[0]) === journal.factoryCodeHash, 'Factory code hash differs from journal.');
  const [factory, round, , helper] = addresses.map((address, i) => new Contract(address, artifacts[i].abi, provider));
  const at = { blockTag: block.number };
  if (version === 'V6' || ranked) {
    const gateAddress = expectedGateAddress(config.affiliateEligibility, env, version);
    const gateArtifact = await artifact(version === 'V10' ? 'ManekinekoAffiliateEligibilityV5' : version === 'V9' ? 'ManekinekoAffiliateEligibilityV4' : version === 'V8' ? 'ManekinekoAffiliateEligibilityV3' : version === 'V7' ? 'ManekinekoAffiliateEligibilityV2' : 'ManekinekoAffiliateEligibility', artifactRoot);
    const gateCode = await provider.getCode(gateAddress, block.number);
    assert(matchesRuntime(gateCode, gateArtifact) && same(keccak256(gateCode), env[`${version==='V10'?'AFFILIATE_ELIGIBILITY_V5':version==='V9'?'AFFILIATE_ELIGIBILITY_V4':version==='V8'?'AFFILIATE_ELIGIBILITY_V3':version==='V7'?'AFFILIATE_ELIGIBILITY_V2':'AFFILIATE_ELIGIBILITY'}_CODEHASH_11155111`]), 'Canonical affiliate eligibility runtime differs.');
    const gate = new Contract(gateAddress, gateArtifact.abi, provider);
    assert(await gate.ELIGIBILITY_VERSION(at) === (version === 'V10' ? 'affiliate-eligibility-v5' : version === 'V9' ? 'affiliate-eligibility-v4' : version === 'V8' ? 'affiliate-eligibility-v3' : version === 'V7' ? 'affiliate-eligibility-v2' : 'affiliate-eligibility-v1'), 'Unsupported affiliate eligibility version.');
    if (enableEnrollment) {
      const registration = await gate.collections(addresses[1], at);
      assert(registration.sequence > 0n && !registration.sourceOnly && same(registration.factory, addresses[0]) && same(registration.roundId, config.roundId) && same(registration.codeHash, keccak256(codes[1])), 'Register this collection in the canonical holder-eligibility registry before enabling enrollment.');
    }
  }
  const links = await Promise.all([factory.renderer(at), factory.deployer(at), factory.rounds(config.roundId, at), helper.factory(at), round.renderer(at), round.CONTRACT_VERSION(at), round.subscriptionId(at), round.ALGORITHM_VERSION(at)]);
  assert(same(links[0], addresses[2]) && same(links[1], addresses[3]) && same(links[2], addresses[1]) && same(links[3], addresses[0]) && same(links[4], addresses[2]) && links[5] === contractVersion && same(links[6], journal.subscriptionId) && links[7] === algorithmVersion, 'Factory, helper, renderer or subscription binding mismatch.');
  const immutableNames = Object.keys(config).filter(x => x !== 'initialOwner');
  const immutableValues = await Promise.all(immutableNames.map(name => round[name](at)));
  immutableNames.forEach((name, i) => assert(["name", "symbol", "seasonName"].includes(name) ? immutableValues[i] === config[name] : same(immutableValues[i], config[name]), `Live ${name} differs from finalized deployment terms.`));
  if (['V9','V10'].includes(version)) assert(await round.MAX_MINTS_PER_WALLET(at) === 20n, 'Fixed wallet mint cap differs.');
  if (version === 'V10') assert(await round.combinationKey(at) === derivePermanentCombinationKey({chainId: CHAIN, collectionAddress: journal.round, roundId: config.roundId, seasonId: config.seasonId, maxSupply: config.maxSupply}), 'Permanent combination key differs from deployed identity.');
  const receipts = [];
  for (const entry of journal.transactions) receipts.push(await confirmReceipt(provider, entry, block.number, artifactConfig.operations.deployerAddress));
  const createIndex = journal.transactions.findIndex(x => x.action === 'create-round');
  const creation = receipts[createIndex];
  assert(same(creation.tx.to, journal.factory) && creation.tx.value === 0n && creation.tx.data === factory.interface.encodeFunctionData('createRound', [config]), 'Factory creation transaction differs from reviewed terms.');
  const events = creation.receipt.logs.filter(log => same(log.address, journal.factory)).flatMap(log => { try { const parsed = factory.interface.parseLog(log); return parsed?.name === 'RoundCreated' ? [parsed] : []; } catch { return []; } });
  assert(events.length === 1 && same(events[0].args.round, journal.round) && events[0].args.roundId === config.roundId && same(events[0].args.roundOwner, config.initialOwner), 'RoundCreated event does not prove this collection.');
  const funding = receipts.at(-1);
  assert(same(funding.tx.to, journal.round) && funding.tx.value === BigInt(artifactConfig.contract.randomnessFundingWei) && funding.tx.data === round.interface.encodeFunctionData('fundRandomness'), 'Randomness funding transaction differs from approved reserve.');
  if (artifactConfig.operations.factoryMode === 'new') {
    const deployment = await new ContractFactory(artifacts[0].abi, artifacts[0].bytecode).getDeployTransaction(artifactConfig.operations.factoryOwnerAddress);
    assert(same(receipts[0].receipt.contractAddress, journal.factory) && receipts[0].tx.to === null && receipts[0].tx.value === 0n && receipts[0].tx.data === deployment.data, 'Factory deployment provenance mismatch.');
  }
  const fields = ['owner', 'phase', 'saleActivated', 'totalMinted', 'totalMintRevenue', 'refundedCount', 'totalRefunded', 'randomnessRequested', 'randomnessReceived', 'requestId', 'randomWord', 'revealed', 'winningTokenId', 'highestScore', 'prizePaid', 'prizeRecipient', 'prizePaidAmount'];
  if (ranked) fields.push('awardCount');
  const raw = Object.fromEntries(await Promise.all(fields.map(async field => [field, await round[field](at)])));
  const state = snapshotFromValues(raw, config);
  const createdBlock = await provider.getBlock(creation.receipt.blockNumber);
  let archive = null;
  if (raw.prizePaid && !ranked) {
    const logs = await eventLogs(provider, journal.round, round.interface.getEvent('PrizeDelivered').topicHash, createdBlock.number, block.number);
    assert(logs.length === 1 && !logs[0].removed, 'A unique confirmed PrizeDelivered event is required.');
    const paid = round.interface.parseLog(logs[0]).args;
    const paidReceipt = await provider.getTransactionReceipt(logs[0].transactionHash);
    const paidBlock = await provider.getBlock(logs[0].blockNumber);
    assert(paidReceipt?.status === 1 && paidReceipt.blockHash === paidBlock.hash && logs[0].blockHash === paidBlock.hash && paid.tokenId === raw.winningTokenId && paid.amount === raw.prizePaidAmount && same(paid.recipient, raw.prizeRecipient), 'Prize event does not match the confirmed snapshot.');
    state.prizeTransactionHash = logs[0].transactionHash;
    const combination = await round.combination(raw.winningTokenId, at);
    const key = version === 'V6' ? await round.combinationKey(at) : null;
    const numbers = Array.from(combination[0], Number);
    const decoded = key ? decodeScrambledCombination(numbers, key) : { score: String(BigInt(combination[1]) + 1n), combinationCode: String(combination[1]) };
    assert(decoded.score === String(config.maxSupply) && decoded.score === String(combination[2]) && decoded.combinationCode === String(combination[1]), 'Winning combination does not decode to the maximum score.');
    if (version === 'V6') assert(String(await round.scoreCombination(numbers, at)) === decoded.score, 'On-chain combination decoder mismatch.');
    archive = { status: 'completed', closedAt: iso(paidBlock.timestamp), winner: { tokenId: Number(paid.tokenId), holder: lower(paid.holder), recipient: lower(paid.recipient), amount: String(paid.amount), numbers: Array.from(combination[0], Number), code: String(combination[1]), score: String(combination[2]), key } };
  }
  // A refund-eligible round is not a completed refund. Archive only after every actual buyer was repaid.
  if (!ranked && state.phase === 'refundable' && raw.totalMinted > 0n && raw.refundedCount === raw.totalMinted) {
    const logs = await eventLogs(provider, journal.round, round.interface.getEvent('Refunded').topicHash, createdBlock.number, block.number);
    assert(logs.length === Number(raw.refundedCount), 'Refund archive requires every confirmed refund event.');
    const tokenIds = new Set();
    for (const log of logs) {
      const refund = round.interface.parseLog(log).args;
      const receipt = await provider.getTransactionReceipt(log.transactionHash);
      const refundBlock = await provider.getBlock(log.blockNumber);
      assert(!log.removed && receipt?.status === 1 && receipt.blockHash === refundBlock.hash && log.blockHash === refundBlock.hash
        && refund.tokenId > 0n && refund.tokenId <= raw.totalMinted && refund.amount === config.mintPrice && !tokenIds.has(String(refund.tokenId)), 'Refund event provenance or amount is invalid.');
      tokenIds.add(String(refund.tokenId));
    }
    const closing = await provider.getBlock(logs.at(-1).blockNumber);
    assert(closing.hash === logs.at(-1).blockHash, 'Final refund block is not canonical.');
    archive = { status: 'refunded', closedAt: iso(closing.timestamp), winner: null };
  }
  if (enableEnrollment) {
    assert(lower(env[`AFFILIATE_TRUSTED_FACTORY_${version}_11155111`] ?? ZeroAddress) === lower(journal.factory) && env[`AFFILIATE_TRUSTED_FACTORY_CODEHASH_${version}_11155111`] === journal.factoryCodeHash, 'Enrollment requires the verified factory address and code hash in the staging environment.');
    if (ranked) assert(BigInt(block.timestamp) < config.saleStartAt, 'Enrollment closed at the immutable scheduled mint opening.');
    assert(state.phase === 'pending_activation', 'Enrollment can only be enabled before sale activation.');
  }
  await canonical(provider, block);
  return { schemaVersion: 1, chainId: String(CHAIN), contractVersion, algorithmVersion, collectionId, seriesId: stableSeriesId(journal.factory), configurationHash: artifactConfig.contentHash,
    factory: lower(journal.factory), factoryCodeHash: journal.factoryCodeHash, renderer: lower(journal.renderer), helper: lower(journal.deployer), round: lower(journal.round),
    contract: JSON.parse(json(config)), mintDurationSeconds: artifactConfig.contract.mintDurationSeconds, owner: lower(raw.owner), subscriptionId: String(journal.subscriptionId),
    deploymentTransactionHash: creation.tx.hash, deploymentBlock: createdBlock.number, deployedAt: iso(createdBlock.timestamp), enrollmentEnabled: enableEnrollment,
    blockNumber: block.number, blockHash: block.hash, blockTimestamp: iso(block.timestamp), state, archive };
}

/** Returns only the original seed IDs; it never selects a live row for deletion. Call inside a transaction. */
export async function inspectMockRemoval(client) {
  const catalog = (await client.query(`SELECT c.id FROM manekineko_collections c
    JOIN manekineko_deployments d ON d.collection_id=c.id
    LEFT JOIN manekineko_affiliate_programs p ON p.collection_id=c.id
    WHERE c.id=ANY($1::uuid[]) AND c.chain_id=11155111 AND c.algorithm_version='feistel-v1'
      AND d.status='undeployed' AND d.contract_address IS NULL AND d.transaction_hash IS NULL
      AND (p.collection_id IS NULL OR (p.mode='demo' AND NOT p.enrollment_enabled))
      AND NOT EXISTS(SELECT 1 FROM manekineko_collection_state s WHERE s.collection_id=c.id)
      AND NOT EXISTS(SELECT 1 FROM manekineko_affiliate_challenges a WHERE a.collection_id=c.id)
      AND NOT EXISTS(SELECT 1 FROM manekineko_affiliate_rate_limits a WHERE a.collection_id=c.id)
    ORDER BY c.id FOR UPDATE OF c,d`, [DEMO_COLLECTION_IDS])).rows.map(x => x.id);
  const history = (await client.query(`SELECT h.id FROM manekineko_collection_history h
    WHERE h.id=ANY($1::uuid[]) AND h.chain_id=11155111 AND h.is_mock=true
      AND h.series_id='942bc2a0-8b13-46a0-9434-05014f9b2026'
      AND NOT EXISTS(SELECT 1 FROM manekineko_deployments d WHERE d.collection_id=h.id)
    ORDER BY h.id FOR UPDATE`, [DEMO_HISTORY_IDS])).rows.map(x => x.id);
  return { catalog, history };
}
export async function removeMockRecords(client, preview) {
  // Reinspect while the caller holds its transaction locks; never trust an old caller-provided list.
  const current = await inspectMockRemoval(client);
  assert(JSON.stringify(current) === JSON.stringify(preview), 'Mock removal candidates changed; repeat preview.');
  await client.query('DELETE FROM manekineko_affiliate_demo_accounts WHERE collection_id=ANY($1::uuid[])', [current.catalog]);
  await client.query("DELETE FROM manekineko_affiliate_programs WHERE collection_id=ANY($1::uuid[]) AND mode='demo'", [current.catalog]);
  await client.query("DELETE FROM manekineko_deployments WHERE collection_id=ANY($1::uuid[]) AND status='undeployed' AND transaction_hash IS NULL", [current.catalog]);
  await client.query('DELETE FROM manekineko_collections WHERE id=ANY($1::uuid[])', [current.catalog]);
  await client.query('DELETE FROM manekineko_collection_history WHERE id=ANY($1::uuid[]) AND is_mock', [current.history]);
  return current;
}

export async function persistCollection(client, snapshot, { write = false, removeMocks = false, beforeCommit = async () => {} } = {}) {
  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('manekineko-staging-live-catalog',0))");
    const id = snapshot.collectionId, c = snapshot.contract, s = snapshot.state;
    const { contractVersion, algorithmVersion } = snapshot;
    assert((contractVersion === 'affiliate-v10' && algorithmVersion === 'unique-rank-v6') || (contractVersion === 'affiliate-v5' && algorithmVersion === 'unique-rank-v2') || (contractVersion === 'affiliate-v6' && algorithmVersion === 'unique-rank-v3') || (contractVersion === 'affiliate-v7' && algorithmVersion === 'unique-rank-v4') || ((contractVersion === "affiliate-v8" || contractVersion === "affiliate-v9") && algorithmVersion === 'unique-rank-v5'), 'Unsupported contract and algorithm version pair.');
    const v8 = ["affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(contractVersion);
    const ranked = v8 || contractVersion === 'affiliate-v7';
    if (ranked) {
      assert(!snapshot.archive, 'Ranked outcomes must be indexed as normalized awards, never inserted into the legacy archive.');
      for (const field of [v8?'winnerCount':'secondPrizeBps','minAffiliateReferrals','affiliatePayoutCapBps','saleStartAt']) assert(typeof c[field] === 'string' && /^[1-9]\d*$/.test(c[field]), `Ranked ${field} must be a positive canonical integer.`);
      assert(BigInt(c.minAffiliateReferrals)<=BigInt(c.maxSupply)&&BigInt(c.affiliatePayoutCapBps)<=10000n,'Ranked affiliate terms are invalid.');
      if(v8)assert(c.secondPrizeBps===undefined&&BigInt(c.winnerCount)<=10n&&BigInt(c.winnerCount)<=BigInt(c.maxSupply)&&BigInt(c.prizeBps)>0n&&BigInt(c.prizeBps)%BigInt(c.winnerCount)===0n,'V8 equal-prize terms are invalid.');
      else assert(BigInt(c.secondPrizeBps)*2n<=BigInt(c.prizeBps)&&BigInt(c.maxSupply)>=2n,'V7 immutable terms are invalid.');
    }
    if (contractVersion === 'affiliate-v6' || ranked) {
      const appearance = normalizeSeasonAppearance(c);
      for (const [key,value] of Object.entries(appearance)) assert(c[key] === value, 'Season artwork must match the canonical reviewed values.');
    }
    if (snapshot.archive?.winner) {
      const w = snapshot.archive.winner;
      assert(Array.isArray(w.numbers) && w.numbers.length === 4 && w.numbers.every(n => Number.isInteger(n) && n >= 1 && n <= 16), 'Invalid winning combination.');
      const code = w.numbers.reduce((packed, n) => (packed << 4) | (n - 1), 0);
      const decoded = contractVersion === 'affiliate-v6' ? decodeScrambledCombination(w.numbers, w.key)
        : { combinationCode: String(code), score: String(code + 1) };
      assert(decoded.combinationCode === w.code && decoded.score === w.score && w.score === String(c.maxSupply)
        && (contractVersion === 'affiliate-v6' || w.key == null), 'Winning combination does not match its versioned score.');
    }
    const existing = (await client.query(`SELECT c.*, d.contract_address, d.factory_address, d.transaction_hash, d.deployment_block::text,
      s.block_number::text,s.block_hash FROM manekineko_collections c LEFT JOIN manekineko_deployments d ON d.collection_id=c.id
      LEFT JOIN manekineko_collection_state s ON s.collection_id=c.id WHERE c.id=$1 FOR UPDATE OF c`, [id])).rows[0];
    if (existing) {
      const match = { series_id: snapshot.seriesId, chain_id: CHAIN, round_id: c.roundId, name: c.name, symbol: c.symbol, max_supply: c.maxSupply,
        mint_price_wei: c.mintPrice, mint_duration_seconds: snapshot.mintDurationSeconds, contract_version: contractVersion, prize_bps: c.prizeBps, affiliate_pool_bps: c.affiliatePoolBps,
        algorithm_version: algorithmVersion, randomness_provider: 'chainlink-vrf-v2.5', contract_address: snapshot.round, factory_address: snapshot.factory,
        transaction_hash: snapshot.deploymentTransactionHash, deployment_block: snapshot.deploymentBlock, ...(ranked ? { ...(v8?{winner_count:c.winnerCount,second_prize_bps:null}:{second_prize_bps:c.secondPrizeBps}), min_affiliate_referrals: c.minAffiliateReferrals, affiliate_payout_cap_bps: c.affiliatePayoutCapBps } : {}), ...(c.seasonId ? { season_id: c.seasonId, season_name: c.seasonName, collection_color: c.collectionColor, text_color: c.textColor } : {}) };
      for (const [key, value] of Object.entries(match)) assert(["name", "symbol", "season_name"].includes(key) ? existing[key] === value : same(existing[key], value), `Existing collection ${key} differs; refusing to relabel or overwrite it.`);
      if (ranked) assert(new Date(existing.sale_start_at).toISOString() === iso(c.saleStartAt), 'Existing collection sale_start_at differs; refusing to relabel or overwrite it.');
      assert(existing.block_number === null || BigInt(existing.block_number) <= BigInt(snapshot.blockNumber), 'Refusing to replace a newer confirmed snapshot.');
      assert(existing.block_number !== String(snapshot.blockNumber) || existing.block_hash === snapshot.blockHash, 'Stored block was reorganized; manual reconciliation is required.');
    }
    const mocks = removeMocks ? await inspectMockRemoval(client) : null;
    const report = { mode: write ? 'written' : 'preview', collectionId: id, existing: Boolean(existing), round: snapshot.round, phase: s.phase,
      snapshotBlock: snapshot.blockNumber, snapshotHash: snapshot.blockHash, archive: snapshot.archive?.status ?? null, ...(ranked ? { statePersistence: 'indexer-owned', indexingRequired: true } : {}), enrollmentEnabled: snapshot.enrollmentEnabled, removeMocks: mocks };
    if (!write) { await client.query('ROLLBACK'); return report; }
    if (mocks) await removeMockRecords(client, mocks);
    await client.query(`INSERT INTO manekineko_networks(chain_id,name,currency_symbol,currency_decimals,explorer_url)
      VALUES(11155111,'Ethereum Sepolia','ETH',18,'https://sepolia.etherscan.io') ON CONFLICT(chain_id) DO NOTHING`);
    await client.query(`INSERT INTO manekineko_series(id,name) VALUES($1,$2) ON CONFLICT(id) DO NOTHING`, [snapshot.seriesId, c.seasonName ?? 'Manekineko Sepolia']);
    await client.query(`INSERT INTO manekineko_collections(id,series_id,chain_id,round_id,slug,name,symbol,description,max_supply,mint_price_wei,mint_duration_seconds,reveal_delay_blocks,
      algorithm_version,randomness_provider,contract_version,prize_bps,affiliate_pool_bps,created_at,season_id,season_name,collection_color,text_color,second_prize_bps,min_affiliate_referrals,affiliate_payout_cap_bps,sale_start_at,winner_count)
      VALUES($1,$2,11155111,$3,$4,$5,$6,'An Ethereum Sepolia collection with on-chain tickets and verifiable Chainlink VRF randomness.',$7,$8,$9,NULL,$13,'chainlink-vrf-v2.5',$14,$10,$11,$12,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      ON CONFLICT(id) DO NOTHING`, [id,snapshot.seriesId,c.roundId,`sepolia-${id}`,c.name,c.symbol,c.maxSupply,c.mintPrice,snapshot.mintDurationSeconds,c.prizeBps,c.affiliatePoolBps,snapshot.deployedAt,algorithmVersion,contractVersion,c.seasonId ?? null,c.seasonName ?? null,c.collectionColor ?? null,c.textColor ?? null,ranked && !v8 ? c.secondPrizeBps : null,ranked ? c.minAffiliateReferrals : null,ranked ? c.affiliatePayoutCapBps : null,ranked ? iso(c.saleStartAt) : null,v8 ? c.winnerCount : null]);
    await client.query(`INSERT INTO manekineko_deployments(collection_id,chain_id,status,contract_address,factory_address,owner_address,transaction_hash,deployment_block,mint_deadline,deployed_at)
      VALUES($1,11155111,'deployed',$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(collection_id) DO UPDATE SET owner_address=EXCLUDED.owner_address`,
      [id,snapshot.round,snapshot.factory,snapshot.owner,snapshot.deploymentTransactionHash,snapshot.deploymentBlock,iso(c.mintDeadline),snapshot.deployedAt]);
    await client.query(`INSERT INTO manekineko_affiliate_programs(collection_id,mode,contract_version,max_slots,commission_bps,enrollment_enabled,enrollment_signer,affiliate_rates_bps)
      VALUES($1,'live',$5,$2,NULL,$3,$4,'{}') ON CONFLICT(collection_id) DO NOTHING`, [id,c.maxAffiliateSlots,snapshot.enrollmentEnabled,lower(c.enrollmentSigner),contractVersion]);
    const program = (await client.query('SELECT * FROM manekineko_affiliate_programs WHERE collection_id=$1 FOR UPDATE', [id])).rows[0];
    assert(program.mode === 'live' && program.contract_version === contractVersion && same(program.max_slots,c.maxAffiliateSlots) && same(program.enrollment_signer,c.enrollmentSigner) && program.affiliate_rates_bps.length === 0, 'Existing affiliate program differs from deployment.');
    // Normal refresh preserves an already-enabled program; explicit enablement checks pins before this point.
    if (snapshot.enrollmentEnabled) await client.query('UPDATE manekineko_affiliate_programs SET enrollment_enabled=true WHERE collection_id=$1', [id]);
    // Ranked state and every award are atomically rebuilt by the canonical indexer.
    // Catalog admission must not fabricate an incomplete revealed/prize snapshot.
    if (!ranked) {
    const columns = ['collection_id','phase','total_minted','total_mint_revenue_wei','settled_count','refunded_count','total_refunded_wei','winning_token_id','highest_score',
      'randomness_state','randomness_request_id','randomness_word','prize_paid','prize_recipient','prize_paid_wei','prize_transaction_hash','block_number','block_hash'];
    const values = [id,s.phase,s.totalMinted,s.totalMintRevenueWei,s.settledCount,s.refundedCount,s.totalRefundedWei,s.winningTokenId,s.highestScore,s.randomnessState,s.randomnessRequestId,s.randomnessWord,s.prizePaid,s.prizeRecipient,s.prizePaidWei,s.prizeTransactionHash,snapshot.blockNumber,snapshot.blockHash];
    await client.query(`INSERT INTO manekineko_collection_state(${columns.join(',')}) VALUES(${values.map((_,i)=>`$${i+1}`).join(',')})
      ON CONFLICT(collection_id) DO UPDATE SET ${columns.slice(1).map(name=>`${name}=EXCLUDED.${name}`).join(',')},synced_at=now()`,values);
    }
    if (snapshot.archive) {
      const a = snapshot.archive;
      await client.query(`INSERT INTO manekineko_collection_history(id,series_id,chain_id,round_id,name,symbol,max_supply,total_minted,mint_price_wei,total_refunded_wei,status,opened_at,closed_at,is_mock,
        algorithm_version,randomness_provider,contract_version,prize_bps,affiliate_pool_bps)
        VALUES($1,$2,11155111,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,$15,'chainlink-vrf-v2.5',$16,$13,$14) ON CONFLICT(id) DO NOTHING`,
        [id,snapshot.seriesId,c.roundId,c.name,c.symbol,c.maxSupply,s.totalMinted,c.mintPrice,s.totalRefundedWei,a.status,snapshot.deployedAt,a.closedAt,c.prizeBps,c.affiliatePoolBps,algorithmVersion,contractVersion]);
      if (a.winner) {
        const w=a.winner;
        await client.query(`INSERT INTO manekineko_history_winners(collection_id,token_id,number_a,number_b,number_c,number_d,combination_code,score,prize_recipient,prize_paid_wei,paid_at,algorithm_version,winning_holder,combination_key)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$13,$12,$14) ON CONFLICT(collection_id) DO NOTHING`, [id,w.tokenId,...w.numbers,w.code,w.score,w.recipient,w.amount,a.closedAt,w.holder,algorithmVersion,w.key ?? null]);
      }
      const stored = (await client.query(`SELECT h.*,w.token_id,w.winning_holder,w.prize_recipient,w.prize_paid_wei::text,w.score::text,w.combination_code::text,
        w.number_a,w.number_b,w.number_c,w.number_d,w.combination_key FROM manekineko_collection_history h LEFT JOIN manekineko_history_winners w ON w.collection_id=h.id WHERE h.id=$1`,[id])).rows[0];
      assert(stored && !stored.is_mock && stored.status===a.status && stored.series_id===snapshot.seriesId && same(stored.round_id,c.roundId)
        && stored.contract_version===contractVersion && stored.algorithm_version===algorithmVersion && same(stored.prize_bps,c.prizeBps) && same(stored.affiliate_pool_bps,c.affiliatePoolBps)
        && stored.closed_at.toISOString()===a.closedAt && stored.opened_at.toISOString()===snapshot.deployedAt && same(stored.total_minted,s.totalMinted)
        && same(stored.max_supply,c.maxSupply) && same(stored.mint_price_wei,c.mintPrice) && same(stored.total_refunded_wei,s.totalRefundedWei), 'Existing archive differs from confirmed chain outcome.');
      if(a.winner) {
        const w=a.winner;
        assert(same(stored.token_id,w.tokenId) && same(stored.winning_holder,w.holder) && same(stored.prize_recipient,w.recipient)
          && stored.prize_paid_wei===w.amount && stored.score===w.score && stored.combination_code===w.code && (stored.combination_key ?? null)===(w.key ?? null)
          && JSON.stringify([stored.number_a,stored.number_b,stored.number_c,stored.number_d])===JSON.stringify(w.numbers), 'Existing winner differs from confirmed PrizeDelivered evidence.');
      } else assert(stored.token_id===null,'Refunded archive cannot contain a winner.');
    }
    await beforeCommit();
    await client.query('COMMIT'); return report;
  } catch(error) { await client.query('ROLLBACK'); throw error; }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const path = new URL('.env.staging.local',ROOT);
  const mode = await lstat(path); assert(mode.isFile() && !mode.isSymbolicLink() && !(mode.mode & 0o077), 'Staging environment must be a private regular file.');
  const env = parseEnv(await readFile(path,'utf8'));
  const providerConfig = stagingProviderConfig(env);
  const manifest = verifyLaunchExport(JSON.parse(await readFile(options.manifest,'utf8')),options.expectedHash);
  const journal = JSON.parse(await readFile(options.journal,'utf8'));
  const provider = new JsonRpcProvider(providerConfig.rpc.url,Number(CHAIN),{ staticNetwork:true });
  const databaseConfig = await loadStagingDatabaseConfig();
  const client = new pg.Client({ connectionString:databaseConfig.admin.connectionString,connectionTimeoutMillis:10000,statement_timeout:30000,application_name:'manekineko-staging-collection-sync' });
  try {
    const snapshot = await readVerifiedCollection(provider,journal,{...manifest,contentHash:options.expectedHash},options.collectionId,{env,enableEnrollment:options.enableEnrollment,artifactRoot:options.artifactRoot});
    await client.connect();
    assert((await inspectStagingDatabase(client,databaseConfig)).initialized,'Staging database must already be provisioned.');
    const finalized = (await client.query('SELECT status,content_hash FROM manekineko_launch_configurations WHERE id=$1',[options.collectionId])).rows[0];
    assert(finalized?.status === 'finalized' && finalized.content_hash === options.expectedHash,'Collection ID and export must match the finalized record in this staging database.');
    const result = await persistCollection(client,snapshot,{...options,beforeCommit:()=>canonical(provider,{number:snapshot.blockNumber,hash:snapshot.blockHash})});
    if(options.output) await writeFile(options.output,`${json({result,snapshot})}\n`,{mode:0o600});
    console.log(json({result,snapshot}));
  } finally { await client.end().catch(()=>{}); provider.destroy(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error=>{ console.error(error instanceof SyncError ? error.message : 'Collection synchronization failed. Check approved configuration, RPC availability and database access. Provider details were withheld to protect credentials.');process.exitCode=1; });
}
