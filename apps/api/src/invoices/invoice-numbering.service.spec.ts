import { InvoiceNumberingService } from './invoice-numbering.service';

/**
 * CONCURRENCY TESTING STRATEGY:
 * 
 * To truly test the gapless, sequential nature of the Invoice Numbering Service under heavy concurrency,
 * we cannot simply mock the database connection in a pure unit test. The logic relies on PostgreSQL's
 * row-level locking (INSERT ... ON CONFLICT DO UPDATE ... RETURNING) to block concurrent transactions.
 * 
 * To test this against a real Postgres instance in an integration test suite:
 * 1. Setup an actual Postgres instance (e.g., via Docker or Testcontainers).
 * 2. Run the Drizzle migrations to create the schema.
 * 3. Seed an organization and a GSTIN.
 * 4. Use `Promise.all` to execute N concurrent calls (e.g., N=100) to `InvoiceNumberingService.getNextNumber()`.
 *    Each call MUST be wrapped in its own independent database transaction using the Drizzle ORM instance (`db.transaction(async tx => { ... })`).
 * 5. Collect the results and assert:
 *    - The length of unique numbers returned is exactly N.
 *    - The maximum number returned is exactly N (if starting from empty).
 *    - There are no missing numbers (gaps) in the sequence from 1 to N.
 */
describe('InvoiceNumberingService', () => {
  it('should format the invoice number correctly and start at 1', async () => {
    // Mock the Drizzle transaction behavior for an UPSERT
    const mockTx = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      onConflictDoUpdate: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ lastNumber: 1 }]),
    };

    const result = await InvoiceNumberingService.getNextNumber(mockTx as any, {
      gstinId: 'mock-gstin-id',
      financialYear: '2026-27',
      documentType: 'invoice',
      prefix: 'INV/2026-27/',
    });

    expect(result.number).toBe(1);
    expect(result.formatted).toBe('INV/2026-27/00001');
  });

  it('should format subsequent numbers correctly', async () => {
    // Mock the Drizzle transaction behavior for an UPSERT
    const mockTx = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      onConflictDoUpdate: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ lastNumber: 42 }]),
    };

    const result = await InvoiceNumberingService.getNextNumber(mockTx as any, {
      gstinId: 'mock-gstin-id',
      financialYear: '2026-27',
      documentType: 'invoice',
      prefix: 'INV/2026-27/',
    });

    expect(result.number).toBe(42);
    expect(result.formatted).toBe('INV/2026-27/00042');
  });
});
