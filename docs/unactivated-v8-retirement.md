# Retirement of an unused V8 collection

The immutable V8 round has no owner cancellation switch before its mint deadline, and ownership renunciation is disabled. Deleting its database row cannot close minting. A user-authorized retirement of a **never-activated collection with zero total mints** can instead irreversibly transfer its activation authority to [ManekinekoRetiredRoundOwner](../apps/contracts/contracts/ManekinekoRetiredRoundOwner.sol).

This separate contract has exactly two immutable addresses: `retiredRound` and `recoveryRecipient`. The recipient must be the round's actual owner when it is constructed and when it accepts ownership. Construction and acceptance both require the V8 marker, `saleActivated() == false` and `totalMinted() == 0`. The original owner calls the round's `transferOwnership(retirementAddress)`; anyone may then call `acceptRetirement()`. The round must explicitly have that retirement contract as its pending owner. Acceptance emits `RoundPermanentlyRetired` and leaves no pending transfer.

The retirement contract has no activation, ownership-transfer, arbitrary-call, delegatecall, upgrade or destruction API. Once accepted, neither the former owner nor another caller can activate the round or reclaim its ownership. It must never be used for an activated or minted collection. V8 bytecode, frozen terms, old exports, registry records and historical claims remain unchanged. The round is not marked `cancelled` before its original deadline; any application archive is separate from this on-chain proof.

Unused VRF funding remains in the round's original subscription until the V8 contract permits its withdrawal. After the original mint deadline, anyone can call the retirement contract's `recoverRandomnessFunding()`. That call can send funds only to the fixed original owner; early or repeated withdrawal attempts revert under V8's existing rules. Anyone may separately call the round's `cancelExpiredRound()` at expiry. No deadline or withdrawal rule is bypassed.

## Migration proof

[The retirement verifier](../apps/contracts/scripts/retired-round-verification.ts) verifies a canonical block before and after its reads. It requires the target's executable runtime to match the reviewed V8 artifact, a never-activated zero-mint state, accepted ownership with no pending transfer, and the owner's exact reviewed retirement runtime. It checks the retirement version and target/recipient getters, then checks **every occurrence** of both immutable values against those bindings. A marker-only lookalike, EOA, pending transfer, modified executable code or inconsistent hidden immutable address cannot establish retirement.

The old Aster-branded Sepolia round at `0x1ff99e7a579c4df625e1f73d66cfebad4d0829bf` has a separately reviewed compiler-metadata template. The archived build `solc-0_8_37-9c6325834a045830bc0849e3c942980bbb9b95e7` and current V8 build have byte-identical round source, matching compiler/settings/ABI, 23,082 runtime bytes and identical 113 immutable positions. Their only runtime differences are 30 bytes inside the CBOR metadata hash, from the renderer's Aster-to-Tincta text changes. The verifier permits exactly that historical template on chain **11155111** at that address, with normalized template hash `0xf698828e1f0feb57b52cbcf91c8a96d43de7f19e531a7e051d4be0b602ead30f`. It checks the complete historical template hash and every executable byte, rather than stripping arbitrary metadata. Wrong networks, addresses, metadata or modified activation/recovery code fail. The historical source and exports are not rewritten.

[Winner-credit lineage verification](../scripts/winner-credit-retirement.ts) retains its existing registry history, runtime, factory, funding and block checks. It accepts this proof only for an otherwise open zero-mint target. Ordinary cancelled, expired and sold-out targets keep their existing criteria. Setup and every later V10 lineage check use the same proof; it is not an operator-supplied bypass. Governance must still keep previous registries unfunded and stop approving/registering new old-version targets.

Local tests cover the real V8 ownership and activation paths, cancellation and fixed-recipient VRF recovery at expiry, runtime/immutable binding and adversarial verifier cases. Local proof does not establish a live deployment or transfer; the dated Sepolia operations record must supply the actual addresses, receipts, canonical block and recovery deadline.

## Executed Sepolia retirement — 2026-09-25 UTC

The user requested deletion of the unused Cinder Study collection, ID `e30303a5-7b3f-46f0-8b88-258bc1a74f0a`. Its zero-mint, never-activated round was permanently retired at canonical block **11780816**, hash `0xa461a27441f0b9d7bd83f96f6c86481059a223523b4c8b5d17c9fb2fc49aaf9e`, with two confirmations. The accepted retirement owner is `0x29E27cEB200Dd3D2be9398C5A3ED5BA0794198Bc`, runtime hash `0x55c3612fffae561634d17830725909968a6a5758fc264aef74abfbe61bf409c5`. The fixed recovery recipient is the original operator `0x3b2571129c05bD71B6504596aB2ca52B3ffB7223`.

| Operation | Transaction | Block |
| --- | --- | ---: |
| Deploy retirement owner | `0x5cca0883ba1b22c8c367ae7e19812bb101fefcf6501eb82e68033f808785af87` | 11780807 |
| Initiate ownership transfer | `0xd5fb1710d4c278450e19c95062043ab4f9e131f0da9c4dd4f5469c88d59c5381` | 11780813 |
| Accept permanent retirement | `0xa6140ed3fc69124bdd41da9e1a68e96718e22efa5b01fad78edf7a4a494c79bd` | 11780816 |

After live runtime/ownership verification, the target's public collection/deployment/state, affiliate program, checkpoint and three indexed event rows were deleted in a scoped staging transaction. An encrypted backup and the immutable finalized Launch audit remain. Historical completed V8 collection `c8c1cea8-5db9-4206-a64b-4bc3ec025853` was not deleted.

The unused 0.3 ETH VRF subscription was **not withdrawn**. V8 permits recovery only after **2026-10-21 18:00 UTC**. At that time, `recoverRandomnessFunding()` on the retirement owner returns the remaining balance to its fixed recipient. The season runner does not perform this separate recovery.

Private proofs, encrypted journals and removal backup are under `.private/v10-setup-2026-09-25/`. See the [V10 readiness record](sepolia-v10-readiness-2026-09-25.md) for the subsequent registry migration and application verification.
