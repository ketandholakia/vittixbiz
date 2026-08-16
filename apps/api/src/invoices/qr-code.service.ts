import { toDataURL } from 'qrcode';

/**
 * Generic QR code generation utility.
 *
 * The actual e-invoice IRN QR payload format is GSTN/GSP-specific and will be
 * built in Phase 4 — this service only encodes whatever string it is given.
 */
export class QrCodeService {
  static async generateInvoiceQrCode(payload: string): Promise<string> {
    return toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 1,
    });
  }
}