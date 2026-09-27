import { Interface } from "ethers";

const referralEvents = new Interface(["event AffiliateReferralRecorded(uint256 indexed id,address indexed payer,address indexed recipient,uint256 firstTokenId,uint256 quantity)"]);
export interface ReferralActivityEvent {
  id: string; transactionHash: string; blockHash: string; blockNumber: string; logIndex: number;
  payer: string; recipient: string; firstTokenId: string; quantity: number; occurredAt: string;
}
export interface ReferralActivity {
  wallet: string; chainId: number; collectionId: string; affiliateId: number | null;
  referredMints: number; events: ReferralActivityEvent[]; hasMore: boolean; observedAt: string; blockNumber: string;
}
type ReferralRow = { transaction_hash: string; block_hash: string; block_number: string; log_index: number; block_timestamp: Date; arguments: Record<string,string> };
type ReceiptLog = { address: string; topics: string[]; data: string; blockHash: string; blockNumber: string };

/** Indexed data discovers receipts; canonical receipt data decides attribution. */
export function verifiedReferralEvent(chainId: number, contract: string, affiliateId: number, row: ReferralRow, log: ReceiptLog): ReferralActivityEvent {
  const decoded = referralEvents.parseLog(log);
  if (!decoded || decoded.name !== "AffiliateReferralRecorded" || log.address.toLowerCase() !== contract.toLowerCase() || log.blockHash.toLowerCase() !== row.block_hash.toLowerCase() || BigInt(log.blockNumber) !== BigInt(row.block_number)
    || Number(decoded.args.id) !== affiliateId || String(decoded.args.id) !== row.arguments.id || String(decoded.args.payer).toLowerCase() !== row.arguments.payer?.toLowerCase() || String(decoded.args.recipient).toLowerCase() !== row.arguments.recipient?.toLowerCase() || String(decoded.args.quantity) !== row.arguments.quantity || String(decoded.args.firstTokenId) !== row.arguments.firstTokenId) throw new Error("Referral receipt attribution could not be verified.");
  const quantity = Number(decoded.args.quantity);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20) throw new Error("Referral receipt quantity could not be verified.");
  return { id: `${chainId}:${contract.toLowerCase()}:${row.block_hash.toLowerCase()}:${row.transaction_hash.toLowerCase()}:${row.log_index}`, transactionHash: row.transaction_hash, blockHash: row.block_hash, blockNumber: row.block_number, logIndex: row.log_index,
    payer: String(decoded.args.payer), recipient: String(decoded.args.recipient), firstTokenId: String(decoded.args.firstTokenId), quantity, occurredAt: row.block_timestamp.toISOString() };
}

/** No count-difference alerts: a reorg or transfer cannot manufacture a referral. */
export function unseenReferrals(events: readonly ReferralActivityEvent[], seen: ReadonlySet<string>): ReferralActivityEvent[] {
  const added = new Set<string>();
  return events.filter(event => { if (seen.has(event.id) || added.has(event.id)) return false; added.add(event.id); return true; });
}
