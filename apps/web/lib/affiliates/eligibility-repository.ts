import "server-only";
import { database } from "../database";
import { AFFILIATE_NFT_CANDIDATES_QUERY } from "./eligibility-queries";
import type { AffiliateEligibilityToken } from "./types";

type Candidate = Omit<AffiliateEligibilityToken,"eligible"|"reason">;
export async function getAffiliateNftCandidates(chainId:number,targetCollectionId:string,wallet:string,page:number) {
  const {rows}=await database().query<{total:number;items:Candidate[]}>(AFFILIATE_NFT_CANDIDATES_QUERY,[chainId,targetCollectionId,wallet,(page-1)*12]);
  return {items:rows[0].items,hasMore:page*12<rows[0].total};
}
