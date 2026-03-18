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
});

describe('ImportPage', () => {
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
      // Category count
      expect(screen.getByText('2')).toBeDefined();
      // Entry count
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

    // Verbs has 2 entries
    expect(screen.getByText('2 entries')).toBeDefined();
    // Nouns has 1 entry
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

    const badJson = { unit: { name: 'Test' } }; // missing categories and entries
    const file = new File([JSON.stringify(badJson)], 'bad.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText('Import failed')).toBeDefined();
    });
  });

  it('shows duplicate warning for existing unit name', async () => {
    const user = userEvent.setup();

    // Import first time directly
    await db.units.add({
      name: 'Test Import Unit',
      description: '',
      importedAt: new Date().toISOString(),
      version: '1.0',
    });

    renderImportPage();

    const file = new File([JSON.stringify(validTestJson)], 'test.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, file);

    // Preview shows up first
    await waitFor(() => {
      expect(screen.getByText('Test Import Unit')).toBeDefined();
    });

    // Click import
    const importButton = screen.getByRole('button', { name: /import unit/i });
    await user.click(importButton);

    // Duplicate warning should appear
    await waitFor(() => {
      expect(screen.getByLabelText('Duplicate unit warning')).toBeDefined();
    });

    expect(screen.getByText(/unit already exists/i)).toBeDefined();
  });

  it('replace mode re-imports and overwrites existing unit', async () => {
    const user = userEvent.setup();

    // Import first time
    await db.units.add({
      name: 'Test Import Unit',
      description: '',
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

    await user.click(screen.getByRole('button', { name: /import unit/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Duplicate unit warning')).toBeDefined();
    });

    // Click Replace
    await user.click(screen.getByRole('button', { name: /replace/i }));

    await waitFor(() => {
      expect(screen.getByText('Import successful!')).toBeDefined();
    });

    // Only one unit should exist
    const units = await db.units.toArray();
    expect(units).toHaveLength(1);
  });
});
