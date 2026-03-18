import { describe, it, expect } from 'vitest';
import { tokenise } from './tokeniser';
import type { Entry } from '../types';

function makeEntry(id: number, german: string, categoryId = 1): Entry {
  return {
    id,
    unitId: 1,
    categoryId,
    sourceId: `ent_${id}`,
    german,
    english: '',
    partOfSpeech: '',
    grammarNotes: '',
    tags: [],
  };
}

describe('tokenise', () => {
  it('splits a simple sentence into word tokens', () => {
    const entries: Entry[] = [];
    const tokens = tokenise('Ich spiele Tennis', entries);
    expect(tokens.map((t) => t.text)).toEqual(['Ich', 'spiele', 'Tennis']);
    expect(tokens.every((t) => t.entryId === null)).toBe(true);
  });

  it('maps tokens back to entry IDs where a match exists', () => {
    const entries = [makeEntry(1, 'Tennis'), makeEntry(2, 'spiele')];
    const tokens = tokenise('Ich spiele Tennis', entries);

    const spieleToken = tokens.find((t) => t.text === 'spiele');
    expect(spieleToken?.entryId).toBe(2);

    const tennisToken = tokens.find((t) => t.text === 'Tennis');
    expect(tennisToken?.entryId).toBe(1);

    const ichToken = tokens.find((t) => t.text === 'Ich');
    expect(ichToken?.entryId).toBe(null);
  });

  it('tokens with no matching entry get entryId: null', () => {
    const entries = [makeEntry(1, 'Tennis')];
    const tokens = tokenise('Ich spiele Tennis', entries);

    const ichToken = tokens.find((t) => t.text === 'Ich');
    expect(ichToken?.entryId).toBe(null);

    const spieleToken = tokens.find((t) => t.text === 'spiele');
    expect(spieleToken?.entryId).toBe(null);
  });

  it('keeps multi-word entries together ("sehr gern" → single token)', () => {
    const entries = [makeEntry(1, 'sehr gern')];
    const tokens = tokenise('Ich spiele sehr gern Tennis', entries);

    const multiToken = tokens.find((t) => t.entryId === 1);
    expect(multiToken).toBeDefined();
    expect(multiToken?.text).toBe('sehr gern');

    // Should not produce separate 'sehr' and 'gern' tokens
    expect(tokens.find((t) => t.text === 'sehr')).toBeUndefined();
    expect(tokens.find((t) => t.text === 'gern')).toBeUndefined();
  });

  it('keeps multi-word entries together ("ein bisschen" → single token)', () => {
    const entries = [makeEntry(1, 'ein bisschen')];
    const tokens = tokenise('Ich spiele ein bisschen Tennis', entries);

    const multiToken = tokens.find((t) => t.entryId === 1);
    expect(multiToken).toBeDefined();
    expect(multiToken?.text).toBe('ein bisschen');
  });

  it('handles punctuation attached to words ("Tennis," → "Tennis" + ",")', () => {
    const entries = [makeEntry(1, 'Tennis')];
    const tokens = tokenise('Ich spiele Tennis,', entries);

    const texts = tokens.map((t) => t.text);
    expect(texts).toContain('Tennis');
    expect(texts).toContain(',');

    const tennisToken = tokens.find((t) => t.text === 'Tennis');
    expect(tennisToken?.entryId).toBe(1);

    const commaToken = tokens.find((t) => t.text === ',');
    expect(commaToken?.entryId).toBe(null);
  });

  it('handles German special characters (ü, ö, ä, ß)', () => {
    const entries = [makeEntry(1, 'Fußball'), makeEntry(2, 'schön')];
    const tokens = tokenise('Ich spiele Fußball. Das ist schön.', entries);

    const fussToken = tokens.find((t) => t.text === 'Fußball');
    expect(fussToken?.entryId).toBe(1);

    const schoenToken = tokens.find((t) => t.text === 'schön');
    expect(schoenToken?.entryId).toBe(2);
  });

  it('does case-insensitive matching', () => {
    const entries = [makeEntry(1, 'tennis')];
    const tokens = tokenise('Ich spiele Tennis', entries);

    const tennisToken = tokens.find((t) => t.text.toLowerCase() === 'tennis');
    expect(tennisToken?.entryId).toBe(1);
  });

  it('prefers longer (multi-word) matches over shorter ones', () => {
    const entries = [makeEntry(1, 'sehr gern'), makeEntry(2, 'sehr')];
    const tokens = tokenise('Ich spiele sehr gern', entries);

    // Should match "sehr gern" as one token (entryId 1), not "sehr" separately
    const multiToken = tokens.find((t) => t.entryId === 1);
    expect(multiToken).toBeDefined();
    expect(multiToken?.text).toBe('sehr gern');
  });
});
