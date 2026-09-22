import assert from "node:assert/strict";
import test from "node:test";
import { Interface, ZeroHash, keccak256 } from "ethers";
import { verifyRetiredRegistryTargets } from "./winner-credit-retirement.ts";

const registryAddress = `0x${"11".repeat(20)}`, factoryAddress = `0x${"22".repeat(20)}`;
const registryAbi = [
  "function collectionCount() view returns(uint256)", "function totalSponsorBalance() view returns(uint256)",
  "function approvedFactoryCodeHash(address) view returns(bytes32)",
  "function collections(address) view returns(address factory,uint256 roundId,uint256 sequence,uint256 registeredAt,bytes32 codeHash,bool rewardsOnly)",
  "event CollectionRegistered(address indexed round,address indexed factory,uint256 roundId,uint256 sequence,uint256 registeredAt,bool rewardsOnly)",
];
const registryInterface = new Interface(registryAbi), factoryInterface = new Interface(["function rounds(uint256) view returns(address)"]);
const targetInterface = new Interface(["function cancelled() view returns(bool)", "function mintDeadline() view returns(uint256)", "function totalMinted() view returns(uint256)", "function maxSupply() view returns(uint256)"]);
const registryCode = "0x60016000", factoryCode = "0x60026000", targetCode = "0x60036000";
const blockHash = n => `0x${BigInt(n + 1).toString(16).padStart(64, "0")}`;
const pinned = { number: 15200, hash: blockHash(15200), timestamp: 2_000_000 };
function fixture(targets = [{ minted: 1000n }]) {
  const creationBlock = 137, reads = [], ranges = [];
  const rows = targets.map((target, index) => ({ round: `0x${String(index + 33).repeat(20)}`, roundId: BigInt(index + 1), sequence: BigInt(index + 1), registeredAt: BigInt(1_000_000 + index), rewardsOnly: false, cancelled: false, deadline: 3_000_000n, minted: 0n, supply: 1000n, ...target }));
  const logs = rows.map((row, index) => ({ ...registryInterface.encodeEventLog("CollectionRegistered", [row.round, factoryAddress, row.roundId, row.sequence, row.registeredAt, row.rewardsOnly]), address: registryAddress, removed: false, blockNumber: creationBlock + index + 1, blockHash: blockHash(creationBlock + index + 1), index, transactionHash: blockHash(index + 200) }));
  const state = { rows, logs, count: BigInt(rows.length), balance: 0n, forgedStorage: false, forgedRoundCode: false, forgedFactory: false, reorg: false, rangeLimit: 5000, registryAnchors: 0 };
  const provider = {
    async getBlock(number) {
      reads.push({ method: "block", number });
      if (number === pinned.number) state.registryAnchors++;
      return { number, timestamp: number === pinned.number ? pinned.timestamp : 1_000_000 + number, hash: number === pinned.number && state.reorg && state.registryAnchors > 1 ? ZeroHash : blockHash(number) };
    },
    async getCode(address, blockTag) {
      reads.push({ method: "code", address, blockTag });
      if (address.toLowerCase() === registryAddress) return blockTag < creationBlock ? "0x" : registryCode;
      assert.equal(blockTag, pinned.number, "Collection and factory runtime reads must use the pinned block");
      if (address.toLowerCase() === factoryAddress) return factoryCode;
      return state.forgedRoundCode ? "0x6000" : targetCode;
    },
    async getLogs(filter) {
      ranges.push(filter);
      assert.equal(filter.address, registryAddress);
      assert.equal(filter.topics[0], registryInterface.getEvent("CollectionRegistered").topicHash);
      assert(filter.fromBlock >= creationBlock && filter.toBlock <= pinned.number);
      assert(filter.toBlock - filter.fromBlock + 1 <= state.rangeLimit, "Log ranges must be bounded");
      return state.logs.filter(log => log.blockNumber >= filter.fromBlock && log.blockNumber <= filter.toBlock);
    },
    async call(request) {
      const address = request.to.toLowerCase(), blockTag = request.blockTag;
      reads.push({ method: "call", address, blockTag });
      assert.equal(blockTag, pinned.number, "Every contract state read must use the pinned block");
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
      const decoded = targetInterface.parseTransaction(request), row = rows.find(item => item.round.toLowerCase() === address);
      assert(row);
      const value = { cancelled: row.cancelled, mintDeadline: row.deadline, totalMinted: row.minted, maxSupply: row.supply }[decoded.name];
      return targetInterface.encodeFunctionResult(decoded.name, [value]);
    },
  };
  return { provider, state, reads, ranges, creationBlock };
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
