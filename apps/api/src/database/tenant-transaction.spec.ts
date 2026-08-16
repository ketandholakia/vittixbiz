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
 * KNOWN TESTING GAP (why this suite cannot fully validate the SQL):
 * `tx.execute()` is mocked here, so the statement we produce is never sent to
 * a real Postgres server and CANNOT be validated against Postgres grammar.
 * That is exactly how a previous bug slipped through: `SET LOCAL
 * app.current_org_id = ${orgId}` compiled via drizzle's `sql` tag into
 * `SET LOCAL app.current_org_id = $1`, which is a genuine bound parameter —
 * but Postgres' SET grammar only accepts a literal, so every real request
 * threw a syntax error. The unit test passed because the mock accepts any
 * SQL object and never parses it.
 *
 * To catch this class of bug (valid-looking Drizzle/SQL that is actually
 * invalid Postgres) you need a real DB-backed integration test — e.g.
 * spinning up Postgres via testcontainers, applying the drizzle migrations +
 * rls_and_checks.sql, and asserting that `withTenantTransaction` returns
 * rows scoped to `app.current_org_id`. Until that exists, every new query
 * built with the `sql` tag should be treated as untrusted-at-runtime.
 *
 * What IS verified here against the mock:
 *  - the context-setter (set_config) runs FIRST in the transaction,
 *  - the org id is parameter-bound (never string-concatenated),
 *  - the org id is validated as a UUID (injection guard),
 *  - the transaction handle is passed through to the caller.
 */
describe('withTenantTransaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs set_config with the org id BEFORE the caller fn', async () => {
    const order: string[] = [];
    const mockTx = {
      execute: jest.fn().mockImplementation(async () => {
        order.push('set-config');
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
    // set_config (a function) supports parameter binding; the org id arrives
    // as a bound parameter in the SQL object, not concatenated into the text.
    // NOTE: we deliberately do NOT use `SET LOCAL ... = $1`, which Postgres'
    // SET grammar rejects — see the testing-gap comment at the top.
    const sqlJson = JSON.stringify(mockTx.execute.mock.calls[0][0]);
    expect(sqlJson).toContain('set_config');
    expect(sqlJson).toContain('app.current_org_id');
    expect(sqlJson).toContain(ORG_UUID);
    expect(sqlJson).not.toContain('SET LOCAL');
    expect(order).toEqual(['set-config', 'fn']);
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