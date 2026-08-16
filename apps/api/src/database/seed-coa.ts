import { chartOfAccounts } from './schema';
import type { DbTransaction } from './db';

/**
 * The chart-of-accounts codes InvoicesService.issueInvoice() assumes exist per
 * organization (see INVOICE_COA_CODES in invoices.service.ts). These are the
 * bare minimum for the invoice ledger posting to work; more accounts can be
 * added later for the full chart.
 */
export const SEED_COA_ACCOUNTS = [
  { code: '1200', name: 'Accounts Receivable', type: 'asset' },
  { code: '4000', name: 'Sales', type: 'income' },
  { code: '2610', name: 'Output CGST', type: 'liability' },
  { code: '2620', name: 'Output SGST', type: 'liability' },
  { code: '2630', name: 'Output IGST', type: 'liability' },
] as const;

/**
 * Seeds the system chart-of-accounts rows for an organization. Idempotent via
 * ON CONFLICT DO NOTHING against the (organization_id, code) unique index, so
 * re-running for an org that already has the accounts is a safe no-op.
 *
 * `isSystemAccount: true` marks these as seeded/non-deletable (see the column
 * comment in schema.ts). The caller is expected to have set `app.current_org_id`
 * already (e.g. OrganizationsService.create sets it to the new org's id before
 * inserting), so the chart_of_accounts INSERT policy accepts the rows.
 */
export async function seedChartOfAccounts(
  tx: DbTransaction,
  organizationId: string
): Promise<void> {
  await tx
    .insert(chartOfAccounts)
    .values(
      SEED_COA_ACCOUNTS.map((account) => ({
        organizationId,
        code: account.code,
        name: account.name,
        type: account.type,
        isSystemAccount: true,
      }))
    )
    .onConflictDoNothing({
      target: [chartOfAccounts.organizationId, chartOfAccounts.code],
    });
}