-- Row-Level Security + integrity CHECK constraints for tenant-scoped tables.
--
-- TENANT ISOLATION NOTES (read before deploying):
--
-- (1) FORCE ROW LEVEL SECURITY matters. PostgreSQL bypasses RLS entirely for
--     the table owner and for superusers unless a table is FORCE RLS'd. The
--     default DATABASE_URL in .env.example connects as the `postgres`
--     superuser (which also owns the tables created by migrations), so with
--     plain `ENABLE ROW LEVEL SECURITY` the policies below are silently a
--     no-op: every connection using that role can read/write ALL tenants'
--     rows regardless of `app.current_org_id`. Every tenant table below is
--     therefore FORCE RLS'd so the policies apply to the owner too.
--
-- (2) FORCE RLS does NOT protect against a superuser connection. Superusers
--     always bypass RLS, FORCE or not. The app's runtime DATABASE_URL must
--     therefore use a dedicated NON-SUPERUSER role for this isolation to
--     matter at all — the `postgres` default is only acceptable for local
--     dev/throwaway databases.
--
-- (3) Defense in depth: ideally migrations run as one role and the
--     application runs as a separate, more restricted non-superuser role
--     (and that app role should be granted only what it needs). FORCE RLS
--     alone closes the owner-bypass gap even if migration and app roles are
--     the same non-superuser role; the split is extra hardening.

-- Enable AND force Row-Level Security on tenant-scoped tables
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "gstins" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gstins" FORCE ROW LEVEL SECURITY;
ALTER TABLE "invoice_number_sequences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_number_sequences" FORCE ROW LEVEL SECURITY;
ALTER TABLE "organization_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_members" FORCE ROW LEVEL SECURITY;
ALTER TABLE "chart_of_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chart_of_accounts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ledger_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledger_transactions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ledger_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledger_entries" FORCE ROW LEVEL SECURITY;
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers" FORCE ROW LEVEL SECURITY;
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;
ALTER TABLE "invoice_line_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_line_items" FORCE ROW LEVEL SECURITY;

-- Create policies for tenant isolation
CREATE POLICY tenant_isolation_organizations ON "organizations"
  USING (id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_gstins ON "gstins"
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_invoice_number_sequences ON "invoice_number_sequences"
  USING (gstin_id IN (
    SELECT id FROM "gstins" WHERE organization_id = current_setting('app.current_org_id', true)::uuid
  ));

CREATE POLICY tenant_isolation_organization_members ON "organization_members"
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_chart_of_accounts ON "chart_of_accounts"
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_ledger_transactions ON "ledger_transactions"
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_ledger_entries ON "ledger_entries"
  USING (transaction_id IN (
    SELECT id FROM "ledger_transactions" WHERE organization_id = current_setting('app.current_org_id', true)::uuid
  ));

CREATE POLICY tenant_isolation_customers ON "customers"
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_invoices ON "invoices"
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_invoice_line_items ON "invoice_line_items"
  USING (invoice_id IN (
    SELECT id FROM "invoices" WHERE organization_id = current_setting('app.current_org_id', true)::uuid
  ));

-- Add CHECK constraint to ledger_entries to ensure debit XOR credit
ALTER TABLE "ledger_entries" ADD CONSTRAINT check_debit_or_credit
  CHECK (
    (debit_amount > 0 AND credit_amount = 0) OR
    (credit_amount > 0 AND debit_amount = 0)
  );

-- Invoice header totals must reconcile: total = subtotal + all taxes
ALTER TABLE "invoices" ADD CONSTRAINT check_invoice_totals
  CHECK (
    total_amount = subtotal + total_cgst + total_sgst + total_igst + total_cess
  );

-- Line item total must reconcile: line_total = taxable + all taxes
ALTER TABLE "invoice_line_items" ADD CONSTRAINT check_invoice_line_totals
  CHECK (
    line_total = taxable_amount + cgst_amount + sgst_amount + igst_amount + cess_amount
  );
