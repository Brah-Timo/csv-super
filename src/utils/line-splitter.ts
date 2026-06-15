// =============================================================================
// src/utils/line-splitter.ts — Streaming line splitter
// =============================================================================
//
// Handles the edge cases of splitting a stream of text chunks into lines:
//   - \n  (Unix)
//   - \r\n (Windows)
//   - \r  (old Mac)
//   - Quoted fields that span multiple lines (RFC 4180)
//
// =============================================================================

export class LineSplitter {
  private buffer: string = '';
  private readonly quote: string;

  constructor(quote = '"') {
    this.quote = quote;
  }

  /**
   * Push a chunk of text and get back all complete lines.
   * Incomplete lines are buffered internally until the next push.
   */
  push(chunk: string): string[] {
    this.buffer += chunk;
    return this.extractLines();
  }

  /**
   * Flush the remaining buffer as a final line (if non-empty).
   * Call this after all chunks have been pushed.
   */
  flush(): string[] {
    const remaining = this.buffer;
    this.buffer = '';
    if (remaining.length > 0) {
      return [remaining];
    }
    return [];
  }

  /**
   * Reset the internal buffer (useful when reusing the splitter).
   */
  reset(): void {
    this.buffer = '';
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private extractLines(): string[] {
    const lines: string[] = [];
    let pos = 0;
    let inQuote = false;
    const len = this.buffer.length;
    const q = this.quote;

    while (pos < len) {
      const ch = this.buffer[pos];

      if (ch === q) {
        // Toggle quote state. Two consecutive quotes inside a quoted field
        // represent a literal quote character — don't toggle there.
        if (inQuote && this.buffer[pos + 1] === q) {
          pos += 2; // skip escaped quote
          continue;
        }
        inQuote = !inQuote;
        pos++;
        continue;
      }

      if (!inQuote) {
        if (ch === '\n') {
          lines.push(this.buffer.slice(0, pos));
          this.buffer = this.buffer.slice(pos + 1);
          pos = 0;
          len === pos; // reset local len — use continue to re-evaluate
          continue;
        }

        if (ch === '\r') {
          const line = this.buffer.slice(0, pos);
          // Eat the \r\n together if Windows line ending
          const skip = this.buffer[pos + 1] === '\n' ? 2 : 1;
          this.buffer = this.buffer.slice(pos + skip);
          lines.push(line);
          pos = 0;
          continue;
        }
      }

      pos++;
    }

    return lines;
  }
}
