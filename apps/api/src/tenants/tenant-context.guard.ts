import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { Request } from 'express';
import { withTenantTransaction } from '../database/tenant-transaction';
import { organizationMembers } from '../database/schema';

export interface TenantContext {
  organizationId: string;
  role: string;
}

type AuthenticatedRequest = Request & {
  user?: { userId: string };
  tenant?: TenantContext;
};

/**
 * Resolves and validates the tenant for the request.
 *
 * The organization id is read from the `:orgId` route param — every
 * tenant-scoped route is under `/organizations/:orgId/...`, so the URL is the
 * single source of truth and can never disagree with the transaction the
 * controller will open. (An `X-Organization-Id` header would let a user pass
 * the guard as a member of one org while the controller operated on another.)
 *
 * The membership check runs inside `withTenantTransaction`, so the RLS
 * policies are active for it and the guard stays correct under real RLS
 * enforcement. On success `{ organizationId, role }` is attached to the
 * request for downstream guards/controllers.
 *
 * Must run AFTER `JwtAuthGuard` so `request.user` is populated.
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.userId;
    if (!userId) {
      throw new ForbiddenException('Authentication required.');
    }

    const orgId = request.params?.orgId as string | undefined;
    if (!orgId) {
      throw new ForbiddenException('The :orgId route param is required.');
    }

    let member: { role: string } | undefined;
    try {
      member = await withTenantTransaction(orgId, async (tx) => {
        const rows = await tx
          .select()
          .from(organizationMembers)
          .where(
            and(
              eq(organizationMembers.organizationId, orgId),
              eq(organizationMembers.userId, userId)
            )
          );
        return rows[0];
      });
    } catch {
      throw new ForbiddenException('Not a member of this organization.');
    }

    if (!member) {
      throw new ForbiddenException('Not a member of this organization.');
    }

    request.tenant = { organizationId: orgId, role: member.role };
    return true;
  }
}