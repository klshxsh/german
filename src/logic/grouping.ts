import type { Unit } from '../types';

export const TERM_ORDER: Record<string, number> = {
  Autumn: 0,
  Spring: 1,
  Summer: 2,
};

export interface TermGroup {
  term: string;
  units: Unit[];
}

export interface YearGroup {
  year: number;
  terms: TermGroup[];
}

export interface GroupedUnits {
  yearGroups: YearGroup[];
  ungrouped: Unit[];
}

export function isUngrouped(unit: Unit): boolean {
  return unit.year === 0 || unit.term === 'Unknown' || !unit.term;
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

    // Group by term
    const byTerm = new Map<string, Unit[]>();
    for (const unit of yearUnits) {
      const list = byTerm.get(unit.term) ?? [];
      list.push(unit);
      byTerm.set(unit.term, list);
    }

    // Sort terms chronologically: Autumn → Spring → Summer
    const terms = [...byTerm.keys()].sort(
      (a, b) => (TERM_ORDER[a] ?? 99) - (TERM_ORDER[b] ?? 99)
    );

    const termGroups: TermGroup[] = terms.map((term) => ({
      term,
      units: (byTerm.get(term) ?? []).sort((a, b) => a.unitNumber - b.unitNumber),
    }));

    return { year, terms: termGroups };
  });

  return { yearGroups, ungrouped };
}
