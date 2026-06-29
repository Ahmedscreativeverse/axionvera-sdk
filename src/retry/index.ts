/**
 * Retry engine — public entry point.
 *
 * A transport-agnostic, pluggable retry layer with configurable policies,
 * exponential backoff, typed error classification, and diagnostics.
 */

export type { RetryPolicy, RetryContext, RetryOptions, RetryDiagnosticEvent } from './types';

export { ExponentialBackoffPolicy, FixedDelayPolicy } from './policies';
export type { ExponentialBackoffOptions, JitterStrategy } from './policies';

export { isRetryableError, errorTypeName, RETRYABLE_STATUS_CODES } from './errorClassification';

export { withRetry, RetryAbortedError } from './withRetry';
