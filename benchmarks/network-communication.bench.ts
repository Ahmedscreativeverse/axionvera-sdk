/**
 * Network Communication Benchmark Suite
 *
 * Measures performance of network-related operations including RPC
 * response parsing, request batching, timeout handling, WebSocket
 * message processing, and concurrency queue management.
 */

import { BenchmarkRunner, BenchmarkResult } from './runner';

// ---------------------------------------------------------------------------
// Simulated network data
// ---------------------------------------------------------------------------

interface SimulatedRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface SimulatedHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latestLedger: number;
  oldestLedger: number;
  ledgerCloseTime: number;
}

interface SimulatedTransactionResponse {
  status: 'SUCCESS' | 'FAILED' | 'NOT_FOUND';
  envelopeXdr?: string;
  resultXdr?: string;
  resultMetaXdr?: string;
  ledger?: number;
  createdAt?: string;
}

function generateRpcResponse(id: number): SimulatedRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    result: {
      status: 'healthy',
      latestLedger: 5000000 + id,
      oldestLedger: 4999000,
      ledgerCloseTime: Math.floor(Date.now() / 1000),
    },
  };
}

function generateTransactionResponse(): SimulatedTransactionResponse {
  return {
    status: 'SUCCESS',
    envelopeXdr: 'AAAAAgAAAAD...' + 'A'.repeat(2048),
    resultXdr: 'AAAAAAAAAGQAAAAAAAAAAQAAAAAAAAA...' + 'B'.repeat(1024),
    resultMetaXdr: 'AAAAAAAAAAEAAAAC...' + 'C'.repeat(4096),
    ledger: 5000000,
    createdAt: new Date().toISOString(),
  };
}

function validateRpcResponse(response: unknown): SimulatedRpcResponse {
  if (typeof response !== 'object' || response === null) {
    throw new Error('Invalid RPC response: not an object');
  }
  const r = response as Record<string, unknown>;
  if (r.jsonrpc !== '2.0') throw new Error('Invalid RPC version');
  if (typeof r.id !== 'number') throw new Error('Invalid RPC id');
  return response as SimulatedRpcResponse;
}

function parseTransactionStatus(response: SimulatedTransactionResponse): {
  success: boolean;
  ledger: number;
  envelopeSize: number;
} {
  const success = response.status === 'SUCCESS';
  const ledger = response.ledger ?? 0;
  const envelopeSize = (response.envelopeXdr ?? '').length;
  return { success, ledger, envelopeSize };
}

// ---------------------------------------------------------------------------
// Concurrency queue simulation
// ---------------------------------------------------------------------------
class MockConcurrencyQueue {
  private activeRequests = 0;
  private maxConcurrent: number;
  private queue: Array<() => void> = [];

  constructor(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent;
  }

  enqueue(task: () => void): void {
    this.queue.push(task);
    this.processQueue();
  }

  private processQueue(): void {
    while (this.activeRequests < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.activeRequests++;
      task();
      this.activeRequests--;
    }
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  get activeCount(): number {
    return this.activeRequests;
  }
}

// ---------------------------------------------------------------------------
// Simulated retry logic
// ---------------------------------------------------------------------------
function simulateRetryWithBackoff(
  maxRetries: number,
  baseDelayMs: number,
  shouldSucceedOnAttempt: number
): { attempts: number; totalDelayMs: number; succeeded: boolean } {
  let attempts = 0;
  let totalDelayMs = 0;

  while (attempts < maxRetries) {
    attempts++;
    if (attempts >= shouldSucceedOnAttempt) {
      return { attempts, totalDelayMs, succeeded: true };
    }
    const delay = baseDelayMs * Math.pow(2, attempts - 1);
    totalDelayMs += delay;
  }

  return { attempts, totalDelayMs, succeeded: false };
}

// ---------------------------------------------------------------------------
// Run the network communication suite
// ---------------------------------------------------------------------------
export async function runNetworkBenchmarks(runner: BenchmarkRunner): Promise<BenchmarkResult[]> {
  console.log('\n🌐 Running Network Communication Benchmarks...\n');

  const results: BenchmarkResult[] = [];

  // Pre-generate test data
  const rpcResponses = Array.from({ length: 100 }, (_, i) => generateRpcResponse(i));
  const txResponse = generateTransactionResponse();

  // --- Benchmark 1: RPC response validation ---
  const validResponse = generateRpcResponse(1);
  results.push(
    await runner.runBenchmark(
      'Network: RPC response validation',
      'network',
      () => {
        validateRpcResponse(validResponse);
      },
      { threshold: 100000 }
    )
  );

  // --- Benchmark 2: Parse transaction status from response ---
  results.push(
    await runner.runBenchmark(
      'Network: Transaction status parsing',
      'network',
      () => {
        parseTransactionStatus(txResponse);
      },
      { threshold: 100000 }
    )
  );

  // --- Benchmark 3: Concurrency queue enqueue/dequeue ---
  const queue = new MockConcurrencyQueue(10);
  results.push(
    await runner.runBenchmark(
      'Network: Concurrency queue enqueue (100 tasks)',
      'network',
      () => {
        const q = new MockConcurrencyQueue(10);
        for (let i = 0; i < 100; i++) {
          q.enqueue(() => {
            /* no-op */
          });
        }
      },
      { threshold: 5000 }
    )
  );

  // --- Benchmark 4: Retry backoff calculation ---
  results.push(
    await runner.runBenchmark(
      'Network: Retry backoff calculation',
      'network',
      () => {
        simulateRetryWithBackoff(5, 100, 3);
      },
      { threshold: 200000 }
    )
  );

  // --- Benchmark 5: Response field extraction ---
  results.push(
    await runner.runBenchmark(
      'Network: Response field extraction',
      'network',
      () => {
        const r = rpcResponses[Math.floor(Math.random() * rpcResponses.length)];
        const result = r.result as SimulatedHealthResponse;
        const status = result.status;
        const ledger = result.latestLedger;
        void (status + ledger);
      },
      { threshold: 200000 }
    )
  );

  // --- Benchmark 6: Batch response processing ---
  results.push(
    await runner.runBenchmark(
      'Network: Batch process 100 RPC responses',
      'network',
      () => {
        for (const response of rpcResponses) {
          validateRpcResponse(response);
          const result = response.result as SimulatedHealthResponse;
          void (result.status + result.latestLedger);
        }
      },
      { threshold: 500 }
    )
  );

  // --- Benchmark 7: URL validation (for RPC endpoints) ---
  const rpcUrls = [
    'https://soroban-testnet.stellar.org',
    'https://rpc-futurenet.stellar.org',
    'http://localhost:8000/soroban/rpc',
  ];
  results.push(
    await runner.runBenchmark(
      'Network: RPC URL validation',
      'network',
      () => {
        for (const url of rpcUrls) {
          try {
            const parsed = new URL(url);
            void (parsed.hostname + parsed.protocol);
          } catch {
            /* ignore */
          }
        }
      },
      { threshold: 50000 }
    )
  );

  // --- Benchmark 8: Timeout calculation ---
  results.push(
    await runner.runBenchmark(
      'Network: Timeout calculation',
      'network',
      () => {
        const now = Date.now();
        const deadline = now + 30000;
        const elapsed = deadline - now;
        const isExpired = elapsed <= 0;
        void isExpired;
      },
      { threshold: 500000 }
    )
  );

  // Log results
  for (const result of results) {
    console.log(`  ${runner.formatResult(result)}`);
  }

  return results;
}
