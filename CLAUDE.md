@AGENTS.md

# Claude notes — The Ledger

Start by reading [`BRIEF.md`](./BRIEF.md). It is the source of truth for
scope, data model, and the v0 verification checklist.

## Ground rules

- **Money is integer cents.** Every `*_cents` column is `integer`. Never
  store amounts as float or string.
- **Bank/card imports are the canonical ledger.** Manual entries get
  matched against imports, not added blindly. See `manual_entries.matched_transaction_id`.
- **Inter-entity transfers are one row, not two.** Both `from_transaction_id`
  and `to_transaction_id` point at the matched bank lines.
- **Sniff magic bytes, not extensions.** Bluevine PDFs download without a
  `.pdf` extension. The cobbvault importer silently drops them — do not
  repeat that bug.
- **Enum-shaped columns are plain text in v0.** Validate at the app
  boundary with Zod. Promote to `pgEnum` only when the values stop changing.

## Sibling repo

Cobbvault lives at `C:\Projects\cobbvault\`. It is **reference-only**:

- Lift patterns inline (importer prompt, reconcile-classify algorithm,
  schema style) — do NOT import as a dependency.
- Do NOT add The Ledger features there.

Specific files worth mining (do not assume they are present here):

- `scripts/import-inbox.ts` — Claude PDF classifier + importer
- `scripts/seed-bluevine-accounts.ts` — Bluevine sub-account ↔ LLC mapping data
- `src/lib/reconcile-classify.ts` — receipt ↔ statement-line auto-match
- `src/lib/db/schema.ts` — Drizzle conventions

## Open questions (from BRIEF.md §"Things still TBD")

Do not assume these are settled — flag them when relevant:

- Heather's exact comp structure (owner draws vs W-2 vs K-1)
- H&L Havens cabin STR vs LTR classification
- Blue Ridge GA zip (verify 30513 vs 30503)
- Depreciation schedules per property
- The two missing Bluevine sub-accounts (5 named, 7 referenced)
- Whether "3 cards for 2 buildings" means a second building beyond PTC Havens
