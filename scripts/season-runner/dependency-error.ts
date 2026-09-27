import { createHash } from "node:crypto";

const knownMessages = new Map([
  ["Durable transaction journal save failed; reload the stored run before any retry.", "transaction_journal_save_failed_reload_required"],
  ["Reload the durable transaction journal after its failed save.", "transaction_journal_reload_required"],
  ["Signer nonce changed outside this run; reconcile before continuing.", "signer_nonce_changed_reconcile_saved_journal"],
  ["Signer balance cannot cover this transaction and its maximum gas.", "signer_balance_below_transaction_and_maximum_gas"],
  ["This transaction would exceed the run's total ETH spending cap.", "transaction_exceeds_run_spending_cap"],
  ["Saved transactions exceed this run's spending cap.", "saved_transactions_exceed_run_spending_cap"],
  ["Live fee estimate exceeds the configured MAX_FEE_PER_GAS_WEI ceiling. Wait for lower fees; no transaction was signed.", "live_fee_exceeds_configured_ceiling"],
  ["EIP-1559 fee data unavailable.", "rpc_fee_data_unavailable"],
  ["A previously confirmed transaction lost its receipt; reconcile this run.", "confirmed_transaction_receipt_missing_reconcile"],
  ["Saved transaction reverted or receipt provenance differs; manual reconciliation is required.", "saved_transaction_reverted_or_provenance_changed"],
  ["Saved transaction receipt changed canonical block; reconcile this run.", "saved_transaction_canonical_block_changed"],
  ["Saved signed transaction does not match the requested deployment stage.", "saved_transaction_intent_mismatch"],
]);
const knownCodes = new Map([
  ["TIMEOUT", "dependency_request_timeout"], ["NETWORK_ERROR", "dependency_network_error"],
  ["ECONNRESET", "dependency_connection_reset"], ["ETIMEDOUT", "dependency_request_timeout"],
  ["ENOTFOUND", "dependency_hostname_unavailable"], ["CALL_EXCEPTION", "chain_call_reverted"],
  ["BAD_DATA", "rpc_invalid_response_data"], ["SERVER_ERROR", "dependency_server_error"],
  ["40001", "database_serialization_failure"], ["40P01", "database_deadlock"],
  ["57014", "database_query_cancelled"], ["53300", "database_connection_limit"],
  ["42501", "database_permission_denied"], ["23505", "database_unique_violation"],
  ["INSUFFICIENT_FUNDS", "transaction_insufficient_funds"], ["NONCE_EXPIRED", "transaction_nonce_expired_reconcile"],
]);

/** Return only fixed diagnostic labels, never provider text, URLs or SQL parameters. */
export function dependencyErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return;
  const value = error as { message?: unknown; code?: unknown; error?: { code?: unknown }; info?: { error?: { code?: unknown } } };
  if (typeof value.message === "string" && knownMessages.has(value.message)) return knownMessages.get(value.message);
  if (typeof value.code === "string" && knownCodes.has(value.code)) return knownCodes.get(value.code);
  const rpcCode = value.error?.code ?? value.info?.error?.code;
  if (rpcCode === 429) return "rpc_rate_limited";
  // Provider-specific codes alone do not prove throttling. Preserve the number
  // from this closed set so an operator can distinguish a rejected RPC read.
  if (rpcCode === -32007) return "rpc_request_rejected_minus_32007";
  if (rpcCode === -32005) return "rpc_request_rejected_minus_32005";
  if (value.code === "UNKNOWN_ERROR") return "rpc_unknown_error_review_provider_and_saved_journal";
}

// Deliberately exclude messages, URLs, SQL, request payloads and full stacks.
// A fixed module name + line and a digest retain attribution for unmapped errors.
const sourceFiles = ["chain-transactions.ts", "chain.ts", "credit-lineage.ts", "winner-credit-retirement.ts", "runner.ts", "store.ts", "registration.ts", "rpc-provider.ts", "sepolia-wallets.ts", "social.ts", "outbox.ts", "worker-cli.ts"];
export function safeErrorDiagnostic(error: unknown, depth = 0): Record<string, unknown> {
  if (!error || typeof error !== "object") return { kind: "non_error_throw" };
  const value = error as { message?: unknown; stack?: unknown; cause?: unknown; response?: { statusCode?: unknown } };
  const result: Record<string, unknown> = {};
  const code = dependencyErrorCode(error);
  if (code) result.code = code;
  if (typeof value.message === "string") result.messageDigest = createHash("sha256").update(value.message).digest("hex");
  if (typeof value.stack === "string") {
    for (const frame of value.stack.split("\n").slice(1)) {
      const match = /\/(scripts\/(?:season-runner\/)?)([a-z-]+\.ts):(\d+):(\d+)\)?$/.exec(frame);
      if (match && sourceFiles.includes(match[2])) { result.source = `${match[2]}:${match[3]}`; break; }
    }
  }
  const status = value.response?.statusCode;
  if (typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599) result.httpStatus = status;
  if (depth < 2 && value.cause && value.cause !== error) result.cause = safeErrorDiagnostic(value.cause, depth + 1);
  return result;
}

export function publicErrorDiagnostic(value: unknown, depth = 0): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const input = value as Record<string, unknown>, result: Record<string, unknown> = {};
  const codes = [...knownMessages.values(), ...knownCodes.values(), "rpc_rate_limited", "rpc_request_rejected_minus_32007", "rpc_request_rejected_minus_32005", "rpc_unknown_error_review_provider_and_saved_journal"];
  if (typeof input.code === "string" && codes.includes(input.code)) result.code = input.code;
  if (typeof input.messageDigest === "string" && /^[a-f0-9]{64}$/.test(input.messageDigest)) result.messageDigest = input.messageDigest;
  if (typeof input.source === "string" && sourceFiles.some(file => input.source!.toString().startsWith(`${file}:`)) && /^[a-z-]+\.ts:\d+$/.test(input.source)) result.source = input.source;
  if (typeof input.httpStatus === "number" && Number.isInteger(input.httpStatus) && input.httpStatus >= 400 && input.httpStatus <= 599) result.httpStatus = input.httpStatus;
  if (depth < 2 && input.cause) result.cause = publicErrorDiagnostic(input.cause, depth + 1);
  return result;
}
