export interface Unit {
  id?: number;
  name: string;
  description: string;
  year: number;       // school year, e.g. 9; 0 = ungrouped
  chapter: number;    // chapter number, e.g. 3; 0 = ungrouped
  unitNumber: number; // unit within the chapter; 0 = ungrouped
  importedAt: string; // ISO timestamp — when the user imported it
  exportedAt: string; // ISO timestamp — from the JSON file's exportedAt field
  version: string;
}

export interface Category {
  id?: number;
  unitId: number;
  sourceId: string;
  name: string;
  description: string;
  grammarNotes: string;
}

export interface Entry {
  id?: number;
  unitId: number;
  categoryId: number;
  sourceId: string;
  german: string;
  english: string;
  partOfSpeech: string;
  grammarNotes: string;
  tags: string[];
}

export interface VerbForm {
  id?: number;
  unitId: number;
  entryId: number;
  infinitive: string;
  present3rd: string;
  perfectAux: 'haben' | 'sein';
  pastParticiple: string;
}

export interface SentenceTemplate {
  id?: number;
  unitId: number;
  sourceId: string;
  pattern: string;
  slots: string[];
  description: string;
}

export interface GeneratedSentence {
  id?: number;
  unitId: number;
  templateId: number;
  german: string;
  english: string;
  complexity: 'simple' | 'compound' | 'complex';
  usedEntryIds: number[];
}

export interface FlashcardProgress {
  id?: number;
  entryId: number;
  unitId: number;
  correctCount: number;
  incorrectCount: number;
  streak: number;
  lastSeen: string;
  nextDue: string;
  bucket: number;
}

export interface SessionLog {
  id?: number;
  unitId: number;
  mode: 'flashcard' | 'sentence-builder' | 'cloze';
  startedAt: string;
  endedAt: string;
  totalQuestions: number;
  correctAnswers: number;
  entryIds: number[];
}

export interface AppSetting {
  id?: number;
  key: string;
  value: string;
}

export interface UserSettings {
  id: string;    // key name: "theme", "userName", "userAvatar", "soundEnabled"
  value: string; // JSON-encoded value
}
