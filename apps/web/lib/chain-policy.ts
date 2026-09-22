/** Server-side deployment isolation; absence preserves the existing multi-chain catalog. */
export function configuredChainId(env: Record<string, string | undefined> = process.env): number | null {
  const chain = env.MANEKINEKO_CHAIN_ID;
  if (chain === undefined || chain === "") return null;
  if (chain !== "1" && chain !== "11155111") throw new Error("The collection network restriction is invalid.");
  return Number(chain);
}

export function chainEnabled(chainId: number, env: Record<string, string | undefined> = process.env): boolean {
  const configured = configuredChainId(env);
  return configured === null || configured === chainId;
}
