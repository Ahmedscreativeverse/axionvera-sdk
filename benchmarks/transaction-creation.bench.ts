/**
 * Transaction Creation Benchmark Suite
 *
 * Measures performance of transaction building, signing simulation,
 * fee calculation, and transaction validation operations that are
 * central to the SDK's transaction pipeline.
 */

import { BenchmarkRunner, BenchmarkResult } from './runner';

// ---------------------------------------------------------------------------
// Simulated transaction data
// ---------------------------------------------------------------------------

interface SimulatedOperation {
  type: 'payment' | 'invokeHostFunction' | 'createAccount' | 'changeTrust' | 'manageData';
  source?: string;
  body: Record<string, unknown>;
}

interface SimulatedTransaction {
  sourceAccount: string;
  fee: string;
  sequence: string;
  operations: SimulatedOperation[];
  memo?: string;
  timeBounds?: { minTime: number; maxTime: number };
}

const VALID_ACCOUNT_ID = 'GAVGME4J7FYFJHTYWTBCMFXJ6H7CGILKCHYAKYBBSNJCNJSWHXK3CKYB';
const ACCOUNT_ID_RE = /^G[A-Z0-9]{55}$/;

function randomAccountId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = 'G';
  for (let i = 0; i < 55; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function generateTransaction(opCount: number): SimulatedTransaction {
  const operations: SimulatedOperation[] = [];
  const opTypes: SimulatedOperation['type'][] = [
    'payment',
    'invokeHostFunction',
    'createAccount',
    'changeTrust',
    'manageData',
  ];

  for (let i = 0; i < opCount; i++) {
    operations.push({
      type: opTypes[i % opTypes.length],
      source: i % 2 === 0 ? randomAccountId() : undefined,
      body: {
        destination: randomAccountId(),
        amount: (i + 1) * 1000,
        asset: 'native',
      },
    });
  }

  return {
    sourceAccount: randomAccountId(),
    fee: (100000 + opCount * 1000).toString(),
    sequence: (1234567890123 + opCount).toString(),
    operations,
    memo: `benchmark-tx-${opCount}`,
    timeBounds: { minTime: 0, maxTime: Date.now() + 300000 },
  };
}

function calculateFee(operations: SimulatedOperation[]): number {
  const BASE_FEE = 100;
  const OP_FEE = 100;
  return BASE_FEE + operations.length * OP_FEE;
}

function estimateResourceCost(operations: SimulatedOperation[]): {
  cpuInstructions: number;
  ramBytes: number;
  totalStroops: number;
} {
  let cpuInstructions = 0;
  let ramBytes = 0;

  for (const op of operations) {
    switch (op.type) {
      case 'payment':
        cpuInstructions += 10000;
        ramBytes += 256;
        break;
      case 'invokeHostFunction':
        cpuInstructions += 500000;
        ramBytes += 4096;
        break;
      case 'createAccount':
        cpuInstructions += 200000;
        ramBytes += 1024;
        break;
      case 'changeTrust':
        cpuInstructions += 50000;
        ramBytes += 512;
        break;
      case 'manageData':
        cpuInstructions += 30000;
        ramBytes += 1024;
        break;
    }
  }

  const totalStroops = Math.ceil(cpuInstructions * 1.15) + ramBytes * 100;
  return { cpuInstructions, ramBytes, totalStroops };
}

function validateAccountId(id: string): boolean {
  return ACCOUNT_ID_RE.test(id) && id.length === 56;
}

function generateTransactionHash(tx: SimulatedTransaction): string {
  // Simulate SHA-256 hashing of transaction fields
  const canonical = [
    tx.sourceAccount,
    tx.fee,
    tx.sequence,
    tx.operations.map((o) => `${o.type}:${JSON.stringify(o.body)}`).join('|'),
    tx.memo ?? '',
    tx.timeBounds ? `${tx.timeBounds.minTime}:${tx.timeBounds.maxTime}` : '',
  ].join('|');
  // Simple hash simulation (in practice, would use crypto.createHash('sha256'))
  let hash = 0;
  for (let i = 0; i < canonical.length; i++) {
    const char = canonical.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

function applyFeeBuffer(baseFee: number, multiplier: number): number {
  return Math.ceil(baseFee * multiplier);
}

// ---------------------------------------------------------------------------
// Run the transaction creation suite
// ---------------------------------------------------------------------------
export async function runTransactionCreationBenchmarks(
  runner: BenchmarkRunner
): Promise<BenchmarkResult[]> {
  console.log('\n💳 Running Transaction Creation Benchmarks...\n');

  const results: BenchmarkResult[] = [];

  // Pre-generate test data
  const simpleTx1 = generateTransaction(1);
  const mediumTx5 = generateTransaction(5);
  const complexTx20 = generateTransaction(20);

  // --- Benchmark 1: Generate simple transaction (1 op) ---
  results.push(
    await runner.runBenchmark(
      'Transaction: Build simple tx (1 op)',
      'transaction',
      () => {
        generateTransaction(1);
      },
      { threshold: 50000 }
    )
  );

  // --- Benchmark 2: Generate medium transaction (5 ops) ---
  results.push(
    await runner.runBenchmark(
      'Transaction: Build medium tx (5 ops)',
      'transaction',
      () => {
        generateTransaction(5);
      },
      { threshold: 20000 }
    )
  );

  // --- Benchmark 3: Generate complex transaction (20 ops) ---
  results.push(
    await runner.runBenchmark(
      'Transaction: Build complex tx (20 ops)',
      'transaction',
      () => {
        generateTransaction(20);
      },
      { threshold: 5000 }
    )
  );

  // --- Benchmark 4: Fee calculation ---
  results.push(
    await runner.runBenchmark(
      'Transaction: Fee calculation',
      'transaction',
      () => {
        calculateFee(complexTx20.operations);
      },
      { threshold: 100000 }
    )
  );

  // --- Benchmark 5: Resource cost estimation ---
  results.push(
    await runner.runBenchmark(
      'Transaction: Resource cost estimation',
      'transaction',
      () => {
        estimateResourceCost(complexTx20.operations);
      },
      { threshold: 50000 }
    )
  );

  // --- Benchmark 6: Fee buffer application ---
  results.push(
    await runner.runBenchmark(
      'Transaction: Fee buffer application',
      'transaction',
      () => {
        const baseFee = calculateFee(complexTx20.operations);
        applyFeeBuffer(baseFee, 1.15);
      },
      { threshold: 200000 }
    )
  );

  // --- Benchmark 7: Account ID validation ---
  results.push(
    await runner.runBenchmark(
      'Transaction: Account ID validation',
      'transaction',
      () => {
        validateAccountId(VALID_ACCOUNT_ID);
        validateAccountId(randomAccountId());
      },
      { threshold: 200000 }
    )
  );

  // --- Benchmark 8: Transaction hash generation ---
  results.push(
    await runner.runBenchmark(
      'Transaction: Hash generation',
      'transaction',
      () => {
        generateTransactionHash(complexTx20);
      },
      { threshold: 30000 }
    )
  );

  // --- Benchmark 9: Full tx creation pipeline ---
  results.push(
    await runner.runBenchmark(
      'Transaction: Full creation pipeline (build + fee + hash)',
      'transaction',
      () => {
        const tx = generateTransaction(5);
        const fee = calculateFee(tx.operations);
        const bufferedFee = applyFeeBuffer(fee, 1.15);
        const resourceEstimate = estimateResourceCost(tx.operations);
        const hash = generateTransactionHash(tx);
        // Prevent optimization
        void (bufferedFee + resourceEstimate.totalStroops + hash.length);
      },
      { threshold: 5000 }
    )
  );

  // Log results
  for (const result of results) {
    console.log(`  ${runner.formatResult(result)}`);
  }

  return results;
}
