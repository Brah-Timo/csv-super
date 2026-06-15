/**
 * Unit tests for BatchController.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BatchController } from '../../src/core/batch-controller.js';
import type { CsvRow } from '../../src/types/index.js';

const makeRow = (id: number): CsvRow => ({ id: String(id), name: `User ${id}` });

describe('BatchController', () => {

  describe('Constructor', () => {
    it('creates with valid batch size', () => {
      expect(() => new BatchController(100)).not.toThrow();
      expect(() => new BatchController(1)).not.toThrow();
    });

    it('throws on batch size < 1', () => {
      expect(() => new BatchController(0)).toThrow(RangeError);
      expect(() => new BatchController(-1)).toThrow(RangeError);
      expect(() => new BatchController(0.5)).toThrow(RangeError);
    });
  });

  describe('isFull / isEmpty', () => {
    it('is empty initially', () => {
      const ctrl = new BatchController(3);
      expect(ctrl.isEmpty()).toBe(true);
      expect(ctrl.isFull()).toBe(false);
    });

    it('is full when batch size reached', () => {
      const ctrl = new BatchController(3);
      ctrl.add(makeRow(1));
      ctrl.add(makeRow(2));
      expect(ctrl.isFull()).toBe(false);
      ctrl.add(makeRow(3));
      expect(ctrl.isFull()).toBe(true);
      expect(ctrl.isEmpty()).toBe(false);
    });
  });

  describe('release', () => {
    it('releases rows and resets internal state', () => {
      const ctrl = new BatchController(2);
      ctrl.add(makeRow(1));
      ctrl.add(makeRow(2));

      const batch = ctrl.release();

      expect(batch.rows).toHaveLength(2);
      expect(batch.count).toBe(2);
      expect(batch.batchIndex).toBe(0);
      expect(batch.totalSoFar).toBe(2);
      expect(ctrl.isEmpty()).toBe(true);
    });

    it('increments batchIndex on each release', () => {
      const ctrl = new BatchController(1);
      ctrl.add(makeRow(1));
      expect(ctrl.release().batchIndex).toBe(0);

      ctrl.add(makeRow(2));
      expect(ctrl.release().batchIndex).toBe(1);

      ctrl.add(makeRow(3));
      expect(ctrl.release().batchIndex).toBe(2);
    });

    it('accumulates totalSoFar correctly', () => {
      const ctrl = new BatchController(3);

      ctrl.add(makeRow(1));
      ctrl.add(makeRow(2));
      ctrl.add(makeRow(3));
      expect(ctrl.release().totalSoFar).toBe(3);

      ctrl.add(makeRow(4));
      ctrl.add(makeRow(5));
      ctrl.add(makeRow(6));
      expect(ctrl.release().totalSoFar).toBe(6);
    });

    it('rows array is zero-copy transferred on release', () => {
      const ctrl = new BatchController(2);
      ctrl.add(makeRow(1));
      ctrl.add(makeRow(2));

      const batch = ctrl.release();
      // After release, adding a new row should NOT affect the previous batch
      ctrl.add(makeRow(99));
      expect(batch.rows).toHaveLength(2);
    });
  });

  describe('pendingCount', () => {
    it('tracks pending row count', () => {
      const ctrl = new BatchController(10);
      expect(ctrl.pendingCount).toBe(0);
      ctrl.add(makeRow(1));
      expect(ctrl.pendingCount).toBe(1);
      ctrl.add(makeRow(2));
      expect(ctrl.pendingCount).toBe(2);
      ctrl.release();
      expect(ctrl.pendingCount).toBe(0);
    });
  });

  describe('reset', () => {
    it('resets all counters', () => {
      const ctrl = new BatchController(2);
      ctrl.add(makeRow(1));
      ctrl.add(makeRow(2));
      ctrl.release();
      ctrl.add(makeRow(3));

      ctrl.reset();

      expect(ctrl.isEmpty()).toBe(true);
      expect(ctrl.totalRowsReleased).toBe(0);
    });
  });
});
