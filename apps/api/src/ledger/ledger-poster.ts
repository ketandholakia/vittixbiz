import { Money } from '@vittixbiz/shared-types';
import { ledgerTransactions, ledgerEntries } from '../database/schema';
import Decimal from 'decimal.js';
import { eq } from 'drizzle-orm';

export type DbTransaction = any; // Representing a Drizzle transaction object

export class UnbalancedJournalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnbalancedJournalError';
  }
}

export class InvalidJournalLineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidJournalLineError';
  }
}

export interface JournalLineInput {
  accountId: string;
  debit: Money | null;
  credit: Money | null;
}

export interface PostJournalInput {
  organizationId: string;
  gstinId?: string;
  transactionDate: Date;
  sourceType: string;
  sourceId?: string;
  narration?: string;
  createdByUserId?: string;
  lines: JournalLineInput[];
}

export class LedgerPoster {
  /**
   * Validates and posts a double-entry journal within a caller-supplied transaction.
   */
  static async post(tx: DbTransaction, input: PostJournalInput): Promise<{ transactionId: string }> {
    if (!input.lines || input.lines.length < 2) {
      throw new InvalidJournalLineError('A journal entry must have at least two lines.');
    }

    let totalDebit = new Decimal(0);
    let totalCredit = new Decimal(0);

    for (const [index, line] of input.lines.entries()) {
      const hasDebit = line.debit !== null && line.debit !== undefined;
      const hasCredit = line.credit !== null && line.credit !== undefined;

      if (hasDebit && hasCredit) {
        throw new InvalidJournalLineError(`Line ${index} cannot have both debit and credit set.`);
      }

      if (!hasDebit && !hasCredit) {
        throw new InvalidJournalLineError(`Line ${index} must have either debit or credit set.`);
      }

      if (hasDebit) {
        const debitVal = new Decimal(line.debit!.toString());
        if (debitVal.lte(0)) throw new InvalidJournalLineError(`Line ${index} debit must be > 0.`);
        totalDebit = totalDebit.plus(debitVal);
      }

      if (hasCredit) {
        const creditVal = new Decimal(line.credit!.toString());
        if (creditVal.lte(0)) throw new InvalidJournalLineError(`Line ${index} credit must be > 0.`);
        totalCredit = totalCredit.plus(creditVal);
      }
    }

    if (!totalDebit.equals(totalCredit)) {
      throw new UnbalancedJournalError(`Journal is unbalanced. Debits: ${totalDebit.toString()}, Credits: ${totalCredit.toString()}`);
    }

    // Insert transaction
    const [txn] = await tx.insert(ledgerTransactions).values({
      organizationId: input.organizationId,
      gstinId: input.gstinId || null,
      transactionDate: input.transactionDate,
      sourceType: input.sourceType,
      sourceId: input.sourceId || null,
      narration: input.narration || null,
      createdByUserId: input.createdByUserId || null,
    }).returning({ id: ledgerTransactions.id });

    // Insert lines
    const entriesData = input.lines.map((line) => ({
      transactionId: txn.id,
      accountId: line.accountId,
      debitAmount: line.debit ? line.debit.toString() : '0',
      creditAmount: line.credit ? line.credit.toString() : '0',
    }));

    await tx.insert(ledgerEntries).values(entriesData);

    return { transactionId: txn.id };
  }

  /**
   * Reverses an existing transaction by creating a new one with flipped debits and credits.
   * Original rows are never mutated or deleted.
   */
  static async reverse(tx: DbTransaction, transactionId: string, narration: string, createdByUserId?: string): Promise<{ transactionId: string }> {
    // 1. Fetch original transaction
    const originalTxnRows = await tx.select().from(ledgerTransactions).where(
      eq(ledgerTransactions.id, transactionId)
    );

    if (originalTxnRows.length === 0) {
      throw new Error(`Original transaction ${transactionId} not found.`);
    }

    const originalTxn = originalTxnRows[0];

    // 2. Fetch original lines
    const originalEntries = await tx.select().from(ledgerEntries).where(
      eq(ledgerEntries.transactionId, transactionId)
    );

    if (originalEntries.length === 0) {
      throw new Error(`Original entries for transaction ${transactionId} not found.`);
    }

    // 3. Build reversed lines
    const reversedLines: JournalLineInput[] = originalEntries.map((entry: any) => {
      const originalDebit = new Decimal(entry.debitAmount);
      const originalCredit = new Decimal(entry.creditAmount);

      return {
        accountId: entry.accountId,
        // Flip debit and credit
        debit: originalCredit.gt(0) ? new Money(originalCredit.toString()) : null,
        credit: originalDebit.gt(0) ? new Money(originalDebit.toString()) : null,
      };
    });

    // 4. Create new input
    const input: PostJournalInput = {
      organizationId: originalTxn.organizationId,
      gstinId: originalTxn.gstinId,
      transactionDate: new Date(), // Reversal happens now
      sourceType: 'reversal',
      sourceId: originalTxn.sourceId, // Link to same source doc if applicable
      narration: narration,
      createdByUserId: createdByUserId,
      lines: reversedLines,
    };

    // 5. Post the new transaction
    const { transactionId: newTxnId } = await this.post(tx, input);

    // 6. Update the new transaction with reversal linkage
    await tx.update(ledgerTransactions).set({
      reversalOfTransactionId: originalTxn.id,
    }).where(
      eq(ledgerTransactions.id, newTxnId)
    );

    return { transactionId: newTxnId };
  }
}
