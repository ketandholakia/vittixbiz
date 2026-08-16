import { sql } from 'drizzle-orm';
import { db, DbTransaction } from './db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs `fn` inside a DB transaction with the tenant's RLS context active.
 *
 * Executes `SET LOCAL app.current_org_id = <organizationId>` BEFORE any other
 * query in the transaction, so the Phase 1 RLS policies in
 * rls_and_checks.sql (`current_setting('app.current_org_id', true)`) filter
 * every tenant-scoped table to this organization. `SET LOCAL` is scoped to the
 * transaction only, so pooled connections never leak one tenant's context to
 * another request.
 *
 * `organizationId` must be a UUID: this both validates the header before it is
 * used and (combined with drizzle's parameter binding) prevents a malformed
 * value from being injected into the `SET LOCAL` statement.
 */
export async function withTenantTransaction<T>(
  organizationId: string,
  fn: (tx: DbTransaction) => Promise<T>
): Promise<T> {
  if (!UUID_RE.test(organizationId)) {
    throw new Error(`Invalid organization id: "${organizationId}" is not a UUID.`);
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.current_org_id = ${organizationId}`);
    return fn(tx);
  });
}