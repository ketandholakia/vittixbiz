import { MockGspAdapter } from './mock-gsp.adapter';
import { EInvoicePayload, EwayBillPayload } from './gsp-adapter';

function jsonResponse(body: unknown, ok = true, status = 200): any {
  return {
    ok,
    status,
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
    json: jest.fn().mockResolvedValue(body),
  };
}

const minimalInvoice = { Version: '1.1' } as EInvoicePayload;

describe('MockGspAdapter', () => {
  it('generates an IRN and maps the GSP response fields', async () => {
    const fetcher = jest.fn().mockResolvedValue(
      jsonResponse({
        irn: 'IRN123456789',
        ackNo: 'ACK001',
        ackDt: '2026-07-05T10:00:00Z',
        status: 'ACT',
      })
    );
    const adapter = new MockGspAdapter({
      endpoint: 'https://gsp.example.test',
      authToken: 'secret-token',
      fetcher,
    });

    const result = await adapter.generateIrn(minimalInvoice);

    expect(result.irn).toBe('IRN123456789');
    expect(result.ackNo).toBe('ACK001');
    expect(result.ackDt).toBe('2026-07-05T10:00:00Z');
    expect(result.status).toBe('ACT');

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://gsp.example.test');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer secret-token');
  });

  it('retries a failing HTTP call before succeeding', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 503))
      .mockResolvedValueOnce(jsonResponse({}, false, 503))
      .mockResolvedValueOnce(
        jsonResponse({
          irn: 'IRN-OK',
          ackNo: 'ACK-OK',
          ackDt: '2026-07-05T10:00:00Z',
          status: 'ACT',
        })
      );
    const adapter = new MockGspAdapter({ endpoint: 'https://gsp.example.test', fetcher });

    const result = await adapter.generateIrn(minimalInvoice);

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(result.irn).toBe('IRN-OK');
  });

  it('throws after exhausting retries on a persistent failure', async () => {
    const fetcher = jest.fn().mockResolvedValue(jsonResponse({}, false, 500));
    const adapter = new MockGspAdapter({ endpoint: 'https://gsp.example.test', fetcher });

    await expect(adapter.generateIrn(minimalInvoice)).rejects.toThrow(
      'GSP generate IRN failed'
    );
    expect(fetcher).toHaveBeenCalledTimes(4); // 1 attempt + 3 retries
  });

  it('cancels an IRN with the reason', async () => {
    const fetcher = jest.fn().mockResolvedValue(jsonResponse({ success: true }));
    const adapter = new MockGspAdapter({ endpoint: 'https://gsp.example.test', fetcher });

    await expect(adapter.cancelIrn('IRN123', 'Duplicate entry')).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('generates an e-way bill', async () => {
    const fetcher = jest.fn().mockResolvedValue(
      jsonResponse({ ewbNo: 'EWB123', ewbDt: '2026-07-05T10:00:00Z', status: 'ACT' })
    );
    const adapter = new MockGspAdapter({ endpoint: 'https://gsp.example.test', fetcher });

    const payload = { Version: '1.0', DocType: 'INV' } as unknown as EwayBillPayload;
    const result = await adapter.generateEwayBill(payload);

    expect(result.ewbNo).toBe('EWB123');
    expect(result.status).toBe('ACT');
  });
});