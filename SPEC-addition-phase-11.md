# Spec Addition: Content Browser & Build Pipeline

## Overview

Replace the manual JSON import workflow with a built-in content browser. Unit JSON files are hosted alongside the app on GitHub Pages. A build-time script generates an index of all available units. The app fetches this index and presents a browsable catalogue, allowing one-tap import of any unit via the existing import pipeline.

---

## Data Model Changes

### Unit Interface

Add `exportedAt` to the `Unit` interface to support update detection:

```typescript
interface Unit {
  id?: number;
  name: string;
  description: string;
  year: number;
  chapter: number;
  unitNumber: number;
  importedAt: string;    // ISO timestamp — when the user imported it
  exportedAt: string;    // ISO timestamp — from the JSON file's exportedAt field
  version: string;       // from JSON export
}
```

**Dexie schema version bump** — add a migration that sets `exportedAt` to `""` for any existing units that predate this change.

**Import process change** — step 5 (insert Unit record) must now also store the `exportedAt` value from the top-level JSON field.

---

## Content Index (`content/index.json`)

A generated file listing all available units. The app fetches this at a known relative path.

### Schema

```json
{
  "generatedAt": "2026-03-22T10:00:00.000Z",
  "units": [
    {
      "year": 9,
      "chapter": 1,
      "unitNumber": 1,
      "name": "Mein Vorbild",
      "description": "Talking about role models and personal qualities",
      "entryCount": 24,
      "version": "1.0",
      "exportedAt": "2026-03-15T14:30:00.000Z",
      "path": "y9/ch1/unit-1-mein-vorbild.json"
    }
  ]
}
```

### Field Sources

All fields are derived automatically — the index is never maintained by hand. Some fields come from inside the JSON file, others are parsed from the file's path.

**Path convention:** `.json/y{year}/ch{chapter}/unit-{unitNumber}-{slug}.json`

Example: `.json/y9/ch1/unit-2-in-meinem-leben.json` → year: 9, chapter: 1, unitNumber: 2

| Field | Source |
|-------|--------|
| `year` | Parsed from directory path: `y9` → 9 |
| `chapter` | Parsed from directory path: `ch1` → 1 |
| `unitNumber` | Parsed from filename: `unit-2-...` → 2 |
| `name` | `unit.name` from JSON |
| `description` | `unit.description` from JSON |
| `entryCount` | `entries.length` from JSON |
| `version` | top-level `version` from JSON |
| `exportedAt` | top-level `exportedAt` from JSON |
| `path` | relative path under the content directory, derived from the file's location on disk |
| `generatedAt` | timestamp of when the script ran |

The script should fail with a clear error if a filename doesn't match the expected convention.

### Sort Order

Units in the index are sorted by: `year` ascending, then `chapter` ascending, then `unitNumber` ascending.

---

## Build Script (`scripts/build-content.js`)

A Node script that generates the content index and copies unit files into the build output.

### Behaviour

1. Glob all `.json` files matching `.json/y*/**/*.json` from the repo root
2. For each file, parse the path to extract `year`, `chapter`, and `unitNumber`:
   - Path format: `.json/y{year}/ch{chapter}/unit-{unitNumber}-{slug}.json`
   - Use a regex: e.g. `/y(\d+)\/ch(\d+)\/unit-(\d+)-/`
   - If the path doesn't match the expected convention, log a warning and skip the file
3. Read each file and parse the JSON
4. Validate that each file has the required top-level fields (`unit`, `categories`, `entries`, `exportedAt`)
5. Extract `name` and `description` from `unit`, `entryCount` from `entries.length`, `version` and `exportedAt` from the top level
6. Derive the `path` by stripping the leading `.json/` from the file's location (e.g. `.json/y9/ch1/unit-1-mein-vorbild.json` → `y9/ch1/unit-1-mein-vorbild.json`)
7. Sort units by year, chapter, unitNumber
8. Write `public/content/index.json` with the full unit list and a `generatedAt` timestamp
9. Copy all unit JSON files into `public/content/`, preserving the folder structure (e.g. `.json/y9/ch1/*.json` → `public/content/y9/ch1/*.json`)
10. Log a summary: number of units processed, any validation warnings

### Error Handling

- If a JSON file fails to parse or is missing required fields, log a warning and skip it (don't fail the whole build)
- Exit with a non-zero code only if zero valid units are found

### npm Script

```json
{
  "scripts": {
    "build:content": "node scripts/build-content.js",
    "build": "vite build",
    "build:all": "npm run build:content && npm run build"
  }
}
```

The GitHub Action should call `npm run build:all` instead of `npm run build`.

---

## App Configuration

The app needs to know where to find the content index. Define a base URL constant:

```typescript
// src/config.ts
export const CONTENT_BASE_URL = import.meta.env.BASE_URL + 'content/';
```

This works because the content files are served from the same GitHub Pages origin as the app. The `BASE_URL` is set by Vite based on the `base` config (e.g. `/deutsch-learner/` if hosted at `username.github.io/deutsch-learner/`).

To fetch the index: `fetch(CONTENT_BASE_URL + 'index.json')`
To fetch a unit: `fetch(CONTENT_BASE_URL + unit.path)`

---

## Content Browser UI

### Location in the App

Add a **Browse** tab as the first/default tab on the existing import page, before the existing File, Paste, and URL tabs. The tab order becomes: **Browse | File | Paste | URL**.

When no units are imported and the user arrives at the import page (or taps "Import Unit" from the empty dashboard), the Browse tab is shown by default.

### Layout

The browser displays available units grouped in a collapsible hierarchy matching the dashboard structure:

- **Year** (e.g. "Year 9") — top-level group, sorted ascending
  - **Chapter** (e.g. "Chapter 1") — second-level group, sorted ascending
    - **Unit cards** — sorted by unitNumber ascending

### Unit Card

Each unit card in the browser shows:

- **Name** (e.g. "Mein Vorbild")
- **Description** (truncated to 2 lines if long)
- **Entry count** (e.g. "24 entries")
- **Status badge** — one of three states:
  - **Available** (default) — unit is not yet imported locally. Show an "Import" button.
  - **Imported** — unit exists locally and the local `exportedAt` matches the remote `exportedAt`. Show a muted "Imported" badge with a check mark. No action button.
  - **Update available** — unit exists locally but the remote `exportedAt` is newer than the local `exportedAt`. Show an "Update" button with a distinctive style (e.g. accent-coloured badge or outline).

### Status Detection Logic

On loading the browse tab:

1. Fetch `content/index.json`
2. Load all local units from Dexie
3. For each remote unit, find a local match by the composite key `[year, chapter, unitNumber]`
4. If no match → "Available"
5. If match exists and `local.exportedAt >= remote.exportedAt` → "Imported"
6. If match exists and `local.exportedAt < remote.exportedAt` → "Update available"

### Import Flow

Tapping "Import" or "Update" on a unit card:

1. Fetch the full unit JSON from `CONTENT_BASE_URL + unit.path`
2. Show a brief loading indicator on the card
3. **Inject `year`, `chapter`, and `unitNumber`** from the index entry into the fetched JSON's `unit` object before passing it to the import pipeline. The unit JSON files themselves do not contain these fields — they are derived from the file path at index-build time. This means the import pipeline receives a complete unit object and the user is never prompted to enter grouping metadata manually.
4. Feed the augmented JSON into the **existing import pipeline** (validation, preview, ID remapping, Dexie transaction)
5. For "Import": this is a new unit — standard insert flow
6. For "Update": the unit already exists — trigger the existing **replace** duplicate-handling path (delete old data, re-import)
7. On success, update the card's status badge to "Imported" without requiring a full page refresh
8. On failure, show an error message on the card (network error, parse error, etc.)

### Loading & Error States

- **Loading the index:** show a spinner or skeleton cards while fetching `index.json`
- **Index fetch failure:** show an error message with a retry button: "Couldn't load available content. Check your connection and try again."
- **Offline:** if `navigator.onLine` is false, show a message: "You're offline — browse content when you're back online." The existing File/Paste tabs still work offline.
- **Empty index:** if the index has zero units (unlikely but possible), show: "No content available yet."

---

## Deployed File Structure

After `npm run build:all`, the `dist/` output served by GitHub Pages looks like:

```
dist/
  index.html
  assets/
    ...                        # Vite-bundled JS, CSS, etc.
  content/
    index.json                 # generated catalogue
    y9/
      ch1/
        unit-1-mein-vorbild.json
        unit-2-in-meinem-leben.json
        unit-3-ich-habs-geschafft.json
        unit-4-beweg-dich.json
        unit-5-lass-dich-inspirieren.json
      ch4/
        unit-1-meine-kindheit.json
        unit-2-erinnerungen.json
        unit-3-grundschule-oder-sekundarschule.json
```

---

## Implementation Phase

### Phase 11: Content Browser

#### Build Script
- Create `scripts/build-content.js` — globs `.json/` folder, reads unit files, generates `content/index.json`, copies files to `public/content/`
- Add `build:content` and `build:all` npm scripts
- Update GitHub Action to use `build:all`

#### Data Model
- Add `exportedAt` field to `Unit` interface
- Dexie schema version bump with migration (default `exportedAt` to `""` for existing units)
- Update import logic to store `exportedAt` from JSON

#### Content Browser UI
- Add "Browse" tab as the default tab on the import page
- Fetch and display `content/index.json` grouped by year → chapter
- Status detection: compare local units against remote index by `[year, chapter, unitNumber]`
- Three badge states: Available, Imported, Update available
- "Import" and "Update" buttons feed into existing import pipeline
- Loading, error, and offline states

#### Tests

- **Unit tests:** build script path parsing extracts year/chapter/unitNumber correctly from various paths, path parsing rejects malformed filenames, build script generates correct index from fixture files, index sorting is correct, status detection logic (available / imported / update available) with various `exportedAt` comparisons
- **Integration tests:** Browse tab renders grouped unit list from mocked index, status badges display correctly for each state, tapping Import triggers the import pipeline, tapping Update triggers the replace flow, loading and error states render correctly
- **E2E tests:** Browse tab loads and displays available units, importing a unit from the browser updates its badge to "Imported", re-importing after content update shows "Update available" then resolves to "Imported"
