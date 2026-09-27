import test from "node:test";
import assert from "node:assert/strict";
import { safeError } from "./worker-cli.ts";
import { safeErrorDiagnostic } from "./dependency-error.ts";
import { publicLogReport } from "./logging.ts";

test("pause reasons distinguish fixed guard failures and transport errors", () => {
  assert.equal(safeError(new Error("Signer balance cannot cover this transaction and its maximum gas.")), "signer_balance_below_transaction_and_maximum_gas");
  assert.equal(safeError(new Error("Signer nonce changed outside this run; reconcile before continuing.")), "signer_nonce_changed_reconcile_saved_journal");
  assert.equal(safeError(Object.assign(new Error("secret URL"), { code: "TIMEOUT" })), "dependency_request_timeout");
});

test("unknown failures retain a source and fingerprint without raw private contents", () => {
  const error = new Error("https://user:password@rpc.example/private-key", { cause: Object.assign(new Error("secret SQL params"), { code: "57014" }) });
  error.stack = `${error.message}\n    at persist (/workspace/scripts/season-runner/chain-transactions.ts:44:12)`;
  const diagnostic = safeErrorDiagnostic(error);
  assert.equal(diagnostic.source, "chain-transactions.ts:44");
  assert.match(String(diagnostic.messageDigest), /^[a-f0-9]{64}$/);
  assert.equal((diagnostic.cause as any).code, "database_query_cancelled");
  const serialized = JSON.stringify(publicLogReport({ mode: "paused", diagnostic }));
  assert.match(serialized, /chain-transactions.ts:44/);
  assert.doesNotMatch(serialized, /password|rpc.example|private-key|SQL|workspace/);
  assert.deepEqual(publicLogReport({ diagnostic: { code: "private", source: "/private/path", messageDigest: "secret", message: "secret", cause: { credentials: "secret" } } }), { diagnostic: { cause: {} } });
});
test("nested provider codes remain useful without exposing arbitrary error contents", () => {
  const secret = "https://secret.example/key?password=private";
  assert.equal(safeError({ code: "UNKNOWN_ERROR", info: { error: { code: -32007, message: secret } } }), "rpc_request_rejected_minus_32007");
  assert.equal(safeError({ code: "UNKNOWN_ERROR", error: { code: 429, message: secret } }), "rpc_rate_limited");
  assert.equal(safeError(Object.assign(new Error(secret), { code: secret })), "dependency_or_chain_validation_failed_review_configuration_and_activity");
  assert.equal(safeError(new Error("database_lock_lost")), "database_lock_lost");
});
