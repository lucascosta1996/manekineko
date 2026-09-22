import { NextResponse } from "next/server";
import { database } from "../../../../../lib/database.ts";
import { launchRequestToken } from "../../../../../lib/launch-auth.ts";
import { assertLaunchOrigin, launchAuthResponse, launchCookieName, launchCookieOptions } from "../../../../../lib/launch-auth-policy.ts";
import { revokeLaunchSession } from "../../../../../lib/launch-auth-store.ts";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    assertLaunchOrigin(request);
    const token = await launchRequestToken(request);
    if (token) await revokeLaunchSession(database(), token);
    const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(launchCookieName(), "", { ...launchCookieOptions(), maxAge: 0 });
    return response;
  } catch (error) { return launchAuthResponse(error); }
}
