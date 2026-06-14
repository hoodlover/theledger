/**
 * 0007: contractors.is_counselor flag
 *
 * True (default) = appears on practice-side counselor leaderboards,
 * retention cohorts, week calendar. False = utility 1099 (landlord,
 * cleaning, etc.) — kept on /contractors for tax tracking only.
 *
 * Also flips the three known Path-to-Change utilities to false:
 *   - Cobb Family Solutions, LLC (cleaning)
 *   - Robert & Penelope McGuinn Partnership LPII (Cumming landlord)
 *   - Chakrika Investments LLC / Amaranatha Kotrakona (Alpharetta landlord)
 *
 *   npm run apply:0007
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const sql = neon(url);

const UTILITY_LEGAL_NAMES = [
  "Cobb Family Solutions, LLC",
  "Robert & Penelope McGuinn Partnership LPII",
  "Chakrika Investments LLC",
];

async function main() {
  console.log("Adding is_counselor column to contractors…");
  await sql`
    ALTER TABLE "contractors"
      ADD COLUMN IF NOT EXISTS "is_counselor" boolean NOT NULL DEFAULT true
  `;

  console.log("Flipping utility 1099s to is_counselor = false…");
  for (const name of UTILITY_LEGAL_NAMES) {
    const rows = await sql`
      UPDATE "contractors"
         SET "is_counselor" = false
       WHERE "legal_name" = ${name}
       RETURNING "id", "legal_name", "dba", "is_counselor"
    `;
    if (rows.length) {
      console.log(`  ✓ ${name} → is_counselor=false`);
    } else {
      console.log(`  ⚠ no match for "${name}" (skipped)`);
    }
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
