/**
 * Input validators — validate options before processing begins.
 *
 * Failing fast at configuration time (not mid-stream) gives
 * developers clear, actionable error messages.
 */

import type { CsvSuperOptions } from '../types/index.js';
import { CsvSuperError } from '../errors/CsvSuperError.js';

/**
 * Validates all options passed to csvSuper() and returns a
 * Required<CsvSuperOptions> object with all defaults filled in.
 * Throws a CsvSuperError with a descriptive message on invalid input.
 */
export function validateOptions(options: CsvSuperOptions): Required<CsvSuperOptions> {
  const { batch, delimiter, quote, escape, chunkSize, encoding } = options;

  // ── batch ────────────────────────────────────────────────────────────────
  if (batch !== undefined) {
    if (!Number.isInteger(batch) || batch < 1) {
      throw new CsvSuperError(
        `Invalid option 'batch': must be a positive integer, got ${String(batch)}. ` +
        `Recommended values: 100–10000.`,
      );
    }
    if (batch > 1_000_000) {
      throw new CsvSuperError(
        `Invalid option 'batch': ${batch} is dangerously large. ` +
        `Max recommended: 100000. Larger batches defeat the memory-efficiency purpose.`,
      );
    }
  }

  // ── delimiter ─────────────────────────────────────────────────────────────
  if (delimiter !== undefined) {
    if (typeof delimiter !== 'string' || delimiter.length !== 1) {
      throw new CsvSuperError(
        `Invalid option 'delimiter': must be a single character string, got ${JSON.stringify(delimiter)}. ` +
        `Examples: ',' (CSV), '\\t' (TSV), '|' (PSV), ';' (European CSV).`,
      );
    }
    if (delimiter === '\r' || delimiter === '\n') {
      throw new CsvSuperError(
        `Invalid option 'delimiter': cannot be a newline character.`,
      );
    }
  }

  // ── quote ─────────────────────────────────────────────────────────────────
  if (quote !== undefined) {
    if (typeof quote !== 'string' || quote.length !== 1) {
      throw new CsvSuperError(
        `Invalid option 'quote': must be a single character string, got ${JSON.stringify(quote)}.`,
      );
    }
  }

  // ── escape ────────────────────────────────────────────────────────────────
  if (escape !== undefined) {
    if (typeof escape !== 'string' || escape.length !== 1) {
      throw new CsvSuperError(
        `Invalid option 'escape': must be a single character string, got ${JSON.stringify(escape)}.`,
      )
    }
  }

  // ── delimiter ≠ quote ─────────────────────────────────────────────────────
  if (delimiter !== undefined && quote !== undefined && delimiter === quote) {
    throw new CsvSuperError(
      `Invalid options: 'delimiter' and 'quote' cannot be the same character ('${delimiter}').`,
    );
  }

  // ── chunkSize ─────────────────────────────────────────────────────────────
  if (chunkSize !== undefined) {
    if (!Number.isInteger(chunkSize) || chunkSize < 1024) {
      throw new CsvSuperError(
        `Invalid option 'chunkSize': must be an integer ≥ 1024 bytes, got ${String(chunkSize)}. ` +
        `Recommended: 65536 (64KB).`,
      );
    }
    if (chunkSize > 10 * 1024 * 1024) {
      throw new CsvSuperError(
        `Invalid option 'chunkSize': ${chunkSize} bytes is extremely large. ` +
        `Max recommended: 1048576 (1MB).`,
      );
    }
  }

  // ── encoding ─────────────────────────────────────────────────────────────
  const validEncodings = ['utf8', 'utf16le', 'latin1', 'auto'] as const;
  if (encoding !== undefined && !(validEncodings as readonly string[]).includes(encoding)) {
    throw new CsvSuperError(
      `Invalid option 'encoding': '${encoding}' is not supported. ` +
      `Valid values: ${validEncodings.map((e) => `'${e}'`).join(', ')}.`,
    );
  }

  // ── Return with defaults applied ──────────────────────────────────────────
  return {
    batch:          batch          ?? 1000,
    delimiter:      delimiter      ?? ',',
    quote:          quote          ?? '"',
    escape:         escape         ?? '"',
    headers:        options.headers ?? true,
    skipEmptyLines: options.skipEmptyLines ?? true,
    encoding:       (encoding      ?? 'auto') as 'utf8' | 'utf16le' | 'latin1' | 'auto',
    chunkSize:      chunkSize      ?? 65_536,
    onProgress:     options.onProgress ?? null,
  };
}

/**
 * Validates that a file path is a non-empty string.
 */
export function validateFilePath(filePath: unknown): asserts filePath is string {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new CsvSuperError(
      `Invalid file path: expected a non-empty string, got ${JSON.stringify(filePath)}.`,
    );
  }
}
