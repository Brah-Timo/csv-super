/**
 * csvSuper() — Streaming CSV async generator (free tier).
 *
 * Reads a CSV file from disk in chunks, feeds each chunk through the
 * incremental CsvParser FSM, and yields rows in batches.
 *
 * Memory footprint is bounded by:
 *   chunkSize (read buffer) + batchSize × average row size
 *
 * @example
 * ```typescript
 * import { csvSuper } from 'csv-super';
 *
 * for await (const batch of csvSuper('./data.csv', { batch: 1000 })) {
 *   console.log(`Batch ${batch.batchIndex}: ${batch.count} rows (${batch.totalSoFar} total)`);
 *   await db.insertMany(batch.rows);
 * }
 * ```
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import type { BatchResult, CsvSuperOptions } from '../types/index.js';
import { CsvSuperError } from '../errors/CsvSuperError.js';
import { CsvParser } from './csv-parser.js';
import { BatchController } from './batch-controller.js';
import { validateOptions, validateFilePath } from '../utils/validators.js';

// ─── Encoding detection ───────────────────────────────────────────────────────

/**
 * Detect encoding from BOM bytes at the start of a Buffer.
 * Returns the detected encoding, or 'utf8' as fallback.
 */
function detectEncodingFromBom(buf: Buffer): BufferEncoding {
  // UTF-16 LE BOM: FF FE
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return 'utf16le';
  }
  // UTF-8 BOM: EF BB BF
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return 'utf8';
  }
  return 'utf8';
}

/**
 * Strip a BOM prefix from a string if present.
 */
function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }
  return text;
}

// ─── Main generator ───────────────────────────────────────────────────────────

/**
 * Stream-parse a CSV (or TSV) file and yield rows in typed batches.
 *
 * @param filePath  Path to the CSV file (resolved relative to CWD).
 * @param options   Parsing options (see CsvSuperOptions).
 * @yields          BatchResult — `{ rows, batchIndex, count, totalSoFar }`
 */
export async function* csvSuper(
  filePath: string,
  options: CsvSuperOptions = {},
): AsyncGenerator<BatchResult> {
  validateFilePath(filePath);
  const opts = validateOptions(options);
  // Normalize Windows file-URL paths: `new URL(...).pathname` on Windows returns
  // `/D:/path/to/file` (unix-style with drive letter). Strip the leading `/`
  // so that Node.js fs APIs receive a valid Windows path `D:/path/to/file`.
  // Matches: /C:/, /D:/, /c:/, /d:/, etc. — any single letter + colon.
  const normalizedPath = /^\/[A-Za-z]:\//.test(filePath) ? filePath.slice(1) : filePath;
  // Use as-is if already absolute (avoids drive-letter doubling on Windows).
  const absPath = isAbsolute(normalizedPath) ? normalizedPath : resolve(normalizedPath);

  // ── Pre-flight ENOENT check ──────────────────────────────────────────────
  try {
    await stat(absPath);
  } catch (err: unknown) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') {
      throw new CsvSuperError(
        `File not found: ${absPath}`,
        'CSV_SUPER_FILE_NOT_FOUND',
      );
    }
    if (nodeErr.code === 'EACCES') {
      throw new CsvSuperError(
        `Permission denied: ${absPath}`,
        'CSV_SUPER_PERMISSION_DENIED',
      );
    }
    throw err;
  }

  // ── Resolve encoding ─────────────────────────────────────────────────────
  let resolvedEncoding: BufferEncoding =
    opts.encoding === 'auto' ? 'utf8' : (opts.encoding as BufferEncoding);

  // ── Parser + batcher setup ───────────────────────────────────────────────
  const parser = new CsvParser({
    delimiter: opts.delimiter ?? ',',
    quote: opts.quote ?? '"',
    escape: opts.escape ?? '"',
    hasHeaders: opts.headers !== false,  // default true
    skipEmptyLines: opts.skipEmptyLines !== false,  // default true
  });

  const batcher = new BatchController(opts.batch ?? 1000);

  let totalRows = 0;
  let isFirstChunk = true;
  let stream: ReturnType<typeof createReadStream> | null = null;

  try {
    stream = createReadStream(absPath, {
      // Read raw bytes when auto-detecting encoding; otherwise decode inline
      encoding: opts.encoding === 'auto' ? undefined : resolvedEncoding,
      highWaterMark: opts.chunkSize ?? 65_536,
    });

    for await (const rawChunk of stream) {
      let text: string;

      if (opts.encoding === 'auto') {
        const buf = rawChunk as Buffer;
        if (isFirstChunk) {
          resolvedEncoding = detectEncodingFromBom(buf);
          isFirstChunk = false;
        }
        text = buf.toString(resolvedEncoding);
      } else {
        text = rawChunk as string;
      }

      // Strip BOM from the very first chunk
      if (isFirstChunk) {
        text = stripBom(text);
        isFirstChunk = false;
      } else if (totalRows === 0 && text.charCodeAt(0) === 0xfeff) {
        // BOM appeared in a later chunk boundary (very rare)
        text = stripBom(text);
      }

      parser.feed(text);

      const rows = parser.flush();
      for (const row of rows) {
        const batch = batcher.addAndMaybeFlush(row);
        if (batch !== null) {
          totalRows = batch.totalSoFar;
          opts.onProgress?.({
            bytesRead: 0,           // byte tracking not available in free tier
            totalBytes: 0,
            percentage: 0,
            speedMBps: 0,
            estimatedSecondsLeft: Infinity,
            rowsProcessed: totalRows,
          });
          yield batch;
        }
      }
    }

    // ── Finalize: flush parser's last partial line ─────────────────────────
    const finalRows = parser.finalize();
    for (const row of finalRows) {
      batcher.add(row);
    }

    const lastBatch = batcher.flush();
    if (lastBatch !== null) {
      totalRows = lastBatch.totalSoFar;
      opts.onProgress?.({
        bytesRead: 0,
        totalBytes: 0,
        percentage: 100,
        speedMBps: 0,
        estimatedSecondsLeft: 0,
        rowsProcessed: totalRows,
      });
      yield lastBatch;
    }

  } catch (err: unknown) {
    // Re-throw CsvSuperErrors unchanged
    if (err instanceof CsvSuperError) { throw err; }

    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') {
      throw new CsvSuperError(`File not found: ${absPath}`, 'CSV_SUPER_FILE_NOT_FOUND');
    }
    if (nodeErr.code === 'EACCES') {
      throw new CsvSuperError(`Permission denied: ${absPath}`, 'CSV_SUPER_PERMISSION_DENIED');
    }
    throw err;

  } finally {
    if (stream !== null && !stream.destroyed) {
      stream.destroy();
    }
  }
}
