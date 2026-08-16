import Decimal from 'decimal.js';
import { eq, inArray } from 'drizzle-orm';
import type { DbTransaction } from '../database/db';
import {
  customers,
  gstins,
  hsnSacMaster,
  invoiceLineItems,
  invoices,
  organizations,
} from '../database/schema';
import { QrCodeService } from '../invoices/qr-code.service';
import {
  EInvoicePayload,
  EInvoiceItem,
  GspAdapter,
  IrnResult,
  ValDtls,
} from './gsp-adapter';
import { MockGspAdapter } from './mock-gsp.adapter';

/**
 * Thrown when e-invoice (IRN) generation fails. The invoice is NOT marked as
 * having an IRN — the caller may retry later. This is deliberately separate
 * from ledger posting: a failed e-invoice must not roll back the ledger
 * transaction created by issueInvoice.
 */
export class EinvoiceGenerationError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'EinvoiceGenerationError';
  }
}

export class EinvoiceService {
  constructor(private readonly adapter: GspAdapter = new MockGspAdapter()) {}

  /**
   * Generates an IRN for an 'issued' invoice. On success the invoice row is
   * updated with the IRN, acknowledgement details and a QR data URL.
   *
   * The GSP call is a separate step from ledger posting: if it fails after
   * retries we throw {@link EinvoiceGenerationError} without touching the
   * invoice's IRN fields, so nothing written by issueInvoice is affected.
   */
  async generateEinvoiceForInvoice(
    tx: DbTransaction,
    invoiceId: string
  ): Promise<{ irn: string; ackNo: string; qrCodeDataUrl: string }> {
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId));
    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found.`);
    }
    if (invoice.status !== 'issued') {
      throw new EinvoiceGenerationError(
        `Only issued invoices can be e-invoiced; invoice ${invoiceId} is '${invoice.status}'.`
      );
    }
    if (invoice.irnNumber) {
      throw new EinvoiceGenerationError(
        `Invoice ${invoiceId} already has IRN ${invoice.irnNumber}.`
      );
    }

    const payload = await this.buildPayload(tx, invoice);

    let result: IrnResult;
    try {
      result = await this.adapter.generateIrn(payload);
    } catch (error) {
      throw new EinvoiceGenerationError(
        `Failed to generate IRN for invoice ${invoiceId} after retries.`,
        error
      );
    }

    // GSTN returns a digitally-signed QR payload in the response. The mock
    // adapter does not return a real signed payload yet, so encode the IRN
    // itself as a placeholder — replace once a real GSP is wired up.
    const qrPayload = result.qrCodePayload ?? result.irn;
    const qrCodeDataUrl = await QrCodeService.generateInvoiceQrCode(qrPayload);

    await tx
      .update(invoices)
      .set({
        irnNumber: result.irn,
        irnAckNo: result.ackNo,
        irnAckDate: new Date(result.ackDt),
        qrCodeData: qrPayload,
      })
      .where(eq(invoices.id, invoice.id));

    return { irn: result.irn, ackNo: result.ackNo, qrCodeDataUrl };
  }

  /** Builds a GSTN schema v1.1 payload from our invoice tables. */
  private async buildPayload(tx: DbTransaction, invoice: typeof invoices.$inferSelect): Promise<EInvoicePayload> {
    const [org] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, invoice.organizationId));
    if (!org) {
      throw new EinvoiceGenerationError(
        `Organization ${invoice.organizationId} for invoice ${invoice.id} not found.`
      );
    }

    const [gstin] = await tx
      .select()
      .from(gstins)
      .where(eq(gstins.id, invoice.gstinId));
    if (!gstin) {
      throw new EinvoiceGenerationError(
        `GSTIN ${invoice.gstinId} for invoice ${invoice.id} not found.`
      );
    }

    const [customer] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, invoice.customerId));
    if (!customer) {
      throw new EinvoiceGenerationError(
        `Customer ${invoice.customerId} for invoice ${invoice.id} not found.`
      );
    }

    if (!customer.gstin) {
      throw new EinvoiceGenerationError(
        `Invoice ${invoice.id} is B2C (customer has no GSTIN) — e-invoice/IRN applies to registered B2B supplies only. ` +
          `TODO: SEZ and export supply types are not handled yet.`
      );
    }

    const lines = await tx
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoice.id));

    // Determine goods vs services from the HSN/SAC master.
    const codes = [...new Set(lines.map((line) => line.hsnSacCode))];
    const hsnRows = codes.length
      ? await tx
          .select()
          .from(hsnSacMaster)
          .where(inArray(hsnSacMaster.code, codes))
      : [];
    const isServiceByCode = new Map(hsnRows.map((h) => [h.code, h.isService]));

    // GSTN DocDtls.No is max 16 chars; our prefixable invoice numbers may exceed it.
    if (invoice.invoiceNumber.length > 16) {
      throw new EinvoiceGenerationError(
        `Invoice number "${invoice.invoiceNumber}" exceeds GSTN DocDtls.No max length of 16 characters.`
      );
    }

    const sellerAddress = gstin.addressLine1;
    const sellerLoc = gstin.city;
    const sellerPin = gstin.pincode;
    if (!sellerAddress || !sellerLoc || !sellerPin) {
      throw new EinvoiceGenerationError(
        `GSTIN ${gstin.gstin} is missing addressLine1/city/pincode required for SellerDtls.`
      );
    }

    const buyerAddress = customer.billingAddress;
    if (!buyerAddress) {
      throw new EinvoiceGenerationError(
        `Customer ${customer.name} is missing billingAddress required for BuyerDtls.`
      );
    }
    const buyerLoc = customer.city;
    const buyerPin = customer.pincode;
    if (!buyerLoc || !buyerPin) {
      throw new EinvoiceGenerationError(
        `Customer ${customer.name} is missing city/pincode required for BuyerDtls.Loc/Pin.`
      );
    }

    const items: EInvoiceItem[] = lines.map((line, index) => {
      const cgstRate = new Decimal(line.cgstRate);
      const sgstRate = new Decimal(line.sgstRate);
      const igstRate = new Decimal(line.igstRate);
      // GstRt is the IGST rate OR the sum of CGST+SGST rates.
      const gstRate = igstRate.gt(0) ? igstRate : cgstRate.plus(sgstRate);
      const discountAmount = new Decimal(line.discountAmount);
      const cessRate = new Decimal(line.cessRate);
      const cessAmount = new Decimal(line.cessAmount);
      const qty = new Decimal(line.quantity);
      const unitPrice = new Decimal(line.unitPrice);
      const totAmt = qty.times(unitPrice);

      return {
        SlNo: String(index + 1),
        PrdDesc: line.description,
        IsServc: isServiceByCode.get(line.hsnSacCode) ? ('Y' as const) : ('N' as const),
        HsnCd: line.hsnSacCode,
        Qty: qty.toNumber(),
        // TODO: validate line.unit against GSTN's UQC master list (e.g.
        // 'NOS', 'KGS', 'MTR') rather than accepting free text — the UQC
        // reference data is not loaded yet, so it passes through as-is.
        Unit: line.unit ?? undefined,
        UnitPrice: unitPrice.toNumber(),
        TotAmt: totAmt.toNumber(),
        Discount: discountAmount.isZero() ? undefined : discountAmount.toNumber(),
        AssAmt: Number(line.taxableAmount),
        GstRt: gstRate.toNumber(),
        IgstAmt: igstRate.isZero() ? undefined : Number(line.igstAmount),
        CgstAmt: cgstRate.isZero() ? undefined : Number(line.cgstAmount),
        SgstAmt: sgstRate.isZero() ? undefined : Number(line.sgstAmount),
        CesRt: cessRate.isZero() ? undefined : cessRate.toNumber(),
        CesAmt: cessAmount.isZero() ? undefined : Number(line.cessAmount),
        // TODO: line items have no "other charges" concept yet.
      };
    });

    const totalDiscount = lines.reduce(
      (acc, line) => acc.plus(line.discountAmount),
      new Decimal(0)
    );

    const valDtls: ValDtls = {
      AssVal: Number(invoice.subtotal),
      CgstVal: new Decimal(invoice.totalCgst).isZero() ? undefined : Number(invoice.totalCgst),
      SgstVal: new Decimal(invoice.totalSgst).isZero() ? undefined : Number(invoice.totalSgst),
      IgstVal: new Decimal(invoice.totalIgst).isZero() ? undefined : Number(invoice.totalIgst),
      CesVal: new Decimal(invoice.totalCess).isZero() ? undefined : Number(invoice.totalCess),
      Discount: totalDiscount.isZero() ? undefined : totalDiscount.toNumber(),
      RndOffAmt: 0,
      TotInvVal: Number(invoice.totalAmount),
    };

    return {
      Version: '1.1',
      TranDtls: {
        TaxSch: 'GST',
        SupTyp: 'B2B',
      },
      DocDtls: {
        Typ: 'INV',
        No: invoice.invoiceNumber,
        Dt: this.formatDate(invoice.invoiceDate),
      },
      SellerDtls: {
        Gstin: gstin.gstin,
        LglNm: org.legalName,
        TrdNm: org.tradeName ?? undefined,
        Addr1: sellerAddress,
        Addr2: gstin.addressLine2 ?? undefined,
        Loc: sellerLoc,
        Pin: Number(sellerPin),
        Stcd: gstin.stateCode,
        // TODO: phone/email are not captured on organizations/gstins yet.
      },
      BuyerDtls: {
        Gstin: customer.gstin,
        LglNm: customer.name,
        Pos: customer.placeOfSupplyStateCode,
        Addr1: buyerAddress,
        Addr2: customer.shippingAddress ?? undefined,
        Loc: buyerLoc,
        Pin: Number(buyerPin),
        Stcd: customer.placeOfSupplyStateCode,
        Ph: customer.phone ?? undefined,
        Em: customer.email ?? undefined,
      },
      ItemList: items,
      ValDtls: valDtls,
    };
  }

  private formatDate(date: Date): string {
    const d = date.getUTCDate().toString().padStart(2, '0');
    const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    return `${d}/${m}/${date.getUTCFullYear()}`;
  }
}