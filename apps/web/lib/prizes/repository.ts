import "server-only";
import { Interface } from "ethers";
import { database } from "../database";
import { configuredChainId } from "../chain-policy";
import { normalizedWallet } from "../affiliates/policy";
import { programRecord } from "../affiliates/repository";
import { trustedSnapshot } from "../affiliates/chain";
import { prizeRelationship, type WalletPrize, type WalletPrizes } from "./model";
const reads=new Interface([
  "function revealed() view returns(bool)","function winningTokenIds(uint256) view returns(uint256)","function winningTokenId() view returns(uint256)",
  "function prizeClaimed(uint256) view returns(bool)","function prizePaid() view returns(bool)","function prizeAmountForRank(uint256) view returns(uint256)","function prizeAmount() view returns(uint256)",
  "function ownerOf(uint256) view returns(address)","function awardHolder(uint256) view returns(address)","function finalizedAt() view returns(uint256)","function PRIZE_CLAIM_DELAY() view returns(uint256)",
]);
const events=new Interface([
 "event AwardClaimed(uint256 indexed rank,uint256 indexed tokenId,address indexed holder,address recipient,uint256 amount)",
 "event PrizeDelivered(uint256 indexed tokenId,address indexed holder,address indexed recipient,uint256 amount)",
]);
/** Page every indexed sold-out collection, not just indexed holders: ownership may have moved since indexing. */
export async function walletPrizes(walletValue:string,cursor:string|null):Promise<WalletPrizes> {
  const wallet=normalizedWallet(walletValue);
  if(cursor&&!/^[0-9a-f-]{36}$/i.test(cursor))throw new Error("Invalid cursor");
  const rows=(await database().query(`SELECT c.id,c.name FROM manekineko_collections c JOIN manekineko_deployments d ON d.collection_id=c.id
    JOIN manekineko_collection_state s ON s.collection_id=c.id WHERE d.status='deployed' AND s.block_number IS NOT NULL AND s.total_minted=c.max_supply
    AND c.contract_version IN ('affiliate-v3','affiliate-v4','affiliate-v5','affiliate-v6','affiliate-v7','affiliate-v8','affiliate-v9','affiliate-v10')
    AND ($1::bigint IS NULL OR c.chain_id=$1) AND ($2::uuid IS NULL OR c.id>$2) ORDER BY c.id LIMIT 6`,[configuredChainId(),cursor])).rows;
  const result:WalletPrizes={wallet,prizes:[],unavailable:[],nextCursor:rows.length>5?rows[4].id:null,checkedAt:new Date().toISOString()};
  // Sequential collections bound provider load; ranks share one canonical snapshot.
  for(const row of rows.slice(0,5))try {
    const record=await programRecord(row.id), snapshot=await trustedSnapshot(record);
    const call=async(name:string,args:unknown[]=[]) => (await snapshot.readContract(record.contractAddress!,reads,name,args))[0];
    if(!await call("revealed")){await snapshot.assertCanonical();continue;}
    const ranked=["affiliate-v7","affiliate-v8","affiliate-v9","affiliate-v10"].includes(record.contractVersion);
    const count=ranked?(record.winnerCount??2):1;
    const finalized=Number(await call("finalizedAt")),delay=Number(await call("PRIZE_CLAIM_DELAY"));
    const payments=(await database().query(`SELECT arguments,transaction_hash,block_timestamp,log_index,block_hash FROM manekineko_chain_events
      WHERE collection_id=$1 AND event_name=$2 AND block_number<=$3 ORDER BY block_number,log_index LIMIT 10`,[row.id,ranked?"AwardClaimed":"PrizeDelivered",snapshot.blockNumber])).rows;
    const found:WalletPrize[]=[];
    for(let rank=1;rank<=count;rank++) {
      const token=await call(ranked?"winningTokenIds":"winningTokenId",ranked?[rank]:[]);
      const [claimed,amount,holder]=await Promise.all([call(ranked?"prizeClaimed":"prizePaid",ranked?[rank]:[]),call(ranked?"prizeAmountForRank":"prizeAmount",ranked?[rank]:[]),call("ownerOf",[token])]);
      const payment=claimed?payments.find(p=>String(p.arguments.tokenId)===String(token)&&(!ranked||Number(p.arguments.rank)===rank)&&String(p.arguments.amount)===String(amount)):undefined;
      if(payment) {
        if(!snapshot.paymentLog)throw new Error("Payment verification unavailable");
        const log=await snapshot.paymentLog(payment.transaction_hash,payment.log_index), decoded=events.parseLog(log);
        if(!decoded || log.blockHash!==payment.block_hash || decoded.name!==(ranked?"AwardClaimed":"PrizeDelivered") || String(decoded.args.tokenId)!==String(token) || String(decoded.args.amount)!==String(amount) || String(decoded.args.holder).toLowerCase()!==payment.arguments.holder.toLowerCase() || String(decoded.args.recipient).toLowerCase()!==payment.arguments.recipient.toLowerCase() || ranked && (Number(decoded.args.rank)!==rank || String(await call("awardHolder",[rank])).toLowerCase()!==payment.arguments.holder.toLowerCase()))throw new Error("Payment evidence mismatch");
      }
      const prize:WalletPrize={collectionId:row.id,collectionName:row.name,rank,tokenId:Number(token),amountWei:String(amount),currentHolder:String(holder),claimed:Boolean(claimed),paidHolder:payment?.arguments.holder??null,recipient:payment?.arguments.recipient??null,transactionHash:payment?.transaction_hash??null,paidAt:payment?.block_timestamp?.toISOString()??null,availableAt:new Date((finalized+delay)*1000).toISOString(),observedAt:new Date(snapshot.blockTimestamp*1000).toISOString(),block:snapshot.blockNumber!,target:{chainId:record.chainId,contractAddress:record.contractAddress!,contractVersion:record.contractVersion,runtimeCodeHash:snapshot.codeHash,mintPriceWei:record.mintPriceWei,maxSupply:record.maxSupply,maxAffiliateSlots:record.maxSlots,prizeBps:record.prizeBps,affiliatePoolBps:record.affiliatePoolBps,affiliateRatesBps:record.affiliateRatesBps,winnerCount:record.winnerCount,secondPrizeBps:record.secondPrizeBps,minAffiliateReferrals:record.minAffiliateReferrals,affiliatePayoutCapBps:record.affiliatePayoutCapBps}};
      if(Object.values(prizeRelationship(prize,wallet)).some(Boolean))found.push(prize);
      if(claimed&&!payment&&!result.unavailable.some(r=>r.collectionId===row.id))result.unavailable.push({collectionId:row.id,name:row.name});
    }
    await snapshot.assertCanonical();result.prizes.push(...found);
  } catch {result.unavailable.push({collectionId:row.id,name:row.name});}
  return result;
}
