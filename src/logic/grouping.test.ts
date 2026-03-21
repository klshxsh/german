import { describe, it, expect } from 'vitest';
import { groupUnits, isUngrouped } from './grouping';
import { makeUnit } from '../test/factories';

describe('isUngrouped', () => {
  it('returns false for a fully grouped unit', () => {
    expect(isUngrouped(makeUnit({ year: 9, chapter: 1, unitNumber: 1 }))).toBe(false);
  });

  it('returns true when year is 0', () => {
    expect(isUngrouped(makeUnit({ year: 0, chapter: 1, unitNumber: 1 }))).toBe(true);
  });

  it('returns true when chapter is 0', () => {
    expect(isUngrouped(makeUnit({ year: 9, chapter: 0, unitNumber: 1 }))).toBe(true);
  });
});

describe('groupUnits', () => {
  it('returns empty yearGroups and ungrouped when no units', () => {
    const result = groupUnits([]);
    expect(result.yearGroups).toHaveLength(0);
    expect(result.ungrouped).toHaveLength(0);
  });

  it('places ungrouped units (year=0) in ungrouped array', () => {
    const unit = makeUnit({ year: 0, chapter: 0, unitNumber: 0 });
    const result = groupUnits([unit]);
    expect(result.yearGroups).toHaveLength(0);
    expect(result.ungrouped).toHaveLength(1);
    expect(result.ungrouped[0]).toBe(unit);
  });

  it('groups units by year', () => {
    const units = [
      makeUnit({ id: 1, name: 'A', year: 9, chapter: 1, unitNumber: 1 }),
      makeUnit({ id: 2, name: 'B', year: 10, chapter: 1, unitNumber: 1 }),
    ];
    const result = groupUnits(units);
    expect(result.yearGroups).toHaveLength(2);
    const years = result.yearGroups.map((g) => g.year);
    expect(years).toContain(9);
    expect(years).toContain(10);
  });

  it('sorts years descending (most recent first)', () => {
    const units = [
      makeUnit({ id: 1, name: 'A', year: 8, chapter: 1, unitNumber: 1 }),
      makeUnit({ id: 2, name: 'B', year: 10, chapter: 1, unitNumber: 1 }),
      makeUnit({ id: 3, name: 'C', year: 9, chapter: 1, unitNumber: 1 }),
    ];
    const result = groupUnits(units);
    const years = result.yearGroups.map((g) => g.year);
    expect(years).toEqual([10, 9, 8]);
  });

  it('sorts chapters numerically ascending', () => {
    const units = [
      makeUnit({ id: 1, name: 'Ch3', year: 9, chapter: 3, unitNumber: 1 }),
      makeUnit({ id: 2, name: 'Ch1', year: 9, chapter: 1, unitNumber: 1 }),
      makeUnit({ id: 3, name: 'Ch2', year: 9, chapter: 2, unitNumber: 1 }),
    ];
    const result = groupUnits(units);
    expect(result.yearGroups).toHaveLength(1);
    const chapters = result.yearGroups[0].chapters.map((c) => c.chapter);
    expect(chapters).toEqual([1, 2, 3]);
  });

  it('sorts units by unitNumber ascending within a chapter', () => {
    const units = [
      makeUnit({ id: 1, name: 'Unit 3', year: 9, chapter: 1, unitNumber: 3 }),
      makeUnit({ id: 2, name: 'Unit 1', year: 9, chapter: 1, unitNumber: 1 }),
      makeUnit({ id: 3, name: 'Unit 2', year: 9, chapter: 1, unitNumber: 2 }),
    ];
    const result = groupUnits(units);
    const chapterUnits = result.yearGroups[0].chapters[0].units;
    expect(chapterUnits.map((u) => u.unitNumber)).toEqual([1, 2, 3]);
  });

  it('separates grouped and ungrouped units', () => {
    const units = [
      makeUnit({ id: 1, name: 'Grouped', year: 9, chapter: 1, unitNumber: 1 }),
      makeUnit({ id: 2, name: 'Ungrouped', year: 0, chapter: 0, unitNumber: 0 }),
    ];
    const result = groupUnits(units);
    expect(result.yearGroups).toHaveLength(1);
    expect(result.yearGroups[0].chapters[0].units[0].name).toBe('Grouped');
    expect(result.ungrouped).toHaveLength(1);
    expect(result.ungrouped[0].name).toBe('Ungrouped');
  });

  it('handles multiple years each with multiple chapters', () => {
    const units = [
      makeUnit({ id: 1, name: 'Y9 Ch1', year: 9, chapter: 1, unitNumber: 1 }),
      makeUnit({ id: 2, name: 'Y9 Ch2', year: 9, chapter: 2, unitNumber: 1 }),
      makeUnit({ id: 3, name: 'Y10 Ch3', year: 10, chapter: 3, unitNumber: 1 }),
    ];
    const result = groupUnits(units);
    expect(result.yearGroups).toHaveLength(2);
    // Year 10 first (descending)
    expect(result.yearGroups[0].year).toBe(10);
    expect(result.yearGroups[0].chapters).toHaveLength(1);
    expect(result.yearGroups[0].chapters[0].chapter).toBe(3);
    // Year 9 second
    expect(result.yearGroups[1].year).toBe(9);
    expect(result.yearGroups[1].chapters).toHaveLength(2);
    expect(result.yearGroups[1].chapters[0].chapter).toBe(1);
    expect(result.yearGroups[1].chapters[1].chapter).toBe(2);
  });
});
