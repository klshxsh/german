#!/usr/bin/env node
/**
 * build-content.js
 * Globs .json/ folder, reads unit files, generates public/content/index.json,
 * and copies unit files to public/content/ preserving folder structure.
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const JSON_DIR = join(ROOT, '.json');
const OUTPUT_DIR = join(ROOT, 'public', 'content');

/** Recursively collect all .json files under a directory. */
function getAllJsonFiles(dir) {
  const results = [];
  let items;
  try {
    items = readdirSync(dir);
  } catch {
    return results;
  }
  for (const item of items) {
    const fullPath = join(dir, item);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      results.push(...getAllJsonFiles(fullPath));
    } else if (item.endsWith('.json')) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Path regex: matches y{year}/ch{chapter}/unit-{unitNumber}- */
const PATH_RE = /y(\d+)\/ch(\d+)\/unit-(\d+)-/;

const units = [];
let warnings = 0;

const files = getAllJsonFiles(JSON_DIR);

for (const file of files) {
  const relPath = relative(JSON_DIR, file).replace(/\\/g, '/');

  // Validate path convention
  const match = relPath.match(PATH_RE);
  if (!match) {
    console.warn(`WARNING: Skipping "${relPath}" — doesn't match expected path convention (y{year}/ch{chapter}/unit-{n}-{slug}.json)`);
    warnings++;
    continue;
  }

  const year = parseInt(match[1], 10);
  const chapter = parseInt(match[2], 10);
  const unitNumber = parseInt(match[3], 10);

  // Parse JSON
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf-8'));
  } catch (err) {
    console.warn(`WARNING: Skipping "${relPath}" — JSON parse error: ${err.message}`);
    warnings++;
    continue;
  }

  // Validate required fields
  if (!data.unit || !Array.isArray(data.categories) || !Array.isArray(data.entries) || !data.exportedAt) {
    console.warn(`WARNING: Skipping "${relPath}" — missing required fields (unit, categories, entries, exportedAt)`);
    warnings++;
    continue;
  }

  units.push({
    year,
    chapter,
    unitNumber,
    name: data.unit.name ?? '',
    description: data.unit.description ?? '',
    entryCount: data.entries.length,
    version: data.version ?? '1.0',
    exportedAt: data.exportedAt,
    path: relPath,
  });
}

// Sort: year asc, chapter asc, unitNumber asc
units.sort((a, b) => a.year - b.year || a.chapter - b.chapter || a.unitNumber - b.unitNumber);

if (units.length === 0) {
  console.error('ERROR: No valid units found in .json/. Exiting.');
  process.exit(1);
}

// Write index.json
mkdirSync(OUTPUT_DIR, { recursive: true });
const index = {
  generatedAt: new Date().toISOString(),
  units,
};
writeFileSync(join(OUTPUT_DIR, 'index.json'), JSON.stringify(index, null, 2), 'utf-8');

// Copy unit files preserving folder structure
for (const unit of units) {
  const src = join(JSON_DIR, unit.path);
  const dest = join(OUTPUT_DIR, unit.path);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

console.log(`build-content: Processed ${units.length} unit(s), ${warnings} warning(s).`);
