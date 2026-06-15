/**
 * pro-transform.ts — Pro tier: Transform Pipeline examples.
 *
 * Requires a valid Pro license key.
 */

import { csvSuperPro, TransformPipeline } from 'csv-super';

const LICENSE_KEY = process.env['CSV_SUPER_KEY'] ?? 'your-license-key';

// ──────────────────────────────────────────────────────────────────────────────
// Example 1: Inline transform function
// ──────────────────────────────────────────────────────────────────────────────
async function example1_inline_transform(): Promise<void> {
  for await (const batch of csvSuperPro('employees.csv', {
    licenseKey: LICENSE_KEY,
    threads: 4,
    batch: 2_000,
    transform: (row) => {
      // Filter: skip inactive employees
      if (row['active'] === 'false') { return null; }

      // Type coerce + normalize
      return {
        ...row,
        salary:    String(parseFloat(row['salary'] ?? '0')),
        age:       String(parseInt(row['age'] ?? '0', 10)),
        email:     (row['email'] ?? '').toLowerCase().trim(),
        full_name: `${row['first_name'] ?? ''} ${row['last_name'] ?? ''}`.trim(),
      };
    },
  })) {
    console.log(`Batch ${batch.batchIndex}: ${batch.count} active employees`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Example 2: TransformPipeline (composable, chainable)
// ──────────────────────────────────────────────────────────────────────────────
async function example2_pipeline(): Promise<void> {
  const pipeline = new TransformPipeline()
    // Step 1: Filter — remove inactive rows
    .filter((row) => row['status'] === 'active')

    // Step 2: Trim whitespace from all fields
    .trim()

    // Step 3: Select only needed columns
    .select(['id', 'name', 'email', 'salary', 'department'])

    // Step 4: Rename columns
    .rename({ 'id': 'employee_id', 'name': 'full_name' })

    // Step 5: Type coerce salary
    .mapField('salary', (v) => String(Math.round(parseFloat(v))))

    // Step 6: Add computed field
    .pipe((row) => ({
      ...row,
      salary_band: parseInt(row['salary'] ?? '0', 10) > 100_000 ? 'senior' : 'standard',
    }));

  for await (const batch of csvSuperPro('employees.csv', {
    licenseKey: LICENSE_KEY,
    threads: 8,
    batch: 5_000,
    transform: pipeline.toFn(),
  })) {
    console.log(
      `Batch ${batch.batchIndex}: ${batch.count} rows | ` +
      `Total: ${batch.totalSoFar}`
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Example 3: Async transform (DB lookup enrichment)
// ──────────────────────────────────────────────────────────────────────────────
async function example3_async_transform(): Promise<void> {
  // Simulated async geocoder
  const geocode = async (city: string): Promise<{ lat: string; lng: string }> => {
    // In real usage: call a geocoding API
    void city;
    return { lat: '48.8566', lng: '2.3522' };
  };

  const pipeline = new TransformPipeline()
    .pipe(async (row) => {
      if (!row['city']) { return row; }
      const { lat, lng } = await geocode(row['city']);
      return { ...row, lat, lng };
    });

  for await (const batch of csvSuperPro('locations.csv', {
    licenseKey: LICENSE_KEY,
    transform: pipeline.toFn(),
  })) {
    console.log(`Enriched ${batch.count} rows with geo data`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Example 4: No transform — just multi-threading for speed
// ──────────────────────────────────────────────────────────────────────────────
async function example4_pure_speed(): Promise<void> {
  let total = 0;
  const start = performance.now();

  for await (const batch of csvSuperPro('huge-file.csv', {
    licenseKey: LICENSE_KEY,
    threads: 8,     // Use 8 threads
    batch: 10_000,  // Large batches for maximum throughput
  })) {
    total += batch.count;
  }

  const elapsed = (performance.now() - start) / 1_000;
  console.log(`✅ ${total.toLocaleString()} rows in ${elapsed.toFixed(2)}s`);
  console.log(`   Throughput: ${Math.round(total / elapsed).toLocaleString()} rows/sec`);
}

// Run
void example1_inline_transform().catch(console.error);
