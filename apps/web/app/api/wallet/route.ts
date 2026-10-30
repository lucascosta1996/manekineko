import {getAddress,ZeroAddress} from 'ethers';
import {protocolConfig} from '../../../lib/protocol/config';
import {database} from '../../../lib/database';
import {walletPageNumber} from '../../../lib/wallet-profile/model';
import {queryWalletProfile} from '../../../lib/wallet-profile/queries';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const url=new URL(request.url);let wallet:string,nftPage:number,activityPage:number;
  try{wallet=getAddress(url.searchParams.get('address')??'');if(wallet===ZeroAddress)throw new Error();nftPage=walletPageNumber(url.searchParams.get('nftPage'));activityPage=walletPageNumber(url.searchParams.get('activityPage'));}catch{return Response.json({error:'Select a valid wallet and page.'},{status:400});}
  try{
    const config=protocolConfig();
    if(!config||config.version!==16&&config.version!==17&&config.version!==18)return Response.json({error:'Wallet activity is not configured for this deployment.'},{status:503});
    const result=await queryWalletProfile((sql,values)=>database().query(sql,values),{...config,version:config.version},wallet,nftPage,activityPage);
    return Response.json(result,{headers:{'Cache-Control':'private, no-store'}});
  }catch{return Response.json({error:'Your wallet activity could not load. Please try again.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
