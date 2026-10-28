import { database } from '../../../lib/database';
import { requireLaunchSession, assertLaunchOrigin, boundedLaunchJson, launchAuthResponse, LaunchAuthError } from '../../../lib/launch-auth';
import { configuredLaunchChain, requireLaunchChain, requireSeasonPlanningChain } from '../../../lib/chain-policy';
import { getRuntimeProfile, getRuntimeWorkerProfile, saveRuntimeProfile } from '../../../lib/season-runtime-store';
import { runtimeEncryptionConfigured } from '../../../lib/season-runtime-crypto';
import { verifySocialAccountInput } from '../../../lib/social-account-service';
import { AutomationError } from '../../../lib/launch-automation';
import { LaunchConfigurationError } from '../../../lib/launch-config';
import { verifyXAccount, XApiError } from '../../../../../scripts/season-runner/social';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function chain(request: Request) {
  const id = new URL(request.url).searchParams.get('chainId') ?? '11155111';
  requireSeasonPlanningChain(id); return id;
}
function failure(error: unknown) {
  if (error instanceof AutomationError || error instanceof LaunchConfigurationError || error instanceof XApiError) return Response.json({ error: error instanceof XApiError ? 'X could not verify this account. Check its four OAuth credentials and account ID.' : error.message }, { status: error instanceof XApiError ? 422 : error.status, headers: { 'Cache-Control': 'no-store' } });
  return launchAuthResponse(error);
}
export async function GET(request: Request) {
  try {
    const session = await requireLaunchSession(request), chainId = chain(request);
    return Response.json({ username: session.username, profile: await getRuntimeProfile(database(), chainId), encryptionConfigured: runtimeEncryptionConfigured(), allowedChainId: configuredLaunchChain() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
export async function PUT(request: Request) {
  try {
    assertLaunchOrigin(request);
    const session = await requireLaunchSession(request), chainId = chain(request);
    requireLaunchChain(chainId);
    if (!configuredLaunchChain() || !runtimeEncryptionConfigured()) throw new LaunchAuthError('settings_unavailable', 'Account storage is not configured for this environment.', 503);
    const input = await boundedLaunchJson(request, 16384);
    const verified = await verifySocialAccountInput(input, {
      saved: () => getRuntimeWorkerProfile(database(), chainId),
      verify: (credentials, expectedAccountId) => verifyXAccount(credentials, { expectedAccountId }),
    });
    const profile = await saveRuntimeProfile(database(), session, chainId, verified);
    return Response.json({ profile }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
