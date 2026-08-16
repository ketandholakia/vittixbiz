/**
 * One-time-per-environment DB setup: creates the restricted, NON-SUPERUSER
 * application role that the NestJS API must run as for RLS to actually isolate
 * tenants (superusers bypass RLS entirely — see rls_and_checks.sql), grants it
 * just enough access to the schema, and prints the resulting DATABASE_URL for
 * copying into the app's real .env.
 *
 * ⚠ THIS SCRIPT IS A DELIBERATE, MANUAL OPERATIONAL STEP. It must NOT be run as
 * part of `pnpm install`, app startup, CI, or any automated flow. It connects
 * as an ADMIN (superuser/owner) — exactly the privilege level the app itself
 * must never use — so running it against the wrong database, or automatically,
 * would be a real footgun. Run it once per environment, review its output, and
 * store the printed credentials in the environment's secret store.
 *
 * Usage (from apps/api):
 *   ADMIN_DATABASE_URL='postgres://postgres:postgres@localhost:5432/vittixbiz' \
 *   APP_DB_ROLE='vittixbiz_app' \
 *   APP_DB_PASSWORD='<optional; a strong one is generated + printed if omitted>' \
 *   pnpm db:setup-app-role
 *
 * Requires an env-visible ADMIN_DATABASE_URL (no value is hardcoded).
 * APP_DB_ROLE defaults to 'vittixbiz_app'. APP_DB_PASSWORD is optional:
 *   - role does NOT exist yet + no password given  → a strong random password
 *     is generated and printed ONCE (save it; it cannot be recovered later).
 *   - role already exists + no password given      → the existing password is
 *     left untouched (re-runs are idempotent) and the printed URL contains a
 *     placeholder to fill in.
 *
 * The script also runs ALTER DEFAULT PRIVILEGES so tables/sequences created by
 * future migrations are automatically usable by the app role. Note this only
 * affects objects created by the role running this statement — run it as the
 * same role that runs migrations (the admin role here).
 */
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';

const ADMIN_DATABASE_URL = process.env.ADMIN_DATABASE_URL;
const APP_DB_ROLE = (process.env.APP_DB_ROLE ?? 'vittixbiz_app').trim();
const APP_DB_PASSWORD = process.env.APP_DB_PASSWORD?.trim() || null;

const ROLE_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const PASSWORD_PLACEHOLDER = 'SET_PASSWORD_PLACEHOLDER';

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildConnectionUrl(
  role: string,
  password: string,
  adminUrl: string
): string {
  try {
    const url = new URL(adminUrl);
    const db = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const host = url.hostname || 'localhost';
    const port = url.port || '5432';
    return `${url.protocol}//${encodeURIComponent(role)}:${encodeURIComponent(password)}@${host}:${port}/${db}`;
  } catch {
    return `postgres://${encodeURIComponent(role)}:${encodeURIComponent(password)}@<host>:<port>/<database>`;
  }
}

async function main(): Promise<void> {
  if (!ADMIN_DATABASE_URL) {
    console.error(
      'ADMIN_DATABASE_URL is required (a superuser/owner connection; see apps/api/.env.example).'
    );
    process.exit(1);
  }
  if (!ROLE_NAME_RE.test(APP_DB_ROLE)) {
    console.error(
      `Invalid APP_DB_ROLE "${APP_DB_ROLE}" — must match ${ROLE_NAME_RE} (letters/digits/underscore, not starting with a digit).`
    );
    process.exit(1);
  }

  const client = new Client({ connectionString: ADMIN_DATABASE_URL });
  await client.connect();
  try {
    const dbRes = await client.query('SELECT current_database() AS db');
    const dbName: string = dbRes.rows[0].db;
    console.log(`Connected as admin to database "${dbName}".`);

    const roleExistsRes = await client.query(
      'SELECT 1 FROM pg_roles WHERE rolname = $1',
      [APP_DB_ROLE]
    );
    const roleExists = (roleExistsRes.rowCount ?? 0) > 0;

    let password = APP_DB_PASSWORD;
    let generatedPassword: string | null = null;

    if (!roleExists) {
      if (!password) {
        password = randomBytes(24).toString('base64url');
        generatedPassword = password;
        console.log(
          `Role "${APP_DB_ROLE}" does not exist and no APP_DB_PASSWORD was given — generated a random password.`
        );
      }
      await client.query(
        `CREATE ROLE ${quoteIdent(APP_DB_ROLE)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${quoteLiteral(password)}`
      );
      console.log(`Created role "${APP_DB_ROLE}".`);
    } else {
      const attrs = ['LOGIN', 'NOSUPERUSER', 'NOCREATEDB', 'NOCREATEROLE'];
      if (password) {
        attrs.push(`PASSWORD ${quoteLiteral(password)}`);
      }
      await client.query(
        `ALTER ROLE ${quoteIdent(APP_DB_ROLE)} WITH ${attrs.join(' ')}`
      );
      console.log(
        `Role "${APP_DB_ROLE}" already exists — ensured it is a plain LOGIN role${
          password ? ' and updated its password from APP_DB_PASSWORD' : ' (existing password left untouched)'
        }.`
      );
    }

    // Grants (idempotent — re-granting is a no-op).
    await client.query(
      `GRANT CONNECT ON DATABASE ${quoteIdent(dbName)} TO ${quoteIdent(APP_DB_ROLE)}`
    );
    await client.query(
      `GRANT USAGE ON SCHEMA public TO ${quoteIdent(APP_DB_ROLE)}`
    );
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${quoteIdent(APP_DB_ROLE)}`
    );
    await client.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${quoteIdent(APP_DB_ROLE)}`
    );
    console.log('Granted CONNECT/USAGE/DML on the current database and schema.');

    // Future objects: a later migration adding a table/sequence must not
    // silently leave the app role unable to use it.
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${quoteIdent(APP_DB_ROLE)}`
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${quoteIdent(APP_DB_ROLE)}`
    );
    console.log('Set ALTER DEFAULT PRIVILEGES so future migrations stay usable.');

    if (generatedPassword) {
      console.log(
        '\nGenerated password for this role — SAVE IT NOW, it will never be shown again:'
      );
      console.log(`  ${generatedPassword}`);
    }

    const finalPassword = password ?? PASSWORD_PLACEHOLDER;
    console.log(
      "\nCopy the following into the app's real .env as DATABASE_URL:"
    );
    console.log(
      `  ${buildConnectionUrl(APP_DB_ROLE, finalPassword, ADMIN_DATABASE_URL)}`
    );
    if (!password) {
      console.log(
        `  Replace ${PASSWORD_PLACEHOLDER} with the role password (set it via ALTER ROLE, or re-run with APP_DB_PASSWORD).`
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('db:setup-app-role failed:', err);
  process.exit(1);
});