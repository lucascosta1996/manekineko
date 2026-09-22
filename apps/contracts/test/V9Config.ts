import { expect } from "chai";
import { parseV9Config } from "../scripts/v9-config.js";
const terms={maxMintsPerWallet:"20",algorithmVersion:"unique-rank-v5",seasonId:`0x${"01".repeat(32)}`,seasonName:"Genesis",collectionColor:"#173C2C",chainId:"1",name:"Six equal winners",symbol:"NEKO8",maxSupply:"1000",mintPriceWei:"10000000000000000",mintDurationSeconds:"86400",initialOwner:"0x0000000000000000000000000000000000000001",requestConfirmations:"64",callbackGasLimit:"200000",randomnessFundingWei:"100000000000000000",activateSale:false,maxAffiliateSlots:"10",enrollmentSigner:"0x0000000000000000000000000000000000000002",prizeBps:"6000",winnerCount:"6",affiliatePoolBps:"2000",minAffiliateReferrals:"100",affiliatePayoutCapBps:"3000",saleStartAt:"4600"};
describe("V9 equal-prize launch terms",()=>{
 it("budgets six equal one ETH prizes from ten ETH receipts without changing affiliate/operator terms",()=>{
  const {config:c}=parseV9Config(terms,1n,1000n);expect(c.mintDeadline).eq(91000n);expect(c.winnerCount).eq(6n);expect(c.maxSupply*c.mintPrice/10000n*c.prizeBps/c.winnerCount).eq(10n**18n);expect(c.affiliatePoolBps).eq(2000n);
 });
 it("requires exact equal division and does not reinterpret V7 second-prize fields",()=>{
  for(const extra of [{maxMintsPerWallet:undefined},{maxMintsPerWallet:"21"},{maxMintsPerWallet:20},{winnerCount:'0'},{winnerCount:'11'},{winnerCount:'7'},{winnerCount:'06'},{winnerCount:6},{winnerCount:undefined},{winnerCount:'6',maxSupply:'5',minAffiliateReferrals:'1'},{prizeBps:'6001'},{secondPrizeBps:'2000'},{algorithmVersion:'unique-rank-v4'},{saleStartAt:'0'}])expect(()=>parseV9Config({...terms,...extra},1n,1000n)).throws();
  for(const winnerCount of ['1','2','3','4','5','6','8','10'])expect(parseV9Config({...terms,winnerCount},1n,1000n).config.winnerCount).eq(BigInt(winnerCount));
 });
});
