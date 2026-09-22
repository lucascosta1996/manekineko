import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SCORE_FORMULA,
  UINT256_MAX,
  type CollectionPublic,
} from "../lib/collections/model.ts";
import { validateCollection } from "../lib/collections/validation.ts";

const catalog = JSON.parse(
  readFileSync(
    new URL("../lib/collections/catalog.json", import.meta.url),
    "utf8"
  )
);

function fixture(index = 0): CollectionPublic {
  return {
    ...catalog.collections[index],
    ...catalog.network,
    algorithmVersion: "feistel-v1",
    contractVersion: "legacy",
    randomnessProvider: "future-blockhash",
    randomnessRequestId: null,
    randomnessState: null,
    nativeCurrency: { ...catalog.network.nativeCurrency },
    seriesId: catalog.series.id,
    contractStatus: "undeployed",
    contractAddress: null,
    mode: "demo",
    source: "seed",
    mintDeadline: null,
    maxMintBatch: 20,
    prizeBps: 5000,
    scoreFormula: SCORE_FORMULA,
    totalMinted: 0,
    totalMintRevenueWei: "0",
    phase: null,
    prizePaid: false,
  };
}

function deployed(overrides: Partial<CollectionPublic> = {}): CollectionPublic {
  return {
    ...fixture(),
    contractStatus: "deployed",
    mode: "live",
    source: "postgres",
    contractAddress: "0x1234567890aBCDEF1234567890aBCDEF12345678",
    mintDeadline: "2026-09-17T00:00:00.000Z",
    phase: "minting",
    ...overrides,
  };
}

test("checked-in collections validate as separate undeployed backend records", () => {
  const ids = new Set<string>();
  for (let i = 0; i < catalog.collections.length; i++) {
    const collection = fixture(i);
    assert.equal(validateCollection(collection), collection);
    assert.equal(collection.totalMintRevenueWei, "0");
    assert.equal(collection.totalMinted, 0);
    assert.equal(collection.contractAddress, null);
    assert.equal(collection.mintDeadline, null);
    assert.equal(collection.mode, "demo");
    ids.add(collection.id);
  }
  assert.equal(ids.size, catalog.collections.length);
  assert.ok(
    ids.size >= 2,
    "at least two records exercise dynamic collection routing"
  );
});

test("configuration accepts contract uint256 boundaries without JS number conversion", () => {
  const largestEvenPrice = (UINT256_MAX - 1n).toString();
  const collection = {
    ...fixture(),
    roundId: UINT256_MAX.toString(),
    maxSupply: 1,
    mintPriceWei: largestEvenPrice,
  };
  assert.equal(validateCollection(collection).mintPriceWei, largestEvenPrice);
  assert.throws(
    () =>
      validateCollection({
        ...collection,
        roundId: (UINT256_MAX + 1n).toString(),
      }),
    /roundId/
  );
  assert.throws(
    () =>
      validateCollection({
        ...collection,
        mintPriceWei: (UINT256_MAX + 1n).toString(),
      }),
    /mintPriceWei/
  );
  assert.throws(
    () => validateCollection({ ...collection, maxSupply: 2 }),
    /mintPriceWei/,
    "total primary revenue cannot overflow uint256"
  );
});

test("mint price must obey the contract's positive even wei requirement", () => {
  for (const mintPriceWei of [
    "0",
    "1",
    "3",
    "-2",
    "0.01",
    "2e18",
    "02",
    "0x02",
    "",
    " 2",
  ]) {
    assert.throws(
      () => validateCollection({ ...fixture(), mintPriceWei }),
      /mintPriceWei/
    );
  }
  assert.equal(
    validateCollection({ ...fixture(), mintPriceWei: "2" }).mintPriceWei,
    "2"
  );
});

test("contract supply, delay and batch constants reject invalid backend configuration", () => {
  for (const maxSupply of [0, -1, 65_537, 2.5, Number.NaN])
    assert.throws(
      () => validateCollection({ ...fixture(), maxSupply }),
      /maxSupply/
    );
  for (const revealDelayBlocks of [0, 1, 201, 2.5])
    assert.throws(
      () => validateCollection({ ...fixture(), revealDelayBlocks }),
      /revealDelayBlocks/
    );
  for (const mintDurationSeconds of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(
      () => validateCollection({ ...fixture(), mintDurationSeconds }),
      /mintDurationSeconds/
    );
  assert.throws(
    () => validateCollection({ ...fixture(), maxMintBatch: 21 }),
    /contract constants/
  );
  assert.throws(
    () => validateCollection({ ...fixture(), prizeBps: 6000 }),
    /contract constants/
  );
  assert.throws(
    () => validateCollection({ ...fixture(), scoreFormula: "a+b+c+d" }),
    /contract constants/
  );
  assert.equal(
    validateCollection({
      ...fixture(),
      maxSupply: 65_536,
      revealDelayBlocks: 200,
    }).maxSupply,
    65_536
  );
});

test("undeployed records cannot fabricate a contract, live mode, deadline or mint activity", () => {
  const invalid: Partial<CollectionPublic>[] = [
    { contractAddress: "0x1234567890abcdef1234567890abcdef12345678" },
    { mode: "live" },
    { mintDeadline: "2026-09-17T00:00:00.000Z" },
    { totalMinted: 1, totalMintRevenueWei: fixture().mintPriceWei },
    { phase: "minting" },
    { prizePaid: true },
  ];
  for (const value of invalid)
    assert.throws(
      () => validateCollection({ ...fixture(), ...value }),
      /Invalid collection configuration/
    );
});

test("deployed records require a nonzero EVM address and deployment deadline", () => {
  assert.equal(validateCollection(deployed()).mode, "live");
  for (const contractAddress of [
    null,
    "0x0000000000000000000000000000000000000000",
    "0x1234",
    "0xzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
  ]) {
    assert.throws(
      () => validateCollection(deployed({ contractAddress })),
      /contractAddress/
    );
  }
  for (const mintDeadline of [null, "not a date"])
    assert.throws(
      () => validateCollection(deployed({ mintDeadline })),
      /mintDeadline/
    );
  assert.throws(() => validateCollection(deployed({ mode: "demo" })), /mode/);
});

test("minted count, exact primary revenue and paid-prize state must agree", () => {
  const totalMinted = 17;
  const totalMintRevenueWei = (
    BigInt(fixture().mintPriceWei) * BigInt(totalMinted)
  ).toString();
  assert.equal(
    validateCollection(deployed({ totalMinted, totalMintRevenueWei }))
      .totalMinted,
    totalMinted
  );
  assert.throws(
    () =>
      validateCollection(
        deployed({
          totalMinted,
          totalMintRevenueWei: (BigInt(totalMintRevenueWei) + 1n).toString(),
        })
      ),
    /totalMintRevenueWei/
  );
  assert.throws(
    () => validateCollection(deployed({ totalMinted: 1001 })),
    /totalMinted/
  );
  assert.throws(
    () => validateCollection(deployed({ totalMinted: 0.5 })),
    /totalMinted/
  );
  assert.throws(
    () =>
      validateCollection(
        deployed({
          totalMinted,
          totalMintRevenueWei,
          prizePaid: true,
          phase: "complete",
        })
      ),
    /prizePaid/
  );
  const soldOut = {
    totalMinted: fixture().maxSupply,
    totalMintRevenueWei: (
      BigInt(fixture().maxSupply) * BigInt(fixture().mintPriceWei)
    ).toString(),
  };
  assert.throws(
    () =>
      validateCollection(
        deployed({ ...soldOut, prizePaid: true, phase: "awaiting_prize" })
      ),
    /prizePaid/
  );
  assert.equal(
    validateCollection(
      deployed({ ...soldOut, prizePaid: true, phase: "complete" })
    ).prizePaid,
    true
  );
});

test("deployment phase agrees with supply and completed prize delivery", () => {
  const soldOut = {
    totalMinted: fixture().maxSupply,
    totalMintRevenueWei: (
      BigInt(fixture().maxSupply) * BigInt(fixture().mintPriceWei)
    ).toString(),
  };
  assert.throws(() => validateCollection(deployed({ phase: null })), /phase/);
  assert.throws(
    () => validateCollection(deployed({ ...soldOut, phase: "minting" })),
    /minting phase/
  );
  assert.throws(
    () =>
      validateCollection(
        deployed({ ...soldOut, phase: "complete", prizePaid: false })
      ),
    /phase \/ prizePaid/
  );
  for (const phase of [
    "awaiting_reveal",
    "settling",
    "awaiting_prize",
  ] as const) {
    assert.throws(
      () => validateCollection(deployed({ phase })),
      /sold-out phase/
    );
    assert.equal(
      validateCollection(deployed({ ...soldOut, phase })).phase,
      phase
    );
  }
  // Refunds can follow either an unsold expiry or an expired sold-out reveal.
  assert.equal(
    validateCollection(deployed({ phase: "refundable" })).phase,
    "refundable"
  );
  assert.equal(
    validateCollection(deployed({ ...soldOut, phase: "refundable" })).phase,
    "refundable"
  );
});

test("collection identifiers and text enforce route and Solidity constraints", () => {
  for (const id of [
    "../mint",
    "round-1",
    "8fa5f8c0-6ef4-47f6-9af3-60b8101c932z",
    "",
  ])
    assert.throws(() => validateCollection({ ...fixture(), id }), /id/);
  assert.throws(
    () => validateCollection({ ...fixture(), seriesId: "not-an-id" }),
    /seriesId/
  );
  assert.throws(
    () => validateCollection({ ...fixture(), roundId: "0" }),
    /roundId/
  );
  assert.throws(
    () => validateCollection({ ...fixture(), name: "猫".repeat(27) }),
    /name/,
    "Solidity counts UTF-8 bytes, not characters"
  );
  assert.throws(
    () => validateCollection({ ...fixture(), symbol: "猫".repeat(6) }),
    /symbol/
  );
  assert.equal(
    validateCollection({ ...fixture(), name: "猫".repeat(26) }).name.length,
    26
  );
  assert.throws(
    () =>
      validateCollection({ ...fixture(), explorerUrl: "javascript:alert(1)" }),
    /explorerUrl/
  );
});
