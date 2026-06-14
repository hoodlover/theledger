/**
 * Apply 0001_saved_filters_and_reminders.sql directly to DATABASE_URL.
 * One-shot — safer than drizzle-kit push (which also wants to churn
 * unrelated constraints).
 *
 *   npm run apply:0001
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
  console.log("Creating saved_filters table…");
  await sql`
    CREATE TABLE IF NOT EXISTS "saved_filters" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL,
      "name" text NOT NULL,
      "query_string" text NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `;

  // FK — wrap in DO block so we don't fail if it already exists
  console.log("Adding FK saved_filters → users…");
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'saved_filters_user_id_users_id_fk'
      ) THEN
        ALTER TABLE "saved_filters"
          ADD CONSTRAINT "saved_filters_user_id_users_id_fk"
          FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
      END IF;
    END $$;
  `;

  console.log("Creating index saved_filters_user_idx…");
  await sql`
    CREATE INDEX IF NOT EXISTS "saved_filters_user_idx"
      ON "saved_filters" USING btree ("user_id","created_at")
  `;

  console.log("Adding reminder_sent_t30/t7/t1 columns to tax_deadlines…");
  await sql`
    ALTER TABLE "tax_deadlines"
      ADD COLUMN IF NOT EXISTS "reminder_sent_t30" timestamp with time zone,
      ADD COLUMN IF NOT EXISTS "reminder_sent_t7" timestamp with time zone,
      ADD COLUMN IF NOT EXISTS "reminder_sent_t1" timestamp with time zone
  `;

  console.log("Done.");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
