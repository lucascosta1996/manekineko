import test from "node:test";
import assert from "node:assert/strict";
import { Interface } from "ethers";
import { verifiedReferralEvent, unseenReferrals } from "../lib/affiliates/referral-activity.ts";
const contract = `0x${"1".repeat(40)}`, payer = `0x${"2".repeat(40)}`, recipient = `0x${"3".repeat(40)}`, blockHash = `0x${"a".repeat(64)}`, hash = `0x${"b".repeat(64)}`;
const iface = new Interface(["event AffiliateReferralRecorded(uint256 indexed id,address indexed payer,address indexed recipient,uint256 firstTokenId,uint256 quantity)"]);
const encoded = iface.encodeEventLog(iface.getEvent("AffiliateReferralRecorded")!, [2,payer,recipient,101,3]);
const row = { transaction_hash: hash, block_hash: blockHash, block_number: "123", log_index: 4, block_timestamp: new Date("2026-09-27T00:00:00Z"), arguments: { id: "2", payer, recipient, firstTokenId: "101", quantity: "3" } };
const log = { ...encoded, address: contract, blockHash, blockNumber: "0x7b" };

test("confirmed referral attribution comes from the exact canonical contract event", () => {
  const event = verifiedReferralEvent(11155111,contract,2,row,log);
  assert.equal(event.quantity,3); assert.equal(event.firstTokenId,"101");
  assert.equal(event.id,`11155111:${contract}:${blockHash}:${hash}:4`);
  for (const changed of [{ ...log, address: payer }, { ...log, blockHash: hash }, { ...log, blockNumber: "0x7c" }]) assert.throws(() => verifiedReferralEvent(11155111,contract,2,row,changed));
  assert.throws(() => verifiedReferralEvent(11155111,contract,1,row,log));
  assert.throws(() => verifiedReferralEvent(11155111,contract,2,{ ...row, arguments: { ...row.arguments, recipient: payer } },log));
});

test("notifications deduplicate canonical identity across refresh and distinguish reorganized events", () => {
  const event = verifiedReferralEvent(11155111,contract,2,row,log);
  assert.equal(unseenReferrals([event,event],new Set()).length,1);
  assert.deepEqual(unseenReferrals([event],new Set([event.id])),[]);
  assert.deepEqual(unseenReferrals([],new Set([event.id])),[]);
  const reorganizedHash = `0x${"c".repeat(64)}`;
  const replacement = verifiedReferralEvent(11155111,contract,2,{...row,block_hash:reorganizedHash},{...log,blockHash:reorganizedHash});
  assert.equal(unseenReferrals([replacement],new Set([event.id])).length,1);
});
