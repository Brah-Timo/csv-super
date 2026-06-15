/**
 * Unit tests for CsvParser — RFC 4180 compliance test suite.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CsvParser } from '../../src/core/csv-parser.js';
import type { CsvParserConfig } from '../../src/core/csv-parser.js';

const defaultConfig: CsvParserConfig = {
  delimiter: ',',
  quote: '"',
  escape: '"',
  hasHeaders: true,
  skipEmptyLines: true,
};

function makeParser(overrides: Partial<CsvParserConfig> = {}): CsvParser {
  return new CsvParser({ ...defaultConfig, ...overrides });
}

describe('CsvParser — Basic Functionality', () => {

  it('parses a simple 1-row CSV with headers', () => {
    const p = makeParser();
    p.feed('name,age,city\nAlice,30,Paris\n');
    const rows = p.flush();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ name: 'Alice', age: '30', city: 'Paris' });
  });

  it('parses multiple rows correctly', () => {
    const p = makeParser();
    p.feed('name,age\nAlice,30\nBob,25\nCharlie,35\n');
    const rows = p.flush();
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ name: 'Alice', age: '30' });
    expect(rows[1]).toEqual({ name: 'Bob', age: '25' });
    expect(rows[2]).toEqual({ name: 'Charlie', age: '35' });
  });

  it('uses string indices as keys when hasHeaders=false', () => {
    const p = makeParser({ hasHeaders: false });
    p.feed('Alice,30,Paris\n');
    const rows = p.flush();
    expect(rows[0]).toEqual({ '0': 'Alice', '1': '30', '2': 'Paris' });
  });

  it('exposes headerNames after parsing first row', () => {
    const p = makeParser();
    p.feed('name,age,city\nAlice,30,Paris\n');
    p.flush();
    expect(p.headerNames).toEqual(['name', 'age', 'city']);
  });
});

describe('CsvParser — Quoted Fields (RFC 4180)', () => {

  it('handles field containing comma inside quotes', () => {
    const p = makeParser();
    p.feed('name,address\nAlice,"123 Main St, Apt 4"\n');
    const rows = p.flush();
    expect(rows[0]?.address).toBe('123 Main St, Apt 4');
  });

  it('handles doubled-quote escape: "" → "', () => {
    const p = makeParser();
    p.feed('name,quote\nAlice,"He said ""hello"""\n');
    const rows = p.flush();
    expect(rows[0]?.quote).toBe('He said "hello"');
  });

  it('handles newline inside quoted field', () => {
    const p = makeParser();
    p.feed('name,bio\nAlice,"Engineer\nand blogger"\n');
    const rows = p.flush();
    expect(rows[0]?.bio).toBe('Engineer\nand blogger');
  });

  it('handles delimiter inside quoted field', () => {
    const p = makeParser();
    p.feed('a,b,c\n"x,y",normal,"a,b,c"\n');
    const rows = p.flush();
    expect(rows[0]).toEqual({ a: 'x,y', b: 'normal', c: 'a,b,c' });
  });

  it('handles empty quoted field', () => {
    const p = makeParser();
    p.feed('a,b,c\n"",middle,""\n');
    const rows = p.flush();
    expect(rows[0]).toEqual({ a: '', b: 'middle', c: '' });
  });
});

describe('CsvParser — Line Endings', () => {

  it('handles LF (\\n) line endings', () => {
    const p = makeParser();
    p.feed('name,age\nAlice,30\nBob,25\n');
    expect(p.flush()).toHaveLength(2);
  });

  it('handles CRLF (\\r\\n) line endings', () => {
    const p = makeParser();
    p.feed('name,age\r\nAlice,30\r\nBob,25\r\n');
    const rows = p.flush();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: 'Alice', age: '30' });
  });

  it('handles CR (\\r) alone', () => {
    const p = makeParser();
    p.feed('name,age\rAlice,30\rBob,25\r');
    const rows = p.flush();
    expect(rows).toHaveLength(2);
  });

  it('handles mixed line endings in the same file', () => {
    const p = makeParser();
    p.feed('name,age\nAlice,30\r\nBob,25\n');
    expect(p.flush()).toHaveLength(2);
  });
});

describe('CsvParser — Chunked Input (Critical for Streaming)', () => {

  it('handles chunk cut in the middle of a plain field', () => {
    const p = makeParser();
    p.feed('name,age\nAli');  // chunk ends mid-field
    expect(p.flush()).toHaveLength(0); // no complete row yet
    p.feed('ce,30\n');
    const rows = p.flush();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ name: 'Alice', age: '30' });
  });

  it('handles chunk cut inside a quoted field', () => {
    const p = makeParser();
    p.feed('name,address\nAlice,"123 Main');
    expect(p.flush()).toHaveLength(0);
    p.feed(' St, Apt 4"\n');
    const rows = p.flush();
    expect(rows[0]?.address).toBe('123 Main St, Apt 4');
  });

  it('handles chunk cut inside a quoted field with embedded newline', () => {
    const p = makeParser();
    p.feed('name,bio\nAlice,"Line');
    p.feed(' 1\nLine 2"\n');
    const rows = p.flush();
    expect(rows[0]?.bio).toBe('Line 1\nLine 2');
  });

  it('handles chunk cut right on the delimiter', () => {
    const p = makeParser();
    p.feed('name,age\nAlice,');
    p.feed('30\n');
    const rows = p.flush();
    expect(rows[0]).toEqual({ name: 'Alice', age: '30' });
  });

  it('handles chunk cut right on a quote boundary', () => {
    const p = makeParser();
    p.feed('a,b\n"test"');
    p.feed(',value\n');
    const rows = p.flush();
    expect(rows[0]).toEqual({ a: 'test', b: 'value' });
  });

  it('processes 1-byte chunks correctly', () => {
    const p = makeParser();
    const data = 'a,b\n1,2\n';
    for (const char of data) {
      p.feed(char);
    }
    const rows = p.flush();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ a: '1', b: '2' });
  });
});

describe('CsvParser — Edge Cases', () => {

  it('handles file without trailing newline (finalize)', () => {
    const p = makeParser();
    p.feed('name,age\nAlice,30'); // no trailing \n
    const rows = p.finalize();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ name: 'Alice', age: '30' });
  });

  it('handles empty fields: a,,b', () => {
    const p = makeParser();
    p.feed('a,b,c\n1,,3\n');
    const rows = p.flush();
    expect(rows[0]).toEqual({ a: '1', b: '', c: '3' });
  });

  it('skips empty lines when skipEmptyLines=true', () => {
    const p = makeParser({ skipEmptyLines: true });
    p.feed('name,age\n\nAlice,30\n\n');
    const rows = p.flush();
    expect(rows).toHaveLength(1);
  });

  it('does not skip empty lines when skipEmptyLines=false', () => {
    const p = makeParser({ skipEmptyLines: false });
    p.feed('name,age\n\nAlice,30\n\n');
    // flush after feed — empty lines produce rows with empty values
    const rows = p.flush();
    expect(rows.length).toBeGreaterThan(0);
  });

  it('handles tab delimiter (TSV)', () => {
    const p = makeParser({ delimiter: '\t' });
    p.feed('name\tage\tCity\nAlice\t30\tParis\n');
    const rows = p.flush();
    expect(rows[0]).toEqual({ name: 'Alice', age: '30', City: 'Paris' });
  });

  it('handles pipe delimiter (PSV)', () => {
    const p = makeParser({ delimiter: '|' });
    p.feed('name|age\nAlice|30\n');
    const rows = p.flush();
    expect(rows[0]).toEqual({ name: 'Alice', age: '30' });
  });

  it('handles more values than headers (extra columns → _extra_N keys)', () => {
    const p = makeParser();
    p.feed('a,b\n1,2,3,4\n');
    const rows = p.flush();
    expect(rows[0]?.a).toBe('1');
    expect(rows[0]?.b).toBe('2');
    expect(rows[0]?.['_extra_2']).toBe('3');
    expect(rows[0]?.['_extra_3']).toBe('4');
  });

  it('handles fewer values than headers (missing columns → empty string)', () => {
    const p = makeParser();
    p.feed('a,b,c\n1,2\n');
    const rows = p.flush();
    expect(rows[0]).toEqual({ a: '1', b: '2', c: '' });
  });

  it('handles unicode content correctly', () => {
    const p = makeParser();
    p.feed('name,greeting\n李明,你好\nAhmed,مرحبا\n');
    const rows = p.flush();
    expect(rows[0]).toEqual({ name: '李明', greeting: '你好' });
    expect(rows[1]).toEqual({ name: 'Ahmed', greeting: 'مرحبا' });
  });
});

describe('CsvParser — Error Handling', () => {

  it('throws ParseError on unexpected character after closing quote', () => {
    const p = makeParser();
    expect(() => {
      p.feed('a,b\n"valid"UNEXPECTED,value\n');
    }).toThrow();
  });
});
