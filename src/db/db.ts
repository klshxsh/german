import Dexie, { type Table } from 'dexie';
import type {
  Unit,
  Category,
  Entry,
  VerbForm,
  SentenceTemplate,
  GeneratedSentence,
  FlashcardProgress,
  SessionLog,
} from '../types';

export class DeutschDB extends Dexie {
  units!: Table<Unit>;
  categories!: Table<Category>;
  entries!: Table<Entry>;
  verbForms!: Table<VerbForm>;
  sentenceTemplates!: Table<SentenceTemplate>;
  generatedSentences!: Table<GeneratedSentence>;
  flashcardProgress!: Table<FlashcardProgress>;
  sessionLogs!: Table<SessionLog>;

  constructor() {
    super('DeutschLearner');
    this.version(1).stores({
      units: '++id, name',
      categories: '++id, unitId, sourceId',
      entries: '++id, unitId, categoryId, sourceId, partOfSpeech',
      verbForms: '++id, unitId, entryId',
      sentenceTemplates: '++id, unitId, sourceId',
      generatedSentences: '++id, unitId, templateId, complexity',
      flashcardProgress: '++id, entryId, unitId, nextDue, bucket',
      sessionLogs: '++id, unitId, mode, startedAt',
    });
  }
}

export const db = new DeutschDB();
