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

/**
 * TESTS for OrganizationsService — the org discovery/creation boundary.
 *
 * listForUser and create deliberately use the global db (not a tenant tx):
 * they are how tenancy is resolved in the first place, so there is no org
 * context to scope to. listGstins receives the tx from withTenantTransaction
 * like every other tenant-scoped service method.
 */
describe('OrganizationsService.listForUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function stubListQuery(rows: unknown[]) {
    const mockWhere = jest.fn().mockResolvedValue(rows);
    db.select.mockReturnValue({
      from: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnValue({ where: mockWhere }),
      }),
    });
    return mockWhere;
  }

  it('returns the organizations the user belongs to, with role', async () => {
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
    const mockWhere = stubListQuery(rows);

    const service = new OrganizationsService();
    const result = await service.listForUser(USER_ID);

    expect(result).toEqual(rows);
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(mockWhere).toHaveBeenCalledTimes(1);
  });

  it('returns an empty list when the user has no memberships', async () => {
    stubListQuery([]);

    const service = new OrganizationsService();
    const result = await service.listForUser(USER_ID);

    expect(result).toEqual([]);
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

describe('OrganizationsService.create', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function stubTransaction() {
    const mockTx = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn(),
    };
    db.transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)
    );
    return mockTx;
  }

  it('creates the org and an owner membership in one transaction', async () => {
    const mockTx = stubTransaction();
    mockTx.returning.mockResolvedValueOnce([
      { id: 'org-1', legalName: 'Acme Traders', tradeName: null },
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
      id: 'org-1',
      legalName: 'Acme Traders',
      tradeName: null,
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);

    // Two inserts inside the tx: the org, then the creator's membership.
    expect(mockTx.insert).toHaveBeenCalledTimes(2);
    expect(mockTx.values.mock.calls[0][0]).toMatchObject({
      legalName: 'Acme Traders',
      tradeName: 'Acme',
      panNumber: 'AABCP1234E',
      defaultCurrency: 'INR',
      fiscalYearStartMonth: 4,
    });
    expect(mockTx.values.mock.calls[1][0]).toEqual({
      organizationId: 'org-1',
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