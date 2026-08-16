/**
 * Provider-agnostic GSP adapter contract.
 *
 * The GSP (GST Suvidha Provider) is still an open vendor decision — the
 * options being evaluated are ClearTax, Cygnet, MasterGST, etc. Each has its
 * own REST endpoint and auth flow (token-based), so nothing here is bound to
 * a specific vendor. Implement {@link GspAdapter} once per provider and swap
 * it in at composition time without touching calling code.
 *
 * The payload types below follow GSTN's e-invoice JSON schema (Form GST
 * INV-01, version 1.1) as documented by NIC/IRP. Fields we are NOT confident
 * about are marked with `// TODO: verify against GSTN docs`.
 */

/** Transaction details (`TranDtls`). */
export interface TranDtls {
  TaxSch: 'GST';
  /** Type of supply. B2B for registered buyers; e-invoice is mandatory for B2B. */
  SupTyp: 'B2B' | 'SEZWP' | 'SEZWOP' | 'EXPWP' | 'EXPWOP' | 'DEXP';
  /** Reverse charge: Y/N, defaults N. */
  RegRev?: 'Y' | 'N';
  /** GSTIN of the e-commerce operator, if any. */
  EcmGstin?: string;
  /** Y when the supply is intra-state but charged IGST. */
  IgstOnIntra?: 'Y' | 'N';
}

/** Document details (`DocDtls`). */
export interface DocDtls {
  Typ: 'INV' | 'CRN' | 'DBN';
  /** Document number. GSTN max length is 16 chars. */
  No: string;
  /** Document date as DD/MM/YYYY. */
  Dt: string;
}

/** Seller details (`SellerDtls`). */
export interface SellerDtls {
  Gstin: string;
  LglNm: string;
  TrdNm?: string;
  Addr1: string;
  Addr2?: string;
  Loc: string;
  Pin: number;
  Stcd: string;
  Ph?: string;
  Em?: string;
}

/** Buyer details (`BuyerDtls`). */
export interface BuyerDtls {
  /** Use "URP" for unregistered buyers (B2C). */
  Gstin: string;
  LglNm: string;
  TrdNm?: string;
  /** State code of place of supply. */
  Pos: string;
  Addr1: string;
  Addr2?: string;
  Loc?: string;
  Pin?: number;
  Stcd: string;
  Ph?: string;
  Em?: string;
}

/** A single invoice line item (`ItemList[]`). */
export interface EInvoiceItem {
  SlNo: string;
  PrdDesc?: string;
  /** Y for services, N for goods. */
  IsServc: 'Y' | 'N';
  HsnCd: string;
  Qty?: number;
  /** UQC code (e.g. 'NOS', 'KGS', 'MTR'). TODO: validate against GSTN UQC master list. */
  Unit?: string;
  UnitPrice?: number;
  /** Unit price x quantity. */
  TotAmt?: number;
  Discount?: number;
  /** Assessable amount (TotAmt - Discount). */
  AssAmt: number;
  /** IGST rate OR (CGST + SGST) rate. */
  GstRt: number;
  IgstAmt?: number;
  CgstAmt?: number;
  SgstAmt?: number;
  CesRt?: number;
  CesAmt?: number;
  /** TODO: our line items have no "other charges" concept yet. */
  OthChrg?: number;
}

/** Value details (`ValDtls`). */
export interface ValDtls {
  AssVal: number;
  CgstVal?: number;
  SgstVal?: number;
  IgstVal?: number;
  CesVal?: number;
  StCesVal?: number;
  Discount?: number;
  OthChrg?: number;
  RndOffAmt?: number;
  TotInvVal: number;
  TotInvValFc?: number;
}

/** Top-level e-invoice payload (GSTN schema v1.1). */
export interface EInvoicePayload {
  Version: string;
  TranDtls: TranDtls;
  DocDtls: DocDtls;
  SellerDtls: SellerDtls;
  BuyerDtls: BuyerDtls;
  ItemList: EInvoiceItem[];
  ValDtls: ValDtls;
}

/** Result of an IRN generation call. */
export interface IrnResult {
  irn: string;
  ackNo: string;
  /** Acknowledgement timestamp, ISO 8601. */
  ackDt: string;
  /** e.g. 'ACT' (active). */
  status: string;
  /**
   * Digitally-signed QR payload returned by the GSP. When absent, callers
   * should fall back to encoding the IRN itself (placeholder) — see the
   * e-invoice service.
   */
  qrCodePayload?: string;
  /** Base64-encoded signed e-invoice, if returned. */
  signedInvoice?: string;
  /** E-way bill number if requested inline. */
  ewbNo?: string;
}

/** E-way bill payload. Structure per GSTN e-way bill API. */
export interface EwayBillPayload {
  Version: string;
  TranDtls: {
    /** e.g. '1' (B2B), '2' (B2C). TODO: verify supply type codes. */
    SupplyType?: string;
    /** e.g. '01' (Supply), '02' (Import), ... TODO: verify sub-supply codes. */
    SubSupplyType?: string;
    /** Doc type: INV, CRN, DBN. */
    DocType: string;
    DocNo: string;
    DocDt: string;
    FromGstin: string;
    FromTrdName?: string;
    FromAddr1?: string;
    FromAddr2?: string;
    FromPlace?: string;
    FromPin?: number;
    FromStateCode?: string;
    ToGstin: string;
    ToTrdName?: string;
    ToAddr1?: string;
    ToAddr2?: string;
    ToPlace?: string;
    ToPin?: number;
    ToStateCode?: string;
    /** Mode of transport. TODO: verify code values (1 road, 2 rail, 3 air, 4 ship). */
    TransMode?: string;
    /** Transport distance in km. TODO: verify field is distance in km. */
    Distance?: string;
    TransporterId?: string;
    TransporterName?: string;
    TransDocNo?: string;
    TransDocDt?: string;
    VehicleNo?: string;
    VehicleType?: string;
  };
  ItemList: {
    ItemNo: number;
    ProductName?: string;
    HsnCode?: string;
    Quantity?: number;
    Unit?: string;
    TaxableAmount?: number;
    GstRate?: number;
    CessRate?: number;
    CessAmount?: number;
  }[];
  TotalValue?: number;
  TotInvValue?: number;
}

/** Result of an e-way bill generation call. */
export interface EwayBillResult {
  ewbNo: string;
  ewbDt: string;
  ewbValidTill?: string;
  status: string;
}

/** Provider-agnostic GSP adapter interface. */
export interface GspAdapter {
  generateIrn(invoice: EInvoicePayload): Promise<IrnResult>;
  cancelIrn(irn: string, reason: string): Promise<void>;
  generateEwayBill(payload: EwayBillPayload): Promise<EwayBillResult>;
}