import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './Dashboard';
import { db } from '../db/db';
import { setSetting } from '../db/settings';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/import" element={<div>Import Page</div>} />
        <Route path="/unit/:id" element={<div>Unit Page</div>} />
        <Route path="/unit/:id/flashcards" element={<div>Flashcards</div>} />
        <Route path="/unit/:id/builder" element={<div>Builder</div>} />
        <Route path="/unit/:id/cloze" element={<div>Cloze</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(async () => {
  await db.units.clear();
  await db.categories.clear();
  await db.entries.clear();
  await db.flashcardProgress.clear();
  await db.sessionLogs.clear();
  await db.userSettings.clear();
  mockNavigate.mockClear();
  localStorage.clear();
});

describe('Dashboard', () => {
  it('shows onboarding message when no units', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('No units yet')).toBeDefined();
    });
  });

  it('renders grouped units in Year → Chapter hierarchy', async () => {
    await db.units.add({
      name: 'Schulalltag',
      description: '',
      year: 9,
      chapter: 1,
      unitNumber: 1,
      importedAt: new Date().toISOString(),
      exportedAt: '',
      version: '1.0',
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Year 9')).toBeDefined();
      expect(screen.getByText('Chapter 1')).toBeDefined();
      expect(screen.getByText('Schulalltag')).toBeDefined();
    });
  });

  it('sorts years descending', async () => {
    await db.units.add({
      name: 'Year 8 Unit', description: '', year: 8, chapter: 1, unitNumber: 1,
      importedAt: new Date().toISOString(), exportedAt: '', version: '1.0',
    });
    await db.units.add({
      name: 'Year 10 Unit', description: '', year: 10, chapter: 1, unitNumber: 1,
      importedAt: new Date().toISOString(), exportedAt: '', version: '1.0',
    });
    await db.units.add({
      name: 'Year 9 Unit', description: '', year: 9, chapter: 1, unitNumber: 1,
      importedAt: new Date().toISOString(), exportedAt: '', version: '1.0',
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Year 10')).toBeDefined();
    });

    const yearHeadings = screen.getAllByText(/^Year \d+$/);
    expect(yearHeadings[0].textContent).toBe('Year 10');
    expect(yearHeadings[1].textContent).toBe('Year 9');
    expect(yearHeadings[2].textContent).toBe('Year 8');
  });

  it('shows ungrouped section for units with missing metadata', async () => {
    await db.units.add({
      name: 'Orphaned Unit', description: '', year: 0, chapter: 0, unitNumber: 0,
      importedAt: new Date().toISOString(), exportedAt: '', version: '1.0',
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Ungrouped')).toBeDefined();
      expect(screen.getByText('Orphaned Unit')).toBeDefined();
    });
  });

  it('collapses and expands a year group', async () => {
    await db.units.add({
      name: 'Freizeit', description: '', year: 9, chapter: 1, unitNumber: 1,
      importedAt: new Date().toISOString(), exportedAt: '', version: '1.0',
    });

    const user = userEvent.setup();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Year 9')).toBeDefined();
      expect(screen.getByText('Freizeit')).toBeDefined();
    });

    // Collapse year 9
    const yearButton = screen.getByTestId('year-group-9');
    await user.click(yearButton);

    await waitFor(() => {
      expect(screen.queryByText('Freizeit')).toBeNull();
    });

    // Expand again
    await user.click(yearButton);

    await waitFor(() => {
      expect(screen.getByText('Freizeit')).toBeDefined();
    });
  });

  it('persists collapse state in localStorage', async () => {
    await db.units.add({
      name: 'Hobby', description: '', year: 9, chapter: 1, unitNumber: 2,
      importedAt: new Date().toISOString(), exportedAt: '', version: '1.0',
    });

    const user = userEvent.setup();
    const { unmount } = renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Year 9')).toBeDefined();
    });

    // Collapse
    await user.click(screen.getByTestId('year-group-9'));

    await waitFor(() => {
      expect(screen.queryByText('Hobby')).toBeNull();
    });

    // Unmount and remount — should still be collapsed
    unmount();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Year 9')).toBeDefined();
    });

    expect(screen.queryByText('Hobby')).toBeNull();
  });

  it('shows multiple chapters sorted numerically', async () => {
    await db.units.add({
      name: 'Chapter 3 Unit', description: '', year: 9, chapter: 3, unitNumber: 1,
      importedAt: new Date().toISOString(), exportedAt: '', version: '1.0',
    });
    await db.units.add({
      name: 'Chapter 1 Unit', description: '', year: 9, chapter: 1, unitNumber: 1,
      importedAt: new Date().toISOString(), exportedAt: '', version: '1.0',
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Chapter 3 Unit')).toBeDefined();
      expect(screen.getByText('Chapter 1 Unit')).toBeDefined();
    });

    const chapterLabels = screen.getAllByText(/^Chapter \d+$/);
    expect(chapterLabels[0].textContent).toBe('Chapter 1');
    expect(chapterLabels[1].textContent).toBe('Chapter 3');
  });

  it('shows both grouped and ungrouped units', async () => {
    await db.units.add({
      name: 'Grouped', description: '', year: 9, chapter: 1, unitNumber: 1,
      importedAt: new Date().toISOString(), exportedAt: '', version: '1.0',
    });
    await db.units.add({
      name: 'Not Grouped', description: '', year: 0, chapter: 0, unitNumber: 0,
      importedAt: new Date().toISOString(), exportedAt: '', version: '1.0',
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Year 9')).toBeDefined();
      expect(screen.getByText('Grouped')).toBeDefined();
      expect(screen.getByText('Ungrouped')).toBeDefined();
      expect(screen.getByText('Not Grouped')).toBeDefined();
    });
  });
});

// ─── Phase 10: Personalised Greeting ─────────────────────────────────────────

describe('Dashboard — Greeting', () => {
  it('shows "Willkommen!" when no name is set', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText(/Willkommen!/)).toBeInTheDocument();
    });
  });

  it('shows "Set your name" link when no name is set', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Set your name')).toBeInTheDocument();
    });
  });

  it('shows "Hallo, [name]!" when a name is saved', async () => {
    await setSetting('userName', 'Emma');
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText(/Hallo, Emma!/)).toBeInTheDocument();
    });
  });

  it('shows avatar before the greeting when avatar is set', async () => {
    await setSetting('userName', 'Max');
    await setSetting('userAvatar', '🐶');
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText(/🐶.*Hallo, Max!/)).toBeInTheDocument();
    });
  });

  it('shows greeting without avatar when only name is set', async () => {
    await setSetting('userName', 'Luisa');
    renderDashboard();
    await waitFor(() => {
      const greeting = screen.getByText(/Hallo, Luisa!/);
      expect(greeting).toBeInTheDocument();
      expect(greeting.textContent).not.toMatch(/undefined/);
    });
  });
});
