/**
 * LineSplitter — Splits streaming chunks into complete lines.
 *
 * WHY this exists:
 * When Node.js reads a file in 64KB chunks, the chunk boundary
 * can fall in the MIDDLE of a line (or even in the middle of a
 * quoted field containing a newline). The CsvParser handles the
 * quoted-newline case internally, but LineSplitter handles the
 * simpler case of assembling partial lines across chunks.
 *
 * Used by: CsvParser internally (as a pre-processing step).
 *
 * Handles:
 *   - LF  (\n)       — Unix
 *   - CR  (\r)       — Old Mac
 *   - CRLF (\r\n)    — Windows
 *
 * NOTE: For CSV parsing, quoted fields with embedded newlines must
 * pass through the CSV State Machine, not LineSplitter. This class
 * is only used for non-quoted line breaking.
 */

export interface SplitResult {
  /** Complete lines ready for processing */
  lines: string[];
  /** Remaining partial line (no newline yet) */
  remainder: string;
}

export class LineSplitter {
  private remainder = '';

  /**
   * Feed a raw text chunk. Returns all complete lines extracted
   * from the chunk (+ any leftover from previous chunks).
   *
   * The returned lines do NOT include the newline character.
   */
  feed(chunk: string): string[] {
    const data = this.remainder + chunk;
    this.remainder = '';
    const lines: string[] = [];
    let start = 0;

    for (let i = 0; i < data.length; i++) {
      const ch = data[i];

      if (ch === '\n') {
        // LF or end of CRLF
        lines.push(data.slice(start, i));
        start = i + 1;
      } else if (ch === '\r') {
        lines.push(data.slice(start, i));
        // Peek ahead for CRLF
        if (data[i + 1] === '\n') {
          i++; // consume the \n too
        }
        start = i + 1;
      }
    }

    // Whatever is left after the last newline is a partial line
    if (start < data.length) {
      this.remainder = data.slice(start);
    }

    return lines;
  }

  /**
   * Signal EOF — flush the internal remainder as the final line.
   * Call this when the stream ends to handle files without trailing newline.
   */
  finalize(): string[] {
    const result = this.remainder.length > 0 ? [this.remainder] : [];
    this.remainder = '';
    return result;
  }

  /**
   * Peek at the current remainder without flushing.
   */
  getRemainder(): string {
    return this.remainder;
  }

  /**
   * Reset internal state (useful for reuse across multiple files).
   */
  reset(): void {
    this.remainder = '';
  }
}
