/**
 * Unit tests for EncodingDetector.
 */

import { describe, it, expect } from 'vitest';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EncodingDetector } from '../../src/core/encoding-detector.js';

const TMP = tmpdir();

async function writeTmpFile(name: string, content: Buffer | string): Promise<string> {
  const path = join(TMP, `csv-super-test-${name}`);
  await writeFile(path, content);
  return path;
}

describe('EncodingDetector — detect()', () => {

  it('detects UTF-8 with BOM', async () => {
    const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
    const content = Buffer.concat([bom, Buffer.from('name,age\nAlice,30\n', 'utf8')]);
    const path = await writeTmpFile('utf8bom.csv', content);

    try {
      const encoding = await EncodingDetector.detect(path);
      expect(encoding).toBe('utf8');
    } finally {
      await unlink(path);
    }
  });

  it('detects UTF-8 without BOM (defaults to utf8)', async () => {
    const path = await writeTmpFile('utf8nobom.csv', 'name,age\nAlice,30\n');

    try {
      const encoding = await EncodingDetector.detect(path);
      expect(encoding).toBe('utf8');
    } finally {
      await unlink(path);
    }
  });

  it('detects UTF-16 LE', async () => {
    const bom = Buffer.from([0xFF, 0xFE]);
    const content = Buffer.concat([bom, Buffer.from('test', 'utf8')]);
    const path = await writeTmpFile('utf16le.csv', content);

    try {
      const encoding = await EncodingDetector.detect(path);
      expect(encoding).toBe('utf16le');
    } finally {
      await unlink(path);
    }
  });

  it('returns utf8 for very small files', async () => {
    const path = await writeTmpFile('tiny.csv', 'a');

    try {
      const encoding = await EncodingDetector.detect(path);
      expect(encoding).toBe('utf8');
    } finally {
      await unlink(path);
    }
  });
});

describe('EncodingDetector — detectFromBuffer()', () => {

  it('detects UTF-8 BOM from buffer', () => {
    const buf = Buffer.from([0xEF, 0xBB, 0xBF, 0x61, 0x62]);
    expect(EncodingDetector.detectFromBuffer(buf)).toBe('utf8');
  });

  it('detects UTF-16 LE BOM from buffer', () => {
    const buf = Buffer.from([0xFF, 0xFE, 0x61, 0x00]);
    expect(EncodingDetector.detectFromBuffer(buf)).toBe('utf16le');
  });

  it('returns utf8 for no BOM', () => {
    const buf = Buffer.from('name,age', 'utf8');
    expect(EncodingDetector.detectFromBuffer(buf)).toBe('utf8');
  });

  it('returns utf8 for buffer smaller than 2 bytes', () => {
    const buf = Buffer.from([0xEF]);
    expect(EncodingDetector.detectFromBuffer(buf)).toBe('utf8');
  });
});
