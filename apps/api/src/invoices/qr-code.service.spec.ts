import { QrCodeService } from './qr-code.service';

describe('QrCodeService', () => {
  it('encodes a payload into a base64 PNG data URL', async () => {
    const dataUrl = await QrCodeService.generateInvoiceQrCode('INV/2026-27/00001');

    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    expect(base64.length).toBeGreaterThan(0);
  });

  it('produces distinct output for different payloads', async () => {
    const a = await QrCodeService.generateInvoiceQrCode('payload-a');
    const b = await QrCodeService.generateInvoiceQrCode('payload-b');

    expect(a).not.toBe(b);
  });
});