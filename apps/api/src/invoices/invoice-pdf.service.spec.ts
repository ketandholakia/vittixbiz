import { InvoicePdfService } from './invoice-pdf.service';

// puppeteer ships an ESM entry that Jest (CommonJS) cannot parse; it is only
// needed by the skipped DB-backed integration test below, so stub it here.
jest.mock('puppeteer', () => ({
  __esModule: true,
  default: { launch: jest.fn() },
}));

/**
 * PDF TESTING STRATEGY:
 *
 * `InvoicePdfService.generateInvoicePdf()` renders an invoice stored in
 * PostgreSQL via Puppeteer (headless Chrome). To test it fully you need:
 *   1. A running Postgres instance with the schema migrated.
 *   2. A seeded organization, GSTIN, customer and an invoice row with line
 *      items (e.g. created via InvoicesService.createInvoice).
 *   3. A headless Chrome binary available to Puppeteer (auto-downloaded by
 *      the puppeteer package install script).
 *
 * Until those are available, the HTML template is tested directly (pure
 * function, no DB or browser needed) and the full PDF path is documented as
 * a skipped integration test.
 */

const sampleData = {
  org: { legalName: 'Acme Pvt Ltd', tradeName: 'Acme', panNumber: 'AAAAA0000A' },
  gstin: { gstin: '27AACCM0000A1Z1', stateCode: '27', branchName: 'Mumbai HQ' },
  customer: {
    name: 'Bob Buyer',
    gstin: '27BBBBB0000B1Z2',
    placeOfSupplyStateCode: '27',
    billingAddress: '1, Test Street, Mumbai',
    email: 'bob@example.com',
    phone: '9000000000',
  },
  invoice: {
    invoiceNumber: '00001',
    invoiceDate: '2026-07-01T00:00:00.000Z',
    dueDate: '2026-07-31T00:00:00.000Z',
    status: 'draft',
    subtotal: '200.00',
    totalCgst: '18.00',
    totalSgst: '18.00',
    totalIgst: '0.00',
    totalCess: '0.00',
    totalAmount: '236.00',
    notes: 'Thank you.',
  },
  lines: [
    {
      description: 'Consulting',
      hsnSacCode: '9983',
      quantity: '2',
      unitPrice: '100.00',
      discountAmount: '0.00',
      taxableAmount: '200.00',
      cgstRate: '9.00',
      cgstAmount: '18.00',
      sgstRate: '9.00',
      sgstAmount: '18.00',
      igstRate: '0.00',
      igstAmount: '0.00',
      lineTotal: '236.00',
    },
  ],
};

describe('InvoicePdfService.renderInvoiceHtml', () => {
  it('renders org, customer, line items, tax breakdown and totals', () => {
    const html = InvoicePdfService.renderInvoiceHtml(sampleData);

    expect(html).toContain('Acme Pvt Ltd');
    expect(html).toContain('27AACCM0000A1Z1');
    expect(html).toContain('Bob Buyer');
    expect(html).toContain('00001');
    expect(html).toContain('9983');
    expect(html).toContain('200.00');
    expect(html).toContain('236.00');
    expect(html).toContain('QR code (Phase 4)');
  });

  it('renders the QR code image when a data URL is provided', () => {
    const html = InvoicePdfService.renderInvoiceHtml({
      ...sampleData,
      qrCodeDataUrl: 'data:image/png;base64,AAAA',
    });

    expect(html).toContain('<img class="qr" src="data:image/png;base64,AAAA"');
    expect(html).not.toContain('QR code (Phase 4)');
  });

  it('escapes HTML in user-supplied strings', () => {
    const html = InvoicePdfService.renderInvoiceHtml({
      ...sampleData,
      customer: {
        ...sampleData.customer,
        name: '<script>alert("xss")</script>',
      },
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('InvoicePdfService.generateInvoicePdf (integration)', () => {
  it.skip('returns a PDF Buffer for a real invoice row', async () => {
    // Requires a migrated Postgres instance and a seeded invoice. See the
    // doc comment at the top of this file for setup steps.
    const pdf = await InvoicePdfService.generateInvoicePdf('some-real-invoice-id');

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.byteLength).toBeGreaterThan(0);
  });
});