/** Equal payouts only for qualifying referrals. All arithmetic matches uint256 floor division. */
export function equalAffiliatePool(referred: readonly number[], minimum: number, mintPriceWei: string, totalMinted: number, poolBps: number, capBps: number) {
  if (!Number.isInteger(minimum) || minimum < 1 || !Number.isInteger(totalMinted) || totalMinted < 0
    || !Number.isInteger(poolBps) || poolBps < 0 || poolBps > 10000 || !Number.isInteger(capBps) || capBps < 1 || capBps > 10000
    || referred.some(n => !Number.isInteger(n) || n < 0) || referred.reduce((a,b) => a+b,0) > totalMinted
    || !/^[1-9][0-9]*$/.test(mintPriceWei)) throw new Error('Invalid equal affiliate pool terms');
  const qualified = referred.filter(n => n >= minimum);
  const budget = BigInt(totalMinted) * BigInt(mintPriceWei) * BigInt(poolBps) / 10000n;
  const proportionalCap = qualified.length ? BigInt(Math.min(...qualified)) * BigInt(mintPriceWei) * BigInt(capBps) / 10000n : 0n;
  const uncapped = qualified.length ? budget / BigInt(qualified.length) : 0n;
  const share = uncapped < proportionalCap ? uncapped : proportionalCap;
  return { qualifiedCount: qualified.length, equalShareWei: share.toString(), distributedWei: (share * BigInt(qualified.length)).toString(), unallocatedWei: (budget - share * BigInt(qualified.length)).toString() };
}
