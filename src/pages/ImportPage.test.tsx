import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ImportPage from './ImportPage';
import { db } from '../db/db';

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const validTestJson = {
  unit: { name: 'Test Import Unit', description: 'A test unit for import page tests' },
  categories: [
    { id: 'cat_1', name: 'Verbs', description: 'German verbs', grammarNotes: '' },
    { id: 'cat_2', name: 'Nouns', description: 'German nouns', grammarNotes: '' },
  ],
  entries: [
    { id: 'ent_1', categoryId: 'cat_1', german: 'spielen', english: 'to play', partOfSpeech: 'verb', grammarNotes: '', tags: [] },
    { id: 'ent_2', categoryId: 'cat_1', german: 'laufen', english: 'to run', partOfSpeech: 'verb', grammarNotes: '', tags: [] },
    { id: 'ent_3', categoryId: 'cat_2', german: 'Hund', english: 'dog', partOfSpeech: 'noun', grammarNotes: '', tags: [] },
  ],
  version: '1.0',
  exportedAt: '2024-01-01T00:00:00Z',
};

function renderImportPage() {
  return render(
    <MemoryRouter initialEntries={['/import']}>
      <Routes>
        <Route path="/import" element={<ImportPage />} />
        <Route path="/unit/:id" element={<div>Unit Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

async function fillMetadata(user: ReturnType<typeof userEvent.setup>) {
  const yearInput = screen.getByRole('spinbutton', { name: /school year/i });
  const termSelect = screen.getByRole('combobox', { name: /term/i });
  const unitNumberInput = screen.getByRole('spinbutton', { name: /unit number/i });
  await user.clear(yearInput);
  await user.type(yearInput, '9');
  await user.selectOptions(termSelect, 'Spring');
  await user.clear(unitNumberInput);
  await user.type(unitNumberInput, '1');
}

afterEach(async () => {
  await db.units.clear();
  await db.categories.clear();
  await db.entries.clear();
  await db.verbForms.clear();
  await db.sentenceTemplates.clear();
  await db.generatedSentences.clear();
  await db.flashcardProgress.clear();
  await db.sessionLogs.clear();
  mockNavigate.mockClear();
  vi.restoreAllMocks();
  localStorage.clear();
});

// ── Tab switching ─────────────────────────────────────────────────────────────

describe('ImportPage — tab switching', () => {
  it('renders three tabs: File, Paste, URL', () => {
    renderImportPage();
    expect(screen.getByRole('tab', { name: /file/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /paste/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /url/i })).toBeDefined();
  });

  it('File tab is selected by default', () => {
    renderImportPage();
    expect(screen.getByRole('tab', { name: /file/i }).getAttribute('aria-selected')).toBe('true');
  });

  it('clicking Paste tab shows textarea', async () => {
    const user = userEvent.setup();
    renderImportPage();

    await user.click(screen.getByRole('tab', { name: /paste/i }));

    expect(screen.getByRole('textbox', { name: /paste json/i })).toBeDefined();
  });

  it('clicking URL tab shows URL input', async () => {
    const user = userEvent.setup();
    renderImportPage();

    await user.click(screen.getByRole('tab', { name: /url/i }));

    expect(screen.getByRole('textbox', { name: /json url/i })).toBeDefined();
  });

  it('switching tabs clears error messages', async () => {
    const user = userEvent.setup();
    renderImportPage();

    // Trigger an error on paste tab
    await user.click(screen.getByRole('tab', { name: /paste/i }));
    await user.click(screen.getByRole('button', { name: /parse pasted json/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
    });

    // Switch tab — error should clear
    await user.click(screen.getByRole('tab', { name: /file/i }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

// ── File tab ──────────────────────────────────────────────────────────────────

describe('ImportPage — File tab', () => {
  it('renders file picker and import button area', () => {
    renderImportPage();

    expect(screen.getByText('Import Unit')).toBeDefined();
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
  });

  it('shows validation summary after selecting a valid JSON file', async () => {
    const user = userEvent.setup();
    renderImportPage();

    const file = new File([JSON.stringify(validTestJson)], 'test.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText('Test Import Unit')).toBeDefined();
    });
  });

  it('displays category count and entry count in preview', async () => {
    const user = userEvent.setup();
    renderImportPage();

    const file = new File([JSON.stringify(validTestJson)], 'test.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText('2')).toBeDefined();
      expect(screen.getByText('3')).toBeDefined();
    });
  });

  it('shows categories with entry counts in preview', async () => {
    const user = userEvent.setup();
    renderImportPage();

    const file = new File([JSON.stringify(validTestJson)], 'test.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText('Verbs')).toBeDefined();
      expect(screen.getByText('Nouns')).toBeDefined();
    });

    expect(screen.getByText('2 entries')).toBeDefined();
    expect(screen.getByText('1 entry')).toBeDefined();
  });

  it('import button writes data to IndexedDB', async () => {
    const user = userEvent.setup();
    renderImportPage();

    const file = new File([JSON.stringify(validTestJson)], 'test.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText('Test Import Unit')).toBeDefined();
    });

    await fillMetadata(user);

    const importButton = screen.getByRole('button', { name: /import unit/i });
    await user.click(importButton);

    await waitFor(async () => {
      const units = await db.units.toArray();
      expect(units).toHaveLength(1);
      expect(units[0].name).toBe('Test Import Unit');
    });

    const entries = await db.entries.toArray();
    expect(entries).toHaveLength(3);
  });

  it('shows success message after successful import', async () => {
    const user = userEvent.setup();
    renderImportPage();

    const file = new File([JSON.stringify(validTestJson)], 'test.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText('Test Import Unit')).toBeDefined();
    });

    await fillMetadata(user);

    const importButton = screen.getByRole('button', { name: /import unit/i });
    await user.click(importButton);

    await waitFor(() => {
      expect(screen.getByText('Import successful!')).toBeDefined();
    });
  });

  it('shows error message for invalid JSON', async () => {
    const user = userEvent.setup();
    renderImportPage();

    const file = new File(['{ this is not valid json }'], 'bad.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText('Import failed')).toBeDefined();
    });
  });

  it('shows error message for JSON missing required fields', async () => {
    const user = userEvent.setup();
    renderImportPage();

    const badJson = { unit: { name: 'Test' } };
    const file = new File([JSON.stringify(badJson)], 'bad.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText('Import failed')).toBeDefined();
    });
  });

  it('shows duplicate warning for existing unit name', async () => {
    const user = userEvent.setup();

    await db.units.add({
      name: 'Test Import Unit',
      description: '',
      year: 9,
      term: 'Spring',
      unitNumber: 1,
      importedAt: new Date().toISOString(),
      version: '1.0',
    });

    renderImportPage();

    const file = new File([JSON.stringify(validTestJson)], 'test.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText('Test Import Unit')).toBeDefined();
    });

    await fillMetadata(user);
    const importButton = screen.getByRole('button', { name: /import unit/i });
    await user.click(importButton);

    await waitFor(() => {
      expect(screen.getByLabelText('Duplicate unit warning')).toBeDefined();
    });

    expect(screen.getByText(/unit already exists/i)).toBeDefined();
  });

  it('replace mode re-imports and overwrites existing unit', async () => {
    const user = userEvent.setup();

    await db.units.add({
      name: 'Test Import Unit',
      description: '',
      year: 9,
      term: 'Spring',
      unitNumber: 1,
      importedAt: new Date().toISOString(),
      version: '1.0',
    });

    renderImportPage();

    const file = new File([JSON.stringify(validTestJson)], 'test.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText('Test Import Unit')).toBeDefined();
    });

    await fillMetadata(user);
    await user.click(screen.getByRole('button', { name: /import unit/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Duplicate unit warning')).toBeDefined();
    });

    await user.click(screen.getByRole('button', { name: /replace/i }));

    await waitFor(() => {
      expect(screen.getByText('Import successful!')).toBeDefined();
    });

    const units = await db.units.toArray();
    expect(units).toHaveLength(1);
  });
});

// ── Paste tab ─────────────────────────────────────────────────────────────────

describe('ImportPage — Paste tab', () => {
  it('shows error when Parse JSON is clicked with empty textarea', async () => {
    const user = userEvent.setup();
    renderImportPage();

    await user.click(screen.getByRole('tab', { name: /paste/i }));
    await user.click(screen.getByRole('button', { name: /parse pasted json/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
    });
  });

  it('shows preview after pasting valid JSON and clicking Parse', async () => {
    const user = userEvent.setup();
    renderImportPage();

    await user.click(screen.getByRole('tab', { name: /paste/i }));

    const textarea = screen.getByRole('textbox', { name: /paste json/i });
    await user.click(textarea);
    await user.paste(JSON.stringify(validTestJson));

    await user.click(screen.getByRole('button', { name: /parse pasted json/i }));

    await waitFor(() => {
      expect(screen.getByText('Test Import Unit')).toBeDefined();
    });
  });

  it('shows error for invalid JSON pasted', async () => {
    const user = userEvent.setup();
    renderImportPage();

    await user.click(screen.getByRole('tab', { name: /paste/i }));

    const textarea = screen.getByRole('textbox', { name: /paste json/i });
    await user.click(textarea);
    await user.paste('{ not valid json }');

    await user.click(screen.getByRole('button', { name: /parse pasted json/i }));

    await waitFor(() => {
      expect(screen.getByText('Import failed')).toBeDefined();
    });
  });

  it('shows error for JSON missing required fields', async () => {
    const user = userEvent.setup();
    renderImportPage();

    await user.click(screen.getByRole('tab', { name: /paste/i }));

    const textarea = screen.getByRole('textbox', { name: /paste json/i });
    await user.click(textarea);
    await user.paste(JSON.stringify({ unit: { name: 'Test' } }));

    await user.click(screen.getByRole('button', { name: /parse pasted json/i }));

    await waitFor(() => {
      expect(screen.getByText('Import failed')).toBeDefined();
    });
  });

  it('imports pasted JSON into IndexedDB after completing the preview form', async () => {
    const user = userEvent.setup();
    renderImportPage();

    await user.click(screen.getByRole('tab', { name: /paste/i }));

    const textarea = screen.getByRole('textbox', { name: /paste json/i });
    await user.click(textarea);
    await user.paste(JSON.stringify(validTestJson));

    await user.click(screen.getByRole('button', { name: /parse pasted json/i }));

    await waitFor(() => {
      expect(screen.getByText('Test Import Unit')).toBeDefined();
    });

    await fillMetadata(user);
    await user.click(screen.getByRole('button', { name: /import unit/i }));

    await waitFor(async () => {
      const units = await db.units.toArray();
      expect(units).toHaveLength(1);
      expect(units[0].name).toBe('Test Import Unit');
    });
  });
});

// ── URL tab ───────────────────────────────────────────────────────────────────

describe('ImportPage — URL tab', () => {
  it('shows URL input and Fetch button', async () => {
    const user = userEvent.setup();
    renderImportPage();

    await user.click(screen.getByRole('tab', { name: /url/i }));

    expect(screen.getByRole('textbox', { name: /json url/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /fetch json from url/i })).toBeDefined();
  });

  it('shows preview after successful URL fetch', async () => {
    const user = userEvent.setup();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(JSON.stringify(validTestJson)),
    });

    renderImportPage();

    await user.click(screen.getByRole('tab', { name: /url/i }));

    const urlInput = screen.getByRole('textbox', { name: /json url/i });
    await user.type(urlInput, 'https://example.com/unit.json');

    await user.click(screen.getByRole('button', { name: /fetch json from url/i }));

    await waitFor(() => {
      expect(screen.getByText('Test Import Unit')).toBeDefined();
    });
  });

  it('shows error on network failure', async () => {
    const user = userEvent.setup();

    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    renderImportPage();

    await user.click(screen.getByRole('tab', { name: /url/i }));

    const urlInput = screen.getByRole('textbox', { name: /json url/i });
    await user.type(urlInput, 'https://example.com/unit.json');

    await user.click(screen.getByRole('button', { name: /fetch json from url/i }));

    await waitFor(() => {
      expect(screen.getByText('Import failed')).toBeDefined();
    });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/network error/i);
  });

  it('shows error on non-ok HTTP response (404)', async () => {
    const user = userEvent.setup();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: () => Promise.resolve(''),
    });

    renderImportPage();

    await user.click(screen.getByRole('tab', { name: /url/i }));

    const urlInput = screen.getByRole('textbox', { name: /json url/i });
    await user.type(urlInput, 'https://example.com/unit.json');

    await user.click(screen.getByRole('button', { name: /fetch json from url/i }));

    await waitFor(() => {
      expect(screen.getByText('Import failed')).toBeDefined();
    });
  });

  it('shows error when URL returns invalid JSON', async () => {
    const user = userEvent.setup();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve('<html>not json</html>'),
    });

    renderImportPage();

    await user.click(screen.getByRole('tab', { name: /url/i }));

    const urlInput = screen.getByRole('textbox', { name: /json url/i });
    await user.type(urlInput, 'https://example.com/unit.json');

    await user.click(screen.getByRole('button', { name: /fetch json from url/i }));

    await waitFor(() => {
      expect(screen.getByText('Import failed')).toBeDefined();
    });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/valid json/i);
  });

  it('shows error when URL returns JSON missing required fields', async () => {
    const user = userEvent.setup();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(JSON.stringify({ unit: { name: 'Test' } })),
    });

    renderImportPage();

    await user.click(screen.getByRole('tab', { name: /url/i }));

    const urlInput = screen.getByRole('textbox', { name: /json url/i });
    await user.type(urlInput, 'https://example.com/unit.json');

    await user.click(screen.getByRole('button', { name: /fetch json from url/i }));

    await waitFor(() => {
      expect(screen.getByText('Import failed')).toBeDefined();
    });
  });

  it('saves URL to recently used after successful fetch', async () => {
    const user = userEvent.setup();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(JSON.stringify(validTestJson)),
    });

    renderImportPage();

    await user.click(screen.getByRole('tab', { name: /url/i }));

    const urlInput = screen.getByRole('textbox', { name: /json url/i });
    await user.type(urlInput, 'https://example.com/unit.json');

    await user.click(screen.getByRole('button', { name: /fetch json from url/i }));

    await waitFor(() => {
      expect(screen.getByText('Test Import Unit')).toBeDefined();
    });

    // Recent URL should appear
    await waitFor(() => {
      expect(screen.getByText('Recently used')).toBeDefined();
      expect(screen.getByRole('button', { name: /use recent url/i })).toBeDefined();
    });
  });

  it('imports URL-fetched JSON into IndexedDB after completing the preview form', async () => {
    const user = userEvent.setup();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(JSON.stringify(validTestJson)),
    });

    renderImportPage();

    await user.click(screen.getByRole('tab', { name: /url/i }));

    const urlInput = screen.getByRole('textbox', { name: /json url/i });
    await user.type(urlInput, 'https://example.com/unit.json');

    await user.click(screen.getByRole('button', { name: /fetch json from url/i }));

    await waitFor(() => {
      expect(screen.getByText('Test Import Unit')).toBeDefined();
    });

    await fillMetadata(user);
    await user.click(screen.getByRole('button', { name: /import unit/i }));

    await waitFor(async () => {
      const units = await db.units.toArray();
      expect(units).toHaveLength(1);
      expect(units[0].name).toBe('Test Import Unit');
    });
  });
});
