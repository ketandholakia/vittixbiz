/**
 * VittixBiz — Core Database Schema (Drizzle ORM / PostgreSQL)
 * packages/db/schema.ts (or apps/api/src/db/schema.ts depending on your monorepo layout)
 *
 * Conventions:
 * - All money columns use numeric(15,2) — NEVER float/double/real.
 * - All tenant-scoped tables carry organization_id for RLS + query scoping.
 * - Timestamps use timestamptz, defaulting to now().
 * - IDs use uuid (gen_random_uuid()) rather than serial, to avoid leaking
 *   sequential counts and to make multi-region/merge scenarios easier later.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// ENUMS
// ---------------------------------------------------------------------------

export const gstinStatusEnum = pgEnum("gstin_status", [
  "active",
  "suspended",
  "cancelled",
]);

export const accountTypeEnum = pgEnum("account_type", [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
]);

export const taxTypeEnum = pgEnum("tax_type", [
  "cgst",
  "sgst",
  "igst",
  "cess",
  "exempt",
  "nil_rated",
  "zero_rated",
]);

export const userRoleEnum = pgEnum("user_role", [
  "owner",
  "admin",
  "accountant",
  "biller",
  "viewer",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "issued",
  "paid",
  "partially_paid",
  "cancelled",
]);

// ---------------------------------------------------------------------------
// ORGANIZATIONS (Tenants)
// ---------------------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  legalName: varchar("legal_name", { length: 255 }).notNull(),
  tradeName: varchar("trade_name", { length: 255 }),
  panNumber: varchar("pan_number", { length: 10 }), // Org-level PAN (GSTINs are per-state)
  defaultCurrency: varchar("default_currency", { length: 3 })
    .notNull()
    .default("INR"),
  fiscalYearStartMonth: integer("fiscal_year_start_month")
    .notNull()
    .default(4), // April, per Indian FY
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// GSTINs (Branches / Registrations) — one org can have multiple, one per state
// ---------------------------------------------------------------------------

export const gstins = pgTable(
  "gstins",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    gstin: varchar("gstin", { length: 15 }).notNull(), // 15-char GSTIN
    branchName: varchar("branch_name", { length: 255 }).notNull(),
    stateCode: varchar("state_code", { length: 2 }).notNull(), // first 2 digits of GSTIN
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: varchar("city", { length: 100 }),
    pincode: varchar("pincode", { length: 6 }),
    status: gstinStatusEnum("status").notNull().default("active"),
    // Current financial year's next invoice number pointer — see invoice
    // numbering note at bottom of file for why this lives here.
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    gstinUnique: uniqueIndex("gstins_gstin_unique").on(table.gstin),
    orgIdx: index("gstins_org_idx").on(table.organizationId),
  })
);

// ---------------------------------------------------------------------------
// INVOICE NUMBERING SEQUENCES — gapless, per GSTIN, per financial year
// Use SELECT ... FOR UPDATE on this row when issuing a new invoice number.
// Never use a Postgres SEQUENCE for this — sequences can skip numbers on
// rollback, which is not GST-compliant.
// ---------------------------------------------------------------------------

export const invoiceNumberSequences = pgTable(
  "invoice_number_sequences",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    gstinId: uuid("gstin_id")
      .notNull()
      .references(() => gstins.id, { onDelete: "cascade" }),
    financialYear: varchar("financial_year", { length: 9 }).notNull(), // e.g. "2026-27"
    documentType: varchar("document_type", { length: 30 }).notNull(), // "invoice" | "credit_note" | "debit_note"
    prefix: varchar("prefix", { length: 20 }).notNull().default(""),
    lastNumber: integer("last_number").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    seqUnique: uniqueIndex("invoice_seq_unique").on(
      table.gstinId,
      table.financialYear,
      table.documentType
    ),
  })
);

// ---------------------------------------------------------------------------
// USERS & TENANT MEMBERSHIP
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  emailUnique: uniqueIndex("users_email_unique").on(table.email),
}));

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: userRoleEnum("role").notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    memberUnique: uniqueIndex("org_members_unique").on(
      table.organizationId,
      table.userId
    ),
  })
);

// ---------------------------------------------------------------------------
// CHART OF ACCOUNTS — backbone of the double-entry ledger
// ---------------------------------------------------------------------------

export const chartOfAccounts = pgTable(
  "chart_of_accounts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 20 }).notNull(), // e.g. "1000", "4010"
    name: varchar("name", { length: 255 }).notNull(),
    type: accountTypeEnum("type").notNull(),
    parentAccountId: uuid("parent_account_id"),
    isSystemAccount: boolean("is_system_account").notNull().default(false), // seeded accounts (e.g. "Output CGST") shouldn't be deletable
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    codeUnique: uniqueIndex("coa_org_code_unique").on(
      table.organizationId,
      table.code
    ),
    orgIdx: index("coa_org_idx").on(table.organizationId),
  })
);

// ---------------------------------------------------------------------------
// LEDGER ENTRIES — immutable, double-entry. Reversals only, never mutate.
// ---------------------------------------------------------------------------

export const ledgerTransactions = pgTable(
  "ledger_transactions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    gstinId: uuid("gstin_id").references(() => gstins.id, {
      onDelete: "restrict",
    }),
    transactionDate: timestamp("transaction_date", {
      withTimezone: true,
    }).notNull(),
    sourceType: varchar("source_type", { length: 30 }).notNull(), // "invoice" | "payment" | "credit_note" | "manual_journal" | "reversal"
    sourceId: uuid("source_id"), // FK to the source document (polymorphic — keep loose, validate at app layer)
    narration: text("narration"),
    reversalOfTransactionId: uuid("reversal_of_transaction_id"), // self-reference for reversals
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgDateIdx: index("ledger_txn_org_date_idx").on(
      table.organizationId,
      table.transactionDate
    ),
    sourceIdx: index("ledger_txn_source_idx").on(
      table.sourceType,
      table.sourceId
    ),
  })
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => ledgerTransactions.id, { onDelete: "restrict" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => chartOfAccounts.id, { onDelete: "restrict" }),
    // Store debit and credit as separate non-negative columns rather than a
    // signed amount — this makes it trivial to CHECK-constrain and to sum
    // debits/credits independently for trial balance reports.
    debitAmount: numeric("debit_amount", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    creditAmount: numeric("credit_amount", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    txnIdx: index("ledger_entries_txn_idx").on(table.transactionId),
    accountIdx: index("ledger_entries_account_idx").on(table.accountId),
  })
  // NOTE: add a raw SQL migration for:
  //   CHECK (
  //     (debit_amount > 0 AND credit_amount = 0) OR
  //     (credit_amount > 0 AND debit_amount = 0)
  //   )
  // Drizzle doesn't yet support row-level CHECK constraints referencing
  // multiple columns natively across all versions — add via a custom
  // migration SQL file if your Drizzle Kit version lacks `check()`.
);

// ---------------------------------------------------------------------------
// TAX RATES & HSN/SAC MASTER
// ---------------------------------------------------------------------------

export const hsnSacMaster = pgTable(
  "hsn_sac_master",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    code: varchar("code", { length: 8 }).notNull(), // HSN (goods) or SAC (services)
    description: text("description").notNull(),
    isService: boolean("is_service").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    codeUnique: uniqueIndex("hsn_sac_code_unique").on(table.code),
  })
);

export const taxRates = pgTable(
  "tax_rates",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    // Global master data, not org-scoped — GST rates are set by GSTN, not per-tenant.
    hsnSacCode: varchar("hsn_sac_code", { length: 8 }).notNull(),
    // Total GST rate (e.g. 18.00) — split into CGST+SGST or IGST at
    // calculation time based on place of supply, not stored as separate rows.
    ratePercent: numeric("rate_percent", { precision: 5, scale: 2 }).notNull(),
    cessPercent: numeric("cess_percent", { precision: 5, scale: 2 }),
    effectiveFrom: timestamp("effective_from", {
      withTimezone: true,
    }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }), // null = currently active
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    hsnIdx: index("tax_rates_hsn_idx").on(table.hsnSacCode),
  })
);

// ---------------------------------------------------------------------------
// CUSTOMERS — B2B and B2C buyers
// ---------------------------------------------------------------------------

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    gstin: varchar("gstin", { length: 15 }), // null for B2C sales
    placeOfSupplyStateCode: varchar("place_of_supply_state_code", {
      length: 2,
    }).notNull(), // first 2 digits of buyer's GSTIN state, or billing state for B2C
    billingAddress: text("billing_address"),
    shippingAddress: text("shipping_address"),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 20 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdx: index("customers_org_idx").on(table.organizationId),
  })
);

// ---------------------------------------------------------------------------
// INVOICES — header of a GST invoice document
// ---------------------------------------------------------------------------

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    gstinId: uuid("gstin_id")
      .notNull()
      .references(() => gstins.id, { onDelete: "restrict" }), // issuing branch
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    invoiceNumber: varchar("invoice_number", { length: 50 }).notNull(), // formatted string from InvoiceNumberingService
    financialYear: varchar("financial_year", { length: 9 }).notNull(), // e.g. "2026-27"
    invoiceDate: timestamp("invoice_date", { withTimezone: true }).notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    subtotal: numeric("subtotal", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    totalCgst: numeric("total_cgst", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    totalSgst: numeric("total_sgst", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    totalIgst: numeric("total_igst", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    totalCess: numeric("total_cess", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    totalAmount: numeric("total_amount", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    ledgerTransactionId: uuid("ledger_transaction_id").references(
      () => ledgerTransactions.id,
      { onDelete: "set null" }
    ), // set once the invoice is posted to the ledger
    irnNumber: varchar("irn_number", { length: 64 }), // e-invoice IRN (Phase 4)
    irnAckNo: varchar("irn_ack_no", { length: 64 }),
    irnAckDate: timestamp("irn_ack_date", { withTimezone: true }),
    qrCodeData: text("qr_code_data"), // serialized QR payload (Phase 4)
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgDateIdx: index("invoices_org_date_idx").on(
      table.organizationId,
      table.invoiceDate
    ),
    numberUnique: uniqueIndex("invoices_org_number_unique").on(
      table.organizationId,
      table.invoiceNumber
    ),
    gstinIdx: index("invoices_gstin_idx").on(table.gstinId),
  })
);

// ---------------------------------------------------------------------------
// INVOICE LINE ITEMS — one row per HSN/SAC line on an invoice
// ---------------------------------------------------------------------------

export const invoiceLineItems = pgTable(
  "invoice_line_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    hsnSacCode: varchar("hsn_sac_code", { length: 8 }).notNull(),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 15, scale: 3 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    discountAmount: numeric("discount_amount", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    taxableAmount: numeric("taxable_amount", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    cgstRate: numeric("cgst_rate", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    cgstAmount: numeric("cgst_amount", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    sgstRate: numeric("sgst_rate", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    sgstAmount: numeric("sgst_amount", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    igstRate: numeric("igst_rate", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    igstAmount: numeric("igst_amount", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    cessRate: numeric("cess_rate", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    cessAmount: numeric("cess_amount", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    lineTotal: numeric("line_total", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    invoiceIdx: index("invoice_line_items_invoice_idx").on(table.invoiceId),
  })
);

// ---------------------------------------------------------------------------
// RELATIONS (Drizzle relational query support)
// ---------------------------------------------------------------------------

export const organizationsRelations = relations(organizations, ({ many }) => ({
  gstins: many(gstins),
  members: many(organizationMembers),
  accounts: many(chartOfAccounts),
}));

export const gstinsRelations = relations(gstins, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [gstins.organizationId],
    references: [organizations.id],
  }),
  numberSequences: many(invoiceNumberSequences),
}));

export const ledgerTransactionsRelations = relations(
  ledgerTransactions,
  ({ many, one }) => ({
    entries: many(ledgerEntries),
    organization: one(organizations, {
      fields: [ledgerTransactions.organizationId],
      references: [organizations.id],
    }),
  })
);

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  transaction: one(ledgerTransactions, {
    fields: [ledgerEntries.transactionId],
    references: [ledgerTransactions.id],
  }),
  account: one(chartOfAccounts, {
    fields: [ledgerEntries.accountId],
    references: [chartOfAccounts.id],
  }),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [customers.organizationId],
    references: [organizations.id],
  }),
  invoices: many(invoices),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [invoices.organizationId],
    references: [organizations.id],
  }),
  gstin: one(gstins, {
    fields: [invoices.gstinId],
    references: [gstins.id],
  }),
  customer: one(customers, {
    fields: [invoices.customerId],
    references: [customers.id],
  }),
  ledgerTransaction: one(ledgerTransactions, {
    fields: [invoices.ledgerTransactionId],
    references: [ledgerTransactions.id],
  }),
  lineItems: many(invoiceLineItems),
}));

export const invoiceLineItemsRelations = relations(
  invoiceLineItems,
  ({ one }) => ({
    invoice: one(invoices, {
      fields: [invoiceLineItems.invoiceId],
      references: [invoices.id],
    }),
  })
);
