import { Contract, ZeroAddress, getAddress, keccak256, type Provider } from "ethers";
import type { AffiliateCohort } from "./sepolia-scenarios.ts";
import { ensure } from "./store.ts";

/** Resolve this review's earned NFTs only after its first sellout; never import old test eligibility. */
export async function resolveFirstReviewCohort(provider: Provider, source: {round:string;roundCodeHash:string;deploymentBlock:number}, template: AffiliateCohort, block: {number:number;hash:string}) {
  ensure(keccak256(await provider.getCode(source.round,block.number))===source.roundCodeHash,"review_cohort_source_runtime_changed");
  const round=new Contract(source.round,["function readyForNextRound() view returns(bool)","function ownerOf(uint256) view returns(address)","event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)"],provider);
  ensure(await round.readyForNextRound({blockTag:block.number}),"first_review_collection_not_complete");
  const slots=[];
  for(const slot of template.slots){
    const logs=await round.queryFilter(round.filters.Transfer(ZeroAddress,slot.wallet),source.deploymentBlock,block.number);
    let tokenId:string|undefined;
    for(const log of logs){if(!("args" in log))continue;const id=log.args.tokenId;
      if(getAddress(await round.ownerOf(id,{blockTag:block.number}))===getAddress(slot.wallet)){tokenId=String(id);break;}}
    ensure(tokenId,"review_cohort_wallet_needs_first_collection_nft");
    slots.push({...slot,sourceTokenId:tokenId});
  }
  ensure((await provider.getBlock(block.number))?.hash===block.hash,"review_cohort_observation_reorganized");
  return {...template,sourceCollection:getAddress(source.round),sourceCodeHash:source.roundCodeHash,slots};
}
