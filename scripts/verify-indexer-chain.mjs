/**
 * Local-only integration proof. No external RPC or shared database writes.
 * INDEXER_CHAIN_TEST_ENV=.vercel/web-local-before-sepolia.env \
 * node --conditions=react-server --import tsx scripts/verify-indexer-chain.mjs
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { Contract, ContractFactory, JsonRpcProvider, keccak256, toBeHex, id } from 'ethers';
import pg from 'pg';
import { RpcChainReader } from '../apps/indexer/lib/chain.ts';
import { executeIndexerCycle } from '../apps/indexer/lib/indexer.ts';
import { PostgresIndexerStore } from '../apps/indexer/lib/store.ts';
import { persistCollection, stableSeriesId } from './sync-staging-collection.mjs';
import { legacyCreditLeaf } from '../packages/contracts/src/winner-credits.ts';

const root = new URL('../', import.meta.url);
const source = process.env.INDEXER_CHAIN_TEST_ENV;
assert.ok(source, 'Set INDEXER_CHAIN_TEST_ENV to a local-only database dotenv file.');
const databaseUrl = new URL(parseEnv(await readFile(source, 'utf8')).DATABASE_URL);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(databaseUrl.hostname), 'Only local PostgreSQL is allowed.');
const schema = `manekineko_indexer_chain_${randomUUID().replaceAll('-', '')}`;
const collectionId = randomUUID();
const contractVersion = process.env.INDEXER_CHAIN_TEST_VERSION ?? 'affiliate-v5';
assert.ok(['affiliate-v5', 'affiliate-v6'].includes(contractVersion), 'Choose V5 or V6 local test contracts.');
const version = contractVersion === 'affiliate-v6' ? 'V6' : 'V5';
const algorithmVersion = version === 'V6' ? 'unique-rank-v3' : 'unique-rank-v2';
const rewards = process.env.INDEXER_CHAIN_TEST_REWARDS === '1';
assert.ok(!rewards || version === 'V6', 'Winner rewards require V6 local contracts.');
const price = 10_000n;
const evidence = { runAt: new Date().toISOString(), localOnly: true, contractVersion, algorithmVersion, rewards, checks: [] };
const admin = new pg.Client({ connectionString: databaseUrl.href });
let created = false, pool, child, provider;

async function availablePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function artifact(name, directory = '') {
  return JSON.parse(await readFile(new URL(`apps/contracts/artifacts/contracts/${directory}${name}.sol/${name}.json`, root), 'utf8'));
}
function pass(check, details = {}) {
  evidence.checks.push({ check, ...details });
  console.log(`PASS ${check}`);
}

try {
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`); created = true;
  pool = new pg.Pool({ connectionString: databaseUrl.href, options: `-c search_path=${schema}`, max: 4 });
  const migrationClient = await pool.connect();
  try {
    const directory = new URL('database/migrations/', root);
    for (const name of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
      await migrationClient.query(await readFile(new URL(name, directory), 'utf8'));
    }
  } finally { migrationClient.release(); }
  pass('all migrations apply in a disposable local schema');

  const port = await availablePort();
  const rpcUrl = `http://127.0.0.1:${port}`;
  // Hardhat's disposable accounts are neither production nor Sepolia signers.
  // Suppress node logs: Hardhat prints its test private keys at startup.
  child = spawn(process.execPath, [fileURLToPath(new URL('node_modules/hardhat/dist/src/cli.js', root)),
    'node', '--hostname', '127.0.0.1', '--port', String(port), '--chain-id', '11155111'], {
    cwd: fileURLToPath(new URL('apps/contracts/', root)), stdio: 'ignore',
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'test' },
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    assert.equal(child.exitCode, null, 'The disposable Hardhat node exited before becoming ready.');
    try {
      const response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }), signal: AbortSignal.timeout(500) });
      if ((await response.json()).result === '0xaa36a7') break;
    } catch { /* Wait only for the local process owned by this harness. */ }
    assert.ok(attempt < 99, 'The disposable Hardhat node did not start.');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  provider = new JsonRpcProvider(rpcUrl, 11155111, { cacheTimeout: -1, staticNetwork: true, batchMaxCount: 20 });
  assert.equal(await provider.send('web3_clientVersion', []).then((value) => value.startsWith('HardhatNetwork/')), true);
  const owner = await provider.getSigner(0), buyer = await provider.getSigner(1);
  const ownerAddress = (await owner.getAddress()).toLowerCase();
  const buyerAddress = (await buyer.getAddress()).toLowerCase();
  async function deploy(name, args = [], directory = '') {
    const compiled = await artifact(name, directory);
    const instance = await new ContractFactory(compiled.abi, compiled.bytecode, owner).deploy(...args);
    await instance.waitForDeployment();
    return instance;
  }
  const mock = await deploy('VRFCoordinatorV2Mock', [], 'test/');
  // A local mock occupies the contract's pinned Sepolia coordinator address.
  // This Hardhat-only setup never calls a public RPC or changes the production contracts.
  const coordinatorAddress = '0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B';
  await provider.send('hardhat_setCode', [coordinatorAddress, await provider.getCode(await mock.getAddress())]);
  for (const slot of [0, 1]) await provider.send('hardhat_setStorageAt', [coordinatorAddress, toBeHex(slot), await provider.getStorage(await mock.getAddress(), slot)]);
  const coordinator = new Contract(coordinatorAddress, (await artifact('VRFCoordinatorV2Mock', 'test/')).abi, owner);
  const eligibility = version==='V6' ? await deploy('ManekinekoAffiliateEligibility',[ownerAddress]) : null;
  const factory = await deploy(`ManekinekoFactory${version}`, [ownerAddress]);
  const factoryAddress = (await factory.getAddress()).toLowerCase();
  const latest = await provider.getBlock('latest');
  const terms = { name: 'Local direct-mint indexer proof', symbol: 'IDXTEST', roundId: 1n, maxSupply: 20n,
    mintPrice: price, mintDeadline: BigInt(latest.timestamp + 86400), initialOwner: ownerAddress,
    vrfCoordinator: coordinatorAddress, keyHash: '0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae', requestConfirmations: 64,
    callbackGasLimit: 200_000, maxAffiliateSlots: 20n, enrollmentSigner: await (await provider.getSigner(2)).getAddress(), prizeBps: 5000n, affiliatePoolBps: 1000n,
    ...(eligibility?{affiliateEligibility:await eligibility.getAddress()}:{}) };
  const creation = await (await factory.createRound(terms)).wait();
  const roundAddress = (await factory.rounds(1)).toLowerCase();
  const round = new Contract(roundAddress, (await artifact(`ManekinekoRound${version}`)).abi, owner);
  if(eligibility){
    await(await eligibility.approveFactory(factoryAddress,keccak256(await provider.getCode(factoryAddress)))).wait();
    await(await eligibility.registerCollection(factoryAddress,1)).wait();
    assert.equal((await eligibility.collections(roundAddress)).sequence,1n);
  }
  const deploymentBlock = await provider.getBlock(creation.blockNumber);
  const snapshot = { contractVersion, algorithmVersion, collectionId, seriesId: stableSeriesId(factoryAddress), round: roundAddress, factory: factoryAddress,
    owner: ownerAddress, contract: JSON.parse(JSON.stringify(terms, (_, value) => typeof value === 'bigint' ? String(value) : value)),
    mintDurationSeconds: '86400', deploymentTransactionHash: creation.hash, deploymentBlock: creation.blockNumber,
    deployedAt: new Date(deploymentBlock.timestamp * 1000).toISOString(), blockNumber: creation.blockNumber,
    blockHash: creation.blockHash, enrollmentEnabled: false, archive: null,
    state: { phase: 'pending_activation', totalMinted: 0, totalMintRevenueWei: '0', settledCount: 0,
      refundedCount: 0, totalRefundedWei: '0', winningTokenId: null, highestScore: null, randomnessState: 'not_requested',
      randomnessRequestId: null, randomnessWord: null, prizePaid: false, prizeRecipient: null, prizePaidWei: '0', prizeTransactionHash: null } };
  const writer = await pool.connect();
  try { await persistCollection(writer, snapshot, { write: true }); } finally { writer.release(); }
  await (await round.fundRandomness({ value: await coordinator.MOCK_FEE() })).wait();
  let registry, legacyWin;
  if (rewards) {
    legacyWin={sourceRound:'0x0000000000000000000000000000000000001234',holder:buyerAddress,tokenId:'3',paidAt:String(latest.timestamp-100),transactionHash:'0x'+'11'.repeat(32)};
    registry=await deploy('ManekinekoWinnerCredits',[ownerAddress,legacyCreditLeaf(11155111,legacyWin)]);
    await (await registry.approveFactory(factoryAddress,keccak256(await provider.getCode(factoryAddress)))).wait();
    await (await registry.registerCollection(factoryAddress,1)).wait();
    await (await registry.fundCollection(roundAddress,{value:price})).wait();
  }
  await (await round.activateSale()).wait();
  const config = { contractVersion, databaseUrl: databaseUrl.href, rpcUrl, chainId: 11155111, factory: factoryAddress,
    factoryCodeHash: keccak256(await provider.getCode(factoryAddress)), confirmations: 2, blockRange: 500,
    maxBatches: 8, maxCollections: 10, timeBudgetMs: 45000, reconcileSeconds: 900, leaseSeconds: 300 };
  const store = new PostgresIndexerStore(pool);
  process.env.DATABASE_URL = databaseUrl.href;
  process.env.MANEKINEKO_CHAIN_ID = '11155111';
  globalThis.manekinekoCollectionPool = pool;
  const { listCollections } = await import('../apps/web/lib/collections/repository.ts');
  const { getHistory } = await import('../apps/web/lib/history/repository.ts');
  // Mine full blocks individually: hardhat_mine's synthetic intermediate blocks
  // are unsuitable for historical-state and canonical-parent reorganization checks.
  async function mine(count = 2) { for (let i = 0; i < count; i += 1) await provider.send('evm_mine', []); }
  async function cycle() {
    const result = await executeIndexerCycle({ chain: new RpcChainReader(provider, config), store, config });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.results.length, 1);
    return result;
  }
  async function counts(expected, phase = 'minting') {
    const state = (await pool.query('SELECT total_minted,total_mint_revenue_wei::text,phase FROM manekineko_collection_state WHERE collection_id=$1', [collectionId])).rows[0];
    assert.equal(state.total_minted, expected);
    assert.equal(state.total_mint_revenue_wei, String(BigInt(expected) * price));
    assert.equal(state.phase, phase);
    const catalog = await listCollections();
    const history = await getHistory();
    assert.equal(catalog.length, 1);
    assert.equal(catalog[0].totalMinted, expected);
    assert.equal(history.stats.totalTicketsMinted, expected);
    assert.equal(history.isMock, false);
    return history;
  }
  await mine(); await cycle(); await counts(0);
  pass(`actual ${version} factory registration indexes an activated collection at zero mints`);
  const beforeMint = await provider.send('evm_snapshot', []);
  // This bypasses every web API and wallet component, as an Etherscan write does.
  let sponsoredReceipt;
  if (rewards) {
    sponsoredReceipt=await (await registry.connect(buyer).redeemLegacy(legacyWin,[],roundAddress)).wait();
    assert.equal((await registry.credits(legacyWin.sourceRound)).redeemedIn.toLowerCase(),roundAddress);
    assert.equal((await registry.redeemedSource(buyerAddress)).toLowerCase(),legacyWin.sourceRound);
    assert.equal(await registry.sponsorBalance(roundAddress),0n);
    assert.equal(await round.totalReferredMints(),0n);
  }
  const quantity=rewards?2n:3n;
  const mintReceipt = await (await round.connect(buyer).mint(buyerAddress, quantity, { value: price * quantity })).wait();
  await mine(); await cycle();
  const current = await counts(3);
  assert.equal(current.collections.length, 0);
  assert.equal(current.inProgress[0].totalMinted, 3);
  const mintEvents = (await pool.query("SELECT count(*)::integer AS count FROM manekineko_chain_events WHERE collection_id=$1 AND event_name='Transfer'", [collectionId])).rows[0].count;
  assert.equal(mintEvents, 3);
  pass('direct contract mint updates SQL, public catalog and history to three tickets', { transaction: mintReceipt.hash, minted: 3 });
  if(rewards) {
    const sponsored=(await pool.query("SELECT arguments FROM manekineko_chain_events WHERE transaction_hash=$1 AND event_name='Minted'",[sponsoredReceipt.hash.toLowerCase()])).rows;
    assert.equal(sponsored.length,1);assert.equal(sponsored[0].arguments.recipient.toLowerCase(),buyerAddress);
    assert.equal(sponsored[0].arguments.payer.toLowerCase(),(await registry.getAddress()).toLowerCase());
    pass('operator-sponsored mint is indexed as a fully paid NFT owned by the winning wallet');
  }
  const beforeEvents = (await pool.query('SELECT count(*)::integer AS count FROM manekineko_chain_events WHERE collection_id=$1', [collectionId])).rows[0].count;
  await cycle(); await cycle(); await counts(3);
  assert.equal((await pool.query('SELECT count(*)::integer AS count FROM manekineko_chain_events WHERE collection_id=$1', [collectionId])).rows[0].count, beforeEvents);
  pass('duplicate delivery/reconciliation cannot double-count events or mint totals');
  assert.equal(await provider.send('evm_revert', [beforeMint]), true);
  await mine(6);
  const rollback = await cycle(); await counts(0);
  assert.equal(rollback.results[0].reorg, true);
  assert.equal((await pool.query('SELECT count(*)::integer AS count FROM manekineko_chain_events WHERE transaction_hash=$1', [mintReceipt.hash.toLowerCase()])).rows[0].count, 0);
  pass('chain reorganization removes orphan mint events and restores zero in both public projections');
  if(rewards){
    assert.equal((await registry.credits(legacyWin.sourceRound)).beneficiary,'0x0000000000000000000000000000000000000000');
    assert.equal(await registry.redeemedSource(buyerAddress),'0x0000000000000000000000000000000000000000');
    assert.equal(await registry.sponsorBalance(roundAddress),price);
    pass('orphaned redemption restores lifetime eligibility and sponsorship atomically on-chain');
    await (await registry.connect(buyer).redeemLegacy(legacyWin,[],roundAddress)).wait();
  }
  const replacementQuantity=rewards?1n:2n;
  await (await round.connect(buyer).mint(buyerAddress, replacementQuantity, { value: price * replacementQuantity })).wait();
  await mine(); await cycle(); await counts(2);
  pass('alternate canonical mint replaces the orphaned branch with two tickets');
  const beforeCompletion = await provider.send('evm_snapshot', []);
  await (await round.connect(buyer).mint(buyerAddress, 18, { value: price * 18n })).wait();
  await (await round.requestRandomness()).wait();
  await (await coordinator.fulfillRequest(await round.requestId(), 123456n)).wait();
  await (await round.finalizeDraw(8)).wait();
  await (await round.distributePrize()).wait();
  await mine(); await cycle();
  const completed = await counts(20, 'complete');
  assert.equal(completed.inProgress.length, 0);
  assert.equal(completed.collections.length, 1);
  assert.equal(completed.collections[0].winner.score, '20');
  assert.equal(completed.collections[0].winner.winningHolder, buyerAddress);
  assert.equal(completed.collections[0].winner.prizePaidWei, String(price * 10n));
  pass('real local VRF lifecycle archives the unique winner and verified prize without double-counting the collection');
  if(rewards){
    assert.equal(await round.winningHolder(),await buyer.getAddress());
    await assert.rejects(registry.claimCredit.staticCall(roundAddress),error=>error.revert?.name==='LifetimeRewardAlreadyUsed');
    assert.equal((await registry.credits(roundAddress)).beneficiary,'0x0000000000000000000000000000000000000000');
    assert.equal((await registry.redeemedSource(buyerAddress)).toLowerCase(),legacyWin.sourceRound);
    pass('winning again after a sponsored mint cannot renew the wallet lifetime reward');
  }
  if(eligibility) {
    const nextTerms={...terms,roundId:2n,mintDeadline:BigInt((await provider.getBlock('latest')).timestamp+86400)};
    await(await factory.createRound(nextTerms)).wait();
    const nextAddress=await factory.rounds(2),next=new Contract(nextAddress,(await artifact('ManekinekoRoundV6')).abi,owner);
    await(await eligibility.registerCollection(factoryAddress,2)).wait();
    assert.equal((await eligibility.collections(nextAddress)).sequence,2n);
    assert.equal(await eligibility.eligibilityStatus(nextAddress,buyerAddress,'0x0000000000000000000000000000000000000000',0),2n);
    const types={Enrollment:[{name:'applicant',type:'address'},{name:'affiliateId',type:'uint256'},{name:'poolBps',type:'uint256'},{name:'sourceCollection',type:'address'},{name:'sourceTokenId',type:'uint256'},{name:'nonce',type:'bytes32'},{name:'deadline',type:'uint256'}]};
    const domain={name:'ManekinekoAffiliateEnrollment',version:'4',chainId:11155111,verifyingContract:nextAddress};
    const issuer=await provider.getSigner(2),other=await provider.getSigner(3);
    const offer={applicant:buyerAddress,affiliateId:1n,poolBps:1000n,sourceCollection:roundAddress,sourceTokenId:1n,nonce:id('local-holder-enrollment'),deadline:BigInt((await provider.getBlock('latest')).timestamp+3600)};
    const signature=await issuer.signTypedData(domain,types,offer);
    await(await next.connect(buyer).enrollAffiliate(offer.applicant,offer.affiliateId,offer.poolBps,offer.sourceCollection,offer.sourceTokenId,offer.nonce,offer.deadline,signature)).wait();
    assert.equal(await eligibility.usedToken(nextAddress,roundAddress,1),true);
    await(await round.connect(buyer).transferFrom(buyerAddress,await other.getAddress(),1)).wait();
    assert.equal(await next.affiliateIdOf(buyerAddress),1n);
    assert.equal(await eligibility.eligibilityStatus(nextAddress,await other.getAddress(),roundAddress,1),4n);
    const reused={...offer,applicant:await other.getAddress(),affiliateId:2n,nonce:id('local-transferred-proof')};
    const reusedSignature=await issuer.signTypedData(domain,types,reused);
    await assert.rejects(next.connect(other).enrollAffiliate.staticCall(reused.applicant,reused.affiliateId,reused.poolBps,reused.sourceCollection,reused.sourceTokenId,reused.nonce,reused.deadline,reusedSignature));
    assert.equal(await next.affiliateIdOf(reused.applicant),0n);
    pass('second collection requires a completed NFT and transfer cannot reuse it or revoke the original position');
  }
  assert.equal(await provider.send('evm_revert', [beforeCompletion]), true);
  await mine(12); await cycle();
  const restored = await counts(2);
  assert.equal(restored.collections.length, 0);
  assert.equal(restored.inProgress.length, 1);
  assert.equal(restored.stats.uniqueWinners, 0);
  assert.equal((await pool.query('SELECT count(*)::integer AS count FROM manekineko_history_winners')).rows[0].count, 0);
  pass('a reorganization removes an orphaned winner and restores the live collection atomically');
  evidence.ok = true;
} finally {
  if (pool) await pool.end();
  delete globalThis.manekinekoCollectionPool;
  if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
  if (provider) provider.destroy();
  if (child && child.exitCode === null) {
    const exited = once(child, 'exit'); child.kill('SIGTERM');
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  evidence.cleanedUp = true;
  const directory = new URL('.vercel/indexer/', root);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(new URL(`local-chain-proof-${version.toLowerCase()}${rewards?'-rewards':''}.json`, directory), JSON.stringify(evidence, null, 2), { mode: 0o600 });
}
