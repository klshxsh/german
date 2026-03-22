import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { importUnit, validateImportJson, deleteUnit } from '../db/import';
import { getUnitStatus } from '../logic/contentStatus';
import type { ContentIndex, ContentIndexUnit } from '../logic/contentStatus';
import { CONTENT_BASE_URL } from '../config';

type CardImportState = { loading: boolean; error: string | null };

/** Groups remote index units by year → chapter */
function groupUnits(units: ContentIndexUnit[]): Map<number, Map<number, ContentIndexUnit[]>> {
  const byYear = new Map<number, Map<number, ContentIndexUnit[]>>();
  for (const unit of units) {
    if (!byYear.has(unit.year)) byYear.set(unit.year, new Map());
    const byChapter = byYear.get(unit.year)!;
    if (!byChapter.has(unit.chapter)) byChapter.set(unit.chapter, []);
    byChapter.get(unit.chapter)!.push(unit);
  }
  return byYear;
}

export function BrowseTab() {
  const [index, setIndex] = useState<ContentIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<'offline' | 'fetch' | null>(null);
  const [cardStates, setCardStates] = useState<Record<string, CardImportState>>({});

  const localUnits = useLiveQuery(() => db.units.toArray(), []) ?? [];

  useEffect(() => {
    if (!navigator.onLine) {
      setLoading(false);
      setFetchError('offline');
      return;
    }
    fetch(CONTENT_BASE_URL + 'index.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setIndex(data as ContentIndex);
        setLoading(false);
      })
      .catch(() => {
        setFetchError('fetch');
        setLoading(false);
      });
  }, []);

  const cardKey = (u: ContentIndexUnit) => `${u.year}-${u.chapter}-${u.unitNumber}`;

  const handleImport = async (indexUnit: ContentIndexUnit, mode: 'import' | 'update') => {
    const key = cardKey(indexUnit);
    setCardStates((prev) => ({ ...prev, [key]: { loading: true, error: null } }));

    try {
      const response = await fetch(CONTENT_BASE_URL + indexUnit.path);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      // Inject metadata from index into unit object
      data.unit.year = indexUnit.year;
      data.unit.chapter = indexUnit.chapter;
      data.unit.unitNumber = indexUnit.unitNumber;

      const validated = validateImportJson(data);

      if (mode === 'update') {
        const existingUnit = localUnits.find(
          (u) =>
            u.year === indexUnit.year &&
            u.chapter === indexUnit.chapter &&
            u.unitNumber === indexUnit.unitNumber
        );
        if (existingUnit?.id) {
          await deleteUnit(existingUnit.id);
        }
      }

      await importUnit(validated, {
        mode: 'skip',
        year: indexUnit.year,
        chapter: indexUnit.chapter,
        unitNumber: indexUnit.unitNumber,
      });

      // Clear loading state on success — useLiveQuery updates badge automatically
      setCardStates((prev) => ({ ...prev, [key]: { loading: false, error: null } }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      setCardStates((prev) => ({ ...prev, [key]: { loading: false, error: msg } }));
    }
  };

  const handleRetry = () => {
    setFetchError(null);
    setLoading(true);
    fetch(CONTENT_BASE_URL + 'index.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setIndex(data as ContentIndex);
        setLoading(false);
      })
      .catch(() => {
        setFetchError('fetch');
        setLoading(false);
      });
  };

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" aria-label="Loading content">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }}
        />
      </div>
    );
  }

  // ── Offline ────────────────────────────────────────────────────────────────

  if (fetchError === 'offline') {
    return (
      <div
        className="rounded-xl p-6 text-center"
        style={{ backgroundColor: 'var(--color-surface)' }}
        role="status"
      >
        <p className="font-medium mb-1" style={{ color: 'var(--color-text)' }}>
          You're offline
        </p>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Browse content when you're back online. The File, Paste, and URL tabs still work offline.
        </p>
      </div>
    );
  }

  // ── Fetch error ────────────────────────────────────────────────────────────

  if (fetchError === 'fetch') {
    return (
      <div
        className="rounded-xl p-6 text-center"
        style={{ backgroundColor: 'var(--color-surface)' }}
        role="status"
      >
        <p className="font-medium mb-1" style={{ color: 'var(--color-text)' }}>
          Couldn't load available content
        </p>
        <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
          Check your connection and try again.
        </p>
        <button
          onClick={handleRetry}
          className="px-4 py-2 rounded-lg font-medium text-white min-h-[44px]"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Empty index ────────────────────────────────────────────────────────────

  if (!index || index.units.length === 0) {
    return (
      <div
        className="rounded-xl p-6 text-center"
        style={{ backgroundColor: 'var(--color-surface)' }}
        role="status"
      >
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          No content available yet.
        </p>
      </div>
    );
  }

  // ── Content ────────────────────────────────────────────────────────────────

  const grouped = groupUnits(index.units);
  const years = Array.from(grouped.keys()).sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      {years.map((year) => {
        const chapters = grouped.get(year)!;
        const chapterNums = Array.from(chapters.keys()).sort((a, b) => a - b);
        return (
          <div key={year}>
            <h2
              className="text-base font-bold mb-3"
              style={{ color: 'var(--color-text)' }}
              aria-label={`Year ${year}`}
            >
              Year {year}
            </h2>
            <div className="space-y-3">
              {chapterNums.map((chapter) => {
                const units = chapters.get(chapter)!;
                return (
                  <div key={chapter}>
                    <h3
                      className="text-sm font-semibold mb-2 px-1"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      Chapter {chapter}
                    </h3>
                    <div className="space-y-2">
                      {units.map((unit) => {
                        const key = cardKey(unit);
                        const status = getUnitStatus(unit, localUnits);
                        const cardState = cardStates[key] ?? { loading: false, error: null };
                        return (
                          <UnitCard
                            key={key}
                            unit={unit}
                            status={status}
                            importing={cardState.loading}
                            error={cardState.error}
                            onImport={() => handleImport(unit, 'import')}
                            onUpdate={() => handleImport(unit, 'update')}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface UnitCardProps {
  unit: ContentIndexUnit;
  status: 'available' | 'imported' | 'update-available';
  importing: boolean;
  error: string | null;
  onImport: () => void;
  onUpdate: () => void;
}

function UnitCard({ unit, status, importing, error, onImport, onUpdate }: UnitCardProps) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ backgroundColor: 'var(--color-surface)' }}
      aria-label={`Unit: ${unit.name}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p
            className="font-semibold text-sm leading-snug"
            style={{ color: 'var(--color-text)' }}
          >
            {unit.name}
          </p>
          {unit.description && (
            <p
              className="text-xs mt-0.5 line-clamp-2"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {unit.description}
            </p>
          )}
          <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
            {unit.entryCount} {unit.entryCount === 1 ? 'entry' : 'entries'}
          </p>
        </div>

        <div className="flex-shrink-0 flex flex-col items-end gap-2">
          {status === 'available' && (
            <button
              onClick={onImport}
              disabled={importing}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white min-h-[36px] min-w-[72px] transition-opacity"
              style={{
                backgroundColor: 'var(--color-accent)',
                opacity: importing ? 0.6 : 1,
              }}
              aria-label={`Import ${unit.name}`}
            >
              {importing ? 'Importing…' : 'Import'}
            </button>
          )}

          {status === 'imported' && (
            <span
              className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1"
              style={{
                backgroundColor: 'var(--color-accent-light)',
                color: 'var(--color-text-muted)',
              }}
              aria-label={`${unit.name} already imported`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Imported
            </span>
          )}

          {status === 'update-available' && (
            <button
              onClick={onUpdate}
              disabled={importing}
              className="px-3 py-1.5 rounded-lg text-xs font-medium min-h-[36px] min-w-[72px] transition-opacity border"
              style={{
                backgroundColor: 'transparent',
                borderColor: 'var(--color-accent)',
                color: 'var(--color-accent)',
                opacity: importing ? 0.6 : 1,
              }}
              aria-label={`Update ${unit.name}`}
            >
              {importing ? 'Updating…' : 'Update'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs mt-2" style={{ color: 'var(--color-danger)' }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
