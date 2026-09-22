import { runWorkerCli } from "./worker-cli.ts";

// Production lifecycle only. No rehearsal adapter or generated buyer wallets.
await runWorkerCli(1);
