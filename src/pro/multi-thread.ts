/**
 * csvSuperPro — Multi-threaded CSV parser (Pro tier).
 *
 * Extends csvSuper() with:
 *   ✅ Worker Threads for parallel parsing (N × faster on multi-core)
 *   ✅ Transform pipeline (type coercion, filtering, enrichment)
 *   ✅ License verification (online + offline JWT fallback)
 *
 * Architecture:
 *   Main Thread
 *     ├─ LicenseChecker.verify()
 *     ├─ Split file into N byte ranges
 *     ├─ ThreadPool.initialize()
 *     └─ ThreadPool.process() → yields ordered BatchResults
 *
 *   Worker Thread (×N)
 *     ├─ Reads byte range via fs.createReadStream
 *     ├─ CsvParser (independent FSM per thread)
 *     ├─ Optional transform function
 *     └─ Posts BatchResult messages to main thread
 *
 * Memory model:
 *   Each thread uses ~50MB (same as free tier per thread).
 *   Total memory = ~50MB × N threads (acceptable for typical machines).
 *   The speed benefit (N× throughput) far outweighs the memory cost.
 */

import { stat } from 'node:fs/promises';
import { cpus } from 'node:os';
import { LicenseChecker } from '../license/license-checker.js';
import { LicenseError } from '../errors/LicenseError.js';
import { ThreadPool } from './thread-pool.js';
import type { CsvSuperProOptions, BatchResult } from '../types/index.js';

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pro-tier CSV parser with multi-thread acceleration.
 *
 * @param filePath   Path to the CSV file.
 * @param options    Pro options including `licenseKey` and `threads`.
 * @yields {BatchResult}  Ordered batches of parsed (and transformed) rows.
 *
 * @throws {LicenseError}  When the license key is invalid or expired.
 * @throws {ThreadError}   When a worker thread fails.
 * @throws {ParseError}    When the CSV content is malformed.
 *
 * @example
 * ```typescript
 * import { csvSuperPro, TransformPipeline } from 'csv-super';
 *
 * const pipeline = new TransformPipeline()
 *   .filter((row) => row.status === 'active')
 *   .mapField('age', (v) => String(parseInt(v, 10)))
 *   .trim();
 *
 * for await (const batch of csvSuperPro('employees.csv', {
 *   licenseKey: process.env.CSV_SUPER_KEY!,
 *   threads: 8,
 *   batch: 5000,
 *   transform: pipeline.toFn(),
 * })) {
 *   await db.employees.insertMany(batch.rows);
 *   console.log(`Processed ${batch.totalSoFar} rows`);
 * }
 * ```
 */
export async function* csvSuperPro(
  filePath: string,
  options: CsvSuperProOptions,
): AsyncGenerator<BatchResult> {

  // ── 1. License verification (FIRST — fail fast) ───────────────────────────
  const license = await LicenseChecker.verify(options.licenseKey);

  if (license.tier !== 'pro' && license.tier !== 'enterprise') {
    throw new LicenseError(
      `License tier '${license.tier}' does not include Pro features. ` +
      `Upgrade at https://csv-super.dev/pro`,
      'WRONG_TIER',
    );
  }

  // ── 2. File info ──────────────────────────────────────────────────────────
  const { size: fileSize } = await stat(filePath);

  // ── 3. Determine thread count ─────────────────────────────────────────────
  const availableCPUs = cpus().length;
  const maxAllowed = license.features.maxThreads;

  const requestedThreads = options.threads ?? Math.max(1, availableCPUs - 1);
  const threadCount = Math.min(
    requestedThreads,
    availableCPUs,
    maxAllowed,
    16, // absolute safety cap — diminishing returns beyond 16
    // Also cap to file size: no point in more threads than meaningful byte ranges
    Math.max(1, Math.floor(fileSize / (256 * 1024))), // at least 256KB per thread
  );

  // For very small files (< 1MB), fallback to single thread
  if (fileSize < 1024 * 1024 || threadCount <= 1) {
    // Import lazily to avoid circular dependency
    const { csvSuper } = await import('../core/csv-super.js');
    yield* csvSuper(filePath, options);
    return;
  }

  // ── 4. Compute byte ranges ────────────────────────────────────────────────
  const rangeSize = Math.ceil(fileSize / threadCount);
  const ranges: Array<{ start: number; end: number }> = [];

  for (let i = 0; i < threadCount; i++) {
    const start = i * rangeSize;
    const end = Math.min((i + 1) * rangeSize - 1, fileSize - 1);
    ranges.push({ start, end });
  }

  // ── 5. Create and initialize thread pool ──────────────────────────────────
  const pool = new ThreadPool(threadCount, filePath, options);
  await pool.initialize();

  // ── 6. Process and yield results ──────────────────────────────────────────
  try {
    yield* pool.process(ranges, options.batch ?? 1_000);
  } finally {
    // Always clean up workers, even on error or break
    await pool.destroy();
  }
}

// Re-export TransformPipeline for convenience
export { TransformPipeline } from './transform-pipeline.js';
