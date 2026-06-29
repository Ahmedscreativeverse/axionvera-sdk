/**
 * Contract Interactions Benchmark Suite
 *
 * Measures performance of contract operation building, parameter encoding,
 * contract method resolution, and batch contract interactions.
 */

import { BenchmarkRunner, BenchmarkResult } from './runner';

// ---------------------------------------------------------------------------
// Simulated contract data — avoids external dependencies for pure benchmarks
// ---------------------------------------------------------------------------

interface SimulatedContractParam {
  type: 'scvAddress' | 'scvU64' | 'scvI128' | 'scvString' | 'scvMap' | 'scvVec' | 'scvBytes';
  value: unknown;
}

interface SimulatedContractCall {
  contractId: string;
  method: string;
  params: SimulatedContractParam[];
}

const CONTRACT_IDS = [
  'CBVFRJ3HLOHUQKHCVB56CVNJKFOC4NFSPPQFJEKSE3G6FSF3SDLJKXYZ',
  'CDLZFC3SYJYDZT7K67VWH75J6ZQ7OYWXLTPQIC6ZB56ZKPJOT4KYHR6Z',
  'CAZXPLJNQSUQPBRIZ3HNUYFGQK5LYPFBSZGH5KZZTRJRQ4UMDXMGJE7P',
];

function randomContractId(): string {
  return CONTRACT_IDS[Math.floor(Math.random() * CONTRACT_IDS.length)];
}

function buildSimulatedCall(paramsCount: number): SimulatedContractCall {
  const paramTypes: SimulatedContractParam['type'][] = [
    'scvAddress',
    'scvU64',
    'scvI128',
    'scvString',
    'scvMap',
    'scvVec',
  ];
  const params: SimulatedContractParam[] = [];
  for (let i = 0; i < paramsCount; i++) {
    params.push({
      type: paramTypes[i % paramTypes.length],
      value: `param_value_${i}`,
    });
  }
  return {
    contractId: randomContractId(),
    method: `method_${Math.floor(Math.random() * 10)}`,
    params,
  };
}

function buildBatchCalls(count: number, paramsEach: number): SimulatedContractCall[] {
  const calls: SimulatedContractCall[] = [];
  for (let i = 0; i < count; i++) {
    calls.push(buildSimulatedCall(paramsEach));
  }
  return calls;
}

// ---------------------------------------------------------------------------
// Helper to encode params to a buffer (simulating scVal encoding)
// ---------------------------------------------------------------------------
function encodeParams(call: SimulatedContractCall): Buffer {
  const parts: string[] = [];
  parts.push(call.contractId);
  parts.push(call.method);
  for (const p of call.params) {
    parts.push(`${p.type}:${p.value}`);
  }
  return Buffer.from(parts.join('|'), 'utf-8');
}

// ---------------------------------------------------------------------------
// Helper to resolve a contract method signature
// ---------------------------------------------------------------------------
function resolveMethodSignature(call: SimulatedContractCall): string {
  const paramTypes = call.params.map((p) => p.type).join(',');
  return `${call.contractId}::${call.method}(${paramTypes})`;
}

// ---------------------------------------------------------------------------
// Run the contract interactions suite
// ---------------------------------------------------------------------------
export async function runContractBenchmarks(runner: BenchmarkRunner): Promise<BenchmarkResult[]> {
  console.log('\n🔗 Running Contract Interactions Benchmarks...\n');

  const results: BenchmarkResult[] = [];

  // Pre-generate test data
  const simpleCall = buildSimulatedCall(2);
  const complexCall = buildSimulatedCall(8);
  const batchCalls10 = buildBatchCalls(10, 2);
  const batchCalls100 = buildBatchCalls(100, 2);

  // --- Benchmark 1: Simple contract call encoding ---
  results.push(
    await runner.runBenchmark(
      'Contract: Simple call encoding (2 params)',
      'contract',
      () => {
        encodeParams(simpleCall);
      },
      { threshold: 50000 }
    )
  );

  // --- Benchmark 2: Complex contract call encoding ---
  results.push(
    await runner.runBenchmark(
      'Contract: Complex call encoding (8 params)',
      'contract',
      () => {
        encodeParams(complexCall);
      },
      { threshold: 20000 }
    )
  );

  // --- Benchmark 3: Method signature resolution ---
  results.push(
    await runner.runBenchmark(
      'Contract: Method signature resolution',
      'contract',
      () => {
        resolveMethodSignature(complexCall);
      },
      { threshold: 100000 }
    )
  );

  // --- Benchmark 4: Batch of 10 contract calls ---
  results.push(
    await runner.runBenchmark(
      'Contract: Batch encode 10 calls',
      'contract',
      () => {
        for (const call of batchCalls10) {
          encodeParams(call);
        }
      },
      { threshold: 5000 }
    )
  );

  // --- Benchmark 5: Batch of 100 contract calls ---
  results.push(
    await runner.runBenchmark(
      'Contract: Batch encode 100 calls',
      'contract',
      () => {
        for (const call of batchCalls100) {
          encodeParams(call);
        }
      },
      { threshold: 500 }
    )
  );

  // --- Benchmark 6: Contract ID validation ---
  const validContractId = CONTRACT_IDS[0];
  const CONTRACT_ID_RE = /^C[A-Z0-9]{55}$/;
  results.push(
    await runner.runBenchmark(
      'Contract: ID validation (regex)',
      'contract',
      () => {
        CONTRACT_ID_RE.test(validContractId);
      },
      { threshold: 500000 }
    )
  );

  // --- Benchmark 7: Full call preparation cycle ---
  results.push(
    await runner.runBenchmark(
      'Contract: Full call preparation (encode + resolve)',
      'contract',
      () => {
        const encoded = encodeParams(complexCall);
        const sig = resolveMethodSignature(complexCall);
        // Simulate assembling the final invocation
        JSON.stringify({ signature: sig, params: encoded.toString('base64') });
      },
      { threshold: 20000 }
    )
  );

  // Log results
  for (const result of results) {
    console.log(`  ${runner.formatResult(result)}`);
  }

  return results;
}
