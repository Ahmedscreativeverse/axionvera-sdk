/**
 * Retry engine — policies.
 *
 * Concrete {@link RetryPolicy} implementations. `nextDelayMs` is a pure function
 * of the attempt number (and an injectable RNG for jitter), so it is fully
 * unit-testable without timers.
 */

import type { RetryContext, RetryPolicy } from './types';
import { isRetryableError } from './errorClassification';

export type JitterStrategy = 'none' | 'full' | 'equal';

export interface ExponentialBackoffOptions {
  /** Base delay for the first retry, in ms (default: 200). */
  baseDelayMs?: number;
  /** Growth factor applied per attempt (default: 2). */
  factor?: number;
  /** Upper bound on any single delay, in ms (default: 5000). */
  maxDelayMs?: number;
  /** Total attempts including the first (default: 3). */
  maxAttempts?: number;
  /**
   * Jitter strategy (default: 'full'):
   *  - 'none'  → deterministic backoff.
   *  - 'full'  → random in [0, computed].
   *  - 'equal' → computed/2 + random in [0, computed/2].
   */
  jitter?: JitterStrategy;
  /** Retryability classifier (default: {@link isRetryableError}). */
  isRetryable?: (error: unknown) => boolean;
  /** Injectable RNG in [0, 1) for deterministic tests (default: Math.random). */
  rng?: () => number;
}

/**
 * Exponential backoff with optional jitter and a capped delay.
 *
 * @example
 * const policy = new ExponentialBackoffPolicy({ baseDelayMs: 100, maxAttempts: 5 });
 * await withRetry(() => client.getLatestLedger(), policy);
 */
export class ExponentialBackoffPolicy implements RetryPolicy {
  private readonly baseDelayMs: number;
  private readonly factor: number;
  private readonly maxDelayMs: number;
  private readonly maxAttempts: number;
  private readonly jitter: JitterStrategy;
  private readonly isRetryable: (error: unknown) => boolean;
  private readonly rng: () => number;

  constructor(options: ExponentialBackoffOptions = {}) {
    this.baseDelayMs = options.baseDelayMs ?? 200;
    this.factor = options.factor ?? 2;
    this.maxDelayMs = options.maxDelayMs ?? 5000;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.jitter = options.jitter ?? 'full';
    this.isRetryable = options.isRetryable ?? isRetryableError;
    this.rng = options.rng ?? Math.random;
  }

  shouldRetry(context: RetryContext): boolean {
    if (context.attempt >= this.maxAttempts) return false;
    return this.isRetryable(context.error);
  }

  nextDelayMs(context: RetryContext): number {
    const raw = this.baseDelayMs * Math.pow(this.factor, context.attempt - 1);
    const capped = Math.min(this.maxDelayMs, raw);
    switch (this.jitter) {
      case 'none':
        return Math.round(capped);
      case 'equal':
        return Math.round(capped / 2 + this.rng() * (capped / 2));
      case 'full':
      default:
        return Math.round(this.rng() * capped);
    }
  }
}

/** Fixed-delay policy: same wait between every attempt. */
export class FixedDelayPolicy implements RetryPolicy {
  private readonly delayMs: number;
  private readonly maxAttempts: number;
  private readonly isRetryable: (error: unknown) => boolean;

  constructor(
    options: { delayMs?: number; maxAttempts?: number; isRetryable?: (e: unknown) => boolean } = {}
  ) {
    this.delayMs = options.delayMs ?? 200;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.isRetryable = options.isRetryable ?? isRetryableError;
  }

  shouldRetry(context: RetryContext): boolean {
    return context.attempt < this.maxAttempts && this.isRetryable(context.error);
  }

  nextDelayMs(): number {
    return this.delayMs;
  }
}
