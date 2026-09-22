import assert from "node:assert/strict";
import test from "node:test";
import { Interface, ZeroAddress, ZeroHash, keccak256, type Provider } from "ethers";
import { createV10CreditLineageVerifier } from "./credit-lineage.ts";

const abi = [
  "function WINNER_CREDITS_VERSION() view returns(string)", "function previousRegistry() view returns(address)", "function legacyMerkleRoot() view returns(bytes32)",
  "function collectionCount() view returns(uint256)", "function totalSponsorBalance() view returns(uint256)",
  "function approvedFactoryCodeHash(address) view returns(bytes32)",
  "function collections(address) view returns(address factory,uint256 roundId,uint256 sequence,uint256 registeredAt,bytes32 codeHash,bool rewardsOnly)",
  "event CollectionRegistered(address indexed round,address indexed factory,uint256 roundId,uint256 sequence,uint256 registeredAt,bool rewardsOnly)",
];
const iface = new Interface(abi), factory = `0x${"77".repeat(20)}`, target = `0x${"88".repeat(20)}`;
const factoryCode = "0x60776000", targetCode = "0x60886000", root = `0x${"aa".repeat(32)}`;
const factoryInterface = new Interface(["function rounds(uint256) view returns(address)"]);
const targetInterface = new Interface(["function cancelled() view returns(bool)", "function mintDeadline() view returns(uint256)", "function totalMinted() view returns(uint256)", "function maxSupply() view returns(uint256)"]);
const address = (version: number) => `0x${String(version).repeat(40)}`;
const code = (version: number) => `0x600${version}6000`;
const hash = (number: number) => `0x${BigInt(number + 1).toString(16).padStart(64, "0")}`;
type Ledger = { version: number; root: string; previous: string; code: string; balance: bigint; activeTarget: boolean };
function fixture(versions = [6, 5, 4, 3, 2]) {
  const ledgers = new Map<string, Ledger>(versions.map((version, index) => [address(version), { version, root, previous: versions[index + 1] ? address(versions[index + 1]) : ZeroAddress, code: code(version), balance: 0n, activeTarget: false }]));
  const state = { block: { number: 100, hash: hash(100), timestamp: 2_000_000 }, fork: false, calls: 0, scans: 0, loaded: [] as string[], blocks: 0, reorgAfter: Infinity };
  const provider = {
    async getBlock(number: number) {
      state.blocks++;
      return { number, hash: state.fork || state.blocks > state.reorgAfter ? ZeroHash : number === state.block.number ? state.block.hash : hash(number), timestamp: number === state.block.number ? state.block.timestamp : 1_000_000 + number };
    },
    async getCode(value: string, blockTag: number) {
      const ledger = ledgers.get(value.toLowerCase());
      if (ledger) return blockTag < 10 ? "0x" : ledger.code;
      assert.equal(blockTag, state.block.number);
      if (value.toLowerCase() === factory) return factoryCode;
      assert.equal(value.toLowerCase(), target); return targetCode;
    },
    async getLogs(filter: { address: string; fromBlock: number; toBlock: number }) {
      state.scans++;
      assert(filter.fromBlock >= 10 && filter.toBlock <= state.block.number && filter.toBlock - filter.fromBlock < 5000);
      if (!ledgers.get(filter.address.toLowerCase())?.activeTarget || filter.fromBlock > 50 || filter.toBlock < 50) return [];
      return [{ ...iface.encodeEventLog("CollectionRegistered", [target, factory, 1n, 1n, 1_000_050n, false]), address: filter.address, removed: false, blockNumber: 50, blockHash: hash(50), index: 0 }];
    },
    async call(request: { to: string; data: string; blockTag: number }) {
      assert.equal(request.blockTag, state.block.number, "All lineage and retirement state reads must use the pinned block"); state.calls++;
      const ledger = ledgers.get(request.to.toLowerCase());
      if (ledger) {
        const method = iface.parseTransaction(request)!.name;
        const values: Record<string, unknown[]> = {
          WINNER_CREDITS_VERSION: [`winner-credits-v${ledger.version}`], previousRegistry: [ledger.previous], legacyMerkleRoot: [ledger.root],
          collectionCount: [ledger.activeTarget ? 1n : 0n], totalSponsorBalance: [ledger.balance], approvedFactoryCodeHash: [keccak256(factoryCode)],
          collections: [factory, 1n, 1n, 1_000_050n, keccak256(targetCode), false],
        };
        assert(values[method], `Unexpected registry method ${method}`);
        return iface.encodeFunctionResult(method, values[method]);
      }
      if (request.to.toLowerCase() === factory) return factoryInterface.encodeFunctionResult("rounds", [target]);
      assert.equal(request.to.toLowerCase(), target);
      const method = targetInterface.parseTransaction(request)!.name;
      return targetInterface.encodeFunctionResult(method, [{ cancelled: false, mintDeadline: 3_000_000n, totalMinted: 0n, maxSupply: 1000n }[method]]);
    },
  };
  const verify = createV10CreditLineageVerifier(provider as unknown as Provider, address(6), async name => {
    state.loaded.push(name);
    const version = name === "ManekinekoWinnerCredits" ? 2 : Number(/V([3-5])$/.exec(name)?.[1]);
    assert(version >= 2 && version <= 5);
    return { abi, deployedBytecode: code(version) };
  });
  return { verify, state, ledgers };
}

test("V10 checks the complete compiled V5-to-V2 lineage and caches only one canonical block", async () => {
  const f = fixture();
  await f.verify(f.state.block);
  assert.deepEqual(f.state.loaded, ["ManekinekoWinnerCreditsV5", "ManekinekoWinnerCreditsV4", "ManekinekoWinnerCreditsV3", "ManekinekoWinnerCredits"]);
  assert.equal(f.state.scans, 4);
  const calls = f.state.calls;
  await f.verify(f.state.block);
  assert.equal(f.state.calls, calls);
  f.state.block = { number: 101, hash: hash(101), timestamp: 2_000_012 };
  await f.verify(f.state.block);
  assert(f.state.calls > calls); assert.equal(f.state.scans, 8);
});

test("a prior target opened after the first check blocks the next V10 funding/advance check even with zero balance", async () => {
  const f = fixture([6, 5]);
  await f.verify(f.state.block);
  const old = f.ledgers.get(address(5))!;
  old.activeTarget = true;
  assert.equal(old.balance, 0n);
  f.state.block = { number: 101, hash: hash(101), timestamp: 2_000_012 };
  await assert.rejects(() => f.verify(f.state.block), /can still mint; zero sponsorship does not retire/);
});

test("wrong compiled predecessor runtime, mixed historical roots and non-descending versions reject", async () => {
  const runtime = fixture(); runtime.ledgers.get(address(4))!.code = "0x60006000";
  await assert.rejects(() => runtime.verify(runtime.state.block), /compiled build/);
  const roots = fixture(); roots.ledgers.get(address(2))!.root = ZeroHash;
  await assert.rejects(() => roots.verify(roots.state.block), /historical winner root/);
  const order = fixture(); order.ledgers.get(address(4))!.version = 5;
  await assert.rejects(() => order.verify(order.state.block), /strictly descend/);
  const cycle = fixture(); cycle.ledgers.get(address(3))!.previous = address(5);
  await assert.rejects(() => cycle.verify(cycle.state.block), /cyclic/);
});

test("forks invalidate cached success and failed checks are never cached", async () => {
  const f = fixture([6, 5]); await f.verify(f.state.block);
  f.state.fork = true;
  await assert.rejects(() => f.verify(f.state.block), /reorganized/);
  f.state.fork = false;
  f.state.block = { ...f.state.block, hash: hash(300) };
  f.ledgers.get(address(5))!.root = ZeroHash;
  await assert.rejects(() => f.verify(f.state.block), /historical winner root/);
  f.ledgers.get(address(5))!.root = root;
  const calls = f.state.calls;
  await f.verify(f.state.block); assert(f.state.calls > calls);
});

test("nonempty predecessor funding and a reorg during verification both stop the check", async () => {
  const funded = fixture([6, 5]); funded.ledgers.get(address(5))!.balance = 1n;
  await assert.rejects(() => funded.verify(funded.state.block), /still holds sponsorship/);
  const reorg = fixture([6, 5]); reorg.state.reorgAfter = 2;
  await assert.rejects(() => reorg.verify(reorg.state.block), /reorganized/);
});

test("an explicitly fresh V6 ledger may have no predecessor, while another current marker rejects", async () => {
  const fresh = fixture([6]); await fresh.verify(fresh.state.block);
  assert.equal(fresh.state.scans, 0); assert.equal(fresh.state.loaded.length, 0);
  const wrong = fixture([6]); wrong.ledgers.get(address(6))!.version = 5;
  await assert.rejects(() => wrong.verify(wrong.state.block), /current registry must be V6/);
});
