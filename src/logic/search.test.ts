import { describe, it, expect } from 'vitest';
import { search } from './search';
import { makeEntry, makeCategory, makeUnit, makeVerbForm, makeGeneratedSentence } from '../test/factories';
import type { Entry, Category, Unit, VerbForm, GeneratedSentence } from '../types';

const unit1: Unit = makeUnit({ id: 1, name: 'Unit 1', year: 9, term: 'Spring', unitNumber: 1 });
const cat1: Category = makeCategory({ id: 1, unitId: 1, name: 'Verbs', sourceId: 'cat_1' });
const entry1: Entry = makeEntry({ id: 1, unitId: 1, categoryId: 1, german: 'spielen', english: 'to play', sourceId: 'ent_1' });

describe('search', () => {
  it('returns empty results for empty query', () => {
    const result = search('', [entry1], [cat1], [unit1], [], []);
    expect(result.totalResults).toBe(0);
    expect(result.groups).toHaveLength(0);
    expect(result.unitCount).toBe(0);
  });

  it('returns empty results for whitespace-only query', () => {
    const result = search('   ', [entry1], [cat1], [unit1], [], []);
    expect(result.totalResults).toBe(0);
  });

  it('matches German field exactly', () => {
    const result = search('spielen', [entry1], [cat1], [unit1], [], []);
    expect(result.totalResults).toBe(1);
    expect(result.groups[0].categories[0].results[0].entry.german).toBe('spielen');
  });

  it('matches English field', () => {
    const result = search('to play', [entry1], [cat1], [unit1], [], []);
    expect(result.totalResults).toBe(1);
  });

  it('is case-insensitive for German', () => {
    const result = search('SPIELEN', [entry1], [cat1], [unit1], [], []);
    expect(result.totalResults).toBe(1);
  });

  it('is case-insensitive for English', () => {
    const result = search('TO PLAY', [entry1], [cat1], [unit1], [], []);
    expect(result.totalResults).toBe(1);
  });

  it('matches substrings (not just prefix)', () => {
    const result = search('piel', [entry1], [cat1], [unit1], [], []);
    expect(result.totalResults).toBe(1);
  });

  it('returns no results for non-matching query', () => {
    const result = search('banana', [entry1], [cat1], [unit1], [], []);
    expect(result.totalResults).toBe(0);
    expect(result.groups).toHaveLength(0);
  });

  it('matches present3rd in verb forms', () => {
    const vf: VerbForm = makeVerbForm({ id: 1, entryId: 1, infinitive: 'spielen', present3rd: 'spielt', pastParticiple: 'gespielt' });
    const result = search('spielt', [entry1], [cat1], [unit1], [vf], []);
    expect(result.totalResults).toBe(1);
    expect(result.groups[0].categories[0].results[0].matchedVerbForm).toBeDefined();
    expect(result.groups[0].categories[0].results[0].matchedVerbForm?.present3rd).toBe('spielt');
  });

  it('matches past participle in verb forms', () => {
    const vf: VerbForm = makeVerbForm({ id: 1, entryId: 1, infinitive: 'spielen', present3rd: 'spielt', pastParticiple: 'gespielt' });
    const result = search('gespielt', [entry1], [cat1], [unit1], [vf], []);
    expect(result.totalResults).toBe(1);
    expect(result.groups[0].categories[0].results[0].matchedVerbForm?.pastParticiple).toBe('gespielt');
  });

  it('matches infinitive in verb forms', () => {
    const entry2: Entry = makeEntry({ id: 2, unitId: 1, categoryId: 1, german: 'Tennis spielen', english: 'to play tennis', sourceId: 'ent_2' });
    const vf: VerbForm = makeVerbForm({ id: 1, entryId: 2, infinitive: 'fahren', present3rd: 'fährt', pastParticiple: 'gefahren' });
    const result = search('fahren', [entry2], [cat1], [unit1], [vf], []);
    expect(result.totalResults).toBe(1);
    expect(result.groups[0].categories[0].results[0].matchedVerbForm?.infinitive).toBe('fahren');
  });

  it('matches generated sentence German field', () => {
    const sentence: GeneratedSentence = makeGeneratedSentence({
      id: 1, unitId: 1, german: 'Ich spiele Fußball.', english: 'I play football.', usedEntryIds: [1],
    });
    const result = search('Fußball', [entry1], [cat1], [unit1], [], [sentence]);
    expect(result.totalResults).toBe(1);
    expect(result.groups[0].categories[0].results[0].matchedSentences).toHaveLength(1);
    expect(result.groups[0].categories[0].results[0].matchedSentences[0].german).toBe('Ich spiele Fußball.');
  });

  it('matches generated sentence English field', () => {
    const sentence: GeneratedSentence = makeGeneratedSentence({
      id: 1, unitId: 1, german: 'Ich spiele Fußball.', english: 'I play football.', usedEntryIds: [1],
    });
    const result = search('football', [entry1], [cat1], [unit1], [], [sentence]);
    expect(result.totalResults).toBe(1);
    expect(result.groups[0].categories[0].results[0].matchedSentences).toHaveLength(1);
  });

  it('handles German special characters (ü, ö, ä, ß)', () => {
    const entry: Entry = makeEntry({ id: 2, unitId: 1, categoryId: 1, german: 'über', english: 'about/over', sourceId: 'ent_2' });
    const result = search('über', [entry], [cat1], [unit1], [], []);
    expect(result.totalResults).toBe(1);
  });

  it('handles ß in search query', () => {
    const entry: Entry = makeEntry({ id: 2, unitId: 1, categoryId: 1, german: 'Fußball', english: 'football', sourceId: 'ent_2' });
    const result = search('fußball', [entry], [cat1], [unit1], [], []);
    expect(result.totalResults).toBe(1);
  });

  it('groups results by unit correctly', () => {
    const unit2: Unit = makeUnit({ id: 2, name: 'Unit 2', year: 9, term: 'Autumn', unitNumber: 2 });
    const cat2: Category = makeCategory({ id: 2, unitId: 2, name: 'Nouns', sourceId: 'cat_2' });
    const entry2: Entry = makeEntry({ id: 2, unitId: 2, categoryId: 2, german: 'spielen', english: 'to play', sourceId: 'ent_2' });

    const result = search('spielen', [entry1, entry2], [cat1, cat2], [unit1, unit2], [], []);
    expect(result.totalResults).toBe(2);
    expect(result.unitCount).toBe(2);
    expect(result.groups).toHaveLength(2);
  });

  it('groups results by category within a unit', () => {
    const cat2: Category = makeCategory({ id: 2, unitId: 1, name: 'Nouns', sourceId: 'cat_2' });
    const entry2: Entry = makeEntry({ id: 2, unitId: 1, categoryId: 2, german: 'spielen', english: 'to play', sourceId: 'ent_2' });

    const result = search('spielen', [entry1, entry2], [cat1, cat2], [unit1], [], []);
    expect(result.totalResults).toBe(2);
    expect(result.unitCount).toBe(1);
    expect(result.groups[0].categories).toHaveLength(2);
  });

  it('deduplicates entries matched via multiple routes', () => {
    // Entry matched both in German field and via verb form
    const vf: VerbForm = makeVerbForm({ id: 1, entryId: 1, infinitive: 'spielen', present3rd: 'spielt', pastParticiple: 'gespielt' });
    const result = search('spielen', [entry1], [cat1], [unit1], [vf], []);
    expect(result.totalResults).toBe(1);
  });

  it('reports correct totalResults and unitCount across multiple units', () => {
    const unit2: Unit = makeUnit({ id: 2, name: 'Unit 2', year: 10, term: 'Spring', unitNumber: 1 });
    const cat2: Category = makeCategory({ id: 2, unitId: 2, name: 'Cat 2', sourceId: 'cat_2' });
    const entries: Entry[] = [
      makeEntry({ id: 1, unitId: 1, categoryId: 1, german: 'laufen', english: 'to run', sourceId: 'e1' }),
      makeEntry({ id: 2, unitId: 2, categoryId: 2, german: 'laufen', english: 'to run', sourceId: 'e2' }),
      makeEntry({ id: 3, unitId: 1, categoryId: 1, german: 'laufen gehen', english: 'to go running', sourceId: 'e3' }),
    ];
    const result = search('laufen', entries, [cat1, cat2], [unit1, unit2], [], []);
    expect(result.totalResults).toBe(3);
    expect(result.unitCount).toBe(2);
  });

  it('returns no matchedVerbForm when match is only in entry fields', () => {
    const vf: VerbForm = makeVerbForm({ id: 1, entryId: 1, infinitive: 'spielen', present3rd: 'spielt', pastParticiple: 'gespielt' });
    const result = search('to play', [entry1], [cat1], [unit1], [vf], []);
    expect(result.totalResults).toBe(1);
    expect(result.groups[0].categories[0].results[0].matchedVerbForm).toBeUndefined();
  });

  it('returns empty matchedSentences when no sentences match', () => {
    const sentence: GeneratedSentence = makeGeneratedSentence({
      id: 1, unitId: 1, german: 'Ich esse Pizza.', english: 'I eat pizza.', usedEntryIds: [1],
    });
    // Search for "spielen" — matches entry but not the sentence
    const result = search('spielen', [entry1], [cat1], [unit1], [], [sentence]);
    expect(result.totalResults).toBe(1);
    expect(result.groups[0].categories[0].results[0].matchedSentences).toHaveLength(0);
  });

  it('partial match on English also returns result', () => {
    const result = search('play', [entry1], [cat1], [unit1], [], []);
    expect(result.totalResults).toBe(1);
  });
});
