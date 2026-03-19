import { describe, it, expect } from 'vitest';
import { generateClozeQuestion } from './cloze';
import { isAcceptableAnswer, levenshtein } from './levenshtein';
import { makeEntry, makeGeneratedSentence } from '../test/factories';
import type { Entry } from '../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeVerb(overrides?: Partial<Entry>): Entry {
  return makeEntry({ partOfSpeech: 'verb', ...overrides });
}

function makeNoun(overrides?: Partial<Entry>): Entry {
  return makeEntry({ partOfSpeech: 'noun', ...overrides });
}

function fakeId(entry: Entry, id: number): Entry {
  return { ...entry, id };
}

// Base test data
const verbEntry = fakeId(makeVerb({ german: 'spiele', english: 'play', categoryId: 1 }), 1);
const nounEntry = fakeId(makeNoun({ german: 'Tennis', english: 'tennis', categoryId: 2 }), 2);
const verbDistractor1 = fakeId(makeVerb({ german: 'laufe', english: 'run', categoryId: 1 }), 3);
const verbDistractor2 = fakeId(makeVerb({ german: 'schwimme', english: 'swim', categoryId: 1 }), 4);
const nounDistractor1 = fakeId(makeNoun({ german: 'Fußball', english: 'football', categoryId: 2 }), 5);
const nounDistractor2 = fakeId(makeNoun({ german: 'Musik', english: 'music', categoryId: 2 }), 6);
const nounDistractor3 = fakeId(makeNoun({ german: 'Sport', english: 'sport', categoryId: 2 }), 7);

const allEntries = [verbEntry, nounEntry, verbDistractor1, verbDistractor2, nounDistractor1, nounDistractor2, nounDistractor3];

const testSentence = makeGeneratedSentence({
  german: 'Ich spiele Tennis.',
  english: 'I play tennis.',
  usedEntryIds: [1, 2],
});

// ── generateClozeQuestion ────────────────────────────────────────────────────

describe('generateClozeQuestion', () => {
  it('generates a question with one blank from a sentence', () => {
    const q = generateClozeQuestion(testSentence, [verbEntry, nounEntry], allEntries, 'mixed');
    expect(q).not.toBeNull();
    expect(q!.sentenceWithBlank).toContain('___');
    // The blank should replace exactly one word
    const blankCount = (q!.sentenceWithBlank.match(/___/g) ?? []).length;
    expect(blankCount).toBe(1);
  });

  it('blank position matches configured category — verbs', () => {
    // With blankType='verbs', only the verb entry should be blanked
    const results = Array.from({ length: 20 }, () =>
      generateClozeQuestion(testSentence, [verbEntry, nounEntry], allEntries, 'verbs')
    );
    const nonNull = results.filter(Boolean);
    expect(nonNull.length).toBeGreaterThan(0);
    // All results should have the verb blanked
    for (const q of nonNull) {
      expect(q!.correctAnswer).toBe('spiele');
      expect(q!.sentenceWithBlank).toBe('Ich ___ Tennis.');
    }
  });

  it('falls back to any used entry when no entry matches blankType', () => {
    // blankType='qualifiers' but sentence has no adjectives/adverbs → falls back
    const q = generateClozeQuestion(testSentence, [verbEntry, nounEntry], allEntries, 'qualifiers');
    expect(q).not.toBeNull();
    expect(q!.sentenceWithBlank).toContain('___');
  });

  it('multiple choice options include the correct answer', () => {
    const q = generateClozeQuestion(testSentence, [verbEntry, nounEntry], allEntries, 'mixed');
    expect(q).not.toBeNull();
    expect(q!.options).toContain(q!.correctAnswer);
  });

  it('multiple choice has exactly 4 options (correct + 3 distractors)', () => {
    // With enough distractors available we should get 4 options
    const q = generateClozeQuestion(testSentence, [verbEntry, nounEntry], allEntries, 'verbs');
    expect(q).not.toBeNull();
    expect(q!.options.length).toBe(4); // 1 correct + 3 distractors
  });

  it('returns fewer options when not enough distractors exist', () => {
    // Only verbEntry and verbDistractor1 in the pool → 1 distractor available
    const limitedEntries = [verbEntry, verbDistractor1];
    const q = generateClozeQuestion(testSentence, [verbEntry], limitedEntries, 'verbs');
    expect(q).not.toBeNull();
    // Should have 1 correct + 1 distractor = 2 options
    expect(q!.options.length).toBe(2);
  });

  it('correct answer is randomly positioned among options', () => {
    // Run many times and check that the correct answer appears at different positions
    const positions = new Set<number>();
    for (let i = 0; i < 50; i++) {
      const q = generateClozeQuestion(testSentence, [verbEntry, nounEntry], allEntries, 'verbs');
      if (q) {
        positions.add(q.options.indexOf(q.correctAnswer));
      }
    }
    // Across 50 runs, the correct answer should appear at more than one position
    expect(positions.size).toBeGreaterThan(1);
  });

  it('options contain no duplicates', () => {
    const q = generateClozeQuestion(testSentence, [verbEntry, nounEntry], allEntries, 'mixed');
    expect(q).not.toBeNull();
    const unique = new Set(q!.options);
    expect(unique.size).toBe(q!.options.length);
  });

  it('returns null when no used entries are provided', () => {
    const q = generateClozeQuestion(testSentence, [], allEntries, 'mixed');
    expect(q).toBeNull();
  });

  it('returns null when entry text does not appear in sentence', () => {
    const mismatchEntry = fakeId(makeVerb({ german: 'kochen', english: 'cook' }), 99);
    const q = generateClozeQuestion(testSentence, [mismatchEntry], allEntries, 'mixed');
    expect(q).toBeNull();
  });

  it('handles vocabulary blank type selecting nouns', () => {
    const results = Array.from({ length: 20 }, () =>
      generateClozeQuestion(testSentence, [verbEntry, nounEntry], allEntries, 'vocabulary')
    );
    const nonNull = results.filter(Boolean);
    expect(nonNull.length).toBeGreaterThan(0);
    for (const q of nonNull) {
      expect(q!.correctAnswer).toBe('Tennis');
    }
  });

  it('entryIds includes all sentence usedEntryIds', () => {
    const q = generateClozeQuestion(testSentence, [verbEntry, nounEntry], allEntries, 'mixed');
    expect(q).not.toBeNull();
    expect(q!.entryIds).toEqual(testSentence.usedEntryIds);
  });
});

// ── isAcceptableAnswer (levenshtein-based) ───────────────────────────────────

describe('isAcceptableAnswer — free-type mode', () => {
  it('accepts exact match (case insensitive)', () => {
    expect(isAcceptableAnswer('spiele', 'spiele')).toBe(true);
    expect(isAcceptableAnswer('SPIELE', 'spiele')).toBe(true);
    expect(isAcceptableAnswer('Tennis', 'tennis')).toBe(true);
  });

  it('accepts Levenshtein distance 1 (one char substitution)', () => {
    // "spelt" ≈ "spielt": distance 1 (insert 'i')
    expect(isAcceptableAnswer('spelt', 'spielt')).toBe(true);
  });

  it('accepts Levenshtein distance 1 (one char deletion)', () => {
    expect(isAcceptableAnswer('spile', 'spiele')).toBe(true);
  });

  it('accepts Levenshtein distance 1 (one char insertion)', () => {
    expect(isAcceptableAnswer('spielen', 'spiele')).toBe(true);
  });

  it('rejects Levenshtein distance 2+', () => {
    expect(isAcceptableAnswer('spin', 'spiele')).toBe(false);
    expect(isAcceptableAnswer('abc', 'spiele')).toBe(false);
  });

  it('handles umlauts: "uber" accepted for "über" (distance 1)', () => {
    // "uber" vs "über": one char substitution (u → ü)
    expect(isAcceptableAnswer('uber', 'über')).toBe(true);
  });

  it('trims whitespace before comparing', () => {
    expect(isAcceptableAnswer('  spiele  ', 'spiele')).toBe(true);
  });
});

// ── levenshtein distance ──────────────────────────────────────────────────────

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
  });

  it('returns string length for empty second string', () => {
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('returns string length for empty first string', () => {
    expect(levenshtein('', 'abc')).toBe(3);
  });

  it('returns 1 for single character substitution', () => {
    expect(levenshtein('cat', 'bat')).toBe(1);
  });

  it('returns 1 for single character insertion', () => {
    expect(levenshtein('cat', 'cats')).toBe(1);
  });

  it('returns 1 for single character deletion', () => {
    expect(levenshtein('cats', 'cat')).toBe(1);
  });

  it('calculates correctly for longer strings', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });
});
