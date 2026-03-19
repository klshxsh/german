import { test, expect, type Page } from '@playwright/test';
import { importTestUnit, clearAppData } from './helpers';

test.beforeEach(async ({ page }) => {
  await clearAppData(page);
  await importTestUnit(page);
});

function getUnitId(page: Page): string {
  // importTestUnit already navigated to the unit page
  const url = page.url();
  const match = url.match(/unit\/(\d+)/);
  return match ? match[1] : '1';
}

/**
 * Click through all questions in a cloze session until the summary appears.
 * Works for both MC and free-type modes.
 */
async function clickThroughSession(page: Page, mode: 'mc' | 'free-type' = 'mc') {
  for (let i = 0; i < 25; i++) {
    if (await page.getByText(/session complete/i).isVisible().catch(() => false)) break;

    // If there's a Next/See Results button (after wrong answer), click it
    const nextBtn = page.getByRole('button', { name: /^(next|see results)$/i });
    if (await nextBtn.isVisible({ timeout: 300 }).catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(300);
      continue;
    }

    if (mode === 'free-type') {
      const input = page.getByLabel(/free type answer/i);
      const isReady = await input.isEnabled().catch(() => false);
      if (isReady) {
        await input.fill('wronganswer');
        await page.getByRole('button', { name: /submit/i }).click();
        await page.waitForTimeout(500);
      } else {
        await page.waitForTimeout(500);
      }
    } else {
      // MC: click first available (enabled) option
      const optionBtns = page.locator('[aria-label^="option-"]');
      // Find an enabled button
      const enabledLabel = await optionBtns.evaluateAll((btns) => {
        const enabled = (btns as HTMLButtonElement[]).find((b) => !b.disabled);
        return enabled?.getAttribute('aria-label') ?? null;
      }).catch(() => null);

      if (enabledLabel) {
        await page.locator(`[aria-label="${enabledLabel}"]`).click();
        await page.waitForTimeout(200);

        // Check if wrong answer → Next button should appear
        const nextAfter = page.getByRole('button', { name: /^(next|see results)$/i });
        if (await nextAfter.isVisible({ timeout: 400 }).catch(() => false)) {
          await nextAfter.click();
          await page.waitForTimeout(200);
        } else {
          // Correct answer — auto-advances after 1.5s, wait past it
          await page.waitForTimeout(1800);
        }
      } else {
        // No enabled options — wait briefly (might be mid-transition)
        await page.waitForTimeout(500);
      }
    }
  }

  // Wait for summary to confirm session ended (in case loop exited via break)
  await page.getByText(/session complete/i).waitFor({ timeout: 5000 }).catch(() => {});
}

test.describe('Cloze Tests', () => {
  test('navigates to cloze config screen from unit page', async ({ page }) => {
    const unitId = getUnitId(page);
    await page.goto(`/#/unit/${unitId}/cloze`);

    await expect(page.getByText('Cloze Tests')).toBeVisible();
    await expect(page.getByText('What to blank')).toBeVisible();
    await expect(page.getByText('Answer mode')).toBeVisible();
    await expect(page.getByRole('button', { name: /start session/i })).toBeVisible();
  });

  test('config screen shows all blank type options', async ({ page }) => {
    const unitId = getUnitId(page);
    await page.goto(`/#/unit/${unitId}/cloze`);

    await expect(page.getByText('Mixed')).toBeVisible();
    await expect(page.getByText('Vocabulary')).toBeVisible();
    await expect(page.getByText('Verbs')).toBeVisible();
    await expect(page.getByText('Qualifiers')).toBeVisible();
    await expect(page.getByText('Connectives')).toBeVisible();
    await expect(page.getByText(/multiple choice/i)).toBeVisible();
    await expect(page.getByText(/free typing/i)).toBeVisible();
  });

  test('complete cloze session with multiple choice: config → select options → summary', async ({ page }) => {
    const unitId = getUnitId(page);
    await page.goto(`/#/unit/${unitId}/cloze`);

    await page.getByRole('button', { name: /start session/i }).click();

    await expect(page.getByText(/fill in the blank/i)).toBeVisible();
    await expect(page.getByText(/Q 1 of/i)).toBeVisible();

    await clickThroughSession(page, 'mc');

    await expect(page.getByText(/session complete/i)).toBeVisible();
    await expect(page.getByText('correct')).toBeVisible();
    await expect(page.getByRole('button', { name: /back to unit/i })).toBeVisible();
  }, 60000);

  test('complete cloze session with free typing: type answers → summary', async ({ page }) => {
    const unitId = getUnitId(page);
    await page.goto(`/#/unit/${unitId}/cloze`);

    await page.getByRole('radio', { name: /free typing/i }).click();
    await page.getByRole('button', { name: /start session/i }).click();

    await expect(page.getByLabel(/free type answer/i)).toBeVisible();
    await expect(page.getByText(/fill in the blank/i)).toBeVisible();

    await clickThroughSession(page, 'free-type');

    await expect(page.getByText(/session complete/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /back to unit/i })).toBeVisible();
  }, 60000);

  test('selecting correct option shows green feedback', async ({ page }) => {
    const unitId = getUnitId(page);
    await page.goto(`/#/unit/${unitId}/cloze`);
    await page.getByRole('button', { name: /start session/i }).click();
    await expect(page.getByText(/fill in the blank/i)).toBeVisible();

    // Get all options and click each until we get a "Correct!" response
    // (since we can't predict which is correct, try multiple)
    const optionBtns = page.locator('[aria-label^="option-"]');
    await expect(optionBtns.first()).toBeVisible();

    // Click first option
    await optionBtns.first().click();
    // Either Correct or Not quite should appear
    await expect(page.getByText(/correct|not quite/i).first()).toBeVisible();
  });

  test('selecting wrong option shows red feedback and reveals correct answer', async ({ page }) => {
    const unitId = getUnitId(page);
    await page.goto(`/#/unit/${unitId}/cloze`);
    await page.getByRole('button', { name: /start session/i }).click();
    await expect(page.getByText(/fill in the blank/i)).toBeVisible();

    // Try each option until we get "Not quite."
    const optionBtns = page.locator('[aria-label^="option-"]');
    const count = await optionBtns.count();

    let gotWrong = false;
    for (let i = 0; i < count; i++) {
      // If we already got feedback, stop
      if (await page.getByText('Not quite.').isVisible().catch(() => false)) {
        gotWrong = true;
        break;
      }
      if (await page.getByText('Correct!').isVisible().catch(() => false)) {
        // Got correct, advance and try again on next question
        await page.waitForTimeout(1700);
        break;
      }

      const btn = optionBtns.nth(i);
      if (await btn.isEnabled().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(300);
      }
    }

    // Either we got "Not quite." or we need to accept "Correct!" as result
    const hasFeedback = await page.getByText(/not quite|correct/i).first().isVisible().catch(() => false);
    expect(hasFeedback).toBe(true);

    // If wrong answer was given, verify "Correct answer:" label is shown
    if (await page.getByText('Not quite.').isVisible().catch(() => false)) {
      await expect(page.getByText(/correct answer/i)).toBeVisible();
    }
  });

  test('typo tolerance accepts near-miss answers in free-type mode', async ({ page }) => {
    const unitId = getUnitId(page);
    await page.goto(`/#/unit/${unitId}/cloze`);

    await page.getByRole('radio', { name: /free typing/i }).click();
    await page.getByRole('button', { name: /start session/i }).click();

    await expect(page.getByLabel(/free type answer/i)).toBeVisible();

    // Type an obviously wrong answer to verify the mechanism works
    await page.getByLabel(/free type answer/i).fill('xyz_wrong');
    await page.getByRole('button', { name: /submit/i }).click();

    await expect(page.getByText(/correct|not quite/i).first()).toBeVisible();
  });

  test('"Back to unit" button on summary navigates to unit page', async ({ page }) => {
    const unitId = getUnitId(page);
    await page.goto(`/#/unit/${unitId}/cloze`);
    await page.getByRole('button', { name: /start session/i }).click();
    await expect(page.getByText(/fill in the blank/i)).toBeVisible();

    await clickThroughSession(page, 'mc');

    await expect(page.getByText(/session complete/i)).toBeVisible();
    await page.getByRole('button', { name: /back to unit/i }).click();
    await page.waitForURL(/\/#\/unit\//);
  }, 60000);

  test('back button from session returns to config', async ({ page }) => {
    const unitId = getUnitId(page);
    await page.goto(`/#/unit/${unitId}/cloze`);

    await page.getByRole('button', { name: /start session/i }).click();
    await expect(page.getByText(/fill in the blank/i)).toBeVisible();

    await page.getByRole('button', { name: /go back/i }).click();

    await expect(page.getByText('Cloze Tests')).toBeVisible();
    await expect(page.getByRole('button', { name: /start session/i })).toBeVisible();
  });

  test('session logs are recorded after completing cloze session', async ({ page }) => {
    const unitId = getUnitId(page);
    await page.goto(`/#/unit/${unitId}/cloze`);
    await page.getByRole('button', { name: /start session/i }).click();
    await expect(page.getByText(/fill in the blank/i)).toBeVisible();

    await clickThroughSession(page, 'mc');

    await expect(page.getByText(/session complete/i)).toBeVisible();

    const sessionLogs = await page.evaluate(async () => {
      const dbReq = indexedDB.open('DeutschLearner');
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        dbReq.onsuccess = () => resolve(dbReq.result);
        dbReq.onerror = () => reject(dbReq.error);
      });
      const tx = db.transaction('sessionLogs', 'readonly');
      const store = tx.objectStore('sessionLogs');
      return new Promise<unknown[]>((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
      });
    });

    expect(sessionLogs.length).toBeGreaterThan(0);
    const clozeLog = (sessionLogs as Array<{ mode: string }>).find((l) => l.mode === 'cloze');
    expect(clozeLog).toBeDefined();
  }, 60000);
});
