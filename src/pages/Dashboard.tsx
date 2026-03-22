import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { getSetting } from '../db/settings';
import { groupUnits } from '../logic/grouping';
import type { Unit } from '../types';

const COLLAPSE_KEY = 'dashboard_collapsed_years';

function loadCollapsed(): Set<number> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (raw) return new Set(JSON.parse(raw) as number[]);
  } catch {
    // ignore
  }
  return new Set();
}

function saveCollapsed(collapsed: Set<number>) {
  localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed]));
}

interface UnitCardProps {
  unit: Unit;
  entryCount: number | undefined;
}

function UnitCard({ unit, entryCount }: UnitCardProps) {
  const navigate = useNavigate();
  return (
    <div
      className="rounded-2xl p-6 shadow-sm cursor-pointer transition-transform active:scale-[0.98]"
      style={{ backgroundColor: 'var(--color-surface)' }}
      onClick={() => navigate(`/unit/${unit.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/unit/${unit.id}`)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {unit.unitNumber > 0 && (
            <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Unit {unit.unitNumber}
            </p>
          )}
          <h3 className="text-base font-semibold truncate" style={{ color: 'var(--color-text)' }}>
            {unit.name}
          </h3>
          {unit.description && (
            <p className="text-sm mt-1 line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>
              {unit.description}
            </p>
          )}
          <span className="inline-flex items-center gap-1 text-sm font-medium mt-2" style={{ color: 'var(--color-accent)' }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            {entryCount ?? '...'} entries
          </span>
        </div>
        <svg className="w-5 h-5 flex-shrink-0 mt-1" style={{ color: 'var(--color-accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>

      <div className="flex gap-2 mt-4">
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`/unit/${unit.id}/flashcards`); }}
          className="flex-1 py-2 px-3 rounded-lg text-sm font-medium text-white min-h-[44px]"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          Flashcards
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`/unit/${unit.id}/builder`); }}
          className="flex-1 py-2 px-3 rounded-lg text-sm font-medium min-h-[44px]"
          style={{ backgroundColor: 'var(--color-accent-light)', color: 'var(--color-text)' }}
        >
          Builder
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`/unit/${unit.id}/cloze`); }}
          className="flex-1 py-2 px-3 rounded-lg text-sm font-medium min-h-[44px]"
          style={{ backgroundColor: 'var(--color-accent-light)', color: 'var(--color-text)' }}
        >
          Cloze
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<Set<number>>(loadCollapsed);

  const units = useLiveQuery(() => db.units.toArray(), []);

  const userName = useLiveQuery(() => getSetting('userName'), []);
  const userAvatar = useLiveQuery(() => getSetting('userAvatar'), []);

  const unitEntryCounts = useLiveQuery(async () => {
    if (!units) return {};
    const counts: Record<number, number> = {};
    for (const unit of units) {
      if (unit.id !== undefined) {
        counts[unit.id] = await db.entries.where('unitId').equals(unit.id).count();
      }
    }
    return counts;
  }, [units]);

  const toggleYear = (year: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      saveCollapsed(next);
      return next;
    });
  };

  const grouped = units ? groupUnits(units) : null;

  return (
    <div className="max-w-2xl mx-auto px-4 pt-8 pb-4">
      <header className="flex items-center justify-between mb-8">
        <div>
          {userName ? (
            <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
              {userAvatar ? `${userAvatar} ` : ''}Hallo, {userName}!
            </h1>
          ) : (
            <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
              Willkommen!{' '}
              <button
                onClick={() => navigate('/settings')}
                className="text-base font-normal underline"
                style={{ color: 'var(--color-accent)' }}
              >
                Set your name
              </button>
            </h1>
          )}
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Your German learning journey
          </p>
        </div>
        <button
          onClick={() => navigate('/import')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm text-white min-h-[44px]"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Import Unit
        </button>
      </header>

      {units === undefined ? (
        <div className="text-center py-12" style={{ color: 'var(--color-text-muted)' }}>
          Loading...
        </div>
      ) : units.length === 0 ? (
        <div
          className="rounded-2xl p-8 text-center border-2 border-dashed"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-accent-light)' }}>
            <svg className="w-8 h-8" style={{ color: 'var(--color-accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
            No units yet
          </h2>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
            Import a JSON file from the Content Studio to get started with your German learning.
          </p>
          <button
            onClick={() => navigate('/import')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-white min-h-[44px]"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import your first unit
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Year → Chapter → Unit hierarchy */}
          {grouped && grouped.yearGroups.map((yearGroup) => {
            const isCollapsed = collapsed.has(yearGroup.year);
            return (
              <div key={yearGroup.year}>
                <button
                  onClick={() => toggleYear(yearGroup.year)}
                  className="w-full flex items-center justify-between py-2 mb-3 min-h-[44px]"
                  aria-expanded={!isCollapsed}
                  data-testid={`year-group-${yearGroup.year}`}
                >
                  <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
                    Year {yearGroup.year}
                  </h2>
                  <svg
                    className="w-5 h-5 transition-transform"
                    style={{
                      color: 'var(--color-accent)',
                      transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                    }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {!isCollapsed && (
                  <div className="space-y-5 pl-1">
                    {yearGroup.chapters.map((chapterGroup) => (
                      <div key={chapterGroup.chapter}>
                        <h3
                          className="text-sm font-semibold uppercase tracking-wide mb-3"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          Chapter {chapterGroup.chapter}
                        </h3>
                        <div className="space-y-3">
                          {chapterGroup.units.map((unit) => (
                            <UnitCard
                              key={unit.id}
                              unit={unit}
                              entryCount={unitEntryCounts?.[unit.id!]}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Ungrouped section */}
          {grouped && grouped.ungrouped.length > 0 && (
            <div>
              <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--color-text)' }}>
                Ungrouped
              </h2>
              <div className="space-y-3">
                {grouped.ungrouped.map((unit) => (
                  <UnitCard
                    key={unit.id}
                    unit={unit}
                    entryCount={unitEntryCounts?.[unit.id!]}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
