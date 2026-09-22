import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AutomationError } from "./launch-automation.ts";

function masterKey(env: Record<string, string | undefined>): Buffer {
  const value = env.SEASON_RUNNER_MASTER_KEY;
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value) || Buffer.from(value, "base64").length !== 32) throw new AutomationError("runtime_encryption", "Configure SEASON_RUNNER_MASTER_KEY as a base64-encoded 32-byte key in Launch and the worker.", 503);
  return Buffer.from(value, "base64");
}
export function runtimeEncryptionConfigured(env: Record<string, string | undefined> = process.env): boolean {
  try { masterKey(env); return true; } catch { return false; }
}
/** Context binds ciphertext to its chain/account or run. Never send ciphertext to the browser. */
export function encryptRuntimeSecret(value: string, context: string, env: Record<string, string | undefined> = process.env): string {
  const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", masterKey(env), nonce);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}
export function decryptRuntimeSecret(value: string, context: string, env: Record<string, string | undefined> = process.env): string {
  const key = masterKey(env);
  try {
    const [version, nonce, tag, body, extra] = value.split(".");
    if (version !== "v1" || extra !== undefined || !nonce || !tag || !body) throw new Error();
    const iv = Buffer.from(nonce, "base64url"), auth = Buffer.from(tag, "base64url");
    if (iv.length !== 12 || auth.length !== 16) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(auth);
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch { throw new AutomationError("runtime_decryption", "The saved runtime secret could not be authenticated. Check the worker key and account configuration.", 503); }
}
