/**
 * ThreadError — Thrown when a Worker Thread encounters an error.
 *
 * @example
 * ```typescript
 * import { ThreadError } from 'csv-super';
 *
 * try {
 *   for await (const batch of csvSuperPro('data.csv', options)) { ... }
 * } catch (err) {
 *   if (err instanceof ThreadError) {
 *     console.error(`Thread ${err.threadId} failed: ${err.message}`);
 *   }
 * }
 * ```
 */

import { CsvSuperError } from './CsvSuperError.js';

export class ThreadError extends CsvSuperError {
  /** Zero-based index of the worker thread that failed. */
  readonly threadId: number;

  /**
   * Byte range the thread was responsible for.
   * Useful for partial retry scenarios.
   */
  readonly byteRange: { start: number; end: number };

  /** Original error from inside the worker thread. */
  readonly workerError: unknown;

  constructor(
    message: string,
    threadId: number,
    byteRange: { start: number; end: number },
    workerError?: unknown,
  ) {
    super(`[Thread ${threadId}] ${message}`, 'CSV_SUPER_THREAD_ERROR');
    this.name = 'ThreadError';
    this.threadId = threadId;
    this.byteRange = byteRange;
    this.workerError = workerError;
  }
}
