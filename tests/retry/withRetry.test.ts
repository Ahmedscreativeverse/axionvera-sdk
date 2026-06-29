import {
  withRetry,
  ExponentialBackoffPolicy,
  RetryAbortedError,
  type RetryDiagnosticEvent,
} from '../../src/retry';
import { NetworkError, ValidationError, TimeoutError } from '../../src/errors/axionveraError';

// Fast, deterministic policy: tiny delays, no jitter.
const fastPolicy = (maxAttempts = 3) =>
  new ExponentialBackoffPolicy({ baseDelayMs: 1, maxDelayMs: 4, jitter: 'none', maxAttempts });

describe('withRetry', () => {
  it('resolves on the first success without retrying', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(withRetry(fn, fastPolicy())).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures then succeeds', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new NetworkError('blip'))
      .mockRejectedValueOnce(new TimeoutError('slow'))
      .mockResolvedValue('recovered');
    await expect(withRetry(fn, fastPolicy(5))).resolves.toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('gives up after maxAttempts and throws the last error', async () => {
    const err = new NetworkError('persistent');
    const fn = jest.fn().mockRejectedValue(err);
    await expect(withRetry(fn, fastPolicy(3))).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry a non-retryable error', async () => {
    const err = new ValidationError('bad request');
    const fn = jest.fn().mockRejectedValue(err);
    await expect(withRetry(fn, fastPolicy(5))).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('emits an onRetry diagnostic event per retry', async () => {
    const events: RetryDiagnosticEvent[] = [];
    const fn = jest.fn().mockRejectedValueOnce(new NetworkError('1')).mockResolvedValue('done');
    await withRetry(fn, fastPolicy(5), { onRetry: (e) => events.push(e) });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ attempt: 1, errorType: 'NetworkError' });
    expect(typeof events[0].delayMs).toBe('number');
  });

  it('aborts immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fn = jest.fn().mockResolvedValue('never');
    await expect(withRetry(fn, fastPolicy(), { signal: controller.signal })).rejects.toBeInstanceOf(
      RetryAbortedError
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it('stops retrying when the signal aborts mid-backoff', async () => {
    const controller = new AbortController();
    const fn = jest.fn().mockRejectedValue(new NetworkError('blip'));
    const policy = new ExponentialBackoffPolicy({
      baseDelayMs: 50,
      jitter: 'none',
      maxAttempts: 5,
    });
    const promise = withRetry(fn, policy, { signal: controller.signal });
    // Abort while the first backoff is sleeping.
    setTimeout(() => controller.abort(), 10);
    await expect(promise).rejects.toBeInstanceOf(RetryAbortedError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
