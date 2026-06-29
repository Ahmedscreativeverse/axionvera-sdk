/**
 * Benchmark Report Generator
 *
 * Generates structured reports from benchmark results in multiple formats
 * (console, JSON, and HTML). Supports historical comparison to detect
 * performance regressions against baseline results.
 */

import * as fs from 'fs';
import * as path from 'path';
import { BenchmarkResult, BenchmarkRunReport } from './runner';

/** Path to the historical baseline file */
const BASELINE_PATH = path.resolve(__dirname, 'baselines', 'baseline.json');
/** Path to the output reports directory */
const REPORTS_DIR = path.resolve(__dirname, 'reports');

export interface HistoricalComparison {
  /** Name of the benchmark */
  name: string;
  /** Current ops/sec */
  currentOpsPerSec: number;
  /** Baseline ops/sec */
  baselineOpsPerSec: number;
  /** Percentage change (positive = improvement, negative = regression) */
  changePercent: number;
  /** Whether this is a regression beyond the allowed threshold */
  isRegression: boolean;
  /** Whether this is an improvement beyond the threshold */
  isImprovement: boolean;
}

export interface FullReport {
  /** Metadata about the run */
  metadata: {
    timestamp: string;
    git?: { branch: string; commit: string; commitShort: string };
    totalDurationMs: number;
    totalBenchmarks: number;
  };
  /** All benchmark results organized by category */
  results: Record<string, BenchmarkResult[]>;
  /** Historical comparisons (empty if no baseline exists) */
  comparisons: HistoricalComparison[];
  /** Regression summary */
  summary: {
    total: number;
    passed: number;
    failed: number;
    regressions: number;
    improvements: number;
  };
}

/**
 * Report generator for benchmark results.
 */
export class ReportGenerator {
  /**
   * Save the current benchmark results as a baseline for future comparisons.
   */
  static saveBaseline(results: BenchmarkResult[]): void {
    const dir = path.dirname(BASELINE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const baseline = {
      timestamp: new Date().toISOString(),
      results: results.map((r) => ({
        name: r.name,
        category: r.category,
        opsPerSec: r.opsPerSec,
        meanMs: r.meanMs,
      })),
    };

    fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2));
    console.log(`\n📊 Baseline saved to ${BASELINE_PATH}`);
  }

  /**
   * Load the historical baseline for comparison.
   */
  static loadBaseline(): {
    timestamp: string;
    results: Array<{ name: string; category: string; opsPerSec: number; meanMs: number }>;
  } | null {
    try {
      if (fs.existsSync(BASELINE_PATH)) {
        return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8'));
      }
    } catch {
      console.warn('⚠ Could not load baseline file.');
    }
    return null;
  }

  /**
   * Compare current results against the baseline to detect regressions.
   * @param currentResults - The current benchmark results
   * @param regressionThresholdPercent - Percentage drop that constitutes a regression (default: 10%)
   * @param improvementThresholdPercent - Percentage gain that constitutes an improvement (default: 10%)
   */
  static compareWithBaseline(
    currentResults: BenchmarkResult[],
    regressionThresholdPercent = 10,
    improvementThresholdPercent = 10
  ): HistoricalComparison[] {
    const baseline = this.loadBaseline();
    if (!baseline) {
      return [];
    }

    const baselineMap = new Map<string, number>();
    for (const r of baseline.results) {
      baselineMap.set(r.name, r.opsPerSec);
    }

    const comparisons: HistoricalComparison[] = [];

    for (const current of currentResults) {
      const baselineOps = baselineMap.get(current.name);
      if (baselineOps === undefined) continue;

      const changePercent = ((current.opsPerSec - baselineOps) / baselineOps) * 100;
      const isRegression = changePercent < -regressionThresholdPercent;
      const isImprovement = changePercent > improvementThresholdPercent;

      comparisons.push({
        name: current.name,
        currentOpsPerSec: current.opsPerSec,
        baselineOpsPerSec: baselineOps,
        changePercent: Math.round(changePercent * 100) / 100,
        isRegression,
        isImprovement,
      });
    }

    return comparisons;
  }

  /**
   * Generate a complete report from multiple suite reports.
   */
  static generateFullReport(reports: BenchmarkRunReport[]): FullReport {
    const resultsByCategory: Record<string, BenchmarkResult[]> = {};
    let totalBenchmarks = 0;
    let totalDurationMs = 0;

    for (const report of reports) {
      if (!resultsByCategory[report.suite.category]) {
        resultsByCategory[report.suite.category] = [];
      }
      resultsByCategory[report.suite.category].push(...report.results);
      totalBenchmarks += report.results.length;
      totalDurationMs += report.totalTimeMs;
    }

    const allResults = Object.values(resultsByCategory).flat();
    const comparisons = this.compareWithBaseline(allResults);

    const passed = allResults.filter((r) => r.passed).length;
    const failed = allResults.filter((r) => !r.passed).length;
    const regressions = comparisons.filter((c) => c.isRegression).length;
    const improvements = comparisons.filter((c) => c.isImprovement).length;

    return {
      metadata: {
        timestamp: new Date().toISOString(),
        git: reports[0]?.git,
        totalDurationMs: Math.round(totalDurationMs),
        totalBenchmarks,
      },
      results: resultsByCategory,
      comparisons,
      summary: {
        total: totalBenchmarks,
        passed,
        failed,
        regressions,
        improvements,
      },
    };
  }

  /**
   * Output the full report as formatted console text.
   */
  static printConsoleReport(report: FullReport): void {
    console.log('\n' + '█'.repeat(80));
    console.log('  AXIOWERA SDK — PERFORMANCE BENCHMARK REPORT');
    console.log('█'.repeat(80));

    console.log(`\n  Timestamp: ${report.metadata.timestamp}`);
    if (report.metadata.git) {
      console.log(`  Branch:    ${report.metadata.git.branch}`);
      console.log(`  Commit:    ${report.metadata.git.commitShort}`);
    }
    console.log(`  Duration:  ${report.metadata.totalDurationMs}ms`);
    console.log(`  Suites:    ${Object.keys(report.results).length}`);
    console.log(`  Benchmarks: ${report.metadata.totalBenchmarks}`);

    // Results by category
    for (const [category, results] of Object.entries(report.results)) {
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`  📂 ${category.toUpperCase()}`);
      console.log(`${'─'.repeat(80)}`);

      for (const result of results) {
        const icon = result.passed ? '✅' : '❌';
        console.log(
          `  ${icon} ${result.name.padEnd(45)} ` +
            `${result.opsPerSec.toLocaleString().padStart(10)} ops/s ` +
            `±${result.rme.toFixed(1)}%  (${result.meanMs.toFixed(4)}ms)`
        );
      }
    }

    // Historical comparison
    if (report.comparisons.length > 0) {
      console.log(`\n${'─'.repeat(80)}`);
      console.log('  📈 HISTORICAL COMPARISON (vs baseline)');
      console.log(`${'─'.repeat(80)}`);

      for (const comp of report.comparisons) {
        const arrow = comp.isRegression ? '🔴' : comp.isImprovement ? '🟢' : '⚪';
        const sign = comp.changePercent >= 0 ? '+' : '';
        console.log(
          `  ${arrow} ${comp.name.padEnd(43)} ` +
            `${sign}${comp.changePercent.toFixed(1)}% ` +
            `(${comp.baselineOpsPerSec.toLocaleString()} → ${comp.currentOpsPerSec.toLocaleString()} ops/s)`
        );
      }
    }

    // Summary
    console.log(`\n${'═'.repeat(80)}`);
    console.log('  SUMMARY');
    console.log(`${'═'.repeat(80)}`);
    console.log(`  Total:        ${report.summary.total}`);
    console.log(`  Passed:       ${report.summary.passed}`);
    console.log(`  Failed:       ${report.summary.failed}`);
    if (report.comparisons.length > 0) {
      console.log(`  Regressions:  ${report.summary.regressions}`);
      console.log(`  Improvements: ${report.summary.improvements}`);
    }

    // Exit code warning for CI
    if (report.summary.failed > 0 || report.summary.regressions > 0) {
      console.log('\n⚠️  Performance thresholds exceeded! Check results above.');
    }

    console.log('\n' + '█'.repeat(80) + '\n');
  }

  /**
   * Save the report as a JSON file.
   */
  static saveJsonReport(report: FullReport, filePath?: string): string {
    if (!fs.existsSync(REPORTS_DIR)) {
      fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = filePath ?? path.join(REPORTS_DIR, `benchmark-report-${timestamp}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`📄 JSON report saved to ${outputPath}`);
    return outputPath;
  }

  /**
   * Save the report as an HTML file for visual inspection.
   */
  static saveHtmlReport(report: FullReport, filePath?: string): string {
    if (!fs.existsSync(REPORTS_DIR)) {
      fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = filePath ?? path.join(REPORTS_DIR, `benchmark-report-${timestamp}.html`);

    const html = this.generateHtmlReport(report);
    fs.writeFileSync(outputPath, html);
    console.log(`🌐 HTML report saved to ${outputPath}`);
    return outputPath;
  }

  /**
   * Generate a self-contained HTML report with charts.
   */
  private static generateHtmlReport(report: FullReport): string {
    const categories = Object.keys(report.results);
    const allResults = Object.values(report.results).flat();

    // Build chart data for ops/sec comparison
    const chartLabels = JSON.stringify(allResults.map((r) => r.name));
    const chartData = JSON.stringify(allResults.map((r) => r.opsPerSec));

    // Build comparison table rows
    let comparisonRows = '';
    for (const comp of report.comparisons) {
      const sign = comp.changePercent >= 0 ? '+' : '';
      const color = comp.isRegression ? '#e74c3c' : comp.isImprovement ? '#27ae60' : '#95a5a6';
      comparisonRows += `
        <tr>
          <td>${comp.name}</td>
          <td>${comp.baselineOpsPerSec.toLocaleString()}</td>
          <td>${comp.currentOpsPerSec.toLocaleString()}</td>
          <td style="color: ${color}; font-weight: bold;">${sign}${comp.changePercent}%</td>
        </tr>`;
    }

    // Build results by category
    let categoryTables = '';
    for (const [category, results] of Object.entries(report.results)) {
      let rows = '';
      for (const r of results) {
        const status = r.passed ? '✅' : '❌';
        rows += `
          <tr class="${r.passed ? 'passed' : 'failed'}">
            <td>${status}</td>
            <td>${r.name}</td>
            <td>${r.opsPerSec.toLocaleString()}</td>
            <td>${r.meanMs.toFixed(4)}ms</td>
            <td>±${r.rme.toFixed(2)}%</td>
            <td>${r.samples}</td>
          </tr>`;
      }
      categoryTables += `
        <h3>📂 ${category.toUpperCase()}</h3>
        <table>
          <thead>
            <tr>
              <th></th><th>Benchmark</th><th>Ops/Sec</th><th>Mean Time</th><th>RME</th><th>Samples</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Axionvera SDK — Performance Benchmark Report</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; padding: 24px; }
  .container { max-width: 1200px; margin: 0 auto; }
  h1 { color: #58a6ff; margin-bottom: 8px; }
  h2 { color: #f0f6fc; margin: 24px 0 12px; border-bottom: 1px solid #30363d; padding-bottom: 8px; }
  h3 { color: #f0f6fc; margin: 20px 0 10px; }
  .metadata { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
  .metadata-item { display: flex; flex-direction: column; }
  .metadata-label { font-size: 12px; color: #8b949e; text-transform: uppercase; }
  .metadata-value { font-size: 16px; color: #f0f6fc; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0 24px; background: #161b22; border: 1px solid #30363d; border-radius: 8px; overflow: hidden; }
  th { background: #21262d; color: #8b949e; text-align: left; padding: 10px 14px; font-size: 13px; text-transform: uppercase; }
  td { padding: 10px 14px; border-top: 1px solid #30363d; font-size: 14px; }
  tr.passed { background: rgba(39, 174, 96, 0.05); }
  tr.failed { background: rgba(231, 76, 60, 0.08); }
  .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 20px 0; }
  .summary-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; text-align: center; }
  .summary-card .value { font-size: 28px; font-weight: 700; }
  .summary-card .label { font-size: 12px; color: #8b949e; margin-top: 4px; }
  .summary-card.pass .value { color: #27ae60; }
  .summary-card.fail .value { color: #e74c3c; }
  .summary-card.regression .value { color: #f39c12; }
  .chart-container { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; margin: 20px 0; }
  .bar { display: inline-block; height: 20px; border-radius: 3px; margin-right: 4px; transition: width 0.3s; }
  .footer { text-align: center; color: #484f58; font-size: 12px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #30363d; }
</style>
</head>
<body>
<div class="container">
  <h1>⚡ Axionvera SDK — Performance Benchmark Report</h1>
  
  <h2>📋 Run Metadata</h2>
  <div class="metadata">
    <div class="metadata-item"><span class="metadata-label">Timestamp</span><span class="metadata-value">${report.metadata.timestamp}</span></div>
    ${
      report.metadata.git
        ? `
    <div class="metadata-item"><span class="metadata-label">Branch</span><span class="metadata-value">${report.metadata.git.branch}</span></div>
    <div class="metadata-item"><span class="metadata-label">Commit</span><span class="metadata-value">${report.metadata.git.commitShort}</span></div>
    `
        : ''
    }
    <div class="metadata-item"><span class="metadata-label">Total Duration</span><span class="metadata-value">${report.metadata.totalDurationMs}ms</span></div>
    <div class="metadata-item"><span class="metadata-label">Benchmarks</span><span class="metadata-value">${report.metadata.totalBenchmarks}</span></div>
  </div>

  <h2>📊 Results Summary</h2>
  <div class="summary">
    <div class="summary-card"><div class="value">${report.summary.total}</div><div class="label">Total</div></div>
    <div class="summary-card pass"><div class="value">${report.summary.passed}</div><div class="label">Passed</div></div>
    <div class="summary-card fail"><div class="value">${report.summary.failed}</div><div class="label">Failed</div></div>
    ${
      report.comparisons.length > 0
        ? `
    <div class="summary-card regression"><div class="value">${report.summary.regressions}</div><div class="label">Regressions</div></div>
    <div class="summary-card"><div class="value" style="color:#27ae60">${report.summary.improvements}</div><div class="label">Improvements</div></div>
    `
        : ''
    }
  </div>

  <h2>📈 Performance Overview</h2>
  <div class="chart-container">
    <canvas id="benchmarkChart" style="max-height: 400px;"></canvas>
  </div>

  ${categoryTables}

  ${
    report.comparisons.length > 0
      ? `
  <h2>🔍 Historical Comparison</h2>
  <table>
    <thead>
      <tr><th>Benchmark</th><th>Baseline (ops/s)</th><th>Current (ops/s)</th><th>Change</th></tr>
    </thead>
    <tbody>${comparisonRows}</tbody>
  </table>
  `
      : ''
  }

  <div class="footer">
    Generated by Axionvera SDK Benchmark Framework — ${new Date().toISOString()}
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script>
  const ctx = document.getElementById('benchmarkChart').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ${chartLabels},
      datasets: [{
        label: 'Operations / Second',
        data: ${chartData},
        backgroundColor: function(context) {
          const value = context.raw;
          if (value < 1000) return 'rgba(231, 76, 60, 0.7)';
          if (value < 10000) return 'rgba(243, 156, 18, 0.7)';
          return 'rgba(39, 174, 96, 0.7)';
        },
        borderColor: function(context) {
          const value = context.raw;
          if (value < 1000) return '#e74c3c';
          if (value < 10000) return '#f39c12';
          return '#27ae60';
        },
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          type: 'logarithmic',
          title: { display: true, text: 'Operations / Second (log scale)', color: '#8b949e' },
          ticks: { color: '#8b949e' },
          grid: { color: '#21262d' }
        },
        y: {
          ticks: { color: '#8b949e', font: { size: 11 } },
          grid: { display: false }
        }
      }
    }
  });
</script>
</body>
</html>`;
  }

  /**
   * Print a CI-friendly summary line for parsing by CI systems.
   */
  static printCiSummary(report: FullReport): void {
    const allResults = Object.values(report.results).flat();
    for (const result of allResults) {
      console.log(
        `BENCHMARK_RESULT name="${result.name}" ` +
          `category="${result.category}" ` +
          `opsPerSec=${result.opsPerSec} ` +
          `meanMs=${result.meanMs} ` +
          `passed=${result.passed}`
      );
    }

    if (report.summary.failed > 0 || report.summary.regressions > 0) {
      console.log('BENCHMARK_STATUS=FAILED');
    } else {
      console.log('BENCHMARK_STATUS=PASSED');
    }
  }
}
