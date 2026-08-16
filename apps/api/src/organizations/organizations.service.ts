import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { db, DbTransaction } from '../database/db';
import { gstins, organizations, organizationMembers } from '../database/schema';
import { seedChartOfAccounts } from '../database/seed-coa';
import { CreateOrganizationDto } from './organizations.dto';

@Injectable()
export class OrganizationsService {
  /**
   * Lists the organizations the user belongs to, with their role.
   *
   * This is the SECOND (and only other) legitimate exception to "every route
   * needs tenant context" — the first being create(). It is intentionally NOT
   * org-scoped: its job is to RESOLVE which org(s) the caller belongs to, and
   * a user can belong to several, so there is no single `app.current_org_id`
   * to apply.
   *
   * RLS interaction (see the self-membership policies in rls_and_checks.sql):
   * the org-scoped SELECT policies match NOTHING when `app.current_org_id` is
   * unset — current_setting(..., true) yields NULL, so an unscoped read
   * returns zero rows for EVERY user under FORCE RLS. This route therefore
   * sets `app.current_user_id` (a separate GUC) instead, which the additive
   * user-keyed policies are keyed on. It runs in its own transaction because
   * it is NOT going through withTenantTransaction (which sets the ORG GUC,
   * not this one); the same set_config(...) pattern as create() applies.
   *
   * Trust model: like app.current_org_id, app.current_user_id is only ever
   * set here from the authenticated JWT's userId, never from client input.
   *
   * KNOWN TESTING GAP: mocked unit tests cannot prove any of the above — the
   * OR-combined permissive policies under a non-superuser connection only
   * surface against a real Postgres instance. Verify with a DB-backed
   * integration test; see tenant-transaction.spec.ts for the same documented
   * gap.
   */
  async listForUser(userId: string) {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.current_user_id', ${userId}, true)`
      );

      return tx
        .select({
          id: organizations.id,
          legalName: organizations.legalName,
          tradeName: organizations.tradeName,
          role: organizationMembers.role,
        })
        .from(organizationMembers)
        .innerJoin(
          organizations,
          eq(organizations.id, organizationMembers.organizationId)
        )
        .where(eq(organizationMembers.userId, userId));
    });
  }

  /**
   * Creates an organization AND the creator's owner membership in a single
   * transaction.
   *
   * Uses `db.transaction` directly, NOT `withTenantTransaction`: no org exists
   * yet to scope to, so there is nothing to set `app.current_org_id` to. This
   * is the one legitimate exception to the "always tenant-scope writes" rule.
   *
   * GSTINs are added separately via `POST /organizations/:orgId/gstins`
   * (gstins module) after the org exists.
   *
   * RLS interaction (see the per-command policy split in rls_and_checks.sql):
   * the INSERT policies on organizations / organization_members are
   * `WITH CHECK (true)`, so the write itself is allowed without any context.
   * BUT the `.returning()` below reads the new row back and is therefore
   * subject to the SELECT policy — which requires `app.current_org_id` to
   * equal the row's id. So the id is pre-generated here and the context is
   * set to it BEFORE the insert. The membership insert has NO `.returning()`
   * (no SELECT-policy readback), so it only needs the WITH CHECK (true)
   * INSERT policy — its `organization_id` already matches the context set
   * above regardless.
   *
   * Also seeds the system chart of accounts (see seedChartOfAccounts) so the
   * organization's ledger is usable immediately.
   */
  async create(input: CreateOrganizationDto, userId: string) {
    const organizationId = randomUUID();

    return db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.current_org_id', ${organizationId}, true)`
      );

      const [org] = await tx
        .insert(organizations)
        .values({
          id: organizationId,
          legalName: input.legalName,
          tradeName: input.tradeName ?? null,
          panNumber: input.panNumber ?? null,
          defaultCurrency: input.defaultCurrency,
          fiscalYearStartMonth: input.fiscalYearStartMonth,
        })
        .returning({
          id: organizations.id,
          legalName: organizations.legalName,
          tradeName: organizations.tradeName,
        });

      await tx.insert(organizationMembers).values({
        organizationId,
        userId,
        role: 'owner',
      });

      // Seed the system chart of accounts so the ledger works from day one
      // (InvoicesService.issueInvoice requires these codes to exist). Same
      // transaction, context already set to the new org id above.
      await seedChartOfAccounts(tx, organizationId);

      return org;
    });
  }

  /**
   * Lists the GSTINs (branches) belonging to an organization. Runs inside a
   * withTenantTransaction (set up by the controller), so RLS scopes it to the
   * org — and the query also filters by organizationId, matching the
   * CustomersService defense-in-depth pattern.
   */
  async listGstins(tx: DbTransaction, organizationId: string) {
    return tx
      .select({
        id: gstins.id,
        gstin: gstins.gstin,
        branchName: gstins.branchName,
        stateCode: gstins.stateCode,
        status: gstins.status,
      })
      .from(gstins)
      .where(eq(gstins.organizationId, organizationId));
  }
}