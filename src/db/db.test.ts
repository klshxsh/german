import { describe, it, expect, afterEach } from 'vitest';
import { db } from './db';
import { makeUnit, makeCategory, makeEntry } from '../test/factories';

afterEach(async () => {
  await db.units.clear();
  await db.categories.clear();
  await db.entries.clear();
  await db.verbForms.clear();
  await db.sentenceTemplates.clear();
  await db.generatedSentences.clear();
  await db.flashcardProgress.clear();
  await db.sessionLogs.clear();
});

describe('DeutschDB schema', () => {
  it('creates all tables', () => {
    expect(db.units).toBeDefined();
    expect(db.categories).toBeDefined();
    expect(db.entries).toBeDefined();
    expect(db.verbForms).toBeDefined();
    expect(db.sentenceTemplates).toBeDefined();
    expect(db.generatedSentences).toBeDefined();
    expect(db.flashcardProgress).toBeDefined();
    expect(db.sessionLogs).toBeDefined();
  });

  it('auto-increments unit IDs', async () => {
    const id1 = await db.units.add(makeUnit({ name: 'Unit A' }));
    const id2 = await db.units.add(makeUnit({ name: 'Unit B' }));

    expect(typeof id1).toBe('number');
    expect(typeof id2).toBe('number');
    expect(id2).toBeGreaterThan(id1);
  });

  it('auto-increments category IDs', async () => {
    const unitId = await db.units.add(makeUnit());
    const id1 = await db.categories.add(makeCategory({ unitId, sourceId: 'cat_1' }));
    const id2 = await db.categories.add(makeCategory({ unitId, sourceId: 'cat_2' }));

    expect(typeof id1).toBe('number');
    expect(typeof id2).toBe('number');
    expect(id2).toBeGreaterThan(id1);
  });

  it('auto-increments entry IDs', async () => {
    const unitId = await db.units.add(makeUnit());
    const catId = await db.categories.add(makeCategory({ unitId }));
    const id1 = await db.entries.add(makeEntry({ unitId, categoryId: catId, sourceId: 'ent_1' }));
    const id2 = await db.entries.add(makeEntry({ unitId, categoryId: catId, sourceId: 'ent_2' }));

    expect(id2).toBeGreaterThan(id1);
  });

  it('stores and retrieves a unit by name', async () => {
    const unit = makeUnit({ name: 'Schulalltag' });
    await db.units.add(unit);

    const found = await db.units.where('name').equals('Schulalltag').first();
    expect(found).toBeDefined();
    expect(found?.name).toBe('Schulalltag');
  });

  it('stores year, term, and unitNumber on units', async () => {
    await db.units.add(makeUnit({ name: 'Grouped', year: 9, term: 'Spring', unitNumber: 3 }));

    const found = await db.units.where('name').equals('Grouped').first();
    expect(found?.year).toBe(9);
    expect(found?.term).toBe('Spring');
    expect(found?.unitNumber).toBe(3);
  });

  it('uses 0/Unknown/0 defaults for ungrouped units', async () => {
    await db.units.add(makeUnit({ name: 'Ungrouped', year: 0, term: 'Unknown', unitNumber: 0 }));

    const found = await db.units.where('name').equals('Ungrouped').first();
    expect(found?.year).toBe(0);
    expect(found?.term).toBe('Unknown');
    expect(found?.unitNumber).toBe(0);
  });

  it('stores and retrieves entries by unitId', async () => {
    const unitId = await db.units.add(makeUnit());
    const catId = await db.categories.add(makeCategory({ unitId }));

    await db.entries.add(makeEntry({ unitId, categoryId: catId, sourceId: 'ent_1', german: 'Hund' }));
    await db.entries.add(makeEntry({ unitId, categoryId: catId, sourceId: 'ent_2', german: 'Katze' }));

    const entries = await db.entries.where('unitId').equals(unitId).toArray();
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.german)).toContain('Hund');
    expect(entries.map((e) => e.german)).toContain('Katze');
  });

  it('stores and retrieves flashcardProgress by entryId', async () => {
    const unitId = await db.units.add(makeUnit());
    const catId = await db.categories.add(makeCategory({ unitId }));
    const entryId = await db.entries.add(makeEntry({ unitId, categoryId: catId }));

    await db.flashcardProgress.add({
      entryId,
      unitId,
      correctCount: 3,
      incorrectCount: 1,
      streak: 3,
      lastSeen: new Date().toISOString(),
      nextDue: new Date().toISOString(),
      bucket: 1,
    });

    const progress = await db.flashcardProgress.where('entryId').equals(entryId).first();
    expect(progress).toBeDefined();
    expect(progress?.bucket).toBe(1);
    expect(progress?.correctCount).toBe(3);
  });
});
