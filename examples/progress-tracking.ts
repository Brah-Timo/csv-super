/**
 * progress-tracking.ts — Real-time progress tracking examples.
 */

import { csvSuper } from 'csv-super';
import type { ProgressInfo } from 'csv-super';

// ──────────────────────────────────────────────────────────────────────────────
// Example 1: Simple percentage log
// ──────────────────────────────────────────────────────────────────────────────
async function example1_simple_log(): Promise<void> {
  for await (const batch of csvSuper('data.csv', {
    onProgress: ({ percentage, speedMBps }) => {
      if (percentage % 10 < 1) { // log every ~10%
        console.log(`${percentage.toFixed(0)}% done @ ${speedMBps.toFixed(1)} MB/s`);
      }
    },
  })) {
    void batch;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Example 2: Terminal progress bar with ETA
// ──────────────────────────────────────────────────────────────────────────────
function renderProgressBar(info: ProgressInfo): void {
  const { percentage, speedMBps, estimatedSecondsLeft, rowsProcessed } = info;
  const BAR_WIDTH = 35;

  const filled = Math.round((percentage / 100) * BAR_WIDTH);
  const bar = '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);

  const etaStr = isFinite(estimatedSecondsLeft)
    ? `ETA: ${estimatedSecondsLeft.toFixed(0)}s`
    : 'ETA: --';

  const line =
    `\r[${bar}] ${percentage.toFixed(1).padStart(5)}% ` +
    `| ${speedMBps.toFixed(1).padStart(5)} MB/s ` +
    `| ${rowsProcessed.toLocaleString().padStart(10)} rows ` +
    `| ${etaStr.padEnd(12)}`;

  process.stdout.write(line);
}

async function example2_terminal_bar(): Promise<void> {
  console.log('Processing data.csv...\n');

  for await (const batch of csvSuper('data.csv', {
    batch: 5_000,
    onProgress: renderProgressBar,
  })) {
    // Simulate some work per batch
    await new Promise<void>((resolve) => setImmediate(resolve));
    void batch;
  }

  process.stdout.write('\n✅ Complete!\n');
}

// ──────────────────────────────────────────────────────────────────────────────
// Example 3: Progress events aggregator for UI frameworks
// ──────────────────────────────────────────────────────────────────────────────
interface ProcessingState {
  percentage: number;
  speedMBps: number;
  rowsProcessed: number;
  isComplete: boolean;
}

class ProgressAggregator {
  private state: ProcessingState = {
    percentage: 0,
    speedMBps: 0,
    rowsProcessed: 0,
    isComplete: false,
  };

  private listeners = new Set<(state: ProcessingState) => void>();

  onUpdate(fn: (state: ProcessingState) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  update(info: ProgressInfo): void {
    this.state = {
      percentage: info.percentage,
      speedMBps: info.speedMBps,
      rowsProcessed: info.rowsProcessed,
      isComplete: info.percentage >= 100,
    };
    this.listeners.forEach((fn) => fn(this.state));
  }

  getState(): ProcessingState {
    return { ...this.state };
  }
}

async function example3_ui_integration(): Promise<void> {
  const progress = new ProgressAggregator();

  // Subscribe to updates (e.g., update React state)
  const unsub = progress.onUpdate((state) => {
    // In a real React app: setProgress(state)
    console.log(`UI update: ${state.percentage.toFixed(1)}%`);
  });

  for await (const batch of csvSuper('data.csv', {
    onProgress: (info) => progress.update(info),
  })) {
    void batch;
  }

  unsub();
}

// Run
void example2_terminal_bar().catch(console.error);
