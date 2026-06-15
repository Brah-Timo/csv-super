/**
 * ProgressTracker — Tracks read progress and computes speed/ETA.
 *
 * Uses a sliding window (last 1 second) for accurate speed calculation
 * instead of a naive total-bytes / total-time average.
 * This gives accurate readings even when I/O speed varies mid-file.
 */

import type { ProgressInfo } from '../types/index.js';

/** Individual sample for the speed sliding window. */
interface SpeedSample {
  bytes: number;
  time: number; // performance.now() value
}

/** Duration of the speed sliding window in milliseconds. */
const WINDOW_MS = 1_000;

export class ProgressTracker {
  private readonly totalBytes: number;
  private readonly encoding: BufferEncoding;
  private readonly callback: ((info: ProgressInfo) => void) | null;

  private bytesRead = 0;
  private rowsProcessed = 0;
  private readonly window: SpeedSample[] = [];
  private startTime: number;

  constructor(
    totalBytes: number,
    encoding: BufferEncoding,
    callback?: ((info: ProgressInfo) => void) | null,
  ) {
    this.totalBytes = totalBytes;
    this.encoding = encoding;
    this.callback = callback ?? null;
    this.startTime = performance.now();
  }

  /**
   * Called each time a chunk is read from disk.
   * @param chunkByteLength  Byte size of the chunk.
   */
  onChunk(chunkByteLength: number): void {
    if (this.callback === null) { return; }

    this.bytesRead += chunkByteLength;
    const now = performance.now();

    // Add current sample to window
    this.window.push({ bytes: chunkByteLength, time: now });

    // Remove samples older than WINDOW_MS
    const windowStart = now - WINDOW_MS;
    while (this.window.length > 0 && (this.window[0]?.time ?? 0) < windowStart) {
      this.window.shift();
    }

    // Compute speed from window
    const windowBytes = this.window.reduce((sum, s) => sum + s.bytes, 0);
    const windowDuration = this.window.length > 1
      ? now - (this.window[0]?.time ?? now)
      : WINDOW_MS;

    const speedBps = windowDuration > 0 ? (windowBytes / windowDuration) * 1_000 : 0;
    const speedMBps = speedBps / (1024 * 1024);

    const remaining = this.totalBytes - this.bytesRead;
    const estimatedSecondsLeft = speedBps > 0 ? remaining / speedBps : Infinity;

    const percentage = this.totalBytes > 0
      ? Math.min(100, (this.bytesRead / this.totalBytes) * 100)
      : 0;

    this.callback({
      bytesRead: this.bytesRead,
      totalBytes: this.totalBytes,
      percentage,
      speedMBps,
      estimatedSecondsLeft,
      rowsProcessed: this.rowsProcessed,
    });
  }

  /**
   * Update the row count (called by BatchController or main loop).
   * @param count  Number of rows just processed.
   */
  addRows(count: number): void {
    this.rowsProcessed += count;
  }

  /**
   * Called when the file is fully read.
   * Fires one final callback with 100% completion.
   */
  complete(): void {
    if (this.callback === null) { return; }

    const elapsed = (performance.now() - this.startTime) / 1_000;
    const speedMBps = elapsed > 0 ? (this.totalBytes / (1024 * 1024)) / elapsed : 0;

    this.callback({
      bytesRead: this.totalBytes,
      totalBytes: this.totalBytes,
      percentage: 100,
      speedMBps,
      estimatedSecondsLeft: 0,
      rowsProcessed: this.rowsProcessed,
    });
  }
}
