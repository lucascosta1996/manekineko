import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { gunzipSync } from "node:zlib";

export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;
export const MAX_WEBHOOK_AGE_SECONDS = 300;
export const MAX_WEBHOOK_FUTURE_SECONDS = 30;

export class IngressError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = "IngressError";
    this.status = status;
    this.code = code;
  }
}

function sha256(value: string | Buffer): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Hash before comparing so token length does not control timingSafeEqual. */
export function authenticateCron(request: Request, secret: string | undefined): void {
  if (!secret || secret.length < 32) throw new IngressError(503, "indexer_auth_unconfigured");
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.length > 4096 || !timingSafeEqual(sha256(authorization), sha256(`Bearer ${secret}`))) {
    throw new IngressError(401, "unauthorized");
  }
}

async function readBoundedBody(request: Request): Promise<Buffer> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_WEBHOOK_BODY_BYTES)) {
    throw new IngressError(413, "webhook_body_too_large");
  }
  if (!request.body) throw new IngressError(400, "invalid_webhook_body");
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      void reader.cancel().catch(() => undefined);
      reject(new IngressError(408, "webhook_body_timeout"));
    }, 5000);
  });
  try {
    while (true) {
      const result = await Promise.race([reader.read(), deadline]);
      if (result.done) break;
      size += result.value.byteLength;
      if (size > MAX_WEBHOOK_BODY_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new IngressError(413, "webhook_body_too_large");
      }
      chunks.push(Buffer.from(result.value));
    }
    return Buffer.concat(chunks, size);
  } catch (error) {
    if (error instanceof IngressError) throw error;
    throw new IngressError(400, "invalid_webhook_body");
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

export interface VerifiedWebhook {
  /** Store a digest instead of recording provider header values or payloads. */
  deliveryId: string;
  payloadHash: string;
  signedAt: Date;
}

/** QuickNode signs nonce + timestamp + the uncompressed raw UTF-8 JSON. */
export async function authenticateQuickNode(
  request: Request,
  secret: string | undefined,
  nowMilliseconds = Date.now(),
): Promise<VerifiedWebhook> {
  if (!secret) throw new IngressError(503, "webhook_auth_unconfigured");
  const nonce = request.headers.get("x-qn-nonce") ?? "";
  const timestamp = request.headers.get("x-qn-timestamp") ?? "";
  const signature = request.headers.get("x-qn-signature") ?? "";
  if (!/^[A-Za-z0-9._:-]{1,256}$/.test(nonce) || !/^[1-9]\d{8,12}$/.test(timestamp) || !/^[a-fA-F0-9]{64}$/.test(signature)) {
    throw new IngressError(401, "invalid_webhook_authentication");
  }
  const signedSeconds = Number(timestamp);
  const ageSeconds = nowMilliseconds / 1000 - signedSeconds;
  if (ageSeconds > MAX_WEBHOOK_AGE_SECONDS || ageSeconds < -MAX_WEBHOOK_FUTURE_SECONDS) {
    throw new IngressError(401, "expired_webhook_signature");
  }
  const encoding = request.headers.get("content-encoding")?.trim().toLowerCase() ?? "identity";
  if (encoding !== "identity" && encoding !== "gzip") throw new IngressError(415, "unsupported_webhook_encoding");
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw new IngressError(415, "unsupported_webhook_content_type");
  const wireBody = await readBoundedBody(request);
  let decodedBody: Buffer;
  try {
    // maxOutputLength also bounds highly compressible payloads before allocating them.
    decodedBody = encoding === "gzip" ? gunzipSync(wireBody, { maxOutputLength: MAX_WEBHOOK_BODY_BYTES }) : wireBody;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    throw new IngressError(code === "ERR_BUFFER_TOO_LARGE" ? 413 : 400, "invalid_compressed_webhook_body");
  }
  let payload: string;
  try {
    payload = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(decodedBody);
  } catch {
    throw new IngressError(400, "invalid_webhook_utf8");
  }
  const expected = createHmac("sha256", secret).update(nonce).update(timestamp).update(payload).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) throw new IngressError(401, "invalid_webhook_authentication");
  try {
    const parsed: unknown = JSON.parse(payload);
    if (!parsed || typeof parsed !== "object") throw new Error("Expected a JSON object or array");
  } catch {
    throw new IngressError(400, "invalid_webhook_json");
  }
  // Never return the payload: it is a wake-up hint, never indexing authority.
  return { deliveryId: sha256(nonce).toString("hex"), payloadHash: sha256(decodedBody).toString("hex"), signedAt: new Date(signedSeconds * 1000) };
}
