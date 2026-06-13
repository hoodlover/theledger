/**
 * Backfill Tax Ledger from cobbvault's already-classified data.
 *
 * Lance has been dropping statements into cobbvault for months; everything
 * is already parsed via Claude + landed in cobbvault's Postgres. Rather
 * than re-classify the same blobs, this script lifts the parsed rows:
 *
 *   1. Maps cobbvault LLC subcategories → Tax Ledger entities by name.
 *   2. For each cobbvault bank_account/credit_card entry tagged with an
 *      LLC subcategory, ensures a matching Tax Ledger `bank_accounts`
 *      row exists (match on entity + institution + last4).
 *   3. Copies `statement_line_item` rows into `transactions`, deduping on
 *      (bank_account_id, posted_date, amount_cents, normalized_merchant).
 *
 * Idempotent — safe to re-run. Receipts + reconciliation decisions are a
 * separate pass.
 *
 * Usage:
 *   npm run backfill:cobbvault              # dry run by default
 *   npm run backfill:cobbvault -- --commit  # actually insert
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const ARGS = process.argv.slice(2);
const COMMIT = ARGS.includes("--commit");
const DRY_RUN = !COMMIT;

const COBBVAULT_URL = process.env.COBBVAULT_DATABASE_URL;
if (!COBBVAULT_URL) {
  console.error("COBBVAULT_DATABASE_URL not set in .env.local");
  process.exit(1);
}

// Map lowercased cobbvault LLC subcategory name → Tax Ledger entity slug.
// Cobbvault names use ", LLC" with a comma. Include common variants so
// renaming on the cobbvault side doesn't silently drop accounts.
const LLC_NAME_TO_SLUG: Record<string, string> = {
  "path to change": "path-to-change",
  "path to change llc": "path-to-change",
  "path to change, llc": "path-to-change",
  "ptc havens": "ptc-havens",
  "ptc havens llc": "ptc-havens",
  "ptc havens, llc": "ptc-havens",
  "h&l place of grace": "hl-place-of-grace",
  "h&l place of grace llc": "hl-place-of-grace",
  "h&l place of grace, llc": "hl-place-of-grace",
  "place of grace": "hl-place-of-grace",
  "place of grace llc": "hl-place-of-grace",
  "place of grace, llc": "hl-place-of-grace",
  "h&l havens": "hl-havens",
  "h&l havens llc": "hl-havens",
  "h&l havens, llc": "hl-havens",
  cfs: "cfs",
  "cfs llc": "cfs",
  "cfs, llc": "cfs",
  "cobb family solutions": "cfs",
};

// Cobbvault encrypts account_number / card_number. Pull last4 from the
// account title instead, which Lance authored with the trailing 4 digits
// embedded ("Bluevine Checking 6628 — H&L Havens LLC", "BofA Checking 8486",
// "AMEX Blue Cash 01001 Amazon", etc.). Take the last 4-digit run.
function last4FromTitle(title: string | null): string {
  if (!title) return "TBD";
  const matches = title.match(/\b\d{4,}\b/g);
  if (!matches) return "TBD";
  const last = matches[matches.length - 1];
  return last.slice(-4);
}

type CobbSub = { id: string; name: string };
type CobbAccount = {
  id: string;
  type: "bank_account" | "credit_card";
  title: string;
  bank_name: string | null;
  account_type: string | null;
  account_number: string | null;
  card_number: string | null;
  cardholder_name: string | null;
  card_network: string | null;
  llc_subcategory_id: string;
};
type CobbLine = {
  id: string;
  posted_date: string;
  raw_description: string;
  normalized_merchant: string;
  amount_cents: number;
};

function lower(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

function kindFor(account: CobbAccount): "checking" | "savings" | "credit_card" {
  if (account.type === "credit_card") return "credit_card";
  const at = lower(account.account_type);
  if (at.includes("savings") || at.includes("investment")) return "savings";
  return "checking";
}

function inferInstitutionFromTitle(title: string | null): string {
  const t = lower(title);
  if (t.includes("bluevine")) return "Bluevine";
  if (t.includes("bofa") || t.includes("bank of america")) return "Bank of America";
  if (t.includes("axos")) return "Axos Bank";
  if (t.includes("amex")) return "AMEX";
  return "Unknown";
}

async function main() {
  const { db } = await import("../src/lib/db/index.js");
  const { entities, bankAccounts, transactions } = await import(
    "../src/lib/db/schema.js"
  );
  const { eq, and } = await import("drizzle-orm");

  const cobb = neon(COBBVAULT_URL!);

  console.log(`\n${DRY_RUN ? "DRY RUN" : "LIVE"} — backfilling from cobbvault\n`);

  // ───────── 1. LLC subcategories ─────────
  const subs = (await cobb`
    SELECT id, name FROM subcategory ORDER BY name
  `) as CobbSub[];

  const subIdToSlug = new Map<string, string>();
  for (const s of subs) {
    const slug = LLC_NAME_TO_SLUG[lower(s.name)];
    if (slug) subIdToSlug.set(s.id, slug);
  }

  console.log(
    `Mapped ${subIdToSlug.size} LLC subcategories → entity slugs:`
  );
  for (const [id, slug] of subIdToSlug) {
    const name = subs.find((s) => s.id === id)?.name;
    console.log(`  ${name} → ${slug}`);
  }
  console.log("");

  if (subIdToSlug.size === 0) {
    console.error("No LLC subcategory mappings found. Bailing.");
    process.exit(1);
  }

  // ───────── 2. Cobbvault accounts ─────────
  const accountsRaw = (await cobb`
    SELECT id, type, title, bank_name, account_type, account_number,
           card_number, cardholder_name, card_network, llc_subcategory_id
    FROM entry
    WHERE type IN ('bank_account', 'credit_card')
      AND llc_subcategory_id IS NOT NULL
    ORDER BY type, title
  `) as CobbAccount[];

  const cobbAccounts = accountsRaw.filter((a) =>
    subIdToSlug.has(a.llc_subcategory_id)
  );

  console.log(
    `Found ${accountsRaw.length} LLC-tagged accounts in cobbvault; ${cobbAccounts.length} match our entity map.\n`
  );

  // ───────── 3. Entity lookup ─────────
  const tlEntities = await db.select().from(entities);
  const entityBySlug = new Map(tlEntities.map((e) => [e.slug, e]));

  // ───────── 4. Sync accounts ─────────
  const cobbAccountIdToTLId = new Map<string, string>();
  let acctCreated = 0;
  let acctMatched = 0;
  let acctSkipped = 0;

  for (const ca of cobbAccounts) {
    const slug = subIdToSlug.get(ca.llc_subcategory_id)!;
    const entity = entityBySlug.get(slug);
    if (!entity) {
      console.warn(`  ! skip account "${ca.title}": entity slug "${slug}" not seeded`);
      acctSkipped++;
      continue;
    }

    const institution = ca.bank_name?.trim() || inferInstitutionFromTitle(ca.title);
    const kind = kindFor(ca);
    const last4 = last4FromTitle(ca.title);
    const displayName = ca.title?.trim() || `${institution} • ${kind}`;

    // Match TL account by entity + institution + last4 (when last4 is real)
    let existing;
    if (last4 !== "TBD") {
      existing = await db
        .select()
        .from(bankAccounts)
        .where(
          and(
            eq(bankAccounts.entityId, entity.id),
            eq(bankAccounts.institution, institution),
            eq(bankAccounts.last4, last4)
          )
        );
    } else {
      existing = await db
        .select()
        .from(bankAccounts)
        .where(
          and(
            eq(bankAccounts.entityId, entity.id),
            eq(bankAccounts.displayName, displayName)
          )
        );
    }

    if (existing.length > 0) {
      cobbAccountIdToTLId.set(ca.id, existing[0].id);
      acctMatched++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  + would create: ${displayName} [${entity.slug}] (${institution} ${kind} ••${last4})`);
      acctCreated++;
      // skip txn pass for accounts we haven't actually created
      continue;
    }

    const [created] = await db
      .insert(bankAccounts)
      .values({
        entityId: entity.id,
        institution,
        last4,
        kind,
        displayName,
        routingRules: `Backfilled from cobbvault entry ${ca.id}`,
      })
      .returning();
    cobbAccountIdToTLId.set(ca.id, created.id);
    console.log(`  + created: ${displayName} [${entity.slug}]`);
    acctCreated++;
  }

  console.log(
    `\nAccount summary: ${acctMatched} matched · ${acctCreated} ${DRY_RUN ? "would create" : "created"} · ${acctSkipped} skipped\n`
  );

  // ───────── 5. Sync transactions ─────────
  let txnInserted = 0;
  let txnSkipped = 0;
  let accountsWithTxns = 0;

  for (const ca of cobbAccounts) {
    const tlAccountId = cobbAccountIdToTLId.get(ca.id);
    if (!tlAccountId) continue;

    const tlAccount = (
      await db.select().from(bankAccounts).where(eq(bankAccounts.id, tlAccountId))
    )[0];

    const lines = (await cobb`
      SELECT id, posted_date, raw_description, normalized_merchant, amount_cents
      FROM statement_line_item
      WHERE account_entry_id = ${ca.id}
      ORDER BY posted_date
    `) as CobbLine[];

    if (lines.length === 0) continue;
    accountsWithTxns++;

    // Pull existing TL txn fingerprints for this account
    const existing = await db
      .select({
        postedDate: transactions.postedDate,
        amountCents: transactions.amountCents,
        normalizedMerchant: transactions.normalizedMerchant,
      })
      .from(transactions)
      .where(eq(transactions.bankAccountId, tlAccountId));

    const seen = new Set(
      existing.map(
        (e) => `${e.postedDate}|${e.amountCents}|${e.normalizedMerchant ?? ""}`
      )
    );

    const toInsert: Array<typeof transactions.$inferInsert> = [];
    let skipped = 0;
    for (const l of lines) {
      const key = `${l.posted_date}|${l.amount_cents}|${l.normalized_merchant}`;
      if (seen.has(key)) {
        skipped++;
        continue;
      }
      seen.add(key);
      toInsert.push({
        bankAccountId: tlAccountId,
        entityId: tlAccount.entityId,
        postedDate: l.posted_date,
        amountCents: l.amount_cents,
        rawDescription: l.raw_description,
        normalizedMerchant: l.normalized_merchant,
      });
    }

    if (!DRY_RUN && toInsert.length > 0) {
      const BATCH = 200;
      for (let i = 0; i < toInsert.length; i += BATCH) {
        await db.insert(transactions).values(toInsert.slice(i, i + BATCH));
      }
    }

    console.log(
      `  ${tlAccount.displayName}: ${DRY_RUN ? "would insert" : "inserted"} ${toInsert.length} txns (${skipped} dup)`
    );
    txnInserted += toInsert.length;
    txnSkipped += skipped;
  }

  console.log(
    `\nTransaction summary: ${txnInserted} ${DRY_RUN ? "would insert" : "inserted"} across ${accountsWithTxns} accounts · ${txnSkipped} duplicates skipped`
  );
  console.log(
    `\n${DRY_RUN ? "Dry run complete. Re-run with --commit to apply." : "Backfill complete."}\n`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
