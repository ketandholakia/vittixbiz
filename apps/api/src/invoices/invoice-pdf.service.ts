import puppeteer from 'puppeteer';
import { eq } from 'drizzle-orm';
import { db } from '../database/db';
import {
  customers,
  gstins,
  invoiceLineItems,
  invoices,
  organizations,
} from '../database/schema';

interface InvoicePdfData {
  org: {
    legalName: string;
    tradeName: string | null;
    panNumber: string | null;
  };
  gstin: {
    gstin: string;
    stateCode: string;
    branchName: string;
  };
  customer: {
    name: string;
    gstin: string | null;
    placeOfSupplyStateCode: string;
    billingAddress: string | null;
    email: string | null;
    phone: string | null;
  };
  invoice: {
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string | null;
    status: string;
    subtotal: string;
    totalCgst: string;
    totalSgst: string;
    totalIgst: string;
    totalCess: string;
    totalAmount: string;
    notes: string | null;
  };
  lines: {
    description: string;
    hsnSacCode: string;
    quantity: string;
    unitPrice: string;
    discountAmount: string;
    taxableAmount: string;
    cgstRate: string;
    cgstAmount: string;
    sgstRate: string;
    sgstAmount: string;
    igstRate: string;
    igstAmount: string;
    lineTotal: string;
  }[];
  /** Optional base64 data URL for the QR code (populated in Phase 4). */
  qrCodeDataUrl?: string;
}

/**
 * Renders a GST invoice as a PDF using Puppeteer (headless Chrome).
 *
 * This is a service-layer utility; no HTTP route is wired up yet.
 * NOTE: requires a running PostgreSQL instance with the schema migrated and a
 * row in `invoices` to be tested fully — unit tests only assert the template
 * rendering path, not the DB fetch (see invoice-pdf.service.spec.ts).
 */
export class InvoicePdfService {
  static async generateInvoicePdf(invoiceId: string): Promise<Buffer> {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId));
    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found.`);
    }

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, invoice.organizationId));
    const [gstin] = await db
      .select()
      .from(gstins)
      .where(eq(gstins.id, invoice.gstinId));
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, invoice.customerId));
    const lines = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoice.id));

    if (!org || !gstin || !customer) {
      throw new Error(`Invoice ${invoiceId} is missing its organization, GSTIN or customer.`);
    }

    const html = this.renderInvoiceHtml({
      org: {
        legalName: org.legalName,
        tradeName: org.tradeName,
        panNumber: org.panNumber,
      },
      gstin: {
        gstin: gstin.gstin,
        stateCode: gstin.stateCode,
        branchName: gstin.branchName,
      },
      customer: {
        name: customer.name,
        gstin: customer.gstin,
        placeOfSupplyStateCode: customer.placeOfSupplyStateCode,
        billingAddress: customer.billingAddress,
        email: customer.email,
        phone: customer.phone,
      },
      invoice: {
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate.toISOString(),
        dueDate: invoice.dueDate ? invoice.dueDate.toISOString() : null,
        status: invoice.status,
        subtotal: invoice.subtotal,
        totalCgst: invoice.totalCgst,
        totalSgst: invoice.totalSgst,
        totalIgst: invoice.totalIgst,
        totalCess: invoice.totalCess,
        totalAmount: invoice.totalAmount,
        notes: invoice.notes,
      },
      lines: lines.map((line) => ({
        description: line.description,
        hsnSacCode: line.hsnSacCode,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountAmount: line.discountAmount,
        taxableAmount: line.taxableAmount,
        cgstRate: line.cgstRate,
        cgstAmount: line.cgstAmount,
        sgstRate: line.sgstRate,
        sgstAmount: line.sgstAmount,
        igstRate: line.igstRate,
        igstAmount: line.igstAmount,
        lineTotal: line.lineTotal,
      })),
    });

    const browser = await puppeteer.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '16mm', right: '16mm', bottom: '16mm', left: '16mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  /** Exposed for unit testing the template without a browser or a DB. */
  static renderInvoiceHtml(data: InvoicePdfData): string {
    const {
      org,
      gstin,
      customer,
      invoice,
      lines,
      qrCodeDataUrl,
    } = data;

    const rows = lines
      .map(
        (line, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${this.esc(line.description)}</td>
          <td class="center">${this.esc(line.hsnSacCode)}</td>
          <td class="right">${line.quantity}</td>
          <td class="right">${line.unitPrice}</td>
          <td class="right">${line.discountAmount}</td>
          <td class="right">${line.taxableAmount}</td>
          <td class="right">${line.cgstRate} / ${line.sgstRate} / ${line.igstRate}</td>
          <td class="right">${line.lineTotal}</td>
        </tr>`
      )
      .join('');

    const qrBlock = qrCodeDataUrl
      ? `<img class="qr" src="${qrCodeDataUrl}" alt="QR code" />`
      : `<div class="qr-placeholder">QR code (Phase 4)</div>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    h2 { font-size: 14px; margin: 0 0 4px; }
    .muted { color: #555; }
    .header { display: flex; justify-content: space-between; margin-bottom: 16px; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 16px; }
    .box { border: 1px solid #ccc; padding: 8px; width: 45%; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
    th { background: #f0f0f0; }
    .right { text-align: right; }
    .center { text-align: center; }
    .totals { width: 40%; margin-left: auto; }
    .totals td { border: none; padding: 2px 6px; }
    .totals .grand td { font-weight: bold; border-top: 2px solid #333; }
    .qr, .qr-placeholder { width: 110px; height: 110px; margin-top: 8px; }
    .qr-placeholder {
      border: 1px dashed #999; display: flex; align-items: center;
      justify-content: center; text-align: center; color: #777;
    }
    .notes { margin-top: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${this.esc(org.legalName)}</h1>
      ${org.tradeName ? `<div>${this.esc(org.tradeName)}</div>` : ''}
      ${org.panNumber ? `<div class="muted">PAN: ${this.esc(org.panNumber)}</div>` : ''}
      <div class="muted">GSTIN: ${this.esc(gstin.gstin)}</div>
      <div class="muted">Branch: ${this.esc(gstin.branchName)} (State ${this.esc(gstin.stateCode)})</div>
    </div>
    <div>
      <h2>Invoice ${this.esc(invoice.invoiceNumber)}</h2>
      <div class="muted">Date: ${this.esc(invoice.invoiceDate)}</div>
      ${invoice.dueDate ? `<div class="muted">Due: ${this.esc(invoice.dueDate)}</div>` : ''}
      <div class="muted">Status: ${this.esc(invoice.status)}</div>
    </div>
  </div>

  <div class="parties">
    <div class="box">
      <h2>Bill To</h2>
      <div>${this.esc(customer.name)}</div>
      ${customer.gstin ? `<div class="muted">GSTIN: ${this.esc(customer.gstin)}</div>` : '<div class="muted">GSTIN: — (B2C)</div>'}
      ${customer.billingAddress ? `<div class="muted">${this.esc(customer.billingAddress)}</div>` : ''}
      ${customer.email ? `<div class="muted">${this.esc(customer.email)}</div>` : ''}
      ${customer.phone ? `<div class="muted">${this.esc(customer.phone)}</div>` : ''}
      <div class="muted">Place of Supply: ${this.esc(customer.placeOfSupplyStateCode)}</div>
    </div>
    <div class="box">
      ${qrBlock}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Description</th>
        <th>HSN/SAC</th>
        <th>Qty</th>
        <th>Unit Price</th>
        <th>Discount</th>
        <th>Taxable</th>
        <th>CGST/SGST/IGST</th>
        <th>Line Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <table class="totals">
    <tr><td>Subtotal</td><td class="right">${invoice.subtotal}</td></tr>
    <tr><td>CGST</td><td class="right">${invoice.totalCgst}</td></tr>
    <tr><td>SGST</td><td class="right">${invoice.totalSgst}</td></tr>
    <tr><td>IGST</td><td class="right">${invoice.totalIgst}</td></tr>
    <tr><td>Cess</td><td class="right">${invoice.totalCess}</td></tr>
    <tr class="grand"><td>Total</td><td class="right">${invoice.totalAmount}</td></tr>
  </table>

  ${invoice.notes ? `<div class="notes"><strong>Notes:</strong> ${this.esc(invoice.notes)}</div>` : ''}
</body>
</html>`;
  }

  private static esc(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}