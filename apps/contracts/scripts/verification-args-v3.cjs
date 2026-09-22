const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

if (!process.env.V3_JOURNAL_PATH) throw new Error("Set V3_JOURNAL_PATH to the recorded V3 deployment journal.");
const journal = JSON.parse(readFileSync(resolve(process.env.V3_JOURNAL_PATH), "utf8"));
if (!journal.round || !journal.renderer || !journal.preflight?.config || !["1", "11155111"].includes(journal.preflight.chainId)) {
  throw new Error("Journal must identify an Ethereum V3 round, its renderer and original constructor configuration.");
}
module.exports = [journal.preflight.config, journal.renderer];
