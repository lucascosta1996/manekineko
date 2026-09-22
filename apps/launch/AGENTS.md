<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Protocol version handoff

Read [the root architecture](../../docs/architecture.md) and [V10 permanent combinations](../../docs/permanent-combinations-v10.md) before protocol integration. New blank drafts use V10 (`affiliate-v10`, `unique-rank-v6`, fixed `maxMintsPerWallet: "20"`). Saved V8/V9 drafts retain their version; an explicit upgrade preserves names, colors, season IDs and economics while clearing incompatible factory and registry addresses. Finalized exports are immutable and schema version 1 now admits explicit V10 manifests. Prepared season execution accepts homogeneous V9 or V10 plans; never relabel a V9 artifact to resume it with V10.

V10 artwork previews use a clearly labeled illustrative key until deployment identity is known. Exact permanent numbers require the deployed address or actual `combinationKey()`; mint arguments never contain numbers or a seed. V10 requires Eligibility V5 and Winner Credits V6 with verified lineage and runtime pins. Launch source integration is not database migration, registry deployment, hosted verification or authorization to start a season.
