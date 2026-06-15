# csv-super Architecture

## Overview

csv-super is built on three layered components:

```
┌─────────────────────────────────────────────────────────────┐
│                     csvSuper()                              │
│              (Async Generator — public API)                 │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  I/O Layer   │→ │ Parser Layer │→ │ Delivery Layer   │  │
│  │              │  │              │  │                  │  │
│  │ ReadStream   │  │  CsvParser   │  │ BatchController  │  │
│  │ (64KB chunks)│  │  (FSM)       │  │ (yield batches)  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                             │
│  Supporting: EncodingDetector, ProgressTracker,            │
│              MemoryMonitor, Validators                      │
└─────────────────────────────────────────────────────────────┘
```

## Backpressure Mechanism

The core innovation is using an `async function*` (Async Generator) as the
delivery mechanism. Here's why it provides automatic backpressure:

```javascript
// Consumer side:
for await (const batch of csvSuper('data.csv')) {
  await expensiveDbInsert(batch.rows);  // ← this takes 50ms
}
```

Timeline:
1. `csvSuper` yields batch #0 → consumer receives it
2. Consumer starts `await expensiveDbInsert(...)` → suspends for 50ms
3. **While consumer is suspended:** the generator is suspended at `yield`
4. **While generator is suspended:** `getNextChunk()` is NOT called
5. **While `getNextChunk()` is not called:** `readStream.resume()` is NOT called
6. **While stream is not resumed:** Node.js stops reading from disk
7. After 50ms, consumer's await resolves → generator resumes → reads next chunk

**Result:** Disk read speed ≤ consumer processing speed. Memory stays bounded.

## State Machine States

```
START_OF_RECORD
    │
    ├─ (newline) → [empty line → skip/emit] → START_OF_RECORD
    │
    └─ (any char) → START_OF_FIELD
                        │
                        ├─ (quote char) → IN_QUOTED_FIELD ←────────────┐
                        │                       │                       │
                        │                 (quote char) → AFTER_CLOSE_QUOTE
                        │                       │
                        │                 (escape+quote) → [literal quote] → IN_QUOTED_FIELD
                        │                       │
                        │                 (newline) → [literal newline in field]
                        │
                        └─ (other) → IN_PLAIN_FIELD
                                          │
                                          ├─ (delimiter) → [push field] → START_OF_FIELD
                                          ├─ (newline) → [push field, commit record] → START_OF_RECORD
                                          └─ (other) → [accumulate] → IN_PLAIN_FIELD
```

## Pro: Multi-Thread Architecture

```
Main Thread
├── LicenseChecker.verify()
├── stat(file) → get file size
├── Divide into N byte ranges
├── ThreadPool.initialize() → spawn N workers
└── ThreadPool.process()
        │
        ├── Worker 0: range [0, size/N]
        │     ├── Reads header row → broadcasts to main
        │     ├── Parses rows
        │     └── Posts BatchResult messages
        │
        ├── Worker 1: range [size/N, 2*size/N]
        │     ├── Awaits header broadcast from Worker 0
        │     ├── Skips first partial line (byte range may split a line)
        │     ├── Parses rows
        │     └── Posts BatchResult messages
        │
        └── Worker N-1: range [(N-1)*size/N, size]
              └── same as Worker 1

Main Thread
└── Collect all BatchResults
└── Re-order by taskId (preserves original file order)
└── yield* ordered batches
```

## Memory Model

```
Heap at steady state:
┌──────────────────────────────────────────────────────────┐
│  Stream read buffer:   64KB    (chunkSize)                │
│  Parser internal buf:  ~1KB    (current field/record)     │
│  Current batch:        ~5MB    (1000 rows × 5KB avg)      │
│  Previous batch:       freed   (transferred to consumer)  │
│  Overhead (V8, etc):   ~10MB                              │
│                                                           │
│  TOTAL: ~15-50MB regardless of file size                  │
└──────────────────────────────────────────────────────────┘

Why previous batches are freed:
- BatchController.release() transfers the array reference (zero-copy)
- After yield, the generator is suspended
- The consumer processes and discards the batch
- V8 GC collects it before the next yield
```
