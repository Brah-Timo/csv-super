/**
 * Unit tests for LineSplitter.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LineSplitter } from '../../src/core/line-splitter.js';

describe('LineSplitter', () => {
  let splitter: LineSplitter;

  beforeEach(() => {
    splitter = new LineSplitter();
  });

  describe('feed()', () => {
    it('splits single line correctly', () => {
      const lines = splitter.feed('hello world\n');
      expect(lines).toEqual(['hello world']);
    });

    it('splits multiple lines correctly', () => {
      const lines = splitter.feed('line1\nline2\nline3\n');
      expect(lines).toEqual(['line1', 'line2', 'line3']);
    });

    it('handles CRLF (\\r\\n)', () => {
      const lines = splitter.feed('line1\r\nline2\r\n');
      expect(lines).toEqual(['line1', 'line2']);
    });

    it('handles CR only (\\r)', () => {
      const lines = splitter.feed('line1\rline2\r');
      expect(lines).toEqual(['line1', 'line2']);
    });

    it('accumulates partial lines across chunks', () => {
      const chunk1 = splitter.feed('lin');
      expect(chunk1).toEqual([]);

      const chunk2 = splitter.feed('e1\n');
      expect(chunk2).toEqual(['line1']);
    });

    it('handles chunk split right on newline character', () => {
      const chunk1 = splitter.feed('line1');
      expect(chunk1).toEqual([]);

      const chunk2 = splitter.feed('\nline2\n');
      expect(chunk2).toEqual(['line1', 'line2']);
    });

    it('returns empty array for chunk with no newline', () => {
      const lines = splitter.feed('no newline here');
      expect(lines).toEqual([]);
      expect(splitter.getRemainder()).toBe('no newline here');
    });
  });

  describe('finalize()', () => {
    it('flushes the last partial line on finalize()', () => {
      splitter.feed('line1\npartial');
      const last = splitter.finalize();
      expect(last).toEqual(['partial']);
    });

    it('returns empty array on finalize() if no remainder', () => {
      splitter.feed('line1\n');
      const last = splitter.finalize();
      expect(last).toEqual([]);
    });

    it('clears remainder after finalize()', () => {
      splitter.feed('partial');
      splitter.finalize();
      expect(splitter.getRemainder()).toBe('');
    });
  });

  describe('reset()', () => {
    it('clears internal state', () => {
      splitter.feed('partial line');
      splitter.reset();
      expect(splitter.getRemainder()).toBe('');
    });
  });
});
