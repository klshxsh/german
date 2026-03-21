import type { Unit } from '../types';

export interface ChapterGroup {
  chapter: number;
  units: Unit[];
}

export interface YearGroup {
  year: number;
  chapters: ChapterGroup[];
}

export interface GroupedUnits {
  yearGroups: YearGroup[];
  ungrouped: Unit[];
}

export function isUngrouped(unit: Unit): boolean {
  return unit.year === 0 || unit.chapter === 0;
}

export function groupUnits(units: Unit[]): GroupedUnits {
  const grouped: Unit[] = [];
  const ungrouped: Unit[] = [];

  for (const unit of units) {
    if (isUngrouped(unit)) {
      ungrouped.push(unit);
    } else {
      grouped.push(unit);
    }
  }

  // Group by year
  const byYear = new Map<number, Unit[]>();
  for (const unit of grouped) {
    const list = byYear.get(unit.year) ?? [];
    list.push(unit);
    byYear.set(unit.year, list);
  }

  // Sort years descending (most recent first)
  const years = [...byYear.keys()].sort((a, b) => b - a);

  const yearGroups: YearGroup[] = years.map((year) => {
    const yearUnits = byYear.get(year)!;

    // Group by chapter
    const byChapter = new Map<number, Unit[]>();
    for (const unit of yearUnits) {
      const list = byChapter.get(unit.chapter) ?? [];
      list.push(unit);
      byChapter.set(unit.chapter, list);
    }

    // Sort chapters numerically ascending
    const chapterNums = [...byChapter.keys()].sort((a, b) => a - b);

    const chapterGroups: ChapterGroup[] = chapterNums.map((chapter) => ({
      chapter,
      units: (byChapter.get(chapter) ?? []).sort((a, b) => a.unitNumber - b.unitNumber),
    }));

    return { year, chapters: chapterGroups };
  });

  return { yearGroups, ungrouped };
}
