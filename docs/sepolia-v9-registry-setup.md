# Sepolia V9 registry and automation setup

Verified on **2026-09-21 UTC**, against chain **11155111** and the existing isolated staging database. This is an executed setup record, not a season launch. Mainnet has not been configured or deployed by this setup.

## Database and Launch

- Migration `024_season_automation_runtime.sql` was applied after checking all existing migration checksums and the staging database identity. No fixtures were seeded.
- Dedicated role `manekineko_staging_season_worker` was created. Actual connections verified the Web, Launch and worker grants. Web cannot read private runtime profiles; the worker cannot read operator accounts/sessions, modify frozen collection economics or create schema objects.
- Existing records remain: two immutable Sepolia V8 deployments and 22 Mainnet season drafts. There were no Sepolia season automation plans at setup time. Prepared/finalized exports were not changed.
- Launch and the local worker share the same privately stored encryption key. The staging Launch deployment was updated with the user's explicit approval. An authenticated hosted read verified `encryptionConfigured=true`, no saved X profile and no run. Anonymous runtime access returns 401.
- X credentials are intentionally absent. In [staging Launch](https://manekineko-staging-launch.vercel.app/seasons), select Sepolia, create/save a fictional season, then use its **X account** section. Saving an X profile is separate from preparing or starting a season.

## Canonical registry pins

| Component | Sepolia address | Runtime keccak256 |
| --- | --- | --- |
| Eligibility V4 | `0x7FB367394834fEdceB97014A5A74395B96c5Ca33` | `0xf0ead8398edb59f432c09dadf8f8b925ae749ea7d97e021e4ab6cbc1b4e3edb2` |
| Winner Credits V5 | `0xa8d5a0359D607bAFC8e2edC6Ac81771DA6659605` | `0xb203254511955e7e53a7fabbfa6ead77fc8ab19d6430974a7e5fbfa36e66b009` |
| Previous Winner Credits V4 | `0x951BEb244be852aD0a820B94a41eC291ea7E7b15` | `0xd4a7e79dfe212deaa8fbdb46001c56ed80bb539f781145e5f0707e10b81cfc5b` |

All are owned by the existing Sepolia operator `0x3b2571129c05bD71B6504596aB2ca52B3ffB7223`. The new deployments matched the pinned compiled runtime, version markers and owner. Winner Credits V5 points to the previous registry and preserves its zero legacy Merkle root. Runtime verification does not imply independent audit or explorer source verification.

The completed V8 source is `0xf564cc9cA88A036211dC37cBDc4F116f18a22cb2`, round 1 of factory `0x3effd1447e331d322D5e6D5a3cD042C34cf92C9a`. It was imported as sequence 1 with Eligibility `sourceOnly=true` and Credits `rewardsOnly=true`. It cannot become a new enrollment or sponsored-mint destination. A new V9 destination follows this historical source, preserving the original bootstrap boundary. The two distinct holders across its six awards had matching old/new lifetime reward usage at verification.

Before migration, the old registry's unused **0.06 Sepolia ETH** sponsorship for that sold-out collection was returned to the same operator wallet. Its total sponsorship was then verified as zero. The superseded, unactivated V8 collection `0x1ff99e7a579c4df625e1f73d66cfebad4d0829bf` also has zero sponsorship; it was not imported or activated. Keep all old registry targets unfunded: old immutable registries cannot observe redemptions made in V5.

| Action | Confirmed transaction |
| --- | --- |
| Recover unused V8 sponsorship | [0xd403…c2ae](https://sepolia.etherscan.io/tx/0xd4031283093bd2f9a7f64410b67ff6cdddf852d323149f6c772789d670c5c2ae) |
| Deploy Eligibility V4 | [0xb632…3a99](https://sepolia.etherscan.io/tx/0xb632363da9f8d04acfc72ee8d19028020a9f28fc7da9e78ef2f33ad8e4bf3a99) |
| Deploy Winner Credits V5 | [0xc3de…9c22](https://sepolia.etherscan.io/tx/0xc3deb04078655eee28ea77590ec3b66c965a2b873e119754b6509650e7529c22) |
| Approve historical factory in Eligibility | [0x784d…d6bb](https://sepolia.etherscan.io/tx/0x784d9d74b8d721328339ae057214889c37602a3e010d525ab06c418481acd6bb) |
| Import completed V8 eligibility source | [0xda93…96be7](https://sepolia.etherscan.io/tx/0xda93f20f36a51f08d237b471c8c40eaba80b54b190f786db2389cb67bd796be7) |
| Approve historical factory in Credits | [0x12d2…1a15](https://sepolia.etherscan.io/tx/0x12d20a65832fde6e245e947da7659124632539e088c83886369bf26d4f311a15) |
| Import completed V8 reward source | [0xd657…8063](https://sepolia.etherscan.io/tx/0xd6572abbffe7d8ed8d63df80935aa9aabfaff7051ece29ab0246dc4d01d28063) |

The six setup transactions used **0.005756409747638876 Sepolia ETH** in gas, excluding the separate sponsorship recovery. All six receipts were independently checked against canonical blocks through block **11747780**, hash `0x751fe82b6b47079b467fd4512c7277ac8821fc8ac2560266f2230b730fde867d`.

## Runtime configuration and recovery

The verified addresses/hashes are installed in the private worker configuration and local staging Web environments. The Web project uses V5 as `WINNER_CREDITS_ADDRESS_11155111` and separately pins the old registry with `WINNER_CREDITS_PREVIOUS_*`. Historical V8 factory and Eligibility V3 pins continue to identify the completed V8 collection; they are never relabeled as V9.

Both staging deployments completed their production build/type checks and reached `READY`: Launch `dpl_BhEJfDPazXw3D6GaahwF5znNUcVW`, Web `dpl_FwEekUp1TfdFC2gJYccJ9oyxsu9m`. Their stable staging aliases were updated. Hosted Web returned 200 for the seasons page, completed collection page and empty `/api/seasons/schedules`. Winner-credit reads for both historical winner wallets returned V5 with three qualifying source awards each and **one** available lifetime reward each, verified at block 11747800. These were read checks; no reward was redeemed and no X credential save was simulated.

Private operator files are under `.private/season-setup/`, excluded from source and Vercel uploads. `worker.env` holds the restricted direct database connection, RPC and shared encryption key; the operator key stays in the existing `.env.staging.wallets.local`. `registry-config.json` and the encrypted `registry-journal.enc` are bound to this exact migration. Keep them with the same key for recovery. Do not regenerate the setup input from the now-updated canonical registry environment or start a fresh journal to rerun an already completed deployment.

The configured **0.1 ETH** cumulative limit and **5 gwei** fee ceiling are the reviewed registry-setup policy. A future 1,000-mint season needs its own reviewed aggregate budget; do not treat this setup limit as sufficient for the rehearsal. Existing buyer/affiliate donor key names are configured for explicit reuse. No donor funds were moved during setup.

The encrypted 50-wallet vault is created on the first executed Sepolia rehearsal and then reused. Registry setup has not created that vault, minted NFTs, deployed a V9 factory/collection, scheduled a season, started a persistent worker, or published to X. Before the rehearsal, prepare a fresh fictional Sepolia V9 plan with these registries, configure the X test account, complete the V9 factory/Web/indexer trust settings and review the whole-season funding cap. See [season automation](season-automation.md).
