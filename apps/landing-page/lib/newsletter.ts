import { createHmac } from "node:crypto";
import { isIP } from "node:net";

type Environment = Record<string, string | undefined>;
const MAX_BODY_BYTES = 2_048;
export const NEWSLETTER_RATE_LIMIT = 5;
export const NEWSLETTER_RATE_SECONDS = 600;

export const NEWSLETTER_RATE_SQL = `INSERT INTO manekineko_newsletter_rate_limits(subject_hash, window_started_at, attempts)
  VALUES($1, clock_timestamp(), 1)
  ON CONFLICT(subject_hash) DO UPDATE SET
    window_started_at = CASE WHEN manekineko_newsletter_rate_limits.window_started_at <= clock_timestamp() - interval '10 minutes'
      THEN clock_timestamp() ELSE manekineko_newsletter_rate_limits.window_started_at END,
    attempts = CASE WHEN manekineko_newsletter_rate_limits.window_started_at <= clock_timestamp() - interval '10 minutes'
      THEN 1 ELSE manekineko_newsletter_rate_limits.attempts + 1 END
  WHERE manekineko_newsletter_rate_limits.window_started_at <= clock_timestamp() - interval '10 minutes'
    OR manekineko_newsletter_rate_limits.attempts < $2
  RETURNING attempts`;

// The untargeted conflict clause avoids requiring SELECT on private email addresses.
export const NEWSLETTER_INSERT_SQL = `INSERT INTO manekineko_newsletter_subscribers(email)
  VALUES($1) ON CONFLICT DO NOTHING`;

class NewsletterError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export interface NewsletterRepository {
  consumeRateLimit(subjectHash: string): Promise<boolean>;
  save(email: string): Promise<void>;
}

const REWARDS_ORIGIN = "https://rewards.tincta.xyz";
const STUDIO_ORIGINS = new Set(["https://tincta.xyz", "https://www.tincta.xyz"]);

function isLocalPreview(request: Request, env: Environment): boolean {
  const url = new URL(request.url);
  return env.VERCEL !== "1" && url.protocol === "http:"
    && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    && (env.NODE_ENV !== "production" || env.NEWSLETTER_ALLOW_LOCAL_PREVIEW === "1");
}

function assertOrigin(request: Request, env: Environment): string {
  const requestedUrl = new URL(request.url);
  let origin: string;
  try {
    // The published Rewards domain remains valid after moving off a preview alias.
    const configured = new URL(requestedUrl.origin === REWARDS_ORIGIN || isLocalPreview(request, env)
      ? requestedUrl.origin : env.NEWSLETTER_PUBLIC_ORIGIN || "");
    if (configured.username || configured.password || configured.pathname !== "/" || configured.search || configured.hash
      || (configured.protocol !== "https:" && !isLocalPreview(request, env))) throw new Error();
    origin = configured.origin;
  } catch { throw new NewsletterError("Newsletter signup is unavailable. Please try again later.", 503); }
  const caller = request.headers.get("origin") ?? "";
  const trustedStudio = requestedUrl.origin === REWARDS_ORIGIN && STUDIO_ORIGINS.has(caller);
  let localAlias = false;
  if (isLocalPreview(request, env)) {
    try {
      // `next start` can normalize its internal URL to localhost even when the
      // browser uses 127.0.0.1. Bind that exception to the actual Host and port.
      const callerUrl = new URL(caller);
      localAlias = callerUrl.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(callerUrl.hostname)
        && callerUrl.port === requestedUrl.port && request.headers.get("host") === callerUrl.host && callerUrl.origin === caller;
    } catch { /* Invalid origins remain rejected below. */ }
  }
  if ((!trustedStudio && !localAlias && caller !== origin) || requestedUrl.origin !== origin
    || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new NewsletterError("Sign up from the Tincta website.", 403);
  }
  return caller;
}

const responseHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Vary": "Origin" };

export function newsletterPreflight(request: Request, env: Environment = process.env): Response {
  try {
    const origin = assertOrigin(request, env);
    const requestedHeaders = (request.headers.get("access-control-request-headers") ?? "").split(",").map(header => header.trim().toLowerCase()).filter(Boolean);
    if (request.headers.get("access-control-request-method") !== "POST" || requestedHeaders.some(header => header !== "content-type")) {
      throw new NewsletterError("This signup request is not supported.", 403);
    }
    return new Response(null, { status: 204, headers: { ...responseHeaders,
      "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin, Access-Control-Request-Method, Access-Control-Request-Headers",
    } });
  } catch (error) {
    return Response.json({ error: "Sign up from the Tincta website." }, { status: error instanceof NewsletterError ? error.status : 403, headers: responseHeaders });
  }
}

export function normalizeNewsletterEmail(input: unknown): string {
  if (typeof input !== "string") throw new NewsletterError("Enter a valid email address.", 400);
  const email = input.trim().toLowerCase();
  const [local, domain, extra] = email.split("@");
  if (email.length > 254 || !local || local.length > 64 || !domain || extra !== undefined
    || !/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local) || local.startsWith(".") || local.endsWith(".") || local.includes("..")
    || !domain.includes(".") || domain.split(".").some((part) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))) {
    throw new NewsletterError("Enter a valid email address.", 400);
  }
  return email;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) throw new NewsletterError("This request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new NewsletterError("Enter an email address.", 400);
  let length = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new NewsletterError("This request is too large.", 413);
    }
    chunks.push(value);
  }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new NewsletterError("Enter a valid email address.", 400); }
}

function networkDigest(request: Request, env: Environment): string {
  const secret = env.NEWSLETTER_IP_HASH_SECRET;
  if (!secret || secret.length < 32) throw new NewsletterError("Newsletter signup is unavailable. Please try again later.", 503);
  let network: string;
  if (env.VERCEL === "1") {
    const forwarded = request.headers.get("x-vercel-forwarded-for")?.trim();
    if (!forwarded || !isIP(forwarded)) throw new NewsletterError("Your network could not be verified. Please try again.", 503);
    network = isIP(forwarded) === 6 ? new URL(`http://[${forwarded}]/`).hostname.toLowerCase() : forwarded;
  } else if (isLocalPreview(request, env)) {
    // Local previews have one shared quota; client-supplied forwarding headers are not trusted.
    network = "local-development";
  } else {
    throw new NewsletterError("Newsletter signup is unavailable. Please try again later.", 503);
  }
  return createHmac("sha256", secret).update(`newsletter:${network}`).digest("hex");
}

export async function registerNewsletter(request: Request, repository: NewsletterRepository, env: Environment = process.env): Promise<Response> {
  const headers: Record<string, string> = { ...responseHeaders };
  try {
    headers["Access-Control-Allow-Origin"] = assertOrigin(request, env);
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      throw new NewsletterError("Send a JSON request.", 415);
    }
    const body = await readBody(request);
    if (body.website !== undefined && body.website !== "") throw new NewsletterError("We couldn’t accept this signup. Please try again.", 400);
    const email = normalizeNewsletterEmail(body.email);
    const subjectHash = networkDigest(request, env);
    if (!await repository.consumeRateLimit(subjectHash)) throw new NewsletterError("Too many attempts. Try again in ten minutes.", 429);
    await repository.save(email);
    // Identical results for existing and new addresses avoid disclosing the subscriber list.
    return Response.json({ success: true }, { headers });
  } catch (error) {
    if (error instanceof NewsletterError) {
      return Response.json({ error: error.message }, { status: error.status, headers: { ...headers, ...(error.status === 429 ? { "Retry-After": String(NEWSLETTER_RATE_SECONDS) } : {}) } });
    }
    // Never log email addresses, IPs, connection strings or raw database errors.
    console.error("Newsletter registration failed: storage is temporarily unavailable.");
    return Response.json({ error: "We couldn’t save your email. Please try again." }, { status: 503, headers });
  }
}
