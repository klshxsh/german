import { describe, it, expect } from 'vitest';
import { getUnitStatus, parseUnitPath } from './contentStatus';
import type { ContentIndexUnit } from './contentStatus';
import type { Unit } from '../types';

// ── parseUnitPath ─────────────────────────────────────────────────────────────

describe('parseUnitPath', () => {
  it('parses a standard path correctly', () => {
    expect(parseUnitPath('y9/ch1/unit-2-in-meinem-leben.json')).toEqual({
      year: 9,
      chapter: 1,
      unitNumber: 2,
    });
  });

  it('parses year 10, chapter 3, unit 5', () => {
    expect(parseUnitPath('y10/ch3/unit-5-mein-leben.json')).toEqual({
      year: 10,
      chapter: 3,
      unitNumber: 5,
    });
  });

  it('parses multi-digit year and chapter', () => {
    expect(parseUnitPath('y12/ch10/unit-12-advanced-topic.json')).toEqual({
      year: 12,
      chapter: 10,
      unitNumber: 12,
    });
  });

  it('returns null for path missing y prefix', () => {
    expect(parseUnitPath('ch1/unit-2-something.json')).toBeNull();
  });

  it('returns null for path missing ch prefix', () => {
    expect(parseUnitPath('y9/chapter1/unit-2-something.json')).toBeNull();
  });

  it('returns null for path missing unit- prefix', () => {
    expect(parseUnitPath('y9/ch1/lesson-2-something.json')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseUnitPath('')).toBeNull();
  });

  it('handles Windows-style backslash paths', () => {
    expect(parseUnitPath('y9\\ch1\\unit-1-mein-vorbild.json')).toEqual({
      year: 9,
      chapter: 1,
      unitNumber: 1,
    });
  });
});

// ── getUnitStatus ─────────────────────────────────────────────────────────────

const makeRemote = (overrides: Partial<ContentIndexUnit> = {}): ContentIndexUnit => ({
  year: 9,
  chapter: 1,
  unitNumber: 1,
  name: 'Test Unit',
  description: 'A test unit',
  entryCount: 10,
  version: '1.0',
  exportedAt: '2026-03-15T12:00:00.000Z',
  path: 'y9/ch1/unit-1-test.json',
  ...overrides,
});

const makeLocal = (overrides: Partial<Unit> = {}): Unit => ({
  id: 1,
  name: 'Test Unit',
  description: 'A test unit',
  year: 9,
  chapter: 1,
  unitNumber: 1,
  importedAt: '2026-03-16T10:00:00.000Z',
  exportedAt: '2026-03-15T12:00:00.000Z',
  version: '1.0',
  ...overrides,
});

describe('getUnitStatus', () => {
  it('returns "available" when no local units exist', () => {
    expect(getUnitStatus(makeRemote(), [])).toBe('available');
  });

  it('returns "available" when no local unit matches year/chapter/unitNumber', () => {
    const local = makeLocal({ year: 9, chapter: 2, unitNumber: 1 });
    expect(getUnitStatus(makeRemote({ year: 9, chapter: 1, unitNumber: 1 }), [local])).toBe('available');
  });

  it('returns "imported" when local exportedAt equals remote exportedAt', () => {
    const remote = makeRemote({ exportedAt: '2026-03-15T12:00:00.000Z' });
    const local = makeLocal({ exportedAt: '2026-03-15T12:00:00.000Z' });
    expect(getUnitStatus(remote, [local])).toBe('imported');
  });

  it('returns "imported" when local exportedAt is newer than remote', () => {
    const remote = makeRemote({ exportedAt: '2026-03-10T00:00:00.000Z' });
    const local = makeLocal({ exportedAt: '2026-03-15T12:00:00.000Z' });
    expect(getUnitStatus(remote, [local])).toBe('imported');
  });

  it('returns "update-available" when remote exportedAt is newer than local', () => {
    const remote = makeRemote({ exportedAt: '2026-03-20T00:00:00.000Z' });
    const local = makeLocal({ exportedAt: '2026-03-15T12:00:00.000Z' });
    expect(getUnitStatus(remote, [local])).toBe('update-available');
  });

  it('returns "imported" when local exportedAt is empty (legacy unit) and remote is empty', () => {
    const remote = makeRemote({ exportedAt: '' });
    const local = makeLocal({ exportedAt: '' });
    expect(getUnitStatus(remote, [local])).toBe('imported');
  });

  it('returns "update-available" when local exportedAt is empty and remote has a timestamp', () => {
    const remote = makeRemote({ exportedAt: '2026-03-15T12:00:00.000Z' });
    const local = makeLocal({ exportedAt: '' });
    expect(getUnitStatus(remote, [local])).toBe('update-available');
  });

  it('matches by composite key year+chapter+unitNumber, not by name', () => {
    const remote = makeRemote({ year: 9, chapter: 4, unitNumber: 1, name: 'New Name' });
    const local = makeLocal({ year: 9, chapter: 4, unitNumber: 1, name: 'Old Name' });
    expect(getUnitStatus(remote, [local])).toBe('imported');
  });

  it('finds the correct unit among multiple local units', () => {
    const remote = makeRemote({ year: 9, chapter: 4, unitNumber: 2, exportedAt: '2026-03-20T00:00:00.000Z' });
    const locals = [
      makeLocal({ id: 1, year: 9, chapter: 1, unitNumber: 1, exportedAt: '2026-03-15T00:00:00.000Z' }),
      makeLocal({ id: 2, year: 9, chapter: 4, unitNumber: 1, exportedAt: '2026-03-15T00:00:00.000Z' }),
      makeLocal({ id: 3, year: 9, chapter: 4, unitNumber: 2, exportedAt: '2026-03-15T00:00:00.000Z' }),
    ];
    expect(getUnitStatus(remote, locals)).toBe('update-available');
  });

  // Index sort order tests
  it('sort: year ascending, then chapter, then unitNumber', () => {
    const units: ContentIndexUnit[] = [
      makeRemote({ year: 9, chapter: 4, unitNumber: 2, path: 'y9/ch4/unit-2.json' }),
      makeRemote({ year: 9, chapter: 1, unitNumber: 1, path: 'y9/ch1/unit-1.json' }),
      makeRemote({ year: 10, chapter: 1, unitNumber: 1, path: 'y10/ch1/unit-1.json' }),
      makeRemote({ year: 9, chapter: 1, unitNumber: 3, path: 'y9/ch1/unit-3.json' }),
    ];
    const sorted = [...units].sort(
      (a, b) => a.year - b.year || a.chapter - b.chapter || a.unitNumber - b.unitNumber
    );
    expect(sorted.map((u) => u.path)).toEqual([
      'y9/ch1/unit-1.json',
      'y9/ch1/unit-3.json',
      'y9/ch4/unit-2.json',
      'y10/ch1/unit-1.json',
    ]);
  });
});
