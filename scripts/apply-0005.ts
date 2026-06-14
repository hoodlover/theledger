/**
 * 0005: practice CRM (replaces Monday.com)
 *
 *   practice_tasks               — to-dos with assignee + due date
 *   practice_notes               — internal-only thread (clients OR tasks)
 *   practice_status_history      — kanban move audit trail
 *   practice_notifications       — bell-icon alerts
 *
 * Idempotent — safe to re-run.
 *
 *   npm run apply:0005
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
  console.log("Creating practice_tasks…");
  await sql`
    CREATE TABLE IF NOT EXISTS "practice_tasks" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "entity_id" uuid NOT NULL,
      "client_id" uuid,
      "counselor_id" uuid,
      "assigned_to_user_id" uuid,
      "title" text NOT NULL,
      "body" text,
      "status" text NOT NULL DEFAULT 'open',
      "priority" text NOT NULL DEFAULT 'normal',
      "due_at" timestamp with time zone,
      "completed_at" timestamp with time zone,
      "created_by_user_id" uuid,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    )
  `;
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_tasks_entity_fk') THEN
        ALTER TABLE "practice_tasks" ADD CONSTRAINT "practice_tasks_entity_fk"
          FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id");
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_tasks_client_fk') THEN
        ALTER TABLE "practice_tasks" ADD CONSTRAINT "practice_tasks_client_fk"
          FOREIGN KEY ("client_id") REFERENCES "public"."practice_clients"("id") ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_tasks_counselor_fk') THEN
        ALTER TABLE "practice_tasks" ADD CONSTRAINT "practice_tasks_counselor_fk"
          FOREIGN KEY ("counselor_id") REFERENCES "public"."contractors"("id") ON DELETE SET NULL;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_tasks_assigned_fk') THEN
        ALTER TABLE "practice_tasks" ADD CONSTRAINT "practice_tasks_assigned_fk"
          FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_tasks_creator_fk') THEN
        ALTER TABLE "practice_tasks" ADD CONSTRAINT "practice_tasks_creator_fk"
          FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
      END IF;
    END $$;
  `;
  await sql`CREATE INDEX IF NOT EXISTS "practice_tasks_assigned_idx" ON "practice_tasks" ("assigned_to_user_id","status","due_at")`;
  await sql`CREATE INDEX IF NOT EXISTS "practice_tasks_client_idx" ON "practice_tasks" ("client_id")`;
  await sql`CREATE INDEX IF NOT EXISTS "practice_tasks_status_idx" ON "practice_tasks" ("status","due_at")`;

  console.log("Creating practice_notes…");
  await sql`
    CREATE TABLE IF NOT EXISTS "practice_notes" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "entity_id" uuid NOT NULL,
      "client_id" uuid,
      "task_id" uuid,
      "author_user_id" uuid NOT NULL,
      "body" text NOT NULL,
      "mentions_user_ids" jsonb,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )
  `;
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_notes_entity_fk') THEN
        ALTER TABLE "practice_notes" ADD CONSTRAINT "practice_notes_entity_fk"
          FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id");
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_notes_client_fk') THEN
        ALTER TABLE "practice_notes" ADD CONSTRAINT "practice_notes_client_fk"
          FOREIGN KEY ("client_id") REFERENCES "public"."practice_clients"("id") ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_notes_task_fk') THEN
        ALTER TABLE "practice_notes" ADD CONSTRAINT "practice_notes_task_fk"
          FOREIGN KEY ("task_id") REFERENCES "public"."practice_tasks"("id") ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_notes_author_fk') THEN
        ALTER TABLE "practice_notes" ADD CONSTRAINT "practice_notes_author_fk"
          FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
      END IF;
    END $$;
  `;
  await sql`CREATE INDEX IF NOT EXISTS "practice_notes_client_idx" ON "practice_notes" ("client_id","created_at")`;
  await sql`CREATE INDEX IF NOT EXISTS "practice_notes_task_idx" ON "practice_notes" ("task_id","created_at")`;

  console.log("Creating practice_status_history…");
  await sql`
    CREATE TABLE IF NOT EXISTS "practice_status_history" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "client_id" uuid NOT NULL,
      "from_status" text,
      "to_status" text NOT NULL,
      "changed_by_user_id" uuid,
      "changed_at" timestamp with time zone NOT NULL DEFAULT now()
    )
  `;
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_status_history_client_fk') THEN
        ALTER TABLE "practice_status_history" ADD CONSTRAINT "practice_status_history_client_fk"
          FOREIGN KEY ("client_id") REFERENCES "public"."practice_clients"("id") ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_status_history_user_fk') THEN
        ALTER TABLE "practice_status_history" ADD CONSTRAINT "practice_status_history_user_fk"
          FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
      END IF;
    END $$;
  `;
  await sql`CREATE INDEX IF NOT EXISTS "practice_status_history_client_idx" ON "practice_status_history" ("client_id","changed_at")`;

  console.log("Creating practice_notifications…");
  await sql`
    CREATE TABLE IF NOT EXISTS "practice_notifications" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "recipient_user_id" uuid NOT NULL,
      "kind" text NOT NULL,
      "ref_kind" text,
      "ref_id" uuid,
      "summary" text NOT NULL,
      "read_at" timestamp with time zone,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )
  `;
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_notifications_recipient_fk') THEN
        ALTER TABLE "practice_notifications" ADD CONSTRAINT "practice_notifications_recipient_fk"
          FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
      END IF;
    END $$;
  `;
  await sql`CREATE INDEX IF NOT EXISTS "practice_notifications_recipient_idx" ON "practice_notifications" ("recipient_user_id","read_at","created_at")`;

  console.log("Done.");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
