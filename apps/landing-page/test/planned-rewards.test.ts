import assert from "node:assert/strict";
import test from "node:test";
import seasons from "../../../seasons.json";
import {
  plannedRewards,
  summarizePlannedRewards,
} from "../lib/planned-rewards";

test("catalog example applies a 20% affiliate pool to every collection", () => {
  assert.deepEqual(plannedRewards, {
    seasonCount: 22,
    collectionCount: 216,
    winningNftCount: 1296,
    prizePoolEth: "1296",
    affiliatePoolEth: "432",
    communityPoolEth: "1728",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(plannedRewards)), plannedRewards);
});

test("the six-collection final season contributes only its actual editions", () => {
  const finalSeason = seasons.at(-1)!;
  assert.equal(finalSeason.season, 22);
  assert.deepEqual(summarizePlannedRewards([finalSeason]), {
    seasonCount: 1,
    collectionCount: 6,
    winningNftCount: 36,
    prizePoolEth: "36",
    affiliatePoolEth: "12",
    communityPoolEth: "48",
  });
});

test("the fixed pool does not change after the pilot seasons", () => {
  const pilot = summarizePlannedRewards([seasons[3]!]);
  const later = summarizePlannedRewards([seasons[4]!]);
  assert.equal(pilot.affiliatePoolEth, "20");
  assert.equal(later.affiliatePoolEth, "20");
});
