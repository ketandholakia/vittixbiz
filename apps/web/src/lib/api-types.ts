/**
 * Wire types mirroring the NestJS API responses.
 *
 * Sources of truth (read directly, not guessed):
 *  - apps/api/src/database/schema.ts   (row shapes: $inferSelect)
 *  - apps/api/src/customers/customers.dto.ts
 *  - apps/api/src/invoices/invoices.controller.ts
 *  - apps/api/src/auth/auth.service.ts (RegisterResult / login)
 *
 * Money columns are numeric(15,2) in Postgres and arrive as strings. They are
 * displayed verbatim and NEVER recomputed on the client as authoritative.
 */

export type InvoiceStatus =
  | 'draft'
  | 'issued'
  | 'paid'
  | 'partially_paid'
  | 'cancelled';

export interface Customer {
  id: string;
  organizationId: string;
  name: string;
  gstin: string | null;
  placeOfSupplyStateCode: string;
  billingAddress: string | null;
  shippingAddress: string | null;
  city: string | null;
  pincode: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  organizationId: string;
  gstinId: string;
  customerId: string;
  invoiceNumber: string;
  financialYear: string;
  invoiceDate: string;
  dueDate: string | null;
  status: InvoiceStatus;
  subtotal: string;
  totalCgst: string;
  totalSgst: string;
  totalIgst: string;
  totalCess: string;
  totalAmount: string;
  ledgerTransactionId: string | null;
  irnNumber: string | null;
  irnAckNo: string | null;
  irnAckDate: string | null;
  qrCodeData: string | null;
  notes: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLine {
  id: string;
  invoiceId: string;
  hsnSacCode: string;
  description: string;
  unit: string | null;
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
  cessRate: string;
  cessAmount: string;
  lineTotal: string;
  createdAt: string;
}

export interface InvoiceDetail {
  invoice: Invoice;
  lines: InvoiceLine[];
}

export interface LoginResponse {
  accessToken: string;
}

export interface RegisterResponse {
  id: string;
  email: string;
  fullName: string;
}

export interface IssueResponse {
  ledgerTransactionId: string;
}

export interface CreateInvoiceResponse {
  invoiceId: string;
  invoiceNumber: string;
}

export interface Gstin {
  id: string;
  organizationId: string;
  gstin: string;
  branchName: string;
  stateCode: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  pincode: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGstinInput {
  gstin: string;
  branchName: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  pincode?: string | null;
}

export interface CreateGstinResponse extends Gstin {
  /** Set when the GSTIN's structure is valid but our checksum calculation
   * disagrees — a soft warning, never a rejection. */
  checksumWarning?: string;
}

export interface EinvoiceResponse {
  irn: string;
  ackNo: string;
  qrCodeDataUrl: string;
}

export interface CreateCustomerInput {
  name: string;
  gstin?: string | null;
  placeOfSupplyStateCode: string;
  billingAddress?: string | null;
  shippingAddress?: string | null;
  city?: string | null;
  pincode?: string | null;
  email?: string | null;
  phone?: string | null;
}

export type UpdateCustomerInput = Partial<CreateCustomerInput>;

export interface CreateInvoiceLineInput {
  hsnSacCode: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountAmount?: string;
  unit?: string;
}

export interface CreateInvoiceInput {
  gstinId: string;
  customerId: string;
  invoiceDate: string;
  dueDate?: string;
  notes?: string;
  lineItems: CreateInvoiceLineInput[];
}