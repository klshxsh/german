# Deutsch Learner — PWA Technical Specification

## Overview

A standalone Progressive Web App for learning German vocabulary and grammar. Users import structured JSON files (exported from a separate Content Studio tool) containing categorised vocabulary, verb forms, sentence templates, and example sentences extracted from school worksheets. The app stores all data locally in IndexedDB and provides three learning modes: flashcards, sentence builder, and cloze (fill-the-gap) tests.

## Tech Stack

- **Framework:** React 18+ with TypeScript
- **Build:** Vite
- **Storage:** IndexedDB via Dexie.js
- **Styling:** Tailwind CSS
- **Routing:** React Router v6 (hash router for PWA compatibility)
- **Drag & Drop:** @dnd-kit/core + @dnd-kit/sortable (for sentence builder)
- **PWA:** vite-plugin-pwa (Workbox service worker, manifest, offline support)
- **No backend, no API calls** — everything runs client-side

## Data Model (Dexie Schema)

### Imported Content Tables

```typescript
// db.ts
import Dexie, { Table } from 'dexie';

interface Unit {
  id?: number;           // auto-increment
  name: string;
  description: string;
  importedAt: string;    // ISO timestamp
  version: string;       // from JSON export
}

interface Category {
  id?: number;
  unitId: number;        // FK to Unit
  sourceId: string;      // original id from JSON (e.g. "cat_1")
  name: string;
  description: string;
  grammarNotes: string;
}

interface Entry {
  id?: number;
  unitId: number;
  categoryId: number;    // FK to Category (Dexie auto-inc id, not sourceId)
  sourceId: string;      // original id from JSON (e.g. "ent_1")
  german: string;
  english: string;
  partOfSpeech: string;
  grammarNotes: string;
  tags: string[];
}

interface VerbForm {
  id?: number;
  unitId: number;
  entryId: number;       // FK to Entry
  infinitive: string;
  present3rd: string;
  perfectAux: 'haben' | 'sein';
  pastParticiple: string;
}

interface SentenceTemplate {
  id?: number;
  unitId: number;
  sourceId: string;
  pattern: string;
  slots: string[];
  description: string;
}

interface GeneratedSentence {
  id?: number;
  unitId: number;
  templateId: number;
  german: string;
  english: string;
  complexity: 'simple' | 'compound' | 'complex';
  usedEntryIds: number[];  // FKs to Entry
}
```

### Progress Tables

```typescript
interface FlashcardProgress {
  id?: number;
  entryId: number;       // FK to Entry
  unitId: number;
  correctCount: number;
  incorrectCount: number;
  streak: number;         // current consecutive correct
  lastSeen: string;       // ISO timestamp
  nextDue: string;        // ISO timestamp (simple spaced repetition)
  bucket: number;         // 0-4, for Leitner-style spacing
}

interface SessionLog {
  id?: number;
  unitId: number;
  mode: 'flashcard' | 'sentence-builder' | 'cloze';
  startedAt: string;
  endedAt: string;
  totalQuestions: number;
  correctAnswers: number;
  entryIds: number[];     // entries tested in this session
}
```

### Dexie Database Definition

```typescript
class DeutschDB extends Dexie {
  units!: Table<Unit>;
  categories!: Table<Category>;
  entries!: Table<Entry>;
  verbForms!: Table<VerbForm>;
  sentenceTemplates!: Table<SentenceTemplate>;
  generatedSentences!: Table<GeneratedSentence>;
  flashcardProgress!: Table<FlashcardProgress>;
  sessionLogs!: Table<SessionLog>;

  constructor() {
    super('DeutschLearner');
    this.version(1).stores({
      units: '++id, name',
      categories: '++id, unitId, sourceId',
      entries: '++id, unitId, categoryId, sourceId, partOfSpeech',
      verbForms: '++id, unitId, entryId',
      sentenceTemplates: '++id, unitId, sourceId',
      generatedSentences: '++id, unitId, templateId, complexity',
      flashcardProgress: '++id, entryId, unitId, nextDue, bucket',
      sessionLogs: '++id, unitId, mode, startedAt',
    });
  }
}
```

## JSON Import

The app imports JSON files exported from the Content Studio artifact. The import process:

1. User selects a `.json` file via file picker
2. App validates the structure (must have `unit`, `categories`, `entries` at minimum)
3. Check for duplicate units (by name) — offer to replace or skip
4. Insert `Unit` record, get auto-increment ID
5. Insert `Category` records, building a `sourceId -> dexieId` mapping
6. Insert `Entry` records, remapping `categoryId` from source IDs to Dexie IDs
7. Insert `VerbForm` records, remapping `entryId`
8. Insert `SentenceTemplate` and `GeneratedSentence` records, remapping IDs
9. Initialise `FlashcardProgress` for all entries with bucket=0, nextDue=now

All inserts should be wrapped in a Dexie transaction for atomicity.

### Expected JSON Shape

```json
{
  "unit": { "name": "...", "description": "..." },
  "categories": [{ "id": "cat_1", "name": "...", ... }],
  "entries": [{ "id": "ent_1", "categoryId": "cat_1", "german": "...", "english": "...", ... }],
  "verbForms": [{ "id": "vf_1", "entryId": "ent_1", ... }],
  "sentenceTemplates": [{ "id": "tpl_1", ... }],
  "generatedSentences": [{ "id": "sen_1", "templateId": "tpl_1", "usedEntryIds": ["ent_1"], ... }],
  "version": "1.0",
  "exportedAt": "..."
}
```

## App Structure & Routing

```
/                    → Dashboard (unit list, quick stats, recent activity)
/import              → JSON import page
/unit/:id            → Unit overview (category breakdown, progress summary)
/unit/:id/flashcards → Flashcard mode
/unit/:id/builder    → Sentence builder mode
/unit/:id/cloze      → Cloze test mode
/progress            → Overall progress & stats
/settings            → Export/import progress, reset data
```

## Page Specifications

### Dashboard (`/`)

- List of imported units as cards showing: name, entry count, last practiced, overall accuracy %
- "Import Unit" button (navigates to `/import`)
- Quick-start buttons for each learning mode on each unit
- If no units imported, show an onboarding message with import prompt

### Import Page (`/import`)

- File picker accepting `.json`
- Validation summary showing what was found (X categories, Y entries, Z sentences)
- Preview of categories and entry count per category
- Import button, with duplicate handling (replace / skip / cancel)
- Success message with link to the unit page

### Unit Overview (`/unit/:id`)

- Unit name and description
- Category breakdown: cards per category showing count and progress %
- Three learning mode cards:
  - **Flashcards** — "X due for review" badge
  - **Sentence Builder** — "Y sentences available" badge  
  - **Cloze Tests** — "Z questions available" badge
- Quick stats: total entries, accuracy rate, last session info

### Flashcard Mode (`/unit/:id/flashcards`)

#### Configuration (shown before starting)
- Select categories to include (default: all)
- Select direction: German→English, English→German, or Mixed
- Number of cards: 10, 20, 50, All, or "Due for review"
- Card selection strategy: Random, Weakest first, Due for review (Leitner)

#### Gameplay
- Show one side of the card (German or English)
- User mentally recalls the answer, then taps/clicks to flip
- After flipping, show both sides and two buttons: "Got it" / "Missed it"
- Update FlashcardProgress: increment correct/incorrect, update streak, recalculate bucket and nextDue
- Progress bar showing position in deck (e.g. 7/20)
- Option to mark a card as "difficult" (resets bucket to 0)

#### Leitner Spaced Repetition (simple)
- 5 buckets (0-4) with increasing intervals: 0=now, 1=1day, 2=3days, 3=7days, 4=14days
- Correct answer moves card up one bucket (max 4)
- Incorrect answer moves card back to bucket 0
- "Due for review" mode selects cards where `nextDue <= now`

#### End of Session
- Summary screen: X/Y correct, accuracy %, time taken
- List of missed cards with correct answers
- "Practice missed cards" button to immediately re-drill failures
- Log session to SessionLog table

### Sentence Builder (`/unit/:id/builder`)

#### Configuration
- Select complexity: Simple, Compound, Complex, or Mixed
- Number of sentences: 5, 10, 15

#### Gameplay
- Show the English translation of a target sentence at the top
- Below, show a set of German word/phrase tiles drawn from the sentence's components
- Include 2-3 distractor tiles from the same categories (wrong vocabulary that could plausibly fit)
- User drags tiles into a drop zone to build the German sentence
- Use @dnd-kit for drag-and-drop interaction
- "Check" button validates the order against the stored German sentence
- Highlight correct tiles in green, incorrect in red
- Show the correct sentence if wrong
- Score: first-attempt correct = 2 points, second attempt = 1 point

#### Sentence Splitting Strategy
- Split generated sentences into tokens on word boundaries
- Keep multi-word phrases together where they form a single entry (e.g. "sehr gern", "ein bisschen")
- Match tokens back to entry IDs where possible to update progress

#### End of Session
- Summary with score and accuracy
- Log to SessionLog

### Cloze / Fill-the-Gap (`/unit/:id/cloze`)

#### Configuration
- Select what to blank: Vocabulary, Verbs, Qualifiers, Connectives, or Mixed
- Mode: Multiple choice (4 options) or Free typing
- Number of questions: 10, 20, 50

#### Question Generation
- Take a generated sentence from the unit
- Select a component to blank based on the configured category
- For multiple choice: show the correct answer + 3 distractors from the same category
- For free typing: show an input field; accept answers with minor typo tolerance (Levenshtein distance ≤ 1, case insensitive)

#### Gameplay
- Show the sentence with a blank: "Er spielt _____ Tennis" (answer: "sehr gern")
- Show the English translation below for context
- Multiple choice: four tappable option buttons
- Free type: text input with submit button
- Immediate feedback: correct (green flash) or incorrect (red flash + show correct answer)
- Auto-advance after 1.5s on correct, manual advance on incorrect

#### End of Session
- Summary screen with accuracy and breakdown by category
- Log to SessionLog

### Progress Page (`/progress`)

- Overall stats across all units: total entries learned, overall accuracy, streak days
- Per-unit breakdown: cards in each Leitner bucket (visual bar chart)
- Session history: recent sessions with mode, date, score
- Accuracy trends over time (simple line chart using recharts or similar)

### Settings Page (`/settings`)

- **Export Progress:** generates a JSON file containing all FlashcardProgress and SessionLog records, downloadable via copy-to-clipboard modal (same pattern as Content Studio — blob downloads may be blocked in some contexts)
- **Import Progress:** file picker to restore progress from a previously exported JSON
- **Reset Progress:** clear all progress data (with confirmation dialog), preserving imported units
- **Delete Unit:** remove a unit and all its associated data including progress
- **About:** app version, brief description

## UI/UX Guidelines

### Design Direction
- Clean, modern, slightly warm aesthetic (consistent with Content Studio)
- Mobile-first responsive design — this will primarily be used on a phone or tablet
- Large touch targets for flashcard flipping and drag-and-drop
- Minimal colour palette: warm neutrals with an accent colour for interactive elements
- Use system fonts or one imported font family (DM Sans or similar) for performance

### Key Interactions
- Flashcard flip: CSS 3D transform with `perspective` and `rotateY`
- Drag and drop: @dnd-kit with touch sensor enabled, clear drag handle affordance
- Correct/incorrect feedback: brief colour flash + optional haptic (navigator.vibrate)
- Page transitions: minimal, fast — no heavy animations that slow interaction

### Responsive Breakpoints
- Mobile (default): single column, full-width cards, bottom nav
- Tablet (768px+): two-column layouts where appropriate
- Desktop (1024px+): max-width container, sidebar nav option

### Navigation
- Bottom tab bar on mobile: Dashboard, Progress, Settings
- Learning mode pages have a back button and progress indicator in a top bar
- Unit page is the hub — all three learning modes launch from here

## PWA Configuration

```typescript
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa';

export default {
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Deutsch Learner',
        short_name: 'Deutsch',
        description: 'German vocabulary and grammar learning app',
        theme_color: '#C4713B',
        background_color: '#F6F1EB',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
};
```

## Build & Development

```bash
# Install
npm create vite@latest deutsch-learner -- --template react-ts
cd deutsch-learner
npm install dexie dexie-react-hooks react-router-dom @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities tailwindcss @tailwindcss/vite
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom fake-indexeddb @playwright/test
npx playwright install chromium

# Dev
npm run dev

# Test
npm run test          # unit + integration
npm run test:e2e      # end-to-end (requires build first)
npm run test:all      # everything

# Build
npm run build

# Preview production build
npm run preview
```

## Testing Strategy

### Overview

The app uses a two-tier testing approach:

- **Vitest + React Testing Library** — unit tests for logic and integration tests for components
- **Playwright** — end-to-end UI tests that run against the real app in a browser

Tests should be written alongside each implementation phase, not bolted on after. Claude Code should create tests as part of each phase's deliverables.

### Setup & Dependencies

```bash
# Unit & integration tests
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom fake-indexeddb

# E2E tests
npm install -D @playwright/test
npx playwright install chromium
```

```typescript
// vite.config.ts — add test config
export default {
  // ... existing config
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
};
```

```typescript
// src/test/setup.ts
import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';  // Provides IndexedDB in jsdom for Dexie tests
```

```json
// package.json scripts
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:all": "vitest run && playwright test"
  }
}
```

### Unit Tests (Vitest)

These test pure logic functions in isolation with no DOM or component rendering. Each module of business logic should have a corresponding `.test.ts` file.

#### Database & Import Logic (`src/db/__tests__/`)

```
db.test.ts
  ✓ creates all tables with correct schema
  ✓ auto-increments IDs correctly

import.test.ts
  ✓ imports valid JSON and creates all records
  ✓ remaps sourceId references to Dexie auto-increment IDs correctly
  ✓ category sourceId "cat_1" maps to correct Dexie ID in entry.categoryId
  ✓ entry sourceId "ent_1" maps to correct Dexie ID in verbForm.entryId
  ✓ sentence usedEntryIds are remapped correctly
  ✓ wraps all inserts in a transaction (partial failure rolls back)
  ✓ rejects JSON missing required fields (unit, categories, entries)
  ✓ handles missing optional fields gracefully (tags, grammarNotes default to empty)
  ✓ detects duplicate unit by name and offers replace/skip
  ✓ replace mode deletes old unit data before re-importing
  ✓ initialises FlashcardProgress for every imported entry with bucket=0
```

#### Leitner Spaced Repetition (`src/logic/__tests__/`)

```
leitner.test.ts
  ✓ correct answer moves card from bucket 0 to bucket 1
  ✓ correct answer moves card from bucket 3 to bucket 4
  ✓ correct answer on bucket 4 stays at bucket 4
  ✓ incorrect answer resets any bucket to bucket 0
  ✓ bucket 0 sets nextDue to now
  ✓ bucket 1 sets nextDue to now + 1 day
  ✓ bucket 2 sets nextDue to now + 3 days
  ✓ bucket 3 sets nextDue to now + 7 days
  ✓ bucket 4 sets nextDue to now + 14 days
  ✓ getDueCards returns only cards where nextDue <= now
  ✓ getDueCards ordered by nextDue ascending (oldest due first)
  ✓ streak increments on correct, resets to 0 on incorrect
```

#### Sentence Tokenisation (`src/logic/__tests__/`)

```
tokeniser.test.ts
  ✓ splits simple sentence into word tokens
  ✓ keeps multi-word entries together ("sehr gern" → single token)
  ✓ keeps multi-word entries together ("ein bisschen" → single token)
  ✓ handles punctuation attached to words ("Tennis," → "Tennis" + ",")
  ✓ maps tokens back to entry IDs where a match exists
  ✓ tokens with no matching entry get entryId: null
  ✓ handles German special characters (ü, ö, ä, ß)

distractor.test.ts
  ✓ generates N distractors from the same category as the blanked word
  ✓ distractors never include the correct answer
  ✓ distractors are unique (no duplicates)
  ✓ returns fewer distractors if category has insufficient entries
  ✓ distractors for verbs come from verb entries, not adjectives
```

#### Cloze Question Generation (`src/logic/__tests__/`)

```
cloze.test.ts
  ✓ generates a question with one blank from a sentence
  ✓ blank position matches the configured category (verb, qualifier, etc.)
  ✓ multiple choice options include the correct answer
  ✓ multiple choice has exactly 4 options (or fewer if not enough distractors)
  ✓ correct answer is randomly positioned among options
  ✓ free-type mode accepts exact match (case insensitive)
  ✓ free-type mode accepts Levenshtein distance 1 ("spelt" ≈ "spielt")
  ✓ free-type mode rejects Levenshtein distance 2+
  ✓ handles umlauts: "uber" accepted for "über" (distance 1)
```

#### Scoring & Session Logic (`src/logic/__tests__/`)

```
scoring.test.ts
  ✓ sentence builder: first-attempt correct = 2 points
  ✓ sentence builder: second-attempt correct = 1 point
  ✓ sentence builder: no correct attempt = 0 points
  ✓ session summary calculates correct percentage
  ✓ session summary calculates elapsed time

session.test.ts
  ✓ createSession logs mode, unitId, and startedAt
  ✓ endSession updates endedAt, totalQuestions, correctAnswers
  ✓ endSession writes to SessionLog table
```

### Integration Tests (Vitest + React Testing Library)

These render React components and test user interactions against the real Dexie database (using fake-indexeddb). Place alongside components as `ComponentName.test.tsx`.

#### Import Flow

```
ImportPage.test.tsx
  ✓ renders file picker and import button
  ✓ shows validation summary after selecting a valid JSON file
  ✓ displays category count and entry count in preview
  ✓ import button writes data to IndexedDB
  ✓ navigates to unit page on successful import
  ✓ shows error message for invalid JSON
  ✓ shows duplicate warning for existing unit name
```

#### Flashcard Mode

```
FlashcardSession.test.tsx
  ✓ renders configuration screen with category and direction options
  ✓ starting a session shows the first card (German side by default)
  ✓ clicking the card flips it to show the answer
  ✓ "Got it" advances to next card and updates progress
  ✓ "Missed it" advances to next card and resets bucket
  ✓ progress bar updates after each card
  ✓ shows summary screen after last card
  ✓ summary shows correct/incorrect counts
  ✓ "Practice missed" button starts new session with only missed cards
```

#### Sentence Builder

```
SentenceBuilder.test.tsx
  ✓ renders English target sentence at top
  ✓ renders draggable German tiles below
  ✓ includes distractor tiles
  ✓ tiles can be dragged into the answer zone (simulate with @testing-library/user-event)
  ✓ "Check" button validates correct order → green highlight
  ✓ "Check" button validates incorrect order → red highlight + correct answer shown
  ✓ score updates based on attempt count
```

#### Cloze Tests

```
ClozeSession.test.tsx
  ✓ renders sentence with blank
  ✓ renders English translation below
  ✓ multiple choice mode shows 4 option buttons
  ✓ selecting correct option shows green feedback
  ✓ selecting wrong option shows red feedback and correct answer
  ✓ free-type mode shows text input
  ✓ submitting correct answer (case insensitive) shows green feedback
  ✓ submitting near-miss (Levenshtein 1) shows green feedback
  ✓ auto-advances after correct answer
```

#### Progress & Export

```
ProgressPage.test.tsx
  ✓ renders overall stats from SessionLog data
  ✓ shows per-unit breakdown
  ✓ shows bucket distribution

SettingsPage.test.tsx
  ✓ export progress generates valid JSON string
  ✓ exported JSON contains FlashcardProgress and SessionLog records
  ✓ import progress restores records to IndexedDB
  ✓ reset progress clears FlashcardProgress but keeps units
  ✓ delete unit removes unit and all associated data
```

### End-to-End Tests (Playwright)

These run against the real built app in a Chromium browser. They test complete user workflows including IndexedDB persistence.

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  webServer: {
    command: 'npm run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:4173',
  },
  projects: [
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },  // iPhone 14
    { name: 'desktop', use: { viewport: { width: 1280, height: 720 } } },
  ],
});
```

#### Test Fixtures

Create a fixture JSON file at `e2e/fixtures/test-unit.json` containing a small but complete unit (3 categories, 10 entries, 3 verb forms, 5 sentences) for use across all E2E tests.

```typescript
// e2e/helpers.ts
import { Page } from '@playwright/test';
import path from 'path';

export async function importTestUnit(page: Page) {
  await page.goto('/import');
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.join(__dirname, 'fixtures/test-unit.json'));
  await page.getByRole('button', { name: /import/i }).click();
  await page.waitForURL(/\/unit\//);
}
```

#### E2E Test Specs

```
e2e/import.spec.ts
  ✓ full import workflow: select file → preview → import → unit appears on dashboard
  ✓ importing same unit twice shows duplicate warning
  ✓ imported data persists after page reload

e2e/flashcards.spec.ts
  ✓ complete flashcard session: config → cards → flip → answer → summary
  ✓ progress persists: after a session, due count changes on unit page
  ✓ "Practice missed" creates a follow-up session with only missed cards

e2e/sentence-builder.spec.ts
  ✓ complete builder session: config → drag tiles → check → summary
  ✓ drag interaction works on mobile viewport (touch simulation)

e2e/cloze.spec.ts
  ✓ complete cloze session with multiple choice: select options → summary
  ✓ complete cloze session with free typing: type answers → summary
  ✓ typo tolerance accepts near-miss answers

e2e/progress.spec.ts
  ✓ progress page shows stats after completing sessions
  ✓ export progress produces valid JSON
  ✓ import progress restores data on a clean install
  ✓ reset progress clears scores but keeps units

e2e/pwa.spec.ts
  ✓ service worker registers successfully
  ✓ manifest is served with correct metadata
  ✓ app loads in offline mode after initial visit (if feasible in test env)
```

### Test Data Strategy

- **Unit tests:** use inline test data, constructed in `beforeEach` or via factory functions
- **Integration tests:** use `fake-indexeddb` which gives Dexie a real IndexedDB implementation in jsdom — seed data in `beforeEach`, clear DB in `afterEach`
- **E2E tests:** use a shared fixture JSON file; each test imports it fresh or relies on a pre-seeded state

```typescript
// src/test/factories.ts — test data factories
export function makeEntry(overrides?: Partial<Entry>): Entry {
  return {
    unitId: 1,
    categoryId: 1,
    sourceId: 'ent_test',
    german: 'spielen',
    english: 'to play',
    partOfSpeech: 'verb',
    grammarNotes: '',
    tags: [],
    ...overrides,
  };
}

export function makeFlashcardProgress(overrides?: Partial<FlashcardProgress>): FlashcardProgress {
  return {
    entryId: 1,
    unitId: 1,
    correctCount: 0,
    incorrectCount: 0,
    streak: 0,
    lastSeen: new Date().toISOString(),
    nextDue: new Date().toISOString(),
    bucket: 0,
    ...overrides,
  };
}

// Similarly: makeUnit, makeCategory, makeVerbForm, makeSentence, etc.
```

### Coverage Targets

- **Unit tests:** aim for 90%+ coverage on logic modules (`src/logic/`), 80%+ on database modules (`src/db/`)
- **Integration tests:** cover every user-facing component's primary interaction path
- **E2E tests:** cover every complete workflow (import → learn → review progress → export)

### Testing in Each Phase

| Phase | Unit Tests | Integration Tests | E2E Tests |
|-------|-----------|-------------------|-----------|
| 1 Foundation | DB schema, import logic, ID remapping | ImportPage, Dashboard | Import workflow, data persistence |
| 2 Flashcards | Leitner logic, scoring | FlashcardSession | Full flashcard session |
| 3 Builder | Tokeniser, distractors | SentenceBuilder | Full builder session with drag |
| 4 Cloze | Cloze generation, Levenshtein | ClozeSession | Full cloze session both modes |
| 5 Progress | Session aggregation | ProgressPage, SettingsPage | Export/import/reset progress |
| 6 PWA | — | — | Service worker, offline, manifest |

### CI Considerations

If you set up a CI pipeline later (e.g. GitHub Actions):

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run test -- --coverage
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      - run: npm run test:e2e
```

## Implementation Phases

### Phase 1: Foundation
- Vite + React + TypeScript + Tailwind scaffold
- Dexie database definition with all tables
- JSON import page with validation and ID remapping
- Dashboard showing imported units
- Basic routing
- **Tests:** DB schema tests, import logic unit tests, ImportPage integration test, E2E import workflow

### Phase 2: Flashcards
- Flashcard configuration screen
- Card component with flip animation
- Got it / Missed it flow
- Leitner bucket logic and spaced repetition scheduling
- Session summary and SessionLog recording
- FlashcardProgress updates
- **Tests:** Leitner logic unit tests, FlashcardSession integration test, E2E flashcard session

### Phase 3: Sentence Builder
- Sentence builder configuration screen
- Drag-and-drop tile interface using @dnd-kit
- Sentence tokenisation and distractor generation
- Check/validation logic
- Scoring and session logging
- **Tests:** Tokeniser + distractor unit tests, SentenceBuilder integration test, E2E builder session

### Phase 4: Cloze Tests
- Cloze configuration screen
- Question generation from stored sentences
- Multiple choice and free-type input modes
- Typo tolerance for free-type (Levenshtein)
- Feedback animations and session logging
- **Tests:** Cloze generation + Levenshtein unit tests, ClozeSession integration test, E2E both modes

### Phase 5: Progress & Settings
- Progress dashboard with per-unit stats
- Leitner bucket visualisation
- Session history list
- Export/import progress JSON
- Reset and delete functionality
- **Tests:** Aggregation unit tests, ProgressPage + SettingsPage integration tests, E2E export/import/reset

### Phase 6: PWA Polish
- Service worker configuration
- App icons (generate from a simple SVG)
- Install prompt handling
- Offline indicator
- Final responsive design pass
- **Tests:** E2E service worker, manifest, and offline tests

## Notes

- The Content Studio (for parsing worksheets via Claude API) is a separate Claude artifact, not part of this PWA. The PWA only consumes the exported JSON files.
- All data stays local on the device. No accounts, no server, no analytics.
- The JSON import should be robust to minor schema variations (missing optional fields like `tags`, `grammarNotes`, etc. should default gracefully).
- Progress export should include enough metadata to re-import into a fresh install (unit names for mapping, not just Dexie IDs).
