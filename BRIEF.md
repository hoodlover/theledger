# Tax Ledger — slim multi-entity tax dashboard (project brief / starting prompt)

> Paste this whole file into a fresh Claude Desktop conversation to kick off
> the project. Self-contained — no prior context required.
>
> **Living document.** Lance is still surfacing pieces ("probably more but
> lets add this to the plan… I am sure I have not thought through what all
> this will mean"). The **Things still TBD** section at the bottom is the
> growth edge — add to it as new context arrives instead of redesigning the
> spine.

## Context

Lance Cobb runs **Path to Change LLC** (an S-corp) on QuickBooks Online
today. He's now layering on multiple holding LLCs for properties, a sole
prop his wife uses to employ their kids, W-2 employees, ~17 1099
contractors, BofA company credit cards held by three other people, a new
$500K building Heather is buying this year, and possibly Airbnb income on
their cabin. A CPA is being hired but Lance and Heather still do the
day-to-day data work.

QuickBooks has the surface area to do all of this, but the friction is
real:

- **QBO has 80% more than they need.** This will be slim and opinionated.
- **Double entries.** Heather sometimes enters a transaction Lance already
  entered. Sometimes she misses one because a payment was an urgent ask.
  Bank statements are the source of truth — the app must make that obvious.
- **1099 reality check.** ~17 1099s this year. The real totals are
  sitting on bank statements. One click should answer "what did Path to
  Change actually pay each 1099 in 2026?"
- **Multi-entity is now native, not a side note.** Six entities with
  inter-entity flows (rent from PTC Havens to Path to Change, cleaning
  from CFS to Path to Change, kid wages from CFS, etc.).
- **CPA hand-off.** The CPA does the heavy lifting; Lance just needs
  clean, organized exports per entity per quarter / per year.

## Entities & properties

Six first-class entities. Each is a row in `entities`; properties are
nullable attributes on the entity (one property per LLC for v0).

| Entity | Type | Role | Property |
|---|---|---|---|
| **Path to Change LLC** | S-corp | Operating company; pays W-2 employees + 1099 contractors; leases building from PTC Havens | — |
| **PTC Havens LLC** | LLC | Holding; ~$500K building Heather is buying in 2026; leases to Path to Change | New building (address TBD) |
| **H&L Place of Grace LLC** | LLC | Holding | 3220 Continental Ave, Cumming GA 30041 |
| **H&L Havens LLC** | LLC | Holding; **possibly** short-term rental (Airbnb) on cabin in 2026 | 421 Weeks Creek Rd, Blue Ridge GA (zip TBD — verify 30513) |
| **CFS LLC** (Cobb Family Solutions) | Sole prop (Heather) | Employs the Cobb kids as cleaners; bills Path to Change for cleaning services | — |
| **Personal Joint — Lance & Heather Cobb** | Individual (1040) | Final 1040; receives K-1s and Schedule C flow-through | — |

Notes the system should encode:

- **PTC Havens → Path to Change lease.** Once the building closes, PTC
  Havens invoices Path to Change rent monthly. Income to PTC Havens
  (Schedule E or 1065 depending on election); rent expense to Path to
  Change.
- **CFS → Path to Change cleaning contract.** CFS invoices Path to
  Change for cleaning. Income to CFS (Schedule C); cleaning expense to
  Path to Change.
- **CFS → kids' W-2 wages.** Heather's sole prop pays the kids. Under
  IRS rules a parent's sole prop can employ a minor child without FICA
  withholding, and the child can earn up to the federal standard
  deduction (~$14,600 in 2024; verify current year) without owing
  federal income tax. The system must flag minor-employee status so
  payroll exports don't accidentally withhold FICA.
- **H&L Havens — STR vs LTR matters.** If the cabin starts Airbnbing,
  tax treatment may shift to Schedule C (material participation /
  average rental < 7 days) instead of Schedule E. Tag the entity with
  a `rental_classification` field so reports can split correctly.

## Bank accounts, sub-accounts & cards

```
Bluevine
  ├─ 9058  → H&L Place of Grace
  ├─ 6242  → PTC Havens
  ├─ 6628  → H&L Havens
  ├─ 8845  → H&L Havens
  ├─ 6259  → Personal joint
  └─ (two more — already seeded in cobbvault, see seed-bluevine-accounts.ts)

BofA — Path to Change LLC
  ├─ Checking
  ├─ Savings
  └─ Company credit cards (3 cards, 3 named holders)
       ├─ Card A — Holder: [name] — purpose: building expenses
       ├─ Card B — Holder: [name] — purpose: building expenses
       └─ Card C — Holder: [name] — purpose: building expenses
       (cards expense against ONE OF TWO buildings — each txn tags which
        building/property; helpful for PTC Havens vs Place of Grace splits)
```

Data shape suggestion:

```
bank_accounts
  id, entity_id, institution, last4, kind (checking|savings|credit_card|loc),
  display_name, routing_rules

credit_card_holders   -- only populated for kind='credit_card'
  id, bank_account_id, person_name, person_role, started, ended?

transactions
  …, card_holder_id?, property_tag? (which property the expense is for)
```

## People being tracked (payroll & contractor types)

| Type | Where they sit | Tax handling |
|---|---|---|
| **W-2 employees (2–4)** | Path to Change | Standard W-2 with state/federal/FICA categories per employee. Categories stay fixed until a raise; raise triggers a new effective-dated category row. |
| **1099 contractors (~17)** | Path to Change | W-9 on file. $600/yr threshold triggers 1099-NEC at Jan 31. App shows YTD totals + W-9 status + missing-W9 warnings. |
| **Kid employees** | CFS LLC | Special: no FICA (parent sole prop + minor exemption), no federal income tax up to standard deduction. Track age, YTD wages, eligibility window. **Side benefit to track: Roth IRA contribution capacity** = earned income, so the kids can fund Roths with their wages — surface this on the kid's profile. |
| **Owner draws / distributions** | Lance (Path to Change S-corp), Heather (CFS sole prop) | Not deductible. Track separately from W-2 wages. **Heather's exact comp structure is TBD — see Things still TBD.** |
| **Card holders** | BofA Path to Change cards | Not paid through the system, just named so card transactions are attributable. |

## Inter-entity relationships (transfers)

A first-class concept. When PTC Havens invoices Path to Change for rent,
that's NOT two separate transactions floating in two ledgers — it's one
**transfer** event that produces income on one side and expense on the
other. The system stitches them.

```
inter_entity_transfers
  id, occurred_on,
  from_entity_id, from_transaction_id?,   -- the expense side
  to_entity_id,   to_transaction_id?,     -- the income side
  amount_cents, purpose (rent|cleaning|loan|reimbursement|other),
  notes

  -- when only one side has imported, the other side is null and the
  -- transfer sits in a "needs match" queue
```

Standing transfer rules ("templates") for recurring flows:

- **Rent: PTC Havens ← Path to Change**, monthly, fixed amount
- **Cleaning: CFS ← Path to Change**, monthly or per-invoice
- **Kid wages: CFS → [kid name]**, semi-monthly or monthly

A standing rule pre-creates the transfer row; matching it to the
real bank transactions confirms it.

## Design principles

1. **Bank statements + cards are the source of truth.** Imported lines
   are the canonical ledger. Manual entries get *matched against* import
   lines, not blindly added.
2. **Slim and opinionated.** No invoicing module beyond what's needed for
   inter-entity transfers. No inventory. No journal entries UI. The CPA
   does the GAAP-shaped stuff from our clean exports.
3. **Multi-entity native.** Entity is a first-class record; every txn,
   employee, contractor, doc, deadline hangs off an entity.
4. **Inter-entity transfers are first-class.** Not two unconnected
   transactions in two ledgers.
5. **Two-editor dedup is core, not a v3 feature.** Lance and Heather
   both edit. Dedup happens at the transaction level.
6. **Drop a file, the system handles it.** Watched folder + Claude
   classifier (see "Drop folder" section). Lance and Heather should
   almost never have to type a transaction.

## Users

- **Lance** — owner, full edit, all entities.
- **Heather** — co-editor, full edit, all entities (same role for v1).
- **CPA** — does NOT log in. Receives exports.

## Core data model (separate Postgres DB — NOT shared with cobbvault)

Sketch, not final. Use Drizzle conventions consistent with cobbvault.

```
entities
  id, name, slug, kind (s_corp|llc|sole_prop|individual),
  ein, state, formation_date, registered_agent,
  property_address?, property_purchase_date?, property_purchase_price_cents?,
  rental_classification? (str|ltr|n_a),
  notes

bank_accounts
  id, entity_id, institution, last4, kind, display_name, routing_rules

credit_card_holders
  id, bank_account_id, person_name, person_role, started, ended?

statement_imports
  id, entity_id, bank_account_id, source_filename, period_start, period_end,
  imported_at, blob_url

transactions
  id, statement_import_id, bank_account_id, entity_id,
  posted_date, amount_cents, raw_description, normalized_merchant,
  category_id, contractor_id?, employee_id?, card_holder_id?,
  property_tag?, attached_receipt_id?,
  is_inter_entity_transfer bool,
  notes

manual_entries
  id, entered_by_user_id, entity_id, amount_cents, date,
  payee_text, category_id, notes,
  matched_transaction_id?, matched_at?

contractors  -- 1099 recipients
  id, entity_id, legal_name, dba?, ein_or_ssn_encrypted,
  address, w9_doc_url?, started_date, ended_date?, default_category_id?

employees   -- W-2 (Path to Change) + kid employees (CFS)
  id, entity_id, legal_name, employee_kind (standard_w2|minor_child),
  date_of_birth?, hire_date, term_date?,
  ssn_encrypted, address,
  current_pay_category_id, default_property_tag?

employee_pay_categories  -- effective-dated; updates on raise
  id, employee_id, effective_from, pay_rate_cents, pay_period (hourly|salary|piece),
  withholding_profile_id

withholding_profiles  -- e.g. GA single-0, GA married-1, kid_minor_exempt
  id, name, federal_w4_meta, state_w4_meta, is_minor_exempt bool

inter_entity_transfers
  id, occurred_on, from_entity_id, from_transaction_id?,
  to_entity_id, to_transaction_id?, amount_cents,
  purpose, standing_rule_id?, notes

standing_transfer_rules
  id, from_entity_id, to_entity_id, cadence (monthly|semi_monthly|annual),
  default_amount_cents?, purpose, active, notes

contractor_payments  -- derived: SUM(transactions WHERE contractor_id = X)
employee_payments    -- derived: SUM(transactions WHERE employee_id = X)

receipts
  id, entity_id, merchant, purchase_date, total_cents,
  tax_cents?, tip_cents?, blob_url, source (drop_folder|phone_upload|email),
  ocr_raw_text, classified_at, confidence,
  matched_transaction_id?, matched_at?, match_method (auto|manual|none),
  notes

tax_deadlines
  id, entity_id?, kind (1120_s | 1040 | quarterly_estimated | state_annual |
    llc_renewal | registered_agent_renewal | 1099_due | w2_due |
    w9_collection | property_tax | insurance_renewal | mortgage_due),
  due_date, status, amount_cents?, paid_date?, notes,
  reminder_lead_days int default 30

llc_paperwork
  id, entity_id, doc_kind (operating_agreement | ein_letter | annual_report |
    state_filing | insurance_policy | mortgage_note | deed | lease_agreement |
    misc),
  filed_date, expires_date?, blob_url, notes

categories  -- expense categories that map to Schedule C / 1120-S lines
  id, name, schedule_c_line?, form_1120s_line?, schedule_e_line?,
  is_capital bool

users
  id, name, email, password_hash
```

## The 1099 view (killer feature #1)

Per entity, per tax year:

```
Path to Change LLC — 1099 Contractors — 2026
─────────────────────────────────────────────
Acme Plumbing            $12,400.00   [10 payments]   W-9 ✓
Bob's Lawn Care           $8,750.00   [14 payments]   W-9 ✓
…
─────────────────────────────────────────────
17 contractors    Total: $47,830    [Generate 1099 packet]
⚠ 2 contractors over $600 with no W-9 on file
```

- Numbers join `transactions.contractor_id`. No manual sum.
- Click a row → every payment with date, amount, statement source.
- "Generate 1099 packet" exports a Track1099 / Tax1099-ready CSV.

## W-2 / payroll view (killer feature #2)

Per entity:

```
Path to Change — W-2 Employees — 2026 YTD
─────────────────────────────────────────────
Jane Smith     $42,000   Hourly @ $25     Withholding: GA-M1
Tom Brown      $28,500   Hourly @ $22     Withholding: GA-S0
…

CFS LLC — Minor Employees — 2026 YTD
─────────────────────────────────────────────
Kid A (14)     $4,200    No federal withholding   $10,400 / yr cap remaining
Kid B (12)     $3,100    No federal withholding   $11,500 / yr cap remaining
                                                  Roth IRA capacity: $4k each
```

The minor-employee row shows remaining standard-deduction headroom for
the year so Heather can plan payroll without crossing the threshold.

## Receipts (killer feature #3 — drop folder co-star)

Receipts are first-class records, not just blobs hanging off transactions.
The interaction model:

1. **Drop a receipt** (photo, PDF, or email forward) in the drop folder
   under an entity sub-folder (e.g. `…\Tax Ledger Drop\receipts\path-to-change\`).
   Or upload from phone via a `/receipts/upload` PWA route Heather can
   pin to her home screen.
2. **Claude classifies** → `{merchant, purchase_date, total_cents,
   tax_cents?, tip_cents?, line_items?, confidence}`. Store the OCR raw
   text alongside so the classifier can be re-run later.
3. **Auto-match to a transaction** on (entity + amount within $0.50 +
   date within ±5 days). On match: link
   `receipts.matched_transaction_id` and
   `transactions.attached_receipt_id`.
4. **Cross-entity flag**: if a receipt is dropped under entity X but the
   matching transaction lives under entity Y, flag it. Usually one of:
   - Lance/Heather used the wrong card and need to reimburse
   - The receipt was filed in the wrong folder
   - The transaction was tagged to the wrong entity
   The CPA cares about this — it's the kind of mismatch that becomes a
   year-end mess.
5. **Unmatched receipts** sit in a "needs review" queue. Could mean:
   - The card transaction hasn't imported yet (wait)
   - The receipt was paid in cash and there'll never be a card txn
     (manually link to a cash entry)
   - Duplicate receipt for an already-matched txn (dismiss)

Per-transaction view shows the attached receipt thumbnail; per-receipt
view shows the matched transaction. Either side can drill the other.

For the CPA hand-off, every expense line in the export carries a
`has_receipt` flag so audit risk is visible at a glance.

This pattern is already proven in cobbvault — see
`src/lib/reconcile-classify.ts` (receipt ↔ statement-line auto-match by
amount + date with a cross-LLC flag). Lift the algorithm; rebuild on top
of the new schema.

## The reconciliation flow (dedup mechanic)

1. Statement / card import → `transactions` rows.
2. Each transaction shows up with a status:
   - **Auto-categorized** (matched a rule or prior similar txn)
   - **Needs review** (new merchant or ambiguous)
3. If a manual entry or standing-transfer-rule expected this, auto-match
   on amount + date (±5 days) + entity. On match, link
   `manual_entries.matched_transaction_id`; the manual entry stops
   counting toward totals.
4. Inter-entity transfers: when both sides import, the transfer row gets
   both `from_transaction_id` and `to_transaction_id` filled. If only
   one side has come in, it sits in a "needs match" queue.
5. Unmatched manual entries at month-end → review queue.

## Tax dates dashboard

Calendar + list view of `tax_deadlines`. Auto-seed per entity for each
year:

- 1120-S federal (Mar 15) + GA state for Path to Change
- 1040 federal (Apr 15) + GA state for joint Cobb
- Quarterly estimateds (Apr 15, Jun 15, Sep 15, Jan 15) for each entity
  that needs them
- LLC annual reports (GA: Apr 1) per LLC
- Registered agent renewals per LLC
- 1099 deadlines (Jan 31 to contractor, Feb 28 paper / Mar 31 e-file)
- W-2 deadlines (Jan 31 to employee, Jan 31 e-file SSA)
- Property tax dates per property
- Insurance renewals per property
- Mortgage payment cadence per property

Reminders at T-30, T-7, T-1 via Zoho SMTP.

## Drop folder + Claude classifier

The interaction model Lance wants: drop a file in a folder, the app
ingests it.

**Watched folder pattern** (proven in cobbvault's
`scripts/import-inbox.ts`):

1. Watcher polls `C:\Users\lance\Documents\Tax Ledger Drop\` (or similar).
2. **Sniff magic bytes**, do not trust the extension. (Bluevine downloads
   PDFs with no extension — cobbvault's importer silently drops them.
   Do not repeat that bug.) `%PDF-` → PDF, `\xFF\xD8\xFF` → JPEG, etc.
3. Send the file to Claude (Anthropic native PDF support). Prompt asks
   for a structured classification:
   ```
   { document_type: "bank_statement" | "credit_card_statement" |
                    "receipt" | "1099_nec" | "1099_misc" | "w9" |
                    "w2" | "operating_agreement" | "lease_agreement" |
                    "deed" | "insurance_policy" | "mortgage_statement" |
                    "annual_report" | "ein_letter" | "tax_return" |
                    "unknown",
     institution: "Bluevine" | "BofA" | "IRS" | ...,
     entity_guess: "Path to Change LLC" | ...,
     last4: "9058",
     period_start, period_end,
     transactions: [...] (only for statements),
     contractor_or_employee_name: ... (only for 1099/W-9/W-2),
     confidence: 0..1 }
   ```
4. Route to the right destination:
   - Statements → `statement_imports` + `transactions`
   - Receipts → attach to a transaction (or stand-alone if no match)
   - 1099s/W-9s → attach to a contractor record
   - W-2s → attach to an employee record
   - LLC docs → `llc_paperwork`
   - Tax returns → `llc_paperwork` (kind=tax_return)
5. Move the original to `Imported\<year>\<entity-slug>\`.
6. Anything ambiguous or low-confidence → `REVIEW\` with a sidecar
   `.classification.json` so Lance can fix and re-drop.

## Tech stack

- **Next.js 15 + App Router** (Lance uses this in cobbvault; familiar)
- **Postgres on Neon** — separate database, separate project
- **Drizzle ORM**
- **Tailwind v4**
- **PWA** so Heather uses it from her phone
- **Auth:** simple email + password, two seeded users only
- **Bank/doc parsing:** Claude API with native PDF support
- **Email reminders:** Zoho SMTP (Lance already has this wired)
- **Exports:** CSV + PDF; Vercel Blob for storage
- **Drop folder:** Node watcher (chokidar), magic-byte sniff, then the
  Claude classifier from §"Drop folder"

## v0 scope (~2 weeks, the smallest useful thing)

Ship a thin slice that already saves real time:

1. **Entities CRUD** — seed all six entities up front.
2. **Bank accounts + credit cards + card holders CRUD.**
3. **Drop folder + Claude classifier** for statements (statements only
   for v0 — other doc types come in v1).
4. **Transactions ledger** filterable by entity, account, date,
   category, contractor, employee, property.
5. **Contractors CRUD + 1099 view.**
6. **Employees CRUD + simple W-2 view** (Path to Change W-2s + CFS kids).
7. **Manual entry + auto-match** (Heather's phone use case).
8. **Inter-entity transfers** with standing rules for rent + cleaning.
9. **Receipt drop + auto-match** (drop folder + phone upload route;
   match to transactions; cross-entity flag).

Defer to v1:

- Tax deadlines + reminders
- Property paperwork tracker
- Full doc classifier (W-9, 1099, W-2, deeds, leases — receipts ARE in v0)
- CPA export packets (just download per-entity CSVs in v0)
- Multi-property per LLC (one property per LLC is fine for v0)
- Roth IRA capacity calculator for kids
- Mileage log
- Airbnb / Stripe / PayPal income imports

## Patterns to borrow from cobbvault

These live in `c:\Projects\cobbvault\` (Lance's existing PWA):

- **`scripts/import-inbox.ts`** — Claude-based PDF classifier + importer.
  Reuse the prompt structure and the move-to-Imported-on-success pattern.
  **Do NOT** repeat its extension-whitelist bug; sniff magic bytes.
- **`scripts/seed-bluevine-accounts.ts`** — existing Bluevine sub-account
  → LLC mapping. Re-use the data; rebuild the schema with first-class
  `entities` records instead of cobbvault's "subcategory-as-LLC" hack.
- **`src/lib/reconcile-classify.ts`** — receipt ↔ statement-line
  auto-match algorithm. Same idea applies to manual-entry dedup and
  inter-entity transfer matching.
- **`src/lib/db/schema.ts`** — Drizzle style guide.

Things cobbvault does NOT have and we must build:

- First-class `entities` table
- Employees (W-2 + minor child)
- 1099 contractor tracking
- Inter-entity transfers
- Credit card holders
- Property attributes on entities
- Tax deadline tracker (structured)
- Standing transfer rules
- Drop folder watcher (cobbvault uses a manual `npm run import-inbox`)

## Things still TBD

Lance has flagged this is partial. Add to this list as new context lands.

- **Heather's exact comp structure.** Owner draws from CFS sole prop?
  W-2 from Path to Change? K-1 distributions? Mix? Affects how she's
  modeled — `users.is_co_editor` is settled, but her **money flow**
  isn't.
- **Cabin classification.** H&L Havens cabin Airbnb → Schedule C (STR
  with material participation) vs. Schedule E. The decision affects
  category mapping and self-employment tax.
- **Zip code for cabin.** Lance wrote 30503 with question marks; verify
  the actual Blue Ridge GA zip (likely 30513).
- **Depreciation schedules** for each property — basis, in-service date,
  MACRS class, accumulated depreciation. CPA will likely produce these
  but the system should at least store them once known.
- **Mileage tracking.** Path to Change vehicle use? Heather's CFS
  cleaning trips? Could be a v2 mini-feature with a phone "start trip /
  end trip" button.
- **Home office deduction** if Heather runs CFS from home.
- **1099-K / 1099-MISC inbound** from Airbnb / Stripe / PayPal if any
  entity starts accepting card / platform payments.
- **Multi-state implications** — all entities GA-only today? Any
  out-of-state property income would change filing requirements.
- **CPA integration shape.** Read-only login? Quarterly email packet?
  Live shared folder?
- **Document retention / archive policy.** Forever? 7 years per IRS?
  Configurable?
- **The other two Bluevine sub-accounts** — Lance referenced 7 total in
  prior context; only 5 were named. Confirm the missing two.
- **Building #2 details.** "3 cards for 2 building expenses" implies a
  second building besides the new $500K PTC Havens building. Place of
  Grace? Or a third building entirely?

## Verification (how we know v0 works)

End-to-end test Lance can run himself:

1. Create six entities (or run seed).
2. Add bank accounts: Bluevine sub-accounts + BofA checking/savings/cards.
3. Name the three BofA card holders.
4. Drop a recent Bluevine PDF (extension-less) in the watched folder.
5. ~30 transactions appear under the right entity. Magic-byte sniff
   handled the missing extension.
6. Add a contractor "Test Plumber" under Path to Change. Tag 3
   transactions. 1099 view shows the total.
7. Add a W-2 employee "Test Jane" under Path to Change with a withholding
   profile. Tag a paycheck transaction. Employee view shows YTD.
8. Add a minor employee "Test Kid (age 14)" under CFS. Tag a wage
   transaction. View shows remaining standard-deduction headroom.
9. Create a standing rule: PTC Havens ← Path to Change, $4,000/mo rent.
10. Import one month of both sides' statements. The matching rent
    appears as an inter-entity transfer with both sides linked.
11. Heather adds a manual entry on her phone for cleaning Path to Change
    paid CFS. The next CFS statement import auto-matches it; no double
    count.
12. Heather drops a Home Depot receipt photo in
    `…\receipts\path-to-change\`. Claude extracts $187.43 / 2026-06-04 /
    Home Depot. It auto-matches the corresponding BofA card transaction
    and the ledger row now shows a receipt thumbnail. The `has_receipt`
    flag in the CSV export is `true` for that row.
13. Export Path to Change 2026 transactions to CSV. Numbers tie out.

All thirteen work → v0 is real.

## Suggested first prompt to Claude Desktop

> I'm starting a brand-new project from scratch:
>
> - New folder: `c:\Projects\tax-ledger\` (or whatever I name it)
> - New GitHub repo
> - New Vercel project
> - New Neon Postgres database
> - No code copied from any other project
>
> The cobbvault file paths in the brief are reference-only — pointers to
> patterns that already work in another codebase of mine. **Do not assume
> you have access to those files.** If I want to lift something specific
> from cobbvault, I'll paste the relevant code into the chat. Build
> everything else fresh.
>
> The brief: I want a slim, opinionated tax dashboard / lightweight QBO
> alternative for managing six LLCs/sole-prop entities, W-2 +
> minor-child employees, ~17 1099 contractors, BofA company credit cards
> held by three named people, inter-entity transfers (PTC Havens ↔ Path
> to Change rent, CFS ↔ Path to Change cleaning, CFS → kids' wages), and
> receipt drop-folder matching. Full brief follows.
>
> [paste this file]
>
> Please start by:
>
> 1. Confirming the v0 scope and asking any clarifying questions before
>    writing code.
> 2. Scaffolding the Next.js 15 + Drizzle + Neon project with the schema
>    in the brief and a placeholder page for each v0 feature.
>
> Don't implement the drop-folder watcher or the Claude classifier yet —
> I want to review the schema and folder layout first.
