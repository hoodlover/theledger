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
