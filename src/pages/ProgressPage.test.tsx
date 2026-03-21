import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProgressPage from './ProgressPage';
import { db } from '../db/db';

async function seedDatabase() {
  const unitId = await db.units.add({
    name: 'Test Unit',
    description: '',
    year: 9,
    chapter: 1,
    unitNumber: 1,
    importedAt: new Date().toISOString(),
    version: '1.0',
  });
  const unit2Id = await db.units.add({
    name: 'Second Unit',
    description: '',
    year: 9,
    chapter: 1,
    unitNumber: 2,
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

  const startedAt = new Date(Date.now() - 600_000).toISOString();
  const endedAt = new Date().toISOString();

  await db.sessionLogs.add({
    unitId,
    mode: 'flashcard',
    startedAt,
    endedAt,
    totalQuestions: 10,
    correctAnswers: 8,
    entryIds: [ent1Id, ent2Id],
  });
  await db.sessionLogs.add({
    unitId,
    mode: 'cloze',
    startedAt,
    endedAt,
    totalQuestions: 5,
    correctAnswers: 3,
    entryIds: [ent1Id],
  });

  return { unitId, unit2Id, ent1Id, ent2Id };
}

function renderProgress() {
  return render(
    <MemoryRouter>
      <ProgressPage />
    </MemoryRouter>
  );
}

afterEach(async () => {
  await db.units.clear();
  await db.categories.clear();
  await db.entries.clear();
  await db.flashcardProgress.clear();
  await db.sessionLogs.clear();
});

describe('ProgressPage', () => {
  it('renders overall stats from SessionLog data', async () => {
    await seedDatabase();
    renderProgress();

    // Wait for the page to load
    await waitFor(() => {
      expect(screen.getByText('Progress')).toBeInTheDocument();
    });

    // Total cards (entries with progress) and sessions (both = 2)
    await waitFor(() => {
      const allTwos = screen.getAllByText('2');
      expect(allTwos.length).toBeGreaterThanOrEqual(2);
    });

    // Accuracy: (8+3)/(10+5) = 11/15 = 73%
    await waitFor(() => {
      expect(screen.getByText('73%')).toBeInTheDocument();
    });
  });

  it('shows per-unit breakdown', async () => {
    await seedDatabase();
    renderProgress();

    await waitFor(() => {
      expect(screen.getByText('Test Unit')).toBeInTheDocument();
    });

    // Second unit has no progress
    await waitFor(() => {
      expect(screen.getByText('Second Unit')).toBeInTheDocument();
    });
  });

  it('shows bucket distribution', async () => {
    await seedDatabase();
    renderProgress();

    await waitFor(() => {
      expect(screen.getByText('Leitner Buckets by Unit')).toBeInTheDocument();
    });

    // Bucket bar should be rendered for unit with progress
    await waitFor(() => {
      expect(screen.getByLabelText('bucket distribution')).toBeInTheDocument();
    });
  });

  it('shows session history', async () => {
    await seedDatabase();
    renderProgress();

    await waitFor(() => {
      expect(screen.getByText('Session History')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Flashcards')).toBeInTheDocument();
      expect(screen.getByText('Cloze')).toBeInTheDocument();
    });

    // Scores shown as correct/total
    await waitFor(() => {
      expect(screen.getByText('8/10')).toBeInTheDocument();
      expect(screen.getByText('3/5')).toBeInTheDocument();
    });
  });

  it('shows empty state when no sessions yet', async () => {
    await db.units.add({
      name: 'Empty Unit',
      description: '',
      year: 9,
      chapter: 2,
      unitNumber: 1,
      importedAt: new Date().toISOString(),
      version: '1.0',
    });
    renderProgress();

    await waitFor(() => {
      expect(screen.getByText('No sessions yet.')).toBeInTheDocument();
    });
  });

  it('shows empty state when no units imported', async () => {
    renderProgress();

    await waitFor(() => {
      expect(screen.getByText('No units imported yet.')).toBeInTheDocument();
    });
  });
});
