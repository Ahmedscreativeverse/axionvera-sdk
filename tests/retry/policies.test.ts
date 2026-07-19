import { ExponentialBackoffPolicy, FixedDelayPolicy } from '../../src/retry';
import { NetworkError, ValidationError } from '../../src/errors/axionveraError';

const ctx = (attempt: number, error: unknown = new NetworkError('x')) => ({
  attempt,
  error,
  elapsedMs: 0,
});

describe('ExponentialBackoffPolicy', () => {
  it('computes deterministic exponential delays with jitter "none"', () => {
    const p = new ExponentialBackoffPolicy({ baseDelayMs: 100, factor: 2, jitter: 'none' });
    expect(p.nextDelayMs(ctx(1))).toBe(100); // 100 * 2^0
    expect(p.nextDelayMs(ctx(2))).toBe(200); // 100 * 2^1
    expect(p.nextDelayMs(ctx(3))).toBe(400); // 100 * 2^2
  });

  it('caps the delay at maxDelayMs', () => {
    const p = new ExponentialBackoffPolicy({
      baseDelayMs: 1000,
      factor: 10,
      maxDelayMs: 5000,
      jitter: 'none',
    });
    expect(p.nextDelayMs(ctx(3))).toBe(5000);
  });

  it('full jitter stays within [0, computed] using the injected rng', () => {
    const p = new ExponentialBackoffPolicy({ baseDelayMs: 100, jitter: 'full', rng: () => 0.5 });
    expect(p.nextDelayMs(ctx(1))).toBe(50); // 0.5 * 100
  });

  it('stops retrying once the attempt cap is reached', () => {
    const p = new ExponentialBackoffPolicy({ maxAttempts: 3 });
    expect(p.shouldRetry(ctx(2))).toBe(true);
    expect(p.shouldRetry(ctx(3))).toBe(false);
  });

  it('does not retry non-retryable errors regardless of attempt', () => {
    const p = new ExponentialBackoffPolicy({ maxAttempts: 5 });
    expect(p.shouldRetry(ctx(1, new ValidationError('bad')))).toBe(false);
  });

  it('honours a custom isRetryable override', () => {
    const p = new ExponentialBackoffPolicy({ maxAttempts: 5, isRetryable: () => true });
    expect(p.shouldRetry(ctx(1, new ValidationError('bad')))).toBe(true);
  });
});

describe('FixedDelayPolicy', () => {
  it('returns the same delay every time and respects the attempt cap', () => {
    const p = new FixedDelayPolicy({ delayMs: 250, maxAttempts: 2 });
    expect(p.nextDelayMs()).toBe(250);
    expect(p.shouldRetry(ctx(1))).toBe(true);
    expect(p.shouldRetry(ctx(2))).toBe(false);
  });
});
