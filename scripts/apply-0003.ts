/**
 * 0003: contractor_paperwork
 *   Per-contractor document store (contracts, malpractice cert,
 *   direct-deposit form, etc.) alongside the existing W-9 column.
 *
 * Idempotent — safe to re-run.
 *
 *   npm run apply:0003
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
  console.log("Creating contractor_paperwork table…");
  await sql`
    CREATE TABLE IF NOT EXISTS "contractor_paperwork" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "contractor_id" uuid NOT NULL,
      "entity_id" uuid NOT NULL,
      "kind" text NOT NULL,
      "display_name" text NOT NULL,
      "blob_url" text NOT NULL,
      "uploaded_by_user_id" uuid,
      "effective_date" date,
      "expiration_date" date,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `;

  console.log("Adding FKs…");
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'contractor_paperwork_contractor_id_fk'
      ) THEN
        ALTER TABLE "contractor_paperwork"
          ADD CONSTRAINT "contractor_paperwork_contractor_id_fk"
          FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'contractor_paperwork_entity_id_fk'
      ) THEN
        ALTER TABLE "contractor_paperwork"
          ADD CONSTRAINT "contractor_paperwork_entity_id_fk"
          FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id");
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'contractor_paperwork_uploaded_by_user_id_fk'
      ) THEN
        ALTER TABLE "contractor_paperwork"
          ADD CONSTRAINT "contractor_paperwork_uploaded_by_user_id_fk"
          FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
      END IF;
    END $$;
  `;

  console.log("Creating index…");
  await sql`
    CREATE INDEX IF NOT EXISTS "contractor_paperwork_contractor_idx"
      ON "contractor_paperwork" USING btree ("contractor_id","created_at")
  `;

  console.log("Done.");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
