/**
 * memory-bench.ts — Verifies fixed memory usage across different file sizes.
 *
 * Run: tsx tests/benchmarks/memory-bench.ts
 *
 * Pass criteria: heap increase < 60MB regardless of file size.
 */

import { csvSuper } from '../../src/index.js';
import { writeFile, unlink } from 'node:fs/promises';
import { MemoryMonitor } from '../../src/utils/memory-monitor.js';

const TEST_FILE = '/tmp/csv-super-memory-bench.csv';

async function generateFile(rows: number): Promise<void> {
  const WRITE_BATCH = 50_000;
  const header = 'id,name,email,age,city,country,salary,department,score\n';

  let content = header;
  for (let i = 1; i <= rows; i++) {
    content += `${i},User${i},user${i}@example.com,${20 + (i % 45)},City${i % 100},Country${i % 20},${50_000 + i},Dept${i % 10},${(Math.random() * 100).toFixed(2)}\n`;

    if (i % WRITE_BATCH === 0) {
      await writeFile(TEST_FILE, content, { flag: i === WRITE_BATCH ? 'w' : 'a' });
      content = '';
      process.stdout.write(`\r  Generating: ${((i / rows) * 100).toFixed(0)}%`);
    }
  }
  if (content.length > 0) {
    await writeFile(TEST_FILE, content, { flag: 'a' });
  }
  process.stdout.write('\r  Generated!          \n');
}

interface BenchResult {
  rows: number;
  durationSec: number;
  rowsPerSec: number;
  maxHeapMB: number;
  avgHeapMB: number;
  heapDeltaMB: number;
  passed: boolean;
}

async function runBench(rows: number): Promise<BenchResult> {
  console.log(`\n⚙️  Benchmark: ${rows.toLocaleString()} rows`);
  console.log('  Generating file...');
  await generateFile(rows);

  const baselineSnap = MemoryMonitor.snapshot();
  console.log(`  Baseline: ${MemoryMonitor.format(baselineSnap)}`);

  const heapReadings: number[] = [];
  const monitor = new MemoryMonitor({
    intervalMs: 200,
    onTick: (snap) => { heapReadings.push(snap.heapUsedMB); },
    onWarning: () => { /* suppress during bench */ },
  });

  monitor.start();
  let totalRows = 0;
  const start = performance.now();

  for await (const batch of csvSuper(TEST_FILE, { batch: 1_000 })) {
    totalRows += batch.count;
    // Simulate a cheap operation (setImmediate = yield to event loop)
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  const durationSec = (performance.now() - start) / 1_000;
  monitor.stop();

  await unlink(TEST_FILE);

  const maxHeap = Math.max(...heapReadings, baselineSnap.heapUsedMB);
  const avgHeap = heapReadings.reduce((a, b) => a + b, 0) / (heapReadings.length || 1);
  const delta = maxHeap - baselineSnap.heapUsedMB;

  const result: BenchResult = {
    rows: totalRows,
    durationSec,
    rowsPerSec: Math.round(totalRows / durationSec),
    maxHeapMB: maxHeap,
    avgHeapMB: avgHeap,
    heapDeltaMB: delta,
    passed: delta < 60, // PASS threshold: < 60MB heap increase
  };

  console.log(`  Rows processed:  ${totalRows.toLocaleString()}`);
  console.log(`  Duration:        ${durationSec.toFixed(2)}s`);
  console.log(`  Throughput:      ${result.rowsPerSec.toLocaleString()} rows/sec`);
  console.log(`  Max heap:        ${maxHeap.toFixed(1)}MB`);
  console.log(`  Heap delta:      ${delta.toFixed(1)}MB`);
  console.log(`  Result:          ${result.passed ? '✅ PASS' : '❌ FAIL'}`);

  return result;
}

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         csv-super Memory Benchmark                      ║');
  console.log('║  Criterion: heap increase < 60MB regardless of size     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  const scenarios = [
    100_000,    // 100K rows  (~10MB file)
    500_000,    // 500K rows  (~50MB file)
    1_000_000,  // 1M rows    (~100MB file)
  ];

  const results: BenchResult[] = [];

  for (const rows of scenarios) {
    const result = await runBench(rows);
    results.push(result);
  }

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('══════════════════════════════════════════════════════════');

  let allPassed = true;
  for (const r of results) {
    const status = r.passed ? '✅' : '❌';
    console.log(
      `  ${status} ${r.rows.toLocaleString().padStart(9)} rows | ` +
      `${r.rowsPerSec.toLocaleString().padStart(8)} rows/s | ` +
      `Δheap ${r.heapDeltaMB.toFixed(1).padStart(5)}MB`,
    );
    if (!r.passed) { allPassed = false; }
  }

  console.log('══════════════════════════════════════════════════════════');
  if (allPassed) {
    console.log('  🎉 All benchmarks passed! Memory is stable.');
  } else {
    console.error('  ❌ Some benchmarks failed! Memory exceeded 60MB.');
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
