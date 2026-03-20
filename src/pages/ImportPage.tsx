import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { importUnit, validateImportJson, ImportError, DuplicateUnitError } from '../db/import';
import type { ImportJson } from '../db/import';
import { fetchJson, FetchJsonError } from '../logic/fetchJson';

const TERM_OPTIONS = ['Autumn', 'Spring', 'Summer'];
const RECENT_URLS_KEY = 'deutsch-recent-urls';
const MAX_RECENT_URLS = 5;

type ActiveTab = 'file' | 'paste' | 'url';

interface UnitMetadata {
  year: string;
  term: string;
  unitNumber: string;
}

interface PreviewData {
  json: ImportJson;
  categoryCount: number;
  entryCount: number;
  entriesPerCategory: Array<{ name: string; count: number }>;
}

type DuplicateState = {
  name: string;
  existingId: number;
  json: ImportJson;
  metadata: UnitMetadata;
};

function metadataIsValid(m: UnitMetadata): boolean {
  return (
    m.year.trim() !== '' &&
    !isNaN(Number(m.year)) &&
    Number(m.year) > 0 &&
    m.term !== '' &&
    m.unitNumber.trim() !== '' &&
    !isNaN(Number(m.unitNumber)) &&
    Number(m.unitNumber) > 0
  );
}

function loadRecentUrls(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_URLS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveRecentUrl(url: string): void {
  try {
    const urls = loadRecentUrls().filter((u) => u !== url);
    urls.unshift(url);
    localStorage.setItem(RECENT_URLS_KEY, JSON.stringify(urls.slice(0, MAX_RECENT_URLS)));
  } catch {
    // localStorage may be unavailable — ignore
  }
}

export default function ImportPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>('file');
  const [pasteText, setPasteText] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [recentUrls, setRecentUrls] = useState<string[]>(loadRecentUrls);
  const [dragging, setDragging] = useState(false);

  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [metadata, setMetadata] = useState<UnitMetadata>({ year: '', term: '', unitNumber: '' });
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [duplicate, setDuplicate] = useState<DuplicateState | null>(null);
  const [successUnitId, setSuccessUnitId] = useState<number | null>(null);

  const processJson = (parsed: unknown) => {
    const json = validateImportJson(parsed);
    const entriesPerCategory = json.categories.map((cat) => ({
      name: cat.name,
      count: json.entries.filter((e) => e.categoryId === cat.id).length,
    }));
    setPreview({
      json,
      categoryCount: json.categories.length,
      entryCount: json.entries.length,
      entriesPerCategory,
    });
    setMetadata({
      year: json.unit.year ? String(json.unit.year) : '',
      term: json.unit.term ?? '',
      unitNumber: json.unit.unitNumber ? String(json.unit.unitNumber) : '',
    });
  };

  const clearResults = () => {
    setError(null);
    setPreview(null);
    setDuplicate(null);
    setSuccessUnitId(null);
  };

  // ── File tab ─────────────────────────────────────────────────────────────

  const readFileAsText = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });

  const processFile = async (file: File) => {
    clearResults();
    try {
      let text: string;
      try {
        text = await readFileAsText(file);
      } catch {
        throw new ImportError('Failed to read file');
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new ImportError('Invalid JSON file — could not parse');
      }
      processJson(parsed);
    } catch (err) {
      setError(err instanceof ImportError ? err.message : 'Failed to read file');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await processFile(file);
  };

  // ── Paste tab ─────────────────────────────────────────────────────────────

  const handleParsePaste = () => {
    const text = pasteText.trim();
    if (!text) {
      setError('Please paste some JSON first');
      return;
    }
    clearResults();
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new ImportError('Invalid JSON — could not parse');
      }
      processJson(parsed);
    } catch (err) {
      setError(err instanceof ImportError ? err.message : 'Failed to parse JSON');
    }
  };

  // ── URL tab ───────────────────────────────────────────────────────────────

  const handleFetchUrl = async (url?: string) => {
    const target = (url ?? urlInput).trim();
    if (!target) {
      setError('Please enter a URL');
      return;
    }
    clearResults();
    setIsFetching(true);
    try {
      const parsed = await fetchJson(target);
      processJson(parsed);
      saveRecentUrl(target);
      setRecentUrls(loadRecentUrls());
      if (!url) setUrlInput(target);
    } catch (err) {
      if (err instanceof FetchJsonError) {
        setError(err.message);
      } else if (err instanceof ImportError) {
        setError(err.message);
      } else {
        setError('Failed to fetch JSON from URL');
      }
    } finally {
      setIsFetching(false);
    }
  };

  // ── Import ─────────────────────────────────────────────────────────────────

  const handleImport = async (
    json: ImportJson,
    meta: UnitMetadata,
    mode: 'skip' | 'replace' = 'skip'
  ) => {
    setImporting(true);
    setError(null);
    try {
      const unitId = await importUnit(json, {
        mode,
        year: Number(meta.year),
        term: meta.term,
        unitNumber: Number(meta.unitNumber),
      });
      setSuccessUnitId(unitId);
      setPreview(null);
      setDuplicate(null);
    } catch (err) {
      if (err instanceof DuplicateUnitError) {
        setDuplicate({ name: json.unit.name, existingId: err.existingId, json, metadata: meta });
      } else if (err instanceof ImportError) {
        setError(err.message);
      } else {
        setError('Import failed — please try again');
      }
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    clearResults();
    setMetadata({ year: '', term: '', unitNumber: '' });
    setPasteText('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const switchTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    clearResults();
  };

  const canImport = preview !== null && metadataIsValid(metadata);

  return (
    <div className="max-w-2xl mx-auto px-4 pt-8 pb-4">
      <header className="flex items-center gap-3 mb-8">
        <button
          onClick={() => navigate('/')}
          className="p-2 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
          style={{ backgroundColor: '#EDE8E0' }}
          aria-label="Go back"
        >
          <svg className="w-5 h-5" style={{ color: '#2C2418' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#2C2418' }}>
            Import Unit
          </h1>
          <p className="text-sm mt-0.5" style={{ color: '#7A6855' }}>
            Import JSON from Content Studio
          </p>
        </div>
      </header>

      {successUnitId !== null ? (
        <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: 'white' }}>
          <div
            className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
            style={{ backgroundColor: '#E8F4E8' }}
          >
            <svg className="w-8 h-8" style={{ color: '#5B8C5A' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: '#2C2418' }}>
            Import successful!
          </h2>
          <p className="text-sm mb-6" style={{ color: '#7A6855' }}>
            Your unit has been imported and is ready to study.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => navigate(`/unit/${successUnitId}`)}
              className="w-full py-3 rounded-lg font-medium text-white min-h-[44px]"
              style={{ backgroundColor: '#C4713B' }}
            >
              View Unit
            </button>
            <button
              onClick={handleReset}
              className="w-full py-3 rounded-lg font-medium min-h-[44px]"
              style={{ backgroundColor: '#EDE8E0', color: '#2C2418' }}
            >
              Import Another
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Tab bar */}
          <div
            className="flex rounded-xl p-1 gap-1"
            style={{ backgroundColor: '#EDE8E0' }}
            role="tablist"
            aria-label="Import method"
          >
            {(['file', 'paste', 'url'] as const).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => switchTab(tab)}
                className="flex-1 py-2 px-3 rounded-lg text-sm font-medium min-h-[44px] transition-colors"
                style={{
                  backgroundColor: activeTab === tab ? 'white' : 'transparent',
                  color: activeTab === tab ? '#2C2418' : '#7A6855',
                }}
              >
                {tab === 'file' ? 'File' : tab === 'paste' ? 'Paste' : 'URL'}
              </button>
            ))}
          </div>

          {/* File tab */}
          {activeTab === 'file' && (
            <div
              className="rounded-2xl p-6 border-2 border-dashed"
              style={{
                borderColor: dragging ? '#C4713B' : preview ? '#C4713B' : '#D4C8B8',
                backgroundColor: dragging ? '#FDF5EF' : 'white',
              }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <label htmlFor="json-file-input" className="block cursor-pointer">
                <div className="text-center">
                  <div
                    className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: '#EDE8E0' }}
                  >
                    <svg className="w-6 h-6" style={{ color: '#C4713B' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </div>
                  <p className="font-medium" style={{ color: '#2C2418' }}>
                    Choose a JSON file
                  </p>
                  <p className="text-sm mt-1" style={{ color: '#7A6855' }}>
                    or drag and drop here
                  </p>
                </div>
                <input
                  id="json-file-input"
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileChange}
                  className="sr-only"
                  aria-label="Choose JSON file"
                />
              </label>
            </div>
          )}

          {/* Paste tab */}
          {activeTab === 'paste' && (
            <div className="rounded-2xl p-6 space-y-4" style={{ backgroundColor: 'white' }}>
              <div>
                <label htmlFor="paste-input" className="block text-sm font-medium mb-2" style={{ color: '#2C2418' }}>
                  Paste JSON here
                </label>
                <textarea
                  id="paste-input"
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder='{"unit": {"name": "..."}, "categories": [...], "entries": [...]}'
                  rows={8}
                  className="w-full px-3 py-2 rounded-lg border text-sm font-mono resize-none"
                  style={{ borderColor: '#D4C8B8', color: '#2C2418' }}
                  aria-label="Paste JSON"
                />
              </div>
              <button
                onClick={handleParsePaste}
                className="w-full py-3 rounded-lg font-medium text-white min-h-[44px]"
                style={{ backgroundColor: '#C4713B' }}
                aria-label="Parse pasted JSON"
              >
                Parse JSON
              </button>
            </div>
          )}

          {/* URL tab */}
          {activeTab === 'url' && (
            <div className="rounded-2xl p-6 space-y-4" style={{ backgroundColor: 'white' }}>
              <div>
                <label htmlFor="url-input" className="block text-sm font-medium mb-2" style={{ color: '#2C2418' }}>
                  JSON URL
                </label>
                <div className="flex gap-2">
                  <input
                    id="url-input"
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleFetchUrl()}
                    placeholder="https://gist.githubusercontent.com/..."
                    className="flex-1 px-3 py-2 rounded-lg border text-sm min-h-[44px]"
                    style={{ borderColor: '#D4C8B8', color: '#2C2418' }}
                    aria-label="JSON URL"
                  />
                  <button
                    onClick={() => handleFetchUrl()}
                    disabled={!urlInput.trim() || isFetching}
                    className="px-4 py-2 rounded-lg font-medium text-white min-h-[44px] flex-shrink-0 transition-opacity"
                    style={{
                      backgroundColor: '#C4713B',
                      opacity: !urlInput.trim() || isFetching ? 0.5 : 1,
                    }}
                    aria-label="Fetch JSON from URL"
                  >
                    {isFetching ? 'Fetching…' : 'Fetch'}
                  </button>
                </div>
                <p className="text-xs mt-2" style={{ color: '#7A6855' }}>
                  Works with GitHub Gist raw URLs, GitHub Pages, or any server with CORS enabled.
                </p>
              </div>

              {recentUrls.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-2" style={{ color: '#7A6855' }}>
                    Recently used
                  </p>
                  <ul className="space-y-1">
                    {recentUrls.map((url) => (
                      <li key={url}>
                        <button
                          onClick={() => {
                            setUrlInput(url);
                            handleFetchUrl(url);
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg text-xs truncate min-h-[44px] flex items-center"
                          style={{ backgroundColor: '#EDE8E0', color: '#2C2418' }}
                          aria-label={`Use recent URL: ${url}`}
                        >
                          {url}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div
              className="rounded-xl p-4 flex items-start gap-3"
              style={{ backgroundColor: '#FDF0EF' }}
              role="alert"
            >
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#C0392B' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-medium text-sm" style={{ color: '#C0392B' }}>
                  Import failed
                </p>
                <p className="text-sm mt-0.5" style={{ color: '#7A3327' }}>
                  {error}
                </p>
              </div>
            </div>
          )}

          {/* Duplicate warning */}
          {duplicate && (
            <div
              className="rounded-xl p-4"
              style={{ backgroundColor: '#FEF9EF' }}
              role="alert"
              aria-label="Duplicate unit warning"
            >
              <h3 className="font-semibold text-sm mb-1" style={{ color: '#8B6914' }}>
                Unit already exists
              </h3>
              <p className="text-sm mb-4" style={{ color: '#7A6855' }}>
                A unit named <strong>"{duplicate.name}"</strong> has already been imported. What would you like to do?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleImport(duplicate.json, duplicate.metadata, 'replace')}
                  disabled={importing}
                  className="flex-1 py-2 px-3 rounded-lg text-sm font-medium text-white min-h-[44px]"
                  style={{ backgroundColor: '#C4713B' }}
                >
                  Replace
                </button>
                <button
                  onClick={() => navigate(`/unit/${duplicate.existingId}`)}
                  className="flex-1 py-2 px-3 rounded-lg text-sm font-medium min-h-[44px]"
                  style={{ backgroundColor: '#EDE8E0', color: '#2C2418' }}
                >
                  Keep existing
                </button>
                <button
                  onClick={handleReset}
                  className="flex-1 py-2 px-3 rounded-lg text-sm font-medium min-h-[44px]"
                  style={{ backgroundColor: '#EDE8E0', color: '#2C2418' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Preview */}
          {preview && !duplicate && (
            <div className="rounded-2xl p-6" style={{ backgroundColor: 'white' }}>
              <h2 className="font-semibold text-lg mb-1" style={{ color: '#2C2418' }}>
                {preview.json.unit.name}
              </h2>
              {preview.json.unit.description && (
                <p className="text-sm mb-4" style={{ color: '#7A6855' }}>
                  {preview.json.unit.description}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="rounded-xl p-3 text-center" style={{ backgroundColor: '#EDE8E0' }}>
                  <p className="text-2xl font-bold" style={{ color: '#C4713B' }}>
                    {preview.categoryCount}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#7A6855' }}>
                    {preview.categoryCount === 1 ? 'Category' : 'Categories'}
                  </p>
                </div>
                <div className="rounded-xl p-3 text-center" style={{ backgroundColor: '#EDE8E0' }}>
                  <p className="text-2xl font-bold" style={{ color: '#C4713B' }}>
                    {preview.entryCount}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#7A6855' }}>
                    {preview.entryCount === 1 ? 'Entry' : 'Entries'}
                  </p>
                </div>
              </div>

              <div className="space-y-2 mb-5">
                <h3 className="text-sm font-medium" style={{ color: '#2C2418' }}>
                  Categories
                </h3>
                {preview.entriesPerCategory.map((cat) => (
                  <div
                    key={cat.name}
                    className="flex items-center justify-between py-2 px-3 rounded-lg"
                    style={{ backgroundColor: '#EDE8E0' }}
                  >
                    <span className="text-sm truncate flex-1 mr-2" style={{ color: '#2C2418' }}>
                      {cat.name}
                    </span>
                    <span className="text-sm font-medium flex-shrink-0" style={{ color: '#C4713B' }}>
                      {cat.count} {cat.count === 1 ? 'entry' : 'entries'}
                    </span>
                  </div>
                ))}
              </div>

              {/* Unit grouping metadata */}
              <div className="mb-5">
                <h3 className="text-sm font-medium mb-3" style={{ color: '#2C2418' }}>
                  Unit grouping
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: '#7A6855' }}>
                      Year *
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 9"
                      value={metadata.year}
                      onChange={(e) => setMetadata((m) => ({ ...m, year: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                      style={{ borderColor: '#D4C8B8', color: '#2C2418' }}
                      aria-label="School year"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: '#7A6855' }}>
                      Term *
                    </label>
                    <select
                      value={metadata.term}
                      onChange={(e) => setMetadata((m) => ({ ...m, term: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                      style={{ borderColor: '#D4C8B8', color: '#2C2418' }}
                      aria-label="Term"
                    >
                      <option value="">Select...</option>
                      {TERM_OPTIONS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: '#7A6855' }}>
                      Unit # *
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 3"
                      value={metadata.unitNumber}
                      onChange={(e) => setMetadata((m) => ({ ...m, unitNumber: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                      style={{ borderColor: '#D4C8B8', color: '#2C2418' }}
                      aria-label="Unit number"
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleImport(preview.json, metadata)}
                disabled={importing || !canImport}
                className="w-full py-3 rounded-lg font-medium text-white min-h-[44px] transition-opacity"
                style={{ backgroundColor: '#C4713B', opacity: importing || !canImport ? 0.5 : 1 }}
                aria-label="Import unit"
              >
                {importing ? 'Importing...' : 'Import Unit'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
