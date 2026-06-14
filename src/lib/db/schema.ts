import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  date,
  timestamp,
  real,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// All monetary amounts are stored as integer cents.
// Enum-shaped columns are plain text in v0 — tightened via Zod at the
// app boundary. Promote to pgEnum once values are stable.

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const entities = pgTable(
  "entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    kind: text("kind").notNull(), // s_corp | llc | sole_prop | individual
    ein: text("ein"),
    state: text("state"),
    formationDate: date("formation_date"),
    registeredAgent: text("registered_agent"),

    // Mailing / business address — what shows on the 1099 / W-2 PAYER line.
    // Distinct from a property the entity OWNS (property_address below).
    mailingAddress: text("mailing_address"),
    phone: text("phone"),
    // GA-specific employer ID number (e.g. for Form G-7 + W-2 box 15).
    // Other-state IDs would warrant a separate column; one-state for v0.
    stateEmployerId: text("state_employer_id"),

    // Property attributes (one property per entity in v0)
    propertyAddress: text("property_address"),
    propertyPurchaseDate: date("property_purchase_date"),
    propertyPurchasePriceCents: integer("property_purchase_price_cents"),
    rentalClassification: text("rental_classification"), // str | ltr | n_a

    // Depreciation (straight-line MACRS approx). macrs_class:
    //   "residential_27_5" | "commercial_39" | "land_none" | custom string
    depreciationBasisCents: integer("depreciation_basis_cents"),
    depreciationInServiceDate: date("depreciation_in_service_date"),
    depreciationMacrsClass: text("depreciation_macrs_class"),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    slugIdx: uniqueIndex("entities_slug_idx").on(t.slug),
  })
);

export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    institution: text("institution").notNull(),
    last4: text("last4").notNull(),
    kind: text("kind").notNull(), // checking | savings | credit_card | loc
    displayName: text("display_name").notNull(),
    routingRules: text("routing_rules"), // free-form notes for v0; structured later
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    entityIdx: index("bank_accounts_entity_idx").on(t.entityId),
  })
);

export const creditCardHolders = pgTable(
  "credit_card_holders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bankAccountId: uuid("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "cascade" }),
    personName: text("person_name").notNull(),
    personRole: text("person_role"),
    started: date("started"),
    ended: date("ended"),
  },
  (t) => ({
    accountIdx: index("credit_card_holders_account_idx").on(t.bankAccountId),
  })
);

export const statementImports = pgTable("statement_imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityId: uuid("entity_id")
    .notNull()
    .references(() => entities.id),
  bankAccountId: uuid("bank_account_id")
    .notNull()
    .references(() => bankAccounts.id),
  sourceFilename: text("source_filename").notNull(),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  importedAt: timestamp("imported_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  blobUrl: text("blob_url"),
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  scheduleCLine: text("schedule_c_line"),
  form1120sLine: text("form_1120s_line"),
  scheduleELine: text("schedule_e_line"),
  isCapital: boolean("is_capital").notNull().default(false),
});

export const contractors = pgTable(
  "contractors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id),
    legalName: text("legal_name").notNull(),
    dba: text("dba"),
    role: text("role"),
    avatarUrl: text("avatar_url"),
    einOrSsnEncrypted: text("ein_or_ssn_encrypted"),
    address: text("address"),
    w9DocUrl: text("w9_doc_url"),
    // Explicit "yes we have it" flag, independent of whether the PDF was
    // uploaded to blob. Set true when Lance/Heather check the box even
    // though the file lives in a folder somewhere else.
    w9OnFile: boolean("w9_on_file").notNull().default(false),
    // Path to Change counselors keep a % of the session fee; the rest is
    // the company's share. Integer 0-100 (e.g. 70 = counselor keeps 70%).
    // Null = not a fee-split contractor (photographer, etc.).
    feeKeepPercent: integer("fee_keep_percent"),
    startedDate: date("started_date"),
    endedDate: date("ended_date"),
    defaultCategoryId: uuid("default_category_id").references(
      () => categories.id
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    entityIdx: index("contractors_entity_idx").on(t.entityId),
  })
);

export const withholdingProfiles = pgTable("withholding_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  federalW4Meta: text("federal_w4_meta"),
  stateW4Meta: text("state_w4_meta"),
  isMinorExempt: boolean("is_minor_exempt").notNull().default(false),
});

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id),
    legalName: text("legal_name").notNull(),
    role: text("role"),
    avatarUrl: text("avatar_url"),
    employeeKind: text("employee_kind").notNull(), // standard_w2 | minor_child
    dateOfBirth: date("date_of_birth"),
    hireDate: date("hire_date"),
    termDate: date("term_date"),
    ssnEncrypted: text("ssn_encrypted"),
    address: text("address"),
    currentPayCategoryId: uuid("current_pay_category_id"),
    defaultPropertyTag: text("default_property_tag"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    entityIdx: index("employees_entity_idx").on(t.entityId),
  })
);

export const employeePayCategories = pgTable(
  "employee_pay_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    effectiveFrom: date("effective_from").notNull(),
    payRateCents: integer("pay_rate_cents").notNull(),
    payPeriod: text("pay_period").notNull(), // hourly | salary | piece
    withholdingProfileId: uuid("withholding_profile_id").references(
      () => withholdingProfiles.id
    ),
  },
  (t) => ({
    employeeIdx: index("employee_pay_categories_employee_idx").on(t.employeeId),
  })
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    statementImportId: uuid("statement_import_id").references(
      () => statementImports.id
    ),
    bankAccountId: uuid("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id),
    postedDate: date("posted_date").notNull(),
    amountCents: integer("amount_cents").notNull(),
    rawDescription: text("raw_description").notNull(),
    normalizedMerchant: text("normalized_merchant"),
    categoryId: uuid("category_id").references(() => categories.id),
    contractorId: uuid("contractor_id").references(() => contractors.id),
    employeeId: uuid("employee_id").references(() => employees.id),
    cardHolderId: uuid("card_holder_id").references(() => creditCardHolders.id),
    propertyTag: text("property_tag"),
    attachedReceiptId: uuid("attached_receipt_id"),
    isInterEntityTransfer: boolean("is_inter_entity_transfer")
      .notNull()
      .default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    entityDateIdx: index("transactions_entity_date_idx").on(
      t.entityId,
      t.postedDate
    ),
    contractorIdx: index("transactions_contractor_idx").on(t.contractorId),
    employeeIdx: index("transactions_employee_idx").on(t.employeeId),
    accountIdx: index("transactions_account_idx").on(t.bankAccountId),
  })
);

export const manualEntries = pgTable(
  "manual_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    enteredByUserId: uuid("entered_by_user_id")
      .notNull()
      .references(() => users.id),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id),
    amountCents: integer("amount_cents").notNull(),
    date: date("date").notNull(),
    payeeText: text("payee_text"),
    categoryId: uuid("category_id").references(() => categories.id),
    notes: text("notes"),
    matchedTransactionId: uuid("matched_transaction_id").references(
      () => transactions.id
    ),
    matchedAt: timestamp("matched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    entityIdx: index("manual_entries_entity_idx").on(t.entityId),
    unmatchedIdx: index("manual_entries_unmatched_idx").on(
      t.matchedTransactionId
    ),
  })
);

export const standingTransferRules = pgTable("standing_transfer_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  fromEntityId: uuid("from_entity_id")
    .notNull()
    .references(() => entities.id),
  toEntityId: uuid("to_entity_id")
    .notNull()
    .references(() => entities.id),
  cadence: text("cadence").notNull(), // monthly | semi_monthly | annual
  defaultAmountCents: integer("default_amount_cents"),
  purpose: text("purpose").notNull(), // rent | cleaning | loan | reimbursement | other
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
});

export const interEntityTransfers = pgTable(
  "inter_entity_transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    occurredOn: date("occurred_on").notNull(),
    fromEntityId: uuid("from_entity_id")
      .notNull()
      .references(() => entities.id),
    fromTransactionId: uuid("from_transaction_id").references(
      () => transactions.id
    ),
    toEntityId: uuid("to_entity_id")
      .notNull()
      .references(() => entities.id),
    toTransactionId: uuid("to_transaction_id").references(
      () => transactions.id
    ),
    amountCents: integer("amount_cents").notNull(),
    purpose: text("purpose").notNull(),
    standingRuleId: uuid("standing_rule_id").references(
      () => standingTransferRules.id
    ),
    notes: text("notes"),
  },
  (t) => ({
    fromIdx: index("transfers_from_idx").on(t.fromEntityId),
    toIdx: index("transfers_to_idx").on(t.toEntityId),
    occurredIdx: index("transfers_occurred_idx").on(t.occurredOn),
  })
);

export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id),
    merchant: text("merchant"),
    purchaseDate: date("purchase_date"),
    totalCents: integer("total_cents"),
    taxCents: integer("tax_cents"),
    tipCents: integer("tip_cents"),
    blobUrl: text("blob_url").notNull(),
    source: text("source").notNull(), // drop_folder | phone_upload | email
    ocrRawText: text("ocr_raw_text"),
    classifiedAt: timestamp("classified_at", { withTimezone: true }),
    confidence: real("confidence"),
    matchedTransactionId: uuid("matched_transaction_id").references(
      () => transactions.id
    ),
    matchedAt: timestamp("matched_at", { withTimezone: true }),
    matchMethod: text("match_method"), // auto | manual | none
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    entityIdx: index("receipts_entity_idx").on(t.entityId),
    unmatchedIdx: index("receipts_unmatched_idx").on(t.matchedTransactionId),
  })
);

export const taxDeadlines = pgTable(
  "tax_deadlines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id").references(() => entities.id),
    kind: text("kind").notNull(), // 1120_s | 1040 | quarterly_estimated | state_annual | llc_renewal | etc.
    dueDate: date("due_date").notNull(),
    status: text("status").notNull().default("open"), // open | scheduled | paid | overdue
    amountCents: integer("amount_cents"),
    paidDate: date("paid_date"),
    notes: text("notes"),
    reminderLeadDays: integer("reminder_lead_days").notNull().default(30),
    // Per-milestone reminder timestamps. Null = email not sent yet for that
    // milestone; the cron sends T-30 then T-7 then T-1, never repeats.
    reminderSentT30: timestamp("reminder_sent_t30", { withTimezone: true }),
    reminderSentT7: timestamp("reminder_sent_t7", { withTimezone: true }),
    reminderSentT1: timestamp("reminder_sent_t1", { withTimezone: true }),
  },
  (t) => ({
    dueIdx: index("tax_deadlines_due_idx").on(t.dueDate),
    entityIdx: index("tax_deadlines_entity_idx").on(t.entityId),
  })
);

export const llcPaperwork = pgTable(
  "llc_paperwork",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id),
    docKind: text("doc_kind").notNull(),
    filedDate: date("filed_date"),
    expiresDate: date("expires_date"),
    blobUrl: text("blob_url").notNull(),
    notes: text("notes"),
  },
  (t) => ({
    entityIdx: index("llc_paperwork_entity_idx").on(t.entityId),
  })
);

// Mileage log — Heather's phone drives + Lance's Path-to-Change trips.
// IRS standard mileage rate × business miles per year = deduction estimate.
export const mileageEntries = pgTable(
  "mileage_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    enteredByUserId: uuid("entered_by_user_id")
      .notNull()
      .references(() => users.id),
    tripDate: date("trip_date").notNull(),
    vehicleLabel: text("vehicle_label"),
    startLocation: text("start_location"),
    endLocation: text("end_location"),
    miles: real("miles").notNull(),
    businessPurpose: text("business_purpose"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    entityDateIdx: index("mileage_entries_entity_date_idx").on(
      t.entityId,
      t.tripDate
    ),
  })
);

// Audit log — every write action surfaces a row here for the activity
// feed and to give Lance + Heather visibility into who did what.
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    // dotted-namespace string like 'tag.contractor', 'doc.upload', 'auth.password_change'
    eventKind: text("event_kind").notNull(),
    resourceKind: text("resource_kind"),
    resourceId: uuid("resource_id"),
    summary: text("summary").notNull(),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    createdIdx: index("audit_events_created_idx").on(t.createdAt),
    userIdx: index("audit_events_user_idx").on(t.userId, t.createdAt),
    resourceIdx: index("audit_events_resource_idx").on(
      t.resourceKind,
      t.resourceId
    ),
  })
);

// Per-contractor paperwork uploads — contracts, offer letters, supervision
// agreements, malpractice certs, direct-deposit forms, anything else.
// W-9 lives on the contractors row itself; everything else lands here so
// Heather can keep the file together with the counselor.
export const contractorPaperwork = pgTable(
  "contractor_paperwork",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractorId: uuid("contractor_id")
      .notNull()
      .references(() => contractors.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id),
    // contract | offer_letter | supervision_agreement | malpractice_cert
    // | direct_deposit_form | i9 | nda | other
    kind: text("kind").notNull(),
    displayName: text("display_name").notNull(),
    blobUrl: text("blob_url").notNull(),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Useful later for malpractice-cert expiration reminders, contract
    // anniversary review, etc. Both nullable.
    effectiveDate: date("effective_date"),
    expirationDate: date("expiration_date"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    contractorIdx: index("contractor_paperwork_contractor_idx").on(
      t.contractorId,
      t.createdAt
    ),
  })
);

// ─────────────────────────────────────────────────────────────
// Practice operations — Heather's counseling-practice dashboard
//
// PHI SCOPE: minimal by design. Initials + counselor link + session
// dates + fees only. NO full names, NO clinical notes, NO voicemail
// transcript bodies. This keeps Neon / Vercel / Anthropic out of
// Business Associate Agreement territory while still computing every
// retention + revenue metric Heather actually asked for.
//
// If scope ever expands to full names or clinical content, schema
// split + BAAs become required. Don't quietly grow this table.
// ─────────────────────────────────────────────────────────────

export const practiceClients = pgTable(
  "practice_clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id),
    // Minimal-PHI display: e.g. "S.M." — never a full name. preferredFirstName
    // only when Heather chooses to record it.
    displayInitials: text("display_initials").notNull(),
    preferredFirstName: text("preferred_first_name"),
    // email_inquiry | dialpad_sms | dialpad_voicemail | referral
    // | walkin | therapynotes | manual
    source: text("source"),
    // active | discharged | lost | inactive
    status: text("status").notNull().default("active"),
    // Denormalized hot-path FK for the leaderboard.
    // History of all counselors lives in practiceClientCounselors below.
    primaryCounselorId: uuid("primary_counselor_id").references(
      () => contractors.id,
      { onDelete: "set null" }
    ),
    firstContactAt: timestamp("first_contact_at", { withTimezone: true }),
    firstScheduledAt: timestamp("first_scheduled_at", { withTimezone: true }),
    firstSessionAt: timestamp("first_session_at", { withTimezone: true }),
    lastSessionAt: timestamp("last_session_at", { withTimezone: true }),
    // Denorm: recomputed nightly. Drift is acceptable for a dashboard.
    totalSessions: integer("total_sessions").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    entityIdx: index("practice_clients_entity_idx").on(t.entityId),
    counselorIdx: index("practice_clients_counselor_idx").on(
      t.primaryCounselorId
    ),
    statusIdx: index("practice_clients_status_idx").on(t.status),
  })
);

// Many-to-many history — handles mid-engagement counselor transfers
// without losing the original counselor's retention signal.
export const practiceClientCounselors = pgTable(
  "practice_client_counselors",
  {
    clientId: uuid("client_id")
      .notNull()
      .references(() => practiceClients.id, { onDelete: "cascade" }),
    counselorId: uuid("counselor_id")
      .notNull()
      .references(() => contractors.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }), // null = currently active
  },
  (t) => ({
    pk: uniqueIndex("practice_client_counselors_pk").on(
      t.clientId,
      t.counselorId,
      t.startedAt
    ),
    clientIdx: index("practice_client_counselors_client_idx").on(t.clientId),
    counselorIdx: index("practice_client_counselors_counselor_idx").on(
      t.counselorId,
      t.endedAt
    ),
  })
);

export const practiceSessions = pgTable(
  "practice_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable: CSV imports may leave a session with an unmatched_name
    // that Heather reconciles by hand later. Mirrors the receipts
    // matched_transaction_id pattern.
    clientId: uuid("client_id").references(() => practiceClients.id, {
      onDelete: "set null",
    }),
    counselorId: uuid("counselor_id")
      .notNull()
      .references(() => contractors.id, { onDelete: "restrict" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    completedAt: date("completed_at"), // null when no-show, cancelled, or future
    noShow: boolean("no_show").notNull().default(false),
    cancelled: boolean("cancelled").notNull().default(false),
    feeCents: integer("fee_cents"),
    // therapynotes | manual | monday
    source: text("source").notNull(),
    externalRef: text("external_ref"), // dedup key per source
    unmatchedName: text("unmatched_name"), // CSV-import fallback when no client match
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    counselorIdx: index("practice_sessions_counselor_idx").on(
      t.counselorId,
      t.scheduledFor
    ),
    clientIdx: index("practice_sessions_client_idx").on(t.clientId),
    scheduledIdx: index("practice_sessions_scheduled_idx").on(t.scheduledFor),
    sourceRefIdx: uniqueIndex("practice_sessions_source_ref_idx")
      .on(t.source, t.externalRef)
      .where(sql`external_ref IS NOT NULL`),
  })
);

// Raw "inbox" of inbound signals before resolution to a client.
// Lets us record inquiries that never convert + measure leak rate.
export const practiceEvents = pgTable(
  "practice_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id),
    // inquiry_email | inquiry_sms | voicemail | referral_note
    // | walkin | manual
    kind: text("kind").notNull(),
    // email | dialpad_sms | dialpad_voicemail | monday | manual
    source: text("source").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    clientId: uuid("client_id").references(() => practiceClients.id, {
      onDelete: "set null",
    }),
    counselorId: uuid("counselor_id").references(() => contractors.id, {
      onDelete: "set null",
    }),
    externalRef: text("external_ref"), // dedup key per source
    // Minimal payload — sender, subject, snippet only.
    // NEVER store full transcripts / message bodies / clinical content.
    payload: jsonb("payload"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    entityKindIdx: index("practice_events_entity_kind_idx").on(
      t.entityId,
      t.kind,
      t.occurredAt
    ),
    inboxIdx: index("practice_events_inbox_idx").on(t.resolvedAt, t.occurredAt),
    sourceRefIdx: uniqueIndex("practice_events_source_ref_idx")
      .on(t.source, t.externalRef)
      .where(sql`external_ref IS NOT NULL`),
  })
);

// ─────────────────────────────────────────────────────────────
// Practice CRM — kanban, tasks, internal notes, notifications
// (replaces Monday.com — daily-driver tool for Heather + the admin)
// ─────────────────────────────────────────────────────────────

// Fixed client pipeline statuses. Matches the Monday board they use today.
// Free-form custom columns can come later if requested.
export const PRACTICE_CLIENT_STATUSES = [
  "lead",
  "scheduling",
  "confirmed",
  "in_progress",
  "discharged",
  "lost",
] as const;
export type PracticeClientStatus = (typeof PRACTICE_CLIENT_STATUSES)[number];

export const practiceTasks = pgTable(
  "practice_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id),
    clientId: uuid("client_id").references(() => practiceClients.id, {
      onDelete: "cascade",
    }),
    counselorId: uuid("counselor_id").references(() => contractors.id, {
      onDelete: "set null",
    }),
    assignedToUserId: uuid("assigned_to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    body: text("body"), // short — minimal-PHI rule applies
    // open | in_progress | waiting | done | wont_do
    status: text("status").notNull().default("open"),
    // low | normal | high
    priority: text("priority").notNull().default("normal"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    assignedIdx: index("practice_tasks_assigned_idx").on(
      t.assignedToUserId,
      t.status,
      t.dueAt
    ),
    clientIdx: index("practice_tasks_client_idx").on(t.clientId),
    statusIdx: index("practice_tasks_status_idx").on(t.status, t.dueAt),
  })
);

// Internal-only notes thread. Attaches to a client OR a task.
// NOT client-facing. Minimal-PHI rule still applies in the body text.
export const practiceNotes = pgTable(
  "practice_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id),
    clientId: uuid("client_id").references(() => practiceClients.id, {
      onDelete: "cascade",
    }),
    taskId: uuid("task_id").references(() => practiceTasks.id, {
      onDelete: "cascade",
    }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    // Array of user ids @mentioned — used for the notifications fan-out
    mentionsUserIds: jsonb("mentions_user_ids"), // uuid[]
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    clientIdx: index("practice_notes_client_idx").on(t.clientId, t.createdAt),
    taskIdx: index("practice_notes_task_idx").on(t.taskId, t.createdAt),
  })
);

// Audit trail for client status changes — drives the timeline view on
// the client detail page.
export const practiceStatusHistory = pgTable(
  "practice_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => practiceClients.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    changedByUserId: uuid("changed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    clientIdx: index("practice_status_history_client_idx").on(
      t.clientId,
      t.changedAt
    ),
  })
);

// In-app notifications. Bell icon in the top bar reads from here.
export const practiceNotifications = pgTable(
  "practice_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // mention | task_due_soon | session_today | client_stuck
    kind: text("kind").notNull(),
    refKind: text("ref_kind"), // practice_task | practice_client | practice_session
    refId: uuid("ref_id"),
    summary: text("summary").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    recipientIdx: index("practice_notifications_recipient_idx").on(
      t.recipientUserId,
      t.readAt,
      t.createdAt
    ),
  })
);

// Mirrors the statement_imports pattern for any practice-data CSV / API
// import (TherapyNotes, Monday, Dialpad). One row per ingest run.
export const practiceImports = pgTable("practice_imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull(), // therapynotes | monday | dialpad | manual
  filename: text("filename"),
  ingestedAt: timestamp("ingested_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  ingestedByUserId: uuid("ingested_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  rowsSeen: integer("rows_seen").notNull().default(0),
  rowsInserted: integer("rows_inserted").notNull().default(0),
  rowsMatched: integer("rows_matched").notNull().default(0),
  rowsUnmatched: integer("rows_unmatched").notNull().default(0),
  notes: text("notes"),
});

// Saved transaction filter presets per user — query-string blob.
export const savedFilters = pgTable(
  "saved_filters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // raw URL search-string e.g. "account=...&from=2026-01-01&to=2026-03-31&q=stripe"
    queryString: text("query_string").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index("saved_filters_user_idx").on(t.userId, t.createdAt),
  })
);

// Type exports for app code
export type Entity = typeof entities.$inferSelect;
export type NewEntity = typeof entities.$inferInsert;
export type BankAccount = typeof bankAccounts.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Contractor = typeof contractors.$inferSelect;
export type Employee = typeof employees.$inferSelect;
export type Receipt = typeof receipts.$inferSelect;
export type InterEntityTransfer = typeof interEntityTransfers.$inferSelect;
export type TaxDeadline = typeof taxDeadlines.$inferSelect;
export type SavedFilterRow = typeof savedFilters.$inferSelect;
export type ContractorPaperworkRow = typeof contractorPaperwork.$inferSelect;
export type PracticeClient = typeof practiceClients.$inferSelect;
export type PracticeSession = typeof practiceSessions.$inferSelect;
export type PracticeEvent = typeof practiceEvents.$inferSelect;
export type PracticeTask = typeof practiceTasks.$inferSelect;
export type PracticeNote = typeof practiceNotes.$inferSelect;
export type PracticeNotification = typeof practiceNotifications.$inferSelect;
