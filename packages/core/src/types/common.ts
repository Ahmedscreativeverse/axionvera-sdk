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
  /** Server-assigned request ID extracted from response headers. */
  requestId?: string;
  /** Correlation ID extracted from the `X-Correlation-Id` response header. */
  correlationId?: string;
  /** W3C trace context extracted from the `Traceparent` response header. */
  traceId?: string;
  /** Client-generated unique identifier for this request. Always present. */
  clientRequestId: string;
  /** HTTP status code of the response. */
  statusCode: number;
  /** The Stellar network this request was made against. */
  network?: string;
  /** The logical operation name. */
  operation: string;
}

/** Wrapper type returned when a consumer opts into metadata. */
export interface WithMetadata<T> {
  data: T;
  meta: ResponseMetadata;
}

/** Options common to every service method that supports metadata. */
export interface ServiceMethodOptions {
  /** When true, returns `{ data, meta }` instead of raw response. */
  includeMeta?: boolean;
}
