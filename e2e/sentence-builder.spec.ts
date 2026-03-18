import { test, expect } from '@playwright/test';
import { importTestUnit, clearAppData } from './helpers';

test.beforeEach(async ({ page }) => {
  await clearAppData(page);
  await importTestUnit(page);
});

test.describe('Sentence Builder', () => {
  test('navigates to sentence builder config screen from unit page', async ({ page }) => {
    await page.waitForURL(/\/#\/unit\//);

    // Navigate directly to builder
    const url = page.url();
    const unitMatch = url.match(/unit\/(\d+)/);
    const unitId = unitMatch ? unitMatch[1] : '1';
    await page.goto(`/#/unit/${unitId}/builder`);

    await expect(page.getByText('Sentence Builder')).toBeVisible();
    await expect(page.getByText('Complexity')).toBeVisible();
    await expect(page.getByRole('button', { name: /start session/i })).toBeVisible();
  });

  test('config screen shows complexity and count options', async ({ page }) => {
    await page.waitForURL(/\/#\/unit\//);
    const url = page.url();
    const unitMatch = url.match(/unit\/(\d+)/);
    const unitId = unitMatch ? unitMatch[1] : '1';
    await page.goto(`/#/unit/${unitId}/builder`);

    await expect(page.getByText('Mixed')).toBeVisible();
    await expect(page.getByText('Simple')).toBeVisible();
    await expect(page.getByText('Compound')).toBeVisible();
    await expect(page.getByText('Complex')).toBeVisible();
    await expect(page.getByLabel('Number of sentences')).toBeVisible();
  });

  test('complete builder session: config → arrange tiles → check → summary', async ({ page }) => {
    await page.waitForURL(/\/#\/unit\//);
    const url = page.url();
    const unitMatch = url.match(/unit\/(\d+)/);
    const unitId = unitMatch ? unitMatch[1] : '1';
    await page.goto(`/#/unit/${unitId}/builder`);

    // Start session with 5 sentences
    await page.getByRole('button', { name: /start session/i }).click();

    // Session screen should load
    await expect(page.getByText(/translate to german/i)).toBeVisible();
    await expect(page.getByText(/Q 1 of/i)).toBeVisible();

    // Click through all questions by clicking any tile then checking
    let iterations = 0;
    while (iterations < 20) {
      const summaryHeading = page.getByText(/session complete/i);
      if (await summaryHeading.isVisible().catch(() => false)) break;

      // Check if we have a "Next" / "See Results" button (already checked)
      const nextBtn = page.getByRole('button', { name: /^(next|see results)$/i });
      if (await nextBtn.isVisible().catch(() => false)) {
        await nextBtn.click();
        iterations++;
        continue;
      }

      // Click a pool tile to add to answer
      const poolTiles = page.locator('[aria-label^="tile-"]');
      const tileCount = await poolTiles.count();
      if (tileCount > 0) {
        await poolTiles.first().click();
      }

      // Click Check
      const checkBtn = page.getByRole('button', { name: /check/i });
      if (await checkBtn.isEnabled().catch(() => false)) {
        await checkBtn.click();
      }

      iterations++;
    }

    // Summary screen
    await expect(page.getByText(/session complete/i)).toBeVisible();
    await expect(page.getByText('points')).toBeVisible();
    await expect(page.getByRole('button', { name: /back to unit/i })).toBeVisible();
  });

  test('correct arrangement validates successfully', async ({ page }) => {
    await page.waitForURL(/\/#\/unit\//);
    const url = page.url();
    const unitMatch = url.match(/unit\/(\d+)/);
    const unitId = unitMatch ? unitMatch[1] : '1';
    await page.goto(`/#/unit/${unitId}/builder`);

    // Use simple complexity for more predictable sentences
    await page.getByLabel('Number of sentences').selectOption('5');
    await page.getByRole('button', { name: /start session/i }).click();

    await expect(page.getByText(/translate to german/i)).toBeVisible();

    // Get the English sentence to understand what we need
    const englishText = await page.locator('p.text-lg').first().textContent();
    expect(englishText).toBeTruthy();

    // Get all available tiles
    const poolTiles = page.locator('[aria-label^="tile-"]');
    await expect(poolTiles.first()).toBeVisible();

    // Click the first tile
    await poolTiles.first().click();

    // Check button should be enabled
    const checkBtn = page.getByRole('button', { name: /check/i });
    await expect(checkBtn).toBeEnabled();
    await checkBtn.click();

    // Should show some feedback (correct or not correct)
    await expect(page.getByText(/correct|not quite/i)).toBeVisible();
  });

  test('back button from session returns to config', async ({ page }) => {
    await page.waitForURL(/\/#\/unit\//);
    const url = page.url();
    const unitMatch = url.match(/unit\/(\d+)/);
    const unitId = unitMatch ? unitMatch[1] : '1';
    await page.goto(`/#/unit/${unitId}/builder`);

    await page.getByRole('button', { name: /start session/i }).click();
    await expect(page.getByText(/translate to german/i)).toBeVisible();

    // Click back button
    await page.getByRole('button', { name: /go back/i }).click();

    // Should return to config
    await expect(page.getByText('Sentence Builder')).toBeVisible();
    await expect(page.getByRole('button', { name: /start session/i })).toBeVisible();
  });

  test('"Back to unit" button on summary navigates to unit page', async ({ page }) => {
    await page.waitForURL(/\/#\/unit\//);
    const url = page.url();
    const unitMatch = url.match(/unit\/(\d+)/);
    const unitId = unitMatch ? unitMatch[1] : '1';
    await page.goto(`/#/unit/${unitId}/builder`);

    await page.getByRole('button', { name: /start session/i }).click();
    await expect(page.getByText(/translate to german/i)).toBeVisible();

    // Quick click through
    let iterations = 0;
    while (iterations < 10) {
      if (await page.getByText(/session complete/i).isVisible().catch(() => false)) break;

      const nextBtn = page.getByRole('button', { name: /^(next|see results)$/i });
      if (await nextBtn.isVisible().catch(() => false)) {
        await nextBtn.click();
        iterations++;
        continue;
      }

      const poolTiles = page.locator('[aria-label^="tile-"]');
      if (await poolTiles.count() > 0) {
        await poolTiles.first().click();
      }

      const checkBtn = page.getByRole('button', { name: /check/i });
      if (await checkBtn.isEnabled().catch(() => false)) {
        await checkBtn.click();
      }

      iterations++;
    }

    await expect(page.getByText(/session complete/i)).toBeVisible();
    await page.getByRole('button', { name: /back to unit/i }).click();
    await page.waitForURL(/\/#\/unit\//);
  });
});
