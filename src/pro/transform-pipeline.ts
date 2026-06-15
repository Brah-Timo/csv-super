/**
 * TransformPipeline — Composable row transformation engine.
 *
 * Allows chaining multiple transform functions into a pipeline.
 * Each transform is applied in order. If any transform returns null,
 * the row is filtered out and subsequent transforms are skipped.
 *
 * @example
 * ```typescript
 * const pipeline = new TransformPipeline()
 *   .pipe((row) => row.status === 'inactive' ? null : row)  // filter
 *   .pipe((row) => ({ ...row, age: parseInt(row.age, 10) })) // type coerce
 *   .pipe(async (row) => {                                    // async enrich
 *     const geo = await geocode(row.address);
 *     return { ...row, lat: geo.lat, lng: geo.lng };
 *   });
 *
 * for await (const batch of csvSuperPro('data.csv', {
 *   licenseKey: key,
 *   transform: pipeline.toFn(),
 * })) {
 *   await db.insert(batch.rows);
 * }
 * ```
 */

import type { CsvRow, TransformFn, BatchResult } from '../types/index.js';

export class TransformPipeline {
  private readonly steps: TransformFn[] = [];

  /**
   * Add a transform step to the pipeline.
   * Returns `this` for method chaining.
   *
   * @param fn  Transform function: row → modified row | null (filtered)
   */
  pipe(fn: TransformFn): this {
    this.steps.push(fn);
    return this;
  }

  /**
   * Export the pipeline as a single TransformFn.
   * This is what you pass to `csvSuperPro({ transform: pipeline.toFn() })`.
   */
  toFn(): TransformFn {
    if (this.steps.length === 0) {
      return (row) => row; // identity
    }

    return async (row: CsvRow): Promise<CsvRow | null> => {
      let current: CsvRow | null = row;

      for (const step of this.steps) {
        if (current === null) { break; }
        current = await step(current);
      }

      return current;
    };
  }

  /**
   * Apply the pipeline to an entire batch.
   * Rows transformed to null are removed from the result.
   *
   * @returns New BatchResult with transformed rows.
   */
  async applyToBatch(batch: BatchResult): Promise<BatchResult> {
    if (this.steps.length === 0) { return batch; }

    const fn = this.toFn();
    const transformed: CsvRow[] = [];

    for (const row of batch.rows) {
      const result = await fn(row);
      if (result !== null) {
        transformed.push(result);
      }
    }

    return {
      ...batch,
      rows:  transformed,
      count: transformed.length,
    };
  }

  /**
   * Apply the pipeline to an array of rows (without BatchResult wrapping).
   */
  async applyToRows(rows: CsvRow[]): Promise<CsvRow[]> {
    if (this.steps.length === 0) { return rows; }

    const fn = this.toFn();
    const result: CsvRow[] = [];

    for (const row of rows) {
      const transformed = await fn(row);
      if (transformed !== null) {
        result.push(transformed);
      }
    }

    return result;
  }

  /** Number of transform steps in the pipeline. */
  get size(): number {
    return this.steps.length;
  }

  /** Check if the pipeline has any transforms. */
  get isEmpty(): boolean {
    return this.steps.length === 0;
  }

  // ── Built-in transform helpers ────────────────────────────────────────────

  /**
   * Add a filter step that removes rows where `predicate` returns false.
   */
  filter(predicate: (row: CsvRow) => boolean | Promise<boolean>): this {
    return this.pipe(async (row) => {
      const keep = await predicate(row);
      return keep ? row : null;
    });
  }

  /**
   * Add a field selection step (keep only specified columns).
   *
   * @example `.select(['name', 'email', 'age'])`
   */
  select(columns: string[]): this {
    const colSet = new Set(columns);
    return this.pipe((row) => {
      const result: CsvRow = {};
      for (const col of columns) {
        if (colSet.has(col) && col in row) {
          result[col] = row[col] ?? '';
        }
      }
      return result;
    });
  }

  /**
   * Add a field rename step.
   *
   * @example `.rename({ 'old_name': 'newName', 'email_addr': 'email' })`
   */
  rename(mapping: Record<string, string>): this {
    return this.pipe((row) => {
      const result: CsvRow = { ...row };
      for (const [from, to] of Object.entries(mapping)) {
        if (from in result) {
          result[to] = result[from] ?? '';
          delete result[from];
        }
      }
      return result;
    });
  }

  /**
   * Add a field transformation step for specific columns.
   *
   * @example `.mapField('age', (v) => String(parseInt(v, 10)))`
   */
  mapField(column: string, fn: (value: string) => string | Promise<string>): this {
    return this.pipe(async (row) => {
      if (!(column in row)) { return row; }
      const newVal = await fn(row[column] ?? '');
      return { ...row, [column]: newVal };
    });
  }

  /**
   * Add a field trimming step (removes leading/trailing whitespace from all values).
   */
  trim(): this {
    return this.pipe((row) => {
      const result: CsvRow = {};
      for (const [k, v] of Object.entries(row)) {
        result[k] = v.trim();
      }
      return result;
    });
  }
}
