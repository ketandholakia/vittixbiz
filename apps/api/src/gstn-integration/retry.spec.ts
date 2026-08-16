import { withRetry } from './retry';

describe('withRetry', () => {
  it('returns the result on the first attempt', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(withRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries with backoff and eventually succeeds', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue('ok');

    await expect(
      withRetry(fn, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5 })
    ).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws the last error after exhausting retries', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('boom'));

    await expect(
      withRetry(fn, { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 5 })
    ).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry when isRetryable returns false', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fatal'));

    await expect(
      withRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 1,
        maxDelayMs: 5,
        isRetryable: () => false,
      })
    ).rejects.toThrow('fatal');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});