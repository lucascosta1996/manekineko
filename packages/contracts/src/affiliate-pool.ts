/** Same cumulative rounding as V5 at sellout. Every wei is allocated; idle positions earn zero. */
export function allocateAffiliatePool(revenue: bigint, poolBps: bigint, referrals: readonly bigint[]): bigint[] {
  if (revenue < 0n || poolBps < 0n || poolBps > 10_000n || referrals.length > 100 || referrals.some(n => n < 0n)) throw new Error("Invalid affiliate pool inputs.");
  const total = referrals.reduce((sum, n) => sum + n, 0n);
  const pool = revenue * poolBps / 10_000n;
  let cumulative = 0n;
  let assigned = 0n;
  return referrals.map(n => {
    if (total === 0n) return 0n;
    cumulative += n;
    const next = pool * cumulative / total;
    const amount = next - assigned;
    assigned = next;
    return amount;
  });
}
