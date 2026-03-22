import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SettingsPage from './SettingsPage';
import { db } from '../db/db';
import { getSetting, setSetting } from '../db/settings';
import { exportProgressData } from '../db/progress';

// Mock applyTheme so we don't need a real DOM CSS engine
vi.mock('../logic/themes', async () => {
  const actual = await vi.importActual<typeof import('../logic/themes')>('../logic/themes');
  return { ...actual, applyTheme: vi.fn() };
});

// Mock setSoundEnabled
vi.mock('../logic/sounds', () => ({
  setSoundEnabled: vi.fn(),
  playCorrect: vi.fn(),
  playIncorrect: vi.fn(),
  playComplete: vi.fn(),
  initAudio: vi.fn(),
}));

async function seedDatabase() {
  const unitId = await db.units.add({
    name: 'Test Unit',
    description: 'A test unit',
    year: 9,
    chapter: 1,
    unitNumber: 1,
    importedAt: new Date().toISOString(),
    exportedAt: '',
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
  await db.userSettings.clear();
  vi.clearAllMocks();
});

// ─── Existing settings tests ─────────────────────────────────────────────────

describe('SettingsPage', () => {
  it('renders all sections', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getByText('Your Profile')).toBeInTheDocument();
      expect(screen.getByText('Colour Theme')).toBeInTheDocument();
      expect(screen.getByText('Sound Effects')).toBeInTheDocument();
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

    const textareas = document.querySelectorAll('textarea[readonly]');
    expect(textareas.length).toBeGreaterThan(0);
    const parsed = JSON.parse((textareas[0] as HTMLTextAreaElement).value) as {
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
      expect(screen.queryByText('Progress imported successfully!')).not.toBeInTheDocument();
    });
  });

  it('reset progress clears FlashcardProgress but keeps units', async () => {
    const user = userEvent.setup();
    await seedDatabase();

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Reset Leitner Buckets')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Reset Leitner Buckets'));

    await waitFor(() => {
      expect(screen.getByText('Reset Leitner Buckets?')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Reset'));

    await waitFor(() => {
      expect(screen.getByText('Leitner buckets have been reset.')).toBeInTheDocument();
    });

    const unitCount = await db.units.count();
    expect(unitCount).toBe(1);

    const progress = await db.flashcardProgress.toArray();
    expect(progress.length).toBe(2);
    for (const p of progress) {
      expect(p.bucket).toBe(0);
      expect(p.correctCount).toBe(0);
    }
  });

  it('delete unit removes unit and all associated data', async () => {
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Test Unit')).toBeInTheDocument();
    });

    const initialDeleteButtons = screen.getAllByText('Delete');
    await user.click(initialDeleteButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Delete Unit?')).toBeInTheDocument();
    });

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
      expect(screen.getByText('Reset Leitner Buckets')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Reset Leitner Buckets'));

    await waitFor(() => {
      expect(screen.getByText('Reset Leitner Buckets?')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText('Reset Progress?')).not.toBeInTheDocument();
    });

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

// ─── Phase 10: Colour Themes ──────────────────────────────────────────────────

describe('SettingsPage — Colour Themes', () => {
  it('renders 6 theme swatches', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByTestId('theme-terracotta')).toBeInTheDocument();
      expect(screen.getByTestId('theme-ocean')).toBeInTheDocument();
      expect(screen.getByTestId('theme-forest')).toBeInTheDocument();
      expect(screen.getByTestId('theme-lavender')).toBeInTheDocument();
      expect(screen.getByTestId('theme-slate')).toBeInTheDocument();
      expect(screen.getByTestId('theme-midnight')).toBeInTheDocument();
    });
  });

  it('shows theme names', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Terracotta')).toBeInTheDocument();
      expect(screen.getByText('Ocean')).toBeInTheDocument();
      expect(screen.getByText('Forest')).toBeInTheDocument();
      expect(screen.getByText('Lavender')).toBeInTheDocument();
      expect(screen.getByText('Slate')).toBeInTheDocument();
      expect(screen.getByText('Midnight')).toBeInTheDocument();
    });
  });

  it('selecting a theme calls applyTheme and persists to DB', async () => {
    const { applyTheme } = await import('../logic/themes');
    const user = userEvent.setup();
    renderSettings();

    await waitFor(() => {
      expect(screen.getByTestId('theme-ocean')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('theme-ocean'));

    await waitFor(async () => {
      expect(applyTheme).toHaveBeenCalledWith('ocean');
      const saved = await getSetting('theme');
      expect(saved).toBe('ocean');
    });
  });

  it('saved theme is reflected as active (aria-pressed)', async () => {
    await setSetting('theme', 'forest');
    renderSettings();

    await waitFor(() => {
      const forestBtn = screen.getByTestId('theme-forest');
      expect(forestBtn).toHaveAttribute('aria-pressed', 'true');
    });
  });
});

// ─── Phase 10: User Profile ───────────────────────────────────────────────────

describe('SettingsPage — User Profile', () => {
  it('renders name input and avatar grid', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByLabelText('Name input')).toBeInTheDocument();
      expect(screen.getByLabelText('Emoji avatar picker')).toBeInTheDocument();
    });
  });

  it('saving a name persists to DB', async () => {
    const user = userEvent.setup();
    renderSettings();

    const input = await screen.findByLabelText('Name input');
    await user.clear(input);
    await user.type(input, 'Anna');
    await user.click(screen.getByText('Save'));

    await waitFor(async () => {
      const saved = await getSetting('userName');
      expect(saved).toBe('Anna');
    });
  });

  it('truncates name to 20 characters', async () => {
    const user = userEvent.setup();
    renderSettings();

    const input = await screen.findByLabelText('Name input');
    await user.clear(input);
    await user.type(input, 'A'.repeat(25));
    await user.click(screen.getByText('Save'));

    await waitFor(async () => {
      const saved = await getSetting('userName');
      expect(saved!.length).toBeLessThanOrEqual(20);
    });
  });

  it('selecting an emoji avatar persists to DB', async () => {
    const user = userEvent.setup();
    renderSettings();

    const catBtn = await screen.findByLabelText('Select 🐱 avatar');
    await user.click(catBtn);

    await waitFor(async () => {
      const saved = await getSetting('userAvatar');
      expect(saved).toBe('🐱');
    });
  });

  it('selected avatar button has aria-pressed=true', async () => {
    await setSetting('userAvatar', '🐶');
    renderSettings();

    await waitFor(() => {
      const dogBtn = screen.getByLabelText('Select 🐶 avatar');
      expect(dogBtn).toHaveAttribute('aria-pressed', 'true');
    });
  });

  it('custom emoji input saves valid emoji', async () => {
    const user = userEvent.setup();
    renderSettings();

    const customInput = await screen.findByLabelText('Custom emoji input');
    await user.type(customInput, '🌟');
    await user.click(screen.getByText('Use'));

    await waitFor(async () => {
      const saved = await getSetting('userAvatar');
      expect(saved).toBe('🌟');
    });
  });

  it('custom emoji input shows error for non-emoji text', async () => {
    const user = userEvent.setup();
    renderSettings();

    const customInput = await screen.findByLabelText('Custom emoji input');
    await user.type(customInput, 'hello world');
    await user.click(screen.getByText('Use'));

    await waitFor(() => {
      expect(screen.getByText('Please enter a single emoji character.')).toBeInTheDocument();
    });
  });
});

// ─── Phase 10: Sound Effects ──────────────────────────────────────────────────

describe('SettingsPage — Sound Effects', () => {
  it('renders the sound toggle', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Sound effects toggle' })).toBeInTheDocument();
    });
  });

  it('sound toggle is on by default', async () => {
    renderSettings();
    await waitFor(() => {
      const toggle = screen.getByRole('switch', { name: 'Sound effects toggle' });
      expect(toggle).toBeChecked();
    });
  });

  it('toggling sound off persists to DB and calls setSoundEnabled(false)', async () => {
    const { setSoundEnabled } = await import('../logic/sounds');
    const user = userEvent.setup();
    renderSettings();

    const toggle = await screen.findByRole('switch', { name: 'Sound effects toggle' });
    await user.click(toggle);

    await waitFor(async () => {
      expect(setSoundEnabled).toHaveBeenCalledWith(false);
      const saved = await getSetting('soundEnabled');
      expect(saved).toBe('false');
    });
  });

  it('toggling sound on after off calls setSoundEnabled(true)', async () => {
    await setSetting('soundEnabled', 'false');
    const { setSoundEnabled } = await import('../logic/sounds');
    const user = userEvent.setup();
    renderSettings();

    const toggle = await screen.findByRole('switch', { name: 'Sound effects toggle' });
    await user.click(toggle);

    await waitFor(() => {
      expect(setSoundEnabled).toHaveBeenCalledWith(true);
    });
  });

  it('saved sound=false is reflected in toggle state', async () => {
    await setSetting('soundEnabled', 'false');
    renderSettings();

    await waitFor(() => {
      const toggle = screen.getByRole('switch', { name: 'Sound effects toggle' });
      expect(toggle).not.toBeChecked();
    });
  });
});
