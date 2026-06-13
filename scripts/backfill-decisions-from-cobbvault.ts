/**
 * Pull cobbvault's manual reconciliation decisions onto The Ledger's
 * transactions, so Lance's prior classification work carries forward.
 *
 * Cobbvault's `statement_line_decision.decision` enum values map to:
 *   - 'transfer'           → set transactions.is_inter_entity_transfer = true
 *   - 'personal'           → append "[personal]" tag to notes
 *   - 'no_receipt_needed'  → append "[no_receipt_needed]"
 *   - 'atm_cash'           → append "[ATM cash]"
 *   - 'matched'            → skip (handled by the receipts backfill)
 *
 * Idempotent — re-running won't duplicate tags or set flags twice.
 * Dry-run by default; pass `--commit` to write.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const COMMIT = process.argv.includes("--commit");
const DRY_RUN = !COMMIT;

const COBBVAULT_URL = process.env.COBBVAULT_DATABASE_URL;
if (!COBBVAULT_URL) {
  console.error("COBBVAULT_DATABASE_URL not set in .env.local");
  process.exit(1);
}

type CobbDecisionRow = {
  decision: "matched" | "no_receipt_needed" | "personal" | "transfer" | "atm_cash";
  decided_note: string | null;
  account_entry_id: string;
  account_title: string;
  account_type: "bank_account" | "credit_card";
  account_bank_name: string | null;
  posted_date: string;
  amount_cents: number;
  normalized_merchant: string;
};

function last4FromTitle(title: string | null): string {
  if (!title) return "TBD";
  const matches = title.match(/\b\d{4,}\b/g);
  if (!matches) return "TBD";
  return matches[matches.length - 1].slice(-4);
}

function tagForDecision(d: CobbDecisionRow["decision"]): string | null {
  if (d === "personal") return "[personal]";
  if (d === "no_receipt_needed") return "[no_receipt_needed]";
  if (d === "atm_cash") return "[ATM cash]";
  return null;
}

async function main() {
  const { db } = await import("../src/lib/db/index.js");
  const { transactions, bankAccounts } = await import(
    "../src/lib/db/schema.js"
  );
  const { and, eq, sql } = await import("drizzle-orm");

  const cobb = neon(COBBVAULT_URL!);

  console.log(`\n${DRY_RUN ? "DRY RUN" : "LIVE"} — syncing cobbvault decisions\n`);

  // Pull all decisions joined with their line items + owning accounts
  const rows = (await cobb`
    SELECT
      d.decision,
      d.note          AS decided_note,
      e.id            AS account_entry_id,
      e.title         AS account_title,
      e.type          AS account_type,
      e.bank_name     AS account_bank_name,
      li.posted_date,
      li.amount_cents,
      li.normalized_merchant
    FROM statement_line_decision d
    JOIN statement_line_item li ON li.id = d.statement_line_item_id
    JOIN entry e                ON e.id  = li.account_entry_id
    WHERE d.decision IN ('transfer', 'personal', 'no_receipt_needed', 'atm_cash')
  `) as CobbDecisionRow[];

  console.log(`Cobbvault decisions to consider: ${rows.length}`);

  // Tally per decision
  const byDecision = new Map<string, number>();
  for (const r of rows) byDecision.set(r.decision, (byDecision.get(r.decision) ?? 0) + 1);
  for (const [d, n] of byDecision) console.log(`  ${d}: ${n}`);
  console.log("");

  let matchedToTl = 0;
  let missingAccount = 0;
  let missingTxn = 0;
  let alreadyApplied = 0;
  let applied = 0;
  let ambiguous = 0;

  for (const r of rows) {
    // Resolve the cobbvault account → tl bank_account via title (which carries
    // the human-recognizable last4 in cobbvault) + institution heuristic.
    const last4 = last4FromTitle(r.account_title);
    const candidates = await db
      .select({ id: bankAccounts.id, entityId: bankAccounts.entityId, name: bankAccounts.displayName })
      .from(bankAccounts)
      .where(eq(bankAccounts.last4, last4));

    if (candidates.length === 0) {
      missingAccount++;
      continue;
    }

    // If multiple accounts share a last4, prefer the one with a matching
    // display name. Otherwise take the first.
    let tlAccount = candidates.find((c) => c.name === r.account_title);
    if (!tlAccount) tlAccount = candidates[0];

    // Find the TL transaction by (bank_account, posted_date, amount, merchant).
    const txns = await db
      .select({
        id: transactions.id,
        notes: transactions.notes,
        isInterEntityTransfer: transactions.isInterEntityTransfer,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.bankAccountId, tlAccount.id),
          eq(transactions.postedDate, r.posted_date),
          eq(transactions.amountCents, r.amount_cents),
          eq(transactions.normalizedMerchant, r.normalized_merchant)
        )
      );

    if (txns.length === 0) {
      missingTxn++;
      continue;
    }
    if (txns.length > 1) {
      ambiguous++;
      continue;
    }
    matchedToTl++;

    const t = txns[0];

    if (r.decision === "transfer") {
      if (t.isInterEntityTransfer) {
        alreadyApplied++;
        continue;
      }
      if (!DRY_RUN) {
        await db
          .update(transactions)
          .set({ isInterEntityTransfer: true })
          .where(eq(transactions.id, t.id));
      }
      applied++;
      continue;
    }

    const tag = tagForDecision(r.decision);
    if (!tag) continue;
    const existing = t.notes ?? "";
    if (existing.includes(tag)) {
      alreadyApplied++;
      continue;
    }
    const parts = [existing.trim(), tag, r.decided_note?.trim()].filter(
      (x): x is string => !!x && x.length > 0
    );
    const newNotes = parts.join(" · ");

    if (!DRY_RUN) {
      await db
        .update(transactions)
        .set({ notes: newNotes })
        .where(eq(transactions.id, t.id));
    }
    applied++;
  }

  console.log(`\nMatched to TL: ${matchedToTl}`);
  console.log(`  · ${applied} ${DRY_RUN ? "would apply" : "applied"}`);
  console.log(`  · ${alreadyApplied} already applied (skipped)`);
  console.log(`  · ${ambiguous} ambiguous (skipped)`);
  console.log(`Could not match:`);
  console.log(`  · ${missingAccount} cobbvault accounts not in TL`);
  console.log(`  · ${missingTxn} cobbvault txns not in TL`);
  console.log(
    `\n${DRY_RUN ? "Dry run complete. Re-run with --commit to apply." : "Done."}\n`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
