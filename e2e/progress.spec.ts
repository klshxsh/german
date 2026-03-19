import { test, expect } from '@playwright/test';
import { importTestUnit, clearAppData } from './helpers';

test.beforeEach(async ({ page }) => {
  await clearAppData(page);
  await importTestUnit(page);
});

test.describe('Progress page', () => {
  test('progress page shows stats after completing sessions', async ({ page }) => {
    // Run a quick flashcard session first
    await page.goto('/#/');
    await page.getByRole('button', { name: /flashcards/i }).first().click();
    await page.getByRole('button', { name: /start session/i }).click();

    let iterations = 0;
    while (iterations < 20) {
      if (await page.getByText(/session complete/i).isVisible().catch(() => false)) break;
      const tapHint = page.getByText('Tap to reveal');
      if (!(await tapHint.isVisible().catch(() => false))) break;
      await tapHint.click();
      await expect(page.getByRole('button', { name: /got it/i })).toBeVisible();
      await page.getByRole('button', { name: /got it/i }).click();
      iterations++;
    }

    await expect(page.getByText(/session complete/i)).toBeVisible();

    // Navigate to progress page
    await page.getByRole('link', { name: /progress/i }).click();
    await page.waitForURL(/\/#\/progress/);

    // Should show stats
    await expect(page.getByText('Progress')).toBeVisible();
    await expect(page.getByText('Total Cards')).toBeVisible();
    await expect(page.getByText('Accuracy')).toBeVisible();
    await expect(page.getByText('Sessions')).toBeVisible();

    // Sessions count should be at least 1
    await expect(page.getByText('Session History')).toBeVisible();
    await expect(page.getByText('Flashcards')).toBeVisible();
  });

  test('progress page shows per-unit bucket breakdown', async ({ page }) => {
    await page.goto('/#/progress');
    await page.waitForURL(/\/#\/progress/);

    await expect(page.getByText('Leitner Buckets by Unit')).toBeVisible();
  });
});

test.describe('Settings page', () => {
  test('export progress produces valid JSON', async ({ page }) => {
    // Complete a session to have some progress to export
    await page.goto('/#/');
    await page.getByRole('button', { name: /flashcards/i }).first().click();
    await page.getByRole('button', { name: /start session/i }).click();

    let iterations = 0;
    while (iterations < 20) {
      if (await page.getByText(/session complete/i).isVisible().catch(() => false)) break;
      const tapHint = page.getByText('Tap to reveal');
      if (!(await tapHint.isVisible().catch(() => false))) break;
      await tapHint.click();
      await page.getByRole('button', { name: /got it/i }).click();
      iterations++;
    }

    // Navigate to settings
    await page.getByRole('link', { name: /settings/i }).click();
    await page.waitForURL(/\/#\/settings/);

    // Grant clipboard permission and mock it
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: () => Promise.resolve(),
        },
        configurable: true,
      });
    });

    await page.getByRole('button', { name: /generate export/i }).click();

    // Textarea with JSON should appear
    await expect(page.getByRole('textbox')).toBeVisible();

    const jsonText = await page.getByRole('textbox').inputValue();
    const parsed = JSON.parse(jsonText) as {
      flashcardProgress: unknown[];
      sessionLogs: unknown[];
      version: string;
    };
    expect(Array.isArray(parsed.flashcardProgress)).toBe(true);
    expect(Array.isArray(parsed.sessionLogs)).toBe(true);
    expect(parsed.flashcardProgress.length).toBeGreaterThan(0);
    expect(parsed.sessionLogs.length).toBeGreaterThan(0);
  });

  test('reset progress clears scores but keeps units', async ({ page }) => {
    await page.goto('/#/settings');
    await page.waitForURL(/\/#\/settings/);

    // Click Reset All Progress
    await page.getByRole('button', { name: /reset all progress/i }).click();

    // Confirmation dialog
    await expect(page.getByText('Reset Progress?')).toBeVisible();
    await page.getByRole('button', { name: /^reset$/i }).click();

    // Success message
    await expect(page.getByText('Progress has been reset.')).toBeVisible();

    // Navigate to progress page — units should still be there
    await page.getByRole('link', { name: /progress/i }).click();
    await page.waitForURL(/\/#\/progress/);

    // The unit should still show in the bucket breakdown
    await expect(page.getByText('Leitner Buckets by Unit')).toBeVisible();
    // Test unit should still be listed
    const unitSection = page.getByText(/test unit/i);
    await expect(unitSection.first()).toBeVisible();
  });

  test('import progress restores data', async ({ page }) => {
    // First, export current progress
    await page.goto('/#/settings');
    await page.waitForURL(/\/#\/settings/);

    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.resolve() },
        configurable: true,
      });
    });

    await page.getByRole('button', { name: /generate export/i }).click();
    await expect(page.getByRole('textbox')).toBeVisible();

    const jsonText = await page.getByRole('textbox').inputValue();

    // Reset progress
    await page.getByRole('button', { name: /reset all progress/i }).click();
    await expect(page.getByText('Reset Progress?')).toBeVisible();
    await page.getByRole('button', { name: /^reset$/i }).click();
    await expect(page.getByText('Progress has been reset.')).toBeVisible();

    // Now import the exported progress via file
    const importInput = page
      .getByText('Choose File')
      .locator('..')
      .locator('input[type="file"]');

    await importInput.setInputFiles({
      name: 'progress.json',
      mimeType: 'application/json',
      buffer: Buffer.from(jsonText),
    });

    await expect(page.getByText('Progress imported successfully!')).toBeVisible();
  });

  test('delete unit removes it and all data', async ({ page }) => {
    await page.goto('/#/settings');
    await page.waitForURL(/\/#\/settings/);

    // Find the delete button for the test unit
    await expect(page.getByText(/test unit/i)).toBeVisible();
    await page.getByRole('button', { name: /delete/i }).first().click();

    // Confirmation
    await expect(page.getByText('Delete Unit?')).toBeVisible();
    await page.getByRole('button', { name: /^delete$/i }).click();

    // Success
    await expect(page.getByText(/has been deleted/i)).toBeVisible();

    // Navigate to dashboard - no units should remain
    await page.goto('/#/');
    await expect(page.getByText(/no units/i)).toBeVisible();
  });
});
