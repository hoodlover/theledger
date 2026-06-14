/**
 * 0008: practice_client_documents + practice_clients.tags
 *
 *   practice_clients.tags             — text[] free-form labels
 *   practice_client_documents         — intake/insurance/consent uploads
 *
 *   npm run apply:0008
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
  console.log("Adding tags array to practice_clients…");
  await sql`
    ALTER TABLE "practice_clients"
      ADD COLUMN IF NOT EXISTS "tags" text[]
  `;

  console.log("Creating practice_client_documents…");
  await sql`
    CREATE TABLE IF NOT EXISTS "practice_client_documents" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "client_id" uuid NOT NULL,
      "entity_id" uuid NOT NULL,
      "kind" text NOT NULL,
      "display_name" text NOT NULL,
      "blob_url" text NOT NULL,
      "uploaded_by_user_id" uuid,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )
  `;
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pcd_client_fk') THEN
        ALTER TABLE "practice_client_documents" ADD CONSTRAINT "pcd_client_fk"
          FOREIGN KEY ("client_id") REFERENCES "public"."practice_clients"("id") ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pcd_entity_fk') THEN
        ALTER TABLE "practice_client_documents" ADD CONSTRAINT "pcd_entity_fk"
          FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id");
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pcd_user_fk') THEN
        ALTER TABLE "practice_client_documents" ADD CONSTRAINT "pcd_user_fk"
          FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
      END IF;
    END $$;
  `;
  await sql`CREATE INDEX IF NOT EXISTS "practice_client_documents_client_idx" ON "practice_client_documents" ("client_id","created_at")`;

  console.log("Done.");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
