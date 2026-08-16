jest.mock('../database/tenant-transaction', () => ({
  withTenantTransaction: jest.fn(),
}));

import { ForbiddenException } from '@nestjs/common';
import { TenantContextGuard } from './tenant-context.guard';
import { withTenantTransaction } from '../database/tenant-transaction';

const mockWithTenantTransaction = withTenantTransaction as unknown as jest.Mock;

const ORG_ID = '11111111-2222-3333-4444-555555555555';
const USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function makeContext(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as any;
}

function stubMembership(rows: unknown[]) {
  const mockTx = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(rows),
  };
  mockWithTenantTransaction.mockImplementation(
    async (_orgId: string, fn: (tx: unknown) => Promise<unknown>) =>
      fn(mockTx)
  );
  return mockTx;
}

/**
 * TESTS for TenantContextGuard — the request-to-RLS boundary.
 *
 * The guard's membership check runs inside withTenantTransaction, which sets
 * `app.current_org_id` and would only see rows the RLS policy allows. Full
 * DB-backed RLS verification needs a real Postgres instance with
 * rls_and_checks.sql applied; here we mock at the "is/isn't a member"
 * boundary, which is what the guard is responsible for deciding.
 */
describe('TenantContextGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows a user who is a member of the organization', async () => {
    const request = {
      params: { orgId: ORG_ID },
      user: { userId: USER_ID },
      tenant: undefined,
    };
    const mockTx = stubMembership([{ role: 'admin' }]);

    const guard = new TenantContextGuard();
    const allowed = await guard.canActivate(makeContext(request));

    expect(allowed).toBe(true);
    expect(request.tenant).toEqual({ organizationId: ORG_ID, role: 'admin' });
    expect(mockTx.where).toHaveBeenCalledTimes(1);
    expect(mockWithTenantTransaction).toHaveBeenCalledWith(
      ORG_ID,
      expect.any(Function)
    );
  });

  it('denies a user who is not a member of the organization', async () => {
    const request = {
      params: { orgId: ORG_ID },
      user: { userId: USER_ID },
      tenant: undefined,
    };
    stubMembership([]);

    const guard = new TenantContextGuard();
    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(
      ForbiddenException
    );
    expect(request.tenant).toBeUndefined();
  });

  it('denies when the :orgId route param is missing', async () => {
    const request = { params: {}, user: { userId: USER_ID } };

    const guard = new TenantContextGuard();
    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(
      ForbiddenException
    );
    expect(mockWithTenantTransaction).not.toHaveBeenCalled();
  });

  it('denies when there is no authenticated user', async () => {
    const request = { params: { orgId: ORG_ID } };

    const guard = new TenantContextGuard();
    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(
      ForbiddenException
    );
    expect(mockWithTenantTransaction).not.toHaveBeenCalled();
  });

  it('denies when the tenant transaction fails (e.g. malformed org id)', async () => {
    const request = {
      params: { orgId: 'not-a-uuid' },
      user: { userId: USER_ID },
    };
    mockWithTenantTransaction.mockRejectedValue(new Error('not a UUID'));

    const guard = new TenantContextGuard();
    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(
      ForbiddenException
    );
  });
});