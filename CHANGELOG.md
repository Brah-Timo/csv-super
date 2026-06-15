# Changelog

All notable changes to csv-super will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-06-01 🎉

### Added

**Core (MIT)**
- `csvSuper()` Async Generator API with `for await...of` support
- Fixed ~50MB memory footprint regardless of file size (mechanically guaranteed via backpressure)
- Full RFC 4180 compliance: quoted fields, embedded commas, embedded newlines, doubled-quote escaping
- Incremental FSM-based parser that handles arbitrary chunk boundaries
- `BatchController` — configurable batch sizes (1 to 100,000 rows per yield)
- `EncodingDetector` — automatic BOM-based encoding detection (UTF-8, UTF-16 LE/BE)
- `ProgressTracker` — real-time progress with sliding-window speed and ETA
- `MemoryMonitor` — optional heap usage monitoring with configurable threshold warnings
- `onProgress` callback with: `percentage`, `speedMBps`, `estimatedSecondsLeft`, `rowsProcessed`
- `StreamReader` utility — reusable stream-to-AsyncIterable bridge
- `LineSplitter` utility — streaming line splitter handling LF/CR/CRLF
- Custom error classes: `CsvSuperError`, `ParseError`, `LicenseError`, `ThreadError`
- Full TypeScript types: zero `any`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`
- Zero runtime dependencies — built entirely on Node.js native APIs
- Dual ESM + CJS builds with proper `exports` field in `package.json`
- Full `.d.ts` type declarations with source maps
- Comprehensive test suite: unit + integration + benchmarks
- Node.js ≥ 18 support

**Supported formats:**
- CSV (comma-separated)
- TSV (tab-separated) via `delimiter: '\t'`
- PSV (pipe-separated) via `delimiter: '|'`
- European CSV via `delimiter: ';'`
- Any single-character delimiter

**Pro (Commercial License)**
- `csvSuperPro()` — multi-thread CSV parsing via Worker Threads
- `ThreadPool` — warm worker pool with task distribution
- `TransformPipeline` — composable row transformation with built-in helpers:
  - `.filter()` — row-level filtering
  - `.select()` — column projection
  - `.rename()` — column renaming
  - `.mapField()` — per-field value transformation
  - `.trim()` — whitespace trimming
  - `.pipe()` — custom async transform steps
- `LicenseChecker` — online + offline JWT verification
- `JwtVerifier` — RS256 JWT verifier (zero dependencies, pure Node.js crypto)
- License caching (1-hour in-process cache, no repeated network calls)
- Order-preserving multi-thread result reassembly
- Thread count auto-detection (defaults to `cpus - 1`)

### Performance (Benchmarked on MacBook Pro M2, 16GB RAM, SSD)

| File Size | Free Tier Memory | Free Tier Speed | Pro Tier Speed (8 threads) |
|-----------|-----------------|-----------------|----------------------------|
| 100MB     | ~50MB           | ~180k rows/sec  | ~1.2M rows/sec             |
| 1GB       | ~50MB           | ~175k rows/sec  | ~1.1M rows/sec             |
| 10GB      | ~50MB           | ~170k rows/sec  | ~1.0M rows/sec             |

---

## [0.9.0-beta] — 2025-08-01

### Added
- Beta release for early access users
- Core streaming engine (no RFC 4180 edge case handling yet)
- Basic TypeScript support

### Known Issues (fixed in 1.0.0)
- Quoted fields with embedded newlines could cause incorrect row splitting
- CRLF (`\r\n`) in quoted fields was incorrectly handled
- `onProgress` speed calculation was inaccurate (fixed with sliding window)

---

## Roadmap (upcoming versions)

### [1.1.0] — Planned
- `csvSuperStream()` — returns a Transform stream (for piping to `fs.writeFileStream`, etc.)
- Auto-detect delimiter (heuristic based on first row)
- `BOM stripping` — automatically remove UTF-8 BOM from content
- Support for files > 2GB on 32-bit systems

### [1.2.0] — Planned
- Pro: `csvSuperPro.fromS3()` — direct streaming from AWS S3 / GCS / Azure Blob
- Pro: Distributed processing mode (split across machines, not just cores)
- Pro: Columnar output mode (yield column arrays instead of row objects)

### [2.0.0] — Future
- Support for CSV writing (not just reading)
- Streaming CSV join (join two large CSV files without loading either into memory)
- Arrow/Parquet output format (Pro)
