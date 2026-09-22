import { expect } from "chai";
import { parseV7Config } from "../scripts/v7-config.js";
const terms={algorithmVersion:"unique-rank-v4",seasonId:`0x${"01".repeat(32)}`,seasonName:"Genesis",collectionColor:"#173C2C",chainId:"1",name:"Growth",symbol:"NEKO7",maxSupply:"1000",mintPriceWei:"10000000000000000",mintDurationSeconds:"86400",initialOwner:"0x0000000000000000000000000000000000000001",requestConfirmations:"64",callbackGasLimit:"200000",randomnessFundingWei:"100000000000000000",activateSale:false,maxAffiliateSlots:"10",enrollmentSigner:"0x0000000000000000000000000000000000000002",prizeBps:"6000",secondPrizeBps:"2000",affiliatePoolBps:"2000",minAffiliateReferrals:"100",affiliatePayoutCapBps:"3000",saleStartAt:"4600"};
describe("V7 launch terms",()=>{
 it("anchors full sale duration to the scheduled opening and derives exact 4/2/2/2 ETH economics",()=>{
  const {config:c}=parseV7Config(terms,1n,1000n);expect(c.mintDeadline).eq(91000n);
  const unit=c.maxSupply*c.mintPrice/10000n;expect(unit*(c.prizeBps-c.secondPrizeBps)).eq(4n*10n**18n);expect(unit*c.secondPrizeBps).eq(2n*10n**18n);expect(unit*c.affiliatePoolBps).eq(2n*10n**18n);expect(unit*(10000n-c.prizeBps-c.affiliatePoolBps)).eq(2n*10n**18n);
 });
 it("requires two positive prizes and rejects incomplete or economically inconsistent schedules",()=>{

  for(const extra of [{secondPrizeBps:"0"},{maxSupply:"1",minAffiliateReferrals:"1"},{secondPrizeBps:"4000"},{secondPrizeBps:"6000"},{prizeBps:"0",secondPrizeBps:"0"},{minAffiliateReferrals:"0"},{minAffiliateReferrals:"1001"},{affiliatePayoutCapBps:"0"},{affiliatePayoutCapBps:"10001"},{saleStartAt:"0"},{saleStartAt:"1000"},{saleStartAt:"01"},{algorithmVersion:"unique-rank-v3"},{saleStartAt:undefined},{activateSale:true},{prizeBps:"9000"}])expect(()=>parseV7Config({...terms,...extra},1n,1000n)).throws();
 });
});
