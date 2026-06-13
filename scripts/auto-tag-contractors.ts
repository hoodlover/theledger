/**
 * Auto-tag untagged Path to Change transactions to contractors by matching
 * the transaction's raw_description against a set of patterns derived from
 * each contractor's legal_name + dba + role.
 *
 * Pattern derivation rules:
 *   - Strip generic LLC suffixes (LLC, Inc, Co, Partnership, etc.)
 *   - Each pattern must be ≥ 5 characters AND distinctive (not "the", "and")
 *   - A transaction matches a contractor iff EXACTLY ONE contractor's
 *     patterns hit the raw_description (case-insensitive). Multi-match
 *     transactions are skipped to avoid false positives.
 *   - Only debit-side transactions (amount_cents < 0) are tagged — receipts
 *     of money aren't payments to contractors.
 *
 * Idempotent: only touches contractor_id IS NULL rows.
 *
 *   npm run autotag:contractors            # dry run by default
 *   npm run autotag:contractors -- --commit
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const COMMIT = process.argv.includes("--commit");
const DRY_RUN = !COMMIT;

const GENERIC_TOKENS = new Set([
  "llc",
  "inc",
  "incorporated",
  "co",
  "company",
  "corp",
  "corporation",
  "ltd",
  "limited",
  "partnership",
  "lpii",
  "lp",
  "lpa",
  "pllc",
  "pa",
  "pc",
  "services",
  "service",
  "counseling",
  "therapy",
  "behavioral",
  "consulting",
  "investments",
  "photography",
  "the",
  "and",
  "of",
  "for",
  "to",
  "an",
]);

const MIN_LEN = 5;

function derivePatterns(legalName: string, dba: string | null, role: string | null): string[] {
  const candidates = new Set<string>();

  // Full strings (most specific)
  candidates.add(legalName.toLowerCase());
  if (dba) candidates.add(dba.toLowerCase());

  // Strip generic suffixes from legal name → "Angie Chini, LLC" → "angie chini"
  const cleanedLegal = legalName
    .replace(/[,]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !GENERIC_TOKENS.has(t.toLowerCase()))
    .join(" ")
    .toLowerCase()
    .trim();
  if (cleanedLegal.length >= MIN_LEN) candidates.add(cleanedLegal);

  // Last token of cleaned legal — often the surname or distinctive root
  const tokens = cleanedLegal.split(/\s+/).filter((t) => t.length >= MIN_LEN);
  for (const t of tokens) candidates.add(t);

  // Same treatment on dba
  if (dba) {
    const cleanedDba = dba
      .replace(/[,]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 0 && !GENERIC_TOKENS.has(t.toLowerCase()))
      .join(" ")
      .toLowerCase()
      .trim();
    if (cleanedDba.length >= MIN_LEN) candidates.add(cleanedDba);
    const dbaTokens = cleanedDba.split(/\s+/).filter((t) => t.length >= MIN_LEN);
    for (const t of dbaTokens) candidates.add(t);
  }

  // Drop anything still under MIN_LEN
  return [...candidates].filter((p) => p.length >= MIN_LEN);
}

async function main() {
  const { db } = await import("../src/lib/db/index.js");
  const { entities, contractors, transactions } = await import(
    "../src/lib/db/schema.js"
  );
  const { and, eq, sql, lt, isNull } = await import("drizzle-orm");

  console.log(`\n${DRY_RUN ? "DRY RUN" : "LIVE"} — auto-tagging contractors\n`);

  const [ptc] = await db
    .select()
    .from(entities)
    .where(eq(entities.slug, "path-to-change"));
  if (!ptc) {
    console.error("Path to Change entity missing");
    process.exit(1);
  }

  const allContractors = await db
    .select({
      id: contractors.id,
      legalName: contractors.legalName,
      dba: contractors.dba,
      role: contractors.role,
    })
    .from(contractors)
    .where(eq(contractors.entityId, ptc.id));

  // Build contractor → patterns map
  type PatternSpec = {
    contractorId: string;
    displayName: string;
    patterns: string[];
  };
  const specs: PatternSpec[] = allContractors.map((c) => ({
    contractorId: c.id,
    displayName: c.dba ?? c.legalName,
    patterns: derivePatterns(c.legalName, c.dba, c.role),
  }));

  console.log(`${specs.length} contractors · ${specs.reduce((s, x) => s + x.patterns.length, 0)} patterns derived\n`);
  if (DRY_RUN) {
    for (const s of specs) {
      console.log(`  ${s.displayName}: [${s.patterns.join(", ")}]`);
    }
    console.log("");
  }

  // Pull untagged debit transactions on Path to Change
  const untagged = await db
    .select({
      id: transactions.id,
      raw: transactions.rawDescription,
      merchant: transactions.normalizedMerchant,
      amountCents: transactions.amountCents,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.entityId, ptc.id),
        isNull(transactions.contractorId),
        lt(transactions.amountCents, 0)
      )
    );

  console.log(`Scanning ${untagged.length} untagged debit transactions…\n`);

  // For each txn: find matching contractors. Tag only when EXACTLY ONE matches.
  const tagPlan = new Map<string, string[]>(); // contractorId → txn ids
  let exactly1 = 0;
  let multi = 0;
  let zero = 0;

  for (const t of untagged) {
    const hay = `${t.raw} ${t.merchant ?? ""}`.toLowerCase();
    const hits: string[] = [];
    for (const s of specs) {
      if (s.patterns.some((p) => hay.includes(p))) {
        hits.push(s.contractorId);
      }
    }
    if (hits.length === 1) {
      const arr = tagPlan.get(hits[0]) ?? [];
      arr.push(t.id);
      tagPlan.set(hits[0], arr);
      exactly1++;
    } else if (hits.length > 1) {
      multi++;
    } else {
      zero++;
    }
  }

  console.log(`Scan results:`);
  console.log(`  ${exactly1} txns matched exactly one contractor`);
  console.log(`  ${multi} txns matched multiple (skipped — ambiguous)`);
  console.log(`  ${zero} txns matched none\n`);

  // Per-contractor summary
  const summary = specs
    .map((s) => ({
      displayName: s.displayName,
      contractorId: s.contractorId,
      count: tagPlan.get(s.contractorId)?.length ?? 0,
    }))
    .sort((a, b) => b.count - a.count);

  console.log(`Per-contractor counts (top):`);
  for (const r of summary) {
    if (r.count === 0) continue;
    console.log(`  ${r.displayName.padEnd(40)} ${r.count}`);
  }

  if (DRY_RUN) {
    console.log(`\nDry run complete. Re-run with --commit to apply.\n`);
    return;
  }

  // Live: apply tags in batches of 200
  let applied = 0;
  for (const [contractorId, txnIds] of tagPlan) {
    const BATCH = 200;
    for (let i = 0; i < txnIds.length; i += BATCH) {
      const slice = txnIds.slice(i, i + BATCH);
      await db
        .update(transactions)
        .set({ contractorId })
        .where(
          sql`${transactions.id} = ANY(${sql.raw(`ARRAY[${slice.map((id) => `'${id}'`).join(",")}]::uuid[]`)})`
        );
      applied += slice.length;
    }
  }
  console.log(`\nTagged ${applied} transactions.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
