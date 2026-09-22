import test from "node:test";
import assert from "node:assert/strict";
import { buildTicketSvg, previewExample } from "../lib/mint/preview.ts";
import { contractSourceVersion } from "../lib/collections/contract-presentation.ts";
import { calculateHistoryScore } from "../lib/history/model.ts";
const appearance = { seasonId: `0x${"7".repeat(64)}`, seasonName: "Copper Study", name: "Warm Copper", collectionColor: "#330000", textColor: "#FFFFFF" };
test("V10 preview is a permanent identity illustration in every draw state", () => {
  assert.equal(previewExample("unique-rank-v6").score, null);
  const before = buildTicketSvg("1", 3, false, "unique-rank-v6", 1000, appearance);
  assert.equal(buildTicketSvg("1", 3, true, "unique-rank-v6", 1000, appearance), before);
  assert.match(before, /COMBINATION CODE/); assert.match(before, /640 800/);
  assert.doesNotMatch(before, /SCORE|SEALED|PRIZE|REVEALED/i);
  assert.notEqual(buildTicketSvg("1", 4, false, "unique-rank-v6", 1000, appearance), before);
  assert.throws(() => buildTicketSvg("1", 1001, false, "unique-rank-v6", 1000, appearance));
  assert.throws(() => buildTicketSvg("1", 3, false, "unique-rank-v6", 1000));
});
test("V10 source routing is exact and a local score decoder cannot interpret its identity", () => {
  assert.equal(contractSourceVersion({ contractVersion: "affiliate-v10", algorithmVersion: "unique-rank-v6" }), "V10");
  assert.equal(contractSourceVersion({ contractVersion: "affiliate-v9", algorithmVersion: "unique-rank-v5" }), "V9");
  assert.throws(() => calculateHistoryScore([1, 2, 3, 4], "unique-rank-v6", `0x${"42".repeat(32)}`));
});
