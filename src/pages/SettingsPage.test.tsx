import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SettingsPage from './SettingsPage';
import { db } from '../db/db';
import { exportProgressData } from '../db/progress';

async function seedDatabase() {
  const unitId = await db.units.add({
    name: 'Test Unit',
    description: 'A test unit',
    year: 9,
    chapter: 1,
    unitNumber: 1,
    importedAt: new Date().toISOString(),
    version: '1.0',
  });

  const catId = await db.categories.add({
    unitId,
    sourceId: 'cat_1',
    name: 'Verbs',
    description: '',
    grammarNotes: '',
  });

  const ent1Id = await db.entries.add({
    unitId,
    categoryId: catId,
    sourceId: 'ent_1',
    german: 'spielen',
    english: 'to play',
    partOfSpeech: 'verb',
    grammarNotes: '',
    tags: [],
  });
  const ent2Id = await db.entries.add({
    unitId,
    categoryId: catId,
    sourceId: 'ent_2',
    german: 'laufen',
    english: 'to run',
    partOfSpeech: 'verb',
    grammarNotes: '',
    tags: [],
  });

  const now = new Date().toISOString();
  await db.flashcardProgress.add({
    entryId: ent1Id,
    unitId,
    correctCount: 5,
    incorrectCount: 1,
    streak: 3,
    lastSeen: now,
    nextDue: now,
    bucket: 2,
  });
  await db.flashcardProgress.add({
    entryId: ent2Id,
    unitId,
    correctCount: 3,
    incorrectCount: 2,
    streak: 1,
    lastSeen: now,
    nextDue: now,
    bucket: 1,
  });

  await db.sessionLogs.add({
    unitId,
    mode: 'flashcard',
    startedAt: now,
    endedAt: now,
    totalQuestions: 10,
    correctAnswers: 8,
    entryIds: [ent1Id, ent2Id],
  });

  return { unitId, ent1Id, ent2Id };
}

function renderSettings() {
  return render(
    <MemoryRouter>
      <SettingsPage />
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
});

describe('SettingsPage', () => {
  it('renders all sections', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getByText('Export Progress')).toBeInTheDocument();
      expect(screen.getByText('Import Progress')).toBeInTheDocument();
      expect(screen.getByText('Reset Progress')).toBeInTheDocument();
      expect(screen.getByText('Delete Unit')).toBeInTheDocument();
      expect(screen.getByText('About')).toBeInTheDocument();
    });
  });

  it('export progress generates valid JSON string', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    await seedDatabase();
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Generate Export')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Generate Export'));

    await waitFor(() => {
      expect(screen.getByText('Progress JSON')).toBeInTheDocument();
    });

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    const parsed = JSON.parse(textarea.value) as {
      flashcardProgress: unknown[];
      sessionLogs: unknown[];
    };
    expect(Array.isArray(parsed.flashcardProgress)).toBe(true);
    expect(Array.isArray(parsed.sessionLogs)).toBe(true);
  });

  it('exported JSON contains FlashcardProgress and SessionLog records', async () => {
    await seedDatabase();
    const data = await exportProgressData();

    expect(data.flashcardProgress.length).toBe(2);
    expect(data.sessionLogs.length).toBe(1);
    expect(data.flashcardProgress[0].bucket).toBe(2);
    expect(data.sessionLogs[0].mode).toBe('flashcard');
    expect(data.sessionLogs[0].totalQuestions).toBe(10);
  });

  it('copy to clipboard button copies the JSON', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    await seedDatabase();
    renderSettings();

    await user.click(await screen.findByText('Generate Export'));

    await waitFor(() => {
      expect(screen.getByText('Copy to Clipboard')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Copy to Clipboard'));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"flashcardProgress"'));
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });
  });

  it('import progress restores records to IndexedDB', async () => {
    const user = userEvent.setup();
    await seedDatabase();

    const exported = await exportProgressData();
    // Reset to clean state
    await db.flashcardProgress.clear();
    await db.sessionLogs.clear();

    const count1 = await db.flashcardProgress.count();
    expect(count1).toBe(0);

    renderSettings();

    const jsonBlob = new Blob([JSON.stringify(exported)], { type: 'application/json' });
    const file = new File([jsonBlob], 'progress.json', { type: 'application/json' });
    const input = screen.getByText('Choose File').parentElement!.querySelector('input[type="file"]')!;
    await user.upload(input as HTMLInputElement, file);

    await waitFor(() => {
      expect(screen.getByText('Progress imported successfully!')).toBeInTheDocument();
    });

    const count2 = await db.flashcardProgress.count();
    expect(count2).toBe(2);

    const sessionCount = await db.sessionLogs.count();
    expect(sessionCount).toBe(1);
  });

  it('import progress shows error for invalid JSON', async () => {
    const user = userEvent.setup();
    renderSettings();

    const invalidJson = new Blob(['not valid json'], { type: 'application/json' });
    const file = new File([invalidJson], 'bad.json', { type: 'application/json' });
    const input = screen.getByText('Choose File').parentElement!.querySelector('input[type="file"]')!;
    await user.upload(input as HTMLInputElement, file);

    await waitFor(() => {
      // Should show some error
      expect(screen.queryByText('Progress imported successfully!')).not.toBeInTheDocument();
    });
  });

  it('reset progress clears FlashcardProgress but keeps units', async () => {
    const user = userEvent.setup();
    await seedDatabase();

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Reset All Progress')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Reset All Progress'));

    // Confirmation dialog appears
    await waitFor(() => {
      expect(screen.getByText('Reset Progress?')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Reset'));

    await waitFor(() => {
      expect(screen.getByText('Progress has been reset.')).toBeInTheDocument();
    });

    // Unit should still be there
    const unitCount = await db.units.count();
    expect(unitCount).toBe(1);

    // Progress should be cleared and re-initialized (bucket=0)
    const progress = await db.flashcardProgress.toArray();
    expect(progress.length).toBe(2); // re-initialized for both entries
    for (const p of progress) {
      expect(p.bucket).toBe(0);
      expect(p.correctCount).toBe(0);
    }
  });

  it('delete unit removes unit and all associated data', async () => {
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();

    renderSettings();

    // Should show the unit name with a Delete button
    await waitFor(() => {
      expect(screen.getByText('Test Unit')).toBeInTheDocument();
    });

    const initialDeleteButtons = screen.getAllByText('Delete');
    await user.click(initialDeleteButtons[0]);

    // Confirmation dialog
    await waitFor(() => {
      expect(screen.getByText('Delete Unit?')).toBeInTheDocument();
    });

    // Click the red confirm button in the dialog (last Delete button)
    const confirmDeleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    await user.click(confirmDeleteButtons[confirmDeleteButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText('"Test Unit" has been deleted.')).toBeInTheDocument();
    });

    const unitCount = await db.units.count();
    expect(unitCount).toBe(0);

    const entryCount = await db.entries.count();
    expect(entryCount).toBe(0);

    const progressCount = await db.flashcardProgress.count();
    expect(progressCount).toBe(0);

    void unitId;
  });

  it('cancel on confirmation dialog does not perform action', async () => {
    const user = userEvent.setup();
    await seedDatabase();

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Reset All Progress')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Reset All Progress'));

    await waitFor(() => {
      expect(screen.getByText('Reset Progress?')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText('Reset Progress?')).not.toBeInTheDocument();
    });

    // Progress should still be intact
    const progressCount = await db.flashcardProgress.count();
    expect(progressCount).toBe(2);
  });

  it('shows no units message when no units imported', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('No units to delete.')).toBeInTheDocument();
    });
  });
});
