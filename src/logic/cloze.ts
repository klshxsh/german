import type { Entry, GeneratedSentence } from '../types';
import { getDistractors } from './distractor';

export type BlankType = 'vocabulary' | 'verbs' | 'qualifiers' | 'connectives' | 'mixed';

export interface ClozeQuestion {
  sentenceWithBlank: string;
  correctAnswer: string;
  englishHint: string;
  /** Shuffled options (correct + distractors) for multiple-choice mode */
  options: string[];
  entryId: number | null;
  entryIds: number[];
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function matchesBlankType(entry: Entry, blankType: BlankType): boolean {
  if (blankType === 'mixed') return true;
  if (blankType === 'verbs') return entry.partOfSpeech === 'verb';
  if (blankType === 'qualifiers') {
    return (
      ['adjective', 'adverb'].includes(entry.partOfSpeech) ||
      entry.tags.includes('qualifier') ||
      entry.tags.includes('adverb')
    );
  }
  if (blankType === 'connectives') {
    return (
      ['conjunction', 'preposition', 'connective'].includes(entry.partOfSpeech) ||
      entry.tags.includes('connective')
    );
  }
  if (blankType === 'vocabulary') {
    // Nouns, pronouns and other content words that aren't verbs/conjunctions/prepositions
    return (
      ['noun', 'pronoun'].includes(entry.partOfSpeech) ||
      (!['verb', 'conjunction', 'preposition', 'connective'].includes(entry.partOfSpeech) &&
        !entry.tags.includes('connective'))
    );
  }
  return false;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generate a cloze question from a generated sentence.
 * Returns null if no suitable entry could be blanked.
 */
export function generateClozeQuestion(
  sentence: GeneratedSentence,
  usedEntries: Entry[],
  allEntries: Entry[],
  blankType: BlankType
): ClozeQuestion | null {
  // Filter used entries by blankType
  let candidates = usedEntries.filter((e) => matchesBlankType(e, blankType));

  // Fall back to any used entry if no match for the specified type
  if (candidates.length === 0) candidates = [...usedEntries];
  if (candidates.length === 0) return null;

  // Pick a random candidate to blank
  const entry = candidates[Math.floor(Math.random() * candidates.length)];

  // Find entry's German text in the sentence using German-aware word boundaries
  const germanLetters = 'a-zA-ZäöüÄÖÜß';
  const pattern = new RegExp(
    `(?<![${germanLetters}])${escapeRegex(entry.german)}(?![${germanLetters}])`,
    'i'
  );

  if (!pattern.test(sentence.german)) return null;

  const sentenceWithBlank = sentence.german.replace(pattern, '___');

  // Generate distractors from the same category
  const distractorEntries = getDistractors([entry], allEntries, 3);
  const distractors = distractorEntries.map((e) => e.german);

  // Shuffle all options (correct + distractors)
  const options = shuffle([entry.german, ...distractors]);

  return {
    sentenceWithBlank,
    correctAnswer: entry.german,
    englishHint: sentence.english,
    options,
    entryId: entry.id ?? null,
    entryIds: sentence.usedEntryIds,
  };
}
