# ⚡ Performance Benchmarks

Comprehensive benchmarking framework for the Axionvera SDK that measures performance across core SDK operations, generates reports, and detects regressions.

## Purpose

The benchmarking framework helps maintainers:

- **Identify regressions** — catch performance drops before they ship
- **Compare optimizations** — measure the real impact of code changes
- **Establish baselines** — set measurable performance targets
- **Generate reports** — produce human-readable and machine-parsable output

## Benchmark Suites

### 1. 🔗 Contract Interactions (`contract-interactions.bench.ts`)

Measures performance of:
- Contract call parameter encoding (simple & complex)
- Method signature resolution
- Batch contract call preparation (10, 100 calls)
- Contract ID validation
- Full call preparation cycle (encode + resolve + assemble)

### 2. 📦 Serialization & Encoding (`serialization.bench.ts`)

Measures performance of:
- JSON serialization / deserialization (simple & complex transactions)
- Base64 encoding / decoding (4KB buffers)
- XDR format validation (regex)
- Buffer allocation and copy (64KB)
- XDR length validation
- Full serialization round-trip (JSON → Buffer → Base64 → decode → parse)

### 3. 💳 Transaction Creation (`transaction-creation.bench.ts`)

Measures performance of:
- Transaction building (1, 5, 20 operations)
- Fee calculation
- Resource cost estimation (CPU, RAM, stroops)
- Fee buffer application
- Account ID validation
- Transaction hash generation
- Full transaction creation pipeline

### 4. 🌐 Network Communication (`network-communication.bench.ts`)

Measures performance of:
- RPC response validation
- Transaction status parsing
- Concurrency queue enqueue/dequeue
- Retry backoff calculation
- Response field extraction
- Batch RPC response processing
- RPC URL validation
- Timeout calculation

### 🔧 Legacy: XDR Parsing (`xdr-parsing.benchmark.js`)

The original XDR parsing benchmark using the `benchmark` npm package. Still available via `npm run benchmark:legacy`.

## Quick Start

```bash
# Navigate to the benchmarks directory
cd benchmarks

# Install dependencies
npm install

# Run all benchmarks
npm run benchmark

# Run a specific category
npm run benchmark:contract
npm run benchmark:serialization
npm run benchmark:transaction
npm run benchmark:network

# Run in CI mode (JSON output + machine-readable summary)
npm run benchmark:ci

# Generate HTML report with charts
npm run benchmark:html

# Save current results as the performance baseline
npm run benchmark:save-baseline
```

## CLI Flags

| Flag | Description |
|------|-------------|
| `--ci` | Machine-readable output for CI systems |
| `--json` | Save JSON report to `reports/` |
| `--html` | Save HTML report with charts to `reports/` |
| `--save-baseline` | Save results as baseline for future comparison |
| `--category=<name>` | Run only a specific suite (`contract`, `serialization`, `transaction`, `network`) |

## Output Formats

### Console Report
Formatted tables with pass/fail indicators, ops/sec, and statistical margins.

### JSON Report (`reports/benchmark-report-*.json`)
Structured data suitable for programmatic consumption, dashboards, or time-series databases.

### HTML Report (`reports/benchmark-report-*.html`)
Self-contained page with Chart.js bar charts showing ops/sec across all benchmarks, color-coded by performance tier.

## Historical Comparison

The framework supports comparing current results against a stored baseline:

1. **Save a baseline** on a known-good commit:
   ```bash
   npm run benchmark:save-baseline
   ```

2. **Run benchmarks** on a new commit. The report will automatically compare against `baselines/baseline.json` and highlight regressions (>10% drop) and improvements (>10% gain).

3. **Baseline file**: `baselines/baseline.json` — commit this to your repository to share the baseline across the team.

## Performance Thresholds

Each benchmark has a default threshold (ops/sec). If performance drops below the threshold, the benchmark is marked as **failed** and the CI job will signal a regression.

Thresholds can be customized per benchmark in the individual suite files.

## CI/CD Integration

Benchmarks run automatically on:
- **Pull requests** to `main` — detects regressions before merge
- **Pushes** to `main` — updates baseline awareness

The CI job:
1. Builds the SDK
2. Runs the legacy XDR parsing benchmark
3. Runs the comprehensive benchmark framework
4. Uploads JSON and HTML reports as artifacts
5. Fails the build if performance thresholds are exceeded

### GitHub Actions Artifacts

- `benchmark-json-report` — structured JSON data
- `benchmark-html-report` — visual HTML report with charts

## Methodology

### Timing
Uses `performance.now()` for high-resolution timing. Each benchmark runs a warm-up phase (5 iterations, not measured) followed by a measurement phase (minimum 50 iterations, maximum 5 seconds).

### Statistics
- **Ops/sec**: operations per second (higher is better)
- **RME** (Relative Margin of Error): ± percentage; lower is more stable
- **Mean, StdDev, Min, Max**: all in milliseconds

### Isolation
All benchmarks use simulated data to avoid external dependencies (no RPC calls, no ledger queries). This ensures reproducible results across environments.

## Adding New Benchmarks

1. Create a new file: `benchmarks/my-feature.bench.ts`
2. Export an async function that accepts a `BenchmarkRunner`:
   ```typescript
   import { BenchmarkRunner, BenchmarkResult } from './runner';

   export async function runMyBenchmarks(runner: BenchmarkRunner): Promise<BenchmarkResult[]> {
     const results: BenchmarkResult[] = [];
     results.push(
       await runner.runBenchmark('MyFeature: my operation', 'my-category', () => {
         // code to benchmark
       }, { threshold: 10000 })
     );
     return results;
   }
   ```
3. Register it in `benchmarks/index.ts`:
   ```typescript
   import { runMyBenchmarks } from './my-feature.bench';
   // Add to main() function
   ```

## Directory Structure

```
benchmarks/
├── index.ts                          # Entry point & CLI orchestration
├── runner.ts                         # Benchmark runner & statistics
├── report-generator.ts               # Report generation (console, JSON, HTML)
├── contract-interactions.bench.ts    # Contract interaction benchmarks
├── serialization.bench.ts            # Serialization benchmarks
├── transaction-creation.bench.ts     # Transaction creation benchmarks
├── network-communication.bench.ts    # Network communication benchmarks
├── xdr-parsing.benchmark.js          # Legacy XDR benchmark
├── baselines/
│   └── baseline.json                 # Historical performance baseline
├── reports/                          # Generated reports (gitignored)
├── package.json
├── tsconfig.json
└── README.md                         # This file
```

## Performance Thresholds

- **Minimum Transaction Parsing:** 1,000 ops/sec
- **Performance Regression Alert:** 10% increase in parsing time
- **CI Failure:** Parsing below threshold triggers build failure

## Benchmark Results

### Sample Output

```
🚀 Starting XDR Parsing Performance Benchmarks...

Generated 1000 complex Soroban transactions for benchmarking

Transaction.fromXDR() - Complex Transactions         1,234.56 ops/sec ±  2.34% (   0.81ms/op)
XDR toBase64() - Complex Transactions                2,456.78 ops/sec ±  1.23% (   0.41ms/op)
Transaction.hash() - Complex Transactions           1,890.12 ops/sec ±  1.89% (   0.53ms/op)
Full Parse + Hash + Serialize Cycle                  890.34 ops/sec ±  3.45% (   1.12ms/op)
Bulk Parse 100 Transactions                          8.90 ops/sec ±  2.78% ( 112.36ms/op)

✅ Benchmark suite completed!

📊 Summary:
   Total benchmark time: 115.23ms
   Average operations/sec: 1,654.54
   Fastest benchmark: XDR toBase64() - Complex Transactions
   Slowest benchmark: Bulk Parse 100 Transactions

🎯 Critical Metric - Transaction Parsing: 1,234.56 ops/sec
✅ Transaction parsing performance is acceptable
```

## CI Integration

The GitHub Actions workflow:

1. Runs benchmarks on every PR and push
2. Extracts key metrics (parsing performance, total time)
3. Posts results as PR comments
4. Fails build if performance regression detected
5. Uploads detailed results as artifacts

### PR Comments Example

```
## 🚀 Performance Benchmark Results

**Transaction Parsing Performance:** 1,234.56 ops/sec
**Total Benchmark Time:** 115.23ms
**Performance Status:** ✅ PASS - Acceptable

### ✅ Performance is acceptable

No significant performance regression detected.

---
*This automated benchmark tests XDR parsing performance with 1,000 complex Soroban transactions. If parsing time increases by more than 10%, please review for performance issues.*
```

## Adding New Benchmarks

To add new benchmarks:

1. Create a new benchmark file in this directory
2. Follow the naming convention: `[feature].benchmark.js`
3. Use the Benchmark.js library
4. Add CI integration in the workflow if needed
5. Update this README

## Performance Guidelines

When contributing to the SDK:

1. **Run benchmarks locally** before submitting PRs
2. **Monitor performance impact** of new features
3. **Optimize critical paths** in XDR processing
4. **Document performance characteristics** of new APIs
5. **Consider lazy loading** for heavy operations

## Troubleshooting

### Common Issues

1. **Module not found errors:** Ensure dependencies are installed in benchmarks directory
2. **Inconsistent results:** Run benchmarks multiple times and average results
3. **CI failures:** Check if performance regression is real or noise

### Debug Mode

Enable debug output by setting environment variable:

```bash
DEBUG=benchmarks npm run benchmark
```

## Architecture

The benchmark suite uses:
- **Benchmark.js** for performance measurement
- **Stellar SDK** for XDR operations
- **GitHub Actions** for CI automation
- **Custom test data generators** for realistic scenarios
