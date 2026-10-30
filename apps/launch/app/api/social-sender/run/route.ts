import { database } from '../../../../lib/database';
import { senderAuthorized } from '../../../../lib/social-sender-auth';
import { runSocialSender } from '../../../../lib/social-sender';
import { SenderError } from '../../../../lib/social-sender-store';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
export async function GET(request: Request) {
  if (!senderAuthorized(request)) return Response.json({error:'unauthorized'},{status:401,headers:{'Cache-Control':'no-store'}});
  try {
    const result=await runSocialSender(database());
    return Response.json(result,{headers:{'Cache-Control':'no-store'},status:result.status==='retry'?503:200});
  } catch(error) {
    const code=error instanceof SenderError ? error.code : 'storage_unavailable';
    console.error(JSON.stringify({service:'social-sender',error:code}));
    return Response.json({error:code},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
