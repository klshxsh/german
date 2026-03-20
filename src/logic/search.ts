import type { Entry, Category, Unit, VerbForm, GeneratedSentence } from '../types';

export interface EntrySearchResult {
  entry: Entry;
  category: Category;
  unit: Unit;
  matchedVerbForm?: VerbForm;
  matchedSentences: GeneratedSentence[];
}

export interface CategoryGroup {
  categoryId: number;
  category: Category;
  results: EntrySearchResult[];
}

export interface UnitGroup {
  unitId: number;
  unit: Unit;
  categories: CategoryGroup[];
}

export interface SearchOutput {
  groups: UnitGroup[];
  totalResults: number;
  unitCount: number;
}

function containsIgnoreCase(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase());
}

export function search(
  query: string,
  entries: Entry[],
  categories: Category[],
  units: Unit[],
  verbForms: VerbForm[],
  sentences: GeneratedSentence[],
): SearchOutput {
  const q = query.trim();
  if (!q) {
    return { groups: [], totalResults: 0, unitCount: 0 };
  }

  const categoryById = new Map(categories.map((c) => [c.id!, c]));
  const unitById = new Map(units.map((u) => [u.id!, u]));
  const entryById = new Map(entries.map((e) => [e.id!, e]));
  const sentenceById = new Map(sentences.map((s) => [s.id!, s]));

  // Collect matched entry IDs and which verb form / sentences matched
  const matchedEntryIds = new Set<number>();
  const matchingVerbFormByEntry = new Map<number, VerbForm>();
  const matchingSentenceIdsByEntry = new Map<number, Set<number>>();

  // Match entries directly
  for (const entry of entries) {
    if (containsIgnoreCase(entry.german, q) || containsIgnoreCase(entry.english, q)) {
      matchedEntryIds.add(entry.id!);
    }
  }

  // Match via verb forms
  for (const vf of verbForms) {
    if (
      containsIgnoreCase(vf.infinitive, q) ||
      containsIgnoreCase(vf.present3rd, q) ||
      containsIgnoreCase(vf.pastParticiple, q)
    ) {
      matchedEntryIds.add(vf.entryId);
      if (!matchingVerbFormByEntry.has(vf.entryId)) {
        matchingVerbFormByEntry.set(vf.entryId, vf);
      }
    }
  }

  // Match via generated sentences
  for (const s of sentences) {
    if (containsIgnoreCase(s.german, q) || containsIgnoreCase(s.english, q)) {
      for (const entryId of s.usedEntryIds) {
        matchedEntryIds.add(entryId);
        const ids = matchingSentenceIdsByEntry.get(entryId) ?? new Set<number>();
        ids.add(s.id!);
        matchingSentenceIdsByEntry.set(entryId, ids);
      }
    }
  }

  // Build result list
  const results: EntrySearchResult[] = [];
  for (const entryId of matchedEntryIds) {
    const entry = entryById.get(entryId);
    if (!entry) continue;
    const category = categoryById.get(entry.categoryId);
    const unit = unitById.get(entry.unitId);
    if (!category || !unit) continue;

    const matchedVerbForm = matchingVerbFormByEntry.get(entryId);
    const sentenceIds = matchingSentenceIdsByEntry.get(entryId);
    const matchedSentences = sentenceIds
      ? [...sentenceIds].map((id) => sentenceById.get(id)).filter(Boolean) as GeneratedSentence[]
      : [];

    results.push({ entry, category, unit, matchedVerbForm, matchedSentences });
  }

  // Group by unit, then by category
  const unitGroupMap = new Map<number, Map<number, EntrySearchResult[]>>();
  for (const result of results) {
    const uid = result.unit.id!;
    const cid = result.category.id!;
    if (!unitGroupMap.has(uid)) unitGroupMap.set(uid, new Map());
    const catMap = unitGroupMap.get(uid)!;
    if (!catMap.has(cid)) catMap.set(cid, []);
    catMap.get(cid)!.push(result);
  }

  const groups: UnitGroup[] = [];
  for (const [unitId, catMap] of unitGroupMap) {
    const unit = unitById.get(unitId)!;
    const cats: CategoryGroup[] = [];
    for (const [categoryId, catResults] of catMap) {
      const category = categoryById.get(categoryId)!;
      cats.push({ categoryId, category, results: catResults });
    }
    groups.push({ unitId, unit, categories: cats });
  }

  return { groups, totalResults: results.length, unitCount: groups.length };
}
