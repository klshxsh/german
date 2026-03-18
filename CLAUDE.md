# CLAUDE.md — Project Instructions for Claude Code

## Project

Deutsch Learner — a PWA for learning German vocabulary and grammar from school worksheets. See `SPEC.md` for the full technical specification.

## Tech Stack

- React 18+ with TypeScript (strict mode)
- Vite for build/dev
- Tailwind CSS for styling (utility classes only, no CSS modules or styled-components)
- Dexie.js for IndexedDB
- React Router v6 (hash router)
- @dnd-kit for drag-and-drop in sentence builder
- Vitest + React Testing Library for unit/integration tests
- Playwright for E2E tests

## First-Time Setup

After `npm install`, Playwright needs its browser binary:

```bash
npx playwright install chromium
```

This downloads a Playwright-managed Chromium (~250MB) to `~/Library/Caches/ms-playwright/`. It does not use the system Chrome. This only needs to run once (or after Playwright version updates).

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run test         # Run unit + integration tests (Vitest)
npm run test:watch   # Run tests in watch mode
npm run test:e2e     # Run E2E tests (build first, runs headless)
npm run test:all     # Run everything
npm run lint         # ESLint
```

For debugging E2E tests visually:

```bash
npx playwright test --headed       # See the browser window
npx playwright test --ui           # Interactive test runner with screenshots
npx playwright test --debug        # Step through with inspector
```

## After Making Changes

- Run `npm run test` to check unit/integration tests pass
- If you changed UI components, run `npm run build` to check for TypeScript/build errors
- If you changed E2E-relevant flows, run `npm run test:e2e`

## Code Style

- Use functional components with hooks, no class components
- Extract business logic into plain TypeScript modules under `src/logic/` — keep components thin
- Database operations go in `src/db/` — components never call Dexie directly, they use functions from `src/db/`
- Use `dexie-react-hooks` (`useLiveQuery`) for reactive data in components
- Prefer named exports over default exports (except for page-level route components)
- Use TypeScript interfaces (not types) for data models, defined in `src/types.ts`
- Avoid `any` — use `unknown` and narrow if needed

## Project Structure

```
src/
  components/       # Reusable UI components (Card, Tile, ProgressBar, etc.)
  pages/            # Route-level page components
  db/               # Dexie database definition and data access functions
    db.ts           # Database class and schema
    import.ts       # JSON import logic with ID remapping
    progress.ts     # FlashcardProgress and SessionLog operations
  logic/            # Pure business logic (no React, no Dexie)
    leitner.ts      # Spaced repetition bucket calculations
    tokeniser.ts    # Sentence splitting for builder mode
    distractor.ts   # Distractor generation for builder and cloze
    cloze.ts        # Cloze question generation
    levenshtein.ts  # String distance for typo tolerance
    scoring.ts      # Score calculations
  types.ts          # All TypeScript interfaces
  test/
    setup.ts        # Test setup (fake-indexeddb, jest-dom)
    factories.ts    # Test data factory functions
e2e/
  fixtures/
    test-unit.json  # Real exported unit for E2E tests
  helpers.ts        # Shared E2E utilities (importTestUnit, etc.)
```

## Testing Conventions

- Unit test files live next to the module they test: `src/logic/leitner.test.ts`
- Integration test files live next to the component: `src/pages/FlashcardSession.test.tsx`
- E2E test files go in `e2e/`: `e2e/flashcards.spec.ts`
- Use factory functions from `src/test/factories.ts` to create test data
- Always clear the Dexie database in `afterEach` for integration tests
- Test the logic, not the implementation — assert on outcomes, not internal state

## Design Guidelines

- Mobile-first responsive design
- Warm neutral palette: background `#F6F1EB`, accent `#C4713B`, text `#2C2418`
- Use DM Sans for body text (import from Google Fonts)
- Large touch targets (minimum 44px) for interactive elements
- Flashcard flip uses CSS 3D transforms (`perspective`, `rotateY`)
- Correct = green flash (`#5B8C5A`), incorrect = red flash (`#C0392B`)

## Key Design Decisions

- All data is local — no API calls, no backend, no analytics
- JSON import is the only way data enters the app (from Content Studio artifact)
- Leitner system with 5 buckets (0/1/3/7/14 day intervals) — keep it simple
- Sentence builder validates against pre-generated sentences, not grammar rules
- Cloze free-type accepts Levenshtein distance ≤ 1 as correct
- Progress export uses copy-to-clipboard (not file download) for compatibility

## Common Pitfalls

- Dexie auto-increment IDs are numbers, but the imported JSON uses string sourceIds like "cat_1" — the import logic must build a mapping between them
- `fake-indexeddb` must be imported in test setup before Dexie is instantiated
- @dnd-kit needs the touch sensor explicitly enabled for mobile
- Hash router (`createHashRouter`) is needed for PWA — standard browser router won't work with file:// or some static hosts
- Tailwind in Vite needs `@tailwindcss/vite` plugin, not PostCSS config
