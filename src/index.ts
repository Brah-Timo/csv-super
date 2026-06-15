/**
 * csv-super — Main entry point
 *
 * Read 10GB CSV files without crashing RAM.
 * Fixed ~50MB memory footprint regardless of file size.
 *
 * @example
 * ```typescript
 * import { csvSuper } from 'csv-super';
 *
 * for await (const { rows, totalSoFar } of csvSuper('data.csv', { batch: 1000 })) {
 *   await db.insertMany(rows);
 *   console.log(`Processed ${totalSoFar} rows`);
 * }
 * ```
 */

// ── Core (MIT) ────────────────────────────────────────────────────────────────
export { csvSuper } from './core/csv-super.js';

// ── Pro (Commercial License) ──────────────────────────────────────────────────
export { csvSuperPro } from './pro/multi-thread.js';

// ── Types (public API surface) ────────────────────────────────────────────────
export type {
  CsvRow,
  BatchResult,
  ProgressInfo,
  CsvSuperOptions,
  CsvSuperProOptions,
  TransformFn,
  LicenseInfo,
  ParserConfig,
} from './types/index.js';

// ── Custom Errors (enable precise catch blocks) ───────────────────────────────
export { CsvSuperError } from './errors/CsvSuperError.js';
export { ParseError } from './errors/ParseError.js';
export { LicenseError } from './errors/LicenseError.js';
export { ThreadError } from './errors/ThreadError.js';
