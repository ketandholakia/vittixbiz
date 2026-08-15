import { LedgerPoster, UnbalancedJournalError, InvalidJournalLineError } from './ledger-poster';
import { Money } from '@vittixbiz/shared-types';

describe('LedgerPoster', () => {
  let mockTx: any;

  beforeEach(() => {
    mockTx = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ id: 'mock-tx-id' }]),
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
    };
  });

  it('should accept a balanced journal', async () => {
    const result = await LedgerPoster.post(mockTx, {
      organizationId: 'org-1',
      transactionDate: new Date(),
      sourceType: 'manual_journal',
      lines: [
        { accountId: 'acc-1', debit: new Money('100.50'), credit: null },
        { accountId: 'acc-2', debit: null, credit: new Money('100.50') },
      ],
    });

    expect(result.transactionId).toBe('mock-tx-id');
    expect(mockTx.insert).toHaveBeenCalledTimes(2); // transactions, then entries
  });

  it('should reject an unbalanced journal', async () => {
    await expect(
      LedgerPoster.post(mockTx, {
        organizationId: 'org-1',
        transactionDate: new Date(),
        sourceType: 'manual_journal',
        lines: [
          { accountId: 'acc-1', debit: new Money('100.50'), credit: null },
          { accountId: 'acc-2', debit: null, credit: new Money('100.00') },
        ],
      })
    ).rejects.toThrow(UnbalancedJournalError);
  });

  it('should reject a journal with less than two lines', async () => {
    await expect(
      LedgerPoster.post(mockTx, {
        organizationId: 'org-1',
        transactionDate: new Date(),
        sourceType: 'manual_journal',
        lines: [
          { accountId: 'acc-1', debit: new Money('100.50'), credit: null },
        ],
      })
    ).rejects.toThrow(InvalidJournalLineError);
  });

  it('should reject a line with both debit and credit set', async () => {
    await expect(
      LedgerPoster.post(mockTx, {
        organizationId: 'org-1',
        transactionDate: new Date(),
        sourceType: 'manual_journal',
        lines: [
          { accountId: 'acc-1', debit: new Money('100.50'), credit: new Money('100.50') },
          { accountId: 'acc-2', debit: null, credit: new Money('100.50') },
        ],
      })
    ).rejects.toThrow(InvalidJournalLineError);
  });

  it('should reverse a transaction correctly by flipping amounts', async () => {
    // Mock original rows for reversal
    mockTx.where.mockResolvedValueOnce([
      { id: 'orig-tx-id', organizationId: 'org-1', gstinId: null, sourceId: null },
    ]).mockResolvedValueOnce([
      { accountId: 'acc-1', debitAmount: '100.50', creditAmount: '0.00' },
      { accountId: 'acc-2', debitAmount: '0.00', creditAmount: '100.50' },
    ]);

    const result = await LedgerPoster.reverse(mockTx, 'orig-tx-id', 'Reversal narration');

    expect(result.transactionId).toBe('mock-tx-id'); // Returns the new tx ID
    // 1st insert is the transactions, 2nd insert is the entries, 3rd is the update
    
    // Check what was passed to values on the 2nd insert (entries)
    const entriesValues = mockTx.values.mock.calls[1][0];
    expect(entriesValues[0].debitAmount).toBe('0');
    expect(entriesValues[0].creditAmount).toBe('100.50');
    expect(entriesValues[1].debitAmount).toBe('100.50');
    expect(entriesValues[1].creditAmount).toBe('0');
  });
});
