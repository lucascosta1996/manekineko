import { walletPrizes } from "../../../lib/prizes/repository";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  const params=new URL(request.url).searchParams;
  const headers={"Cache-Control":"private, no-store"};
  if(params.getAll("wallet").length!==1||params.getAll("cursor").length>1||!/^0x[0-9a-f]{40}$/i.test(params.get("wallet")??"") || (params.has("cursor")&&!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(params.get("cursor")!)))return Response.json({error:"Choose a valid wallet and results page."},{status:400,headers});
  try {return Response.json(await walletPrizes(params.get("wallet")!,params.get("cursor")),{headers});}
  catch {return Response.json({error:"Prize discovery is temporarily unavailable. Your claim rights are unchanged."},{status:503,headers});}
}
