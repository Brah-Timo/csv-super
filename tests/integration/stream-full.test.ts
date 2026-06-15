/**
 * Integration tests for csvSuper() — full streaming pipeline.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { csvSuper } from '../../src/core/csv-super.js';
import { CsvSuperError } from '../../src/errors/CsvSuperError.js';

const TMP = join(tmpdir(), 'csv-super-integration');

beforeAll(async () => {
  await mkdir(TMP, { recursive: true });
});

async function writeCsv(name: string, content: string): Promise<string> {
  const path = join(TMP, name);
  await writeFile(path, content, 'utf8');
  return path;
}

describe('csvSuper() — Core Integration', () => {

  it('reads all rows from a simple CSV', async () => {
    const path = await writeCsv('simple.csv', 'name,age\nAlice,30\nBob,25\nCharlie,35\n');
    const rows = [];
    for await (const batch of csvSuper(path)) {
      rows.push(...batch.rows);
    }
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ name: 'Alice', age: '30' });
    await unlink(path);
  });

  it('yields correct batchIndex and totalSoFar', async () => {
    const data = Array.from({ length: 25 }, (_, i) => `${i},name${i}`).join('\n');
    const path = await writeCsv('batch-meta.csv', `id,name\n${data}\n`);

    const batches = [];
    for await (const batch of csvSuper(path, { batch: 10 })) {
      batches.push(batch);
    }

    expect(batches).toHaveLength(3); // 10 + 10 + 5
    expect(batches[0]?.batchIndex).toBe(0);
    expect(batches[1]?.batchIndex).toBe(1);
    expect(batches[2]?.batchIndex).toBe(2);
    expect(batches[0]?.totalSoFar).toBe(10);
    expect(batches[1]?.totalSoFar).toBe(20);
    expect(batches[2]?.totalSoFar).toBe(25);
    expect(batches[2]?.count).toBe(5);

    await unlink(path);
  });

  it('fires onProgress callbacks', async () => {
    const path = await writeCsv('progress.csv', 'name,age\nAlice,30\nBob,25\n');
    const progressEvents: number[] = [];

    for await (const _ of csvSuper(path, {
      onProgress: ({ percentage }) => { progressEvents.push(percentage); }
    })) {
      // consume
    }

    // Should have at least one progress event and end at 100
    expect(progressEvents.length).toBeGreaterThan(0);
    const lastEvent = progressEvents[progressEvents.length - 1];
    expect(lastEvent).toBe(100);

    await unlink(path);
  });

  it('handles TSV files with tab delimiter', async () => {
    const path = await writeCsv('data.tsv', 'name\tage\tCity\nAlice\t30\tParis\n');
    const rows = [];
    for await (const batch of csvSuper(path, { delimiter: '\t' })) {
      rows.push(...batch.rows);
    }
    expect(rows[0]).toEqual({ name: 'Alice', age: '30', City: 'Paris' });
    await unlink(path);
  });

  it('handles files without trailing newline', async () => {
    const path = await writeCsv('no-trailing.csv', 'name,age\nAlice,30\nBob,25');
    const rows = [];
    for await (const batch of csvSuper(path)) {
      rows.push(...batch.rows);
    }
    expect(rows).toHaveLength(2);
    await unlink(path);
  });

  it('handles large quoted fields correctly', async () => {
    const longText = 'A'.repeat(10_000);
    const path = await writeCsv('large-quote.csv', `name,data\nAlice,"${longText}"\n`);
    const rows = [];
    for await (const batch of csvSuper(path)) {
      rows.push(...batch.rows);
    }
    expect(rows[0]?.data).toBe(longText);
    await unlink(path);
  });

  it('handles break (early termination) without leaking file handle', async () => {
    const data = Array.from({ length: 10_000 }, (_, i) => `${i},name${i}`).join('\n');
    const path = await writeCsv('early-break.csv', `id,name\n${data}\n`);

    let count = 0;
    for await (const batch of csvSuper(path, { batch: 100 })) {
      count += batch.count;
      if (count >= 200) { break; }
    }

    // Should have stopped early
    expect(count).toBeLessThan(10_000);

    // File should be accessible after (no leaked handle)
    await unlink(path);
  });

  it('throws CsvSuperError for non-existent file', async () => {
    await expect(async () => {
      for await (const _ of csvSuper('/non/existent/path.csv')) { /* noop */ }
    }).rejects.toThrow(CsvSuperError);
  });

  it('reads the fixture small.csv correctly', async () => {
    const fixturePath = new URL('../fixtures/small.csv', import.meta.url).pathname;
    const rows = [];
    for await (const batch of csvSuper(fixturePath)) {
      rows.push(...batch.rows);
    }
    expect(rows).toHaveLength(10);
    expect(rows[0]?.name).toBe('Alice Johnson');
    expect(rows[5]?.name).toBe('Smith, John');
  });

  it('reads the fixture edge-cases.csv without errors', async () => {
    const fixturePath = new URL('../fixtures/edge-cases.csv', import.meta.url).pathname;
    const rows = [];
    for await (const batch of csvSuper(fixturePath)) {
      rows.push(...batch.rows);
    }
    expect(rows.length).toBeGreaterThan(0);
    // Row 1: field containing comma
    const row1 = rows.find((r) => r['id'] === '1');
    expect(row1?.description).toBe('Contains a comma, inside');
    // Row 2: escaped quotes
    const row2 = rows.find((r) => r['id'] === '2');
    expect(row2?.description).toBe('Contains "double quotes"');
    // Row 3: embedded newline
    const row3 = rows.find((r) => r['id'] === '3');
    expect(row3?.description).toContain('\n');
  });
});

describe('csvSuper() — Memory Stability', () => {

  it('maintains stable memory for 100k rows', async () => {
    // Generate 100k rows on-the-fly
    const lines = ['id,value,tag'];
    for (let i = 0; i < 100_000; i++) {
      lines.push(`${i},${Math.random().toFixed(4)},tag${i % 100}`);
    }
    const path = await writeCsv('100k.csv', lines.join('\n') + '\n');

    const before = process.memoryUsage().heapUsed;
    let rowCount = 0;

    for await (const batch of csvSuper(path, { batch: 1000 })) {
      rowCount += batch.count;
      // Simulate processing delay
      await new Promise((resolve) => setImmediate(resolve));
    }

    const after = process.memoryUsage().heapUsed;
    const deltaMB = (after - before) / (1024 * 1024);

    expect(rowCount).toBe(100_000);
    // Memory delta should be well below 100MB for 100k rows
    expect(deltaMB).toBeLessThan(100);

    await unlink(path);
  });
});
