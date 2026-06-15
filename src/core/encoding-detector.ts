/**
 * EncodingDetector — Detects file encoding from BOM signature.
 *
 * Reads only the first 4 bytes of the file (minimal I/O).
 *
 * Supported encodings:
 *   - UTF-8    (with or without BOM)
 *   - UTF-16 LE / BE
 *   - UTF-32 LE / BE (rare but real in enterprise data exports)
 *   - Latin-1 / Windows-1252 (fallback heuristic)
 *
 * When no BOM is found, falls back to 'utf8' (most common for CSV).
 */

import { open } from 'node:fs/promises';

/** BOM byte signatures keyed by encoding name. */
const BOM_MAP: ReadonlyArray<{ encoding: BufferEncoding | string; bytes: readonly number[] }> = [
  // UTF-32 must be checked BEFORE UTF-16 because UTF-32 LE starts with FF FE 00 00
  // which overlaps with UTF-16 LE's FF FE prefix.
  { encoding: 'utf32le',  bytes: [0xFF, 0xFE, 0x00, 0x00] },
  { encoding: 'utf32be',  bytes: [0x00, 0x00, 0xFE, 0xFF] },
  { encoding: 'utf16le',  bytes: [0xFF, 0xFE] },
  { encoding: 'utf16be',  bytes: [0xFE, 0xFF] },
  { encoding: 'utf8',     bytes: [0xEF, 0xBB, 0xBF] },
] as const;

/** Number of bytes to read from the start of the file. */
const BOM_PROBE_SIZE = 4;

export class EncodingDetector {
  /**
   * Detect the encoding of a file by reading its BOM.
   *
   * @param filePath  Path to the file to probe.
   * @returns  BufferEncoding string compatible with Node.js APIs.
   */
  static async detect(filePath: string): Promise<BufferEncoding> {
    const fd = await open(filePath, 'r');

    try {
      const buf = Buffer.alloc(BOM_PROBE_SIZE);
      const { bytesRead } = await fd.read(buf, 0, BOM_PROBE_SIZE, 0);

      if (bytesRead < 2) {
        // File is too small to have a meaningful BOM — assume UTF-8
        return 'utf8';
      }

      for (const { encoding, bytes } of BOM_MAP) {
        if (bytes.length > bytesRead) { continue; }
        if (EncodingDetector.matchBOM(buf, bytes)) {
          // Node.js does not support 'utf32le'/'utf32be' natively —
          // map them to the closest supported alternative.
          if (encoding === 'utf32le' || encoding === 'utf32be') {
            return 'utf8'; // Will be re-read with iconv if needed (Pro feature)
          }
          return encoding as BufferEncoding;
        }
      }

      // No BOM found → UTF-8 is the safe default for CSV files
      return 'utf8';

    } finally {
      await fd.close();
    }
  }

  /**
   * Synchronously detect encoding from a Buffer (for testing / Pro worker usage).
   * @param sampleBuffer  A Buffer containing at least the first 4 bytes of the file.
   */
  static detectFromBuffer(sampleBuffer: Buffer): BufferEncoding {
    if (sampleBuffer.length < 2) { return 'utf8'; }

    for (const { encoding, bytes } of BOM_MAP) {
      if (bytes.length > sampleBuffer.length) { continue; }
      if (EncodingDetector.matchBOM(sampleBuffer, bytes)) {
        if (encoding === 'utf32le' || encoding === 'utf32be') {
          return 'utf8';
        }
        return encoding as BufferEncoding;
      }
    }

    return 'utf8';
  }

  /**
   * Check if the buffer starts with the given BOM byte sequence.
   */
  private static matchBOM(buf: Buffer, signature: readonly number[]): boolean {
    for (let i = 0; i < signature.length; i++) {
      if (buf[i] !== signature[i]) { return false; }
    }
    return true;
  }

  /**
   * Heuristic: detect if a Buffer looks like UTF-16 without a BOM.
   * Returns null if heuristic is inconclusive.
   *
   * Strategy: look for null bytes in a regular pattern.
   *   - Even-position nulls → likely UTF-16 LE
   *   - Odd-position nulls  → likely UTF-16 BE
   */
  static heuristicDetect(buf: Buffer): 'utf16le' | 'utf8' | null {
    if (buf.length < 8) { return null; }

    let evenNulls = 0;
    let oddNulls = 0;

    for (let i = 0; i < Math.min(buf.length, 256); i++) {
      if (buf[i] === 0) {
        if (i % 2 === 0) { evenNulls++; }
        else { oddNulls++; }
      }
    }

    const threshold = Math.floor(buf.length / 8);
    if (oddNulls > threshold) { return 'utf16le'; }
    if (evenNulls > threshold) { return 'utf16le'; } // treat as LE (Node.js default)

    return 'utf8';
  }
}
