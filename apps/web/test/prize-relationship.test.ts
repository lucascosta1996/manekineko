import assert from "node:assert/strict";
import test from "node:test";
import { prizeRelationship } from "../lib/prizes/model.ts";
const wallet="0xABC", buyer="0x123", recipient="0x456";
test("prizes follow current NFT ownership while payments retain claimant and recipient",()=>{
  assert.deepEqual(prizeRelationship({currentHolder:wallet,claimed:false,paidHolder:null,recipient:null},wallet.toLowerCase()),{available:true,payment:false,paidCollectible:false});
  const paid={currentHolder:buyer,claimed:true,paidHolder:wallet,recipient};
  assert.deepEqual(prizeRelationship(paid,buyer),{available:false,payment:false,paidCollectible:true});
  assert.equal(prizeRelationship(paid,wallet).payment,true);
  assert.equal(prizeRelationship(paid,recipient).payment,true);
  assert.equal(prizeRelationship({...paid,claimed:false},wallet).available,false);
});
