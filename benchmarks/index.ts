/**
 * Axionvera SDK — Performance Benchmarking Framework
 *
 * Entry point that orchestrates all benchmark suites, generates reports,
 * compares against historical baselines, and produces output in multiple
 * formats (console, JSON, HTML).
 *
 * Usage:
 *   npx ts-node benchmarks/index.ts                    # Run all benchmarks
 *   npx ts-node benchmarks/index.ts --ci               # CI mode (machine-readable)
 *   npx ts-node benchmarks/index.ts --save-baseline    # Save results as baseline
 *   npx ts-node benchmarks/index.ts --category contract # Run specific category
 *   npx ts-node benchmarks/index.ts --html             # Generate HTML report
 */

import { BenchmarkRunner, BenchmarkRunReport } from './runner';
import { ReportGenerator, FullReport } from './report-generator';
import { runContractBenchmarks } from './contract-interactions.bench';
import { runSerializationBenchmarks } from './serialization.bench';
import { runTransactionCreationBenchmarks } from './transaction-creation.bench';
import { runNetworkBenchmarks } from './network-communication.bench';

// ---------------------------------------------------------------------------
// Parse CLI arguments
// ---------------------------------------------------------------------------
function parseArgs(): {
  ci: boolean;
  saveBaseline: boolean;
  html: boolean;
  json: boolean;
  category: string | null;
} {
  const args = process.argv.slice(2);
  return {
    ci: args.includes('--ci'),
    saveBaseline: args.includes('--save-baseline'),
    html: args.includes('--html'),
    json: args.includes('--json'),
    category: args.find((a) => a.startsWith('--category='))?.split('=')[1] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Main benchmark orchestration
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const flags = parseArgs();

  console.log('█'.repeat(80));
  console.log('  AXIOWERA SDK — PERFORMANCE BENCHMARKING FRAMEWORK');
  console.log('█'.repeat(80));
  console.log(`\n  Mode:       ${flags.ci ? 'CI (machine-readable)' : 'Interactive'}`);
  console.log(`  Timestamp:  ${new Date().toISOString()}`);
  if (flags.category) {
    console.log(`  Category:   ${flags.category}`);
  }
  console.log('');

  const runner = new BenchmarkRunner();
  const reports: BenchmarkRunReport[] = [];

  const startTime = performance.now();

  // Run selected benchmark suites
  const runAll = !flags.category;

  if (runAll || flags.category === 'contract') {
    const contractResults = await runContractBenchmarks(runner);
    reports.push({
      suite: { name: 'Contract Interactions', category: 'contract' },
      results: contractResults,
      totalTimeMs: 0, // will be set per-suite
      timestamp: new Date().toISOString(),
    });
  }

  if (runAll || flags.category === 'serialization') {
    const serializationResults = await runSerializationBenchmarks(runner);
    reports.push({
      suite: { name: 'Serialization & Encoding', category: 'serialization' },
      results: serializationResults,
      totalTimeMs: 0,
      timestamp: new Date().toISOString(),
    });
  }

  if (runAll || flags.category === 'transaction') {
    const txResults = await runTransactionCreationBenchmarks(runner);
    reports.push({
      suite: { name: 'Transaction Creation', category: 'transaction' },
      results: txResults,
      totalTimeMs: 0,
      timestamp: new Date().toISOString(),
    });
  }

  if (runAll || flags.category === 'network') {
    const networkResults = await runNetworkBenchmarks(runner);
    reports.push({
      suite: { name: 'Network Communication', category: 'network' },
      results: networkResults,
      totalTimeMs: 0,
      timestamp: new Date().toISOString(),
    });
  }

  const totalTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

  // Generate the full report
  const fullReport = ReportGenerator.generateFullReport(reports);
  fullReport.metadata.totalDurationMs = totalTimeMs;

  // Output based on mode
  if (flags.ci) {
    ReportGenerator.printCiSummary(fullReport);
  } else {
    ReportGenerator.printConsoleReport(fullReport);
  }

  // Save reports
  if (flags.json || flags.ci) {
    ReportGenerator.saveJsonReport(fullReport);
  }

  if (flags.html) {
    ReportGenerator.saveHtmlReport(fullReport);
  }

  // Save baseline if requested
  if (flags.saveBaseline) {
    const allResults = runner.getAllResults();
    ReportGenerator.saveBaseline(allResults);
  }

  // Determine exit code for CI
  const hasFailures = fullReport.summary.failed > 0 || fullReport.summary.regressions > 0;

  if (hasFailures) {
    console.log('\n❌ Performance benchmarks detected failures or regressions.');
    process.exitCode = 1;
  } else {
    console.log('\n✅ All performance benchmarks passed.');
  }
}

// Run if executed directly (not imported)
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Benchmark framework error:', error);
    process.exit(1);
  });
}

export { main as runAllBenchmarks };
