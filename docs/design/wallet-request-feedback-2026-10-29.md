# Wallet request feedback · October 29, 2026

During the V17 rehearsal in Opera, the user found the pending wallet panel confusing. It asked for a receipt hash and offered “I rejected the signature” while MetaMask was still awaiting an ordinary confirmation. Rejection itself worked: no mint was sent and retry became available.

`packages/protocol/src/experience.tsx` now distinguishes:

- Active wallet prompt: “Confirm in your wallet”, with confirmation/cancellation guidance and no recovery controls.
- Submitted transaction: “Confirming transaction”, with its known hash and automatic receipt observation.
- Interrupted/restored request without a known hash: “Check transaction status”, a collapsed “Find a sent transaction” recovery form, and an explicit cancellation confirmation before clearing the saved intent.

Switching wallet contexts clears the prior account’s success/error feedback and recovery-hash draft, so its confirmation cannot appear to belong to the newly selected account. The held-wallet regressions also verify feedback clears after an account switch.

The original transaction intent, nonce matching, cross-tab lock, disabled action, receipt validation and rejection handling are preserved. Recovery errors remain visible. No pending action is retried automatically. The shared component covers Web minting/voting/rewards/affiliates/holders and Launch operator actions on both networks; no contract or frozen rehearsal runtime changed.

Local checks: Web and Launch unit suites, workspace typechecks/builds, UI source contracts and UI harness typecheck passed. Two held-wallet regression cases at 390/1440 check that recovery controls are absent while a signature is pending, no duplicate is submitted, and rejection restores retry and clears intent. The existing Launch restored-intent test still checks an unmatched recovery hash, with the recovery disclosure opened explicitly. These browser cases are committed for CI; they were not run in another local browser because the user selected Opera. Hosted Opera acceptance follows publication and is captured in the live run evidence.
