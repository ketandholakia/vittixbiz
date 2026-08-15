import { and, eq } from 'drizzle-orm';
import { invoiceNumberSequences } from '../database/schema';
import { PgTransaction } from 'drizzle-orm/pg-core';
// Drizzle transaction type can vary based on driver (node-postgres, postgres.js, etc.)
// For pg, we can define a generic type alias that extracts the transaction type.
// But we can also use any for now or a generic T extends PgTransaction<any, any, any>.
export type DbTransaction = any; 

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
          lastNumber: tx.sql`${invoiceNumberSequences.lastNumber} + 1`,
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
