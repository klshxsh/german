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
  year: number;          // school year, e.g. 9
  chapter: number;       // chapter number, e.g. 3
  unitNumber: number;    // unit within the chapter, e.g. 1
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
      units: '++id, name, [year+chapter+unitNumber]',
      categories: '++id, unitId, sourceId',
      entries: '++id, unitId, categoryId, sourceId, partOfSpeech, german, english',
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

1. User selects a `.json` file via file picker (or pastes JSON, or provides a URL — see Phase 6)
2. App validates the structure (must have `unit`, `categories`, `entries` at minimum)
3. Check for duplicate units (by name) — offer to replace or skip
4. Prompt the user for unit grouping metadata if not present in the JSON: **year** (number), **chapter** (number), and **unit number** (number). Show these as editable fields pre-populated from the JSON if available, or blank if not. The user must fill these in before import proceeds.
5. Insert `Unit` record (including year, chapter, unitNumber), get auto-increment ID
6. Insert `Category` records, building a `sourceId -> dexieId` mapping
7. Insert `Entry` records, remapping `categoryId` from source IDs to Dexie IDs
8. Insert `VerbForm` records, remapping `entryId`
9. Insert `SentenceTemplate` and `GeneratedSentence` records, remapping IDs
10. Initialise `FlashcardProgress` for all entries with bucket=0, nextDue=now

All inserts should be wrapped in a Dexie transaction for atomicity.

### Expected JSON Shape

```json
{
  "unit": { "name": "...", "description": "...", "year": 9, "chapter": 3, "unitNumber": 1 },
  "categories": [{ "id": "cat_1", "name": "...", ... }],
  "entries": [{ "id": "ent_1", "categoryId": "cat_1", "german": "...", "english": "...", ... }],
  "verbForms": [{ "id": "vf_1", "entryId": "ent_1", ... }],
  "sentenceTemplates": [{ "id": "tpl_1", ... }],
  "generatedSentences": [{ "id": "sen_1", "templateId": "tpl_1", "usedEntryIds": ["ent_1"], ... }],
  "version": "1.0",
  "exportedAt": "..."
}
```

Note: `year`, `chapter`, and `unitNumber` are optional in the JSON. If missing, the import page prompts the user to provide them. The Content Studio could be updated later to include these fields in the export.

## App Structure & Routing

```
/                    → Dashboard (unit list grouped by year/chapter, quick stats)
/import              → JSON import page
/search              → Cross-unit vocabulary search
/unit/:id            → Unit overview (category breakdown, progress summary)
/unit/:id/flashcards → Flashcard mode
/unit/:id/builder    → Sentence builder mode
/unit/:id/cloze      → Cloze test mode
/progress            → Overall progress & stats
/settings            → Export/import progress, reset data
```

## Page Specifications

### Dashboard (`/`)

- Units displayed in a collapsible hierarchy: **Year → Chapter → Units**
  - Top level: Year groups (e.g. "Year 9", "Year 10"), sorted descending (most recent first)
  - Second level: Chapters within each year (e.g. "Chapter 1", "Chapter 2"), sorted numerically
  - Third level: Unit cards within each chapter, sorted by unit number
- Each year group is collapsible (click to expand/collapse), with state persisted in IndexedDB
- Each unit card shows: name, entry count, last practiced, overall accuracy %
- Quick-start buttons for each learning mode on each unit card
- "Import Unit" button (navigates to `/import`)
- If no units imported, show an onboarding message with import prompt
- If a unit is missing year/chapter/unitNumber metadata, group it under an "Ungrouped" section at the bottom

### Search Page (`/search`)

A cross-unit vocabulary lookup tool. This is for when the user thinks "how do I say X in German?" or "I've seen this word before, which unit was it in?"

**Search input:**
- Single search bar at the top of the page, always visible
- Searches both German and English fields simultaneously
- Search is case-insensitive and uses substring matching (not just prefix)
- Debounced input (300ms) to avoid excessive querying while typing
- Results update live as the user types

**Results display:**
- Results grouped by unit (with year/chapter/unit label), then by category within each unit
- Each result shows:
  - The German text (with the matched substring highlighted)
  - The English translation (with the matched substring highlighted)
  - The category name (as a badge)
  - The unit name and year/chapter label
  - Part of speech
- If the match is in a verb form (infinitive or past participle), also show the verb conjugation row
- If the match appears in a generated sentence, show the full sentence with the match highlighted
- Tap on a result to navigate to that unit's overview page

**Search scope:**
- Entries (german + english fields)
- Verb forms (infinitive, present3rd, pastParticiple fields)
- Generated sentences (german + english fields)

**Implementation notes:**
- Use Dexie's `where().startsWithIgnoreCase()` for indexed prefix searches, or `filter()` for substring matching. Since the dataset is small (hundreds of entries, not millions), a full table scan with `.filter()` is fine and gives more flexible matching.
- Consider caching the full entry list in memory on page load for instant search — with typical worksheet sizes this will be well under 1MB.
- Show a "No results" message with the search term when nothing matches
- Show result count: "12 results across 3 units"

### Import Page (`/import`)

- Three import methods presented as tabs or segmented control: **File**, **Paste**, **URL**
  - **File:** file picker accepting `.json` (works on desktop and mobile via Files/iCloud)
  - **Paste:** large text area for pasting JSON directly (quickest on desktop from Content Studio)
  - **URL:** text input for a raw JSON URL, e.g. GitHub Gist raw URL (best for phone import)
- All three methods feed into the same validation and preview flow:
  - Validation summary showing what was found (X categories, Y entries, Z sentences)
  - Preview of categories and entry count per category
  - Import button, with duplicate handling (replace / skip / cancel)
  - Success message with link to the unit page
- See Phase 6 for full details on the mobile import workflow

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
- Bottom tab bar on mobile: Dashboard, Search, Progress, Settings
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

### Phase 6: Unit Grouping

- Add `year`, `chapter`, and `unitNumber` fields to the Unit table (Dexie schema version bump)
- Migration: existing units get `year: 0, chapter: 0, unitNumber: 0` as defaults, with a prompt to edit them on next visit to the dashboard
- Import flow: add editable year/chapter/unitNumber fields to the import preview screen, pre-populated from JSON if present
- Dashboard: replace flat unit list with collapsible Year → Chapter → Unit hierarchy
  - Year groups sorted descending (newest first)
  - Chapters sorted numerically ascending (e.g. Chapter 1, Chapter 2, ...)
  - Units sorted by unitNumber within each chapter
  - Collapse state persisted in IndexedDB (or a simple `localStorage`-style key)
  - "Ungrouped" section at the bottom for units with missing metadata
- Unit overview page: show year/chapter/unit label in the header
- Allow editing unit metadata (year, chapter, unitNumber) from the unit overview page
- **Tests:**
  - **Unit tests:** grouping sort logic (year descending, chapter ascending, unitNumber ascending), migration defaults
  - **Integration tests:** Dashboard renders grouped hierarchy, collapse/expand works and persists, unit metadata editing saves correctly
  - **E2E tests:** Import unit with metadata → appears in correct group on dashboard, edit metadata → unit moves to correct group

### Phase 7: Cross-Unit Search

- New `/search` route accessible from the bottom navigation bar
- Search bar with debounced input (300ms), searches German and English fields simultaneously
- Searches across: entries, verb forms (infinitive, present3rd, pastParticiple), and generated sentences
- Case-insensitive substring matching using Dexie `.filter()`
- Results grouped by unit (with year/chapter label), then by category
- Each result shows: German text, English translation, category badge, unit label, part of speech
- Matched substrings highlighted in both German and English text
- Tapping a result navigates to the unit overview page
- Result count displayed: "12 results across 3 units"
- Empty state: "No results for '...'" message
- **Tests:**
  - **Unit tests:** search logic with various query types (German, English, partial match, case insensitive, umlaut handling)
  - **Integration tests:** Search page renders results with highlighting, tapping result navigates, debounce works correctly, empty state displays
  - **E2E tests:** Search across multiple units returns correct results, search for German and English terms both work

### Phase 8: Mobile Import

The existing file picker import works on desktop but is clunky on mobile. Add two additional import methods to the import page, presented as tabs or segmented control: **File**, **Paste**, **URL**.

**Paste JSON import:**
- Large text area where the user can paste the full JSON string
- Validate on paste (or on a "Parse" button press)
- Show the same preview/confirmation flow as the file import
- This is the quickest path on desktop (copy from Content Studio export modal, paste into app)

**Import from URL:**
- Text input field for a URL pointing to a raw JSON file
- Fetch the URL, parse the JSON, then show the same preview/confirmation flow
- Must handle CORS — works with GitHub Gist raw URLs (`https://gist.githubusercontent.com/...`), GitHub Pages, and any server with permissive CORS headers
- Show a clear error if the fetch fails (network error, CORS blocked, invalid JSON)
- Optionally: save recently used URLs in IndexedDB so the user can re-import updated versions easily
- This is the best path for phone import — the user saves their JSON exports as GitHub Gists (or to any static host), then just pastes the URL on the phone

**Suggested workflow for phone users:**
1. Export JSON from Content Studio (copy to clipboard)
2. Create a GitHub Gist and paste the JSON (or save to a file on GitHub Pages / iCloud-accessible location)
3. On phone, open the app → Import → URL tab → paste the Gist raw URL → Import
4. Bookmark or save the URL for future re-imports when content is updated

- **Tests:**
  - **Unit tests:** URL fetch logic with mocked responses (success, CORS error, invalid JSON, network failure)
  - **Integration tests:** Paste import flow renders and validates, URL import flow fetches and validates, tab switching works
  - **E2E tests:** Complete import via paste, complete import via URL (using a local test server for the fixture JSON)

### Phase 9: PWA Polish

#### PWA Configuration
- Service worker via vite-plugin-pwa with Workbox and `registerType: 'autoUpdate'`
- Cache strategy: precache all app assets (JS, CSS, HTML, fonts, icons) at install time
- App manifest with `"display": "standalone"`, portrait orientation, theme colour `#C4713B`
- App icons at 192x192 and 512x512 (generate from a simple SVG)

#### Install Prompt
- Detect if the app is running in a browser (not yet installed) using `window.matchMedia('(display-mode: standalone)')`
- If not installed, show a dismissable banner with platform-specific instructions:
  - **iOS:** "Tap the share button ↑ then 'Add to Home Screen'"
  - **Android:** "Tap the menu ⋮ then 'Install app'" (or handle the `beforeinstallprompt` event to show a native install button)
- Store dismissal in IndexedDB so the banner doesn't reappear after the user dismisses it
- The banner should be subtle and not block usage — a small strip at the top or bottom

#### Offline Indicator
- Detect online/offline state via `navigator.onLine` and the `online`/`offline` window events
- When offline, show a small non-intrusive indicator (e.g. a thin amber bar at the top: "You're offline — everything still works")
- All learning modes work fully offline since data is in IndexedDB and app is cached

#### Final Responsive Pass
- Test all pages on mobile viewport (390×844 iPhone 14, 360×800 common Android)
- Ensure touch targets are at least 44px
- Flashcard flip gesture area should be the full card, not just a small button
- Sentence builder drag-and-drop must work well with touch (verify @dnd-kit touch sensor)
- Bottom navigation bar should not overlap with iOS safe area (use `env(safe-area-inset-bottom)`)
- Import page tabs/segments should be usable with one hand

- **Tests:**
  - **Integration tests:** Install banner display/dismissal, offline indicator shows/hides
  - **E2E tests:** Service worker registration, manifest served correctly, offline mode loads app

## Notes

- The Content Studio (for parsing worksheets via Claude API) is a separate Claude artifact, not part of this PWA. The PWA only consumes the exported JSON files.
- All data stays local on the device. No accounts, no server, no analytics.
- The JSON import should be robust to minor schema variations (missing optional fields like `tags`, `grammarNotes`, etc. should default gracefully).
- Progress export should include enough metadata to re-import into a fresh install (unit names for mapping, not just Dexie IDs).
