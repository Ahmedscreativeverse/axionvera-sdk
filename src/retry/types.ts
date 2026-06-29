/**
 * Retry engine — public types.
 *
 * A transport-agnostic, pluggable retry layer. Unlike the HTTP interceptor
 * (which retries fetch calls specifically), this engine can wrap any async
 * operation — RPC calls, websocket reconnects, contract invocations — with a
 * configurable {@link RetryPolicy}.
 */

/** Context describing the attempt that just failed. */
export interface RetryContext {
  /** 1-based number of the attempt that just failed. */
  attempt: number;
  /** The error thrown by that attempt. */
  error: unknown;
  /** Milliseconds elapsed since the first attempt began. */
  elapsedMs: number;
}

/** A pluggable retry strategy: decides whether to retry and how long to wait. */
export interface RetryPolicy {
  /** Whether another attempt should be made after the given failure. */
  shouldRetry(context: RetryContext): boolean;
  /** Delay in milliseconds before the next attempt. */
  nextDelayMs(context: RetryContext): number;
}

/** Emitted before each retry so callers can record diagnostics. */
export interface RetryDiagnosticEvent {
  /** The attempt number that just failed (1-based). */
  attempt: number;
  /** Delay that will be waited before the next attempt. */
  delayMs: number;
  /** The error that triggered the retry. */
  error: unknown;
  /** Discriminant/class name of the error (e.g. "NetworkError"). */
  errorType: string;
  /** Milliseconds elapsed so far. */
  elapsedMs: number;
}

/** Options for {@link withRetry}. */
export interface RetryOptions {
  /** Total attempts including the first (default: policy's own / 3). */
  maxAttempts?: number;
  /** Hard cap on total elapsed time across all attempts, in ms. */
  maxElapsedMs?: number;
  /** Abort the retry loop (and reject) when this signal fires. */
  signal?: AbortSignal;
  /**
   * Override the retryability classifier. Defaults to {@link isRetryableError}.
   * Only retried when both this returns true AND the policy's shouldRetry does.
   */
  isRetryable?: (error: unknown) => boolean;
  /** Diagnostics hook invoked before each scheduled retry. */
  onRetry?: (event: RetryDiagnosticEvent) => void;
}
