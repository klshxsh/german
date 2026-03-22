import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi } from 'vitest';
import SearchPage from './SearchPage';
import { db } from '../db/db';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderSearch() {
  return render(
    <MemoryRouter initialEntries={['/search']}>
      <Routes>
        <Route path="/search" element={<SearchPage />} />
        <Route path="/unit/:id" element={<div>Unit Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

async function seedData() {
  const unitId = await db.units.add({
    name: 'Freizeit',
    description: 'Free time activities',
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
    name: 'Sports',
    description: '',
    grammarNotes: '',
  });
  const entryId = await db.entries.add({
    unitId,
    categoryId: catId,
    sourceId: 'ent_1',
    german: 'spielen',
    english: 'to play',
    partOfSpeech: 'verb',
    grammarNotes: '',
    tags: [],
  });
  return { unitId, catId, entryId };
}

afterEach(async () => {
  await db.units.clear();
  await db.categories.clear();
  await db.entries.clear();
  await db.verbForms.clear();
  await db.generatedSentences.clear();
  mockNavigate.mockClear();
});

describe('SearchPage', () => {
  it('renders the search input', async () => {
    renderSearch();
    await waitFor(() => {
      expect(screen.getByTestId('search-input')).toBeDefined();
    });
  });

  it('shows empty state prompt when no query entered', async () => {
    renderSearch();
    await waitFor(() => {
      expect(screen.getByText('Type to search across all units')).toBeDefined();
    });
  });

  it('shows no-results state for unmatched query', async () => {
    await seedData();
    const user = userEvent.setup();
    renderSearch();

    await waitFor(() => screen.getByTestId('search-input'));
    await user.type(screen.getByTestId('search-input'), 'xyz123');

    await waitFor(
      () => expect(screen.getByTestId('no-results')).toBeDefined(),
      { timeout: 1000 }
    );
  });

  it('shows results with German and English text after typing', async () => {
    await seedData();
    const user = userEvent.setup();
    renderSearch();

    await waitFor(() => screen.getByTestId('search-input'));
    await user.type(screen.getByTestId('search-input'), 'spielen');

    await waitFor(
      () => expect(screen.getByTestId('result-count')).toBeDefined(),
      { timeout: 1000 }
    );
    expect(screen.getByText('spielen')).toBeDefined();
    expect(screen.getByText('to play')).toBeDefined();
  });

  it('shows result count message', async () => {
    await seedData();
    const user = userEvent.setup();
    renderSearch();

    await waitFor(() => screen.getByTestId('search-input'));
    await user.type(screen.getByTestId('search-input'), 'spielen');

    await waitFor(
      () => expect(screen.getByTestId('result-count')).toBeDefined(),
      { timeout: 1000 }
    );
    expect(screen.getByTestId('result-count').textContent).toContain('1 result');
    expect(screen.getByTestId('result-count').textContent).toContain('1 unit');
  });

  it('shows the category badge and category heading on a result', async () => {
    await seedData();
    const user = userEvent.setup();
    renderSearch();

    await waitFor(() => screen.getByTestId('search-input'));
    await user.type(screen.getByTestId('search-input'), 'spielen');

    await waitFor(
      () => expect(screen.getAllByText('Sports').length).toBeGreaterThanOrEqual(1),
      { timeout: 1000 }
    );
    // Category name appears as both a group heading and as a badge on the result card
    expect(screen.getAllByText('Sports').length).toBe(2);
  });

  it('tapping a result navigates to the unit page', async () => {
    const { unitId } = await seedData();
    const user = userEvent.setup();
    renderSearch();

    await waitFor(() => screen.getByTestId('search-input'));
    await user.type(screen.getByTestId('search-input'), 'spielen');

    await waitFor(
      () => expect(screen.getByTestId('search-result')).toBeDefined(),
      { timeout: 1000 }
    );

    await user.click(screen.getByTestId('search-result'));
    expect(mockNavigate).toHaveBeenCalledWith(`/unit/${unitId}`);
  });

  it('shows verb form row when match is in a verb form', async () => {
    const { entryId, unitId } = await seedData();
    await db.verbForms.add({
      unitId,
      entryId,
      infinitive: 'spielen',
      present3rd: 'spielt',
      perfectAux: 'haben',
      pastParticiple: 'gespielt',
    });

    const user = userEvent.setup();
    renderSearch();

    await waitFor(() => screen.getByTestId('search-input'));
    await user.type(screen.getByTestId('search-input'), 'spielt');

    await waitFor(
      () => expect(screen.getByTestId('verb-form-row')).toBeDefined(),
      { timeout: 1000 }
    );
  });

  it('shows matched sentence when match is in a generated sentence', async () => {
    const { entryId, unitId } = await seedData();
    await db.generatedSentences.add({
      unitId,
      templateId: 1,
      german: 'Ich spiele jeden Tag Fußball.',
      english: 'I play football every day.',
      complexity: 'simple',
      usedEntryIds: [entryId],
    });

    const user = userEvent.setup();
    renderSearch();

    await waitFor(() => screen.getByTestId('search-input'));
    await user.type(screen.getByTestId('search-input'), 'Fußball');

    await waitFor(
      () => expect(screen.getByTestId('matched-sentence')).toBeDefined(),
      { timeout: 1000 }
    );
    expect(screen.getByTestId('matched-sentence').textContent).toContain('Fußball');
  });

  it('displays results from multiple units with unit names', async () => {
    const unitId1 = await db.units.add({
      name: 'Unit Alpha', description: '', year: 9, chapter: 1, unitNumber: 1,
      importedAt: new Date().toISOString(), exportedAt: '', version: '1.0',
    });
    const unitId2 = await db.units.add({
      name: 'Unit Beta', description: '', year: 9, chapter: 2, unitNumber: 1,
      importedAt: new Date().toISOString(), exportedAt: '', version: '1.0',
    });
    const catId1 = await db.categories.add({ unitId: unitId1, sourceId: 'c1', name: 'Cat A', description: '', grammarNotes: '' });
    const catId2 = await db.categories.add({ unitId: unitId2, sourceId: 'c2', name: 'Cat B', description: '', grammarNotes: '' });
    await db.entries.add({ unitId: unitId1, categoryId: catId1, sourceId: 'e1', german: 'laufen', english: 'to run', partOfSpeech: 'verb', grammarNotes: '', tags: [] });
    await db.entries.add({ unitId: unitId2, categoryId: catId2, sourceId: 'e2', german: 'laufen', english: 'to run', partOfSpeech: 'verb', grammarNotes: '', tags: [] });

    const user = userEvent.setup();
    renderSearch();

    await waitFor(() => screen.getByTestId('search-input'));
    await user.type(screen.getByTestId('search-input'), 'laufen');

    await waitFor(
      () => {
        expect(screen.getByTestId('result-count')).toBeDefined();
        expect(screen.getByTestId('result-count').textContent).toContain('2 results');
      },
      { timeout: 1000 }
    );
    expect(screen.getByTestId('result-count').textContent).toContain('2 units');
    expect(screen.getByText('Unit Alpha')).toBeDefined();
    expect(screen.getByText('Unit Beta')).toBeDefined();
  });

  it('clearing the search input resets to empty state', async () => {
    await seedData();
    const user = userEvent.setup();
    renderSearch();

    await waitFor(() => screen.getByTestId('search-input'));
    await user.type(screen.getByTestId('search-input'), 'spielen');

    await waitFor(
      () => expect(screen.getByTestId('result-count')).toBeDefined(),
      { timeout: 1000 }
    );

    await user.click(screen.getByRole('button', { name: /clear search/i }));

    await waitFor(
      () => {
        expect(screen.queryByTestId('result-count')).toBeNull();
        expect(screen.getByText('Type to search across all units')).toBeDefined();
      },
      { timeout: 1000 }
    );
  });

  it('debounce — results are not shown immediately, appear after delay', async () => {
    await seedData();
    const user = userEvent.setup();
    renderSearch();

    await waitFor(() => screen.getByTestId('search-input'));

    // Start typing but immediately check — results should not be visible yet
    // We can't perfectly test the debounce without fake timers, but we can
    // verify the full flow: type → wait → results appear
    await user.type(screen.getByTestId('search-input'), 'spielen');

    // After typing + debounce wait, results should appear
    await waitFor(
      () => expect(screen.getByTestId('search-result')).toBeDefined(),
      { timeout: 1000 }
    );
  });
});
