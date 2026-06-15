/**
 * Row and Batch types — the fundamental data structures of csv-super.
 */

/**
 * A single parsed CSV row.
 *
 * When `headers: true` (default):
 *   Keys are the column names from the first row.
 *   ```
 *   { name: 'Alice', age: '30', city: 'Paris' }
 *   ```
 *
 * When `headers: false`:
 *   Keys are '0', '1', '2', ... (stringified indices).
 *   ```
 *   { '0': 'Alice', '1': '30', '2': 'Paris' }
 *   ```
 *
 * NOTE: All values are strings. Type coercion is intentionally left
 * to the consumer (use Transform pipeline in Pro for typed rows).
 */
export type CsvRow = Record<string, string>;

/**
 * A batch of rows yielded by csvSuper().
 *
 * @example
 * ```typescript
 * for await (const batch of csvSuper('data.csv', { batch: 1000 })) {
 *   console.log(`Batch ${batch.batchIndex}: ${batch.count} rows`);
 *   console.log(`Total so far: ${batch.totalSoFar}`);
 *   await db.insertMany(batch.rows);
 * }
 * ```
 */
export interface BatchResult {
  /**
   * The parsed rows in this batch.
   * Length is ≤ the configured `batch` option.
   * (The last batch may be smaller.)
   */
  rows: CsvRow[];

  /**
   * Zero-based batch index.
   * First batch = 0, second = 1, etc.
   */
  batchIndex: number;

  /**
   * Number of rows in THIS batch.
   * Equivalent to `rows.length`, provided for convenience.
   */
  count: number;

  /**
   * Cumulative number of rows yielded up to and including this batch.
   * Useful for progress display without external counters.
   *
   * @example
   * ```typescript
   * console.log(`Processed ${batch.totalSoFar} / ${estimatedTotal} rows`);
   * ```
   */
  totalSoFar: number;
}
