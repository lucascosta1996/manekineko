import test from "node:test";
import assert from "node:assert/strict";
import { airyResumeMode } from "./airy-resume-mode.mjs";

const review = { status: "already-applied", runId: "saved", runStatus: "running", desiredState: "running" };
test("applied recovery resumes without requiring or creating a new plan", () => {
  assert.equal(airyResumeMode(review, { runId: "saved", execute: true }), "existing");
  assert.throws(() => airyResumeMode(review, { runId: "saved", explicitStart: true }), /opening is fixed/);
  assert.throws(() => airyResumeMode(review, { runId: "other" }), /different run/);
});
test("paused and terminal runs can be inspected but cannot be started by wrapper", () => {
  for (const runStatus of ["paused", "completed", "failed", "cancelled"]) {
    const saved = { ...review, runStatus };
    assert.equal(airyResumeMode(saved, { runId: "saved" }), "existing");
    assert.throws(() => airyResumeMode(saved, { runId: "saved", execute: true }), /not enabled/);
  }
  assert.throws(() => airyResumeMode({ ...review, desiredState: "paused" }, { runId: "saved", execute: true }), /not enabled/);
});
test("new recovery still requires a hash-bound plan", () => {
  assert.equal(airyResumeMode({ plan: {}, planHash: "a".repeat(64) }, { runId: "saved" }), "new");
  assert.throws(() => airyResumeMode({}, { runId: "saved" }), /No valid recovery plan/);
});
