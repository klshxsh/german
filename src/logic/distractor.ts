import type { Entry } from '../types';

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function getDistractors(
  usedEntries: Entry[],
  allEntries: Entry[],
  count: number
): Entry[] {
  const usedIds = new Set(usedEntries.map((e) => e.id));
  const usedCategoryIds = new Set(usedEntries.map((e) => e.categoryId));

  // Candidates that are not used
  const unused = allEntries.filter((e) => !usedIds.has(e.id));

  // Prefer same-category candidates
  const sameCat = unused.filter((e) => usedCategoryIds.has(e.categoryId));
  const otherCat = unused.filter((e) => !usedCategoryIds.has(e.categoryId));

  // Combine: same-category first, then others
  const candidates = [...shuffle(sameCat), ...shuffle(otherCat)];

  return candidates.slice(0, count);
}
