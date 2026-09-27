import test from "node:test";
import assert from "node:assert/strict";
import { parseLiveCollection } from "../lib/live-collection";
const summary = { name: "Airy Garden", href: "/seasons/11155111/0x1234", status: "complete", label: "Season complete", target: null,
  updatedAt: "2030-01-01T00:00:00Z", serverNow: "2030-01-01T00:00:10Z", stale: false, chainTimestamp: null, remainingSupply: null, unpaidPrizes: 0, completedCollections: 2, totalCollections: 2 };
test("landing accepts results/paid/processing without inventing a countdown", () => {
  for (const status of ["complete", "processing", "paid", "claimable", "refundable", "unavailable"]) {
    const result = parseLiveCollection({ ...summary, status }, new URL("https://app.example"));
    assert.equal(result?.target, null); assert.equal(result?.status, status); assert.equal(result?.href, "https://app.example/seasons/11155111/0x1234");
  }
});
test("landing rejects unsafe destinations, invalid clocks and invented counts", () => {
  for (const patch of [{ href: "//evil.example" }, { href: "javascript:alert(1)" }, { status: "unknown" }, { serverNow: "bad" }, { remainingSupply: -1 }, { unpaidPrizes: 1.5 }]) {
    assert.throws(() => parseLiveCollection({ ...summary, ...patch }, new URL("https://app.example")));
  }
  assert.equal(parseLiveCollection(null, new URL("https://app.example")), null);
});
