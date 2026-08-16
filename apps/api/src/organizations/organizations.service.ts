import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { db, DbTransaction } from '../database/db';
import { gstins, organizations, organizationMembers } from '../database/schema';
import { CreateOrganizationDto } from './organizations.dto';

@Injectable()
export class OrganizationsService {
  /**
   * Lists the organizations the user belongs to, with their role.
   *
   * Intentionally NOT tenant-scoped: this is the route that RESOLVES which
   * org the user should scope to in the first place, so there is no single
   * org context to apply. A plain query filtered by the membership row is
   * correct here; RLS still applies via the connection's default role, but
   * this specific query's job is to discover tenancy, not to sit inside it.
   */
  async listForUser(userId: string) {
    return db
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
  }

  /**
   * Creates an organization AND the creator's owner membership in a single
   * transaction.
   *
   * Uses `db.transaction` directly, NOT `withTenantTransaction`: no org exists
   * yet to scope to, so there is nothing to set `app.current_org_id` to. This
   * is the one legitimate exception to the "always tenant-scope writes" rule.
   *
   * Follow-up (out of scope here): org creation does NOT create a GSTIN —
   * GSTIN validation and state-code derivation from the GSTIN format are a
   * separate, larger piece of work.
   */
  async create(input: CreateOrganizationDto, userId: string) {
    return db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizations)
        .values({
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
        organizationId: org.id,
        userId,
        role: 'owner',
      });

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