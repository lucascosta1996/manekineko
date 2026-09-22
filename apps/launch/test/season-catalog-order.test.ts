import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import seasons from "../../../seasons.json" with { type: "json" };
import { catalogSeasonOrder } from "../lib/season-catalog-order.ts";
import { orderAutomationSummaries } from "../lib/automation-summary-order.ts";
import type { AutomationSummary } from "../lib/launch-automation.ts";

test("imported identities follow seasons.json on both launch networks", () => {
  assert.equal(seasons[0].theme, "Crimson & Blood Orange");
  for (const chainId of ["1", "11155111"]) {
    for (const [index, season] of seasons.entries()) {
      const id = `0x${createHash("sha256").update(`manekineko:seasons.json:chain:${chainId}:season:${season.season}`).digest("hex")}`;
      assert.equal(catalogSeasonOrder(id), index + 1);
      assert.equal(catalogSeasonOrder(id.toUpperCase()), index + 1);
    }
  }
  assert.equal(catalogSeasonOrder(), null);
  assert.equal(catalogSeasonOrder(`0x${"ab".repeat(32)}`), null);
});

test("saving or renaming a season never moves it ahead of earlier imported seasons", () => {
  const summary = (id: string, seasonOrder: number | null, updatedAt: string): AutomationSummary => ({
    id, seasonOrder, name: `Renamed ${id}`, chainId: "1", status: "draft", revision: 2, collectionCount: 10,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt, preparedAt: null, contentHash: null,
  });
  const first = summary("first", 1, "2026-01-01T00:00:00.000Z");
  const second = summary("second", 2, "2026-09-19T00:00:00.000Z");
  const last = summary("last", 22, "2026-09-20T00:00:00.000Z");
  const custom = summary("custom", null, "2026-09-21T00:00:00.000Z");
  const oldCustom = summary("old-custom", null, "2026-01-01T00:00:00.000Z");
  const current = [custom, last, oldCustom, second, first];
  assert.deepEqual(orderAutomationSummaries(current).map(item => item.id), ["first", "second", "last", "custom", "old-custom"]);
  assert.equal(current[0].id, "custom", "Sorting must not mutate React state.");
});
