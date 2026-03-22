import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { search, type EntrySearchResult } from '../logic/search';
import type { Unit } from '../types';

function unitLabel(unit: Unit): string {
  if (unit.year === 0 || unit.chapter === 0) return unit.name;
  const parts = [`Year ${unit.year}`, `Chapter ${unit.chapter}`];
  if (unit.unitNumber > 0) parts.push(`Unit ${unit.unitNumber}`);
  return parts.join(' · ');
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm" style={{ backgroundColor: '#FFE082', color: 'inherit' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function ResultCard({
  result,
  query,
  onNavigate,
}: {
  result: EntrySearchResult;
  query: string;
  onNavigate: () => void;
}) {
  return (
    <div
      className="rounded-xl p-4 cursor-pointer transition-transform active:scale-[0.98]"
      style={{ backgroundColor: 'var(--color-surface)' }}
      onClick={onNavigate}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onNavigate()}
      data-testid="search-result"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-semibold text-base" style={{ color: 'var(--color-text)' }}>
              <Highlight text={result.entry.german} query={query} />
            </span>
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              <Highlight text={result.entry.english} query={query} />
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: 'var(--color-accent-light)', color: 'var(--color-text-muted)' }}
            >
              {result.category.name}
            </span>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {result.entry.partOfSpeech}
            </span>
          </div>
          {result.matchedVerbForm && (
            <div
              className="mt-2 text-xs rounded-lg p-2"
              style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text-muted)' }}
              data-testid="verb-form-row"
            >
              <span className="font-medium">Verb: </span>
              <Highlight text={result.matchedVerbForm.infinitive} query={query} /> ·{' '}
              <Highlight text={result.matchedVerbForm.present3rd} query={query} /> ·{' '}
              {result.matchedVerbForm.perfectAux}{' '}
              <Highlight text={result.matchedVerbForm.pastParticiple} query={query} />
            </div>
          )}
          {result.matchedSentences.map((s) => (
            <div
              key={s.id}
              className="mt-2 text-xs rounded-lg p-2 italic flex items-start justify-between gap-2"
              style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text-muted)' }}
              data-testid="matched-sentence"
            >
              <span>
                <Highlight text={s.german} query={query} />
                <span className="mx-1 not-italic">—</span>
                <Highlight text={s.english} query={query} />
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`${s.german} — ${s.english}`); }}
                className="not-italic flex-shrink-0 p-0.5 rounded opacity-50 hover:opacity-100 transition-opacity min-h-[24px] min-w-[24px] flex items-center justify-center"
                aria-label="Copy sentence"
                title="Copy sentence"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <svg
          className="w-4 h-4 flex-shrink-0 mt-1"
          style={{ color: 'var(--color-accent)' }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}

export default function SearchPage() {
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState('');
  const [query, setQuery] = useState('');

  // Debounce the search query by 300ms
  useEffect(() => {
    const timer = setTimeout(() => setQuery(inputValue), 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const entries = useLiveQuery(() => db.entries.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const units = useLiveQuery(() => db.units.toArray(), []);
  const verbForms = useLiveQuery(() => db.verbForms.toArray(), []);
  const sentences = useLiveQuery(() => db.generatedSentences.toArray(), []);

  const results = useMemo(() => {
    if (!entries || !categories || !units || !verbForms || !sentences) return null;
    return search(query, entries, categories, units, verbForms, sentences);
  }, [query, entries, categories, units, verbForms, sentences]);

  const isLoading = !entries || !categories || !units || !verbForms || !sentences;

  return (
    <div className="max-w-2xl mx-auto px-4 pt-8 pb-4">
      <header className="mb-6">
        <h1 className="text-2xl font-bold mb-4" style={{ color: 'var(--color-text)' }}>
          Search
        </h1>
        <div className="relative">
          <input
            type="search"
            placeholder="Search German or English..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="w-full px-4 py-3 pr-10 rounded-xl border text-base outline-none min-h-[44px]"
            style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            aria-label="Search vocabulary"
            data-testid="search-input"
          />
          {inputValue && (
            <button
              onClick={() => { setInputValue(''); setQuery(''); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
              aria-label="Clear search"
            >
              <svg className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {isLoading ? (
        <div className="text-center py-12" style={{ color: 'var(--color-text-muted)' }}>
          Loading...
        </div>
      ) : !query ? (
        <div className="text-center py-12" style={{ color: 'var(--color-text-muted)' }}>
          <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p>Type to search across all units</p>
        </div>
      ) : results && results.totalResults === 0 ? (
        <div className="text-center py-12" style={{ color: 'var(--color-text-muted)' }} data-testid="no-results">
          <p className="font-medium" style={{ color: 'var(--color-text)' }}>
            No results for &ldquo;{query}&rdquo;
          </p>
          <p className="text-sm mt-1">Try a different word or check your spelling</p>
        </div>
      ) : results ? (
        <div>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }} data-testid="result-count">
            {results.totalResults} {results.totalResults === 1 ? 'result' : 'results'} across{' '}
            {results.unitCount} {results.unitCount === 1 ? 'unit' : 'units'}
          </p>
          <div className="space-y-6">
            {results.groups.map((group) => (
              <div key={group.unitId}>
                <div className="mb-3">
                  <h2 className="font-semibold text-base" style={{ color: 'var(--color-text)' }}>
                    {group.unit.name}
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {unitLabel(group.unit)}
                  </p>
                </div>
                <div className="space-y-3">
                  {group.categories.map((catGroup) => (
                    <div key={catGroup.categoryId}>
                      <h3
                        className="text-xs font-semibold uppercase tracking-wide mb-2"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        {catGroup.category.name}
                      </h3>
                      <div className="space-y-2">
                        {catGroup.results.map((result) => (
                          <ResultCard
                            key={result.entry.id}
                            result={result}
                            query={query}
                            onNavigate={() => navigate(`/unit/${result.unit.id}`)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
