import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

type AuthEnvironment = Record<string, string | undefined>;
export const LAUNCH_SESSION_SECONDS = 8 * 60 * 60;
export const LAUNCH_IDLE_SECONDS = 30 * 60;
const SCRYPT_OPTIONS = { N: 131_072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
const PASSWORD_HASH = /^scrypt\$131072\$8\$1\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{86})$/;
const DUMMY_HASH = `scrypt$131072$8$1$${Buffer.alloc(16).toString("base64url")}$${Buffer.alloc(64).toString("base64url")}`;

export class LaunchAuthError extends Error {
  code: string;
  status: number;
  retryAfter?: number;
  constructor(code: string, message: string, status = 400, retryAfter?: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function normalizedLaunchUsername(value: unknown): string {
  if (typeof value !== "string") throw new LaunchAuthError("invalid_credentials", "The login or password is incorrect.", 401);
  const username = value.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_.-]{2,63}$/.test(username)) throw new LaunchAuthError("invalid_credentials", "The login or password is incorrect.", 401);
  return username;
}

export function validateNewLaunchPassword(password: string): void {
  if (password.length < 15 || password.length > 128 || Buffer.byteLength(password, "utf8") > 512) {
    throw new Error("Use a password between 15 and 128 characters.");
  }
}

function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, SCRYPT_OPTIONS, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashLaunchPassword(password: string): Promise<string> {
  validateNewLaunchPassword(password);
  const salt = randomBytes(16);
  const key = await derivePassword(password, salt);
  return `scrypt$131072$8$1$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

/** Missing or disabled accounts perform the same expensive derivation as a real account. */
export async function verifyLaunchPassword(password: string, encoded: string | null): Promise<boolean> {
  const realMatch = encoded?.match(PASSWORD_HASH);
  const match = realMatch ?? DUMMY_HASH.match(PASSWORD_HASH)!;
  const key = await derivePassword(password, Buffer.from(match[1], "base64url"));
  return timingSafeEqual(key, Buffer.from(match[2], "base64url")) && !!realMatch;
}

export function newLaunchSessionToken(): string { return randomBytes(32).toString("base64url"); }
export function launchSessionDigest(token: string): string | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return createHash("sha256").update(token).digest("hex");
}
export function launchCookieName(env: AuthEnvironment = process.env): string {
  return env.NODE_ENV === "production" ? "__Host-manekineko-launch" : "manekineko-launch";
}
export function launchCookieOptions(env: AuthEnvironment = process.env) {
  return { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge: LAUNCH_SESSION_SECONDS };
}

function localOrigin(url: URL): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol);
}

export function launchPublicOrigin(env: AuthEnvironment = process.env): string {
  try {
    const source = env.LAUNCH_PUBLIC_ORIGIN ?? (env.NODE_ENV === "development" ? "http://localhost:3200" : "");
    const url = new URL(source);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
    if (env.NODE_ENV === "production" ? url.protocol !== "https:" : !localOrigin(url) && url.protocol !== "https:") throw new Error();
    return url.origin;
  } catch {
    throw new LaunchAuthError("auth_unavailable", "Launch access is not configured. Contact the operator.", 503);
  }
}

/** Origin comes from server configuration, never from a client-supplied forwarded host. */
export function assertLaunchOrigin(request: Request, env: AuthEnvironment = process.env): void {
  const origin = launchPublicOrigin(env);
  if (request.headers.get("origin") !== origin || new URL(request.url).origin !== origin) {
    throw new LaunchAuthError("wrong_origin", "Use the official launch console to perform this action.", 403);
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new LaunchAuthError("wrong_origin", "Use the official launch console to perform this action.", 403);
  }
}

export function launchNetworkSubject(request: Request, env: AuthEnvironment = process.env): string {
  if (env.NODE_ENV === "development" && localOrigin(new URL(request.url))) return "local-development";
  // A deployment must actually run behind Vercel, which overwrites this header.
  // Generic X-Forwarded-For and arbitrary client headers are never trusted.
  if (env.VERCEL !== "1") return "unverified-network";
  const address = request.headers.get("x-vercel-forwarded-for")?.trim();
  if (!address || !isIP(address)) return "unverified-network";
  return isIP(address) === 6 ? new URL(`http://[${address}]/`).hostname.slice(1, -1).toLowerCase() : address;
}

export function launchRateDigest(subject: string, env: AuthEnvironment = process.env): string {
  const secret = env.LAUNCH_RATE_LIMIT_SECRET ?? (env.NODE_ENV === "development" ? "local-development-launch-rate-limits-only" : "");
  if (secret.length < 32) throw new LaunchAuthError("auth_unavailable", "Launch access is not configured. Contact the operator.", 503);
  return createHmac("sha256", secret).update(subject).digest("hex");
}

export async function boundedLaunchJson(request: Request, maxBytes = 32_768): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new LaunchAuthError("invalid_content_type", "Send a JSON request.", 415);
  }
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) throw new LaunchAuthError("request_too_large", "Request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new LaunchAuthError("invalid_request", "A JSON request body is required.");
  let size = 0;
  const parts: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new LaunchAuthError("request_too_large", "Request is too large.", 413); }
    parts.push(value);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(parts).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new LaunchAuthError("invalid_request", "The request must contain a JSON object."); }
}

export function launchAuthResponse(error: unknown): Response {
  const known = error instanceof LaunchAuthError;
  if (!known) console.error("A launch authentication operation failed.");
  return Response.json({ code: known ? error.code : "auth_unavailable", error: known ? error.message : "Launch access is temporarily unavailable. Please try again." }, {
    status: known ? error.status : 503,
    headers: { "Cache-Control": "no-store", ...(known && error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}) },
  });
}
