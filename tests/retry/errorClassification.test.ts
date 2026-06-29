import { isRetryableError, errorTypeName, RETRYABLE_STATUS_CODES } from '../../src/retry';
import {
  NetworkError,
  TimeoutError,
  RateLimitError,
  ValidationError,
  AuthenticationError,
  AxionveraError,
} from '../../src/errors/axionveraError';

describe('isRetryableError', () => {
  it('treats transient SDK errors as retryable', () => {
    expect(isRetryableError(new NetworkError('down'))).toBe(true);
    expect(isRetryableError(new TimeoutError('slow'))).toBe(true);
    expect(isRetryableError(new RateLimitError('429'))).toBe(true);
  });

  it('treats request-fault SDK errors as non-retryable', () => {
    expect(isRetryableError(new ValidationError('bad input'))).toBe(false);
    expect(isRetryableError(new AuthenticationError('nope'))).toBe(false);
  });

  it('classifies a generic AxionveraError by its HTTP status code', () => {
    expect(isRetryableError(new AxionveraError('x', { statusCode: 503 }))).toBe(true);
    expect(isRetryableError(new AxionveraError('x', { statusCode: 400 }))).toBe(false);
  });

  it('classifies non-SDK errors by status code, defaulting to false', () => {
    expect(isRetryableError({ statusCode: 429 })).toBe(true);
    expect(isRetryableError({ statusCode: 404 })).toBe(false);
    expect(isRetryableError(new Error('plain'))).toBe(false);
    expect(isRetryableError('just a string')).toBe(false);
  });

  it('exposes the canonical retryable status codes', () => {
    expect(RETRYABLE_STATUS_CODES.has(429)).toBe(true);
    expect(RETRYABLE_STATUS_CODES.has(503)).toBe(true);
    expect(RETRYABLE_STATUS_CODES.has(400)).toBe(false);
  });
});

describe('errorTypeName', () => {
  it('returns the SDK discriminant / error name / typeof', () => {
    expect(errorTypeName(new NetworkError('x'))).toBe('NetworkError');
    expect(errorTypeName(new Error('x'))).toBe('Error');
    expect(errorTypeName(42)).toBe('number');
  });
});
