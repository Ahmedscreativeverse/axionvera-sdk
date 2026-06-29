/**
 * Benchmark Runner Framework
 *
 * Provides a robust benchmarking infrastructure for measuring SDK performance
 * across contract interactions, serialization, transaction creation, and
 * network communication.
 */

export interface BenchmarkResult {
  /** Name of the benchmark */
  name: string;
  /** Category (e.g., "contract", "serialization", "transaction", "network") */
  category: string;
  /** Operations per second */
  opsPerSec: number;
  /** Standard error margin as a percentage of the mean */
  rme: number;
  /** Number of samples collected */
  samples: number;
  /** Mean execution time in milliseconds */
  meanMs: number;
  /** Standard deviation in milliseconds */
  stdDevMs: number;
  /** Minimum execution time in milliseconds */
  minMs: number;
  /** Maximum execution time in milliseconds */
  maxMs: number;
  /** Whether this run passed the performance threshold */
  passed: boolean;
  /** Optional threshold in ops/sec (0 = no threshold) */
  threshold?: number;
  /** Timestamp of the benchmark run */
  timestamp: string;
}

export interface BenchmarkSuiteConfig {
  /** Name of the benchmark suite */
  name: string;
  /** Category for grouping results */
  category: string;
  /** Minimum number of iterations per benchmark */
  minIterations?: number;
  /** Maximum time in seconds a single benchmark can run */
  maxTimeSeconds?: number;
  /** Performance threshold in ops/sec (optional, for regression detection) */
  threshold?: number;
}

export interface BenchmarkRunReport {
  /** Suite-level metadata */
  suite: {
    name: string;
    category: string;
  };
  /** Individual benchmark results */
  results: BenchmarkResult[];
  /** Total wall-clock time for the suite */
  totalTimeMs: number;
  /** ISO timestamp of the run */
  timestamp: string;
  /** Git information if available */
  git?: {
    branch: string;
    commit: string;
    commitShort: string;
  };
}

/**
 * Minimal in-process benchmarking utility.
 * Uses high-resolution timers for accurate measurements.
 */
export class BenchmarkRunner {
  private results: BenchmarkResult[] = [];
  private suites: BenchmarkSuiteConfig[] = [];

  registerSuite(config: BenchmarkSuiteConfig): void {
    this.suites.push(config);
  }

  /**
   * Run a single benchmark function and collect timing statistics.
   */
  async runBenchmark(
    name: string,
    category: string,
    fn: () => void | Promise<void>,
    config?: { minIterations?: number; maxTimeSeconds?: number; threshold?: number }
  ): Promise<BenchmarkResult> {
    const minIterations = config?.minIterations ?? 50;
    const maxTimeMs = (config?.maxTimeSeconds ?? 5) * 1000;
    const threshold = config?.threshold;

    const times: number[] = [];
    const startWall = performance.now();

    // Warm-up phase (5 iterations, not measured)
    for (let i = 0; i < 5; i++) {
      await fn();
    }

    // Measurement phase
    while (
      times.length < minIterations ||
      (performance.now() - startWall < maxTimeMs && times.length < 10000)
    ) {
      const t0 = performance.now();
      await fn();
      const t1 = performance.now();
      times.push(t1 - t0);
    }

    // Calculate statistics
    const n = times.length;
    const mean = times.reduce((a, b) => a + b, 0) / n;
    const variance = times.reduce((sum, t) => sum + (t - mean) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);
    const rme = (stdDev / Math.sqrt(n) / mean) * 100;
    const opsPerSec = 1000 / mean;
    const minMs = Math.min(...times);
    const maxMs = Math.max(...times);
    const passed = threshold ? opsPerSec >= threshold : true;

    const result: BenchmarkResult = {
      name,
      category,
      opsPerSec: Math.round(opsPerSec * 100) / 100,
      rme: Math.round(rme * 100) / 100,
      samples: n,
      meanMs: Math.round(mean * 1000) / 1000,
      stdDevMs: Math.round(stdDev * 1000) / 1000,
      minMs: Math.round(minMs * 1000) / 1000,
      maxMs: Math.round(maxMs * 1000) / 1000,
      passed,
      threshold,
      timestamp: new Date().toISOString(),
    };

    this.results.push(result);
    return result;
  }

  /**
   * Run multiple benchmarks within a named suite.
   */
  async runSuite(
    suiteConfig: BenchmarkSuiteConfig,
    benchmarks: Array<{ name: string; fn: () => void | Promise<void>; threshold?: number }>
  ): Promise<BenchmarkRunReport> {
    const suiteStart = performance.now();
    const suiteResults: BenchmarkResult[] = [];

    for (const bench of benchmarks) {
      const result = await this.runBenchmark(bench.name, suiteConfig.category, bench.fn, {
        minIterations: suiteConfig.minIterations,
        maxTimeSeconds: suiteConfig.maxTimeSeconds,
        threshold: bench.threshold ?? suiteConfig.threshold,
      });
      suiteResults.push(result);
    }

    const totalTimeMs = Math.round((performance.now() - suiteStart) * 100) / 100;

    // Try to get git info
    let gitInfo: BenchmarkRunReport['git'] | undefined;
    try {
      const { execSync } = require('child_process');
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
      const commit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
      gitInfo = { branch, commit, commitShort: commit.slice(0, 7) };
    } catch {
      // Not a git repository or git not available
    }

    return {
      suite: { name: suiteConfig.name, category: suiteConfig.category },
      results: suiteResults,
      totalTimeMs,
      timestamp: new Date().toISOString(),
      git: gitInfo,
    };
  }

  /** Get all accumulated results across all runs */
  getAllResults(): BenchmarkResult[] {
    return [...this.results];
  }

  /** Clear accumulated results */
  clearResults(): void {
    this.results = [];
  }

  /**
   * Format a single result as a human-readable string.
   */
  formatResult(result: BenchmarkResult): string {
    const status = result.passed ? '✓' : '✗';
    const thresholdStr = result.threshold
      ? ` (threshold: ${result.threshold.toLocaleString()} ops/s)`
      : '';
    return (
      `${status} ${result.name.padEnd(50)} ` +
      `${result.opsPerSec.toLocaleString().padStart(10)} ops/s ` +
      `±${result.rme.toFixed(2)}% ` +
      `(mean: ${result.meanMs.toFixed(4)}ms, n=${result.samples})` +
      thresholdStr
    );
  }

  /**
   * Format an entire report for console output.
   */
  formatReport(report: BenchmarkRunReport): string {
    const lines: string[] = [];
    lines.push('═'.repeat(80));
    lines.push(`  Suite: ${report.suite.name} (${report.suite.category})`);
    if (report.git) {
      lines.push(`  Branch: ${report.git.branch}  Commit: ${report.git.commitShort}`);
    }
    lines.push(`  Completed in ${report.totalTimeMs}ms`);
    lines.push('─'.repeat(80));

    const failed = report.results.filter((r) => !r.passed);
    const passed = report.results.filter((r) => r.passed);

    for (const result of report.results) {
      lines.push(`  ${this.formatResult(result)}`);
    }

    lines.push('─'.repeat(80));
    lines.push(
      `  ${passed.length} passed, ${failed.length} failed, ${report.results.length} total`
    );
    lines.push('═'.repeat(80));

    return lines.join('\n');
  }
}

/** Singleton benchmark runner instance */
export const benchmarkRunner = new BenchmarkRunner();
