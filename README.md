# Tax Ledger

Slim multi-entity tax dashboard for Lance + Heather. The opinionated subset
of QuickBooks they actually use, plus the bits QBO is bad at (multi-entity
transfers, kid-employee FICA exemption, drop-folder ingestion).

Full scope and verification checklist live in [`BRIEF.md`](./BRIEF.md).

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind v4
- Drizzle ORM on Neon Postgres (`@neondatabase/serverless`)
- Zoho SMTP for tax-deadline reminders
- Vercel Blob for receipt + statement storage
- Anthropic SDK for the drop-folder classifier

## Quick start

```bash
npm install
cp .env.example .env.local
# Fill in DATABASE_URL (Neon — separate project from cobbvault)

npm run db:push        # apply schema to Neon
npm run db:seed        # insert the six entities
npm run dev            # http://localhost:3000
```

## Layout

```
src/
  app/
    page.tsx                 # v0 feature dashboard
    entities/                # six LLCs / sole prop / individual
    accounts/                # Bluevine + BofA + card holders
    transactions/            # the canonical ledger
    contractors/             # 1099 view (killer feature #1)
    employees/               # W-2 + minor kids (killer feature #2)
    transfers/               # inter-entity rent / cleaning / wages
    receipts/                # drop folder + phone upload (killer feature #3)
    imports/                 # statement importer
  lib/
    db/
      schema.ts              # Drizzle schema for all 17 tables
      index.ts               # Neon HTTP client
      seed.ts                # six-entity seed
drizzle/
  0000_init.sql              # generated migration
BRIEF.md                     # the full project brief
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Next dev server |
| `npm run build` / `npm start` | Production build + serve |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate a new migration from `schema.ts` |
| `npm run db:push` | Push schema directly to Neon (skip migrations for v0) |
| `npm run db:studio` | Drizzle Studio for browsing data |
| `npm run db:seed` | Seed the six entities |
