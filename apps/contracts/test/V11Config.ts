import { expect } from "chai";
import { parseV10Config } from "../scripts/v10-config.js";
import { parseV11Config } from "../scripts/v11-config.js";

const terms = {
  maxMintsPerWallet: "20", algorithmVersion: "unique-rank-v6",
  seasonId: `0x${"01".repeat(32)}`, seasonName: "Genesis", collectionColor: "#173C2C",
  chainId: "1", name: "Permanent combinations", symbol: "NEKO10", maxSupply: "1000",
  mintPriceWei: "10000000000000000", mintDurationSeconds: "86400",
  initialOwner: "0x0000000000000000000000000000000000000001",
  requestConfirmations: "64", callbackGasLimit: "200000", randomnessFundingWei: "100000000000000000",
  activateSale: false, maxAffiliateSlots: "10", enrollmentSigner: "0x0000000000000000000000000000000000000002",
  prizeBps: "6000", winnerCount: "6", affiliatePoolBps: "2000", minAffiliateReferrals: "1",
  affiliatePayoutCapBps: "3000", saleStartAt: "4600",
};

describe("V11 full affiliate pool configuration",()=>{
 it("requires exactly one referral and zero cap without changing V10",()=>{
  const frozen=Object.freeze({...terms,affiliatePayoutCapBps:"0"});
  const parsed=parseV11Config(frozen,1n,1000n);expect(parsed.config.minAffiliateReferrals).eq(1n);expect(parsed.config.affiliatePayoutCapBps).eq(0n);
  expect(()=>parseV10Config(frozen,1n,1000n)).to.throw();expect(parseV10Config(terms,1n,1000n).config.affiliatePayoutCapBps).eq(3000n);
  for(const delta of [{minAffiliateReferrals:"2"},{affiliatePayoutCapBps:"3000"},{algorithmVersion:"unique-rank-v5"},{winnerCount:"11"}])expect(()=>parseV11Config({...frozen,...delta},1n,1000n)).to.throw();
 });
 it("keeps the exact Sepolia refund rehearsal and rejects it on Mainnet",()=>{
  const refund={...terms,chainId:"11155111",affiliatePayoutCapBps:"0",sepoliaRehearsal:"refund-3-30m",mintDurationSeconds:"1800"};
  const parsed=parseV11Config(refund,11155111n,1000n);expect(parsed.config.mintDeadline-parsed.config.saleStartAt).eq(1800n);
  expect(()=>parseV11Config({...refund,chainId:"1"},1n,1000n)).to.throw();
 });
});
