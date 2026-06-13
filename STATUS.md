# The Ledger — v0 status

Last updated: 2026-06-13 overnight session. All 9 BRIEF v0 items shipped.

## What's live

| Route | Purpose | State |
|---|---|---|
| `/` | Dashboard — scope-aware counts + section tiles | ✅ |
| `/quick-entry` | Heather's mobile manual-entry form + auto-match | ✅ |
| `/transactions` | Filterable ledger + per-row drawer + tagging | ✅ |
| `/contractors` | 1099 view + $600 W-9 warning + Tax1099 CSV export | ✅ |
| `/employees` | W-2 + minor-child split + Roth headroom | ✅ |
| `/employees/[id]` | Per-employee detail + DOB/hire/term edit | ✅ |
| `/transfers` | Pair detector + standing rules + confirm/unlink | ✅ |
| `/receipts` | Phone upload + Claude classify + auto-match | ✅ |
| `/imports` | Statement-import log (read-only feed from watcher) | ✅ |
| `/deadlines` | 1120-S, 1040, 941, 940, EFTPS, G-7, SUTA, more | ✅ |
| `/export` | CPA per-entity per-year CSV bundle index | ✅ |
| `/accounts` | Per-institution account list (clickable rows) | ✅ |
| `/accounts/[id]` | Account edit + cardholder management | ✅ |
| `/entities` | Entity list with property + rental classification | ✅ |

## DB state (as of this commit)

- 6 entities — Path to Change, PTC Havens, H&L Place of Grace, H&L Havens, CFS, Personal Joint
- 11 bank accounts (5 Bluevine sub-accounts + 6 real backfilled BofA/Axos/AMEX accounts)
- **2,109 transactions** backfilled from cobbvault
- 94 tax deadlines auto-seeded for 2026 + 2027
- 2 users seeded (Lance + Heather, no auth yet)
- 0 contractors / employees / transfers / receipts / manual entries — empty, ready to populate

## Scripts you can run

```bash
npm run dev                       # next dev
npm run db:push                   # apply schema to Neon
npm run db:seed                   # entities + users + Bluevine accounts (idempotent)
npm run seed:deadlines [YEAR]     # seed tax deadlines for year (defaults to current + next)

npm run backfill:cobbvault        # dry-run sync from cobbvault
npm run backfill:cobbvault -- --commit  # live sync
npm run backfill:decisions        # dry-run sync cobbvault decisions
npm run backfill:decisions -- --commit  # live sync transfer/personal/etc tags

npm run watch:drop                # drop-folder watcher (needs ANTHROPIC_API_KEY + DROP_FOLDER_PATH)
```

## Key flows end-to-end

1. **Classify Amazon-shaped txns fast** — open any Amazon row on /transactions → drawer → type contractor or employee name → tick "Also tag N other untagged txns with merchant X" → one click does the lot.
2. **Heather quick entry** — go to /quick-entry on phone → entity, paid out / received, amount, date, payee → save. Auto-matches to a transaction within ±5 days + exact signed amount if exactly one candidate exists; otherwise sits "awaiting match" until the next statement import.
3. **Inter-entity transfer reconcile** — /transfers shows 30+ candidate pairs from the backfilled data. Pick purpose (rent / cleaning / loan / reimbursement / other), confirm → links both sides into one `inter_entity_transfers` row.
4. **Receipt drop from phone** — /receipts → upload a JPEG/PNG/PDF → Claude extracts merchant/date/total/tax/tip → auto-matches to a transaction (±$0.50 / ±5 days, same entity preferred).
5. **CPA hand-off** — /export → pick year → download per-entity CSV bundle (transactions + 1099-NEC + employee summary).
6. **Tax deadline tracking** — /deadlines shows 94 auto-seeded entries. Filter by overdue / next 30 / per kind. Mark paid as you go.

## What's TBD (your input needed)

- **Last4 + cardholder names for BofA cards** — the seeded TBD placeholders were removed; the 5 real BofA / debit cards from cobbvault are there, but cardholder names are empty. Go to /accounts/[card-id] and add holders.
- **Real W-2 + minor-child employees** — none seeded; create them by tagging a transaction on /transactions, or once a few exist, edit DOBs on /employees/[id] so Roth headroom math works.
- **Standing transfer rules** — none seeded; set them up on /transfers (PTC Havens ← Path to Change rent, CFS ← Path to Change cleaning, CFS → kid wages).
- **Property addresses + EINs** — entities are seeded but EINs / formation_dates / registered_agent are NULL. Wire an entity edit page when you want to fill those.
- **Vercel deploy** — repo lives at `https://github.com/hoodlover/theledger`. To deploy: vercel.com/new → import → set `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `ANTHROPIC_API_KEY` env vars (skip `COBBVAULT_DATABASE_URL` and `DROP_FOLDER_PATH` — local-only).
- **Pre-auth shim** — `users` table is real, but there's no login UI. `tl_user` cookie is set on first request and can be swapped programmatically; manual_entries are credited to whoever the cookie says. Wire actual NextAuth / Clerk before exposing publicly.

## What's NOT done from BRIEF.md

Deferred to v1 per the brief, still deferred:
- Property paperwork tracker (`llc_paperwork`) — table exists, no UI
- Full doc classifier (W-9 / 1099 / W-2 / deeds / leases) — only statements + receipts handled
- Depreciation schedules per property
- Mileage log
- Multi-property per LLC
- Roth IRA contribution-runner (we show capacity; don't push to brokerage)
- 1099-K / 1099-MISC inbound from Airbnb / Stripe / PayPal
- Standing-rule pre-creation of expected transfer rows ahead of the actual statement import

## Files of note

- `BRIEF.md` — original project brief (renamed Tax Ledger → The Ledger)
- `CLAUDE.md` — guidance for future Claude sessions
- `src/lib/db/schema.ts` — 17-table Drizzle schema
- `src/lib/tax-constants.ts` — 2024–2026 standard deduction + Roth limits
- `src/lib/receipt-classify.ts` — shared Claude classifier prompt (used by /receipts/upload and the drop-folder watcher)
- `src/components/ui.tsx` — design-system primitives
- `scripts/backfill-from-cobbvault.ts` — accounts + transactions sync
- `scripts/backfill-decisions-from-cobbvault.ts` — reconciliation decisions sync
- `scripts/seed-tax-deadlines.ts` — auto-seed payroll + tax deadlines
- `scripts/watch-drop.ts` — drop-folder statement watcher
