/**
 * csv-super — CJS entry point (CommonJS build only)
 *
 * This file is used exclusively by tsconfig.cjs.json.
 * It mirrors src/index.ts but omits the Pro (ESM-only) exports,
 * because src/pro/thread-pool.ts uses `import.meta.url` which is
 * not valid in CommonJS module mode (TypeScript error TS1343).
 *
 * Pro features require ESM (import from 'csv-super' in an ES module).
 */

// ── Core (MIT) ────────────────────────────────────────────────────────────────
export { csvSuper } from './core/csv-super.js';

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
