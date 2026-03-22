import type { Unit } from '../types';

export interface ContentIndexUnit {
  year: number;
  chapter: number;
  unitNumber: number;
  name: string;
  description: string;
  entryCount: number;
  version: string;
  exportedAt: string;
  path: string;
}

export interface ContentIndex {
  generatedAt: string;
  units: ContentIndexUnit[];
}

export type UnitStatus = 'available' | 'imported' | 'update-available';

/** Determine the status of a remote unit relative to locally imported units. */
export function getUnitStatus(remote: ContentIndexUnit, localUnits: Unit[]): UnitStatus {
  const local = localUnits.find(
    (u) => u.year === remote.year && u.chapter === remote.chapter && u.unitNumber === remote.unitNumber
  );
  if (!local) return 'available';
  if (local.exportedAt >= remote.exportedAt) return 'imported';
  return 'update-available';
}

/** Regex to extract year, chapter, unitNumber from a relative path like y9/ch1/unit-2-slug.json */
export const UNIT_PATH_RE = /y(\d+)\/ch(\d+)\/unit-(\d+)-/;

/** Parse path components from a relative unit file path. Returns null if malformed. */
export function parseUnitPath(relPath: string): { year: number; chapter: number; unitNumber: number } | null {
  const match = relPath.replace(/\\/g, '/').match(UNIT_PATH_RE);
  if (!match) return null;
  return {
    year: parseInt(match[1], 10),
    chapter: parseInt(match[2], 10),
    unitNumber: parseInt(match[3], 10),
  };
}
