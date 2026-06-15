// =============================================================================
// src/utils/encoding-detector.ts — Detect file encoding from BOM bytes
// =============================================================================

export type DetectedEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'utf-32le' | 'utf-32be';

/**
 * Detect the text encoding of a buffer by inspecting its BOM (Byte Order Mark).
 * Falls back to 'utf-8' when no BOM is found.
 */
export function detectEncoding(buffer: Buffer): DetectedEncoding {
  // UTF-32 LE: FF FE 00 00
  if (
    buffer.length >= 4 &&
    buffer[0] === 0xff && buffer[1] === 0xfe &&
    buffer[2] === 0x00 && buffer[3] === 0x00
  ) {
    return 'utf-32le';
  }

  // UTF-32 BE: 00 00 FE FF
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x00 && buffer[1] === 0x00 &&
    buffer[2] === 0xfe && buffer[3] === 0xff
  ) {
    return 'utf-32be';
  }

  // UTF-16 LE: FF FE
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return 'utf-16le';
  }

  // UTF-16 BE: FE FF
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return 'utf-16be';
  }

  // UTF-8 BOM: EF BB BF (optional, but some editors add it)
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
  ) {
    return 'utf-8';
  }

  // Default: UTF-8
  return 'utf-8';
}

/**
 * Strip the BOM from the start of a string if present.
 */
export function stripBom(str: string): string {
  if (str.charCodeAt(0) === 0xfeff) {
    return str.slice(1);
  }
  return str;
}

/**
 * Returns the byte length of the BOM for a given encoding.
 */
export function bomLength(encoding: DetectedEncoding): number {
  switch (encoding) {
    case 'utf-32le':
    case 'utf-32be':
      return 4;
    case 'utf-16le':
    case 'utf-16be':
      return 2;
    case 'utf-8':
      return 3; // EF BB BF (but only if present)
    default:
      return 0;
  }
}
