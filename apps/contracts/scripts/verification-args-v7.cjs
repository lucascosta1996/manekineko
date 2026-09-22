const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

if (!process.env.V7_JOURNAL_PATH) throw new Error("Set V7_JOURNAL_PATH to the recorded V7 deployment journal.");
const journal = JSON.parse(readFileSync(resolve(process.env.V7_JOURNAL_PATH), "utf8"));
if (!journal.round || !journal.renderer || !journal.preflight?.config || !["1", "11155111"].includes(journal.preflight.chainId)) {
  throw new Error("Journal must identify an Ethereum V7 round, its renderer and original constructor configuration.");
}
module.exports = [journal.preflight.config, journal.renderer];
