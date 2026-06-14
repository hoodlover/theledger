/**
 * 0002: contractor fee_keep_percent + w9_on_file
 *   - fee_keep_percent integer — counselor's keep %, e.g. 70
 *   - w9_on_file boolean default false — explicit "we have it" flag
 *     independent of whether the PDF was uploaded to blob
 *
 * Also: set Sanona's fee_keep_percent = 70 as the requested test seed.
 * Idempotent — safe to re-run.
 *
 *   npm run apply:0002
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

async function main() {
  console.log("Adding fee_keep_percent + w9_on_file to contractors…");
  await sql`
    ALTER TABLE "contractors"
      ADD COLUMN IF NOT EXISTS "fee_keep_percent" integer,
      ADD COLUMN IF NOT EXISTS "w9_on_file" boolean NOT NULL DEFAULT false
  `;

  // Back-fill: if doc URL already exists, treat w9_on_file as true so the
  // legacy "uploaded the PDF" path doesn't appear regressively as missing.
  console.log("Back-filling w9_on_file=true where w9_doc_url IS NOT NULL…");
  await sql`
    UPDATE "contractors"
       SET "w9_on_file" = true
     WHERE "w9_doc_url" IS NOT NULL AND "w9_on_file" = false
  `;

  // Seed Sanona's keep % to 70 — looked up by either legal_name or dba.
  console.log("Setting Sanona Williams (SW Behavioral Services) to 70%…");
  const updated = await sql`
    UPDATE "contractors"
       SET "fee_keep_percent" = 70
     WHERE lower("legal_name") = lower('SW Behavioral Services')
        OR lower("dba") = lower('Sanona Williams')
        OR lower("legal_name") = lower('Sanona Williams')
    RETURNING "id", "legal_name", "dba", "fee_keep_percent"
  `;
  console.log("  ↳ updated rows:", updated);

  console.log("Done.");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
