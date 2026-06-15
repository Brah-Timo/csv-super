/**
 * generate-large.ts — Generates a large CSV file for benchmarking.
 *
 * Usage:
 *   tsx tests/fixtures/generate-large.ts [rows] [output]
 *
 * Examples:
 *   tsx tests/fixtures/generate-large.ts 1000000 /tmp/bench-1M.csv
 *   tsx tests/fixtures/generate-large.ts 10000000 /tmp/bench-10M.csv
 */

import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const ROWS    = parseInt(process.argv[2] ?? '1000000', 10);
const OUTPUT  = process.argv[3] ?? '/tmp/csv-super-bench.csv';

const FIRST_NAMES = ['Alice','Bob','Charlie','Diana','Eve','Frank','Grace','Henry','Iris','Jack'];
const LAST_NAMES  = ['Smith','Jones','Garcia','Martinez','Wilson','Anderson','Taylor','Thomas','Moore','Jackson'];
const CITIES      = ['New York','London','Paris','Berlin','Tokyo','Sydney','Toronto','Dubai','Singapore','Mumbai'];
const COUNTRIES   = ['USA','UK','France','Germany','Japan','Australia','Canada','UAE','Singapore','India'];
const DEPARTMENTS = ['Engineering','Marketing','Sales','HR','Design','Management','Finance','Legal','IT','Operations'];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

async function generate(): Promise<void> {
  console.log(`Generating ${ROWS.toLocaleString()} rows → ${OUTPUT}`);
  const startTime = Date.now();

  const CHUNK_SIZE = 100_000; // rows per write batch

  const header = 'id,first_name,last_name,email,age,city,country,salary,department,active,score,notes\n';

  const writeStream = createWriteStream(OUTPUT, { encoding: 'utf8' });

  // Generate rows in chunks to avoid huge string allocation
  async function* rowGenerator(): AsyncIterable<string> {
    yield header;

    let buffer = '';

    for (let i = 1; i <= ROWS; i++) {
      const firstName  = randomItem(FIRST_NAMES);
      const lastName   = randomItem(LAST_NAMES);
      const email      = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`;
      const age        = 20 + (i % 45);
      const city       = randomItem(CITIES);
      const country    = randomItem(COUNTRIES);
      const salary     = 40_000 + (i % 100_000);
      const department = randomItem(DEPARTMENTS);
      const active     = i % 3 !== 0 ? 'true' : 'false';
      const score      = (Math.random() * 100).toFixed(2);
      // Every 1000th row has a quoted note to test parser edge cases
      const notes = i % 1000 === 0
        ? `"Special row #${i}, requires ""attention"""`
        : `Row ${i}`;

      buffer += `${i},${firstName},${lastName},${email},${age},${city},${country},${salary},${department},${active},${score},${notes}\n`;

      if (i % CHUNK_SIZE === 0) {
        yield buffer;
        buffer = '';
        process.stdout.write(`\r  Progress: ${((i / ROWS) * 100).toFixed(1)}%`);
      }
    }

    if (buffer.length > 0) { yield buffer; }
  }

  await pipeline(Readable.from(rowGenerator()), writeStream);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n✅ Done! Generated in ${elapsed}s → ${OUTPUT}`);
}

generate().catch((err: unknown) => {
  console.error('Generation failed:', err);
  process.exit(1);
});
