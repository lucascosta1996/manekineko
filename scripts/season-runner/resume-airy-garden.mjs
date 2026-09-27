import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { airyResumeMode } from "./airy-resume-mode.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
let execute = false, startAt;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--help") {
    console.log("npm run season:resume:airy-garden -- [--execute] [--start-at YYYY-MM-DDTHH:mm:ssZ]\nDefault: read-only preflight and review. An already-applied recovery keeps its saved opening and resumes the existing run. Only a new recovery defaults to an opening one hour from now. --execute requires you to type START before live continuation.");
    process.exit(0);
  }
  if (args[i] === "--execute" && !execute) execute = true;
  else if (args[i] === "--start-at" && !startAt && args[i + 1]) startAt = args[++i];
  else { console.error("Unknown or duplicate option. Use --help."); process.exit(1); }
}
if (execute && !process.stdin.isTTY) { console.error("Run this command in your terminal so you can review and confirm the plan."); process.exit(1); }
const explicitStart = startAt !== undefined;
startAt ??= new Date((Math.floor(Date.now() / 1000) + 3600) * 1000).toISOString().replace(".000Z", "Z");
const envArgs = [".env.staging.local", ".env.staging.wallets.local", ".private/v10-setup-2026-09-25/worker.env"].flatMap(p => ["--env-file", p]);
const runId = "257c7ab9-9e56-4daf-b5db-917a05d15d1c";
const workerArgs = ["--run-id", runId, ...envArgs, "--sepolia-rehearsal", "--recycle-sepolia-funds", "--wallet-vault", ".private/season-runner/sepolia-wallets.enc"];
function run(script, options, capture = false) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--", `scripts/season-runner/${script}`, ...options], { cwd: root, encoding: "utf8", stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit", maxBuffer: 1024 * 1024 });
  if (result.error || result.status !== 0) { console.error("Stopped. Preserve the saved run and transaction journal; the worker was not restarted automatically."); process.exit(result.status || 1); }
  if (capture) { try { return JSON.parse(result.stdout); } catch { console.error("Invalid plan output; stopped without applying it."); process.exit(1); } }
}
run("sepolia.ts", [...workerArgs, "--once"]);
const planPath = `.private/airy-recovery-${randomUUID()}.json`;
const review = run("recover-airy-garden.ts", [...envArgs, "--start-at", startAt, "--output", planPath], true);
let mode;
try { mode = airyResumeMode(review, { runId, explicitStart, execute }); }
catch (error) { console.error(error.message); process.exit(1); }
console.log(JSON.stringify(mode === "existing" ? review : { planPath, planHash: review.planHash, plan: review.plan }, null, 2));
if (!execute) { console.log("Read-only checks complete; no live changes. Add --execute to review and start this continuation yourself."); process.exit(0); }
console.log(mode === "existing"
  ? "Continue the existing Sepolia run at its saved opening. Reconcile saved transaction hashes, then continue managed test mints, approved X delivery and treasury recycling. No new recovery plan will be applied."
  : "Apply the reviewed opening, deploy Satin Echo, publish approved announcements, open affiliates before mint, and run managed test mints and treasury recycling.");
const prompt = createInterface({ input: process.stdin, output: process.stdout });
const answer = await prompt.question(mode === "existing" ? "Type START to continue the saved run: " : "Type START to apply exactly this plan and start the worker: "); prompt.close();
if (answer !== "START") { console.log("Cancelled; no live changes."); process.exit(0); }
if (mode === "new") run("recover-airy-garden.ts", [...envArgs, "--execute", "--plan", planPath, "--expected-hash", review.planHash]);
run("sepolia.ts", [...workerArgs, "--execute", "--log-file", `.private/season-runner/${runId}.log`]);
