/**
 * Read-only diagnostic: list cobbvault's subcategories + LLC-tagged
 * accounts so we can fix the entity-name map and seed last4s.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const url = process.env.COBBVAULT_DATABASE_URL;
if (!url) throw new Error("COBBVAULT_DATABASE_URL not set");

const cobb = neon(url);

async function main() {

const subs = (await cobb`
  SELECT s.id, s.name AS sub_name, c.name AS cat_name
  FROM subcategory s
  JOIN category c ON c.id = s.category_id
  ORDER BY c.name, s.name
`) as Array<{ id: string; sub_name: string; cat_name: string }>;

console.log(`=== ${subs.length} SUBCATEGORIES ===`);
for (const s of subs) console.log(`  [${s.cat_name}] ${s.sub_name}`);

const accts = (await cobb`
  SELECT
    e.title, e.type, e.bank_name, e.account_type,
    RIGHT(
      COALESCE(
        NULLIF(REGEXP_REPLACE(COALESCE(e.account_number,''), '\D', '', 'g'), ''),
        NULLIF(REGEXP_REPLACE(COALESCE(e.card_number,''), '\D', '', 'g'), '')
      ),
      4
    ) AS last4,
    sub.name AS llc_name,
    (SELECT COUNT(*) FROM statement_line_item li WHERE li.account_entry_id = e.id)::int AS txn_count
  FROM entry e
  LEFT JOIN subcategory sub ON sub.id = e.llc_subcategory_id
  WHERE e.type IN ('bank_account', 'credit_card')
  ORDER BY sub.name NULLS LAST, e.title
`) as Array<{
  title: string;
  type: string;
  bank_name: string | null;
  account_type: string | null;
  last4: string | null;
  llc_name: string | null;
  txn_count: number;
}>;

console.log(`\n=== ${accts.length} BANK / CARD ACCOUNTS ===`);
for (const a of accts) {
  console.log(
    `  [${a.llc_name ?? "—no LLC tag—"}] ${a.title}`
  );
  console.log(
    `      inst=${a.bank_name ?? "?"} · kind=${a.account_type ?? a.type} · last4=${a.last4 ?? "?"} · txns=${a.txn_count}`
  );
}

}

main().catch((e) => { console.error(e); process.exit(1); });
