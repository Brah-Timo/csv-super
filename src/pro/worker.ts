/**
 * worker.ts — Worker Thread code for csv-super Pro multi-threading.
 *
 * This file runs in a SEPARATE thread context — it cannot access
 * variables, imports, or state from the main thread.
 *
 * Communication protocol:
 *   Main → Worker: WorkerTask (via postMessage)
 *   Worker → Main: WorkerMessage (batch | done | error)
 *
 * Each worker receives a byte range [start, end] of the CSV file
 * and parses its portion independently.
 *
 * Boundary handling:
 * - The first worker starts at byte 0 (includes the header row).
 * - Workers 2..N start at their assigned byte, then skip forward
 *   to the next complete line to avoid splitting a row mid-way.
 * - The header is parsed once by worker 0 and broadcast to others.
 */

import { workerData, parentPort, isMainThread } from 'node:worker_threads';
import { createReadStream } from 'node:fs';
import { CsvParser } from '../core/csv-parser.js';
import { BatchController } from '../core/batch-controller.js';
import type { CsvSuperProOptions, BatchResult } from '../types/index.js';

// Guard: this file must NOT be imported in the main thread
if (isMainThread) {
  throw new Error('worker.ts must be run as a Worker Thread, not directly imported.');
}

// ─── Message types ────────────────────────────────────────────────────────────

export interface WorkerTask {
  taskId: number;
  start: number;           // byte offset to start reading
  end: number;             // byte offset to stop reading (inclusive)
  batchSize: number;
  headers: string[] | null; // null = this worker reads its own header
}

export type WorkerMessage =
  | { type: 'batch';  taskId: number; batch: BatchResult }
  | { type: 'done';   taskId: number; totalRows: number }
  | { type: 'error';  taskId: number; message: string; stack?: string }
  | { type: 'header'; taskId: number; headers: string[] };

// ─── Worker initialization ────────────────────────────────────────────────────

const options = workerData as CsvSuperProOptions & { filePath: string };
const port = parentPort!;

port.on('message', (task: WorkerTask) => {
  void processTask(task);
});

// ─── Task processor ───────────────────────────────────────────────────────────

async function processTask(task: WorkerTask): Promise<void> {
  try {
    const { taskId, start, end, batchSize, headers } = task;

    // Create parser — for non-first workers, skip header detection
    const parser = new CsvParser({
      delimiter: options.delimiter ?? ',',
      quote:     options.quote    ?? '"',
      escape:    options.escape   ?? '"',
      // Worker 0 reads headers. Others receive them from the thread pool.
      hasHeaders:     taskId === 0,
      skipEmptyLines: options.skipEmptyLines ?? true,
    });

    // If we received headers from worker 0, inject them into the parser
    if (headers !== null && taskId !== 0) {
      // Manually set headers via the parser's internal mechanism
      // by feeding a fake header line (will be consumed as headers)
      const fakeLine = headers.join(options.delimiter ?? ',') + '\n';
      parser.feed(fakeLine);
    }

    const batchCtrl = new BatchController(batchSize);

    // Create a ReadStream for this byte range
    const stream = createReadStream(options.filePath, {
      encoding:       'utf8',
      start,
      end,
      highWaterMark:  65_536,
      // autoClose: true (default)
    });

    // If this is not the first worker, skip to the first complete line.
    // The byte range may start in the middle of a line left over from
    // the previous worker's range.
    let skipFirstLine = start > 0;

    for await (const rawChunk of stream) {
      const chunk = rawChunk as string;

      if (skipFirstLine) {
        // Find the first \n and skip everything up to and including it
        const nlIdx = chunk.indexOf('\n');
        if (nlIdx === -1) {
          // No newline in this chunk — entire chunk is the leftover partial line
          continue;
        }
        skipFirstLine = false;
        parser.feed(chunk.slice(nlIdx + 1));
      } else {
        parser.feed(chunk);
      }

      const rows = parser.flush();

      // If this is worker 0 and we just got headers, broadcast them
      if (taskId === 0 && parser.headerNames !== null && rows.length === 0) {
        const msg: WorkerMessage = { type: 'header', taskId, headers: parser.headerNames };
        port.postMessage(msg);
      }

      // Apply transform if configured
      const processedRows = options.transform
        ? await applyTransform(rows, options.transform, options.transformContext)
        : rows;

      for (const row of processedRows) {
        batchCtrl.add(row);
        if (batchCtrl.isFull()) {
          const msg: WorkerMessage = { type: 'batch', taskId, batch: batchCtrl.release() };
          port.postMessage(msg);
        }
      }
    }

    // Finalize: flush parser's last partial line
    const remaining = parser.finalize().map((row) => row);
    const processedRemaining = options.transform
      ? await applyTransform(remaining, options.transform, options.transformContext)
      : remaining;

    for (const row of processedRemaining) {
      batchCtrl.add(row);
    }

    if (!batchCtrl.isEmpty()) {
      const msg: WorkerMessage = { type: 'batch', taskId, batch: batchCtrl.release() };
      port.postMessage(msg);
    }

    const doneMsg: WorkerMessage = {
      type: 'done',
      taskId,
      totalRows: batchCtrl.totalRowsReleased,
    };
    port.postMessage(doneMsg);

  } catch (err) {
    const errMsg: WorkerMessage = {
      type:    'error',
      taskId:  task.taskId,
      message: err instanceof Error ? err.message : String(err),
      stack:   err instanceof Error ? (err.stack ?? '') : '',
    };
    port.postMessage(errMsg);
  }
}

// ─── Transform helper ─────────────────────────────────────────────────────────

import type { CsvRow, TransformFn } from '../types/index.js';

async function applyTransform(
  rows: CsvRow[],
  transformFn: TransformFn,
  context?: Record<string, unknown>,
): Promise<CsvRow[]> {
  const result: CsvRow[] = [];
  // Inject context into row if provided
  for (const row of rows) {
    const transformed = await transformFn(row);
    if (transformed !== null) {
      // If context was provided, merge it separately (avoids type conflict)
      if (context !== undefined) {
        const enriched: CsvRow = { ...transformed };
        // Pass context values as string-coerced (CsvRow = Record<string, string>)
        for (const [k, v] of Object.entries(context)) {
          enriched[`__ctx_${k}`] = String(v);
        }
        result.push(enriched);
      } else {
        result.push(transformed);
      }
    }
  }
  return result;
}
