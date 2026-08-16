import { Money } from '@vittixbiz/shared-types';
import Decimal from 'decimal.js';
import { InvoicesService } from './invoices.service';
import { UnbalancedJournalError } from '../ledger/ledger-poster';

function createMockTx() {
  const mockTx = {
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    onConflictDoUpdate: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([]),
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
  };
  return mockTx as any;
}

const taxRateRow = {
  hsnSacCode: '9983',
  ratePercent: '18.00',
  cessPercent: null,
  effectiveFrom: new Date('2026-01-01T00:00:00Z'),
  effectiveTo: null,
};

const gstinRow = { id: 'gstin-1', stateCode: '27' };
const customerIntraRow = { id: 'cust-1', placeOfSupplyStateCode: '27' };
const customerInterRow = { id: 'cust-2', placeOfSupplyStateCode: '08' };

describe('InvoicesService.createInvoice', () => {
  it('computes single line item invoice math correctly (intra-state 18%)', async () => {
    const mockTx = createMockTx();
    mockTx.where
      .mockResolvedValueOnce([gstinRow])
      .mockResolvedValueOnce([customerIntraRow])
      .mockResolvedValueOnce([taxRateRow]);
    mockTx.returning
      .mockResolvedValueOnce([{ lastNumber: 1 }])
      .mockResolvedValueOnce([{ id: 'invoice-id-1' }]);

    const result = await InvoicesService.createInvoice(mockTx, {
      organizationId: 'org-1',
      gstinId: 'gstin-1',
      customerId: 'cust-1',
      invoiceDate: new Date('2026-07-01T00:00:00Z'),
      lineItems: [
        {
          hsnSacCode: '9983',
          description: 'Consulting',
          quantity: new Decimal('2'),
          unitPrice: new Money('100.00'),
          discountAmount: new Money('0.00'),
        },
      ],
    });

    expect(result.invoiceNumber).toBe('00001');

    const invoiceValues = mockTx.values.mock.calls[1][0];
    expect(invoiceValues.status).toBe('draft');
    expect(invoiceValues.invoiceNumber).toBe('00001');
    expect(invoiceValues.financialYear).toBe('2026-27');
    expect(invoiceValues.subtotal).toBe('200.00');
    expect(invoiceValues.totalCgst).toBe('18.00');
    expect(invoiceValues.totalSgst).toBe('18.00');
    expect(invoiceValues.totalIgst).toBe('0.00');
    expect(invoiceValues.totalAmount).toBe('236.00');

    const lineValues = mockTx.values.mock.calls[2][0];
    expect(lineValues).toHaveLength(1);
    expect(lineValues[0].invoiceId).toBe('invoice-id-1');
    expect(lineValues[0].taxableAmount).toBe('200.00');
    expect(lineValues[0].cgstAmount).toBe('18.00');
    expect(lineValues[0].sgstAmount).toBe('18.00');
    expect(lineValues[0].lineTotal).toBe('236.00');
  });

  it('sums multiple line items into the invoice totals correctly', async () => {
    const mockTx = createMockTx();
    mockTx.where
      .mockResolvedValueOnce([gstinRow])
      .mockResolvedValueOnce([customerIntraRow])
      .mockResolvedValueOnce([taxRateRow])
      .mockResolvedValueOnce([taxRateRow]);
    mockTx.returning
      .mockResolvedValueOnce([{ lastNumber: 7 }])
      .mockResolvedValueOnce([{ id: 'invoice-id-2' }]);

    const result = await InvoicesService.createInvoice(mockTx, {
      organizationId: 'org-1',
      gstinId: 'gstin-1',
      customerId: 'cust-1',
      invoiceDate: new Date('2026-07-01T00:00:00Z'),
      lineItems: [
        {
          hsnSacCode: '9983',
          description: 'Line A',
          quantity: new Decimal('1'),
          unitPrice: new Money('100.00'),
          discountAmount: new Money('0.00'),
        },
        {
          hsnSacCode: '9983',
          description: 'Line B',
          quantity: new Decimal('1'),
          unitPrice: new Money('100.00'),
          discountAmount: new Money('0.00'),
        },
      ],
    });

    expect(result.invoiceNumber).toBe('00007');

    const invoiceValues = mockTx.values.mock.calls[1][0];
    expect(invoiceValues.subtotal).toBe('200.00');
    expect(invoiceValues.totalCgst).toBe('18.00');
    expect(invoiceValues.totalSgst).toBe('18.00');
    expect(invoiceValues.totalAmount).toBe('236.00');

    const lineValues = mockTx.values.mock.calls[2][0];
    expect(lineValues).toHaveLength(2);
    expect(lineValues[0].lineTotal).toBe('118.00');
    expect(lineValues[1].lineTotal).toBe('118.00');
  });

  it('reduces taxable amount by the discount', async () => {
    const mockTx = createMockTx();
    mockTx.where
      .mockResolvedValueOnce([gstinRow])
      .mockResolvedValueOnce([customerIntraRow])
      .mockResolvedValueOnce([taxRateRow]);
    mockTx.returning
      .mockResolvedValueOnce([{ lastNumber: 3 }])
      .mockResolvedValueOnce([{ id: 'invoice-id-3' }]);

    await InvoicesService.createInvoice(mockTx, {
      organizationId: 'org-1',
      gstinId: 'gstin-1',
      customerId: 'cust-1',
      invoiceDate: new Date('2026-07-01T00:00:00Z'),
      lineItems: [
        {
          hsnSacCode: '9983',
          description: 'Consulting with discount',
          quantity: new Decimal('2'),
          unitPrice: new Money('100.00'),
          discountAmount: new Money('50.00'),
        },
      ],
    });

    const invoiceValues = mockTx.values.mock.calls[1][0];
    const lineValues = mockTx.values.mock.calls[2][0];

    expect(invoiceValues.subtotal).toBe('150.00');
    expect(invoiceValues.totalCgst).toBe('13.50');
    expect(invoiceValues.totalSgst).toBe('13.50');
    expect(invoiceValues.totalAmount).toBe('177.00');
    expect(lineValues[0].taxableAmount).toBe('150.00');
    expect(lineValues[0].lineTotal).toBe('177.00');
  });

  it('uses full IGST for inter-state supplies', async () => {
    const mockTx = createMockTx();
    mockTx.where
      .mockResolvedValueOnce([gstinRow])
      .mockResolvedValueOnce([customerInterRow])
      .mockResolvedValueOnce([taxRateRow]);
    mockTx.returning
      .mockResolvedValueOnce([{ lastNumber: 4 }])
      .mockResolvedValueOnce([{ id: 'invoice-id-4' }]);

    await InvoicesService.createInvoice(mockTx, {
      organizationId: 'org-1',
      gstinId: 'gstin-1',
      customerId: 'cust-2',
      invoiceDate: new Date('2026-07-01T00:00:00Z'),
      lineItems: [
        {
          hsnSacCode: '9983',
          description: 'Inter-state service',
          quantity: new Decimal('1'),
          unitPrice: new Money('100.00'),
          discountAmount: new Money('0.00'),
        },
      ],
    });

    const invoiceValues = mockTx.values.mock.calls[1][0];
    const lineValues = mockTx.values.mock.calls[2][0];

    expect(invoiceValues.subtotal).toBe('100.00');
    expect(invoiceValues.totalCgst).toBe('0.00');
    expect(invoiceValues.totalSgst).toBe('0.00');
    expect(invoiceValues.totalIgst).toBe('18.00');
    expect(invoiceValues.totalAmount).toBe('118.00');
    expect(lineValues[0].igstAmount).toBe('18.00');
    expect(lineValues[0].lineTotal).toBe('118.00');
  });

  it('applies cess to line items and rolls it into the invoice totals', async () => {
    // A cess-bearing HSN/SAC (e.g. tobacco, luxury goods).
    const cessTaxRateRow = {
      ...taxRateRow,
      cessPercent: '10.00',
    };

    const mockTx = createMockTx();
    mockTx.where
      .mockResolvedValueOnce([gstinRow])
      .mockResolvedValueOnce([customerIntraRow])
      .mockResolvedValueOnce([cessTaxRateRow]);
    mockTx.returning
      .mockResolvedValueOnce([{ lastNumber: 5 }])
      .mockResolvedValueOnce([{ id: 'invoice-id-5' }]);

    await InvoicesService.createInvoice(mockTx, {
      organizationId: 'org-1',
      gstinId: 'gstin-1',
      customerId: 'cust-1',
      invoiceDate: new Date('2026-07-01T00:00:00Z'),
      lineItems: [
        {
          hsnSacCode: '9983',
          description: 'Cess-bearing goods',
          quantity: new Decimal('1'),
          unitPrice: new Money('100.00'),
          discountAmount: new Money('0.00'),
        },
      ],
    });

    const invoiceValues = mockTx.values.mock.calls[1][0];
    const lineValues = mockTx.values.mock.calls[2][0];

    // cessRate and cessAmount are both derived from tax_rates.cess_percent
    expect(lineValues[0].cessRate).toBe('10.00');
    expect(lineValues[0].cessAmount).toBe('10.00');
    expect(lineValues[0].lineTotal).toBe('128.00');

    expect(invoiceValues.subtotal).toBe('100.00');
    expect(invoiceValues.totalCgst).toBe('9.00');
    expect(invoiceValues.totalSgst).toBe('9.00');
    expect(invoiceValues.totalIgst).toBe('0.00');
    expect(invoiceValues.totalCess).toBe('10.00');
    // totalAmount reconciles: subtotal + cgst + sgst + igst + cess
    expect(invoiceValues.totalAmount).toBe('128.00');
  });

  it('throws when no tax rate is effective for the invoice date', async () => {
    const mockTx = createMockTx();
    mockTx.where
      .mockResolvedValueOnce([gstinRow])
      .mockResolvedValueOnce([customerIntraRow])
      .mockResolvedValueOnce([]);

    await expect(
      InvoicesService.createInvoice(mockTx, {
        organizationId: 'org-1',
        gstinId: 'gstin-1',
        customerId: 'cust-1',
        invoiceDate: new Date('2026-07-01T00:00:00Z'),
        lineItems: [
          {
            hsnSacCode: '9983',
            description: 'No rate',
            quantity: new Decimal('1'),
            unitPrice: new Money('100.00'),
            discountAmount: new Money('0.00'),
          },
        ],
      })
    ).rejects.toThrow('No applicable tax rate found for HSN/SAC 9983');
  });
});

describe('InvoicesService.issueInvoice', () => {
  it('posts a balanced journal and marks the invoice issued', async () => {
    const mockTx = createMockTx();

    const invoiceRow = {
      id: 'inv-1',
      organizationId: 'org-1',
      gstinId: 'gstin-1',
      invoiceNumber: '00001',
      status: 'draft',
      subtotal: '100.00',
      totalCgst: '9.00',
      totalSgst: '9.00',
      totalIgst: '0.00',
      totalAmount: '118.00',
      createdByUserId: null,
    };

    const accountRows = [
      { code: '1200', id: 'acc-ar' },
      { code: '4000', id: 'acc-sales' },
      { code: '2610', id: 'acc-cgst' },
      { code: '2620', id: 'acc-sgst' },
      { code: '2630', id: 'acc-igst' },
    ];

    mockTx.where
      .mockResolvedValueOnce([invoiceRow])
      .mockResolvedValueOnce(accountRows);
    mockTx.returning.mockResolvedValueOnce([{ id: 'ledger-txn-id-1' }]);

    const result = await InvoicesService.issueInvoice(mockTx, 'inv-1');

    expect(result.ledgerTransactionId).toBe('ledger-txn-id-1');

    // LedgerPoster.post was invoked with a balanced journal: the entries it
    // built must have equal total debits and credits (LedgerPoster itself
    // would have thrown UnbalancedJournalError otherwise).
    const entriesValues = mockTx.values.mock.calls[1][0];
    expect(entriesValues).toHaveLength(4);

    let totalDebit = new Decimal(0);
    let totalCredit = new Decimal(0);
    for (const entry of entriesValues) {
      totalDebit = totalDebit.plus(entry.debitAmount);
      totalCredit = totalCredit.plus(entry.creditAmount);
    }
    expect(totalDebit.equals(totalCredit)).toBe(true);
    expect(totalDebit.toFixed(2)).toBe('118.00');

    expect(mockTx.set).toHaveBeenCalledWith({
      status: 'issued',
      ledgerTransactionId: 'ledger-txn-id-1',
    });
  });

  it('throws UnbalancedJournalError if the journal would not balance', async () => {
    const mockTx = createMockTx();

    // totalAmount does NOT reconcile with subtotal + taxes
    const invoiceRow = {
      id: 'inv-2',
      organizationId: 'org-1',
      gstinId: 'gstin-1',
      invoiceNumber: '00002',
      status: 'draft',
      subtotal: '100.00',
      totalCgst: '9.00',
      totalSgst: '9.00',
      totalIgst: '0.00',
      totalAmount: '999.00',
      createdByUserId: null,
    };

    const accountRows = [
      { code: '1200', id: 'acc-ar' },
      { code: '4000', id: 'acc-sales' },
      { code: '2610', id: 'acc-cgst' },
      { code: '2620', id: 'acc-sgst' },
      { code: '2630', id: 'acc-igst' },
    ];

    mockTx.where
      .mockResolvedValueOnce([invoiceRow])
      .mockResolvedValueOnce(accountRows);
    mockTx.returning.mockResolvedValueOnce([{ id: 'ledger-txn-id-2' }]);

    await expect(InvoicesService.issueInvoice(mockTx, 'inv-2')).rejects.toThrow(
      UnbalancedJournalError
    );
  });
});