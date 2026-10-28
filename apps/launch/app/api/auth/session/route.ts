import { NextResponse } from 'next/server';
import { database } from '../../../../lib/database';
import { launchRequestToken } from '../../../../lib/launch-auth';
import { assertLaunchOrigin, boundedLaunchJson, launchAuthResponse, launchCookieName, launchCookieOptions, launchNetworkSubject } from '../../../../lib/launch-auth-policy';
import { authenticateLaunchUser, revokeLaunchSession } from '../../../../lib/launch-auth-store';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertLaunchOrigin(request);
    const input = await boundedLaunchJson(request, 8192);
    const result = await authenticateLaunchUser(database(), input, launchNetworkSubject(request), await launchRequestToken(request));
    const response = NextResponse.json({ username: result.user.username }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(launchCookieName(), result.token, launchCookieOptions());
    return response;
  } catch (error) { return launchAuthResponse(error); }
}
export async function DELETE(request: Request) {
  try {
    assertLaunchOrigin(request);
    const token = await launchRequestToken(request);
    if (token) await revokeLaunchSession(database(), token);
    const response = NextResponse.json({ signedOut: true }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(launchCookieName(), '', { ...launchCookieOptions(), maxAge: 0 });
    return response;
  } catch (error) { return launchAuthResponse(error); }
}
