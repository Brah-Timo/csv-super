/**
 * basic-usage.ts — Essential csv-super examples.
 *
 * These examples assume a CSV file at 'data.csv' in the current directory.
 * Adapt the path to your actual file.
 */

import { csvSuper } from 'csv-super';

// ──────────────────────────────────────────────────────────────────────────────
// Example 1: Simplest possible usage
// ──────────────────────────────────────────────────────────────────────────────
async function example1_simplest(): Promise<void> {
  for await (const { rows, batchIndex, totalSoFar } of csvSuper('data.csv')) {
    console.log(`Batch #${batchIndex}: ${rows.length} rows (total: ${totalSoFar})`);
    // Process rows here...
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Example 2: Custom batch size + delimiter
// ──────────────────────────────────────────────────────────────────────────────
async function example2_custom_options(): Promise<void> {
  for await (const batch of csvSuper('data.tsv', {
    delimiter: '\t',     // TSV file
    batch: 5_000,        // 5000 rows per batch
    encoding: 'utf8',    // skip auto-detection for speed
  })) {
    console.log(`Processing batch with ${batch.count} rows`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Example 3: Database insert — the most common real-world usage
// ──────────────────────────────────────────────────────────────────────────────
async function example3_database_insert(): Promise<void> {
  // Simulated DB insert
  const db = {
    customers: {
      insertMany: async (rows: unknown[]): Promise<void> => {
        // your DB logic here
        void rows;
      }
    }
  };

  let insertedCount = 0;

  for await (const batch of csvSuper('customers.csv', { batch: 2_000 })) {
    await db.customers.insertMany(batch.rows);
    insertedCount += batch.count;
    console.log(`✅ Inserted ${insertedCount.toLocaleString()} customers`);
  }

  console.log(`\nDone! Total: ${insertedCount.toLocaleString()} rows inserted.`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Example 4: Progress bar in terminal
// ──────────────────────────────────────────────────────────────────────────────
async function example4_progress_bar(): Promise<void> {
  let rowCount = 0;

  for await (const batch of csvSuper('large.csv', {
    batch: 5_000,
    onProgress: ({ percentage, speedMBps, estimatedSecondsLeft }) => {
      const barLen = 30;
      const filled = Math.round((percentage / 100) * barLen);
      const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);

      process.stdout.write(
        `\r[${bar}] ${percentage.toFixed(1)}% ` +
        `@ ${speedMBps.toFixed(1)} MB/s ` +
        `— ETA: ${estimatedSecondsLeft.toFixed(0)}s     `
      );
    },
  })) {
    rowCount += batch.count;
    // Simulate work
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  process.stdout.write('\n');
  console.log(`✅ Processed ${rowCount.toLocaleString()} rows`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Example 5: Early termination (break) — stream closes automatically
// ──────────────────────────────────────────────────────────────────────────────
async function example5_early_break(): Promise<void> {
  const TARGET_COUNT = 100;
  let found = 0;

  for await (const batch of csvSuper('events.csv', { batch: 500 })) {
    for (const row of batch.rows) {
      if (row['type'] === 'ERROR') {
        console.log('Found error:', row);
        found++;

        if (found >= TARGET_COUNT) {
          // Stream closes cleanly — no file handle leak
          break;
        }
      }
    }
    if (found >= TARGET_COUNT) { break; }
  }

  console.log(`Found ${found} errors. Stopped early.`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Example 6: Parallel batch processing (bounded concurrency)
// ──────────────────────────────────────────────────────────────────────────────
async function example6_concurrent_processing(): Promise<void> {
  const MAX_CONCURRENT = 4;
  const inFlight: Promise<void>[] = [];
  let processed = 0;

  const process_batch = async (rows: Record<string, string>[]): Promise<void> => {
    // Simulate async work per batch
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    processed += rows.length;
  };

  for await (const batch of csvSuper('orders.csv', { batch: 1_000 })) {
    // Launch the batch processing task
    const task = process_batch(batch.rows);
    inFlight.push(task);

    // If queue is full, wait for the oldest task
    if (inFlight.length >= MAX_CONCURRENT) {
      await inFlight.shift();
    }
  }

  // Drain remaining tasks
  await Promise.all(inFlight);
  console.log(`✅ Processed ${processed.toLocaleString()} rows with concurrency=${MAX_CONCURRENT}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Example 7: Collect all rows (ONLY for small files!)
// ──────────────────────────────────────────────────────────────────────────────
async function example7_collect_all(): Promise<void> {
  // ⚠️  WARNING: Only use this for files you KNOW are small!
  // For large files, use the for-await loop instead.
  const allRows: Record<string, string>[] = [];

  for await (const batch of csvSuper('small-config.csv')) {
    allRows.push(...batch.rows);
  }

  console.log(`Loaded ${allRows.length} rows into memory`);
}

// Run all examples (comment out those that need real files)
void example1_simplest().catch(console.error);
