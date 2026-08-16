# VittixBiz

VittixBiz is a fresh GST invoicing/accounting system for the Indian SMB market.

## Monorepo Structure

- **apps/api**: NestJS backend
- **apps/web**: Next.js frontend (placeholder for phase 2)
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

## Module Boundaries (API)
- **AuthModule**: Handles JWT authentication.
- **TenantModule**: Multi-tenant isolation (extracts `tenant_id` from JWT to scope queries).
- **LedgerModule**: Pure TS logic for double-entry bookkeeping (Journal Entries). Framework-agnostic.
- **InvoicesModule**: Gapless sequential numbering using DB row-locking, and invoice lifecycle.
- **TaxModule**: Logic for CGST/SGST/IGST splits.
- **GstnIntegrationModule**: Adapter pattern for E-invoice (IRN) generation via GSP APIs.
