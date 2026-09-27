import "server-only";
import { database } from "../database";
import { normalizedWallet, AffiliateError } from "./policy";
import { programRecord } from "./repository";
import { trustedSnapshot } from "./chain";
import { verifiedReferralEvent, type ReferralActivity } from "./referral-activity";

export async function referralActivity(collectionId: string, walletValue: string): Promise<ReferralActivity> {
  const wallet = normalizedWallet(walletValue), record = await programRecord(collectionId);
  if (!["affiliate-v5", "affiliate-v6", "affiliate-v7", "affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(record.contractVersion)) throw new AffiliateError("activity_unavailable", "Referral receipt history is unavailable for this historical contract version.", 503);
  const snapshot = await trustedSnapshot(record);
  const affiliateId = Number(await snapshot.call("affiliateIdOf", [wallet]));
  const result: ReferralActivity = { wallet, chainId: record.chainId, collectionId, affiliateId: affiliateId || null, referredMints: 0, events: [], hasMore: false, observedAt: new Date(snapshot.blockTimestamp * 1000).toISOString(), blockNumber: snapshot.blockNumber };
  if (affiliateId) {
    if (String(await snapshot.call("affiliateWallet", [affiliateId])).toLowerCase() !== wallet.toLowerCase()) throw new Error("Referral wallet mapping could not be verified.");
    result.referredMints = Number(await snapshot.call("affiliateReferredMints", [affiliateId]));
    const rows = (await database().query(`SELECT transaction_hash,block_hash,block_number::text,log_index,block_timestamp,arguments FROM manekineko_chain_events
      WHERE collection_id=$1::uuid AND event_name='AffiliateReferralRecorded' AND arguments->>'id'=$2 AND block_number<=$3::bigint
      ORDER BY block_number DESC,log_index DESC LIMIT 21`, [collectionId, String(affiliateId), snapshot.blockNumber])).rows;
    result.hasMore = rows.length > 20;
    // Bounded discovery, independent canonical receipt verification and no write path.
    for (const row of rows.slice(0, 20)) {
      if (!snapshot.paymentLog) throw new Error("Canonical referral receipt verification is unavailable.");
      const log = await snapshot.paymentLog(row.transaction_hash, row.log_index);
      result.events.push(verifiedReferralEvent(record.chainId, record.contractAddress!, affiliateId, row, log));
    }
  }
  await snapshot.assertCanonical();
  return result;
}
