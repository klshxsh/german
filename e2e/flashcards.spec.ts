import { test, expect } from '@playwright/test';
import { importTestUnit, clearAppData } from './helpers';

test.beforeEach(async ({ page }) => {
  await clearAppData(page);
  await importTestUnit(page);
});

test.describe('Flashcard session', () => {
  test('navigates to flashcard config screen from unit page', async ({ page }) => {
    // After import, we're on the unit page
    await page.waitForURL(/\/#\/unit\//);
    await page.getByRole('button', { name: /flashcards/i }).click();

    await expect(page.getByText('Flashcards')).toBeVisible();
    await expect(page.getByText('German → English')).toBeVisible();
    await expect(page.getByRole('button', { name: /start session/i })).toBeVisible();
  });

  test('complete flashcard session: config → cards → flip → answer → summary', async ({
    page,
  }) => {
    await page.waitForURL(/\/#\/unit\//);
    await page.getByRole('button', { name: /flashcards/i }).click();

    // Config screen: reduce count to 10 (default)
    await expect(page.getByRole('button', { name: /start session/i })).toBeVisible();
    await page.getByRole('button', { name: /start session/i }).click();

    // First card should show
    await expect(page.getByText('Tap to reveal')).toBeVisible();
    await expect(page.getByText(/card 1 of/i)).toBeVisible();

    // Flip the card
    await page.getByText('Tap to reveal').click();

    // Answer buttons appear
    await expect(page.getByRole('button', { name: /got it/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /missed it/i })).toBeVisible();

    // Answer all cards
    let iterations = 0;
    while (iterations < 20) {
      const tapHint = page.getByText('Tap to reveal');
      const summaryHeading = page.getByText(/session complete/i);

      if (await summaryHeading.isVisible().catch(() => false)) break;
      if (!(await tapHint.isVisible().catch(() => false))) break;

      await tapHint.click();
      await expect(page.getByRole('button', { name: /got it/i })).toBeVisible();
      await page.getByRole('button', { name: /got it/i }).click();

      iterations++;
    }

    // Summary screen
    await expect(page.getByText(/session complete/i)).toBeVisible();
    await expect(page.getByText('100%')).toBeVisible();
    await expect(page.getByRole('button', { name: /back to unit/i })).toBeVisible();
  });

  test('progress persists: due count changes on unit page after session', async ({
    page,
  }) => {
    await page.waitForURL(/\/#\/unit\//);

    // Note initial due count
    const initialDueText = await page
      .locator('text=due')
      .first()
      .textContent()
      .catch(() => null);

    await page.getByRole('button', { name: /flashcards/i }).click();
    await page.getByRole('button', { name: /start session/i }).click();

    // Answer all cards correctly
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

    // Return to unit page
    await page.getByRole('button', { name: /back to unit/i }).click();
    await page.waitForURL(/\/#\/unit\//);

    // Reload to ensure we see persisted data
    await page.reload();
    await page.waitForURL(/\/#\/unit\//);

    // After correct answers, all cards move to bucket 1 (due in 1 day)
    // So the due count badge should be gone or show 0
    const dueBadge = page.locator('text=due');
    const hasDueBadge = await dueBadge.isVisible().catch(() => false);

    // If there was a due count before, it should have changed
    if (initialDueText) {
      // Either no badge or a different count
      const newDueText = await dueBadge.textContent().catch(() => null);
      expect(newDueText).not.toBe(initialDueText);
    } else {
      // No due badges — all cards have been pushed to future buckets
      expect(hasDueBadge).toBe(false);
    }
  });

  test('"Practice missed" creates a follow-up session with only missed cards', async ({
    page,
  }) => {
    await page.waitForURL(/\/#\/unit\//);
    await page.getByRole('button', { name: /flashcards/i }).click();
    await page.getByRole('button', { name: /start session/i }).click();

    // Answer all cards wrong
    let iterations = 0;
    while (iterations < 20) {
      if (await page.getByText(/session complete/i).isVisible().catch(() => false)) break;
      const tapHint = page.getByText('Tap to reveal');
      if (!(await tapHint.isVisible().catch(() => false))) break;
      await tapHint.click();
      await expect(page.getByRole('button', { name: /missed it/i })).toBeVisible();
      await page.getByRole('button', { name: /missed it/i }).click();
      iterations++;
    }

    await expect(page.getByText(/session complete/i)).toBeVisible();

    // "Practice missed" should be visible
    const practiceBtn = page.getByRole('button', { name: /practice missed/i });
    await expect(practiceBtn).toBeVisible();
    await practiceBtn.click();

    // New session starts with missed cards
    await expect(page.getByText('Tap to reveal')).toBeVisible();
    await expect(page.getByText(/card 1 of/i)).toBeVisible();
  });
});
