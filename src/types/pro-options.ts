/**
 * Pro-tier options and types for csvSuperPro().
 */

import type { CsvRow } from './row.js';
import type { CsvSuperOptions } from './options.js';

/**
 * A transform function applied to each row during parsing.
 *
 * - Return a `CsvRow` to keep (possibly modified) the row.
 * - Return `null` to filter out (skip) the row entirely.
 * - Can be async for DB lookups or external API enrichment.
 *
 * @example Filter + type coercion:
 * ```typescript
 * const transform: TransformFn = (row) => {
 *   if (row.status === 'inactive') return null; // skip
 *   return {
 *     ...row,
 *     age:    String(parseInt(row.age, 10)),
 *     email:  row.email.toLowerCase().trim(),
 *     salary: String(parseFloat(row.salary)),
 *   };
 * };
 * ```
 *
 * @example Async enrichment:
 * ```typescript
 * const transform: TransformFn = async (row) => {
 *   const geo = await geocode(row.address);
 *   return { ...row, lat: geo.lat, lng: geo.lng };
 * };
 * ```
 */
export type TransformFn = (row: CsvRow) => CsvRow | null | Promise<CsvRow | null>;

/**
 * Full options accepted by csvSuperPro().
 * Extends free-tier options with Pro-only features.
 */
export interface CsvSuperProOptions extends CsvSuperOptions {
  /**
   * Pro license key obtained from https://csv-super.dev/pro
   *
   * Verification is attempted online first (3s timeout),
   * then falls back to offline JWT verification.
   * The license key is a signed JWT containing tier and expiry.
   */
  licenseKey: string;

  /**
   * Number of parallel Worker Threads to use for parsing.
   *
   * The file is divided into N byte ranges, each processed
   * by a separate thread. Results are re-ordered before yielding.
   *
   * Tuning:
   * - 1:                   Same as free tier (no parallelism)
   * - cpus - 1 (default):  Leave one core for main thread
   * - cpus:                Maximum — may cause main thread starvation
   *
   * @default os.cpus().length - 1  (typically 7 on 8-core machines)
   */
  threads?: number;

  /**
   * Transform function applied to each row after parsing.
   * Applied inside the worker thread (runs in parallel with I/O).
   *
   * IMPORTANT: The function is serialized via `.toString()` and
   * executed inside the Worker context. It cannot close over variables
   * from the parent scope — all dependencies must be self-contained
   * or passed via `transformContext`.
   */
  transform?: TransformFn;

  /**
   * Serializable context object passed to the transform function.
   * Use this to pass configuration, lookup tables, etc. to the worker.
   *
   * Must be serializable via `structuredClone` (no functions, no Symbols).
   *
   * @example
   * ```typescript
   * transformContext: { allowedStatuses: ['active', 'pending'] }
   * ```
   */
  transformContext?: Record<string, unknown>;

  /**
   * Whether to preserve row ordering across threads.
   *
   * - `true`  (default): Results are buffered and re-ordered. Slight memory overhead.
   * - `false`: Rows may arrive out of order (faster for unordered inserts).
   *
   * @default true
   */
  preserveOrder?: boolean;
}
