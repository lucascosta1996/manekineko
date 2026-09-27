import { constants, openSync, closeSync, fstatSync, fsyncSync, mkdirSync, readSync, realpathSync, writeSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { publicErrorDiagnostic } from "./dependency-error.ts";

type LogContext = { chainId: 1 | 11155111; runId?: string };
function canonicalPath(path: string): string {
  let existing = resolve(path);
  const missing: string[] = [];
  while (true) {
    try { return resolve(realpathSync(existing), ...missing.reverse()); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || dirname(existing) === existing) throw new Error("log_file_path_validation_failed");
      missing.push(basename(existing)); existing = dirname(existing);
    }
  }
}

/** Resolve existing files and the nearest existing ancestor of new files, so
 * aliases through a symlinked parent cannot append to recovery/config files. */
export function assertLogPathSeparate(path: string, privatePaths: string[]) {
  const logPath = canonicalPath(path);
  if (privatePaths.some(privatePath => canonicalPath(privatePath) === logPath)) throw new Error("log_file_must_be_separate_from_private_files");
}

function validateExistingLog(descriptor: number, size: number, context: LogContext) {
  if (!size) return;
  const start = Buffer.alloc(Math.min(size, 16384)), end = Buffer.alloc(1);
  readSync(descriptor, start, 0, start.length, 0); readSync(descriptor, end, 0, 1, size - 1);
  const newline = start.indexOf(10);
  if (newline < 0 || end[0] !== 10) throw new Error("unrecognized_log");
  const first = JSON.parse(start.subarray(0, newline).toString("utf8"));
  if (first?.logVersion !== 1 || first.chainId !== context.chainId || first.runId !== (context.runId ?? null)
    || typeof first.sessionId !== "string" || !/^[0-9a-f-]{36}$/.test(first.sessionId)
    || typeof first.timestamp !== "string" || new Date(first.timestamp).toISOString() !== first.timestamp
    || typeof first.mode !== "string" || !/^[a-z][a-z0-9_]+$/.test(first.mode)) throw new Error("unrecognized_log");
}
// Only public worker reports belong here. Never serialize an error, environment,
// private path, encrypted state or transaction journal into the diagnostic log.
const publicFields = ["mode", "action", "transactionHash", "reason", "postId", "walletCount", "maxPrimaryMintsPerWallet", "retryAt",
  "deployed", "claimsMonitored", "account", "collections", "owner", "balanceWei", "contractVersion", "previousCredits", "legacyMerkleRoot",
  "historicalSources", "blockNumber", "blockHash", "execute", "once", "sepoliaRehearsal", "recycleSepoliaFunds", "exitCode"];

export function publicLogReport(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const report = value as Record<string, unknown>, result: Record<string, unknown> = {};
  for (const field of publicFields) {
    const item = report[field];
    if (typeof item === "boolean" || typeof item === "number" && Number.isFinite(item) || typeof item === "string" && item.length <= 512) result[field] = item;
  }
  if (report.diagnostic) result.diagnostic = publicErrorDiagnostic(report.diagnostic);
  for (const field of ["eligibility", "credits"]) {
    const pin = report[field] as { address?: unknown; codeHash?: unknown } | undefined;
    if (pin && typeof pin.address === "string" && /^0x[0-9a-f]{40}$/i.test(pin.address)
      && typeof pin.codeHash === "string" && /^0x[0-9a-f]{64}$/i.test(pin.codeHash)) result[field] = { address: pin.address, codeHash: pin.codeHash };
  }
  return result;
}

/** Append-only diagnostic evidence. A requested sink must open before any
 * private environment is loaded, and each record is flushed before proceeding. */
export function openWorkerLog(path: string, context: LogContext) {
  let descriptor: number | undefined;
  let failureCode = "log_file_requires_owned_regular_file_mode_600";
  try {
    const file = resolve(path);
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    descriptor = openSync(file, constants.O_RDWR | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || (stat.mode & 0o077) || stat.nlink !== 1 || process.getuid && stat.uid !== process.getuid()) throw new Error("unsafe_log_file");
    failureCode = "log_file_contains_unrecognized_content_or_different_run";
    validateExistingLog(descriptor, stat.size, context);
  } catch {
    if (descriptor !== undefined) closeSync(descriptor);
    throw new Error(failureCode);
  }
  const file = descriptor, sessionId = randomUUID();
  let closed = false, failed = false;
  return {
    write(value: unknown) {
      if (closed || failed) throw new Error("log_file_write_failed");
      try {
        const line = Buffer.from(`${JSON.stringify({ ...publicLogReport(value), logVersion: 1, timestamp: new Date().toISOString(), sessionId, chainId: context.chainId, runId: context.runId ?? null })}\n`);
        for (let offset = 0; offset < line.length;) {
          const written = writeSync(file, line, offset, line.length - offset);
          if (!written) throw new Error("empty_log_write");
          offset += written;
        }
        fsyncSync(file);
      } catch { failed = true; throw new Error("log_file_write_failed"); }
    },
    close() {
      if (closed) return;
      closed = true;
      try { closeSync(file); } catch { throw new Error("log_file_close_failed"); }
    },
  };
}
