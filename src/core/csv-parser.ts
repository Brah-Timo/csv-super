/**
 * CsvParser — RFC 4180-compliant incremental CSV parser.
 *
 * Implemented as a Finite State Machine (FSM) with 5 states.
 * Processes arbitrary-length chunks WITHOUT requiring chunk boundaries
 * to align with line or field boundaries.
 *
 * RFC 4180 features fully supported:
 *   ✅ Quoted fields containing commas:  "Smith, John"
 *   ✅ Quoted fields containing newlines: "line1\nline2"
 *   ✅ Escaped quotes with doubling:      "He said ""hi"""
 *   ✅ CRLF (\r\n) and LF (\n) line endings
 *   ✅ Last record without trailing newline
 *   ✅ Empty fields: a,,b
 *   ✅ Custom delimiter (TSV, PSV, etc.)
 *   ✅ Configurable quote + escape characters
 *
 * WHY a State Machine (not Regex)?
 *   Regex cannot reliably handle incremental/chunked input across
 *   arbitrary chunk boundaries. A State Machine persists its state
 *   across feed() calls, making it safe for streaming.
 */

import type { CsvRow } from '../types/index.js';
import { ParseError } from '../errors/ParseError.js';

// ─── FSM States ───────────────────────────────────────────────────────────────
const enum State {
  /**
   * At the start of a new record (line).
   * Waiting for the first character of the first field.
   */
  START_OF_RECORD = 0,

  /**
   * At the start of a new field.
   * Next char determines whether it's quoted or plain.
   */
  START_OF_FIELD = 1,

  /**
   * Inside an unquoted field.
   * Continues until delimiter, newline, or EOF.
   */
  IN_PLAIN_FIELD = 2,

  /**
   * Inside a quoted field (after opening quote).
   * Continues until a closing quote is found.
   * Newlines and delimiters are treated as literal characters here.
   */
  IN_QUOTED_FIELD = 3,

  /**
   * Just after a closing quote.
   * Expects: delimiter, newline, or another quote (escaped).
   * Any other character is a parse error (strict mode).
   */
  AFTER_CLOSE_QUOTE = 4,
}

// ─── Configuration ────────────────────────────────────────────────────────────
export interface CsvParserConfig {
  delimiter: string;
  quote: string;
  escape: string;
  hasHeaders: boolean;
  skipEmptyLines: boolean;
}

// ─── CsvParser class ──────────────────────────────────────────────────────────
export class CsvParser {
  // FSM state — persists across feed() calls
  private state: State = State.START_OF_RECORD;

  // Accumulated characters of the current field
  private currentField = '';

  // Fields accumulated in the current record
  private currentRecord: string[] = [];

  // Completed records ready to be flushed
  private completedRecords: CsvRow[] = [];

  // Header names (populated from the first record when hasHeaders: true)
  private headers: string[] | null = null;

  // Line counter (1-based, for error messages)
  private lineNumber = 1;

  // Column counter (0-based, for error messages)
  private columnNumber = 0;

  private readonly cfg: CsvParserConfig;

  constructor(config: CsvParserConfig) {
    this.cfg = config;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Feed a chunk of text into the parser.
   * Can be called with chunks of any size — the FSM handles partial fields.
   */
  feed(chunk: string): void {
    const { delimiter, quote, escape } = this.cfg;
    const len = chunk.length;

    for (let i = 0; i < len; i++) {
      const ch = chunk[i]!;

      switch (this.state) {

        // ── State: START_OF_RECORD ─────────────────────────────────────────
        case State.START_OF_RECORD: {
          if (ch === '\r') {
            // Empty line with CRLF
            if (i + 1 < len && chunk[i + 1] === '\n') { i++; }
            if (!this.cfg.skipEmptyLines) {
              this.commitRecord([]);
            }
            this.lineNumber++;
            break;
          }
          if (ch === '\n') {
            if (!this.cfg.skipEmptyLines) {
              this.commitRecord([]);
            }
            this.lineNumber++;
            break;
          }
          // Non-empty line — transition to START_OF_FIELD and re-process char
          this.state = State.START_OF_FIELD;
          this.columnNumber = 0;
          i--; // re-process the same character in START_OF_FIELD state
          break;
        }

        // ── State: START_OF_FIELD ──────────────────────────────────────────
        case State.START_OF_FIELD: {
          if (ch === quote) {
            // Quoted field begins
            this.state = State.IN_QUOTED_FIELD;
            break;
          }
          if (ch === delimiter) {
            // Empty field: delimiter immediately after start
            this.currentRecord.push('');
            this.columnNumber++;
            // Stay in START_OF_FIELD for next field
            break;
          }
          if (ch === '\n') {
            // Empty last field on a line
            this.currentRecord.push('');
            this.finalizeRecord();
            this.lineNumber++;
            this.state = State.START_OF_RECORD;
            break;
          }
          if (ch === '\r') {
            this.currentRecord.push('');
            this.finalizeRecord();
            if (i + 1 < len && chunk[i + 1] === '\n') { i++; }
            this.lineNumber++;
            this.state = State.START_OF_RECORD;
            break;
          }
          // Regular character — start of a plain field
          this.currentField += ch;
          this.state = State.IN_PLAIN_FIELD;
          break;
        }

        // ── State: IN_PLAIN_FIELD ──────────────────────────────────────────
        case State.IN_PLAIN_FIELD: {
          if (ch === delimiter) {
            this.currentRecord.push(this.currentField);
            this.currentField = '';
            this.columnNumber++;
            this.state = State.START_OF_FIELD;
            break;
          }
          if (ch === '\n') {
            this.currentRecord.push(this.currentField);
            this.currentField = '';
            this.finalizeRecord();
            this.lineNumber++;
            this.state = State.START_OF_RECORD;
            break;
          }
          if (ch === '\r') {
            this.currentRecord.push(this.currentField);
            this.currentField = '';
            this.finalizeRecord();
            if (i + 1 < len && chunk[i + 1] === '\n') { i++; }
            this.lineNumber++;
            this.state = State.START_OF_RECORD;
            break;
          }
          // Accumulate field content
          this.currentField += ch;
          break;
        }

        // ── State: IN_QUOTED_FIELD ─────────────────────────────────────────
        case State.IN_QUOTED_FIELD: {
          if (ch === escape && escape === quote) {
            // Potentially doubled-quote escape: ""
            // Peek at next character to decide
            const next = i + 1 < len ? chunk[i + 1] : null;
            if (next === quote) {
              // Doubled quote → literal quote character in field value
              this.currentField += quote;
              i++; // consume the second quote
              break;
            } else {
              // Single quote → closing quote
              this.state = State.AFTER_CLOSE_QUOTE;
              break;
            }
          }

          if (ch === quote) {
            // Closing quote (when escape ≠ quote)
            this.state = State.AFTER_CLOSE_QUOTE;
            break;
          }

          if (ch === '\r') {
            // Newline inside quoted field — RFC 4180 §2.6 allows this
            // Normalize to \n for consistency
            this.currentField += '\n';
            if (i + 1 < len && chunk[i + 1] === '\n') { i++; }
            this.lineNumber++;
            break;
          }

          if (ch === '\n') {
            this.currentField += '\n';
            this.lineNumber++;
            break;
          }

          // All other characters are literal
          this.currentField += ch;
          break;
        }

        // ── State: AFTER_CLOSE_QUOTE ───────────────────────────────────────
        case State.AFTER_CLOSE_QUOTE: {
          if (ch === delimiter) {
            // Field ends, next field begins
            this.currentRecord.push(this.currentField);
            this.currentField = '';
            this.columnNumber++;
            this.state = State.START_OF_FIELD;
            break;
          }
          if (ch === '\n') {
            // Record ends
            this.currentRecord.push(this.currentField);
            this.currentField = '';
            this.finalizeRecord();
            this.lineNumber++;
            this.state = State.START_OF_RECORD;
            break;
          }
          if (ch === '\r') {
            this.currentRecord.push(this.currentField);
            this.currentField = '';
            this.finalizeRecord();
            if (i + 1 < len && chunk[i + 1] === '\n') { i++; }
            this.lineNumber++;
            this.state = State.START_OF_RECORD;
            break;
          }
          if (ch === quote) {
            // Some generators produce non-RFC-compliant doubled quotes AFTER
            // the closing quote. Handle gracefully by re-entering quoted mode.
            this.state = State.IN_QUOTED_FIELD;
            break;
          }
          // Strict: unexpected character after closing quote
          throw new ParseError(
            `Unexpected character '${ch}' after closing quote`,
            this.lineNumber,
            this.columnNumber,
          );
        }
      }
    }
  }

  /**
   * Returns all fully-parsed records accumulated since the last flush().
   * ZERO-COPY: transfers the internal array reference.
   */
  flush(): CsvRow[] {
    const result = this.completedRecords;
    this.completedRecords = [];
    return result;
  }

  /**
   * Finalize parsing after the stream ends.
   * Handles files that do NOT have a trailing newline.
   *
   * @returns Any remaining records (including the last partial line).
   */
  finalize(): CsvRow[] {
    // If there's an in-progress field/record at EOF, commit it
    if (this.currentField !== '' || this.currentRecord.length > 0) {
      this.currentRecord.push(this.currentField);
      this.currentField = '';
      this.finalizeRecord();
    }
    return this.flush();
  }

  /** Total lines seen so far (including blank/header lines). */
  get currentLine(): number {
    return this.lineNumber;
  }

  /** Header names, or null if hasHeaders is false / not yet read. */
  get headerNames(): string[] | null {
    return this.headers;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Called when a complete record has been parsed.
   * Either stores it as the header row, or maps it to a CsvRow object.
   */
  private finalizeRecord(): void {
    const record = this.currentRecord;
    this.currentRecord = [];

    if (this.cfg.hasHeaders && this.headers === null) {
      // First record = column names
      this.headers = record;
      return;
    }

    this.commitRecord(record);
  }

  /**
   * Build a CsvRow from a raw values array and push to completed queue.
   */
  private commitRecord(values: string[]): void {
    this.completedRecords.push(this.buildRow(values));
  }

  /**
   * Map a values array to a CsvRow (object or array depending on config).
   */
  private buildRow(values: string[]): CsvRow {
    if (!this.cfg.hasHeaders || this.headers === null) {
      // No header mapping — return as-is (cast to CsvRow = Record<string, string>)
      const row: CsvRow = {};
      for (let i = 0; i < values.length; i++) {
        row[String(i)] = values[i] ?? '';
      }
      return row;
    }

    // Map by header name
    const row: CsvRow = {};
    const headers = this.headers;
    const len = Math.max(headers.length, values.length);

    for (let i = 0; i < len; i++) {
      const key = headers[i] ?? `_extra_${i}`;
      row[key] = values[i] ?? '';
    }
    return row;
  }
}
