import { db } from './db';
import type {
  Unit,
  Category,
  Entry,
  VerbForm,
  SentenceTemplate,
  GeneratedSentence,
  FlashcardProgress,
} from '../types';

// Raw JSON shapes (before ID remapping)
interface RawUnit {
  name: string;
  description: string;
}

interface RawCategory {
  id: string;
  name: string;
  description?: string;
  grammarNotes?: string;
}

interface RawEntry {
  id: string;
  categoryId: string;
  german: string;
  english: string;
  partOfSpeech?: string;
  grammarNotes?: string;
  tags?: string[];
}

interface RawVerbForm {
  id?: string;
  entryId: string;
  infinitive: string;
  present3rd: string;
  perfectAux: 'haben' | 'sein';
  pastParticiple: string;
}

interface RawSentenceTemplate {
  id: string;
  pattern: string;
  slots?: string[];
  description?: string;
}

interface RawGeneratedSentence {
  id?: string;
  templateId: string;
  german: string;
  english: string;
  complexity?: 'simple' | 'compound' | 'complex';
  usedEntryIds?: string[];
}

export interface ImportJson {
  unit: RawUnit;
  categories: RawCategory[];
  entries: RawEntry[];
  verbForms?: RawVerbForm[];
  sentenceTemplates?: RawSentenceTemplate[];
  generatedSentences?: RawGeneratedSentence[];
  version?: string;
  exportedAt?: string;
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

export class DuplicateUnitError extends Error {
  existingId: number;
  constructor(message: string, existingId: number) {
    super(message);
    this.name = 'DuplicateUnitError';
    this.existingId = existingId;
  }
}

export function validateImportJson(data: unknown): ImportJson {
  if (typeof data !== 'object' || data === null) {
    throw new ImportError('Invalid JSON: must be an object');
  }

  const obj = data as Record<string, unknown>;

  if (!obj.unit || typeof obj.unit !== 'object') {
    throw new ImportError('Invalid JSON: missing required "unit" field');
  }

  const unit = obj.unit as Record<string, unknown>;
  if (typeof unit.name !== 'string' || !unit.name.trim()) {
    throw new ImportError('Invalid JSON: unit.name must be a non-empty string');
  }

  if (!Array.isArray(obj.categories) || obj.categories.length === 0) {
    throw new ImportError('Invalid JSON: missing or empty "categories" array');
  }

  if (!Array.isArray(obj.entries) || obj.entries.length === 0) {
    throw new ImportError('Invalid JSON: missing or empty "entries" array');
  }

  // Validate each category has an id and name
  for (const cat of obj.categories) {
    if (typeof cat !== 'object' || cat === null) {
      throw new ImportError('Invalid JSON: each category must be an object');
    }
    const c = cat as Record<string, unknown>;
    if (typeof c.id !== 'string') {
      throw new ImportError('Invalid JSON: each category must have a string id');
    }
    if (typeof c.name !== 'string') {
      throw new ImportError('Invalid JSON: each category must have a string name');
    }
  }

  // Validate each entry has required fields
  for (const entry of obj.entries) {
    if (typeof entry !== 'object' || entry === null) {
      throw new ImportError('Invalid JSON: each entry must be an object');
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string') {
      throw new ImportError('Invalid JSON: each entry must have a string id');
    }
    if (typeof e.categoryId !== 'string') {
      throw new ImportError('Invalid JSON: each entry must have a string categoryId');
    }
    if (typeof e.german !== 'string') {
      throw new ImportError('Invalid JSON: each entry must have a string german field');
    }
    if (typeof e.english !== 'string') {
      throw new ImportError('Invalid JSON: each entry must have a string english field');
    }
  }

  return obj as unknown as ImportJson;
}

export async function checkDuplicate(name: string): Promise<number | null> {
  const existing = await db.units.where('name').equals(name).first();
  return existing?.id ?? null;
}

export async function deleteUnit(unitId: number): Promise<void> {
  // Get all entry IDs for this unit
  const entryIds = (await db.entries.where('unitId').equals(unitId).toArray()).map((e) => e.id!);

  await db.transaction(
    'rw',
    [
      db.units,
      db.categories,
      db.entries,
      db.verbForms,
      db.sentenceTemplates,
      db.generatedSentences,
      db.flashcardProgress,
    ],
    async () => {
      await db.flashcardProgress.where('unitId').equals(unitId).delete();
      await db.generatedSentences.where('unitId').equals(unitId).delete();
      await db.sentenceTemplates.where('unitId').equals(unitId).delete();
      await db.verbForms.where('unitId').equals(unitId).delete();
      await db.entries.where('unitId').equals(unitId).delete();
      await db.categories.where('unitId').equals(unitId).delete();
      await db.units.delete(unitId);

      // entryIds used above for reference, but we use unitId-based deletes for all tables
      void entryIds; // suppress unused warning
    }
  );
}

export interface ImportOptions {
  mode?: 'skip' | 'replace';
}

export async function importUnit(
  data: ImportJson,
  options: ImportOptions = {}
): Promise<number> {
  const { mode = 'skip' } = options;

  const now = new Date().toISOString();
  const unitName = data.unit.name.trim();

  // Check for duplicate
  const existingId = await checkDuplicate(unitName);
  if (existingId !== null) {
    if (mode === 'skip') {
      throw new DuplicateUnitError(
        `A unit named "${unitName}" already exists`,
        existingId
      );
    } else if (mode === 'replace') {
      await deleteUnit(existingId);
    }
  }

  // Build the unit record
  const unitRecord: Unit = {
    name: unitName,
    description: data.unit.description ?? '',
    importedAt: now,
    version: data.version ?? '1.0',
  };

  // Maps from source IDs to Dexie IDs
  const categoryIdMap = new Map<string, number>();
  const entryIdMap = new Map<string, number>();
  const templateIdMap = new Map<string, number>();

  let newUnitId!: number;

  await db.transaction(
    'rw',
    [
      db.units,
      db.categories,
      db.entries,
      db.verbForms,
      db.sentenceTemplates,
      db.generatedSentences,
      db.flashcardProgress,
    ],
    async () => {
      // Insert unit
      newUnitId = await db.units.add(unitRecord);

      // Insert categories
      for (const rawCat of data.categories) {
        const cat: Category = {
          unitId: newUnitId,
          sourceId: rawCat.id,
          name: rawCat.name,
          description: rawCat.description ?? '',
          grammarNotes: rawCat.grammarNotes ?? '',
        };
        const catId = await db.categories.add(cat);
        categoryIdMap.set(rawCat.id, catId);
      }

      // Insert entries
      for (const rawEntry of data.entries) {
        const catDexieId = categoryIdMap.get(rawEntry.categoryId);
        if (catDexieId === undefined) {
          throw new ImportError(
            `Entry "${rawEntry.id}" references unknown category "${rawEntry.categoryId}"`
          );
        }
        const entry: Entry = {
          unitId: newUnitId,
          categoryId: catDexieId,
          sourceId: rawEntry.id,
          german: rawEntry.german,
          english: rawEntry.english,
          partOfSpeech: rawEntry.partOfSpeech ?? '',
          grammarNotes: rawEntry.grammarNotes ?? '',
          tags: rawEntry.tags ?? [],
        };
        const entryId = await db.entries.add(entry);
        entryIdMap.set(rawEntry.id, entryId);
      }

      // Insert verb forms
      for (const rawVf of data.verbForms ?? []) {
        const entryDexieId = entryIdMap.get(rawVf.entryId);
        if (entryDexieId === undefined) {
          // Skip verb forms referencing unknown entries
          continue;
        }
        const vf: VerbForm = {
          unitId: newUnitId,
          entryId: entryDexieId,
          infinitive: rawVf.infinitive,
          present3rd: rawVf.present3rd,
          perfectAux: rawVf.perfectAux,
          pastParticiple: rawVf.pastParticiple,
        };
        await db.verbForms.add(vf);
      }

      // Insert sentence templates
      for (const rawTpl of data.sentenceTemplates ?? []) {
        const tpl: SentenceTemplate = {
          unitId: newUnitId,
          sourceId: rawTpl.id,
          pattern: rawTpl.pattern,
          slots: rawTpl.slots ?? [],
          description: rawTpl.description ?? '',
        };
        const tplId = await db.sentenceTemplates.add(tpl);
        templateIdMap.set(rawTpl.id, tplId);
      }

      // Insert generated sentences
      for (const rawSen of data.generatedSentences ?? []) {
        const tplDexieId = templateIdMap.get(rawSen.templateId);
        if (tplDexieId === undefined) {
          // Skip sentences referencing unknown templates
          continue;
        }
        const usedEntryIds = (rawSen.usedEntryIds ?? [])
          .map((sourceId) => entryIdMap.get(sourceId))
          .filter((id): id is number => id !== undefined);

        const sen: GeneratedSentence = {
          unitId: newUnitId,
          templateId: tplDexieId,
          german: rawSen.german,
          english: rawSen.english,
          complexity: rawSen.complexity ?? 'simple',
          usedEntryIds,
        };
        await db.generatedSentences.add(sen);
      }

      // Initialise FlashcardProgress for all entries
      const progressRecords: FlashcardProgress[] = [];
      for (const [, dexieId] of entryIdMap) {
        progressRecords.push({
          entryId: dexieId,
          unitId: newUnitId,
          correctCount: 0,
          incorrectCount: 0,
          streak: 0,
          lastSeen: now,
          nextDue: now,
          bucket: 0,
        });
      }
      await db.flashcardProgress.bulkAdd(progressRecords);
    }
  );

  return newUnitId;
}
