import Decimal from 'decimal.js';
import { and, eq, inArray } from 'drizzle-orm';
import type { DbTransaction } from '../database/db';
import {
  customers,
  gstins,
  invoiceLineItems,
  invoices,
} from '../database/schema';

/**
 * GSTR-1 monthly return export.
 *
 * Currently shapes the B2B section only. The GSTN GSTR-1 JSON schema has
 * many more sections (B2CL, B2CS, CDNR, HSN summary, exports, etc.) — those
 * are out of scope here and left as documented TODOs rather than guessing
 * at field names.
 */
export class GstrExportService {
  static async generateGstr1Json(
    tx: DbTransaction,
    organizationId: string,
    gstinId: string,
    financialYear: string, // e.g. "2026-27"
    month: number // 1-12 calendar month within the financial year
  ): Promise<object> {
    // Financial years run Apr–Mar: months 4-12 fall in the FY start year,
    // months 1-3 in the following calendar year.
    const fyStart = Number(financialYear.slice(0, 4));
    if (Number.isNaN(fyStart) || month < 1 || month > 12) {
      throw new Error(`Invalid financialYear/month: ${financialYear}/${month}`);
    }
    const calYear = month >= 4 ? fyStart : fyStart + 1;

    const invoiceRows = await tx
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, organizationId),
          eq(invoices.gstinId, gstinId),
          eq(invoices.status, 'issued'),
          eq(invoices.financialYear, financialYear)
        )
      );

    const inPeriod = invoiceRows.filter((inv) => {
      const d = inv.invoiceDate;
      return d.getUTCFullYear() === calYear && d.getUTCMonth() + 1 === month;
    });

    const [gstin] = await tx
      .select()
      .from(gstins)
      .where(eq(gstins.id, gstinId));
    if (!gstin) {
      throw new Error(`GSTIN ${gstinId} not found.`);
    }

    const b2b: unknown[] = [];

    if (inPeriod.length === 0) {
      return {
        gstin: gstin.gstin,
        fp: this.taxPeriod(month, calYear),
        b2b,
      };
    }

    const customerIds = [...new Set(inPeriod.map((inv) => inv.customerId))];
    const invoiceIds = inPeriod.map((inv) => inv.id);

    const customerRows = await tx
      .select()
      .from(customers)
      .where(inArray(customers.id, customerIds));
    const lineRows = await tx
      .select()
      .from(invoiceLineItems)
      .where(inArray(invoiceLineItems.invoiceId, invoiceIds));

    const customerByKey = new Map(customerRows.map((c) => [c.id, c]));
    const linesByInvoice = new Map<string, typeof lineRows>();
    for (const line of lineRows) {
      const existing = linesByInvoice.get(line.invoiceId) ?? [];
      existing.push(line);
      linesByInvoice.set(line.invoiceId, existing);
    }

    for (const inv of inPeriod) {
      const customer = customerByKey.get(inv.customerId);
      if (!customer) {
        continue;
      }
      if (!customer.gstin) {
        // TODO: B2C supplies belong in the GSTR-1 B2CS (or doc_issue) section,
        // not B2B — not implemented yet.
        continue;
      }

      const lines = linesByInvoice.get(inv.id) ?? [];
      const itms = lines.map((line, index) => ({
        num: index + 1,
        itm_det: {
          txval: Number(line.taxableAmount),
          rt: new Decimal(line.cgstRate)
            .plus(line.sgstRate)
            .plus(line.igstRate)
            .toNumber(),
          iamt: Number(line.igstAmount),
          camt: Number(line.cgstAmount),
          samt: Number(line.sgstAmount),
          csamt: Number(line.cessAmount),
        },
      }));

      b2b.push({
        ctin: customer.gstin,
        // TODO: cfs should be 'Y' for e-commerce supplies; we don't track
        // e-commerce operators yet, so defaulting to 'N'.
        cfs: 'N',
        pos: customer.placeOfSupplyStateCode,
        inum: inv.invoiceNumber,
        idt: this.formatDate(inv.invoiceDate),
        val: Number(inv.totalAmount),
        itms,
      });
    }

    return {
      gstin: gstin.gstin,
      fp: this.taxPeriod(month, calYear),
      b2b,
    };
  }

  /** Tax period as MMYYYY, e.g. "072026". */
  private static taxPeriod(month: number, calYear: number): string {
    return `${month.toString().padStart(2, '0')}${calYear}`;
  }

  /** GSTR dates use DD-MM-YYYY. */
  private static formatDate(date: Date): string {
    const d = date.getUTCDate().toString().padStart(2, '0');
    const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    return `${d}-${m}-${date.getUTCFullYear()}`;
  }
}