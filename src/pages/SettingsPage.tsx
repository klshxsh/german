import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { deleteUnit } from '../db/import';
import { getSetting, setSetting } from '../db/settings';
import { THEMES, applyTheme } from '../logic/themes';
import { setSoundEnabled } from '../logic/sounds';
import {
  exportProgressData,
  importProgressData,
  resetAllProgress,
  type ProgressExport,
} from '../db/progress';

type ConfirmAction =
  | { type: 'reset' }
  | { type: 'deleteUnit'; unitId: number; unitName: string };

const EMOJI_OPTIONS = [
  // Animals
  '🐱', '🐶', '🦊', '🐻', '🐼', '🦉', '🐸', '🦋',
  // People
  '🧑‍🎓', '🧑‍💻', '🧑‍🚀', '🦸', '🧙', '🥷',
  // Objects
  '⭐', '🔥', '🎯', '🎸', '🎨', '📚', '🏆', '⚡',
  // Flags
  '🇩🇪', '🇬🇧', '🇪🇺',
];

function isSingleEmoji(str: string): boolean {
  const trimmed = str.trim();
  if (!trimmed) return false;
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const segments = [...new (Intl as any).Segmenter().segment(trimmed)] as unknown[];
    return segments.length === 1;
  }
  // Fallback: emoji sequences are typically 1–8 code points
  const points = [...trimmed];
  return points.length >= 1 && points.length <= 8;
}

export default function SettingsPage() {
  const units = useLiveQuery(() => db.units.toArray(), []);

  // Personalisation state
  const savedTheme = useLiveQuery(() => getSetting('theme', 'terracotta'), []);
  const savedName = useLiveQuery(() => getSetting('userName', ''), []);
  const savedAvatar = useLiveQuery(() => getSetting('userAvatar', ''), []);
  const savedSound = useLiveQuery(() => getSetting('soundEnabled', 'true'), []);

  const [nameInput, setNameInput] = useState('');
  const [customEmoji, setCustomEmoji] = useState('');
  const [customEmojiError, setCustomEmojiError] = useState('');

  // Keep nameInput in sync with saved value on first load
  useEffect(() => {
    if (savedName !== undefined) {
      setNameInput(savedName ?? '');
    }
  }, [savedName]);

  // Progress state
  const [exportJson, setExportJson] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [actionDone, setActionDone] = useState<string | null>(null);

  async function handleThemeSelect(themeId: string) {
    applyTheme(themeId);
    await setSetting('theme', themeId);
  }

  async function handleNameSave() {
    const trimmed = nameInput.trim().slice(0, 20);
    await setSetting('userName', trimmed);
  }

  async function handleAvatarSelect(emoji: string) {
    await setSetting('userAvatar', emoji);
    setCustomEmoji('');
    setCustomEmojiError('');
  }

  async function handleCustomEmojiSave() {
    const trimmed = customEmoji.trim();
    if (!isSingleEmoji(trimmed)) {
      setCustomEmojiError('Please enter a single emoji character.');
      return;
    }
    setCustomEmojiError('');
    await setSetting('userAvatar', trimmed);
    setCustomEmoji('');
  }

  async function handleSoundToggle(enabled: boolean) {
    setSoundEnabled(enabled);
    await setSetting('soundEnabled', enabled ? 'true' : 'false');
  }

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

  const activeThemeId = savedTheme ?? 'terracotta';
  const isSoundOn = savedSound !== 'false';

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

      {/* Your Profile */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4" style={{ color: '#2C2418' }}>
          Your Profile
        </h2>

        {/* Name */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1" style={{ color: '#2C2418' }}>
            Name
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value.slice(0, 20))}
              onKeyDown={(e) => e.key === 'Enter' && void handleNameSave()}
              maxLength={20}
              placeholder="Your name"
              className="flex-1 rounded-xl px-3 py-2 border text-sm"
              style={{
                backgroundColor: '#EDE8E0',
                borderColor: '#D4C8B8',
                color: '#2C2418',
                minHeight: '44px',
              }}
              aria-label="Name input"
            />
            <button
              onClick={() => void handleNameSave()}
              className="rounded-xl px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: '#C4713B', minHeight: '44px' }}
            >
              Save
            </button>
          </div>
          {savedName && (
            <p className="text-xs mt-1" style={{ color: '#7A6855' }}>
              Saved: {savedName}
            </p>
          )}
        </div>

        {/* Avatar */}
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: '#2C2418' }}>
            Avatar
          </label>
          <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Emoji avatar picker">
            {EMOJI_OPTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => void handleAvatarSelect(emoji)}
                className="text-2xl rounded-xl p-2 transition-transform active:scale-90"
                style={{
                  minWidth: '44px',
                  minHeight: '44px',
                  backgroundColor: savedAvatar === emoji ? '#C4713B' : '#EDE8E0',
                  outline: savedAvatar === emoji ? '2px solid #C4713B' : 'none',
                  outlineOffset: '2px',
                }}
                aria-label={`Select ${emoji} avatar`}
                aria-pressed={savedAvatar === emoji}
              >
                {emoji}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: '#7A6855' }}>
              Or choose your own:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={customEmoji}
                onChange={(e) => {
                  setCustomEmoji(e.target.value);
                  setCustomEmojiError('');
                }}
                placeholder="Paste emoji here"
                className="w-24 rounded-xl px-3 py-2 border text-center text-xl"
                style={{
                  backgroundColor: '#EDE8E0',
                  borderColor: customEmojiError ? '#C0392B' : '#D4C8B8',
                  color: '#2C2418',
                  minHeight: '44px',
                }}
                aria-label="Custom emoji input"
              />
              <button
                onClick={() => void handleCustomEmojiSave()}
                className="rounded-xl px-4 py-2 text-sm font-medium"
                style={{
                  backgroundColor: '#EDE8E0',
                  color: '#2C2418',
                  minHeight: '44px',
                }}
              >
                Use
              </button>
            </div>
            {customEmojiError && (
              <p className="text-xs mt-1" style={{ color: '#C0392B' }}>
                {customEmojiError}
              </p>
            )}
          </div>

          {savedAvatar && (
            <p className="text-sm mt-2" style={{ color: '#7A6855' }}>
              Current avatar: <span className="text-xl">{savedAvatar}</span>
            </p>
          )}
        </div>
      </section>

      {/* Colour Themes */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4" style={{ color: '#2C2418' }}>
          Colour Theme
        </h2>
        <div className="grid grid-cols-3 gap-3" role="group" aria-label="Colour theme selector">
          {THEMES.map((theme) => {
            const isActive = activeThemeId === theme.id;
            return (
              <button
                key={theme.id}
                onClick={() => void handleThemeSelect(theme.id)}
                className="rounded-xl p-3 flex flex-col items-center gap-2 border-2 transition-all"
                style={{
                  backgroundColor: theme.colors.bg,
                  borderColor: isActive ? theme.colors.accent : theme.colors.border,
                  minHeight: '44px',
                }}
                aria-label={`${theme.name} theme`}
                aria-pressed={isActive}
                data-testid={`theme-${theme.id}`}
              >
                <div
                  className="w-8 h-8 rounded-full"
                  style={{ backgroundColor: theme.colors.accent }}
                />
                <span
                  className="text-xs font-medium"
                  style={{ color: theme.colors.text }}
                >
                  {theme.name}
                </span>
                {isActive && (
                  <svg
                    className="w-4 h-4"
                    style={{ color: theme.colors.accent }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Sound Effects */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-2" style={{ color: '#2C2418' }}>
          Sound Effects
        </h2>
        <p className="text-sm mb-3" style={{ color: '#7A6855' }}>
          Audio feedback for correct and incorrect answers during learning sessions.
        </p>
        <label className="flex items-center gap-3 cursor-pointer" style={{ minHeight: '44px' }}>
          <div className="relative">
            <input
              type="checkbox"
              checked={isSoundOn}
              onChange={(e) => void handleSoundToggle(e.target.checked)}
              className="sr-only"
              aria-label="Sound effects toggle"
              role="switch"
              aria-checked={isSoundOn}
            />
            <div
              className="w-12 h-6 rounded-full transition-colors"
              style={{ backgroundColor: isSoundOn ? '#C4713B' : '#D4C8B8' }}
            />
            <div
              className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
              style={{ transform: isSoundOn ? 'translateX(1.625rem)' : 'translateX(0.125rem)' }}
            />
          </div>
          <span className="text-sm font-medium" style={{ color: '#2C2418' }}>
            {isSoundOn ? 'On' : 'Off'}
          </span>
        </label>
      </section>

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
