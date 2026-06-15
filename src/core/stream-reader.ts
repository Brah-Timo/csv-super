/**
 * StreamReader — Low-level stream-to-async-iterator bridge.
 *
 * Wraps a Node.js ReadableStream into an AsyncIterable<string>.
 * Ensures:
 *   1. Backpressure: stream pauses when consumer is busy
 *   2. Error propagation: stream errors reject the iterator
 *   3. Cleanup: destroy() always called on return/throw
 *
 * Used internally by csv-super.ts; can also be used standalone
 * for other streaming use cases.
 */

import type { Readable } from 'node:stream';

export interface StreamReaderOptions {
  /**
   * Text encoding for decoding Buffer chunks.
   * @default 'utf8'
   */
  encoding?: BufferEncoding;

  /**
   * Maximum number of chunks to buffer internally.
   * Useful when the consumer processes chunks in bursts.
   * @default 2
   */
  bufferSize?: number;
}

export class StreamReader implements AsyncIterable<string> {
  private readonly stream: Readable;
  private readonly encoding: BufferEncoding;
  private readonly maxBufferSize: number;

  constructor(stream: Readable, options: StreamReaderOptions = {}) {
    this.stream = stream;
    this.encoding = options.encoding ?? 'utf8';
    this.maxBufferSize = options.bufferSize ?? 2;
  }

  [Symbol.asyncIterator](): AsyncIterator<string> {
    const stream = this.stream;
    const encoding = this.encoding;
    const maxBuf = this.maxBufferSize;

    const queue: string[] = [];
    let done = false;
    let error: Error | null = null;

    // Pending Promise resolver/rejecter (for when consumer awaits)
    type Resolve = (result: IteratorResult<string>) => void;
    type Reject = (err: Error) => void;
    let pendingResolve: Resolve | null = null;
    let pendingReject: Reject | null = null;

    const onData = (raw: Buffer | string): void => {
      const chunk = Buffer.isBuffer(raw) ? raw.toString(encoding) : raw;

      if (pendingResolve !== null) {
        const resolve = pendingResolve;
        pendingResolve = null;
        pendingReject = null;
        stream.pause();
        resolve({ value: chunk, done: false });
      } else {
        queue.push(chunk);
        if (queue.length >= maxBuf) {
          stream.pause();
        }
      }
    };

    const onEnd = (): void => {
      done = true;
      if (pendingResolve !== null) {
        const resolve = pendingResolve;
        pendingResolve = null;
        pendingReject = null;
        resolve({ value: '', done: true });
      }
    };

    const onError = (err: Error): void => {
      error = err;
      if (pendingReject !== null) {
        const reject = pendingReject;
        pendingResolve = null;
        pendingReject = null;
        reject(err);
      }
    };

    stream.on('data', onData);
    stream.on('end', onEnd);
    stream.on('error', onError);

    const cleanup = (): void => {
      stream.off('data', onData);
      stream.off('end', onEnd);
      stream.off('error', onError);
      if (!stream.destroyed) {
        stream.destroy();
      }
    };

    return {
      next(): Promise<IteratorResult<string>> {
        if (queue.length > 0) {
          const chunk = queue.shift()!;
          // Re-enable reading if we were paused due to buffer full
          if (queue.length < maxBuf && !done) {
            stream.resume();
          }
          return Promise.resolve({ value: chunk, done: false });
        }

        if (done) {
          cleanup();
          return Promise.resolve({ value: '', done: true });
        }

        if (error !== null) {
          cleanup();
          return Promise.reject(error);
        }

        // Suspend until data arrives
        return new Promise<IteratorResult<string>>((resolve, reject) => {
          pendingResolve = resolve;
          pendingReject = reject;
          stream.resume();
        });
      },

      return(): Promise<IteratorResult<string>> {
        cleanup();
        return Promise.resolve({ value: '', done: true });
      },

      throw(err?: unknown): Promise<IteratorResult<string>> {
        cleanup();
        return Promise.reject(err instanceof Error ? err : new Error(String(err)));
      },
    };
  }

  /**
   * Utility: collect all chunks into a single string.
   * WARNING: Only use on small streams — defeats streaming purpose.
   */
  async readAll(): Promise<string> {
    let result = '';
    for await (const chunk of this) {
      result += chunk;
    }
    return result;
  }

  /**
   * Utility: get total byte count consumed (for progress tracking).
   */
  static bytesOf(chunk: string, encoding: BufferEncoding = 'utf8'): number {
    return Buffer.byteLength(chunk, encoding);
  }
}
