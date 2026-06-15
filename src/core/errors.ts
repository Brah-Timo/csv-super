// =============================================================================
// src/core/errors.ts — Custom error class for csv-super
// =============================================================================

import type { CsvErrorCode, CsvSuperErrorOptions } from '../types.js';

export class CsvSuperError extends Error {
  readonly code: CsvErrorCode;
  readonly cause?: Error;
  readonly line?: number;
  readonly column?: string;

  constructor(message: string, options?: CsvSuperErrorOptions) {
    super(message);
    this.name = 'CsvSuperError';
    this.code = options?.code ?? 'PARSE_ERROR';
    if (options?.cause !== undefined) { this.cause = options.cause; }
    if (options?.line !== undefined) { this.line = options.line; }
    if (options?.column !== undefined) { this.column = options.column; }

    // Fix prototype chain for instanceof checks
    Object.setPrototypeOf(this, CsvSuperError.prototype);
  }
}
