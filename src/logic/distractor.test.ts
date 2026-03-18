import { describe, it, expect } from 'vitest';
import { getDistractors } from './distractor';
import type { Entry } from '../types';

function makeEntry(id: number, german: string, categoryId: number, partOfSpeech = 'noun'): Entry {
  return {
    id,
    unitId: 1,
    categoryId,
    sourceId: `ent_${id}`,
    german,
    english: '',
    partOfSpeech,
    grammarNotes: '',
    tags: [],
  };
}

describe('getDistractors', () => {
  it('generates N distractors from the same category as usedEntries', () => {
    const usedEntries = [makeEntry(1, 'Tennis', 1)];
    const allEntries = [
      makeEntry(1, 'Tennis', 1),
      makeEntry(2, 'Fußball', 1),
      makeEntry(3, 'Basketball', 1),
      makeEntry(4, 'sehr', 2),
    ];

    const distractors = getDistractors(usedEntries, allEntries, 2);
    expect(distractors).toHaveLength(2);
    // Should prefer same-category (cat 1) distractors
    expect(distractors.every((d) => d.categoryId === 1)).toBe(true);
  });

  it('distractors never include the correct answer', () => {
    const usedEntries = [makeEntry(1, 'Tennis', 1)];
    const allEntries = [
      makeEntry(1, 'Tennis', 1),
      makeEntry(2, 'Fußball', 1),
      makeEntry(3, 'Basketball', 1),
    ];

    const distractors = getDistractors(usedEntries, allEntries, 2);
    expect(distractors.find((d) => d.id === 1)).toBeUndefined();
  });

  it('distractors are unique (no duplicates)', () => {
    const usedEntries = [makeEntry(1, 'Tennis', 1)];
    const allEntries = [
      makeEntry(1, 'Tennis', 1),
      makeEntry(2, 'Fußball', 1),
      makeEntry(3, 'Basketball', 1),
      makeEntry(4, 'Volleyball', 1),
    ];

    const distractors = getDistractors(usedEntries, allEntries, 3);
    const ids = distractors.map((d) => d.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('returns fewer distractors if category has insufficient entries', () => {
    const usedEntries = [makeEntry(1, 'Tennis', 1)];
    const allEntries = [
      makeEntry(1, 'Tennis', 1),
      makeEntry(2, 'Fußball', 1),
      // Only 1 other entry in the same category
    ];

    const distractors = getDistractors(usedEntries, allEntries, 5);
    expect(distractors.length).toBeLessThan(5);
    expect(distractors.length).toBe(1);
  });

  it('distractors for verbs come from verb entries, not adjectives (same category preference)', () => {
    const usedEntries = [makeEntry(1, 'spielen', 1, 'verb')];
    const allEntries = [
      makeEntry(1, 'spielen', 1, 'verb'),
      makeEntry(2, 'laufen', 1, 'verb'),
      makeEntry(3, 'rennen', 1, 'verb'),
      makeEntry(4, 'schön', 2, 'adjective'),
      makeEntry(5, 'groß', 2, 'adjective'),
    ];

    const distractors = getDistractors(usedEntries, allEntries, 2);
    expect(distractors).toHaveLength(2);
    // Should prefer same category (verbs, cat 1)
    expect(distractors.every((d) => d.categoryId === 1)).toBe(true);
  });

  it('falls back to any unused entry when same-category pool is exhausted', () => {
    const usedEntries = [makeEntry(1, 'Tennis', 1), makeEntry(2, 'Fußball', 1)];
    const allEntries = [
      makeEntry(1, 'Tennis', 1),
      makeEntry(2, 'Fußball', 1),
      // No more same-category entries; fall back to other category
      makeEntry(3, 'schön', 2),
      makeEntry(4, 'groß', 2),
    ];

    const distractors = getDistractors(usedEntries, allEntries, 2);
    expect(distractors).toHaveLength(2);
    expect(distractors.every((d) => d.categoryId === 2)).toBe(true);
  });
});
