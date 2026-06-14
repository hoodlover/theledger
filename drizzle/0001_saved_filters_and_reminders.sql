-- 0001: saved transaction filters + deadline reminder columns
CREATE TABLE IF NOT EXISTS "saved_filters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "name" text NOT NULL,
  "query_string" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_filters"
  ADD CONSTRAINT "saved_filters_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saved_filters_user_idx" ON "saved_filters" USING btree ("user_id","created_at");
--> statement-breakpoint
ALTER TABLE "tax_deadlines"
  ADD COLUMN IF NOT EXISTS "reminder_sent_t30" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "reminder_sent_t7" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "reminder_sent_t1" timestamp with time zone;
