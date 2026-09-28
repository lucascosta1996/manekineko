import test from "node:test";
import assert from "node:assert/strict";
import { formatUtcDateTime } from "../lib/mint/format.ts";

test("countdown dates retain their UTC deadline and deterministic server/browser punctuation", () => {
  assert.equal(formatUtcDateTime("2026-09-29T00:00:00.000Z"), "Sep 29, 2026, 12:00 AM");
  assert.equal(formatUtcDateTime("2026-09-29T12:05:00.000Z"), "Sep 29, 2026, 12:05 PM");
  assert.equal(formatUtcDateTime("2026-09-28T22:05:00-03:00"), "Sep 29, 2026, 1:05 AM");
});
