/**
 * MemoryMonitor — Real-time heap usage tracking.
 *
 * Monitors V8 heap usage at configurable intervals and fires a callback
 * when usage exceeds a threshold. Used internally for Pro diagnostics
 * and available to consumers for custom memory management.
 *
 * The monitor uses `timer.unref()` so it never prevents Node.js from exiting.
 */

export interface MemorySnapshot {
  /** V8 heap used (allocated objects) in MB */
  heapUsedMB: number;
  /** V8 heap total (allocated by V8, including free slots) in MB */
  heapTotalMB: number;
  /** RSS (Resident Set Size — total process memory) in MB */
  rssMB: number;
  /** External memory (Buffers, etc.) in MB */
  externalMB: number;
  /** ISO 8601 timestamp */
  timestamp: string;
}

export interface MemoryMonitorOptions {
  /**
   * Polling interval in milliseconds.
   * @default 1000
   */
  intervalMs?: number;

  /**
   * Heap usage threshold in MB that triggers the warning callback.
   * @default 200
   */
  warningThresholdMB?: number;

  /**
   * Called when heap usage exceeds `warningThresholdMB`.
   * @default logs a console.warn message
   */
  onWarning?: (snapshot: MemorySnapshot) => void;

  /**
   * Called on every interval tick (for logging / dashboards).
   */
  onTick?: (snapshot: MemorySnapshot) => void;
}

export class MemoryMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly opts: Required<MemoryMonitorOptions>;

  constructor(options: MemoryMonitorOptions = {}) {
    this.opts = {
      intervalMs: options.intervalMs ?? 1_000,
      warningThresholdMB: options.warningThresholdMB ?? 200,
      onWarning: options.onWarning ?? ((snap) => {
        // eslint-disable-next-line no-console
        console.warn(
          `⚠️  csv-super: Heap reached ${snap.heapUsedMB.toFixed(1)}MB. ` +
          `Consider reducing batch size or chunkSize.`,
        );
      }),
      onTick: options.onTick ?? (() => undefined),
    };
  }

  /** Start monitoring. Idempotent — safe to call multiple times. */
  start(): void {
    if (this.timer !== null) { return; }

    this.timer = setInterval(() => {
      const snap = MemoryMonitor.snapshot();
      this.opts.onTick(snap);

      if (snap.heapUsedMB > this.opts.warningThresholdMB) {
        this.opts.onWarning(snap);
      }
    }, this.opts.intervalMs);

    // Don't prevent Node.js from exiting naturally
    this.timer.unref();
  }

  /** Stop monitoring. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Whether monitoring is currently active. */
  get isRunning(): boolean {
    return this.timer !== null;
  }

  /**
   * Take a one-shot memory snapshot.
   * Static — can be called without an instance.
   */
  static snapshot(): MemorySnapshot {
    const mem = process.memoryUsage();
    const toMB = (bytes: number): number => bytes / (1024 * 1024);

    return {
      heapUsedMB:  toMB(mem.heapUsed),
      heapTotalMB: toMB(mem.heapTotal),
      rssMB:       toMB(mem.rss),
      externalMB:  toMB(mem.external),
      timestamp:   new Date().toISOString(),
    };
  }

  /**
   * Format a snapshot as a human-readable string.
   * @example "Heap: 45.3 / 67.2 MB | RSS: 89.1 MB"
   */
  static format(snap: MemorySnapshot): string {
    return (
      `Heap: ${snap.heapUsedMB.toFixed(1)} / ${snap.heapTotalMB.toFixed(1)} MB` +
      ` | RSS: ${snap.rssMB.toFixed(1)} MB` +
      ` | Ext: ${snap.externalMB.toFixed(1)} MB`
    );
  }
}
