import { NextResponse } from "next/server";
import { database } from "../../../../../lib/database.ts";
import { launchRequestToken } from "../../../../../lib/launch-auth.ts";
import { assertLaunchOrigin, boundedLaunchJson, launchAuthResponse, launchCookieName, launchCookieOptions, launchNetworkSubject } from "../../../../../lib/launch-auth-policy.ts";
import { authenticateLaunchUser } from "../../../../../lib/launch-auth-store.ts";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    assertLaunchOrigin(request);
    const input = await boundedLaunchJson(request, 2_048);
    const { user, token } = await authenticateLaunchUser(database(), input, launchNetworkSubject(request), await launchRequestToken(request));
    const response = NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(launchCookieName(), token, launchCookieOptions());
    return response;
  } catch (error) { return launchAuthResponse(error); }
}
