import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { clearAppData } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, 'fixtures', 'test-unit.json');

test.beforeEach(async ({ page }) => {
  await page.goto('/#/');
  await clearAppData(page);
});

test('full import workflow: select file → preview → import → unit appears on dashboard', async ({ page }) => {
  // Navigate to import page
  await page.goto('/#/import');

  // Select the test fixture file
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(fixturePath);

  // Preview should appear
  await expect(page.getByText('In meinem Leben')).toBeVisible();

  // Should show category and entry counts
  await expect(page.locator('text=Categories').first()).toBeVisible();
  await expect(page.locator('text=Entries').first()).toBeVisible();

  // Click import
  await page.getByRole('button', { name: /import unit/i }).click();

  // Should show success
  await expect(page.getByText('Import successful!')).toBeVisible();

  // Click "View Unit" to go to the unit page
  await page.getByRole('button', { name: /view unit/i }).click();

  // Should be on the unit overview page
  await expect(page.getByText('In meinem Leben')).toBeVisible();
});

test('imported unit appears on dashboard', async ({ page }) => {
  // Import the unit
  await page.goto('/#/import');
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(fixturePath);
  await page.waitForSelector('button[aria-label="Import unit"]');
  await page.getByRole('button', { name: /import unit/i }).click();
  await page.waitForSelector('text=Import successful!');

  // Navigate to dashboard
  await page.goto('/#/');

  // Unit should appear
  await expect(page.getByText('In meinem Leben')).toBeVisible();
});

test('importing same unit twice shows duplicate warning', async ({ page }) => {
  // Import first time
  await page.goto('/#/import');
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(fixturePath);
  await page.waitForSelector('button[aria-label="Import unit"]');
  await page.getByRole('button', { name: /import unit/i }).click();
  await page.waitForSelector('text=Import successful!');

  // Import again
  await page.goto('/#/import');
  const fileInput2 = page.locator('input[type="file"]');
  await fileInput2.setInputFiles(fixturePath);
  await page.waitForSelector('button[aria-label="Import unit"]');
  await page.getByRole('button', { name: /import unit/i }).click();

  // Should show duplicate warning
  await expect(page.getByText(/unit already exists/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /replace/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /keep existing/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
});

test('imported data persists after page reload', async ({ page }) => {
  // Import the unit
  await page.goto('/#/import');
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(fixturePath);
  await page.waitForSelector('button[aria-label="Import unit"]');
  await page.getByRole('button', { name: /import unit/i }).click();
  await page.waitForSelector('text=Import successful!');

  // Reload the page
  await page.reload();

  // Navigate to dashboard
  await page.goto('/#/');

  // Unit should still be there
  await expect(page.getByText('In meinem Leben')).toBeVisible();
});
