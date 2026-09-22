import { expect } from "chai";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Contract, ContractFactory, Transaction, Wallet } from "ethers";
import { artifacts, network } from "hardhat";
import type { Provider, TransactionReceipt, TransactionRequest } from "ethers";
import { cappedFees, checkSignedIntent, configFingerprint, feeCeiling, journaledTransactions, openJournal, validateJournal, validateJournalAnchor } from "../scripts/deployment-journal.js";
import type { DeploymentJournal } from "../scripts/deployment-journal.js";
import { parseV5Config } from "../scripts/v5-config.js";

const ceiling = 5_000_000_000n;
const wallet = Wallet.createRandom();
const recipient = Wallet.createRandom().address;
const hash = `0x${"11".repeat(32)}`;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function makeJournal(): DeploymentJournal {
  return { version: 2, inputHash: hash, configTimestamp: "1000", maxFeePerGasWei: String(ceiling), startingNonce: 5,
    from: wallet.address, chainId: "11155111", existingFactory: null, preflight: { config: { roundId: "1" } }, state: "prepared", transactions: [] };
}
function fixture() {
  let journal = makeJournal(), persisted = clone(journal), nonce = 5, pendingNonce = 5;
  let chainId = 11155111n, baseFee = 1_000_000_000n, ambiguous = false, receiptVisible = true, canonical = true;
  const sent: string[] = [], receipts = new Map<string, TransactionReceipt>(), pending = new Map<string, Transaction>();
  const provider = {
    getNetwork: async () => ({ chainId }),
    getTransactionCount: async (_: string, tag: string) => tag === "pending" ? pendingNonce : nonce,
    getBlock: async (tag: string | number) => ({ number: typeof tag === "number" ? tag : 101, hash: canonical ? hash : `0x${"22".repeat(32)}`, baseFeePerGas: baseFee }),
    getFeeData: async () => ({ maxPriorityFeePerGas: 1_000_000n }),
    estimateGas: async () => 100_000n,
    getBalance: async () => 500_000_000_000_000_000n,
    getTransactionReceipt: async (hash: string) => receiptVisible ? receipts.get(hash) ?? null : null,
    getTransaction: async (hash: string) => pending.get(hash) ?? null,
    broadcastTransaction: async (raw: string) => {
      const transaction = Transaction.from(raw);
      assert.ok(persisted.transactions.some(entry => entry.hash === transaction.hash && entry.rawTransaction === raw), "signed bytes/hash must be persisted before broadcast");
      sent.push(raw); pending.set(transaction.hash!, transaction); nonce++; pendingNonce++;
      receipts.set(transaction.hash!, { hash: transaction.hash, from: transaction.from, to: transaction.to, status: 1, blockNumber: 100,
        blockHash: hash, gasUsed: 100_000n, gasPrice: 1_000_000_000n } as TransactionReceipt);
      if (ambiguous) throw new Error("private provider diagnostics must not be copied into journals");
      return { hash: transaction.hash };
    },
  } as unknown as Provider;
  function runner() { return journaledTransactions({ journal, provider, signer: wallet, save: async () => { persisted = clone(journal); }, confirmations: 2, ceiling, waitMs: 0, pollCount: 2 }); }
  return { runner, provider, sent, get journal() { return journal; }, get persisted() { return persisted; }, receipts, pending,
    restart() { journal = clone(persisted); },
    setNonce(value: number) { nonce = value; pendingNonce = value; },
    setPendingNonce(value: number) { pendingNonce = value; },
    setChain(value: bigint) { chainId = value; },
    setBaseFee(value: bigint) { baseFee = value; },
    setAmbiguous(value: boolean) { ambiguous = value; },
    setReceiptVisible(value: boolean) { receiptVisible = value; },
    setCanonical(value: boolean) { canonical = value; },
  };
}
const request: TransactionRequest = { data: "0x60006000", value: 0n };
const roundRequest: TransactionRequest = { to: recipient, data: "0x1234", value: 0n };
const fundingRequest: TransactionRequest = { to: recipient, data: "0xabcd", value: 300_000_000_000_000_000n };

describe("V5 resumable deployment journal", function () {
  it("defaults to 5 gwei and rejects noncanonical fee caps or live fees above the cap", function () {
    expect(feeCeiling()).to.equal(ceiling);
    for (const value of ["0", "-1", "5.0", "01", "1e9", ""]) expect(() => feeCeiling(value)).to.throw();
    expect(() => cappedFees(3_000_000_000n, 1n, ceiling)).to.throw("exceeds");
    expect(cappedFees(2_000_000_000n, 1_000_000_000n, ceiling).maxFeePerGas).to.equal(ceiling);
  });
  it("fingerprints configurations independent of property order and preserves the original deadline", function () {
    expect(configFingerprint({ b: 2n, a: { z: "1" } })).to.equal(configFingerprint({ a: { z: "1" }, b: "2" }));
    const config = { chainId: "11155111", name: "Test", symbol: "T", maxSupply: "20", mintPriceWei: "100000000000000", mintDurationSeconds: "86400",
      initialOwner: wallet.address, requestConfirmations: "64", callbackGasLimit: "200000", randomnessFundingWei: "300000000000000000", activateSale: false,
      maxAffiliateSlots: "20", enrollmentSigner: recipient, prizeBps: "5000", affiliatePoolBps: "1000" };
    const journal = makeJournal();
    expect(parseV5Config(config, 11155111n, BigInt(journal.configTimestamp)).config.mintDeadline).to.equal(87400n);
    expect(parseV5Config(config, 11155111n, 9999n).config.mintDeadline).not.to.equal(87400n);
  });
  it("binds the resumed deadline to its original canonical block and timestamp", function () {
    const journal = makeJournal();
    journal.preflight = { ...journal.preflight, blockNumber: 100, blockHash: hash, configTimestamp: "1000" };
    const block = { number: 100, hash, timestamp: 1000 };
    expect(() => validateJournalAnchor(journal, block)).not.to.throw();
    for (const changed of [null, { ...block, hash: `0x${"22".repeat(32)}` }, { ...block, number: 101 }, { ...block, timestamp: 1001 }]) {
      expect(() => validateJournalAnchor(journal, changed)).to.throw();
    }
    journal.configTimestamp = "9999";
    expect(() => validateJournalAnchor(journal, block)).to.throw();
  });
  it("persists signatures before broadcast and completes all three stages exactly once across retries", async function () {
    const mock = fixture(), run = mock.runner();
    await run("deploy-factory", request); await run("create-round", roundRequest); await run("fund-randomness", fundingRequest);
    expect(mock.sent).to.have.length(3);
    mock.restart(); const resume = mock.runner();
    await resume("deploy-factory", request); await resume("create-round", roundRequest); await resume("fund-randomness", fundingRequest);
    expect(mock.sent).to.have.length(3);
    expect(mock.journal.transactions.map(entry => entry.nonce)).to.deep.equal([5, 6, 7]);
    validateJournal(mock.journal, { chainId: 11155111n, from: wallet.address, inputHash: hash, ceiling, existingFactory: null });
  });
  it("reconciles an accepted transaction after an ambiguous RPC response without broadcasting again", async function () {
    const mock = fixture(); mock.setAmbiguous(true);
    await assert.rejects(mock.runner()("deploy-factory", request));
    expect(mock.persisted.transactions[0].state).to.equal("prepared");
    mock.restart(); mock.setAmbiguous(false);
    await mock.runner()("deploy-factory", request);
    expect(mock.sent).to.have.length(1);
    expect(mock.journal.transactions[0].state).to.equal("confirmed");
  });
  it("replays identical saved bytes when submission never reached the network", async function () {
    const mock = fixture();
    const raw = await wallet.signTransaction({ ...request, chainId: 11155111n, type: 2, nonce: 5, gasLimit: 120_000n, maxFeePerGas: 2_001_000_000n, maxPriorityFeePerGas: 1_000_000n });
    mock.journal.transactions.push({ action: "deploy-factory", state: "prepared", rawTransaction: raw, hash: Transaction.from(raw).hash!, nonce: 5 });
    // The actual store already persisted this entry before the interrupted first attempt.
    mock.persisted.transactions.push(clone(mock.journal.transactions[0]));
    await mock.runner()("deploy-factory", request);
    expect(mock.sent).to.deep.equal([raw]);
  });
  it("waits on a pending hash and cannot sign a replacement or advance stages", async function () {
    const mock = fixture(); mock.setReceiptVisible(false);
    await assert.rejects(mock.runner()("deploy-factory", request), /awaiting confirmation/);
    mock.restart();
    await assert.rejects(mock.runner()("deploy-factory", request), /awaiting confirmation/);
    expect(mock.sent).to.have.length(1);
    expect(mock.journal.transactions).to.have.length(1);
  });
  it("rejects receipt loss, reorg, and reverted stage instead of continuing", async function () {
    const mock = fixture(); await mock.runner()("deploy-factory", request); mock.restart();
    mock.setReceiptVisible(false);
    await assert.rejects(mock.runner()("deploy-factory", request), /lost a previously confirmed/);
    mock.setReceiptVisible(true); mock.setCanonical(false);
    await assert.rejects(mock.runner()("deploy-factory", request), /not canonical/);
    mock.setCanonical(true);
    const receipt = mock.receipts.get(mock.journal.transactions[0].hash)!;
    mock.receipts.set(mock.journal.transactions[0].hash, { ...receipt, status: 0 } as TransactionReceipt);
    await assert.rejects(mock.runner()("deploy-factory", request), /reverted/);
    expect(mock.sent).to.have.length(1);
  });
  it("rejects unexpected pending transactions, consumed nonces, wrong chains and high gas before signing", async function () {
    for (const change of [(m: ReturnType<typeof fixture>) => m.setPendingNonce(6), (m: ReturnType<typeof fixture>) => m.setNonce(6),
      (m: ReturnType<typeof fixture>) => m.setChain(1n), (m: ReturnType<typeof fixture>) => m.setBaseFee(3_000_000_000n)]) {
      const mock = fixture(); change(mock);
      await assert.rejects(mock.runner()("deploy-factory", request));
      expect(mock.sent).to.have.length(0); expect(mock.journal.transactions).to.have.length(0);
    }
  });
  it("rejects changed constructor bytes, stage order, chain, signer, config and fee ceiling on resume", async function () {
    const mock = fixture(); await mock.runner()("deploy-factory", request); mock.restart();
    await assert.rejects(mock.runner()("deploy-factory", { ...request, data: "0x9999" }), /does not match/);
    await assert.rejects(mock.runner()("create-round", roundRequest), /stage/);
    const expected = { chainId: 11155111n, from: wallet.address, inputHash: hash, ceiling, existingFactory: null };
    for (const change of [{ chainId: 1n }, { from: recipient }, { inputHash: "different" }, { ceiling: ceiling + 1n }, { existingFactory: recipient }]) {
      expect(() => validateJournal(mock.journal, { ...expected, ...change })).to.throw();
    }
    expect(() => checkSignedIntent(mock.journal.transactions[0], { ...request, value: 1n })).to.throw();
    expect(mock.sent).to.have.length(1);
  });
  it("keeps a private atomic journal, excludes concurrent writers, and releases locks", async function () {
    const directory = await mkdtemp(join(tmpdir(), "v5-deploy-test-")), path = join(directory, "journal.json");
    try {
      const store = await openJournal(path);
      expect(await store.load()).to.equal(null);
      await assert.rejects(openJournal(path), /locked/);
      await store.save(makeJournal());
      expect((await stat(path)).mode & 0o777).to.equal(0o600);
      expect(JSON.parse(await readFile(path, "utf8")).version).to.equal(2);
      expect(await store.load()).to.deep.equal(makeJournal());
      await store.close();
      const next = await openJournal(path); await next.close();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("refuses to replace or load an unsafe public journal", async function () {
    const directory = await mkdtemp(join(tmpdir(), "v5-deploy-test-")), path = join(directory, "journal.json");
    const store = await openJournal(path);
    try {
      await store.save(makeJournal()); await chmod(path, 0o644);
      await assert.rejects(store.load(), /private regular file/);
      await assert.rejects(store.save(makeJournal()), /private regular file/);
    } finally { await store.close(); await rm(directory, { recursive: true, force: true }); }
  });
  it("deploys and funds an actual local V5 round through the raw-signing pipeline, then resumes without spending twice", async function () {
    const { ethers } = await network.create();
    const signer = Wallet.createRandom().connect(ethers.provider), enrollment = Wallet.createRandom();
    await ethers.provider.send("hardhat_setBalance", [signer.address, "0x6f05b59d3b20000"]);
    const coordinator = await ethers.deployContract("VRFCoordinatorV2Mock");
    const initial = (await ethers.provider.getBlock("latest"))!;
    const terms = parseV5Config({ chainId: "31337", name: "Journal round", symbol: "JRNL", maxSupply: "20", mintPriceWei: "100000000000000",
      mintDurationSeconds: "86400", initialOwner: signer.address, requestConfirmations: "64", callbackGasLimit: "200000",
      randomnessFundingWei: "300000000000000000", activateSale: false, maxAffiliateSlots: "20", enrollmentSigner: enrollment.address,
      prizeBps: "5000", affiliatePoolBps: "1000", vrfCoordinator: await coordinator.getAddress(), keyHash: hash }, 31337n, BigInt(initial.timestamp));
    const config = { ...terms.config, roundId: 1n };
    const journal: DeploymentJournal = { ...makeJournal(), chainId: "31337", from: signer.address, startingNonce: 0,
      configTimestamp: String(initial.timestamp), preflight: { config: JSON.parse(JSON.stringify(config, (_, val) => typeof val === "bigint" ? String(val) : val)) } };
    const directory = await mkdtemp(join(tmpdir(), "v5-deploy-local-"));
    const store = await openJournal(join(directory, "journal.json"));
    try {
      await store.save(journal);
      const makeRunner = () => journaledTransactions({ journal, provider: ethers.provider, signer, save: () => store.save(journal), confirmations: 1,
        ceiling, waitMs: 50, pollCount: 5 });
      const factoryArtifact = await artifacts.readArtifact("ManekinekoFactoryV5");
      const factoryRequest = await new ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode).getDeployTransaction(signer.address);
      const run = makeRunner();
      const factoryReceipt = await run("deploy-factory", factoryRequest);
      const factory = new Contract(factoryReceipt.contractAddress!, factoryArtifact.abi, signer);
      const createRequest = await factory.createRound.populateTransaction(config);
      await run("create-round", createRequest);
      const roundArtifact = await artifacts.readArtifact("ManekinekoRoundV5");
      const round = new Contract(await factory.rounds(1), roundArtifact.abi, signer);
      const fundRequest = await round.fundRandomness.populateTransaction({ value: terms.randomnessFundingWei });
      await run("fund-randomness", fundRequest);
      expect(await round.saleActivated()).to.equal(false);
      expect(await round.maxSupply()).to.equal(20n);
      expect(await round.mintDeadline()).to.equal(config.mintDeadline);
      const subscription = await coordinator.getSubscription(await round.subscriptionId());
      expect(subscription.nativeBalance).to.equal(terms.randomnessFundingWei);
      const nonce = await ethers.provider.getTransactionCount(signer.address);
      const resume = makeRunner();
      await resume("deploy-factory", factoryRequest); await resume("create-round", createRequest); await resume("fund-randomness", fundRequest);
      expect(await ethers.provider.getTransactionCount(signer.address)).to.equal(nonce);
      expect((await coordinator.getSubscription(await round.subscriptionId())).nativeBalance).to.equal(terms.randomnessFundingWei);
    } finally { await store.close(); await rm(directory, { recursive: true, force: true }); }
  });
});
