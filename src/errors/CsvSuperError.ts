/**
 * CsvSuperError — Base error class for all csv-super errors.
 *
 * Extend this class for specific error types.
 * Consumers can catch all csv-super errors with:
 *
 * ```typescript
 * import { CsvSuperError } from 'csv-super';
 *
 * try {
 *   for await (const batch of csvSuper('data.csv')) { ... }
 * } catch (err) {
 *   if (err instanceof CsvSuperError) {
 *     console.error('csv-super error:', err.message);
 *   }
 * }
 * ```
 */
export class CsvSuperError extends Error {
  /**
   * Error code for programmatic handling.
   * Follows the pattern: 'CSV_SUPER_<TYPE>'
   */
  readonly code: string;

  /** ISO 8601 timestamp of when the error occurred. */
  readonly timestamp: string;

  constructor(message: string, code = 'CSV_SUPER_ERROR') {
    super(message);
    this.name = 'CsvSuperError';
    this.code = code;
    this.timestamp = new Date().toISOString();

    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
