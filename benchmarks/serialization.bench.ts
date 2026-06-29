/**
 * Serialization Benchmark Suite
 *
 * Measures performance of XDR serialization/deserialization, JSON
 * marshalling/unmarshalling, base64 encoding/decoding, and
 * binary buffer operations that are central to SDK operation.
 */

import { BenchmarkRunner, BenchmarkResult } from './runner';

// ---------------------------------------------------------------------------
// Simulated serialization data
// ---------------------------------------------------------------------------

interface TransactionEnvelope {
  tx: {
    sourceAccount: string;
    fee: number;
    seqNum: bigint;
    operations: Array<{
      type: string;
      body: Record<string, unknown>;
    }>;
    memo: string;
    timeBounds: { minTime: number; maxTime: number };
  };
  signatures: Array<{ hint: string; signature: string }>;
}

function generateMockTransaction(operationCount: number): TransactionEnvelope {
  const operations: TransactionEnvelope['tx']['operations'] = [];
  for (let i = 0; i < operationCount; i++) {
    operations.push({
      type: 'invokeHostFunction',
      body: {
        contractId: `C${'A'.repeat(55)}`,
        functionName: `func_${i}`,
        args: [{ type: 'scvU64', value: i * 1000 }],
      },
    });
  }

  return {
    tx: {
      sourceAccount: 'GAVGME4J7FYFJHTYWTBCMFXJ6H7CGILKCHYAKYBBSNJCNJSWHXK3CKYB',
      fee: 100000,
      seqNum: BigInt(12345678901234567),
      operations,
      memo: 'benchmark-transaction',
      timeBounds: { minTime: 0, maxTime: 9999999999 },
    },
    signatures: [{ hint: 'abcdef12', signature: 'a'.repeat(128) }],
  };
}

// Generate base64-like XDR strings of varying sizes
function generateXdrString(sizeBytes: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < sizeBytes; i++) {
    // Simulate base64 output (4 chars per 3 bytes of source)
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  // Pad to valid base64 length
  while (result.length % 4 !== 0) {
    result += '=';
  }
  return result;
}

// ---------------------------------------------------------------------------
// Run the serialization suite
// ---------------------------------------------------------------------------
export async function runSerializationBenchmarks(
  runner: BenchmarkRunner
): Promise<BenchmarkResult[]> {
  console.log('\n📦 Running Serialization Benchmarks...\n');

  const results: BenchmarkResult[] = [];

  // Pre-generate test data
  const simpleTx = generateMockTransaction(1);
  const complexTx = generateMockTransaction(10);
  const smallXdr = generateXdrString(1024); // 1 KB XDR
  const mediumXdr = generateXdrString(10240); // 10 KB XDR
  const largeXdr = generateXdrString(65536); // 64 KB XDR

  // --- Benchmark 1: JSON serialize simple transaction ---
  results.push(
    await runner.runBenchmark(
      'Serialization: JSON stringify (simple tx)',
      'serialization',
      () => {
        JSON.stringify(simpleTx);
      },
      { threshold: 50000 }
    )
  );

  // --- Benchmark 2: JSON serialize complex transaction ---
  results.push(
    await runner.runBenchmark(
      'Serialization: JSON stringify (complex tx, 10 ops)',
      'serialization',
      () => {
        JSON.stringify(complexTx);
      },
      { threshold: 10000 }
    )
  );

  // --- Benchmark 3: JSON deserialize ---
  const simpleTxJson = JSON.stringify(simpleTx);
  results.push(
    await runner.runBenchmark(
      'Serialization: JSON parse (simple tx)',
      'serialization',
      () => {
        JSON.parse(simpleTxJson);
      },
      { threshold: 30000 }
    )
  );

  // --- Benchmark 4: Base64 encode ---
  const rawBytes = Buffer.alloc(4096, 'benchmark data');
  results.push(
    await runner.runBenchmark(
      'Serialization: Base64 encode (4KB)',
      'serialization',
      () => {
        rawBytes.toString('base64');
      },
      { threshold: 100000 }
    )
  );

  // --- Benchmark 5: Base64 decode ---
  const base64Str = rawBytes.toString('base64');
  results.push(
    await runner.runBenchmark(
      'Serialization: Base64 decode (4KB)',
      'serialization',
      () => {
        Buffer.from(base64Str, 'base64');
      },
      { threshold: 100000 }
    )
  );

  // --- Benchmark 6: XDR string validation (regex) ---
  const BASE64_RE = /^[A-Za-z0-9+/\-_]{4,}[=]{0,2}$/;
  results.push(
    await runner.runBenchmark(
      'Serialization: XDR format validation (regex)',
      'serialization',
      () => {
        BASE64_RE.test(smallXdr);
      },
      { threshold: 200000 }
    )
  );

  // --- Benchmark 7: Buffer allocation and copy ---
  results.push(
    await runner.runBenchmark(
      'Serialization: Buffer alloc + copy (64KB)',
      'serialization',
      () => {
        const buf = Buffer.alloc(65536);
        buf.fill('A', 0, 65536);
        const copy = Buffer.from(buf);
        copy[0] = 0x42; // modify to prevent optimization
      },
      { threshold: 5000 }
    )
  );

  // --- Benchmark 8: XDR length check ---
  results.push(
    await runner.runBenchmark(
      'Serialization: XDR length validation',
      'serialization',
      () => {
        if (largeXdr.length > 65536) throw new Error('too large');
        if (largeXdr.length === 0) throw new Error('empty');
      },
      { threshold: 500000 }
    )
  );

  // --- Benchmark 9: Full serialization round-trip ---
  results.push(
    await runner.runBenchmark(
      'Serialization: Full round-trip (json + base64)',
      'serialization',
      () => {
        const json = JSON.stringify(complexTx);
        const buf = Buffer.from(json, 'utf-8');
        const b64 = buf.toString('base64');
        const decoded = Buffer.from(b64, 'base64').toString('utf-8');
        JSON.parse(decoded);
      },
      { threshold: 2000 }
    )
  );

  // Log results
  for (const result of results) {
    console.log(`  ${runner.formatResult(result)}`);
  }

  return results;
}
