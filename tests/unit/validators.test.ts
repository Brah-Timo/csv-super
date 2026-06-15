/**
 * Unit tests for input validators.
 */

import { describe, it, expect } from 'vitest';
import { validateOptions } from '../../src/utils/validators.js';
import { CsvSuperError } from '../../src/errors/CsvSuperError.js';

describe('validateOptions()', () => {

  it('accepts valid default options', () => {
    expect(() => validateOptions({})).not.toThrow();
  });

  it('accepts valid custom options', () => {
    expect(() => validateOptions({
      batch: 500,
      delimiter: '\t',
      quote: '"',
      escape: '"',
      encoding: 'utf8',
      headers: true,
      skipEmptyLines: false,
      chunkSize: 65536,
    })).not.toThrow();
  });

  describe('batch validation', () => {
    it('rejects batch = 0', () => {
      expect(() => validateOptions({ batch: 0 })).toThrow(CsvSuperError);
    });

    it('rejects negative batch', () => {
      expect(() => validateOptions({ batch: -100 })).toThrow(CsvSuperError);
    });

    it('rejects non-integer batch', () => {
      expect(() => validateOptions({ batch: 1.5 })).toThrow(CsvSuperError);
    });

    it('rejects extremely large batch', () => {
      expect(() => validateOptions({ batch: 2_000_000 })).toThrow(CsvSuperError);
    });

    it('accepts batch = 1', () => {
      expect(() => validateOptions({ batch: 1 })).not.toThrow();
    });
  });

  describe('delimiter validation', () => {
    it('rejects multi-char delimiter', () => {
      expect(() => validateOptions({ delimiter: ',,' })).toThrow(CsvSuperError);
    });

    it('rejects empty delimiter', () => {
      expect(() => validateOptions({ delimiter: '' })).toThrow(CsvSuperError);
    });

    it('rejects newline as delimiter', () => {
      expect(() => validateOptions({ delimiter: '\n' })).toThrow(CsvSuperError);
      expect(() => validateOptions({ delimiter: '\r' })).toThrow(CsvSuperError);
    });

    it('accepts tab delimiter', () => {
      expect(() => validateOptions({ delimiter: '\t' })).not.toThrow();
    });

    it('accepts pipe delimiter', () => {
      expect(() => validateOptions({ delimiter: '|' })).not.toThrow();
    });
  });

  describe('quote/escape validation', () => {
    it('rejects multi-char quote', () => {
      expect(() => validateOptions({ quote: '""' })).toThrow(CsvSuperError);
    });

    it('rejects delimiter === quote', () => {
      expect(() => validateOptions({ delimiter: ',', quote: ',' })).toThrow(CsvSuperError);
    });
  });

  describe('chunkSize validation', () => {
    it('rejects chunkSize < 1024', () => {
      expect(() => validateOptions({ chunkSize: 512 })).toThrow(CsvSuperError);
    });

    it('rejects extremely large chunkSize', () => {
      expect(() => validateOptions({ chunkSize: 20 * 1024 * 1024 })).toThrow(CsvSuperError);
    });

    it('accepts chunkSize = 1024', () => {
      expect(() => validateOptions({ chunkSize: 1024 })).not.toThrow();
    });
  });

  describe('encoding validation', () => {
    it('rejects unsupported encoding', () => {
      expect(() => validateOptions({ encoding: 'utf32' as 'utf8' })).toThrow(CsvSuperError);
    });

    it('accepts all supported encodings', () => {
      const valid: Array<'utf8' | 'utf16le' | 'latin1' | 'auto'> = ['utf8', 'utf16le', 'latin1', 'auto'];
      for (const enc of valid) {
        expect(() => validateOptions({ encoding: enc })).not.toThrow();
      }
    });
  });
});
