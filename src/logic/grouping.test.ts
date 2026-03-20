import { describe, it, expect } from 'vitest';
import { groupUnits, isUngrouped, TERM_ORDER } from './grouping';
import { makeUnit } from '../test/factories';

describe('TERM_ORDER', () => {
  it('sorts Autumn before Spring before Summer', () => {
    expect(TERM_ORDER['Autumn']).toBeLessThan(TERM_ORDER['Spring']);
    expect(TERM_ORDER['Spring']).toBeLessThan(TERM_ORDER['Summer']);
  });
});

describe('isUngrouped', () => {
  it('returns false for a fully grouped unit', () => {
    expect(isUngrouped(makeUnit({ year: 9, term: 'Spring', unitNumber: 1 }))).toBe(false);
  });

  it('returns true when year is 0', () => {
    expect(isUngrouped(makeUnit({ year: 0, term: 'Spring', unitNumber: 1 }))).toBe(true);
  });

  it('returns true when term is Unknown', () => {
    expect(isUngrouped(makeUnit({ year: 9, term: 'Unknown', unitNumber: 1 }))).toBe(true);
  });

  it('returns true when term is empty string', () => {
    expect(isUngrouped(makeUnit({ year: 9, term: '', unitNumber: 1 }))).toBe(true);
  });
});

describe('groupUnits', () => {
  it('returns empty yearGroups and ungrouped when no units', () => {
    const result = groupUnits([]);
    expect(result.yearGroups).toHaveLength(0);
    expect(result.ungrouped).toHaveLength(0);
  });

  it('places ungrouped units (year=0) in ungrouped array', () => {
    const unit = makeUnit({ year: 0, term: 'Unknown', unitNumber: 0 });
    const result = groupUnits([unit]);
    expect(result.yearGroups).toHaveLength(0);
    expect(result.ungrouped).toHaveLength(1);
    expect(result.ungrouped[0]).toBe(unit);
  });

  it('groups units by year', () => {
    const units = [
      makeUnit({ id: 1, name: 'A', year: 9, term: 'Spring', unitNumber: 1 }),
      makeUnit({ id: 2, name: 'B', year: 10, term: 'Autumn', unitNumber: 1 }),
    ];
    const result = groupUnits(units);
    expect(result.yearGroups).toHaveLength(2);
    const years = result.yearGroups.map((g) => g.year);
    expect(years).toContain(9);
    expect(years).toContain(10);
  });

  it('sorts years descending (most recent first)', () => {
    const units = [
      makeUnit({ id: 1, name: 'A', year: 8, term: 'Spring', unitNumber: 1 }),
      makeUnit({ id: 2, name: 'B', year: 10, term: 'Autumn', unitNumber: 1 }),
      makeUnit({ id: 3, name: 'C', year: 9, term: 'Summer', unitNumber: 1 }),
    ];
    const result = groupUnits(units);
    const years = result.yearGroups.map((g) => g.year);
    expect(years).toEqual([10, 9, 8]);
  });

  it('sorts terms chronologically: Autumn → Spring → Summer', () => {
    const units = [
      makeUnit({ id: 1, name: 'S', year: 9, term: 'Summer', unitNumber: 1 }),
      makeUnit({ id: 2, name: 'A', year: 9, term: 'Autumn', unitNumber: 1 }),
      makeUnit({ id: 3, name: 'Sp', year: 9, term: 'Spring', unitNumber: 1 }),
    ];
    const result = groupUnits(units);
    expect(result.yearGroups).toHaveLength(1);
    const terms = result.yearGroups[0].terms.map((t) => t.term);
    expect(terms).toEqual(['Autumn', 'Spring', 'Summer']);
  });

  it('sorts units by unitNumber ascending within a term', () => {
    const units = [
      makeUnit({ id: 1, name: 'Unit 3', year: 9, term: 'Autumn', unitNumber: 3 }),
      makeUnit({ id: 2, name: 'Unit 1', year: 9, term: 'Autumn', unitNumber: 1 }),
      makeUnit({ id: 3, name: 'Unit 2', year: 9, term: 'Autumn', unitNumber: 2 }),
    ];
    const result = groupUnits(units);
    const termUnits = result.yearGroups[0].terms[0].units;
    expect(termUnits.map((u) => u.unitNumber)).toEqual([1, 2, 3]);
  });

  it('separates grouped and ungrouped units', () => {
    const units = [
      makeUnit({ id: 1, name: 'Grouped', year: 9, term: 'Spring', unitNumber: 1 }),
      makeUnit({ id: 2, name: 'Ungrouped', year: 0, term: 'Unknown', unitNumber: 0 }),
    ];
    const result = groupUnits(units);
    expect(result.yearGroups).toHaveLength(1);
    expect(result.yearGroups[0].terms[0].units[0].name).toBe('Grouped');
    expect(result.ungrouped).toHaveLength(1);
    expect(result.ungrouped[0].name).toBe('Ungrouped');
  });

  it('handles multiple years each with multiple terms', () => {
    const units = [
      makeUnit({ id: 1, name: 'Y9 Aut', year: 9, term: 'Autumn', unitNumber: 1 }),
      makeUnit({ id: 2, name: 'Y9 Spr', year: 9, term: 'Spring', unitNumber: 1 }),
      makeUnit({ id: 3, name: 'Y10 Sum', year: 10, term: 'Summer', unitNumber: 1 }),
    ];
    const result = groupUnits(units);
    expect(result.yearGroups).toHaveLength(2);
    // Year 10 first (descending)
    expect(result.yearGroups[0].year).toBe(10);
    expect(result.yearGroups[0].terms).toHaveLength(1);
    expect(result.yearGroups[0].terms[0].term).toBe('Summer');
    // Year 9 second
    expect(result.yearGroups[1].year).toBe(9);
    expect(result.yearGroups[1].terms).toHaveLength(2);
    expect(result.yearGroups[1].terms[0].term).toBe('Autumn');
    expect(result.yearGroups[1].terms[1].term).toBe('Spring');
  });
});
