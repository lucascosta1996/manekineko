import assert from "node:assert/strict";
import test from "node:test";
import seasons from "../../../seasons.json";
import {
  plannedRewards,
  summarizePlannedRewards,
} from "../lib/planned-rewards";

test("catalog totals retain the planned Growth and Standard mix", () => {
  assert.deepEqual(plannedRewards, {
    seasonCount: 22,
    collectionCount: 216,
    growthCollectionCount: 76,
    standardCollectionCount: 140,
    winningNftCount: 1296,
    prizePoolEth: "1296",
    affiliatePoolEth: "292",
    communityPoolEth: "1588",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(plannedRewards)), plannedRewards);
});

test("the six-collection final season contributes only its actual editions", () => {
  const finalSeason = seasons.at(-1)!;
  assert.equal(finalSeason.season, 22);
  assert.deepEqual(summarizePlannedRewards([finalSeason]), {
    seasonCount: 1,
    collectionCount: 6,
    growthCollectionCount: 2,
    standardCollectionCount: 4,
    winningNftCount: 36,
    prizePoolEth: "36",
    affiliatePoolEth: "8",
    communityPoolEth: "44",
  });
});

test("Growth allocation follows the original season identity at the pilot boundary", () => {
  const pilot = summarizePlannedRewards([seasons[3]!]);
  const later = summarizePlannedRewards([seasons[4]!]);
  assert.equal(pilot.growthCollectionCount, 10);
  assert.equal(pilot.affiliatePoolEth, "20");
  assert.equal(later.growthCollectionCount, 2);
  assert.equal(later.standardCollectionCount, 8);
  assert.equal(later.affiliatePoolEth, "12");
});
