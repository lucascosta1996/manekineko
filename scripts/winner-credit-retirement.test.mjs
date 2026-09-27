import assert from "node:assert/strict";
import test from "node:test";
import { Interface, ZeroAddress, ZeroHash, keccak256, zeroPadValue } from "ethers";
import { verifyRetiredRegistryTargets, verifyRetiredUnactivatedV8Target } from "./winner-credit-retirement.ts";

const registryAddress = `0x${"11".repeat(20)}`, factoryAddress = `0x${"22".repeat(20)}`;
const registryAbi = [
  "function collectionCount() view returns(uint256)", "function totalSponsorBalance() view returns(uint256)",
  "function approvedFactoryCodeHash(address) view returns(bytes32)",
  "function collections(address) view returns(address factory,uint256 roundId,uint256 sequence,uint256 registeredAt,bytes32 codeHash,bool rewardsOnly)",
  "event CollectionRegistered(address indexed round,address indexed factory,uint256 roundId,uint256 sequence,uint256 registeredAt,bool rewardsOnly)",
];
const registryInterface = new Interface(registryAbi), factoryInterface = new Interface(["function rounds(uint256) view returns(address)"]);
const targetInterface = new Interface(["function cancelled() view returns(bool)", "function mintDeadline() view returns(uint256)", "function totalMinted() view returns(uint256)", "function maxSupply() view returns(uint256)", "function CONTRACT_VERSION() view returns(string)", "function saleActivated() view returns(bool)", "function owner() view returns(address)", "function pendingOwner() view returns(address)"]);
const retirementInterface = new Interface(["function RETIREMENT_VERSION() view returns(string)", "function retiredRound() view returns(address)", "function recoveryRecipient() view returns(address)"]);
const retirementOwner = `0x${"44".repeat(20)}`, recipient = `0x${"55".repeat(20)}`;
const retirementArtifact = { deployedBytecode: `0x60066000${"00".repeat(128)}6000`, immutableReferences: { 1: [{ start: 4, length: 32 }, { start: 68, length: 32 }], 2: [{ start: 36, length: 32 }, { start: 100, length: 32 }] } };
const loadRetirementArtifact = async name => {
  if (name === "ManekinekoRoundV8") return { deployedBytecode: targetCode };
  assert.equal(name, "ManekinekoRetiredRoundOwner"); return retirementArtifact;
};
const registryCode = "0x60016000", factoryCode = "0x60026000", targetCode = "0x60036000";
const blockHash = n => `0x${BigInt(n + 1).toString(16).padStart(64, "0")}`;
const pinned = { number: 15200, hash: blockHash(15200), timestamp: 2_000_000 };
function fixture(targets = [{ minted: 1000n }]) {
  const creationBlock = 137, reads = [], ranges = [], anchor = { ...pinned };
  const rows = targets.map((target, index) => ({ round: `0x${String(index + 33).repeat(20)}`, roundId: BigInt(index + 1), sequence: BigInt(index + 1), registeredAt: BigInt(1_000_000 + index), rewardsOnly: false, cancelled: false, deadline: 3_000_000n, minted: 0n, supply: 1000n, version: "affiliate-v8", activated: false, owner: retirementOwner, pending: ZeroAddress, ...target }));
  const logs = rows.map((row, index) => ({ ...registryInterface.encodeEventLog("CollectionRegistered", [row.round, factoryAddress, row.roundId, row.sequence, row.registeredAt, row.rewardsOnly]), address: registryAddress, removed: false, blockNumber: creationBlock + index + 1, blockHash: blockHash(creationBlock + index + 1), index, transactionHash: blockHash(index + 200) }));
  const state = { rows, logs, count: BigInt(rows.length), balance: 0n, forgedStorage: false, forgedRoundCode: false, forgedFactory: false, reorg: false, rangeLimit: 5000, registryAnchors: 0, retirement: null, creationBlock, registryCode, blockHashes: new Map() };
  const provider = {
    async getNetwork() { return { chainId: 11155111n }; },
    async getBlock(number) {
      reads.push({ method: "block", number });
      if (number === anchor.number) state.registryAnchors++;
      return { number, timestamp: number === anchor.number ? anchor.timestamp : 1_000_000 + number, hash: number === anchor.number && state.reorg && state.registryAnchors > 1 ? ZeroHash : state.blockHashes.get(number) ?? blockHash(number) };
    },
    async getCode(address, blockTag) {
      reads.push({ method: "code", address, blockTag });
      if (address.toLowerCase() === registryAddress) return blockTag < state.creationBlock ? "0x" : state.registryCode;
      assert.equal(blockTag, anchor.number, "Collection and factory runtime reads must use the pinned block");
      if (address.toLowerCase() === factoryAddress) return factoryCode;
      if (address.toLowerCase() === retirementOwner) return state.retirement?.code ?? "0x";
      return state.forgedRoundCode ? "0x6000" : targetCode;
    },
    async getLogs(filter) {
      ranges.push(filter);
      assert.equal(filter.address, registryAddress);
      assert.equal(filter.topics[0], registryInterface.getEvent("CollectionRegistered").topicHash);
      assert(filter.fromBlock >= state.creationBlock && filter.toBlock <= anchor.number);
      assert(filter.toBlock - filter.fromBlock + 1 <= state.rangeLimit, "Log ranges must be bounded");
      return state.logs.filter(log => log.blockNumber >= filter.fromBlock && log.blockNumber <= filter.toBlock);
    },
    async call(request) {
      const address = request.to.toLowerCase(), blockTag = request.blockTag;
      reads.push({ method: "call", address, blockTag });
      assert.equal(blockTag, anchor.number, "Every contract state read must use the pinned block");
      if (address === registryAddress) {
        const decoded = registryInterface.parseTransaction(request);
        let result;
        if (decoded.name === "collectionCount") result = [state.count];
        if (decoded.name === "totalSponsorBalance") result = [state.balance];
        if (decoded.name === "approvedFactoryCodeHash") result = [state.forgedFactory ? ZeroHash : keccak256(factoryCode)];
        if (decoded.name === "collections") {
          const row = rows.find(item => item.round.toLowerCase() === decoded.args[0].toLowerCase());
          assert(row);
          result = [factoryAddress, row.roundId, state.forgedStorage ? 999n : row.sequence, row.registeredAt, keccak256(targetCode), row.rewardsOnly];
        }
        return registryInterface.encodeFunctionResult(decoded.name, result);
      }
      if (address === factoryAddress) {
        const decoded = factoryInterface.parseTransaction(request), row = rows.find(item => item.roundId === decoded.args[0]);
        return factoryInterface.encodeFunctionResult(decoded.name, [row.round]);
      }
      if (address === retirementOwner) {
        assert(state.retirement);
        const decoded = retirementInterface.parseTransaction(request);
        return retirementInterface.encodeFunctionResult(decoded.name, [{ RETIREMENT_VERSION: state.retirement.marker, retiredRound: state.retirement.target, recoveryRecipient: state.retirement.recipient }[decoded.name]]);
      }
      const decoded = targetInterface.parseTransaction(request), row = rows.find(item => item.round.toLowerCase() === address);
      assert(row);
      const value = { cancelled: row.cancelled, mintDeadline: row.deadline, totalMinted: row.minted, maxSupply: row.supply, CONTRACT_VERSION: row.version, saleActivated: row.activated, owner: row.owner, pendingOwner: row.pending }[decoded.name];
      return targetInterface.encodeFunctionResult(decoded.name, [value]);
    },
  };
  return { provider, state, reads, ranges, creationBlock, anchor };
}

function retiredFixture() {
  const f = fixture([{ minted: 0n }]), target = f.state.rows[0].round;
  const values = [target, recipient, target, recipient].map(value => zeroPadValue(value, 32).slice(2));
  f.state.retirement = { code: `0x60066000${values.join("")}6000`, target, recipient, marker: "unactivated-v8-retirement-v1" };
  return f;
}

test("zero sponsorship does not retire an unexpired unsold prior destination", async () => {
  const f = fixture([{ minted: 999n }]);
  assert.equal(f.state.balance, 0n);
  await assert.rejects(() => verifyRetiredRegistryTargets(f.provider, registryAddress, registryAbi, pinned), /can still mint; zero sponsorship does not retire/);
});
test("every prior destination must be permanently closed, while rewards-only sources cannot mint", async () => {
  const f = fixture([{ minted: 1000n }, { cancelled: true }, { deadline: BigInt(pinned.timestamp) }, { rewardsOnly: true }]);
  const result = await verifyRetiredRegistryTargets(f.provider, registryAddress, registryAbi, pinned);
  assert.equal(result.collectionCount, "4"); assert.equal(result.targetCount, 3); assert.equal(result.creationBlock, f.creationBlock);
  assert(f.ranges.length > 1);
  assert.equal(f.ranges[0].fromBlock, f.creationBlock);
  assert.equal(f.ranges.at(-1).toBlock, pinned.number);
  for (let i = 1; i < f.ranges.length; i++) assert.equal(f.ranges[i].fromBlock, f.ranges[i - 1].toBlock + 1);
});
test("truncated or duplicated registration history cannot prove retirement", async () => {
  const missing = fixture([{ cancelled: true }, { cancelled: true }]); missing.state.logs.pop();
  await assert.rejects(() => verifyRetiredRegistryTargets(missing.provider, registryAddress, registryAbi, pinned), /history is incomplete/);
  const duplicate = fixture(); duplicate.state.logs.push(duplicate.state.logs[0]);
  await assert.rejects(() => verifyRetiredRegistryTargets(duplicate.provider, registryAddress, registryAbi, pinned), /duplicated or inconsistent/);
});
test("registered event/storage, collection runtime and approved factory provenance must agree", async () => {
  for (const flag of ["forgedStorage", "forgedRoundCode", "forgedFactory"]) {
    const f = fixture(); f.state[flag] = true;
    await assert.rejects(() => verifyRetiredRegistryTargets(f.provider, registryAddress, registryAbi, pinned), /canonical registry storage|stored code hash|canonical approved runtime/);
  }
});
test("registration log anchors and final verification anchor must remain canonical", async () => {
  const orphaned = fixture(); orphaned.state.logs[0].blockHash = ZeroHash;
  await assert.rejects(() => verifyRetiredRegistryTargets(orphaned.provider, registryAddress, registryAbi, pinned), /registration log is not canonical/);
  const reorg = fixture(); reorg.state.reorg = true;
  await assert.rejects(() => verifyRetiredRegistryTargets(reorg.provider, registryAddress, registryAbi, pinned), /verification block was reorganized/);
});
test("nonempty sponsor balances and unbounded registry histories stop before scanning or writes", async () => {
  const funded = fixture(); funded.state.balance = 1n;
  await assert.rejects(() => verifyRetiredRegistryTargets(funded.provider, registryAddress, registryAbi, pinned), /still holds sponsorship/);
  assert.equal(funded.ranges.length, 0);
  const oversized = fixture(); oversized.state.count = 100001n;
  await assert.rejects(() => verifyRetiredRegistryTargets(oversized.provider, registryAddress, registryAbi, pinned), /bounded verification limit/);
  assert.equal(oversized.ranges.length, 0);
});

test("a zero-mint unactivated V8 is retired only by exact reviewed ownership custody", async () => {
  const f = retiredFixture();
  const result = await verifyRetiredRegistryTargets(f.provider, registryAddress, registryAbi, pinned, loadRetirementArtifact);
  assert.equal(result.targetCount, 1);
  const proof = await verifyRetiredUnactivatedV8Target(f.provider, f.state.rows[0].round, pinned, loadRetirementArtifact);
  assert.equal(proof.retirementOwner.toLowerCase(), retirementOwner);
  assert.equal(proof.recoveryRecipient.toLowerCase(), recipient);
  assert.equal(proof.codeHash, keccak256(f.state.retirement.code));
});

test("an EOA, marker-only lookalike or modified retirement runtime cannot close a prior target", async () => {
  for (const code of ["0x", "0x60006000", retiredFixture().state.retirement.code.replace("60066000", "60076000")]) {
    const f = retiredFixture(); f.state.retirement.code = code;
    await assert.rejects(() => verifyRetiredRegistryTargets(f.provider, registryAddress, registryAbi, pinned, loadRetirementArtifact), /can still mint/);
  }
});

test("retirement refuses activated or minted rounds, other versions, pending transfers and wrong bindings", async () => {
  for (const [key, value] of [["activated", true], ["minted", 1n], ["version", "affiliate-v9"], ["pending", recipient]]) {
    const f = retiredFixture(); f.state.rows[0][key] = value;
    await assert.rejects(() => verifyRetiredRegistryTargets(f.provider, registryAddress, registryAbi, pinned, loadRetirementArtifact), /can still mint/);
  }
  for (const [key, value] of [["target", recipient], ["marker", "unactivated-v8-retirement-v2"], ["recipient", ZeroAddress], ["recipient", retirementOwner], ["recipient", registryAddress]]) {
    const f = retiredFixture(); f.state.retirement[key] = value;
    await assert.rejects(() => verifyRetiredRegistryTargets(f.provider, registryAddress, registryAbi, pinned, loadRetirementArtifact), /can still mint/);
  }
});

test("every immutable occurrence must match, including hidden call destinations", async () => {
  const f = retiredFixture();
  const bytes = Buffer.from(f.state.retirement.code.slice(2), "hex");
  bytes.set(Buffer.from(zeroPadValue(registryAddress, 32).slice(2), "hex"), 68);
  f.state.retirement.code = `0x${bytes.toString("hex")}`;
  await assert.rejects(() => verifyRetiredUnactivatedV8Target(f.provider, f.state.rows[0].round, pinned, loadRetirementArtifact), /immutable values are inconsistent/);
  await assert.rejects(() => verifyRetiredRegistryTargets(f.provider, registryAddress, registryAbi, pinned, loadRetirementArtifact), /can still mint/);
});

test("standalone retirement proof requires a canonical block and exact V8 executable code", async () => {
  const forged = retiredFixture(); forged.state.forgedRoundCode = true;
  await assert.rejects(() => verifyRetiredUnactivatedV8Target(forged.provider, forged.state.rows[0].round, pinned, loadRetirementArtifact), /reviewed V8 runtime/);
  const reorg = retiredFixture(); reorg.state.reorg = true;
  await assert.rejects(() => verifyRetiredUnactivatedV8Target(reorg.provider, reorg.state.rows[0].round, pinned, loadRetirementArtifact), /verification block was reorganized/);
  const invalid = retiredFixture();
  await assert.rejects(() => verifyRetiredUnactivatedV8Target(invalid.provider, invalid.state.rows[0].round, { ...pinned, timestamp: -1 }, loadRetirementArtifact), /canonical block anchor/);
});

const registryHistoryReads = f => f.reads.filter(read => read.method === "code" && read.address.toLowerCase() === registryAddress && read.blockTag < f.anchor.number);
function nextBlock(f) { f.anchor.number++; f.anchor.hash = blockHash(f.anchor.number); f.anchor.timestamp += 12; }

test("creation-boundary cache removes binary search but refreshes all registry and target evidence", async () => {
  const f = fixture();
  await verifyRetiredRegistryTargets(f.provider, registryAddress, registryAbi, f.anchor);
  assert(registryHistoryReads(f).length > 10, "First verification must discover the complete history boundary");
  f.reads.length = 0; f.ranges.length = 0; nextBlock(f);
  await verifyRetiredRegistryTargets(f.provider, registryAddress, registryAbi, f.anchor);
  assert.deepEqual(registryHistoryReads(f).map(read => read.blockTag).sort((a,b) => a-b), [f.creationBlock-1,f.creationBlock]);
  assert(f.ranges.length > 1, "Registration logs must still be scanned at the new block");
  assert(f.reads.some(read => read.method === "call" && read.address === registryAddress));
  assert(f.reads.some(read => read.method === "call" && read.address === f.state.rows[0].round));
  f.state.balance = 1n; nextBlock(f);
  await assert.rejects(() => verifyRetiredRegistryTargets(f.provider, registryAddress, registryAbi, f.anchor), /still holds sponsorship/);
  f.state.balance = 0n; f.state.rows[0].minted = 999n; nextBlock(f);
  await assert.rejects(() => verifyRetiredRegistryTargets(f.provider, registryAddress, registryAbi, f.anchor), /can still mint/);
});

test("cached creation boundary never hides new registrations or changed factory/storage/runtime evidence", async () => {
  for (const flag of ["forgedFactory", "forgedStorage", "forgedRoundCode"]) {
    const f = fixture(); await verifyRetiredRegistryTargets(f.provider, registryAddress, registryAbi, f.anchor);
    f.state[flag] = true; nextBlock(f);
    await assert.rejects(() => verifyRetiredRegistryTargets(f.provider, registryAddress, registryAbi, f.anchor), /canonical approved runtime|canonical registry storage|stored code hash/);
  }
  const f = fixture(); await verifyRetiredRegistryTargets(f.provider, registryAddress, registryAbi, f.anchor);
  f.state.count = 2n; nextBlock(f);
  await assert.rejects(() => verifyRetiredRegistryTargets(f.provider, registryAddress, registryAbi, f.anchor), /history is incomplete/);
});

test("creation-boundary cache is scoped to provider identity and exact registry runtime", async () => {
  const first = fixture(); await verifyRetiredRegistryTargets(first.provider, registryAddress, registryAbi, first.anchor);
  const second = fixture(); await verifyRetiredRegistryTargets(second.provider, registryAddress, registryAbi, second.anchor);
  assert(registryHistoryReads(second).length > 10, "Another provider must rediscover the boundary");
  first.reads.length = 0; first.state.registryCode = "0x60096000"; nextBlock(first);
  await verifyRetiredRegistryTargets(first.provider, registryAddress, registryAbi, first.anchor);
  assert(registryHistoryReads(first).length > 10, "A different current runtime cannot reuse a prior boundary");
});

test("a creation-block reorg invalidates its cache while a contradictory unchanged anchor fails closed", async () => {
  const f = fixture(); await verifyRetiredRegistryTargets(f.provider, registryAddress, registryAbi, f.anchor);
  f.reads.length = 0; f.state.blockHashes.set(f.creationBlock, blockHash(999)); f.state.creationBlock--; nextBlock(f);
  const result = await verifyRetiredRegistryTargets(f.provider, registryAddress, registryAbi, f.anchor);
  assert.equal(result.creationBlock, f.creationBlock - 1);
  assert(registryHistoryReads(f).length > 10, "Reorganized deployment history must be discovered afresh");
  const inconsistent = fixture(); await verifyRetiredRegistryTargets(inconsistent.provider, registryAddress, registryAbi, inconsistent.anchor);
  inconsistent.state.creationBlock--; nextBlock(inconsistent);
  await assert.rejects(() => verifyRetiredRegistryTargets(inconsistent.provider, registryAddress, registryAbi, inconsistent.anchor), /cached registry creation boundary is inconsistent/);
});
