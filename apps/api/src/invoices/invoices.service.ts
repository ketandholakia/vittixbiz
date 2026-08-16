import { Money } from '@vittixbiz/shared-types';
import Decimal from 'decimal.js';
import { and, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm';
import type { DbTransaction } from '../database/db';
import {
  chartOfAccounts,
  customers,
  gstins,
  invoiceLineItems,
  invoices,
  taxRates,
} from '../database/schema';
import { InvoiceNumberingService } from './invoice-numbering.service';
import { LedgerPoster } from '../ledger/ledger-poster';
import { calculateGstSplit } from '../tax/tax-calculator';

export interface InvoiceLineItemInput {
  hsnSacCode: string;
  description: string;
  quantity: Decimal;
  unitPrice: Money;
  discountAmount: Money;
}

export interface CreateInvoiceInput {
  organizationId: string;
  gstinId: string;
  customerId: string;
  invoiceDate: Date;
  dueDate?: Date;
  notes?: string;
  createdByUserId?: string;
  lineItems: InvoiceLineItemInput[];
}

/**
 * Chart of Accounts codes the ledger posting assumes exist for each
 * organization (seeded alongside the Phase 1/2 system accounts). Adjust
 * these if the seed data uses different codes.
 */
export const INVOICE_COA_CODES = {
  accountsReceivable: '1200',
  sales: '4000',
  outputCgst: '2610',
  outputSgst: '2620',
  outputIgst: '2630',
} as const;

interface ComputedLineItem {
  hsnSacCode: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  taxableAmount: string;
  cgstRate: string;
  cgstAmount: string;
  sgstRate: string;
  sgstAmount: string;
  igstRate: string;
  igstAmount: string;
  cessRate: string;
  cessAmount: string;
  lineTotal: string;
}

export class InvoicesService {
  /** Indian financial year: April–March. Returns e.g. "2026-27". */
  static financialYearForDate(date: Date): string {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1; // 1-based
    const fyStart = month >= 4 ? year : year - 1;
    return `${fyStart}-${String(fyStart + 1).slice(-2)}`;
  }

  /**
   * Creates a draft invoice (with its line items) inside the caller-supplied
   * transaction. Composes the gapless invoice number, per-line GST split and
   * tax-rate lookup into one atomic unit. Ledger posting is deferred to
   * {@link issueInvoice} so drafts never touch the ledger.
   */
  static async createInvoice(
    tx: DbTransaction,
    input: CreateInvoiceInput
  ): Promise<{ invoiceId: string; invoiceNumber: string }> {
    if (!input.lineItems || input.lineItems.length === 0) {
      throw new Error('An invoice must have at least one line item.');
    }

    const [gstin] = await tx
      .select()
      .from(gstins)
      .where(eq(gstins.id, input.gstinId));
    if (!gstin) {
      throw new Error(`GSTIN ${input.gstinId} not found.`);
    }

    const [customer] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, input.customerId));
    if (!customer) {
      throw new Error(`Customer ${input.customerId} not found.`);
    }

    const financialYear = this.financialYearForDate(input.invoiceDate);

    let subtotal = new Decimal(0);
    let totalCgst = new Decimal(0);
    let totalSgst = new Decimal(0);
    let totalIgst = new Decimal(0);
    let totalCess = new Decimal(0);

    const computedLines: ComputedLineItem[] = [];

    for (const line of input.lineItems) {
      const rateRows = await tx
        .select()
        .from(taxRates)
        .where(
          and(
            eq(taxRates.hsnSacCode, line.hsnSacCode),
            lte(taxRates.effectiveFrom, input.invoiceDate),
            or(isNull(taxRates.effectiveTo), gt(taxRates.effectiveTo, input.invoiceDate))
          )
        );

      if (rateRows.length === 0) {
        throw new Error(
          `No applicable tax rate found for HSN/SAC ${line.hsnSacCode} on ${input.invoiceDate.toISOString()}.`
        );
      }

      // Most recent rate that was effective on the invoice date
      const rate = [...rateRows].sort(
        (a, b) =>
          new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime()
      )[0];

      const ratePercent = new Decimal(rate.ratePercent);
      const gross = new Decimal(line.unitPrice.toString()).times(line.quantity);
      const taxableAmount = gross.minus(new Decimal(line.discountAmount.toString()));

      const split = calculateGstSplit({
        taxableAmount: new Money(taxableAmount),
        hsnSacCode: line.hsnSacCode,
        supplierStateCode: gstin.stateCode,
        placeOfSupplyStateCode: customer.placeOfSupplyStateCode,
        ratePercent,
      });

      const intraState = gstin.stateCode === customer.placeOfSupplyStateCode;
      const cgstRate = intraState ? ratePercent.dividedBy(2) : new Decimal(0);
      const sgstRate = intraState ? ratePercent.dividedBy(2) : new Decimal(0);
      const igstRate = intraState ? new Decimal(0) : ratePercent;

      const cgstAmount = new Decimal(split.cgst.toString());
      const sgstAmount = new Decimal(split.sgst.toString());
      const igstAmount = new Decimal(split.igst.toString());
      const cessAmount = new Decimal(split.cess.toString());

      // NOTE: pre-existing gap — calculateGstSplit() (tax-calculator.ts)
      // does not yet accept a cessPercent input and always returns cess: 0.
      // cessRate below is read from tax_rates.cessPercent and persisted so
      // the schema/rollup is correct, but cessAmount/totalCess will stay 0
      // until that calculator supports cess. Not faking a workaround here.
      const cessRate = rate.cessPercent ? new Decimal(rate.cessPercent) : new Decimal(0);

      const lineTotal = taxableAmount
        .plus(cgstAmount)
        .plus(sgstAmount)
        .plus(igstAmount)
        .plus(cessAmount);

      subtotal = subtotal.plus(taxableAmount);
      totalCgst = totalCgst.plus(cgstAmount);
      totalSgst = totalSgst.plus(sgstAmount);
      totalIgst = totalIgst.plus(igstAmount);
      totalCess = totalCess.plus(cessAmount);

      computedLines.push({
        hsnSacCode: line.hsnSacCode,
        description: line.description,
        quantity: line.quantity.toString(),
        unitPrice: line.unitPrice.toString(),
        discountAmount: line.discountAmount.toString(),
        taxableAmount: taxableAmount.toFixed(2),
        cgstRate: cgstRate.toFixed(2),
        cgstAmount: cgstAmount.toFixed(2),
        sgstRate: sgstRate.toFixed(2),
        sgstAmount: sgstAmount.toFixed(2),
        igstRate: igstRate.toFixed(2),
        igstAmount: igstAmount.toFixed(2),
        cessRate: cessRate.toFixed(2),
        cessAmount: cessAmount.toFixed(2),
        lineTotal: lineTotal.toFixed(2),
      });
    }

    const totalAmount = subtotal
      .plus(totalCgst)
      .plus(totalSgst)
      .plus(totalIgst)
      .plus(totalCess);

    const { formatted: invoiceNumber } = await InvoiceNumberingService.getNextNumber(
      tx,
      {
        gstinId: input.gstinId,
        financialYear,
        documentType: 'invoice',
        prefix: '',
      }
    );

    const [invoice] = await tx
      .insert(invoices)
      .values({
        organizationId: input.organizationId,
        gstinId: input.gstinId,
        customerId: input.customerId,
        invoiceNumber,
        financialYear,
        invoiceDate: input.invoiceDate,
        dueDate: input.dueDate ?? null,
        status: 'draft',
        subtotal: subtotal.toFixed(2),
        totalCgst: totalCgst.toFixed(2),
        totalSgst: totalSgst.toFixed(2),
        totalIgst: totalIgst.toFixed(2),
        totalCess: totalCess.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        notes: input.notes ?? null,
        createdByUserId: input.createdByUserId ?? null,
      })
      .returning({ id: invoices.id });

    await tx.insert(invoiceLineItems).values(
      computedLines.map((line) => ({ ...line, invoiceId: invoice.id }))
    );

    return { invoiceId: invoice.id, invoiceNumber };
  }

  /**
   * Posts a draft invoice to the ledger and marks it 'issued'. Journal:
   *   Dr Accounts Receivable  totalAmount
   *   Cr Sales                subtotal
   *   Cr Output CGST/SGST/IGST taxes (only non-zero components)
   * The journal is balanced because totalAmount = subtotal + all taxes.
   */
  static async issueInvoice(
    tx: DbTransaction,
    invoiceId: string
  ): Promise<{ ledgerTransactionId: string }> {
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId));
    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found.`);
    }
    if (invoice.status === 'cancelled') {
      throw new Error(`Cancelled invoice ${invoiceId} cannot be issued.`);
    }
    if (invoice.status !== 'draft') {
      throw new Error(
        `Invoice ${invoiceId} is already '${invoice.status}'; only draft invoices can be issued.`
      );
    }

    const accountRows = await tx
      .select()
      .from(chartOfAccounts)
      .where(
        and(
          eq(chartOfAccounts.organizationId, invoice.organizationId),
          inArray(chartOfAccounts.code, Object.values(INVOICE_COA_CODES))
        )
      );

    const accountsByCode = new Map(accountRows.map((a) => [a.code, a.id]));
    const arAccountId = accountsByCode.get(INVOICE_COA_CODES.accountsReceivable);
    const salesAccountId = accountsByCode.get(INVOICE_COA_CODES.sales);
    const cgstAccountId = accountsByCode.get(INVOICE_COA_CODES.outputCgst);
    const sgstAccountId = accountsByCode.get(INVOICE_COA_CODES.outputSgst);
    const igstAccountId = accountsByCode.get(INVOICE_COA_CODES.outputIgst);

    if (
      !arAccountId ||
      !salesAccountId ||
      !cgstAccountId ||
      !sgstAccountId ||
      !igstAccountId
    ) {
      throw new Error(
        `Organization ${invoice.organizationId} is missing one of the assumed chart-of-accounts codes: ${JSON.stringify(INVOICE_COA_CODES)}.`
      );
    }

    const lines: {
      accountId: string;
      debit: Money | null;
      credit: Money | null;
    }[] = [
      {
        accountId: arAccountId,
        debit: new Money(invoice.totalAmount),
        credit: null,
      },
      { accountId: salesAccountId, debit: null, credit: new Money(invoice.subtotal) },
    ];

    const cgst = new Decimal(invoice.totalCgst);
    const sgst = new Decimal(invoice.totalSgst);
    const igst = new Decimal(invoice.totalIgst);

    if (cgst.gt(0)) {
      lines.push({
        accountId: cgstAccountId,
        debit: null,
        credit: new Money(invoice.totalCgst),
      });
    }
    if (sgst.gt(0)) {
      lines.push({
        accountId: sgstAccountId,
        debit: null,
        credit: new Money(invoice.totalSgst),
      });
    }
    if (igst.gt(0)) {
      lines.push({
        accountId: igstAccountId,
        debit: null,
        credit: new Money(invoice.totalIgst),
      });
    }

    const { transactionId: ledgerTransactionId } = await LedgerPoster.post(tx, {
      organizationId: invoice.organizationId,
      gstinId: invoice.gstinId,
      transactionDate: new Date(),
      sourceType: 'invoice',
      sourceId: invoice.id,
      narration: `Invoice ${invoice.invoiceNumber} issued`,
      createdByUserId: invoice.createdByUserId ?? undefined,
      lines,
    });

    await tx
      .update(invoices)
      .set({
        status: 'issued',
        ledgerTransactionId,
      })
      .where(eq(invoices.id, invoice.id));

    return { ledgerTransactionId };
  }
}