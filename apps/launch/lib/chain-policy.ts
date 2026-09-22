import { LaunchConfigurationError } from "./launch-config.ts";

export type LaunchChainId = "1" | "11155111";

/** Read on the server; only the resulting public chain ID is passed to the UI. */
export function configuredLaunchChain(env: Record<string, string | undefined> = process.env): LaunchChainId | null {
  const chain = env.MANEKINEKO_CHAIN_ID;
  if (chain === undefined || chain === "") return null;
  if (chain !== "1" && chain !== "11155111") throw new LaunchConfigurationError("network_unavailable", "The launch network restriction is invalid.", 503);
  return chain;
}

export function requireLaunchChain(chainId: string, env: Record<string, string | undefined> = process.env): void {
  const configured = configuredLaunchChain(env);
  if (configured !== null && chainId !== configured) throw new LaunchConfigurationError("network_disabled", `This launch environment only supports ${configured === "11155111" ? "Ethereum Sepolia" : "Ethereum Mainnet"}.`, 422);
}

/** Planning can span supported networks; preparation/export still use requireLaunchChain. */
export function requireSeasonPlanningChain(chainId: string): asserts chainId is LaunchChainId {
  if (chainId !== "1" && chainId !== "11155111") throw new LaunchConfigurationError("invalid_network", "Choose Ethereum Mainnet or Sepolia.", 422);
}
