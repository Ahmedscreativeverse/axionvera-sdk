/**
 * Safe response metadata exposed to SDK consumers for diagnostics.
 *
 * Consumers opt into metadata by passing `includeMeta: true` to service
 * methods. When enabled the return type changes from `T` to `{ data: T; meta: ResponseMetadata }`.
 *
 * **Security note:** The metadata extractor intentionally strips headers
 * containing API keys, tokens, or other sensitive values. Only safe
 * correlation / tracing headers are captured.
 */

/**
 * Safe response metadata captured from a service call.
 */
export interface ResponseMetadata {
  /** ISO-8601 timestamp of when the request was initiated. */
  timestamp: string;

  /** Wall-clock duration of the request in milliseconds. */
  durationMs: number;

  /**
   * Server-assigned request ID extracted from the `X-Request-Id` response
   * header (or similar).  `undefined` when the server did not send one.
   */
  requestId?: string;

  /**
   * Correlation ID extracted from the `X-Correlation-Id` response header.
   * `undefined` when the server did not send one.
   */
  correlationId?: string;

  /**
   * W3C trace context extracted from the `Traceparent` response header.
   * `undefined` when the server did not send one.
   */
  traceId?: string;

  /**
   * Client-generated unique identifier for this request. Always present.
   * Useful for correlating client-side logs with server-side traces even
   * when the server does not emit tracking headers.
   */
  clientRequestId: string;

  /** HTTP status code of the response. */
  statusCode: number;

  /** The Stellar network this request was made against (e.g. "testnet"). */
  network?: string;

  /** The logical operation name (e.g. "getHealth", "sendTransaction"). */
  operation: string;
}

/**
 * Wrapper type returned when a consumer opts into metadata via
 * `includeMeta: true`.
 */
export interface WithMetadata<T> {
  /** The original response body (unchanged). */
  data: T;

  /** Safe response metadata for diagnostics and support. */
  meta: ResponseMetadata;
}

/**
 * Options common to every service method that supports metadata.
 */
export interface ServiceMethodOptions {
  /**
   * When `true` the method returns `{ data, meta }` instead of the raw
   * response body.  Defaults to `false` (backwards-compatible).
   */
  includeMeta?: boolean;
}
