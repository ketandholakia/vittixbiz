# VittixBiz

VittixBiz is a fresh GST invoicing/accounting system for the Indian SMB market.

## Monorepo Structure

- **apps/api**: NestJS backend
- **apps/web**: Next.js 15 frontend (App Router, Tailwind CSS, Zod forms)
- **packages/shared-types**: Shared Zod schemas, TypeScript interfaces, and Money utilities.
- **packages/config**: Shared configurations (ESLint, TSConfig).

## Tech Stack
- Backend: NestJS (TypeScript)
- Database: PostgreSQL 16+
- ORM: Drizzle ORM
- Money Handling: `Money` value type wrapping `decimal.js`
- Validation: Zod

## Setup

1. Make sure you have `pnpm` installed.
2. Run `pnpm install` in the root directory.
   - In network-restricted environments (CI, sandboxes), Puppeteer's
     postinstall tries to download Chromium and fails — run
     `PUPPETEER_SKIP_DOWNLOAD=true pnpm install` instead. If the API needs to
     render PDFs at runtime, install Chromium separately first
     (`npx puppeteer browsers install chrome`) or point
     `PUPPETEER_EXECUTABLE_PATH` at a system Chromium binary.
3. Configure your `DATABASE_URL` in `.env` (default is `postgres://postgres:postgres@localhost:5432/vittixbiz`).
4. Apply database migrations:
   ```bash
   cd apps/api
   pnpm db:generate
   pnpm db:push
   ```
5. Start the API server:
   ```bash
   cd apps/api
   pnpm start:dev
   ```

## Web (apps/web)

Next.js 15 (App Router) + Tailwind CSS + Zod. Talks to the NestJS API via a
typed fetch client (`src/lib/api-client.ts`).

```bash
cd apps/web
cp .env.example .env.local   # set NEXT_PUBLIC_API_URL, NEXT_PUBLIC_ORG_ID, NEXT_PUBLIC_GSTIN_ID
pnpm dev
```

Build check: `pnpm --filter web build`.

## Known Gaps (Web)

- **JWT in `localStorage`**: the access token is stored client-side
  (`localStorage`) so XSS can read it. This is a starting point only; before
  real deployment it must move to an httpOnly cookie set by a Server Action.
- **Org id from env**: there is no "list my organizations" endpoint yet, so
  `NEXT_PUBLIC_ORG_ID` supplies the tenant id. Replace with a real membership
  selector once the backend exposes it.
- **GSTIN id from env**: there is no list-GSTINs endpoint yet, so
  `NEXT_PUBLIC_GSTIN_ID` supplies the issuing branch for invoice creation.
  Replace with a real branch selector once the backend exposes org GSTINs.
- **No chart-of-accounts / GSTIN management UI yet** — blocked on the backend
  seed/creation work that is still pending.

## Security — Tenant Isolation (RLS)

Multi-tenant isolation is enforced at the database layer via Row-Level
Security. Every tenant-scoped table is `ENABLE`d **and** `FORCE`d ROW LEVEL
SECURITY, and the request lifecycle sets `app.current_org_id` inside each
transaction (`withTenantTransaction` in `apps/api/src/database/`) so the RLS
policies in `apps/api/src/database/rls_and_checks.sql` filter all rows to the
current tenant.

Three things must hold for this to actually protect data in deployment:

1. **The runtime `DATABASE_URL` role must NOT be a superuser.** Postgres
   bypasses RLS for superusers (and, without `FORCE`, for the table owner).
   `FORCE ROW LEVEL SECURITY` closes the owner-bypass gap, but superusers
   still see everything regardless — there is no way around that in Postgres.
2. **Don't use the `postgres` superuser default in production.** The default
   connection string in `.env.example` is fine for local dev only.
3. **Defense in depth:** run migrations as one role and the application as a
   separate, more restricted non-superuser role. `FORCE RLS` alone closes the
   owner-bypass gap even if both are the same role; the split is extra
   hardening.

## Module Boundaries (API)
- **AuthModule**: Handles JWT authentication.
- **TenantModule**: Multi-tenant isolation (extracts `tenant_id` from JWT to scope queries).
- **LedgerModule**: Pure TS logic for double-entry bookkeeping (Journal Entries). Framework-agnostic.
- **InvoicesModule**: Gapless sequential numbering using DB row-locking, and invoice lifecycle.
- **TaxModule**: Logic for CGST/SGST/IGST splits.
- **GstnIntegrationModule**: Adapter pattern for E-invoice (IRN) generation via GSP APIs.
