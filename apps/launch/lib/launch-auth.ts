import "server-only";
import { cookies } from "next/headers";
import { database } from "./database.ts";
import { LaunchAuthError, launchCookieName } from "./launch-auth-policy.ts";
import { lookupLaunchSession, type LaunchSession } from "./launch-auth-store.ts";

export { assertLaunchOrigin, boundedLaunchJson, launchAuthResponse, LaunchAuthError } from "./launch-auth-policy.ts";
export type { LaunchSession } from "./launch-auth-store.ts";

export async function launchRequestToken(request?: Request): Promise<string | undefined> {
  const name = launchCookieName();
  if (!request) return (await cookies()).get(name)?.value;
  const matches = (request.headers.get("cookie") ?? "").split(";").map((item) => item.trim()).filter((item) => item.startsWith(`${name}=`));
  // Ambiguous cookies are rejected instead of accepting an attacker-selected duplicate.
  return matches.length === 1 ? matches[0].slice(name.length + 1) : undefined;
}

export async function getLaunchSession(): Promise<LaunchSession | null> {
  const token = await launchRequestToken();
  return token ? lookupLaunchSession(database(), token) : null;
}

export async function requireLaunchSession(request?: Request): Promise<LaunchSession> {
  const token = await launchRequestToken(request);
  const session = token ? await lookupLaunchSession(database(), token) : null;
  if (!session) throw new LaunchAuthError("authentication_required", "Sign in to the launch console to continue.", 401);
  return session;
}
