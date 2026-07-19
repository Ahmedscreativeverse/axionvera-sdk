import type { ResponseMetadata, WithMetadata } from '../types/common';

export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `axv-${timestamp}-${random}`;
}

function getHeader(
  headers: Headers | Record<string, string> | undefined,
  ...names: string[]
): string | undefined {
  if (!headers) return undefined;
  for (const name of names) {
    if (headers instanceof Headers) {
      const val = headers.get(name);
      if (val) return val;
    } else {
      const lower = name.toLowerCase();
      for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === lower) return value;
      }
    }
  }
  return undefined;
}

export function buildResponseMetadata(params: {
  startTime: number;
  statusCode: number;
  operation: string;
  network?: string;
  headers?: Headers | Record<string, string>;
  clientRequestId?: string;
}): ResponseMetadata {
  const durationMs = Date.now() - params.startTime;
  const clientRequestId = params.clientRequestId ?? generateRequestId();

  const meta: ResponseMetadata = {
    timestamp: new Date(params.startTime).toISOString(),
    durationMs,
    clientRequestId,
    statusCode: params.statusCode,
    operation: params.operation,
  };

  if (params.network) meta.network = params.network;

  if (params.headers) {
    const requestId = getHeader(params.headers, 'x-request-id', 'x-amzn-requestid');
    if (requestId) meta.requestId = requestId;
    const correlationId = getHeader(params.headers, 'x-correlation-id');
    if (correlationId) meta.correlationId = correlationId;
    const traceId = getHeader(params.headers, 'traceparent', 'x-trace-id', 'x-amzn-trace-id', 'x-cloud-trace-context');
    if (traceId) meta.traceId = traceId;
  }

  return meta;
}

export function maybeWrap<T>(
  includeMeta: boolean | undefined,
  data: T,
  meta: ResponseMetadata,
): T | WithMetadata<T> {
  if (includeMeta) return { data, meta };
  return data;
}
