import type { AffiliateAccount } from "../../lib/affiliates/types.ts";

/** Missing, stale, or failed reads are unknown balances, never evidence of zero or no enrollment. */
export function affiliateAccountView(account: AffiliateAccount | null | undefined, wallet: string | null, demo: boolean, loading: boolean, error: string) {
  if (!demo && !wallet) return { state: "disconnected" as const, account: null };
  if (loading) return { state: "loading" as const, account: null };
  if (error || !account || (!demo && account.wallet.toLowerCase() !== wallet?.toLowerCase())) return { state: "unavailable" as const, account: null };
  return { state: "ready" as const, account };
}

/** Keeps late wallet requests from replacing the currently selected account's view. */
export function createWalletViewScope() {
  let wallet: string | null = null;
  let revision = 0;
  return {
    select(nextWallet: string | null) { wallet = nextWallet; revision++; },
    invalidate() { revision++; },
    begin() {
      const requestRevision = ++revision;
      const requestedWallet = wallet;
      return { wallet: requestedWallet, isCurrent: () => requestRevision === revision && requestedWallet === wallet };
    },
  };
}
