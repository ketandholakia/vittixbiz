jest.mock('../database/db', () => ({
  db: { transaction: jest.fn() },
}));

import { db } from '../database/db';
import { withTenantTransaction } from './tenant-transaction';

const mockTransaction = db.transaction as unknown as jest.Mock;

const ORG_UUID = '11111111-2222-3333-4444-555555555555';

/**
 * TESTS for withTenantTransaction — the RLS glue.
 *
 * Full RLS behavior (rows actually being filtered by the policy) requires a
 * running PostgreSQL instance with rls_and_checks.sql applied and
 * `app.current_org_id` enforced. Those are DB-backed integration tests, so
 * here we verify the glue contract against a mocked db.transaction instead:
 * the SET LOCAL statement runs FIRST in the transaction, the org id is
 * validated as a UUID (injection guard), and the transaction handle is passed
 * through to the caller.
 */
describe('withTenantTransaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs SET LOCAL with the org id BEFORE the caller fn', async () => {
    const order: string[] = [];
    const mockTx = {
      execute: jest.fn().mockImplementation(async () => {
        order.push('set-local');
      }),
    };
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb(mockTx)
    );
    const fn = jest.fn(async () => {
      order.push('fn');
      return 'done';
    });

    const result = await withTenantTransaction(ORG_UUID, fn);

    expect(result).toBe('done');
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockTx.execute).toHaveBeenCalledTimes(1);
    // The statement is parameterized: the org id arrives as a bound parameter
    // in the SQL object, not concatenated into the statement text.
    const sqlJson = JSON.stringify(mockTx.execute.mock.calls[0][0]);
    expect(sqlJson).toContain('SET LOCAL app.current_org_id');
    expect(sqlJson).toContain(ORG_UUID);
    expect(order).toEqual(['set-local', 'fn']);
  });

  it('passes the transaction handle to the caller fn', async () => {
    const mockTx = { execute: jest.fn().mockResolvedValue(undefined) };
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb(mockTx)
    );

    let seenTx: unknown;
    await withTenantTransaction(ORG_UUID, (tx) => {
      seenTx = tx;
      return Promise.resolve();
    });

    expect(seenTx).toBe(mockTx);
  });

  it('rejects a non-UUID organization id without opening a transaction', async () => {
    await expect(
      withTenantTransaction("'; DROP TABLE users; --", async () => 'x')
    ).rejects.toThrow(/not a UUID/i);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('propagates errors thrown by the caller fn', async () => {
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      await cb({ execute: jest.fn().mockResolvedValue(undefined) });
    });

    await expect(
      withTenantTransaction(ORG_UUID, async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
  });
});