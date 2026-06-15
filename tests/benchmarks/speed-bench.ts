/**
 * speed-bench.ts — Throughput benchmark comparing csv-super vs naive approach.
 *
 * Run: tsx tests/benchmarks/speed-bench.ts
 */

import { csvSuper } from '../../src/index.js';
import { writeFile, unlink } from 'node:fs/promises';

const TEST_FILE = '/tmp/csv-super-speed-bench.csv';
const ROWS = 500_000;

async function generateFile(): Promise<void> {
  const lines = ['id,name,email,value,status'];
  for (let i = 1; i <= ROWS; i++) {
    lines.push(`${i},User${i},user${i}@example.com,${Math.random().toFixed(4)},${i % 2 === 0 ? 'active' : 'inactive'}`);
  }
  await writeFile(TEST_FILE, lines.join('\n') + '\n', 'utf8');
}

async function benchCsvSuper(batchSize: number): Promise<{ rowsPerSec: number; memMB: number }> {
  const before = process.memoryUsage().heapUsed;
  const start = performance.now();
  let total = 0;

  for await (const batch of csvSuper(TEST_FILE, { batch: batchSize })) {
    total += batch.count;
  }

  const elapsed = (performance.now() - start) / 1_000;
  const after = process.memoryUsage().heapUsed;

  return {
    rowsPerSec: Math.round(total / elapsed),
    memMB: (after - before) / (1024 * 1024),
  };
}

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         csv-super Throughput Benchmark                  ║');
  console.log(`║  File: ${ROWS.toLocaleString()} rows                              ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  console.log('\nGenerating test file...');
  await generateFile();
  console.log('✅ File ready\n');

  const batchSizes = [100, 500, 1_000, 5_000, 10_000];
  console.log(`${'Batch Size'.padEnd(12)} ${'Rows/sec'.padEnd(15)} ${'Mem Delta (MB)'.padEnd(16)}`);
  console.log('─'.repeat(43));

  for (const batchSize of batchSizes) {
    const result = await benchCsvSuper(batchSize);
    const row =
      String(batchSize).padEnd(12) +
      result.rowsPerSec.toLocaleString().padEnd(15) +
      result.memMB.toFixed(1).padEnd(16);
    console.log(row);
  }

  console.log('─'.repeat(43));
  console.log('\nℹ️  Smaller batch = lower memory per batch but more yields');
  console.log('ℹ️  Larger batch  = fewer yields but higher peak memory\n');
  console.log('✅ Benchmark complete!');

  await unlink(TEST_FILE);
}

main().catch((err: unknown) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
