import { createHash } from 'node:crypto';
import {
  EwayBillPayload,
  EwayBillResult,
  GspAdapter,
  IrnResult,
  EInvoicePayload,
} from './gsp-adapter';
import { withRetry } from './retry';

/**
 * PLACEHOLDER GSP ADAPTER.
 *
 * The GSP vendor is still an open decision (ClearTax / Cygnet / MasterGST /
 * etc. are being evaluated). Each vendor exposes its own REST endpoint and
 * token-based auth flow, so the endpoint and Authorization header below are
 * placeholders — swap them (or replace this class with a vendor-specific
 * adapter) once the vendor is chosen.
 *
 * This adapter makes a real HTTP POST through an injectable `fetcher`
 * (defaults to the global `fetch`), wrapped in retry-with-exponential-backoff
 * because GSTN APIs are flaky. With no credentials configured it will fail at
 * runtime — that is expected; unit tests inject a stub `fetcher`.
 */
export interface MockGspAdapterOptions {
  endpoint?: string;
  authToken?: string;
  fetcher?: typeof fetch;
}

export class MockGspAdapter implements GspAdapter {
  private readonly endpoint: string;
  private readonly authToken?: string;
  private readonly fetcher: typeof fetch;

  constructor(options: MockGspAdapterOptions = {}) {
    this.endpoint =
      options.endpoint ??
      process.env.GSP_EINVOICE_ENDPOINT ??
      'https://api.example-gsp.in/v1/einvoice';
    this.authToken = options.authToken ?? process.env.GSP_AUTH_TOKEN;
    this.fetcher = options.fetcher ?? fetch;
  }

  async generateIrn(invoice: EInvoicePayload): Promise<IrnResult> {
    // Deterministic placeholder IRN used when the HTTP call succeeds but the
    // GSP response omits a real IRN.
    const fallbackIrn = createHash('sha256')
      .update(JSON.stringify(invoice))
      .digest('hex')
      .toUpperCase()
      .slice(0, 64);

    return withRetry(
      async () => {
        const response = await this.fetcher(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
          },
          body: JSON.stringify(invoice),
        });
        if (!response.ok) {
          throw new Error(
            `GSP generate IRN failed with HTTP ${response.status}: ${await response.text()}`
          );
        }
        const body = (await response.json()) as Record<string, unknown>;
        return {
          irn: (body.irn as string) ?? fallbackIrn,
          ackNo: (body.ackNo as string) ?? `ACK-${fallbackIrn.slice(0, 12)}`,
          ackDt: (body.ackDt as string) ?? new Date().toISOString(),
          status: (body.status as string) ?? 'ACT',
          qrCodePayload: (body.qrCodePayload as string | undefined) ?? undefined,
          signedInvoice: (body.signedInvoice as string | undefined) ?? undefined,
          ewbNo: (body.ewbNo as string | undefined) ?? undefined,
        };
      },
      { maxRetries: 3 }
    );
  }

  async cancelIrn(irn: string, reason: string): Promise<void> {
    await withRetry(
      async () => {
        const response = await this.fetcher(`${this.endpoint}/irn/${irn}/cancel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
          },
          body: JSON.stringify({ irn, reason }),
        });
        if (!response.ok) {
          throw new Error(
            `GSP cancel IRN failed with HTTP ${response.status}: ${await response.text()}`
          );
        }
      },
      { maxRetries: 3 }
    );
  }

  async generateEwayBill(payload: EwayBillPayload): Promise<EwayBillResult> {
    const fallbackEwbNo = `EWB${createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex')
      .slice(0, 12)
      .toUpperCase()}`;

    return withRetry(
      async () => {
        const response = await this.fetcher(`${this.endpoint}/ewaybill`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
          },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(
            `GSP generate e-way bill failed with HTTP ${response.status}: ${await response.text()}`
          );
        }
        const body = (await response.json()) as Record<string, unknown>;
        return {
          ewbNo: (body.ewbNo as string) ?? fallbackEwbNo,
          ewbDt: (body.ewbDt as string) ?? new Date().toISOString(),
          ewbValidTill: (body.ewbValidTill as string | undefined) ?? undefined,
          status: (body.status as string) ?? 'ACT',
        };
      },
      { maxRetries: 3 }
    );
  }
}