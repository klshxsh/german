import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ClozeSession from './ClozeSession';
import { db } from '../db/db';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

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

  const cat1Id = await db.categories.add({
    unitId, sourceId: 'cat_1', name: 'Verbs', description: '', grammarNotes: '',
  });

  const cat2Id = await db.categories.add({
    unitId, sourceId: 'cat_2', name: 'Nouns', description: '', grammarNotes: '',
  });

  const verbId = await db.entries.add({
    unitId, categoryId: cat1Id, sourceId: 'ent_1',
    german: 'spiele', english: 'play', partOfSpeech: 'verb', grammarNotes: '', tags: [],
  });

  const nounId = await db.entries.add({
    unitId, categoryId: cat2Id, sourceId: 'ent_2',
    german: 'Tennis', english: 'tennis', partOfSpeech: 'noun', grammarNotes: '', tags: [],
  });

  // Verb distractors (same category)
  await db.entries.add({ unitId, categoryId: cat1Id, sourceId: 'ent_3', german: 'laufe', english: 'run', partOfSpeech: 'verb', grammarNotes: '', tags: [] });
  await db.entries.add({ unitId, categoryId: cat1Id, sourceId: 'ent_4', german: 'schwimme', english: 'swim', partOfSpeech: 'verb', grammarNotes: '', tags: [] });
  await db.entries.add({ unitId, categoryId: cat1Id, sourceId: 'ent_5', german: 'singe', english: 'sing', partOfSpeech: 'verb', grammarNotes: '', tags: [] });

  // Noun distractors
  await db.entries.add({ unitId, categoryId: cat2Id, sourceId: 'ent_6', german: 'Fußball', english: 'football', partOfSpeech: 'noun', grammarNotes: '', tags: [] });
  await db.entries.add({ unitId, categoryId: cat2Id, sourceId: 'ent_7', german: 'Musik', english: 'music', partOfSpeech: 'noun', grammarNotes: '', tags: [] });

  const tplId = await db.sentenceTemplates.add({
    unitId, sourceId: 'tpl_1',
    pattern: '{subject} {verb} {object}', slots: ['subject', 'verb', 'object'], description: '',
  });

  const sent1Id = await db.generatedSentences.add({
    unitId, templateId: tplId,
    german: 'Ich spiele Tennis.', english: 'I play tennis.',
    complexity: 'simple', usedEntryIds: [verbId, nounId],
  });

  const sent2Id = await db.generatedSentences.add({
    unitId, templateId: tplId,
    german: 'Ich spiele Tennis.', english: 'I play tennis.',
    complexity: 'simple', usedEntryIds: [verbId, nounId],
  });

  return { unitId, cat1Id, cat2Id, verbId, nounId, sent1Id, sent2Id };
}

function renderCloze(unitId: number = 1) {
  return render(
    <MemoryRouter initialEntries={[`/unit/${unitId}/cloze`]}>
      <Routes>
        <Route path="/unit/:id/cloze" element={<ClozeSession />} />
        <Route path="/unit/:id" element={<div>Unit Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

// Always restore real timers after each test so fake timers can't bleed through
afterEach(async () => {
  vi.useRealTimers();
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

// Helper: render config screen and start a session with blankType='verbs' (MC by default)
// This makes the correct answer predictably 'spiele'
async function startSession(user: ReturnType<typeof userEvent.setup>, unitId: number) {
  renderCloze(unitId);
  await waitFor(() => expect(screen.getByText('Cloze Tests')).toBeDefined());
  await user.click(screen.getByRole('radio', { name: /^verbs$/i }));
  await user.click(screen.getByRole('button', { name: /start session/i }));
  await waitFor(() => expect(screen.getByText(/fill in the blank/i)).toBeDefined());
}

// Helper: click through an entire session by always clicking wrong answers
// Uses queryAllByRole to find options and clicks the first non-correct one
async function completeSessionWithWrongAnswers(
  user: ReturnType<typeof userEvent.setup>,
  unitId: number
) {
  renderCloze(unitId);
  await waitFor(() => expect(screen.getByText('Cloze Tests')).toBeDefined());
  await user.click(screen.getByRole('radio', { name: /^verbs$/i }));
  await user.click(screen.getByRole('button', { name: /start session/i }));
  await waitFor(() => expect(screen.getByText(/fill in the blank/i)).toBeDefined());

  for (let i = 0; i < 25; i++) {
    if (screen.queryByText(/session complete/i)) break;

    // If Next/See Results is available, click it
    const nextBtn = screen.queryByRole('button', { name: /^(next|see results)$/i });
    if (nextBtn) {
      await user.click(nextBtn);
      continue;
    }

    // Click a wrong option (not 'spiele')
    const optionBtns = screen.queryAllByRole('button', { name: /^option-/i });
    const wrongBtn = optionBtns.find((btn) => btn.textContent?.trim() !== 'spiele');
    if (wrongBtn) {
      await user.click(wrongBtn);
    }
    // Don't increment without progress — the next iteration will find the Next button
  }

  await waitFor(() => expect(screen.getByText(/session complete/i)).toBeDefined(), { timeout: 5000 });
}

// ── Config Screen ─────────────────────────────────────────────────────────────

describe('ClozeSession — Config Screen', () => {
  it('renders config screen with blank type options', async () => {
    const { unitId } = await seedDatabase();
    renderCloze(unitId);

    await waitFor(() => expect(screen.getByText('Cloze Tests')).toBeDefined());
    expect(screen.getByText('What to blank')).toBeDefined();
    expect(screen.getByText('Mixed')).toBeDefined();
    expect(screen.getByText('Verbs')).toBeDefined();
    expect(screen.getByText('Vocabulary')).toBeDefined();
    expect(screen.getByText('Qualifiers')).toBeDefined();
    expect(screen.getByText('Connectives')).toBeDefined();
  });

  it('renders mode selection (multiple choice / free typing)', async () => {
    const { unitId } = await seedDatabase();
    renderCloze(unitId);

    await waitFor(() => expect(screen.getByText('Answer mode')).toBeDefined());
    expect(screen.getByText(/multiple choice/i)).toBeDefined();
    expect(screen.getByText(/free typing/i)).toBeDefined();
  });
});

// ── Session Screen — Multiple Choice ─────────────────────────────────────────

describe('ClozeSession — Multiple Choice', () => {
  it('renders sentence with blank', async () => {
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();
    await startSession(user, unitId);

    expect(screen.getByText(/___/)).toBeDefined();
  });

  it('renders English translation below', async () => {
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();
    await startSession(user, unitId);

    expect(screen.getByText('I play tennis.')).toBeDefined();
  });

  it('multiple choice mode shows 4 option buttons', async () => {
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();
    await startSession(user, unitId);

    const optionBtns = screen.getAllByRole('button', { name: /^option-/i });
    expect(optionBtns.length).toBe(4);
  });

  it('selecting correct option shows green feedback', async () => {
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();
    await startSession(user, unitId);

    // blankType='verbs' → correct answer is always 'spiele'
    const correctBtn = screen.getByRole('button', { name: 'option-spiele' });
    await user.click(correctBtn);

    await waitFor(() => expect(screen.getByText(/correct/i)).toBeDefined());
  });

  it('selecting wrong option shows red feedback and correct answer', async () => {
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();
    await startSession(user, unitId);

    // Click a wrong option (not 'spiele')
    const optionBtns = screen.getAllByRole('button', { name: /^option-/i });
    const wrongBtn = optionBtns.find((btn) => btn.textContent?.trim() !== 'spiele');
    expect(wrongBtn).toBeDefined();
    await user.click(wrongBtn!);

    await waitFor(() => expect(screen.getByText(/not quite/i)).toBeDefined());
    // The "Correct answer:" label should now be visible
    expect(screen.getByText(/correct answer/i)).toBeDefined();
  });

  it('shows "Next" button after incorrect answer', async () => {
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();
    await startSession(user, unitId);

    const optionBtns = screen.getAllByRole('button', { name: /^option-/i });
    const wrongBtn = optionBtns.find((btn) => btn.textContent?.trim() !== 'spiele');
    await user.click(wrongBtn!);

    await waitFor(() => expect(screen.getByRole('button', { name: /next|see results/i })).toBeDefined());
  });

  it('auto-advances after correct answer', async () => {
    // Use real timers — just wait up to 3s for the auto-advance to fire
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();

    renderCloze(unitId);
    await waitFor(() => expect(screen.getByText('Cloze Tests')).toBeDefined());
    await user.click(screen.getByRole('radio', { name: /^verbs$/i }));
    await user.click(screen.getByRole('button', { name: /start session/i }));
    await waitFor(() => expect(screen.getByText(/fill in the blank/i)).toBeDefined());

    // Click correct answer
    const correctBtn = screen.getByRole('button', { name: 'option-spiele' });
    await user.click(correctBtn);

    // Feedback "Advancing…" should appear
    await waitFor(() => expect(screen.getByText(/advancing/i)).toBeDefined());

    // After 1.5s the component should advance to Q2 or summary
    await waitFor(
      () => {
        const q2 = screen.queryByText(/Q 2 of/i);
        const summary = screen.queryByText(/session complete/i);
        expect(q2 ?? summary).not.toBeNull();
      },
      { timeout: 3000 }
    );
  }, 10000); // give this test 10s
});

// ── Session Screen — Free Type ────────────────────────────────────────────────

describe('ClozeSession — Free Type', () => {
  async function startFreeTypeSession(user: ReturnType<typeof userEvent.setup>, unitId: number) {
    renderCloze(unitId);
    await waitFor(() => expect(screen.getByText('Cloze Tests')).toBeDefined());
    await user.click(screen.getByRole('radio', { name: /^verbs$/i }));
    await user.click(screen.getByRole('radio', { name: /free typing/i }));
    await user.click(screen.getByRole('button', { name: /start session/i }));
    await waitFor(() => expect(screen.getByLabelText(/free type answer/i)).toBeDefined());
  }

  it('free-type mode shows text input', async () => {
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();
    await startFreeTypeSession(user, unitId);

    expect(screen.getByLabelText(/free type answer/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /submit/i })).toBeDefined();
  });

  it('submitting correct answer (case insensitive) shows green feedback', async () => {
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();
    await startFreeTypeSession(user, unitId);

    const input = screen.getByLabelText(/free type answer/i);
    await user.type(input, 'SPIELE');
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(screen.getByText(/correct/i)).toBeDefined());
  });

  it('submitting near-miss (Levenshtein 1) shows green feedback', async () => {
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();
    await startFreeTypeSession(user, unitId);

    const input = screen.getByLabelText(/free type answer/i);
    // 'spile' is levenshtein distance 1 from 'spiele'
    await user.type(input, 'spile');
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(screen.getByText(/correct/i)).toBeDefined());
  });

  it('submitting wrong answer shows red feedback', async () => {
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();
    await startFreeTypeSession(user, unitId);

    const input = screen.getByLabelText(/free type answer/i);
    await user.type(input, 'kochen');
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(screen.getByText(/not quite/i)).toBeDefined());
  });

  it('Enter key submits the answer', async () => {
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();
    await startFreeTypeSession(user, unitId);

    const input = screen.getByLabelText(/free type answer/i);
    await user.type(input, 'spiele{Enter}');

    await waitFor(() => expect(screen.getByText(/correct/i)).toBeDefined());
  });
});

// ── Summary Screen ────────────────────────────────────────────────────────────

describe('ClozeSession — Summary', () => {
  it('shows summary screen with correct count', async () => {
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();
    await completeSessionWithWrongAnswers(user, unitId);

    expect(screen.getByText(/session complete/i)).toBeDefined();
    expect(screen.getByText(/\d+ \/ \d+/)).toBeDefined();
    expect(screen.getByText('correct')).toBeDefined();
  });

  it('shows accuracy percentage', async () => {
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();
    await completeSessionWithWrongAnswers(user, unitId);

    expect(screen.getByText(/%/)).toBeDefined();
    expect(screen.getByText('Accuracy')).toBeDefined();
  });

  it('shows "Back to unit" button', async () => {
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();
    await completeSessionWithWrongAnswers(user, unitId);

    expect(screen.getByRole('button', { name: /back to unit/i })).toBeDefined();
  });

  it('logs session to SessionLog table', async () => {
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();
    await completeSessionWithWrongAnswers(user, unitId);

    const logs = await db.sessionLogs.toArray();
    const clozeLog = logs.find((l) => l.mode === 'cloze');
    expect(clozeLog).toBeDefined();
    expect(clozeLog?.unitId).toBe(unitId);
    expect(clozeLog?.totalQuestions).toBeGreaterThan(0);
  });

  it('shows missed answers section when answers were wrong', async () => {
    const user = userEvent.setup();
    const { unitId } = await seedDatabase();
    await completeSessionWithWrongAnswers(user, unitId);

    // All answers were wrong, so missed section should appear
    expect(screen.getByText(/review missed answers/i)).toBeDefined();
  });
});
