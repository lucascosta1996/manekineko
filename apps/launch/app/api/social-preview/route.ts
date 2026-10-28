import { requireLaunchSession, launchAuthResponse } from '../../../lib/launch-auth';
import { socialPreviewResponse } from '../../../lib/social-preview-response';
export async function GET(request: Request) {
  try { await requireLaunchSession(request); } catch (error) { return launchAuthResponse(error); }
  return socialPreviewResponse(request);
}
