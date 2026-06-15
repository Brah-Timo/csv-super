/**
 * Options and configuration types for csvSuper() (free tier).
 */

/**
 * Real-time progress information delivered via `onProgress` callback.
 */
export interface ProgressInfo {
  /** Bytes read from disk so far. */
  bytesRead: number;

  /** Total file size in bytes. */
  totalBytes: number;

  /**
   * Completion percentage (0.0 – 100.0).
   * Always 100.0 when the file is fully read.
   */
  percentage: number;

  /**
   * Current read speed in megabytes per second.
   * Computed as a rolling average over the last second.
   */
  speedMBps: number;

  /**
   * Estimated seconds remaining to finish reading the file.
   * Computed from current speed and remaining bytes.
   * Returns Infinity if speed is 0.
   */
  estimatedSecondsLeft: number;

  /** Number of rows fully parsed so far. */
  rowsProcessed: number;
}

/**
 * Parser-level configuration (shared between free and Pro).
 */
export interface ParserConfig {
  /**
   * Field separator character.
   * Use '\t' for TSV, '|' for PSV, ';' for European Excel exports.
   * @default ','
   */
  delimiter?: string;

  /**
   * Character used to quote fields containing special characters.
   * @default '"'
   */
  quote?: string;

  /**
   * Escape character for literal quote characters inside a quoted field.
   * RFC 4180 defines this as the same as `quote` (i.e., "" → ").
   * Set to '\\' for backslash escaping (non-standard).
   * @default '"'  (same as quote)
   */
  escape?: string;

  /**
   * Whether the first row contains column header names.
   * - `true`  → rows are `Record<headerName, value>`
   * - `false` → rows are `Record<'0'|'1'|..., value>`
   * @default true
   */
  headers?: boolean;

  /**
   * Skip lines that are empty or contain only whitespace.
   * @default true
   */
  skipEmptyLines?: boolean;
}

/**
 * Full options accepted by csvSuper().
 */
export interface CsvSuperOptions extends ParserConfig {
  /**
   * Number of rows per yielded batch.
   *
   * Tuning guide:
   * - Small batches (100–500):    Lower memory per batch, more yields, more DB round-trips
   * - Medium batches (1000–5000): Good balance for most use cases  ← recommended
   * - Large batches (10000+):     Fewer DB calls, but higher memory per batch
   *
   * @default 1000
   */
  batch?: number;

  /**
   * Text encoding of the CSV file.
   * - `'auto'` → detect via BOM (recommended)
   * - `'utf8'` → skip detection (slightly faster)
   * - `'utf16le'` → for Windows Unicode exports
   * - `'latin1'` → for legacy Western European files
   *
   * @default 'auto'
   */
  encoding?: 'utf8' | 'utf16le' | 'latin1' | 'auto';

  /**
   * Internal read buffer size in bytes.
   *
   * This is the `highWaterMark` passed to `fs.createReadStream`.
   * Controls how much data is read from disk per I/O operation.
   *
   * Tuning guide:
   * - 16384  (16KB):  Lower memory, more syscalls — slow on spinning disks
   * - 65536  (64KB):  Optimal for SSDs and most use cases         ← default
   * - 131072 (128KB): Better for HDDs and network-mounted files
   * - 524288 (512KB): Maximum — only for very fast NVMe on large files
   *
   * @default 65536  (64KB)
   */
  chunkSize?: number;

  /**
   * Callback invoked after each chunk is read from disk.
   * Use for progress bars, logging, or ETAs.
   *
   * @example
   * ```typescript
   * onProgress: ({ percentage, speedMBps }) => {
   *   process.stdout.write(`\r${percentage.toFixed(1)}% @ ${speedMBps.toFixed(1)} MB/s`);
   * }
   * ```
   */
  onProgress?: ((info: ProgressInfo) => void) | null;
}
