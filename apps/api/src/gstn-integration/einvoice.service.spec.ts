import { EinvoiceGenerationError, EinvoiceService } from './einvoice.service';
import { GspAdapter } from './gsp-adapter';

const invoiceRow = {
  id: 'inv-1',
  organizationId: 'org-1',
  gstinId: 'gstin-1',
  customerId: 'cust-1',
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
  irnNumber: null,
  irnAckNo: null,
  irnAckDate: null,
  qrCodeData: null,
};

const orgRow = {
  id: 'org-1',
  legalName: 'Acme Pvt Ltd',
  tradeName: 'Acme',
  panNumber: 'AAAAA0000A',
};

const gstinRow = {
  id: 'gstin-1',
  gstin: '27AACCM0000A1Z1',
  stateCode: '27',
  branchName: 'Mumbai HQ',
  addressLine1: '1 Test Street',
  addressLine2: null,
  city: 'Mumbai',
  pincode: '400001',
};

const customerRow = {
  id: 'cust-1',
  name: 'Bob Buyer',
  gstin: '27BBBBB0000B1Z2',
  placeOfSupplyStateCode: '27',
  billingAddress: '5 Buyer Lane',
  shippingAddress: null,
  city: 'Pune',
  pincode: '411001',
  email: 'bob@example.com',
  phone: '9000000000',
};

const lineRow = {
  id: 'li-1',
  invoiceId: 'inv-1',
  hsnSacCode: '9983',
  description: 'Consulting services',
  unit: 'NOS',
  quantity: '1',
  unitPrice: '100.00',
  discountAmount: '0.00',
  taxableAmount: '100.00',
  cgstRate: '9.00',
  cgstAmount: '9.00',
  sgstRate: '9.00',
  sgstAmount: '9.00',
  igstRate: '0.00',
  igstAmount: '0.00',
  cessRate: '0.00',
  cessAmount: '0.00',
  lineTotal: '118.00',
};

const hsnRow = { code: '9983', isService: true };

function createMockTx() {
  const mockTx = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
  };
  return mockTx as any;
}

const successAdapter: GspAdapter = {
  generateIrn: jest.fn().mockResolvedValue({
    irn: 'IRN-ABCD',
    ackNo: 'ACK-1',
    ackDt: '2026-07-05T10:00:00Z',
    status: 'ACT',
  }),
  cancelIrn: jest.fn().mockResolvedValue(undefined),
  generateEwayBill: jest.fn().mockResolvedValue({
    ewbNo: 'EWB1',
    ewbDt: '2026-07-05T10:00:00Z',
    status: 'ACT',
  }),
};

describe('EinvoiceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds a GSTN payload and updates the invoice on success', async () => {
    const mockTx = createMockTx();
    mockTx.where
      .mockResolvedValueOnce([invoiceRow])
      .mockResolvedValueOnce([orgRow])
      .mockResolvedValueOnce([gstinRow])
      .mockResolvedValueOnce([customerRow])
      .mockResolvedValueOnce([lineRow])
      .mockResolvedValueOnce([hsnRow]);

    const adapter = { ...successAdapter } as GspAdapter;
    const service = new EinvoiceService(adapter);
    const result = await service.generateEinvoiceForInvoice(mockTx, 'inv-1');

    expect(result.irn).toBe('IRN-ABCD');
    expect(result.ackNo).toBe('ACK-1');
    expect(result.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

    const payload = (adapter.generateIrn as jest.Mock).mock.calls[0][0];
    expect(payload.Version).toBe('1.1');
    expect(payload.TranDtls).toEqual({ TaxSch: 'GST', SupTyp: 'B2B' });
    expect(payload.DocDtls).toEqual({ Typ: 'INV', No: '00001', Dt: '05/07/2026' });
    expect(payload.SellerDtls.Gstin).toBe('27AACCM0000A1Z1');
    expect(payload.SellerDtls.Pin).toBe(400001);
    expect(payload.SellerDtls.Stcd).toBe('27');
    expect(payload.BuyerDtls.Gstin).toBe('27BBBBB0000B1Z2');
    expect(payload.BuyerDtls.Loc).toBe('Pune');
    expect(payload.BuyerDtls.Pin).toBe(411001);
    expect(payload.BuyerDtls.Ph).toBe('9000000000');
    expect(payload.ItemList).toHaveLength(1);
    expect(payload.ItemList[0]).toMatchObject({
      SlNo: '1',
      IsServc: 'Y',
      HsnCd: '9983',
      Unit: 'NOS',
      AssAmt: 100,
      GstRt: 18,
      CgstAmt: 9,
      SgstAmt: 9,
      IgstAmt: undefined,
    });
    expect(payload.ValDtls).toEqual({
      AssVal: 100,
      CgstVal: 9,
      SgstVal: 9,
      IgstVal: undefined,
      CesVal: undefined,
      Discount: undefined,
      RndOffAmt: 0,
      TotInvVal: 118,
    });

    expect(mockTx.set).toHaveBeenCalledWith({
      irnNumber: 'IRN-ABCD',
      irnAckNo: 'ACK-1',
      irnAckDate: new Date('2026-07-05T10:00:00Z'),
      qrCodeData: 'IRN-ABCD',
    });
  });

  it('rejects draft invoices without calling the adapter', async () => {
    const mockTx = createMockTx();
    mockTx.where.mockResolvedValueOnce([{ ...invoiceRow, status: 'draft' }]);
    const adapter = { ...successAdapter } as GspAdapter;
    const service = new EinvoiceService(adapter);

    await expect(service.generateEinvoiceForInvoice(mockTx, 'inv-1')).rejects.toThrow(
      EinvoiceGenerationError
    );
    expect(adapter.generateIrn).not.toHaveBeenCalled();
    expect(mockTx.set).not.toHaveBeenCalled();
  });

  it('rejects invoices that already have an IRN', async () => {
    const mockTx = createMockTx();
    mockTx.where.mockResolvedValueOnce([{ ...invoiceRow, irnNumber: 'IRN-OLD' }]);
    const adapter = { ...successAdapter } as GspAdapter;
    const service = new EinvoiceService(adapter);

    await expect(service.generateEinvoiceForInvoice(mockTx, 'inv-1')).rejects.toThrow(
      EinvoiceGenerationError
    );
    expect(adapter.generateIrn).not.toHaveBeenCalled();
  });

  it('rejects B2C invoices (customer without GSTIN)', async () => {
    const mockTx = createMockTx();
    mockTx.where
      .mockResolvedValueOnce([invoiceRow])
      .mockResolvedValueOnce([orgRow])
      .mockResolvedValueOnce([gstinRow])
      .mockResolvedValueOnce([{ ...customerRow, gstin: null }]);
    const adapter = { ...successAdapter } as GspAdapter;
    const service = new EinvoiceService(adapter);

    await expect(service.generateEinvoiceForInvoice(mockTx, 'inv-1')).rejects.toThrow(
      EinvoiceGenerationError
    );
    expect(adapter.generateIrn).not.toHaveBeenCalled();
    expect(mockTx.set).not.toHaveBeenCalled();
  });

  it('throws EinvoiceGenerationError and leaves the invoice untouched when the adapter fails', async () => {
    const mockTx = createMockTx();
    mockTx.where
      .mockResolvedValueOnce([invoiceRow])
      .mockResolvedValueOnce([orgRow])
      .mockResolvedValueOnce([gstinRow])
      .mockResolvedValueOnce([customerRow])
      .mockResolvedValueOnce([lineRow])
      .mockResolvedValueOnce([hsnRow]);

    const adapter: GspAdapter = {
      ...successAdapter,
      generateIrn: jest.fn().mockRejectedValue(new Error('GSP down')),
    };
    const service = new EinvoiceService(adapter);

    await expect(service.generateEinvoiceForInvoice(mockTx, 'inv-1')).rejects.toThrow(
      EinvoiceGenerationError
    );
    expect(mockTx.set).not.toHaveBeenCalled();
  });

  it('throws when the invoice number exceeds the GSTN 16-char limit', async () => {
    const mockTx = createMockTx();
    mockTx.where
      .mockResolvedValueOnce([{ ...invoiceRow, invoiceNumber: 'INV-2026-0000000000000001' }])
      .mockResolvedValueOnce([orgRow])
      .mockResolvedValueOnce([gstinRow])
      .mockResolvedValueOnce([customerRow])
      .mockResolvedValueOnce([lineRow])
      .mockResolvedValueOnce([hsnRow]);
    const service = new EinvoiceService({ ...successAdapter } as GspAdapter);

    await expect(service.generateEinvoiceForInvoice(mockTx, 'inv-1')).rejects.toThrow(
      /16 characters/
    );
  });

  it('throws EinvoiceGenerationError when the customer is missing city/pincode', async () => {
    const mockTx = createMockTx();
    mockTx.where
      .mockResolvedValueOnce([invoiceRow])
      .mockResolvedValueOnce([orgRow])
      .mockResolvedValueOnce([gstinRow])
      .mockResolvedValueOnce([
        { ...customerRow, city: null, pincode: null },
      ]);
    const adapter = { ...successAdapter } as GspAdapter;
    const service = new EinvoiceService(adapter);

    await expect(service.generateEinvoiceForInvoice(mockTx, 'inv-1')).rejects.toThrow(
      /city\/pincode/
    );
    expect(adapter.generateIrn).not.toHaveBeenCalled();
    expect(mockTx.set).not.toHaveBeenCalled();
  });
});