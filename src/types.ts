// =============================================================================
// src/types.ts — Complete TypeScript interfaces & type definitions for csv-super
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// Row representation
// ─────────────────────────────────────────────────────────────────────────────

/** A single parsed CSV row as a plain object (header → value). */
export type CsvRow = Record<string, string>;

// ─────────────────────────────────────────────────────────────────────────────
// Batch / progress
// ─────────────────────────────────────────────────────────────────────────────

/** A batch of rows yielded by the async generator. */
export interface CsvBatch {
  /** Zero-based index of this batch. */
  batchIndex: number;
  /** All rows in this batch. */
  rows: CsvRow[];
  /** Number of rows in this batch (same as rows.length). */
  count: number;
  /** Total number of rows processed so far (across all batches). */
  totalSoFar: number;
}

/** Progress callback fired after each batch is processed. */
export type ProgressCallback = (info: ProgressInfo) => void;

export interface ProgressInfo {
  /** Number of rows processed so far. */
  totalSoFar: number;
  /** Current batch index (zero-based). */
  batchIndex: number;
  /** Number of rows in the current batch. */
  batchSize: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Options
// ─────────────────────────────────────────────────────────────────────────────

export interface CsvSuperOptions {
  /**
   * Column delimiter character.
   * @default ','
   */
  delimiter?: string;

  /**
   * Quote character for fields that contain delimiters or newlines.
   * @default '"'
   */
  quote?: string;

  /**
   * Whether the first row is a header row.
   * @default true
   */
  hasHeader?: boolean;

  /**
   * Explicit column names (used when `hasHeader: false`).
   * If omitted and `hasHeader: false`, columns are named col0, col1, ...
   */
  columns?: string[];

  /**
   * Number of rows to yield per batch.
   * @default 1000
   */
  batchSize?: number;

  /**
   * File encoding.
   * @default 'auto'
   */
  encoding?: 'utf8' | 'utf16le' | 'latin1' | 'auto';

  /**
   * Skip blank lines (lines that are entirely empty after trimming).
   * @default true
   */
  skipBlankLines?: boolean;

  /**
   * Trim leading and trailing whitespace from field values.
   * @default false
   */
  trimValues?: boolean;

  /**
   * Comment character — lines starting with this character are skipped.
   * @default undefined (no comments)
   */
  comment?: string;

  /**
   * Progress callback fired after each batch is yielded.
   */
  onProgress?: ProgressCallback;

  /**
   * Maximum number of rows to read (useful for previewing large files).
   * @default Infinity
   */
  maxRows?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

export type CsvErrorCode =
  | 'FILE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'ENCODING_ERROR'
  | 'PARSE_ERROR'
  | 'INVALID_OPTIONS';

export interface CsvSuperErrorOptions {
  code: CsvErrorCode;
  cause?: Error;
  line?: number;
  column?: string;
}
