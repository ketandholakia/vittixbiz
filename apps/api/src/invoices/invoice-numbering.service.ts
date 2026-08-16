import { and, eq, sql } from 'drizzle-orm';
import { invoiceNumberSequences } from '../database/schema';
import type { DbTransaction } from '../database/db'; 

export interface GetNextNumberInput {
  gstinId: string;
  financialYear: string;
  documentType: string;
  prefix: string;
}

export interface GetNextNumberResult {
  number: number;
  formatted: string;
}

export class InvoiceNumberingService {
  /**
   * Retrieves the next gapless sequential number and locks the sequence row 
   * for the duration of the provided database transaction.
   */
  static async getNextNumber(
    tx: DbTransaction,
    input: GetNextNumberInput
  ): Promise<GetNextNumberResult> {
    const { gstinId, financialYear, documentType, prefix } = input;

    // We must use an UPSERT with a row lock.
    // However, Drizzle UPSERT (onConflictDoUpdate) with returning acts atomically.
    // In PostgreSQL, INSERT ... ON CONFLICT DO UPDATE ... RETURNING locks the row automatically!

    const [updatedRow] = await tx
      .insert(invoiceNumberSequences)
      .values({
        gstinId,
        financialYear,
        documentType,
        prefix,
        lastNumber: 1, // Start at 1 if inserting fresh
      })
      .onConflictDoUpdate({
        target: [
          invoiceNumberSequences.gstinId,
          invoiceNumberSequences.financialYear,
          invoiceNumberSequences.documentType,
        ],
        set: {
          lastNumber: sql`${invoiceNumberSequences.lastNumber} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning({ lastNumber: invoiceNumberSequences.lastNumber });

    const number = updatedRow.lastNumber;
    // Format zero-padded (e.g. 5 digits)
    const paddedNumber = String(number).padStart(5, '0');
    const formatted = `${prefix}${paddedNumber}`;

    return {
      number,
      formatted,
    };
  }
}
