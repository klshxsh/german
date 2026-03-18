import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { importUnit, validateImportJson, ImportError, DuplicateUnitError } from '../db/import';
import type { ImportJson } from '../db/import';

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
};

export default function ImportPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [duplicate, setDuplicate] = useState<DuplicateState | null>(null);
  const [successUnitId, setSuccessUnitId] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processFile(file);
  };

  const handleImport = async (json: ImportJson, mode: 'skip' | 'replace' = 'skip') => {
    setImporting(true);
    setError(null);

    try {
      const unitId = await importUnit(json, { mode });
      setSuccessUnitId(unitId);
      setPreview(null);
      setDuplicate(null);
    } catch (err) {
      if (err instanceof DuplicateUnitError) {
        setDuplicate({
          name: json.unit.name,
          existingId: err.existingId,
          json,
        });
      } else if (err instanceof ImportError) {
        setError(err.message);
      } else {
        setError('Import failed — please try again');
      }
    } finally {
      setImporting(false);
    }
  };

  const processFile = async (file: File) => {
    setError(null);
    setPreview(null);
    setDuplicate(null);
    setSuccessUnitId(null);

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

      const json = validateImportJson(parsed);
      const entriesPerCategory = json.categories.map((cat) => ({
        name: cat.name,
        count: json.entries.filter((e) => e.categoryId === cat.id).length,
      }));
      setPreview({ json, categoryCount: json.categories.length, entryCount: json.entries.length, entriesPerCategory });
    } catch (err) {
      if (err instanceof ImportError) {
        setError(err.message);
      } else {
        setError('Failed to read file');
      }
    }
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

  const handleReset = () => {
    setPreview(null);
    setError(null);
    setDuplicate(null);
    setSuccessUnitId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

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
            Select a JSON file from Content Studio
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
        <div className="space-y-6">
          {/* File picker */}
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

          {/* Duplicate warning modal */}
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
                  onClick={() => handleImport(duplicate.json, 'replace')}
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

              <button
                onClick={() => handleImport(preview.json)}
                disabled={importing}
                className="w-full py-3 rounded-lg font-medium text-white min-h-[44px] transition-opacity"
                style={{ backgroundColor: '#C4713B', opacity: importing ? 0.7 : 1 }}
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
