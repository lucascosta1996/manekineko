import { runWorkerCli } from "./worker-cli.ts";
import { ensure } from "./store.ts";

await runWorkerCli(11155111, async args => {
  const { ensureSepoliaWallets, donorWallets, runSepoliaRehearsalStep } = await import("./sepolia-wallets.ts");
  const master = process.env.SEASON_RUNNER_MASTER_KEY ?? "";
  ensure(/^[A-Za-z0-9+/]{43}=$/.test(master), "shared_master_key_required");
  const wallets = await ensureSepoliaWallets({ chainId: 11155111,
    path: String(args["wallet-vault"] ?? ".private/season-runner/sepolia-wallets.enc"),
    masterKey: Buffer.from(master, "base64").toString("hex"), create: args.execute === true });
  return { options: { wallets, donors: donorWallets(), recycleSepoliaFunds: args["recycle-sepolia-funds"] === true }, step: runSepoliaRehearsalStep };
});
