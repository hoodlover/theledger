CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"institution" text NOT NULL,
	"last4" text NOT NULL,
	"kind" text NOT NULL,
	"display_name" text NOT NULL,
	"routing_rules" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"schedule_c_line" text,
	"form_1120s_line" text,
	"schedule_e_line" text,
	"is_capital" boolean DEFAULT false NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "contractors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"legal_name" text NOT NULL,
	"dba" text,
	"ein_or_ssn_encrypted" text,
	"address" text,
	"w9_doc_url" text,
	"started_date" date,
	"ended_date" date,
	"default_category_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_card_holders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"person_name" text NOT NULL,
	"person_role" text,
	"started" date,
	"ended" date
);
--> statement-breakpoint
CREATE TABLE "employee_pay_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"pay_rate_cents" integer NOT NULL,
	"pay_period" text NOT NULL,
	"withholding_profile_id" uuid
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"legal_name" text NOT NULL,
	"employee_kind" text NOT NULL,
	"date_of_birth" date,
	"hire_date" date,
	"term_date" date,
	"ssn_encrypted" text,
	"address" text,
	"current_pay_category_id" uuid,
	"default_property_tag" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"kind" text NOT NULL,
	"ein" text,
	"state" text,
	"formation_date" date,
	"registered_agent" text,
	"property_address" text,
	"property_purchase_date" date,
	"property_purchase_price_cents" integer,
	"rental_classification" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inter_entity_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_on" date NOT NULL,
	"from_entity_id" uuid NOT NULL,
	"from_transaction_id" uuid,
	"to_entity_id" uuid NOT NULL,
	"to_transaction_id" uuid,
	"amount_cents" integer NOT NULL,
	"purpose" text NOT NULL,
	"standing_rule_id" uuid,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "llc_paperwork" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"doc_kind" text NOT NULL,
	"filed_date" date,
	"expires_date" date,
	"blob_url" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "manual_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entered_by_user_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"date" date NOT NULL,
	"payee_text" text,
	"category_id" uuid,
	"notes" text,
	"matched_transaction_id" uuid,
	"matched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"merchant" text,
	"purchase_date" date,
	"total_cents" integer,
	"tax_cents" integer,
	"tip_cents" integer,
	"blob_url" text NOT NULL,
	"source" text NOT NULL,
	"ocr_raw_text" text,
	"classified_at" timestamp with time zone,
	"confidence" real,
	"matched_transaction_id" uuid,
	"matched_at" timestamp with time zone,
	"match_method" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standing_transfer_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_entity_id" uuid NOT NULL,
	"to_entity_id" uuid NOT NULL,
	"cadence" text NOT NULL,
	"default_amount_cents" integer,
	"purpose" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "statement_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"source_filename" text NOT NULL,
	"period_start" date,
	"period_end" date,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"blob_url" text
);
--> statement-breakpoint
CREATE TABLE "tax_deadlines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid,
	"kind" text NOT NULL,
	"due_date" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"amount_cents" integer,
	"paid_date" date,
	"notes" text,
	"reminder_lead_days" integer DEFAULT 30 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"statement_import_id" uuid,
	"bank_account_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"posted_date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"raw_description" text NOT NULL,
	"normalized_merchant" text,
	"category_id" uuid,
	"contractor_id" uuid,
	"employee_id" uuid,
	"card_holder_id" uuid,
	"property_tag" text,
	"attached_receipt_id" uuid,
	"is_inter_entity_transfer" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "withholding_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"federal_w4_meta" text,
	"state_w4_meta" text,
	"is_minor_exempt" boolean DEFAULT false NOT NULL,
	CONSTRAINT "withholding_profiles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractors" ADD CONSTRAINT "contractors_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractors" ADD CONSTRAINT "contractors_default_category_id_categories_id_fk" FOREIGN KEY ("default_category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_card_holders" ADD CONSTRAINT "credit_card_holders_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_pay_categories" ADD CONSTRAINT "employee_pay_categories_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_pay_categories" ADD CONSTRAINT "employee_pay_categories_withholding_profile_id_withholding_profiles_id_fk" FOREIGN KEY ("withholding_profile_id") REFERENCES "public"."withholding_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inter_entity_transfers" ADD CONSTRAINT "inter_entity_transfers_from_entity_id_entities_id_fk" FOREIGN KEY ("from_entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inter_entity_transfers" ADD CONSTRAINT "inter_entity_transfers_from_transaction_id_transactions_id_fk" FOREIGN KEY ("from_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inter_entity_transfers" ADD CONSTRAINT "inter_entity_transfers_to_entity_id_entities_id_fk" FOREIGN KEY ("to_entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inter_entity_transfers" ADD CONSTRAINT "inter_entity_transfers_to_transaction_id_transactions_id_fk" FOREIGN KEY ("to_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inter_entity_transfers" ADD CONSTRAINT "inter_entity_transfers_standing_rule_id_standing_transfer_rules_id_fk" FOREIGN KEY ("standing_rule_id") REFERENCES "public"."standing_transfer_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llc_paperwork" ADD CONSTRAINT "llc_paperwork_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_entries" ADD CONSTRAINT "manual_entries_entered_by_user_id_users_id_fk" FOREIGN KEY ("entered_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_entries" ADD CONSTRAINT "manual_entries_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_entries" ADD CONSTRAINT "manual_entries_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_entries" ADD CONSTRAINT "manual_entries_matched_transaction_id_transactions_id_fk" FOREIGN KEY ("matched_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_matched_transaction_id_transactions_id_fk" FOREIGN KEY ("matched_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standing_transfer_rules" ADD CONSTRAINT "standing_transfer_rules_from_entity_id_entities_id_fk" FOREIGN KEY ("from_entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standing_transfer_rules" ADD CONSTRAINT "standing_transfer_rules_to_entity_id_entities_id_fk" FOREIGN KEY ("to_entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_imports" ADD CONSTRAINT "statement_imports_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_imports" ADD CONSTRAINT "statement_imports_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_deadlines" ADD CONSTRAINT "tax_deadlines_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_statement_import_id_statement_imports_id_fk" FOREIGN KEY ("statement_import_id") REFERENCES "public"."statement_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_card_holder_id_credit_card_holders_id_fk" FOREIGN KEY ("card_holder_id") REFERENCES "public"."credit_card_holders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_accounts_entity_idx" ON "bank_accounts" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "contractors_entity_idx" ON "contractors" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "credit_card_holders_account_idx" ON "credit_card_holders" USING btree ("bank_account_id");--> statement-breakpoint
CREATE INDEX "employee_pay_categories_employee_idx" ON "employee_pay_categories" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employees_entity_idx" ON "employees" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entities_slug_idx" ON "entities" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "transfers_from_idx" ON "inter_entity_transfers" USING btree ("from_entity_id");--> statement-breakpoint
CREATE INDEX "transfers_to_idx" ON "inter_entity_transfers" USING btree ("to_entity_id");--> statement-breakpoint
CREATE INDEX "transfers_occurred_idx" ON "inter_entity_transfers" USING btree ("occurred_on");--> statement-breakpoint
CREATE INDEX "llc_paperwork_entity_idx" ON "llc_paperwork" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "manual_entries_entity_idx" ON "manual_entries" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "manual_entries_unmatched_idx" ON "manual_entries" USING btree ("matched_transaction_id");--> statement-breakpoint
CREATE INDEX "receipts_entity_idx" ON "receipts" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "receipts_unmatched_idx" ON "receipts" USING btree ("matched_transaction_id");--> statement-breakpoint
CREATE INDEX "tax_deadlines_due_idx" ON "tax_deadlines" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "tax_deadlines_entity_idx" ON "tax_deadlines" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "transactions_entity_date_idx" ON "transactions" USING btree ("entity_id","posted_date");--> statement-breakpoint
CREATE INDEX "transactions_contractor_idx" ON "transactions" USING btree ("contractor_id");--> statement-breakpoint
CREATE INDEX "transactions_employee_idx" ON "transactions" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "transactions_account_idx" ON "transactions" USING btree ("bank_account_id");