// Compatibility dispatcher. Each network has its own pinned entry point.
import { parseArguments } from "./config.ts";
import { safeError } from "./worker-cli.ts";

try {
  const args = parseArguments(process.argv.slice(2));
  if (args.help) process.stdout.write("Use npm run season:run:sepolia -- --help or npm run season:run:mainnet -- --help. Legacy season:run requires --chain 11155111 or --chain 1.\n");
  else if (args.chain === "1") await import("./mainnet.ts");
  else await import("./sepolia.ts");
} catch (error) {
  process.stdout.write(`${JSON.stringify({ mode: "stopped", reason: safeError(error) })}\n`);
  process.exitCode = 1;
}
