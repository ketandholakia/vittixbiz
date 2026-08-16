import { sql } from 'drizzle-orm';
import { db, DbTransaction } from './db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs `fn` inside a DB transaction with the tenant's RLS context active.
 *
 * We set the tenant via `set_config('app.current_org_id', <organizationId>,
 * true)` BEFORE any other query in the transaction, so the Phase 1 RLS
 * policies in rls_and_checks.sql (`current_setting('app.current_org_id',
 * true)`) filter every tenant-scoped table to this organization.
 *
 * Why `set_config` and NOT `SET LOCAL app.current_org_id = ...`? PostgreSQL's
 * `SET`/`SET LOCAL` grammar only accepts a literal as its value — a driver
 * bind parameter ($1) is a syntax error there. Drizzle's `sql` tag always
 * binds interpolated values as parameters, so `sql`SET LOCAL ... = ${id}``
 * compiles to `SET LOCAL ... = $1` and throws on a real connection.
 * `set_config` is an ordinary SQL function, so it accepts normal parameter
 * binding while the `true` third argument (is_local) gives the exact same
 * transaction-scoped semantics as `SET LOCAL`. This matters: a session-scoped
 * set would leak one tenant's context across pooled connections to another
 * request, and the context must apply to the whole transaction, including the
 * membership check in TenantContextGuard.
 *
 * `organizationId` must be a UUID: this both validates it before use and
 * (combined with parameter binding) prevents a malformed value from being
 * injected into the `set_config` call.
 */
export async function withTenantTransaction<T>(
  organizationId: string,
  fn: (tx: DbTransaction) => Promise<T>
): Promise<T> {
  if (!UUID_RE.test(organizationId)) {
    throw new Error(`Invalid organization id: "${organizationId}" is not a UUID.`);
  }
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.current_org_id', ${organizationId}, true)`
    );
    return fn(tx);
  });
}