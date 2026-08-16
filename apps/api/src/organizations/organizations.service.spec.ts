jest.mock('../database/db', () => ({
  db: {
    select: jest.fn(),
    transaction: jest.fn(),
  },
}));

import { OrganizationsService } from './organizations.service';
import { createOrganizationSchema } from './organizations.dto';

const { db } = jest.requireMock('../database/db') as {
  db: { select: jest.Mock; transaction: jest.Mock };
};

const USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * TESTS for OrganizationsService — the org discovery/creation boundary.
 *
 * listForUser and create deliberately use the global db (not a tenant tx):
 * they are how tenancy is resolved in the first place, so there is no org
 * context to scope to. listGstins receives the tx from withTenantTransaction
 * like every other tenant-scoped service method.
 *
 * KNOWN TESTING GAP (why this suite cannot validate the RLS fixes): the whole
 * `create` and `listForUser` flows are mocked, so the PostgreSQL RLS behavior
 * behind them is never exercised here. Specifically:
 *   - Postgres requires a newly inserted row to satisfy the table's SELECT
 *     policy for RETURNING to work (RETURNING reads the row back). The
 *     service pre-generates the org id and sets `app.current_org_id` to it
 *     before inserting so that happens; a mock cannot prove the real server
 *     accepts the statement, only that the calls happen in that order.
 *   - The INSERT policies on organizations / organization_members are
 *     `WITH CHECK (true)` because no org context can exist during creation;
 *     the combined `= current_setting(...)` policies that work for every
 *     other table would reject the write. This split lives in
 *     rls_and_checks.sql and is also not exercised here.
 *   - listForUser() sets `app.current_user_id` (a separate GUC) that additive
 *     user-keyed SELECT policies are keyed on; that those OR-combine with the
 *     org-scoped policies on a real server is not exercised here.
 *   - FORCE RLS only bites non-superuser connections, so this class of bug
 *     also does not surface under the local `postgres` superuser default.
 *
 * To catch these you need a real DB-backed integration test (testcontainers
 * or similar): apply the drizzle migrations + rls_and_checks.sql, connect as
 * a non-superuser role, POST an org, and assert the returned row + a
 * subsequent scoped read + the unscoped /me/organizations read. Until that
 * exists, the order assertions below are the best a mocked unit test can
 * offer.
 */
describe('OrganizationsService.listForUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function stubListQuery(rows: unknown[]) {
    const mockTx = {
      execute: jest.fn().mockResolvedValue(undefined),
      select: jest.fn(),
    };
    const mockWhere = jest.fn().mockResolvedValue(rows);
    mockTx.select.mockReturnValue({
      from: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnValue({ where: mockWhere }),
      }),
    });
    db.transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)
    );
    return { mockTx, mockWhere };
  }

  it('sets app.current_user_id before running the membership query', async () => {
    const rows = [
      {
        id: 'org-1',
        legalName: 'Acme Traders',
        tradeName: 'Acme',
        role: 'owner',
      },
      {
        id: 'org-2',
        legalName: 'Beta Works',
        tradeName: null,
        role: 'admin',
      },
    ];
    const { mockTx, mockWhere } = stubListQuery(rows);

    const service = new OrganizationsService();
    const result = await service.listForUser(USER_ID);

    expect(result).toEqual(rows);
    expect(db.transaction).toHaveBeenCalledTimes(1);

    // The user GUC is set BEFORE the select — the additive user-keyed
    // permissive policies OR'd into the query need it. Mocked here; the real
    // Postgres side is documented in the KNOWN TESTING GAP note above.
    expect(mockTx.execute).toHaveBeenCalledTimes(1);
    const sqlJson = JSON.stringify(mockTx.execute.mock.calls[0][0]);
    expect(sqlJson).toContain('set_config');
    expect(sqlJson).toContain('app.current_user_id');
    expect(mockTx.execute.mock.invocationCallOrder[0]).toBeLessThan(
      mockTx.select.mock.invocationCallOrder[0]
    );
    expect(mockWhere).toHaveBeenCalledTimes(1);
  });

  it('returns an empty list when the user has no memberships', async () => {
    const { mockTx } = stubListQuery([]);

    const service = new OrganizationsService();
    const result = await service.listForUser(USER_ID);

    expect(result).toEqual([]);
    expect(mockTx.select).toHaveBeenCalledTimes(1);
  });
});

describe('OrganizationsService.create', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function stubTransaction() {
    const mockTx = {
      execute: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn(),
    };
    db.transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)
    );
    return mockTx;
  }

  it('sets the tenant context to the new org id before inserting, then creates the org + owner membership', async () => {
    const mockTx = stubTransaction();
    mockTx.returning.mockResolvedValueOnce([
      { id: 'returned-org-id', legalName: 'Acme Traders', tradeName: null },
    ]);

    const service = new OrganizationsService();
    const result = await service.create(
      {
        legalName: 'Acme Traders',
        tradeName: 'Acme',
        panNumber: 'AABCP1234E',
        defaultCurrency: 'INR',
        fiscalYearStartMonth: 4,
      },
      USER_ID
    );

    expect(result).toEqual({
      id: 'returned-org-id',
      legalName: 'Acme Traders',
      tradeName: null,
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);

    // Context is set BEFORE any insert: RETURNING reads the new row back and
    // is subject to the SELECT policy, so `app.current_org_id` must already
    // equal the new org id when the row comes back. (Mocked here; the real
    // Postgres side is documented in the KNOWN TESTING GAP note above.)
    expect(mockTx.execute).toHaveBeenCalledTimes(1);
    const sqlJson = JSON.stringify(mockTx.execute.mock.calls[0][0]);
    expect(sqlJson).toContain('set_config');
    expect(sqlJson).toContain('app.current_org_id');
    expect(mockTx.execute.mock.invocationCallOrder[0]).toBeLessThan(
      mockTx.insert.mock.invocationCallOrder[0]
    );

    // Org insert: the id is pre-generated by the app (NOT the column's
    // gen_random_uuid() default), so it can be set into the context above.
    const orgValues = mockTx.values.mock.calls[0][0];
    expect(orgValues.id).toMatch(UUID_RE);
    expect(orgValues).toMatchObject({
      legalName: 'Acme Traders',
      tradeName: 'Acme',
      panNumber: 'AABCP1234E',
      defaultCurrency: 'INR',
      fiscalYearStartMonth: 4,
    });

    // Membership insert reuses the same pre-generated org id and has NO
    // `.returning()`, so it only needs the WITH CHECK (true) INSERT policy —
    // no SELECT-policy readback. Its organization_id matches the context set
    // above regardless.
    expect(mockTx.insert).toHaveBeenCalledTimes(2);
    expect(mockTx.values.mock.calls[1][0]).toEqual({
      organizationId: orgValues.id,
      userId: USER_ID,
      role: 'owner',
    });
  });

  it('applies default currency and FY start month at the DTO level when omitted', () => {
    const parsed = createOrganizationSchema.parse({ legalName: 'Acme Traders' });
    expect(parsed.defaultCurrency).toBe('INR');
    expect(parsed.fiscalYearStartMonth).toBe(4);
  });
});

describe('OrganizationsService.listGstins', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists the organization GSTINs, scoped by organizationId', async () => {
    const rows = [
      {
        id: 'gstin-1',
        gstin: '27AAACA1234A1Z5',
        branchName: 'Mumbai HQ',
        stateCode: '27',
        status: 'active',
      },
    ];
    const mockWhere = jest.fn().mockResolvedValue(rows);
    const mockTx = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({ where: mockWhere }),
      }),
    } as any;

    const service = new OrganizationsService();
    const result = await service.listGstins(mockTx, 'org-1');

    expect(result).toEqual(rows);
    expect(mockTx.select).toHaveBeenCalledTimes(1);
    expect(mockWhere).toHaveBeenCalledTimes(1);
  });
});