import { runWorkerCli } from "./worker-cli.ts";
import { readPrivateFile } from "./config.ts";
import { parseSepoliaScenario } from "./sepolia-scenarios.ts";
import { ensure } from "./store.ts";
import { Wallet } from "ethers";

await runWorkerCli(11155111, async args => {
  const { ensureSepoliaWallets, donorWallets, runSepoliaRehearsalStep } = await import("./sepolia-wallets.ts");
  const master = process.env.SEASON_RUNNER_MASTER_KEY ?? "";
  ensure(/^[A-Za-z0-9+/]{43}=$/.test(master), "shared_master_key_required");
  const wallets = await ensureSepoliaWallets({ chainId: 11155111,
    path: String(args["wallet-vault"] ?? ".private/season-runner/sepolia-wallets.enc"),
    masterKey: Buffer.from(master, "base64").toString("hex"), create: args.execute === true });
  const scenario = args["sepolia-scenario"] ? parseSepoliaScenario(JSON.parse((await readPrivateFile(String(args["sepolia-scenario"])))!)) : undefined;
  const admissionSigner = scenario?.kind === "manual-affiliate-sellout" && scenario.affiliateCohort
    ? new Wallet(process.env.AFFILIATE_ENROLLMENT_PRIVATE_KEY ?? "") : undefined;
  return { options: { scenario, admissionSigner, wallets, donors: donorWallets(), recycleSepoliaFunds: args["recycle-sepolia-funds"] === true }, step: runSepoliaRehearsalStep };
});
