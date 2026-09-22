import assert from "node:assert/strict";
import test from "node:test";
import { affiliateReferralUrl, readAffiliateAccount } from "../lib/affiliates/account.ts";
import { configuredOrigin, requireSameOrigin } from "../lib/affiliates/policy.ts";
import { affiliateAccountView } from "../components/affiliates/wallet-view.ts";
import type { ChainSnapshot } from "../lib/affiliates/chain.ts";
import type { AffiliateAccount } from "../lib/affiliates/types.ts";

const wallet = "0x9876c055407927ac7d01a26db2d7acb1f3397c8b";
const other = "0xe9d5303480e33cfa4310576967c62cbd2bec8b87";
const record = { mode: "live" as const, collectionId: "3342c115-3d41-4cb4-be45-fa103178f0ff", contractAddress: "0xaffd7dc1b6a0d8974040f3216316240b724715a9", contractVersion: "affiliate-v5", affiliatePoolBps: 1000, maxSlots: 20, mintPriceWei: "100000000000000", affiliateRatesBps: [] };
function snapshot(overrides: Record<string, unknown> = {}, state = {}): ChainSnapshot {
  const values: Record<string, unknown> = { affiliateIdOf: 4n, affiliateWallet: wallet, affiliateAccrued: 120000000000000n, affiliateClaimed: 120000000000000n, affiliateClaimable: 0n, affiliateReferredMints: 6n, ...overrides };
  return { record, soldOut: true, refundable: false, totalMinted: 20, totalReferredMints: 10, totalAccrued: 200000000000000n, ...state,
    call: async (name: string, args: unknown[]) => {
      assert.deepEqual(args, [name === "affiliateIdOf" ? wallet : 4]);
      assert.ok(Object.hasOwn(values, name), `Unexpected call ${name}`);
      return values[name];
    },
  } as unknown as ChainSnapshot;
}

test("a paid affiliate stays registered with referral and payment history when enrollment is unconfigured", async () => {
  for (const env of [{}, { AFFILIATE_PUBLIC_ORIGIN: "http://localhost:3100" }, { AFFILIATE_PUBLIC_ORIGIN: "invalid" }]) {
    const account = await readAffiliateAccount(snapshot(), wallet, env);
    assert.equal(account?.affiliateId, 4);
    assert.equal(account?.status, "paid");
    assert.equal(account?.referredMints, 6);
    assert.equal(account?.claimedWei, "120000000000000");
    assert.equal(account?.claimableWei, "0");
    assert.equal(account?.referralUrl, null);
  }
});
test("unpaid commission is readable without any enrollment configuration, and public reads do not enable admission", async () => {
  const account = await readAffiliateAccount(snapshot({ affiliateClaimed: 0n, affiliateClaimable: 120000000000000n }), wallet, {});
  assert.equal(account?.status, "claimable");
  assert.equal(account?.claimableWei, "120000000000000");
  assert.throws(() => configuredOrigin({}), /not configured/);
  assert.throws(() => requireSameOrigin(new Request("http://localhost:3100/api/enroll", { method: "POST", headers: { origin: "http://localhost:3100", "content-type": "application/json" } }), {}), /not configured/);
});
test("optional sharing uses only an explicitly configured HTTPS origin and keeps the same verified position", () => {
  const origin = "https://nft.example.com";
  const url = new URL(affiliateReferralUrl(record, 4, { AFFILIATE_PUBLIC_ORIGIN: origin })!);
  assert.equal(url.origin, origin);
  assert.equal(url.pathname, `/mint/${record.collectionId}`);
  assert.equal(url.searchParams.get("affiliate"), "4");
  assert.equal(url.searchParams.get("collection"), record.contractAddress);
  for (const origin of ["https://user:password@nft.example.com", "https://nft.example.com/path", "javascript:alert(1)"]) assert.equal(affiliateReferralUrl(record, 4, { AFFILIATE_PUBLIC_ORIGIN: origin }), null);
  assert.equal(affiliateReferralUrl({ ...record, mode: "demo", contractAddress: null }, 4, {}), `/mint/${record.collectionId}?affiliate=4&collection=demo`);
});
test("missing sharing configuration cannot hide inconsistent chain balances or manufacture enrollment", async () => {
  for (const values of [{ affiliateWallet: other }, { affiliateClaimed: 120000000000001n }, { affiliateClaimable: 1n }, { affiliateReferredMints: 11n }]) await assert.rejects(readAffiliateAccount(snapshot(values), wallet, {}), /could not be verified/);
  assert.equal((await readAffiliateAccount(snapshot({ affiliateIdOf: 0n }), wallet, {}))?.status, "unregistered");
  assert.equal(await readAffiliateAccount(snapshot(), undefined, {}), null);
});
test("wallet display distinguishes unknown reads from verified zero and paid balances", async () => {
  const account = await readAffiliateAccount(snapshot(), wallet, {}) as AffiliateAccount;
  assert.deepEqual(affiliateAccountView(account, wallet, false, false, ""), { state: "ready", account });
  for (const [value, selected, loading, error, state] of [
    [account, wallet, true, "", "loading"], [account, wallet, false, "RPC failed", "unavailable"],
    [account, other, false, "", "unavailable"], [null, wallet, false, "", "unavailable"],
    [account, null, false, "", "disconnected"],
  ] as const) assert.deepEqual(affiliateAccountView(value, selected, false, loading, error), { state, account: null });
  const zero = await readAffiliateAccount(snapshot({ affiliateIdOf: 0n }), wallet, {}) as AffiliateAccount;
  assert.equal(affiliateAccountView(zero, wallet, false, false, "").state, "ready");
  assert.equal(zero.claimableWei, "0");
});
