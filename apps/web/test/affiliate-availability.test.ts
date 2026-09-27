import assert from "node:assert/strict";
import test from "node:test";
import { affiliateAvailability } from "../lib/affiliates/availability.ts";
const base = {now:100000,opensAt:new Date(90000).toISOString(),closesAt:new Date(200000).toISOString(),closed:false,full:false,configured:true,enrolled:false,walletConnected:true,holderRequired:false,hasEligibleNft:false,hasMoreNfts:false};
test("bootstrap needs no NFT; later registry sequence requires a currently eligible NFT",()=>{
  assert.equal(affiliateAvailability(base).canEnroll,true);
  assert.equal(affiliateAvailability({...base,holderRequired:true}).code,"wallet_ineligible");
  assert.equal(affiliateAvailability({...base,holderRequired:true,hasEligibleNft:true}).canEnroll,true);
});
test("scheduled, closed, full and backend failure remain distinct",()=>{
  assert.equal(affiliateAvailability({...base,now:80000}).code,"scheduled");
  assert.equal(affiliateAvailability({...base,now:200000}).code,"closed");
  assert.equal(affiliateAvailability({...base,full:true}).code,"full");
  assert.equal(affiliateAvailability({...base,configured:false}).code,"unavailable");
  assert.equal(affiliateAvailability({...base,enrolled:true}).canEnroll,false);
});
