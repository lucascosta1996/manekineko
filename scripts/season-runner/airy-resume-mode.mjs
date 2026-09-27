// Select continuation without deriving a new clock for an applied recovery.
export function airyResumeMode(review, { runId, explicitStart = false, execute = false }) {
  if (review.status === "already-applied") {
    if (review.runId !== runId) throw new Error("Recovery belongs to a different run.");
    if (explicitStart) throw new Error("This recovery is already applied. Omit --start-at; its opening is fixed.");
    if (execute && (review.desiredState !== "running" || !["running", "queued"].includes(review.runStatus))) {
      throw new Error("The saved run is not enabled. Review its pause in Launch, select Resume for this run, then retry this command.");
    }
    return "existing";
  }
  if (!review.plan || !/^[a-f0-9]{64}$/.test(review.planHash)) throw new Error("No valid recovery plan was created. Inspect the existing run before continuing.");
  return "new";
}
