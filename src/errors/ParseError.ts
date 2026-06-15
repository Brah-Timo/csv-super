/**
 * ParseError — Thrown when the CSV parser encounters malformed input.
 *
 * Contains precise location information (line + column) to help
 * identify the problematic data.
 *
 * @example
 * ```typescript
 * import { ParseError } from 'csv-super';
 *
 * try {
 *   for await (const batch of csvSuper('data.csv')) { ... }
 * } catch (err) {
 *   if (err instanceof ParseError) {
 *     console.error(`Parse error at line ${err.lineNumber}, column ${err.columnNumber}`);
 *     console.error(err.message);
 *   }
 * }
 * ```
 */

import { CsvSuperError } from './CsvSuperError.js';

export class ParseError extends CsvSuperError {
  /**
   * 1-based line number where the error occurred.
   * Includes lines inside quoted fields (newlines count).
   */
  readonly lineNumber: number;

  /**
   * 0-based column (field) index where the error occurred.
   */
  readonly columnNumber: number;

  constructor(message: string, lineNumber: number, columnNumber: number) {
    super(
      `[Line ${lineNumber}, Col ${columnNumber}] ${message}`,
      'CSV_SUPER_PARSE_ERROR',
    );
    this.name = 'ParseError';
    this.lineNumber = lineNumber;
    this.columnNumber = columnNumber;
  }
}
