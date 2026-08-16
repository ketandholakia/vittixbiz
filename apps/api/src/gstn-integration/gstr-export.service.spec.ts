jest.mock('../database/db', () => {
  const mockDb = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue([]),
  };
  return { db: mockDb };
});

import { db } from '../database/db';
import { GstrExportService } from './gstr-export.service';

const gstinRow = { id: 'gstin-1', gstin: '27AACCM0000A1Z1' };

const invoiceA = {
  id: 'inv-a',
  organizationId: 'org-1',
  gstinId: 'gstin-1',
  customerId: 'cust-a',
  invoiceNumber: '00001',
  financialYear: '2026-27',
  invoiceDate: new Date('2026-07-05T00:00:00Z'),
  status: 'issued',
  subtotal: '100.00',
  totalCgst: '9.00',
  totalSgst: '9.00',
  totalIgst: '0.00',
  totalCess: '0.00',
  totalAmount: '118.00',
};

const invoiceB = {
  id: 'inv-b',
  organizationId: 'org-1',
  gstinId: 'gstin-1',
  customerId: 'cust-b',
  invoiceNumber: '00002',
  financialYear: '2026-27',
  invoiceDate: new Date('2026-07-10T00:00:00Z'),
  status: 'issued',
  subtotal: '200.00',
  totalCgst: '0.00',
  totalSgst: '0.00',
  totalIgst: '36.00',
  totalCess: '0.00',
  totalAmount: '236.00',
};

const b2cInvoice = {
  id: 'inv-c',
  organizationId: 'org-1',
  gstinId: 'gstin-1',
  customerId: 'cust-c',
  invoiceNumber: '00003',
  financialYear: '2026-27',
  invoiceDate: new Date('2026-07-12T00:00:00Z'),
  status: 'issued',
  subtotal: '500.00',
  totalCgst: '45.00',
  totalSgst: '45.00',
  totalIgst: '0.00',
  totalCess: '0.00',
  totalAmount: '590.00',
};

const customerA = {
  id: 'cust-a',
  gstin: '27AAAAA0000A1Z1',
  placeOfSupplyStateCode: '27',
  name: 'A',
};
const customerB = {
  id: 'cust-b',
  gstin: '29BBBBB0000B1Z3',
  placeOfSupplyStateCode: '29',
  name: 'B',
};
const customerC = { id: 'cust-c', gstin: null, placeOfSupplyStateCode: '27', name: 'C' };

const lineA = {
  id: 'la',
  invoiceId: 'inv-a',
  taxableAmount: '100.00',
  cgstRate: '9.00',
  cgstAmount: '9.00',
  sgstRate: '9.00',
  sgstAmount: '9.00',
  igstRate: '0.00',
  igstAmount: '0.00',
  cessRate: '0.00',
  cessAmount: '0.00',
};

const lineB = {
  id: 'lb',
  invoiceId: 'inv-b',
  taxableAmount: '200.00',
  cgstRate: '0.00',
  cgstAmount: '0.00',
  sgstRate: '0.00',
  sgstAmount: '0.00',
  igstRate: '18.00',
  igstAmount: '36.00',
  cessRate: '0.00',
  cessAmount: '0.00',
};

const lineC = {
  id: 'lc',
  invoiceId: 'inv-c',
  taxableAmount: '500.00',
  cgstRate: '9.00',
  cgstAmount: '45.00',
  sgstRate: '9.00',
  sgstAmount: '45.00',
  igstRate: '0.00',
  igstAmount: '0.00',
  cessRate: '0.00',
  cessAmount: '0.00',
};

const mockDb = db as unknown as {
  select: jest.Mock;
  from: jest.Mock;
  where: jest.Mock;
};

const mockWhere = mockDb.where;

beforeEach(() => {
  jest.clearAllMocks();
  mockWhere.mockResolvedValue([]);
});

describe('GstrExportService', () => {
  it('returns an empty B2B array when there are no invoices in the period', async () => {
    mockWhere
      .mockResolvedValueOnce([]) // invoices
      .mockResolvedValueOnce([gstinRow]); // gstins

    const result = await GstrExportService.generateGstr1Json('org-1', 'gstin-1', '2026-27', 7);

    expect(result).toEqual({
      gstin: '27AACCM0000A1Z1',
      fp: '072026',
      b2b: [],
    });
  });

  it('excludes B2C invoices and builds B2B line detail', async () => {
    mockWhere
      .mockResolvedValueOnce([invoiceA, invoiceB, b2cInvoice]) // invoices
      .mockResolvedValueOnce([gstinRow]) // gstins
      .mockResolvedValueOnce([customerA, customerB, customerC]) // customers
      .mockResolvedValueOnce([lineA, lineB, lineC]); // invoice line items

    const result = await GstrExportService.generateGstr1Json('org-1', 'gstin-1', '2026-27', 7);

    expect(result).toEqual({
      gstin: '27AACCM0000A1Z1',
      fp: '072026',
      b2b: [
        {
          ctin: '27AAAAA0000A1Z1',
          cfs: 'N',
          pos: '27',
          inum: '00001',
          idt: '05-07-2026',
          val: 118,
          itms: [
            {
              num: 1,
              itm_det: { txval: 100, rt: 18, iamt: 0, camt: 9, samt: 9, csamt: 0 },
            },
          ],
        },
        {
          ctin: '29BBBBB0000B1Z3',
          cfs: 'N',
          pos: '29',
          inum: '00002',
          idt: '10-07-2026',
          val: 236,
          itms: [
            {
              num: 1,
              itm_det: { txval: 200, rt: 18, iamt: 36, camt: 0, samt: 0, csamt: 0 },
            },
          ],
        },
      ],
    });
  });

  it('uses the correct tax period for Jan-Mar (next calendar year)', async () => {
    mockWhere
      .mockResolvedValueOnce([invoiceA]) // invoices
      .mockResolvedValueOnce([gstinRow]); // gstins

    const result = await GstrExportService.generateGstr1Json('org-1', 'gstin-1', '2026-27', 1);

    expect(result).toEqual({
      gstin: '27AACCM0000A1Z1',
      fp: '012027',
      b2b: [],
    });
  });
});