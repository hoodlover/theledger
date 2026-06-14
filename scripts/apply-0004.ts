/**
 * 0004: practice operations core (Heather's dashboard)
 *
 *   practice_clients              — minimal-PHI client roster
 *   practice_client_counselors    — counselor assignment history
 *   practice_sessions             — every scheduled / completed session
 *   practice_events               — raw inbound inbox (inquiries + voicemails)
 *   practice_imports              — one row per CSV / API ingest run
 *
 * Idempotent — safe to re-run.
 *
 *   npm run apply:0004
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
  console.log("Creating practice_clients…");
  await sql`
    CREATE TABLE IF NOT EXISTS "practice_clients" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "entity_id" uuid NOT NULL,
      "display_initials" text NOT NULL,
      "preferred_first_name" text,
      "source" text,
      "status" text NOT NULL DEFAULT 'active',
      "primary_counselor_id" uuid,
      "first_contact_at" timestamp with time zone,
      "first_scheduled_at" timestamp with time zone,
      "first_session_at" timestamp with time zone,
      "last_session_at" timestamp with time zone,
      "total_sessions" integer NOT NULL DEFAULT 0,
      "archived_at" timestamp with time zone,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )
  `;
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_clients_entity_id_fk') THEN
        ALTER TABLE "practice_clients" ADD CONSTRAINT "practice_clients_entity_id_fk"
          FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id");
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_clients_primary_counselor_id_fk') THEN
        ALTER TABLE "practice_clients" ADD CONSTRAINT "practice_clients_primary_counselor_id_fk"
          FOREIGN KEY ("primary_counselor_id") REFERENCES "public"."contractors"("id") ON DELETE SET NULL;
      END IF;
    END $$;
  `;
  await sql`CREATE INDEX IF NOT EXISTS "practice_clients_entity_idx" ON "practice_clients" ("entity_id")`;
  await sql`CREATE INDEX IF NOT EXISTS "practice_clients_counselor_idx" ON "practice_clients" ("primary_counselor_id")`;
  await sql`CREATE INDEX IF NOT EXISTS "practice_clients_status_idx" ON "practice_clients" ("status")`;

  console.log("Creating practice_client_counselors…");
  await sql`
    CREATE TABLE IF NOT EXISTS "practice_client_counselors" (
      "client_id" uuid NOT NULL,
      "counselor_id" uuid NOT NULL,
      "started_at" timestamp with time zone NOT NULL,
      "ended_at" timestamp with time zone
    )
  `;
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_client_counselors_client_id_fk') THEN
        ALTER TABLE "practice_client_counselors" ADD CONSTRAINT "practice_client_counselors_client_id_fk"
          FOREIGN KEY ("client_id") REFERENCES "public"."practice_clients"("id") ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_client_counselors_counselor_id_fk') THEN
        ALTER TABLE "practice_client_counselors" ADD CONSTRAINT "practice_client_counselors_counselor_id_fk"
          FOREIGN KEY ("counselor_id") REFERENCES "public"."contractors"("id") ON DELETE CASCADE;
      END IF;
    END $$;
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "practice_client_counselors_pk" ON "practice_client_counselors" ("client_id","counselor_id","started_at")`;
  await sql`CREATE INDEX IF NOT EXISTS "practice_client_counselors_client_idx" ON "practice_client_counselors" ("client_id")`;
  await sql`CREATE INDEX IF NOT EXISTS "practice_client_counselors_counselor_idx" ON "practice_client_counselors" ("counselor_id","ended_at")`;

  console.log("Creating practice_sessions…");
  await sql`
    CREATE TABLE IF NOT EXISTS "practice_sessions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "client_id" uuid,
      "counselor_id" uuid NOT NULL,
      "entity_id" uuid NOT NULL,
      "scheduled_for" timestamp with time zone NOT NULL,
      "completed_at" date,
      "no_show" boolean NOT NULL DEFAULT false,
      "cancelled" boolean NOT NULL DEFAULT false,
      "fee_cents" integer,
      "source" text NOT NULL,
      "external_ref" text,
      "unmatched_name" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )
  `;
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_sessions_client_id_fk') THEN
        ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_client_id_fk"
          FOREIGN KEY ("client_id") REFERENCES "public"."practice_clients"("id") ON DELETE SET NULL;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_sessions_counselor_id_fk') THEN
        ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_counselor_id_fk"
          FOREIGN KEY ("counselor_id") REFERENCES "public"."contractors"("id") ON DELETE RESTRICT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_sessions_entity_id_fk') THEN
        ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_entity_id_fk"
          FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id");
      END IF;
    END $$;
  `;
  await sql`CREATE INDEX IF NOT EXISTS "practice_sessions_counselor_idx" ON "practice_sessions" ("counselor_id","scheduled_for")`;
  await sql`CREATE INDEX IF NOT EXISTS "practice_sessions_client_idx" ON "practice_sessions" ("client_id")`;
  await sql`CREATE INDEX IF NOT EXISTS "practice_sessions_scheduled_idx" ON "practice_sessions" ("scheduled_for")`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "practice_sessions_source_ref_idx" ON "practice_sessions" ("source","external_ref") WHERE "external_ref" IS NOT NULL`;

  console.log("Creating practice_events…");
  await sql`
    CREATE TABLE IF NOT EXISTS "practice_events" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "entity_id" uuid NOT NULL,
      "kind" text NOT NULL,
      "source" text NOT NULL,
      "occurred_at" timestamp with time zone NOT NULL,
      "client_id" uuid,
      "counselor_id" uuid,
      "external_ref" text,
      "payload" jsonb,
      "resolved_at" timestamp with time zone,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )
  `;
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_events_entity_id_fk') THEN
        ALTER TABLE "practice_events" ADD CONSTRAINT "practice_events_entity_id_fk"
          FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id");
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_events_client_id_fk') THEN
        ALTER TABLE "practice_events" ADD CONSTRAINT "practice_events_client_id_fk"
          FOREIGN KEY ("client_id") REFERENCES "public"."practice_clients"("id") ON DELETE SET NULL;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_events_counselor_id_fk') THEN
        ALTER TABLE "practice_events" ADD CONSTRAINT "practice_events_counselor_id_fk"
          FOREIGN KEY ("counselor_id") REFERENCES "public"."contractors"("id") ON DELETE SET NULL;
      END IF;
    END $$;
  `;
  await sql`CREATE INDEX IF NOT EXISTS "practice_events_entity_kind_idx" ON "practice_events" ("entity_id","kind","occurred_at")`;
  await sql`CREATE INDEX IF NOT EXISTS "practice_events_inbox_idx" ON "practice_events" ("resolved_at","occurred_at")`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "practice_events_source_ref_idx" ON "practice_events" ("source","external_ref") WHERE "external_ref" IS NOT NULL`;

  console.log("Creating practice_imports…");
  await sql`
    CREATE TABLE IF NOT EXISTS "practice_imports" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "source" text NOT NULL,
      "filename" text,
      "ingested_at" timestamp with time zone NOT NULL DEFAULT now(),
      "ingested_by_user_id" uuid,
      "rows_seen" integer NOT NULL DEFAULT 0,
      "rows_inserted" integer NOT NULL DEFAULT 0,
      "rows_matched" integer NOT NULL DEFAULT 0,
      "rows_unmatched" integer NOT NULL DEFAULT 0,
      "notes" text
    )
  `;
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_imports_user_fk') THEN
        ALTER TABLE "practice_imports" ADD CONSTRAINT "practice_imports_user_fk"
          FOREIGN KEY ("ingested_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
      END IF;
    END $$;
  `;

  console.log("Done.");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
