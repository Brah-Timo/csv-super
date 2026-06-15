/**
 * ErrorHandler — Centralizes error wrapping and classification.
 *
 * Converts raw Node.js errors into typed csv-super errors
 * with actionable messages.
 */

import { CsvSuperError } from '../errors/CsvSuperError.js';
import { ParseError } from '../errors/ParseError.js';

/** Node.js errno error codes and their user-friendly messages. */
const ERRNO_MESSAGES: Readonly<Record<string, string>> = {
  ENOENT:  'File not found.',
  EACCES:  'Permission denied. Check file read permissions.',
  EISDIR:  'Path is a directory, not a file.',
  EMFILE:  'Too many open files. Close other file handles.',
  ENOMEM:  'System out of memory.',
  ENOSPC:  'No space left on device.',
  ENOTDIR: 'A path component is not a directory.',
  EIO:     'I/O error. The file may be corrupted or the disk failing.',
} as const;

export class ErrorHandler {
  /**
   * Wrap a raw filesystem error into a CsvSuperError.
   */
  static wrapFsError(err: unknown, filePath: string): CsvSuperError {
    if (err instanceof CsvSuperError) { return err; }

    const nodeErr = err as NodeJS.ErrnoException;
    const code = nodeErr.code ?? 'UNKNOWN';
    const friendly = ERRNO_MESSAGES[code];
    const msg = friendly
      ? `${friendly} (${filePath})`
      : `Filesystem error [${code}]: ${nodeErr.message ?? String(err)}`;

    return new CsvSuperError(msg);
  }

  /**
   * Determine if an error is a known csv-super typed error.
   */
  static isCsvSuperError(err: unknown): err is CsvSuperError {
    return err instanceof CsvSuperError;
  }

  /**
   * Determine if an error is a parse error.
   */
  static isParseError(err: unknown): err is ParseError {
    return err instanceof ParseError;
  }

  /**
   * Extract a clean message from any thrown value (including non-Error throws).
   */
  static messageOf(err: unknown): string {
    if (err instanceof Error) { return err.message; }
    if (typeof err === 'string') { return err; }
    return String(err);
  }

  /**
   * Re-throw only if the error is NOT an expected early-termination signal.
   * (Async generators use a special internal signal for `break` in `for await`)
   */
  static rethrowIfUnexpected(err: unknown): void {
    // Async generator 'return' sends a GeneratorReturn signal — not an error
    if (err instanceof Error && err.name === 'GeneratorReturn') { return; }
    throw err;
  }
}
