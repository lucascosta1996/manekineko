import { database } from '../../../../lib/database';
import { senderAuthorized } from '../../../../lib/social-sender-auth';
import { senderHealth } from '../../../../lib/social-sender-store';
import { requireLaunchSession, launchAuthResponse } from '../../../../lib/launch-auth';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request: Request) {
  try {
    if (!senderAuthorized(request)) await requireLaunchSession(request);
    return Response.json(await senderHealth(database()),{headers:{'Cache-Control':'no-store'}});
  } catch(error) { return launchAuthResponse(error); }
}
