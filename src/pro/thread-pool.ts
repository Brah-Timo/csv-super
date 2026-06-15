/**
 * ThreadPool — Manages a pool of Worker Threads for parallel CSV parsing.
 *
 * Design decisions:
 *   1. Warm pool: workers are created ONCE and reused across tasks.
 *      Creating workers is expensive (~10ms each), so we pre-warm them.
 *
 *   2. Ordered results: results are collected per-taskId and yielded
 *      in original order, even if workers complete out of order.
 *
 *   3. Header broadcast: worker 0 reads the header row and broadcasts
 *      it to all other workers before they start processing.
 *
 *   4. Graceful shutdown: destroy() terminates all workers cleanly.
 */


import { Worker } from "node:worker_threads";
import { join } from "node:path";
import { ThreadError } from "../errors/ThreadError.js";
import type { BatchResult } from "../types/index.js";
import type { WorkerMessage, WorkerTask } from "./worker.js";
import type { CsvSuperProOptions } from "../types/index.js";

export interface ByteRange {
  start: number;
  end: number;
}

interface WorkerState {
  worker: Worker;
  busy: boolean;
}

export class ThreadPool {
  private readonly workers: WorkerState[] = [];
  private headersCache: string[] | null = null;
  private headersPromise: Promise<string[] | null> | null = null;
  private headersResolve: ((h: string[] | null) => void) | null = null;

  constructor(
    private readonly threadCount: number,
    private readonly filePath: string,
    private readonly options: CsvSuperProOptions,
  ) {}

  /**
   * Initialize worker pool
   */
  async initialize(): Promise<void> {
    // IMPORTANT FIX:
    // Avoid import.meta.url for CJS + ESM compatibility
    const workerPath = join(process.cwd(), "dist", "pro", "worker.js");

    this.headersPromise = new Promise<string[] | null>((resolve) => {
      this.headersResolve = resolve;
    });

    for (let i = 0; i < this.threadCount; i++) {
      const worker = new Worker(workerPath, {
        workerData: {
          ...this.options,
          filePath: this.filePath,
        },
      });

      this.workers.push({ worker, busy: false });
    }
  }

  async *process(
    ranges: ByteRange[],
    batchSize: number
  ): AsyncGenerator<BatchResult> {
    if (this.workers.length === 0) {
      throw new ThreadError(
        "ThreadPool not initialized. Call initialize() first.",
        -1,
        { start: 0, end: 0 }
      );
    }

    const collectedBatches = new Map<number, BatchResult[]>();
    const tasksDone = new Set<number>();
    const taskErrors = new Map<number, Error>();

    for (let i = 0; i < ranges.length; i++) {
      collectedBatches.set(i, []);
    }

    const taskPromises = ranges.map((range, taskId): Promise<void> => {
      const state = this.workers[taskId % this.workers.length];

      if (!state) {
        return Promise.reject(
          new ThreadError("Worker not found", taskId, range)
        );
      }

      state.busy = true;

      return new Promise<void>((resolve, reject) => {
        const sendTask = (headers: string[] | null): void => {
          const task: WorkerTask = {
            taskId,
            start: range.start,
            end: range.end,
            batchSize,
            headers,
          };

          state.worker.postMessage(task);
        };

        if (taskId === 0) {
          sendTask(null);
        } else {
          void this.headersPromise!.then((headers) => {
            sendTask(headers);
          });
        }

        state.worker.on("message", (msg: WorkerMessage) => {
          if (msg.taskId !== taskId) return;

          switch (msg.type) {
            case "header":
              this.headersCache = msg.headers;
              if (this.headersResolve) {
                this.headersResolve(msg.headers);
                this.headersResolve = null;
              }
              break;

            case "batch":
              collectedBatches.get(taskId)?.push(msg.batch);
              break;

            case "done":
              tasksDone.add(taskId);
              state.busy = false;
              resolve();
              break;

            case "error":
              state.busy = false;
              const err = new ThreadError(
                msg.message,
                taskId,
                range
              );
              taskErrors.set(taskId, err);
              reject(err);
              break;
          }
        });

        state.worker.on("error", (err: Error) => {
          state.busy = false;
          reject(
            new ThreadError(err.message, taskId, range, err)
          );
        });
      });
    });

    await Promise.all(taskPromises);

    if (taskErrors.size > 0) {
      throw taskErrors.values().next().value;
    }

    for (let taskId = 0; taskId < ranges.length; taskId++) {
      const batches = collectedBatches.get(taskId) ?? [];
      for (const batch of batches) {
        yield batch;
      }
    }
  }

  async destroy(): Promise<void> {
    await Promise.all(
      this.workers.map(({ worker }) => worker.terminate())
    );
    this.workers.length = 0;
  }

  get activeWorkers(): number {
    return this.workers.filter((w) => w.busy).length;
  }
}