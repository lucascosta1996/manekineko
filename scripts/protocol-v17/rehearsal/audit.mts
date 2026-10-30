/** Independent liability reconstruction; all values remain exact integer wei. */
export function auditBalances(input:{accounted:bigint;balance:bigint;operating:bigint;holders:bigint;collections:{execution:bigint;sponsorship:bigint;principal:bigint;prizes:bigint;affiliates:bigint;treasury:bigint;dust:bigint}[]}){
  const buckets=[input.operating,input.holders,...input.collections.flatMap(c=>Object.values(c))];
  const nonnegative=buckets.every(n=>n>=0n),expected=buckets.reduce((n,v)=>n+v,0n);
  return{passed:nonnegative&&expected===input.accounted&&input.balance>=input.accounted,expectedLiabilityWei:String(expected),accountedWei:String(input.accounted),contractBalanceWei:String(input.balance),unaccountedSurplusWei:String(input.balance-input.accounted),nonnegative};
}

/** An empty expired collection does not prove the intended three-NFT refund case. */
export function auditScenario(input:{expected:'sellout'|'refund';actual:string;supply:bigint;winners:bigint;minted:bigint;refunded:bigint;prizesClaimed:bigint;termsMatch:boolean}){
  const expectedMinted=input.expected==='sellout'?input.supply:3n;
  const settled=input.expected==='sellout'?input.prizesClaimed===input.winners:input.refunded===expectedMinted;
  return{expectedMinted:String(expectedMinted),scenarioPassed:input.termsMatch&&input.actual===input.expected&&input.minted===expectedMinted&&settled};
}
