/**
 * BatchController — Accumulates parsed rows and releases them as typed batches.
 *
 * Used by both the free-tier csvSuper() generator and the Pro worker threads.
 * The worker API requires: isFull(), isEmpty(), release(), totalRowsReleased,
 * pendingCount.  The free-tier generator uses add() + flush().
 */

import type { BatchResult, CsvRow } from '../types/index.js';

export class BatchController {
  private batch: CsvRow[] = [];
  private batchIndex = 0;
  private totalSoFar = 0;
  private _totalRowsReleased = 0;
  private readonly batchSize: number;

  constructor(batchSize: number) {
    if (!Number.isInteger(batchSize) || batchSize < 1) {
      throw new RangeError(
        `BatchController: batchSize must be a positive integer, got ${String(batchSize)}`,
      );
    }
    this.batchSize = batchSize;
  }

  // ── Row accumulation ────────────────────────────────────────────────────────

  /**
   * Add a single row to the pending batch.
   * Does NOT auto-release — caller decides when to release via isFull()/release().
   */
  add(row: CsvRow): void {
    this.batch.push(row);
    this.totalSoFar++;
  }

  // ── Pro worker API ──────────────────────────────────────────────────────────

  /** True when the pending batch has reached the configured batch size. */
  isFull(): boolean {
    return this.batch.length >= this.batchSize;
  }

  /** True when there are no pending (unreleased) rows. */
  isEmpty(): boolean {
    return this.batch.length === 0;
  }

  /**
   * Release the current pending batch as a BatchResult.
   * Clears the internal buffer and increments the batch index.
   * Throws if called on an empty batch — check isEmpty() first.
   */
  release(): BatchResult {
    const rows = this.batch;
    const count = rows.length;
    const result: BatchResult = {
      rows,
      batchIndex: this.batchIndex,
      count,
      totalSoFar: this.totalSoFar,
    };
    this._totalRowsReleased += count;
    this.batch = [];
    this.batchIndex++;
    return result;
  }

  /** Cumulative rows released across all release() calls. */
  get totalRowsReleased(): number {
    return this._totalRowsReleased;
  }

  /** Number of rows currently buffered (not yet released). */
  get pendingCount(): number {
    return this.batch.length;
  }

  // ── Free-tier generator API ─────────────────────────────────────────────────

  /**
   * Add a row and immediately release if the batch is full.
   * Returns the completed BatchResult when full, otherwise null.
   * Convenience wrapper for the single-threaded generator code path.
   */
  addAndMaybeFlush(row: CsvRow): BatchResult | null {
    this.add(row);
    if (this.isFull()) {
      return this.release();
    }
    return null;
  }

  /**
   * Flush any remaining buffered rows as a final (partial) batch.
   * Returns null if there are no pending rows.
   */
  flush(): BatchResult | null {
    if (this.isEmpty()) {
      return null;
    }
    return this.release();
  }

  // ── Misc ────────────────────────────────────────────────────────────────────

  /** Total rows added so far (includes pending rows). */
  get total(): number {
    return this.totalSoFar;
  }

  /** Number of complete batches released so far. */
  get emittedBatches(): number {
    return this.batchIndex;
  }

  /** Reset all state (useful for reuse). */
  reset(): void {
    this.batch = [];
    this.batchIndex = 0;
    this.totalSoFar = 0;
    this._totalRowsReleased = 0;
  }
}
