import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { deleteUnit } from '../db/import';
import {
  exportProgressData,
  importProgressData,
  resetAllProgress,
  type ProgressExport,
} from '../db/progress';

type ConfirmAction =
  | { type: 'reset' }
  | { type: 'deleteUnit'; unitId: number; unitName: string };

export default function SettingsPage() {
  const units = useLiveQuery(() => db.units.toArray(), []);

  const [exportJson, setExportJson] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [actionDone, setActionDone] = useState<string | null>(null);

  async function handleExport() {
    const data = await exportProgressData();
    setExportJson(JSON.stringify(data, null, 2));
    setCopied(false);
  }

  async function handleCopy() {
    if (!exportJson) return;
    await navigator.clipboard.writeText(exportJson);
    setCopied(true);
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    setImportError(null);
    setImportSuccess(false);
    const file = e.target.files?.[0];
    if (!file) return;

    const input = e.target;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target?.result as string;
        const data = JSON.parse(text) as unknown;

        if (
          typeof data !== 'object' ||
          data === null ||
          !Array.isArray((data as Record<string, unknown>).flashcardProgress) ||
          !Array.isArray((data as Record<string, unknown>).sessionLogs)
        ) {
          setImportError('Invalid progress file: missing flashcardProgress or sessionLogs arrays');
          return;
        }

        await importProgressData(data as ProgressExport);
        setImportSuccess(true);
        input.value = '';
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Failed to import progress');
      }
    };
    reader.onerror = () => {
      setImportError('Failed to read file');
    };
    reader.readAsText(file);
  }

  async function handleConfirm() {
    if (!confirmAction) return;

    if (confirmAction.type === 'reset') {
      await resetAllProgress();
      setActionDone('Progress has been reset.');
    } else if (confirmAction.type === 'deleteUnit') {
      await deleteUnit(confirmAction.unitId);
      setActionDone(`"${confirmAction.unitName}" has been deleted.`);
    }

    setConfirmAction(null);
  }

  return (
    <div className="max-w-2xl mx-auto p-4 pb-8">
      <h1 className="text-2xl font-bold mb-6" style={{ color: '#2C2418' }}>
        Settings
      </h1>

      {actionDone && (
        <div
          className="mb-4 rounded-xl p-3 text-sm font-medium"
          style={{ backgroundColor: '#D4EDDA', color: '#155724' }}
        >
          {actionDone}
          <button
            className="ml-2 underline"
            onClick={() => setActionDone(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Export Progress */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-2" style={{ color: '#2C2418' }}>
          Export Progress
        </h2>
        <p className="text-sm mb-3" style={{ color: '#7A6855' }}>
          Generate a JSON snapshot of all your progress data to back up or transfer to another device.
        </p>
        <button
          onClick={handleExport}
          className="rounded-xl px-5 py-3 font-medium text-white"
          style={{ backgroundColor: '#C4713B', minHeight: '44px' }}
        >
          Generate Export
        </button>

        {exportJson && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium" style={{ color: '#2C2418' }}>
                Progress JSON
              </span>
              <button
                onClick={handleCopy}
                className="rounded-lg px-3 py-1.5 text-sm font-medium"
                style={{
                  backgroundColor: copied ? '#5B8C5A' : '#EDE8E0',
                  color: copied ? 'white' : '#2C2418',
                }}
              >
                {copied ? 'Copied!' : 'Copy to Clipboard'}
              </button>
            </div>
            <textarea
              readOnly
              value={exportJson}
              rows={8}
              className="w-full rounded-xl p-3 text-xs font-mono border resize-none"
              style={{
                backgroundColor: '#EDE8E0',
                borderColor: '#D4C8B8',
                color: '#2C2418',
              }}
            />
          </div>
        )}
      </section>

      {/* Import Progress */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-2" style={{ color: '#2C2418' }}>
          Import Progress
        </h2>
        <p className="text-sm mb-3" style={{ color: '#7A6855' }}>
          Restore progress from a previously exported JSON file.
        </p>
        <label
          className="inline-block rounded-xl px-5 py-3 font-medium cursor-pointer"
          style={{
            backgroundColor: '#EDE8E0',
            color: '#2C2418',
            minHeight: '44px',
          }}
        >
          Choose File
          <input
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportFile}
          />
        </label>

        {importError && (
          <p className="mt-2 text-sm" style={{ color: '#C0392B' }}>
            {importError}
          </p>
        )}
        {importSuccess && (
          <p className="mt-2 text-sm" style={{ color: '#5B8C5A' }}>
            Progress imported successfully!
          </p>
        )}
      </section>

      {/* Reset Progress */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-2" style={{ color: '#2C2418' }}>
          Reset Progress
        </h2>
        <p className="text-sm mb-3" style={{ color: '#7A6855' }}>
          Clear all flashcard progress and session history. Your imported units will not be affected.
        </p>
        <button
          onClick={() => setConfirmAction({ type: 'reset' })}
          className="rounded-xl px-5 py-3 font-medium"
          style={{
            backgroundColor: '#FDF0EC',
            color: '#C0392B',
            border: '1px solid #F5B7B1',
            minHeight: '44px',
          }}
        >
          Reset All Progress
        </button>
      </section>

      {/* Delete Unit */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-2" style={{ color: '#2C2418' }}>
          Delete Unit
        </h2>
        <p className="text-sm mb-3" style={{ color: '#7A6855' }}>
          Remove a unit and all its data including progress records.
        </p>
        {!units || units.length === 0 ? (
          <p className="text-sm" style={{ color: '#7A6855' }}>
            No units to delete.
          </p>
        ) : (
          <div className="space-y-2">
            {units.map((unit) => (
              <div
                key={unit.id}
                className="flex items-center justify-between rounded-xl p-3"
                style={{ backgroundColor: '#EDE8E0' }}
              >
                <span className="font-medium text-sm" style={{ color: '#2C2418' }}>
                  {unit.name}
                </span>
                <button
                  onClick={() =>
                    setConfirmAction({
                      type: 'deleteUnit',
                      unitId: unit.id!,
                      unitName: unit.name,
                    })
                  }
                  className="rounded-lg px-3 py-1.5 text-sm font-medium"
                  style={{
                    backgroundColor: '#FDF0EC',
                    color: '#C0392B',
                    border: '1px solid #F5B7B1',
                    minHeight: '44px',
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* About */}
      <section>
        <h2 className="text-lg font-semibold mb-2" style={{ color: '#2C2418' }}>
          About
        </h2>
        <div
          className="rounded-xl p-4 text-sm space-y-1"
          style={{ backgroundColor: '#EDE8E0', color: '#7A6855' }}
        >
          <p>
            <span className="font-medium" style={{ color: '#2C2418' }}>
              Deutsch Learner
            </span>{' '}
            v1.0
          </p>
          <p>
            A PWA for learning German vocabulary and grammar from school worksheets.
          </p>
          <p>All data is stored locally on your device.</p>
        </div>
      </section>

      {/* Confirmation Dialog */}
      {confirmAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ backgroundColor: '#F6F1EB' }}
          >
            <h3 className="text-lg font-bold mb-3" style={{ color: '#2C2418' }}>
              {confirmAction.type === 'reset' ? 'Reset Progress?' : 'Delete Unit?'}
            </h3>
            <p className="text-sm mb-6" style={{ color: '#7A6855' }}>
              {confirmAction.type === 'reset'
                ? 'This will clear all flashcard progress and session history. Your imported units will remain. This cannot be undone.'
                : `This will permanently delete "${confirmAction.unitName}" and all its data including progress. This cannot be undone.`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 rounded-xl py-3 font-medium"
                style={{ backgroundColor: '#EDE8E0', color: '#2C2418' }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 rounded-xl py-3 font-medium text-white"
                style={{ backgroundColor: '#C0392B' }}
              >
                {confirmAction.type === 'reset' ? 'Reset' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
