import type {
  Unit,
  Category,
  Entry,
  VerbForm,
  FlashcardProgress,
  SentenceTemplate,
  GeneratedSentence,
  SessionLog,
} from '../types';

export function makeUnit(overrides?: Partial<Unit>): Unit {
  return {
    name: 'Test Unit',
    description: 'A test unit for learning',
    year: 9,
    term: 'Spring',
    unitNumber: 1,
    importedAt: new Date().toISOString(),
    version: '1.0',
    ...overrides,
  };
}

export function makeCategory(overrides?: Partial<Category>): Category {
  return {
    unitId: 1,
    sourceId: 'cat_1',
    name: 'Test Category',
    description: 'A test category',
    grammarNotes: '',
    ...overrides,
  };
}

export function makeEntry(overrides?: Partial<Entry>): Entry {
  return {
    unitId: 1,
    categoryId: 1,
    sourceId: 'ent_1',
    german: 'spielen',
    english: 'to play',
    partOfSpeech: 'verb',
    grammarNotes: '',
    tags: [],
    ...overrides,
  };
}

export function makeVerbForm(overrides?: Partial<VerbForm>): VerbForm {
  return {
    unitId: 1,
    entryId: 1,
    infinitive: 'spielen',
    present3rd: 'spielt',
    perfectAux: 'haben',
    pastParticiple: 'gespielt',
    ...overrides,
  };
}

export function makeFlashcardProgress(overrides?: Partial<FlashcardProgress>): FlashcardProgress {
  return {
    entryId: 1,
    unitId: 1,
    correctCount: 0,
    incorrectCount: 0,
    streak: 0,
    lastSeen: new Date().toISOString(),
    nextDue: new Date().toISOString(),
    bucket: 0,
    ...overrides,
  };
}

export function makeSentenceTemplate(overrides?: Partial<SentenceTemplate>): SentenceTemplate {
  return {
    unitId: 1,
    sourceId: 'tpl_1',
    pattern: '{subject} {verb} {object}',
    slots: ['subject', 'verb', 'object'],
    description: 'A test sentence template',
    ...overrides,
  };
}

export function makeGeneratedSentence(overrides?: Partial<GeneratedSentence>): GeneratedSentence {
  return {
    unitId: 1,
    templateId: 1,
    german: 'Ich spiele Tennis.',
    english: 'I play tennis.',
    complexity: 'simple',
    usedEntryIds: [1],
    ...overrides,
  };
}

export function makeSessionLog(overrides?: Partial<SessionLog>): SessionLog {
  return {
    unitId: 1,
    mode: 'flashcard',
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    totalQuestions: 10,
    correctAnswers: 8,
    entryIds: [1, 2, 3],
    ...overrides,
  };
}
