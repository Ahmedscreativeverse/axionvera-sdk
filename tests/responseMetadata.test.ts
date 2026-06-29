import {
  generateRequestId,
  buildResponseMetadata,
  buildErrorMetadata,
  wrapWithMetadata,
  maybeWrap,
} from '../src/http/responseMetadata';
import type { ResponseMetadata, WithMetadata } from '../src/types/common';
import { StellarClient } from '../src/client/stellarClient';
import { AxionveraRPCError } from '../src/errors/axionveraError';
import { setupMswTest, overrideHandlers } from '../src/index';
import { rest } from 'msw';

// ---------------------------------------------------------------------------
// Unit tests – helper functions
// ---------------------------------------------------------------------------
describe('Response Metadata Helpers', () => {
  describe('generateRequestId', () => {
    it('should generate a unique request ID with axv- prefix', () => {
      const id = generateRequestId();
      expect(id).toMatch(/^axv-[a-z0-9]+-[a-z0-9]+$/);
    });

    it('should generate unique IDs on successive calls', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateRequestId()));
      expect(ids.size).toBe(100);
    });
  });

  describe('buildResponseMetadata', () => {
    it('should build metadata with required fields', () => {
      const start = Date.now() - 42;
      const meta = buildResponseMetadata({
        startTime: start,
        statusCode: 200,
        operation: 'getHealth',
      });

      expect(meta.timestamp).toBe(new Date(start).toISOString());
      expect(meta.durationMs).toBeGreaterThanOrEqual(42);
      expect(meta.statusCode).toBe(200);
      expect(meta.operation).toBe('getHealth');
      expect(meta.clientRequestId).toMatch(/^axv-/);
      expect(meta.requestId).toBeUndefined();
      expect(meta.correlationId).toBeUndefined();
      expect(meta.traceId).toBeUndefined();
      expect(meta.network).toBeUndefined();
    });

    it('should include network when provided', () => {
      const meta = buildResponseMetadata({
        startTime: Date.now(),
        statusCode: 200,
        operation: 'getHealth',
        network: 'testnet',
      });
      expect(meta.network).toBe('testnet');
    });

    it('should accept a custom clientRequestId', () => {
      const meta = buildResponseMetadata({
        startTime: Date.now(),
        statusCode: 200,
        operation: 'getHealth',
        clientRequestId: 'my-custom-id',
      });
      expect(meta.clientRequestId).toBe('my-custom-id');
    });

    it('should extract x-request-id from Headers object', () => {
      const headers = new Headers({ 'x-request-id': 'req-abc-123' });
      const meta = buildResponseMetadata({
        startTime: Date.now(),
        statusCode: 200,
        operation: 'getHealth',
        headers,
      });
      expect(meta.requestId).toBe('req-abc-123');
    });

    it('should extract x-correlation-id from Headers object', () => {
      const headers = new Headers({ 'x-correlation-id': 'corr-xyz-789' });
      const meta = buildResponseMetadata({
        startTime: Date.now(),
        statusCode: 200,
        operation: 'getHealth',
        headers,
      });
      expect(meta.correlationId).toBe('corr-xyz-789');
    });

    it('should extract traceparent from Headers object', () => {
      const headers = new Headers({ 'traceparent': '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' });
      const meta = buildResponseMetadata({
        startTime: Date.now(),
        statusCode: 200,
        operation: 'getHealth',
        headers,
      });
      expect(meta.traceId).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    });

    it('should extract headers from plain Record<string, string>', () => {
      const headers: Record<string, string> = {
        'x-request-id': 'plain-req-456',
        'x-correlation-id': 'plain-corr-012',
      };
      const meta = buildResponseMetadata({
        startTime: Date.now(),
        statusCode: 200,
        operation: 'getHealth',
        headers,
      });
      expect(meta.requestId).toBe('plain-req-456');
      expect(meta.correlationId).toBe('plain-corr-012');
    });

    it('should handle case-insensitive header names', () => {
      const headers: Record<string, string> = {
        'X-Request-ID': 'CaseReq-999',
      };
      const meta = buildResponseMetadata({
        startTime: Date.now(),
        statusCode: 200,
        operation: 'getHealth',
        headers,
      });
      expect(meta.requestId).toBe('CaseReq-999');
    });

    it('should NOT expose sensitive headers', () => {
      const headers = new Headers({
        'authorization': 'Bearer secret-token',
        'x-api-key': 'sk-12345',
        'cookie': 'session=abc',
        'x-request-id': 'visible-req',
      });
      const meta = buildResponseMetadata({
        startTime: Date.now(),
        statusCode: 200,
        operation: 'getHealth',
        headers,
      });
      // Only safe headers should be present
      expect(meta.requestId).toBe('visible-req');
      // Sensitive headers must never appear on metadata
      expect((meta as any).authorization).toBeUndefined();
      expect((meta as any)['x-api-key']).toBeUndefined();
      expect((meta as any).cookie).toBeUndefined();
    });

    it('should handle no headers gracefully', () => {
      const meta = buildResponseMetadata({
        startTime: Date.now(),
        statusCode: 200,
        operation: 'getHealth',
      });
      expect(meta.requestId).toBeUndefined();
      expect(meta.correlationId).toBeUndefined();
      expect(meta.traceId).toBeUndefined();
    });
  });

  describe('buildErrorMetadata', () => {
    it('should build metadata for error paths', () => {
      const start = Date.now() - 100;
      const meta = buildErrorMetadata({
        startTime: start,
        operation: 'sendTransaction',
        statusCode: 500,
      });
      expect(meta.operation).toBe('sendTransaction');
      expect(meta.statusCode).toBe(500);
      expect(meta.durationMs).toBeGreaterThanOrEqual(100);
    });

    it('should default statusCode to 0 when not provided', () => {
      const meta = buildErrorMetadata({
        startTime: Date.now(),
        operation: 'getHealth',
      });
      expect(meta.statusCode).toBe(0);
    });
  });

  describe('wrapWithMetadata', () => {
    it('should wrap data with metadata', () => {
      const data = { status: 'healthy' };
      const meta: ResponseMetadata = {
        timestamp: new Date().toISOString(),
        durationMs: 10,
        statusCode: 200,
        operation: 'getHealth',
        clientRequestId: 'axv-test',
      };
      const wrapped = wrapWithMetadata(data, meta);
      expect(wrapped.data).toEqual(data);
      expect(wrapped.meta).toBe(meta);
    });
  });

  describe('maybeWrap', () => {
    const data = { value: 42 };
    const meta: ResponseMetadata = {
      timestamp: new Date().toISOString(),
      durationMs: 10,
      statusCode: 200,
      operation: 'test',
      clientRequestId: 'axv-test',
    };

    it('should return raw data when includeMeta is false', () => {
      const result = maybeWrap(false, data, meta);
      expect(result).toBe(data);
    });

    it('should return raw data when includeMeta is undefined', () => {
      const result = maybeWrap(undefined, data, meta);
      expect(result).toBe(data);
    });

    it('should return wrapped data when includeMeta is true', () => {
      const result = maybeWrap(true, data, meta);
      expect(result).toEqual({ data, meta });
    });
  });
});

// ---------------------------------------------------------------------------
// Integration tests – StellarClient with metadata
// ---------------------------------------------------------------------------
describe('StellarClient with Response Metadata', () => {
  setupMswTest();

  describe('Backwards compatibility (default behaviour)', () => {
    let client: StellarClient;

    beforeEach(() => {
      client = new StellarClient({ network: 'testnet' });
    });

    it('should return plain response by default from getHealth', async () => {
      const health = await client.getHealth();
      expect(health).toHaveProperty('status');
      // Must NOT be wrapped
      expect((health as any).meta).toBeUndefined();
      expect((health as any).data).toBeUndefined();
    });

    it('should return plain response with includeMeta: false', async () => {
      const health = await client.getHealth({ includeMeta: false });
      expect(health).toHaveProperty('status');
      expect((health as any).meta).toBeUndefined();
    });
  });

  describe('Opt-in metadata (includeMeta: true)', () => {
    let client: StellarClient;

    beforeEach(() => {
      client = new StellarClient({ network: 'testnet' });
    });

    it('should return { data, meta } from getHealth when includeMeta is true', async () => {
      const result = await client.getHealth({ includeMeta: true });
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');

      const wrapped = result as WithMetadata<any>;
      expect(wrapped.data).toHaveProperty('status');
      expect(wrapped.meta.operation).toBe('getHealth');
      expect(wrapped.meta.clientRequestId).toMatch(/^axv-/);
      expect(wrapped.meta.durationMs).toBeGreaterThanOrEqual(0);
      expect(wrapped.meta.statusCode).toBe(200);
      expect(wrapped.meta.network).toBe('testnet');
      expect(wrapped.meta.timestamp).toBeTruthy();
    });

    it('should have monotonically increasing timestamps across calls', async () => {
      const r1 = await client.getHealth({ includeMeta: true });
      const r2 = await client.getHealth({ includeMeta: true });
      const w1 = r1 as WithMetadata<any>;
      const w2 = r2 as WithMetadata<any>;
      // Each call should have a unique clientRequestId
      expect(w1.meta.clientRequestId).not.toBe(w2.meta.clientRequestId);
      // Timestamps should be in order
      expect(new Date(w1.meta.timestamp).getTime()).toBeLessThanOrEqual(
        new Date(w2.meta.timestamp).getTime()
      );
    });

    it('should include reasonable duration in metadata', async () => {
      const result = await client.getHealth({ includeMeta: true });
      const wrapped = result as WithMetadata<any>;
      expect(wrapped.meta.durationMs).toBeGreaterThanOrEqual(0);
      // Should be a reasonable duration for a mocked call
      expect(wrapped.meta.durationMs).toBeLessThan(5000);
    });
  });

  describe('Global includeMeta on client', () => {
    it('should wrap responses when client is created with includeMeta: true', async () => {
      const client = new StellarClient({ network: 'testnet', includeMeta: true });
      const result = await client.getHealth();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      const wrapped = result as WithMetadata<any>;
      expect(wrapped.meta.operation).toBe('getHealth');
    });

    it('should allow per-call override to disable metadata', async () => {
      const client = new StellarClient({ network: 'testnet', includeMeta: true });
      const result = await client.getHealth({ includeMeta: false });
      expect((result as any).meta).toBeUndefined();
      expect(result).toHaveProperty('status');
    });

    it('should default to no metadata when client option is not set', async () => {
      const client = new StellarClient({ network: 'testnet' });
      const result = await client.getHealth();
      expect((result as any).meta).toBeUndefined();
      expect(result).toHaveProperty('status');
    });
  });

  describe('Error paths preserve metadata', () => {
    let client: StellarClient;

    beforeEach(() => {
      client = new StellarClient({ network: 'testnet' });
    });

    it('should propagate requestId when error constructor receives it', () => {
      // Direct test: AxionveraError subclasses preserve requestId from options
      const err = new AxionveraRPCError('test error', 'getHealth', {
        requestId: 'axv-test-request-id',
      });
      expect(err.requestId).toBe('axv-test-request-id');
    });

    it('should throw error (without metadata) when includeMeta is false', async () => {
      overrideHandlers(
        rest.get('https://soroban-testnet.stellar.org/health', (_req, res, ctx) => {
          return res(ctx.status(500), ctx.json({ error: 'Internal Server Error' }));
        })
      );

      try {
        await client.getHealth({ includeMeta: false });
        fail('Expected error was not thrown');
      } catch (error: any) {
        // Error is thrown – verify it's an error instance
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBeTruthy();
      }
    });

    it('should throw error when includeMeta is true', async () => {
      overrideHandlers(
        rest.get('https://soroban-testnet.stellar.org/health', (_req, res, ctx) => {
          return res(ctx.status(500), ctx.json({ error: 'Internal Server Error' }));
        })
      );

      try {
        await client.getHealth({ includeMeta: true });
        fail('Expected error was not thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBeTruthy();
      }
    });
  });

  describe('Missing headers (graceful degradation)', () => {
    it('should produce valid metadata even when server sends no correlation headers', async () => {
      const client = new StellarClient({ network: 'testnet' });
      const result = await client.getHealth({ includeMeta: true });
      const wrapped = result as WithMetadata<any>;
      // No correlation headers in mock – fields should be undefined
      expect(wrapped.meta.requestId).toBeUndefined();
      expect(wrapped.meta.correlationId).toBeUndefined();
      expect(wrapped.meta.traceId).toBeUndefined();
      // But clientRequestId and other core fields must be present
      expect(wrapped.meta.clientRequestId).toMatch(/^axv-/);
      expect(wrapped.meta.statusCode).toBe(200);
      expect(wrapped.meta.timestamp).toBeTruthy();
    });
  });
});
