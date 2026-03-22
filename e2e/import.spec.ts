import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { clearAppData } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, 'fixtures', 'test-unit.json');

test.beforeEach(async ({ page }) => {
  await page.goto('/#/');
  await clearAppData(page);
  // Return an empty content index so the Browse tab doesn't show a fetch error
  await page.route('**/content/index.json', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ generatedAt: '', units: [] }),
    });
  });
});

// ── File import ───────────────────────────────────────────────────────────────

test('full import workflow: select file → preview → import → unit appears on dashboard', async ({ page }) => {
  await page.goto('/#/import');

  // Switch to File tab (Browse is now the default)
  await page.getByRole('tab', { name: /file/i }).click();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(fixturePath);

  await expect(page.getByText('In meinem Leben')).toBeVisible();
  await expect(page.locator('text=Categories').first()).toBeVisible();
  await expect(page.locator('text=Entries').first()).toBeVisible();

  await page.getByRole('button', { name: /import unit/i }).click();

  await expect(page.getByText('Import successful!')).toBeVisible();

  await page.getByRole('button', { name: /view unit/i }).click();

  await expect(page.getByText('In meinem Leben')).toBeVisible();
});

test('imported unit appears on dashboard', async ({ page }) => {
  await page.goto('/#/import');
  await page.getByRole('tab', { name: /file/i }).click();
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(fixturePath);
  await page.waitForSelector('button[aria-label="Import unit"]');
  await page.getByRole('button', { name: /import unit/i }).click();
  await page.waitForSelector('text=Import successful!');

  await page.goto('/#/');

  await expect(page.getByText('In meinem Leben')).toBeVisible();
});

test('importing same unit twice shows duplicate warning', async ({ page }) => {
  await page.goto('/#/import');
  await page.getByRole('tab', { name: /file/i }).click();
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(fixturePath);
  await page.waitForSelector('button[aria-label="Import unit"]');
  await page.getByRole('button', { name: /import unit/i }).click();
  await page.waitForSelector('text=Import successful!');

  // Navigate away then back so the component remounts fresh
  await page.goto('/#/');
  await page.goto('/#/import');
  await page.getByRole('tab', { name: /file/i }).click();
  const fileInput2 = page.locator('input[type="file"]');
  await fileInput2.setInputFiles(fixturePath);
  await page.waitForSelector('button[aria-label="Import unit"]');
  await page.getByRole('button', { name: /import unit/i }).click();

  await expect(page.getByText(/unit already exists/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /replace/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /keep existing/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
});

test('imported data persists after page reload', async ({ page }) => {
  await page.goto('/#/import');
  await page.getByRole('tab', { name: /file/i }).click();
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(fixturePath);
  await page.waitForSelector('button[aria-label="Import unit"]');
  await page.getByRole('button', { name: /import unit/i }).click();
  await page.waitForSelector('text=Import successful!');

  await page.reload();
  await page.goto('/#/');

  await expect(page.getByText('In meinem Leben')).toBeVisible();
});

// ── Paste import ──────────────────────────────────────────────────────────────

test('complete import via paste: paste JSON → preview → import → success', async ({ page }) => {
  const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');

  await page.goto('/#/import');

  // Switch to Paste tab
  await page.getByRole('tab', { name: /paste/i }).click();

  // Paste the JSON into the textarea
  const textarea = page.getByRole('textbox', { name: /paste json/i });
  await textarea.fill(fixtureJson);

  // Parse it
  await page.getByRole('button', { name: /parse pasted json/i }).click();

  // Preview heading should appear (use heading role to avoid matching textarea content)
  await expect(page.getByRole('heading', { name: 'In meinem Leben' })).toBeVisible();
  await expect(page.locator('text=Categories').first()).toBeVisible();

  // Import
  await page.getByRole('button', { name: /import unit/i }).click();

  // Success
  await expect(page.getByText('Import successful!')).toBeVisible();

  // Navigate to unit
  await page.getByRole('button', { name: /view unit/i }).click();
  await expect(page.getByRole('heading', { name: 'In meinem Leben' })).toBeVisible();
});

test('paste tab shows error for invalid JSON', async ({ page }) => {
  await page.goto('/#/import');

  await page.getByRole('tab', { name: /paste/i }).click();

  const textarea = page.getByRole('textbox', { name: /paste json/i });
  await textarea.fill('{ this is not valid json }');

  await page.getByRole('button', { name: /parse pasted json/i }).click();

  await expect(page.getByText('Import failed')).toBeVisible();
});

// ── URL import ────────────────────────────────────────────────────────────────

test('complete import via URL: fetch JSON → preview → import → success', async ({ page }) => {
  const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');

  // Intercept the URL request and serve the fixture JSON
  await page.route('https://gist.githubusercontent.com/test/fixture.json', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: fixtureJson,
    });
  });

  await page.goto('/#/import');

  // Switch to URL tab
  await page.getByRole('tab', { name: /url/i }).click();

  // Enter the URL
  const urlInput = page.getByRole('textbox', { name: /json url/i });
  await urlInput.fill('https://gist.githubusercontent.com/test/fixture.json');

  // Fetch
  await page.getByRole('button', { name: /fetch json from url/i }).click();

  // Preview heading should appear
  await expect(page.getByRole('heading', { name: 'In meinem Leben' })).toBeVisible();
  await expect(page.locator('text=Categories').first()).toBeVisible();

  // Import
  await page.getByRole('button', { name: /import unit/i }).click();

  // Success
  await expect(page.getByText('Import successful!')).toBeVisible();

  // Navigate to unit
  await page.getByRole('button', { name: /view unit/i }).click();
  await expect(page.getByRole('heading', { name: 'In meinem Leben' })).toBeVisible();
});

test('URL tab shows error on network failure', async ({ page }) => {
  // Intercept request and simulate network failure
  await page.route('https://gist.githubusercontent.com/test/fail.json', (route) => {
    route.abort('failed');
  });

  await page.goto('/#/import');

  await page.getByRole('tab', { name: /url/i }).click();

  const urlInput = page.getByRole('textbox', { name: /json url/i });
  await urlInput.fill('https://gist.githubusercontent.com/test/fail.json');

  await page.getByRole('button', { name: /fetch json from url/i }).click();

  await expect(page.getByText('Import failed')).toBeVisible();
});

test('URL tab shows error for non-JSON response', async ({ page }) => {
  await page.route('https://gist.githubusercontent.com/test/html.json', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html>Not JSON</html>',
    });
  });

  await page.goto('/#/import');

  await page.getByRole('tab', { name: /url/i }).click();

  const urlInput = page.getByRole('textbox', { name: /json url/i });
  await urlInput.fill('https://gist.githubusercontent.com/test/html.json');

  await page.getByRole('button', { name: /fetch json from url/i }).click();

  await expect(page.getByText('Import failed')).toBeVisible();
});

test('recently used URLs appear after a successful URL fetch', async ({ page }) => {
  const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');
  const testUrl = 'https://gist.githubusercontent.com/test/fixture.json';

  await page.route(testUrl, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: fixtureJson,
    });
  });

  await page.goto('/#/import');
  await page.getByRole('tab', { name: /url/i }).click();

  const urlInput = page.getByRole('textbox', { name: /json url/i });
  await urlInput.fill(testUrl);
  await page.getByRole('button', { name: /fetch json from url/i }).click();

  await expect(page.getByRole('heading', { name: 'In meinem Leben' })).toBeVisible();
  await expect(page.getByText('Recently used')).toBeVisible();
  await expect(page.getByRole('button', { name: /use recent url/i })).toBeVisible();
});
