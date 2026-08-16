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
--
-- (4) CONNECTION-POOLING QUIRK — custom GUC placeholders revert to '' not NULL.
--     `app.current_org_id` / `app.current_user_id` are custom GUCs, which
--     Postgres treats as session-scoped placeholders. The FIRST time
--     set_config('app.x', ..., true) runs on a physical connection, the
--     placeholder is created; when the LOCAL (transaction) scope ends, the
--     variable does NOT revert to "unset" — it reverts to an EMPTY STRING.
--     On a LATER reuse of that same pooled connection, current_setting('app.x', true)
--     therefore returns '' instead of NULL, and ''::uuid THROWS
--     (invalid input syntax for type uuid) instead of safely matching nothing.
--     With a pg.Pool, ANY connection that has ever handled a tenant-scoped
--     request (i.e. ever called set_config for app.current_org_id) will 500
--     on a later request that does not set a fresh value — this would break
--     EVERY tenant_isolation_* policy, not just the org-discovery ones.
--     Every current_setting(...)::uuid below is therefore wrapped in
--     NULLIF(..., '')::uuid to normalize '' back to NULL (which compares
--     false, never errors). Do NOT add a policy with a bare
--     `current_setting(...)::uuid` cast — keep the NULLIF wrapper.
--
-- (5) KNOWN TESTING GAP (connection reuse): the ''-instead-of-NULL quirk in
--     (4) only surfaces when a single physical connection is REUSED across
--     multiple transactions where the first one called set_config for the
--     GUC. A single isolated transaction — even against a real Postgres —
--     cannot reproduce it, because the placeholder is only "born" on the
--     second and later use of a given connection. Validation requires
--     exercising a shared connection pool across several requests: set
--     context, commit, then run an unscoped query on the same pooled
--     connection and assert it returns rows instead of throwing. This class
--     of bug is invisible to mocked unit tests (see tenant-transaction.spec.ts
--     for the same documented gap).

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
-- ── organizations & organization_members: per-command policies ──────────────
--
-- These two tables are the ONLY ones written before any org context exists:
-- POST /organizations creates the org AND the creator's membership, and at
-- that moment there is no `app.current_org_id` to set (the org does not exist
-- yet, so withTenantTransaction is impossible — it would be chicken-and-egg).
-- Every other tenant table is only ever written inside an existing org's
-- withTenantTransaction, so their single combined policy below works: the
-- caller always has context, and RLS is what stops one tenant from touching
-- another's rows. Only these two tables need the split.
--
-- The split per command:
--   SELECT / UPDATE / DELETE keep the strict `= current_setting(...)` filter
--   — that is the tenant isolation that matters for rows that already exist,
--   and it also scopes reads during org-scoped flows (e.g. the membership
--   check in TenantContextGuard runs with the org's context active).
--   INSERT uses `WITH CHECK (true)`: creation is gated at the application
--   layer by JwtAuthGuard (any authenticated user may create an org), so RLS
--   has nothing to isolate yet and cannot require a context that cannot
--   exist. WITHOUT this split, the combined policy's USING expression is the
--   WITH CHECK for INSERT, and no new org could ever be created.
--
-- CRITICAL POSTGRES BEHAVIOR (this bit us in OrganizationsService.create):
-- even once the INSERT policy permits a write, a `.returning()` on the new
-- row FAILS unless the row also satisfies the table's SELECT policy —
-- RETURNING reads the row back and is subject to SELECT RLS. The service
-- therefore pre-generates the org id and runs
-- `set_config('app.current_org_id', <new id>)` BEFORE the inserts, so the
-- new rows pass both the INSERT and the SELECT policies at RETURNING time.
-- This is documented Postgres behavior, not a Drizzle quirk, and only shows
-- up against a real server (a non-superuser role + FORCE RLS), so it cannot
-- be caught by mocked unit tests.
DROP POLICY IF EXISTS tenant_isolation_organizations ON "organizations";
DROP POLICY IF EXISTS tenant_isolation_organization_members ON "organization_members";

CREATE POLICY tenant_isolation_organizations_select ON "organizations"
  FOR SELECT
  USING (id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

CREATE POLICY tenant_isolation_organizations_update ON "organizations"
  FOR UPDATE
  USING (id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

CREATE POLICY tenant_isolation_organizations_delete ON "organizations"
  FOR DELETE
  USING (id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

CREATE POLICY tenant_isolation_organizations_insert ON "organizations"
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY tenant_isolation_organization_members_select ON "organization_members"
  FOR SELECT
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

CREATE POLICY tenant_isolation_organization_members_update ON "organization_members"
  FOR UPDATE
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

CREATE POLICY tenant_isolation_organization_members_delete ON "organization_members"
  FOR DELETE
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

CREATE POLICY tenant_isolation_organization_members_insert ON "organization_members"
  FOR INSERT
  WITH CHECK (true);

-- ── Self-membership SELECT policies (user-keyed, ADDITIVE) ──────────────────
--
-- organizations and organization_members are the ONLY tables queried before
-- a single org context exists: listForUser() resolves which orgs a user
-- belongs to, and a user can belong to several, so no single
-- `app.current_org_id` can be set for it. Under FORCE RLS, the org-scoped
-- SELECT policies above match NOTHING when the setting is absent —
-- current_setting('app.current_org_id', true) yields NULL, and NULL = NULL
-- is not true — so an unscoped read returns zero rows for EVERY user
-- (single-org and multi-org alike). That is exactly what GET /me/organizations
-- returned under a non-superuser connection.
--
-- These two policies are keyed on user identity instead and are purely
-- ADDITIVE: Postgres OR-combines multiple permissive policies for the same
-- table/command, so org-scoped queries (app.current_org_id set) are
-- completely unaffected, and the unscoped membership query (app.current_user_id
-- set) now matches. listForUser() sets `app.current_user_id` via
-- set_config(..., true) inside its own transaction — same trust model as
-- app.current_org_id: the value comes only from the authenticated JWT, never
-- from client input. (The organizations policy's subquery reads
-- organization_members without RLS applied — policy expressions are evaluated
-- with the table owner's privileges — which is what lets it see all
-- membership rows regardless of FORCE RLS.)
--
-- Only these two tables need this: they are the only ones read before an org
-- context exists — the same reasoning as the per-command policy split above.
--
-- KNOWN TESTING GAP: this OR-combination behavior (and the empty-result bug
-- it fixes) only shows up against a real Postgres server under a
-- non-superuser connection with FORCE RLS. It cannot be validated by mocked
-- unit tests; verify with a DB-backed integration test.
CREATE POLICY self_membership_select ON organization_members
  FOR SELECT
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY self_membership_org_select ON organizations
  FOR SELECT
  USING (id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  ));

CREATE POLICY tenant_isolation_gstins ON "gstins"
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

CREATE POLICY tenant_isolation_invoice_number_sequences ON "invoice_number_sequences"
  USING (gstin_id IN (
    SELECT id FROM "gstins" WHERE organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
  ));

CREATE POLICY tenant_isolation_chart_of_accounts ON "chart_of_accounts"
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

CREATE POLICY tenant_isolation_ledger_transactions ON "ledger_transactions"
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

CREATE POLICY tenant_isolation_ledger_entries ON "ledger_entries"
  USING (transaction_id IN (
    SELECT id FROM "ledger_transactions" WHERE organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
  ));

CREATE POLICY tenant_isolation_customers ON "customers"
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

CREATE POLICY tenant_isolation_invoices ON "invoices"
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

CREATE POLICY tenant_isolation_invoice_line_items ON "invoice_line_items"
  USING (invoice_id IN (
    SELECT id FROM "invoices" WHERE organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
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
