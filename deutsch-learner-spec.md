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

# Dev
npm run dev

# Build
npm run build

# Preview production build
npm run preview
```

## Implementation Phases

### Phase 1: Foundation
- Vite + React + TypeScript + Tailwind scaffold
- Dexie database definition with all tables
- JSON import page with validation and ID remapping
- Dashboard showing imported units
- Basic routing

### Phase 2: Flashcards
- Flashcard configuration screen
- Card component with flip animation
- Got it / Missed it flow
- Leitner bucket logic and spaced repetition scheduling
- Session summary and SessionLog recording
- FlashcardProgress updates

### Phase 3: Sentence Builder
- Sentence builder configuration screen
- Drag-and-drop tile interface using @dnd-kit
- Sentence tokenisation and distractor generation
- Check/validation logic
- Scoring and session logging

### Phase 4: Cloze Tests
- Cloze configuration screen
- Question generation from stored sentences
- Multiple choice and free-type input modes
- Typo tolerance for free-type (Levenshtein)
- Feedback animations and session logging

### Phase 5: Progress & Settings
- Progress dashboard with per-unit stats
- Leitner bucket visualisation
- Session history list
- Export/import progress JSON
- Reset and delete functionality

### Phase 6: PWA Polish
- Service worker configuration
- App icons (generate from a simple SVG)
- Install prompt handling
- Offline indicator
- Final responsive design pass

## Notes

- The Content Studio (for parsing worksheets via Claude API) is a separate Claude artifact, not part of this PWA. The PWA only consumes the exported JSON files.
- All data stays local on the device. No accounts, no server, no analytics.
- The JSON import should be robust to minor schema variations (missing optional fields like `tags`, `grammarNotes`, etc. should default gracefully).
- Progress export should include enough metadata to re-import into a fresh install (unit names for mapping, not just Dexie IDs).
