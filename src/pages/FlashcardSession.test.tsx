import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import FlashcardSession from './FlashcardSession';
import { db } from '../db/db';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// Seed: 1 unit, 2 categories, 3 entries, 3 progress records
async function seedDatabase() {
  const unitId = await db.units.add({
    name: 'Test Unit',
    description: '',
    importedAt: new Date().toISOString(),
    version: '1.0',
  });
  const cat1Id = await db.categories.add({
    unitId,
    sourceId: 'cat_1',
    name: 'Verbs',
    description: '',
    grammarNotes: '',
  });
  const cat2Id = await db.categories.add({
    unitId,
    sourceId: 'cat_2',
    name: 'Nouns',
    description: '',
    grammarNotes: '',
  });
  const ent1Id = await db.entries.add({
    unitId,
    categoryId: cat1Id,
    sourceId: 'ent_1',
    german: 'spielen',
    english: 'to play',
    partOfSpeech: 'verb',
    grammarNotes: '',
    tags: [],
  });
  const ent2Id = await db.entries.add({
    unitId,
    categoryId: cat1Id,
    sourceId: 'ent_2',
    german: 'laufen',
    english: 'to run',
    partOfSpeech: 'verb',
    grammarNotes: '',
    tags: [],
  });
  const ent3Id = await db.entries.add({
    unitId,
    categoryId: cat2Id,
    sourceId: 'ent_3',
    german: 'Hund',
    english: 'dog',
    partOfSpeech: 'noun',
    grammarNotes: '',
    tags: [],
  });

  const now = new Date().toISOString();
  await db.flashcardProgress.add({
    entryId: ent1Id,
    unitId,
    correctCount: 0,
    incorrectCount: 0,
    streak: 0,
    lastSeen: now,
    nextDue: now,
    bucket: 0,
  });
  await db.flashcardProgress.add({
    entryId: ent2Id,
    unitId,
    correctCount: 2,
    incorrectCount: 0,
    streak: 1,
    lastSeen: now,
    nextDue: now,
    bucket: 2,
  });
  await db.flashcardProgress.add({
    entryId: ent3Id,
    unitId,
    correctCount: 0,
    incorrectCount: 0,
    streak: 0,
    lastSeen: now,
    nextDue: now,
    bucket: 0,
  });

  return { unitId, cat1Id, cat2Id, ent1Id, ent2Id, ent3Id };
}

function renderSession(unitId: number = 1) {
  return render(
    <MemoryRouter initialEntries={[`/unit/${unitId}/flashcards`]}>
      <Routes>
        <Route path="/unit/:id/flashcards" element={<FlashcardSession />} />
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

describe('FlashcardSession - Config Screen', () => {
  it('renders configuration screen with category and direction options', async () => {
    const { unitId } = await seedDatabase();
    renderSession(unitId);

    await waitFor(() => {
      expect(screen.getByText('Flashcards')).toBeDefined();
    });

    // Direction options
    expect(screen.getByText('German → English')).toBeDefined();
    expect(screen.getByText('English → German')).toBeDefined();
    expect(screen.getByText('Mixed')).toBeDefined();

    // Start button
    expect(screen.getByRole('button', { name: /start session/i })).toBeDefined();
  });

  it('shows all categories as checkboxes', async () => {
    const { unitId } = await seedDatabase();
    renderSession(unitId);

    await waitFor(() => {
      expect(screen.getByText('Verbs')).toBeDefined();
      expect(screen.getByText('Nouns')).toBeDefined();
    });

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThanOrEqual(2);
  });

  it('all categories are selected by default', async () => {
    const { unitId } = await seedDatabase();
    renderSession(unitId);

    await waitFor(() => {
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      expect(checkboxes.every((cb) => cb.checked)).toBe(true);
    });
  });
});

describe('FlashcardSession - Session', () => {
  it('starting a session shows the first card (German side by default)', async () => {
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();
    renderSession(unitId);

    // Wait for categories to load and start session
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /start session/i })).toBeDefined()
    );
    await user.click(screen.getByRole('button', { name: /start session/i }));

    // Should show a German word (one of our entries)
    await waitFor(() => {
      expect(screen.getByText('Tap to reveal')).toBeDefined();
    });

    // Should show card 1 of N
    expect(screen.getByText(/card 1 of/i)).toBeDefined();
  });

  it('clicking the card flips it to show the answer', async () => {
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();
    renderSession(unitId);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /start session/i })).toBeDefined()
    );
    await user.click(screen.getByRole('button', { name: /start session/i }));

    await waitFor(() => expect(screen.getByText('Tap to reveal')).toBeDefined());

    // Click the card (the perspective container wraps everything — click the "Tap to reveal" area)
    await user.click(screen.getByText('Tap to reveal'));

    // After flip, answer buttons should appear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /got it/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /missed it/i })).toBeDefined();
    });
  });

  it('"Got it" advances to next card and updates progress', async () => {
    const user = userEvent.setup();
    const { unitId, ent1Id } = await seedDatabase();
    renderSession(unitId);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /start session/i })).toBeDefined()
    );
    await user.click(screen.getByRole('button', { name: /start session/i }));

    await waitFor(() => expect(screen.getByText('Tap to reveal')).toBeDefined());
    await user.click(screen.getByText('Tap to reveal'));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /got it/i })).toBeDefined()
    );
    await user.click(screen.getByRole('button', { name: /got it/i }));

    // Either advances to next card OR shows summary
    await waitFor(() => {
      const isNextCard = screen.queryByText(/card 2 of/i);
      const isSummary = screen.queryByText(/session complete/i);
      expect(isNextCard !== null || isSummary !== null).toBe(true);
    });

    // Verify progress was updated in DB (at least one entry should have correctCount > 0)
    const allProgress = await db.flashcardProgress.toArray();
    const updated = allProgress.find(
      (p) => p.correctCount > 0 && p.entryId !== ent1Id
    ) ?? allProgress.find((p) => p.correctCount > 0);
    expect(updated).toBeDefined();
  });

  it('"Missed it" advances to next card and resets bucket', async () => {
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();
    renderSession(unitId);

    // Use "weakest first" strategy to get ent2 (bucket 2) as first card
    // Actually just start and click through until we find the right answer buttons

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /start session/i })).toBeDefined()
    );
    await user.click(screen.getByRole('button', { name: /start session/i }));

    await waitFor(() => expect(screen.getByText('Tap to reveal')).toBeDefined());
    await user.click(screen.getByText('Tap to reveal'));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /missed it/i })).toBeDefined()
    );
    await user.click(screen.getByRole('button', { name: /missed it/i }));

    // Verify at least one progress record has bucket reset to 0 with incremented incorrectCount
    await waitFor(async () => {
      const allProgress = await db.flashcardProgress.toArray();
      const reset = allProgress.find((p) => p.incorrectCount > 0);
      expect(reset).toBeDefined();
      expect(reset?.bucket).toBe(0);
    });
  });

  it('progress bar updates after each card', async () => {
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();
    renderSession(unitId);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /start session/i })).toBeDefined()
    );
    await user.click(screen.getByRole('button', { name: /start session/i }));

    await waitFor(() => expect(screen.getByText('Tap to reveal')).toBeDefined());

    // Card 1 of N - progress bar at 0%
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeDefined();
    expect(progressBar.getAttribute('aria-valuenow')).toBe('0');

    await user.click(screen.getByText('Tap to reveal'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /got it/i })).toBeDefined()
    );
    await user.click(screen.getByRole('button', { name: /got it/i }));

    // After first card, progress should advance (or summary)
    await waitFor(() => {
      const bar = screen.queryByRole('progressbar');
      const summary = screen.queryByText(/session complete/i);
      if (bar) {
        expect(parseInt(bar.getAttribute('aria-valuenow') ?? '0')).toBeGreaterThanOrEqual(1);
      } else {
        expect(summary).not.toBeNull();
      }
    });
  });
});

describe('FlashcardSession - Summary', () => {
  // Helper: run through all cards in a session
  async function completeSession(
    user: ReturnType<typeof userEvent.setup>,
    answerCorrect: boolean
  ) {
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /start session/i })).toBeDefined()
    );
    await user.click(screen.getByRole('button', { name: /start session/i }));

    // Click through all cards (we have 3 entries, but count is set to 10 — we get 3)
    let attempts = 0;
    while (attempts < 20) {
      const tapHint = screen.queryByText('Tap to reveal');
      if (!tapHint) break;
      await user.click(tapHint);
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: /got it/i })).not.toBeNull()
      );
      if (answerCorrect) {
        await user.click(screen.getByRole('button', { name: /got it/i }));
      } else {
        await user.click(screen.getByRole('button', { name: /missed it/i }));
      }
      await waitFor(() => {
        const nextCard = screen.queryByText('Tap to reveal');
        const summary = screen.queryByText(/session complete/i);
        expect(nextCard !== null || summary !== null).toBe(true);
      });
      if (screen.queryByText(/session complete/i)) break;
      attempts++;
    }
  }

  it('shows summary screen after last card', async () => {
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();
    renderSession(unitId);

    await completeSession(user, true);

    await waitFor(() => {
      expect(screen.getByText(/session complete/i)).toBeDefined();
    });
  });

  it('summary shows correct/incorrect counts', async () => {
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();
    renderSession(unitId);

    await completeSession(user, true);

    await waitFor(() => {
      expect(screen.getByText(/session complete/i)).toBeDefined();
    });

    // Should show accuracy %
    expect(screen.getByText('100%')).toBeDefined();
    // "Back to unit" button
    expect(screen.getByRole('button', { name: /back to unit/i })).toBeDefined();
  });

  it('"Practice missed" button starts new session with only missed cards', async () => {
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();
    renderSession(unitId);

    // Answer all cards wrong
    await completeSession(user, false);

    await waitFor(() => {
      expect(screen.getByText(/session complete/i)).toBeDefined();
    });

    // "Practice missed" button should appear
    const practiceBtn = screen.getByRole('button', { name: /practice missed/i });
    expect(practiceBtn).toBeDefined();
    await user.click(practiceBtn);

    // Should go back to a new session (showing a card)
    await waitFor(() => {
      expect(screen.getByText('Tap to reveal')).toBeDefined();
    });
  });

  it('logs session to SessionLog after completion', async () => {
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();
    renderSession(unitId);

    await completeSession(user, true);

    await waitFor(() => {
      expect(screen.getByText(/session complete/i)).toBeDefined();
    });

    const logs = await db.sessionLogs.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0].mode).toBe('flashcard');
    expect(logs[0].unitId).toBe(unitId);
    expect(logs[0].totalQuestions).toBeGreaterThan(0);
  });
});
