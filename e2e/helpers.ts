import { type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function importTestUnit(page: Page): Promise<void> {
  await page.goto('/#/import');
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.join(__dirname, 'fixtures', 'test-unit.json'));

  // Wait for preview to appear
  await page.waitForSelector('button[aria-label="Import unit"]');

  // Click import
  await page.getByRole('button', { name: /import unit/i }).click();

  // Wait for success
  await page.waitForSelector('text=Import successful!');
}

export async function clearAppData(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const DBDeleteRequest = indexedDB.deleteDatabase('DeutschLearner');
    await new Promise<void>((resolve, reject) => {
      DBDeleteRequest.onsuccess = () => resolve();
      DBDeleteRequest.onerror = () => reject(DBDeleteRequest.error);
      DBDeleteRequest.onblocked = () => resolve(); // resolve anyway
    });
  });
  await page.reload();
}
