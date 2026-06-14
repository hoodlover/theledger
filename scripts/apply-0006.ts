/**
 * 0006: standing schedules + task templates + session reason codes
 *
 *   practice_sessions.cancellation_reason / .no_show_reason / .standing_schedule_id
 *   practice_standing_schedules           — weekly recurring slot per (counselor, client)
 *   practice_task_templates               — named template, e.g. "counselor_onboarding"
 *   practice_task_template_items          — individual lines on a template
 *
 * Also seeds the canonical Counselor Onboarding template if missing.
 *
 *   npm run apply:0006
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
  console.log("Adding reason columns + standing_schedule_id to practice_sessions…");
  await sql`
    ALTER TABLE "practice_sessions"
      ADD COLUMN IF NOT EXISTS "cancellation_reason" text,
      ADD COLUMN IF NOT EXISTS "no_show_reason" text,
      ADD COLUMN IF NOT EXISTS "standing_schedule_id" uuid
  `;

  console.log("Creating practice_standing_schedules…");
  await sql`
    CREATE TABLE IF NOT EXISTS "practice_standing_schedules" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "entity_id" uuid NOT NULL,
      "client_id" uuid NOT NULL,
      "counselor_id" uuid NOT NULL,
      "day_of_week" integer NOT NULL,
      "time_of_day" text NOT NULL,
      "duration_minutes" integer NOT NULL DEFAULT 50,
      "fee_cents" integer,
      "weeks_interval" integer NOT NULL DEFAULT 1,
      "started_on" date NOT NULL,
      "ended_on" date,
      "notes" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )
  `;
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pss_entity_fk') THEN
        ALTER TABLE "practice_standing_schedules" ADD CONSTRAINT "pss_entity_fk"
          FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id");
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pss_client_fk') THEN
        ALTER TABLE "practice_standing_schedules" ADD CONSTRAINT "pss_client_fk"
          FOREIGN KEY ("client_id") REFERENCES "public"."practice_clients"("id") ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pss_counselor_fk') THEN
        ALTER TABLE "practice_standing_schedules" ADD CONSTRAINT "pss_counselor_fk"
          FOREIGN KEY ("counselor_id") REFERENCES "public"."contractors"("id") ON DELETE RESTRICT;
      END IF;
      -- Now FK practice_sessions.standing_schedule_id → practice_standing_schedules.id
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_sessions_standing_fk') THEN
        ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_standing_fk"
          FOREIGN KEY ("standing_schedule_id") REFERENCES "public"."practice_standing_schedules"("id") ON DELETE SET NULL;
      END IF;
    END $$;
  `;
  await sql`CREATE INDEX IF NOT EXISTS "practice_standing_schedules_counselor_idx" ON "practice_standing_schedules" ("counselor_id","ended_on")`;
  await sql`CREATE INDEX IF NOT EXISTS "practice_standing_schedules_client_idx" ON "practice_standing_schedules" ("client_id")`;

  console.log("Creating practice_task_templates + items…");
  await sql`
    CREATE TABLE IF NOT EXISTS "practice_task_templates" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "kind" text NOT NULL,
      "name" text NOT NULL,
      "description" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS "practice_task_templates_kind_idx" ON "practice_task_templates" ("kind")`;

  await sql`
    CREATE TABLE IF NOT EXISTS "practice_task_template_items" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "template_id" uuid NOT NULL,
      "title" text NOT NULL,
      "body" text,
      "priority" text NOT NULL DEFAULT 'normal',
      "due_offset_days" integer,
      "sort_order" integer NOT NULL DEFAULT 0
    )
  `;
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_task_template_items_template_fk') THEN
        ALTER TABLE "practice_task_template_items" ADD CONSTRAINT "practice_task_template_items_template_fk"
          FOREIGN KEY ("template_id") REFERENCES "public"."practice_task_templates"("id") ON DELETE CASCADE;
      END IF;
    END $$;
  `;
  await sql`CREATE INDEX IF NOT EXISTS "practice_task_template_items_template_idx" ON "practice_task_template_items" ("template_id","sort_order")`;

  console.log("Seeding Counselor Onboarding template (if missing)…");
  // Idempotent: only insert if no row exists with kind='counselor_onboarding'
  const existing = await sql`
    SELECT "id" FROM "practice_task_templates" WHERE "kind" = 'counselor_onboarding' LIMIT 1
  `;
  if (existing.length === 0) {
    const inserted = await sql`
      INSERT INTO "practice_task_templates" ("kind", "name", "description")
      VALUES ('counselor_onboarding', 'Counselor onboarding',
              'Standard set of tasks when a new 1099 counselor joins Path to Change.')
      RETURNING "id"
    `;
    const tid = inserted[0].id as string;
    const items: Array<{ title: string; body: string | null; days: number | null; priority: string; order: number }> = [
      { title: "Get signed W-9", body: "Upload to /contractors/[id] paperwork box.", days: 3, priority: "high", order: 10 },
      { title: "Get signed contract", body: "Upload to paperwork box.", days: 7, priority: "high", order: 20 },
      { title: "Verify malpractice certificate", body: "Upload + set expiration date.", days: 7, priority: "high", order: 30 },
      { title: "Set fee keep %", body: "Edit contractor row — sets revenue split.", days: 7, priority: "normal", order: 40 },
      { title: "Direct deposit form on file", body: null, days: 14, priority: "normal", order: 50 },
      { title: "Supervision agreement (if APC/AMFT)", body: null, days: 14, priority: "normal", order: 60 },
      { title: "Add to TherapyNotes + Dialpad + Monday", body: null, days: 14, priority: "normal", order: 70 },
      { title: "Schedule supervision recurring", body: null, days: 21, priority: "low", order: 80 },
      { title: "30-day check-in", body: "First month review with Heather.", days: 30, priority: "normal", order: 90 },
    ];
    for (const it of items) {
      await sql`
        INSERT INTO "practice_task_template_items"
          ("template_id", "title", "body", "priority", "due_offset_days", "sort_order")
        VALUES (${tid}, ${it.title}, ${it.body}, ${it.priority}, ${it.days}, ${it.order})
      `;
    }
    console.log(`  ↳ seeded ${items.length} items for template ${tid}`);
  } else {
    console.log("  ↳ template already exists");
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
