import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { clearAppData } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Fixture JSON — same as test-unit.json but without year/chapter/unitNumber
// (the browse flow injects those from the index entry)
const fixturePath = path.join(__dirname, 'fixtures', 'test-unit.json');
const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');
const fixtureData = JSON.parse(fixtureJson);

// Strip year/chapter/unitNumber to simulate a pure content-server file
const contentUnitJson = {
  ...fixtureData,
  unit: {
    name: fixtureData.unit.name,
    description: fixtureData.unit.description,
  },
};
const contentUnitJsonStr = JSON.stringify(contentUnitJson);

const mockIndex = {
  generatedAt: '2026-03-22T10:00:00.000Z',
  units: [
    {
      year: 9,
      chapter: 1,
      unitNumber: 1,
      name: fixtureData.unit.name,
      description: fixtureData.unit.description,
      entryCount: fixtureData.entries.length,
      version: fixtureData.version ?? '1.0',
      exportedAt: fixtureData.exportedAt ?? '2026-03-15T00:00:00.000Z',
      path: 'y9/ch1/unit-1-in-meinem-leben.json',
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.goto('/#/');
  await clearAppData(page);
});

test('Browse tab is shown by default on import page', async ({ page }) => {
  await page.goto('/#/import');

  // Mock the content index fetch
  await page.route('**/content/index.json', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ generatedAt: '', units: [] }),
    });
  });

  const browseTab = page.getByRole('tab', { name: /browse/i });
  await expect(browseTab).toHaveAttribute('aria-selected', 'true');
});

test('Browse tab loads and displays available units', async ({ page }) => {
  // Route must be set up before navigation so requests are intercepted from the start
  await page.route('**/content/index.json', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockIndex),
    });
  });

  await page.goto('/#/import');

  await expect(page.getByText('Year 9')).toBeVisible();
  await expect(page.getByText('Chapter 1')).toBeVisible();
  await expect(page.getByText(fixtureData.unit.name)).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(`import ${fixtureData.unit.name}`, 'i') })).toBeVisible();
});

test('importing a unit from the browser updates its badge to Imported', async ({ page }) => {
  await page.route('**/content/index.json', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockIndex),
    });
  });

  await page.route('**/content/y9/ch1/unit-1-in-meinem-leben.json', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: contentUnitJsonStr,
    });
  });

  await page.goto('/#/import');

  // Wait for the unit card to appear
  const importBtn = page.getByRole('button', { name: new RegExp(`import ${fixtureData.unit.name}`, 'i') });
  await expect(importBtn).toBeVisible();

  // Import it
  await importBtn.click();

  // Badge should update to "Imported" (no page reload needed)
  await expect(page.getByLabelText(`${fixtureData.unit.name} already imported`)).toBeVisible({ timeout: 10000 });
});

test('Browse tab shows error state when index fails to load', async ({ page }) => {
  await page.route('**/content/index.json', (route) => {
    route.abort('failed');
  });

  await page.goto('/#/import');

  await expect(page.getByText(/couldn't load available content/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();
});

test('re-importing after content update shows Update available then resolves to Imported', async ({ page }) => {
  // First, import the unit via file tab so it exists locally
  await page.goto('/#/import');
  const fileInput = page.locator('input[type="file"]');

  // Click File tab first
  await page.getByRole('tab', { name: /file/i }).click();
  await fileInput.setInputFiles(fixturePath);

  await page.waitForSelector('button[aria-label="Import unit"]');
  await page.getByRole('button', { name: /import unit/i }).click();
  await page.waitForSelector('text=Import successful!');

  // Now navigate back to import page with a mock index that has a NEWER exportedAt
  const newerIndex = {
    ...mockIndex,
    units: [
      {
        ...mockIndex.units[0],
        exportedAt: '2099-01-01T00:00:00.000Z', // much newer
      },
    ],
  };

  await page.route('**/content/index.json', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(newerIndex),
    });
  });

  await page.route('**/content/y9/ch1/unit-1-in-meinem-leben.json', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: contentUnitJsonStr,
    });
  });

  // Navigate fresh to import page
  await page.goto('/#/import');

  // Should show Update button
  await expect(page.getByRole('button', { name: new RegExp(`update ${fixtureData.unit.name}`, 'i') })).toBeVisible();

  // Update it
  await page.getByRole('button', { name: new RegExp(`update ${fixtureData.unit.name}`, 'i') }).click();

  // Should resolve to Imported
  await expect(page.getByLabelText(`${fixtureData.unit.name} already imported`)).toBeVisible({ timeout: 10000 });
});
