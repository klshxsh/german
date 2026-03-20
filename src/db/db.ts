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
  AppSetting,
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
  appSettings!: Table<AppSetting>;

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
    this.version(2)
      .stores({
        units: '++id, name, [year+term+unitNumber]',
        categories: '++id, unitId, sourceId',
        entries: '++id, unitId, categoryId, sourceId, partOfSpeech',
        verbForms: '++id, unitId, entryId',
        sentenceTemplates: '++id, unitId, sourceId',
        generatedSentences: '++id, unitId, templateId, complexity',
        flashcardProgress: '++id, entryId, unitId, nextDue, bucket',
        sessionLogs: '++id, unitId, mode, startedAt',
      })
      .upgrade((tx) => {
        return tx
          .table('units')
          .toCollection()
          .modify((unit: Record<string, unknown>) => {
            if (unit.year === undefined) unit.year = 0;
            if (unit.term === undefined) unit.term = 'Unknown';
            if (unit.unitNumber === undefined) unit.unitNumber = 0;
          });
      });
    this.version(3).stores({
      units: '++id, name, [year+term+unitNumber]',
      categories: '++id, unitId, sourceId',
      entries: '++id, unitId, categoryId, sourceId, partOfSpeech',
      verbForms: '++id, unitId, entryId',
      sentenceTemplates: '++id, unitId, sourceId',
      generatedSentences: '++id, unitId, templateId, complexity',
      flashcardProgress: '++id, entryId, unitId, nextDue, bucket',
      sessionLogs: '++id, unitId, mode, startedAt',
      appSettings: '++id, &key',
    });
  }
}

export const db = new DeutschDB();
