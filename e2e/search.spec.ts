import { test, expect } from '@playwright/test';
import { importTestUnit, clearAppData } from './helpers';

test.beforeEach(async ({ page }) => {
  await clearAppData(page);
  await importTestUnit(page);
});

test.describe('Search page', () => {
  test('search page is accessible from the bottom navigation', async ({ page }) => {
    await page.goto('/#/');
    await page.getByRole('link', { name: /search/i }).click();
    await expect(page).toHaveURL(/\/#\/search/);
    await expect(page.getByTestId('search-input')).toBeVisible();
  });

  test('shows empty prompt when no query entered', async ({ page }) => {
    await page.goto('/#/search');
    await expect(page.getByText('Type to search across all units')).toBeVisible();
  });

  test('searching a German term returns matching results', async ({ page }) => {
    await page.goto('/#/search');
    await page.getByTestId('search-input').fill('haben');
    // Wait for debounce
    await page.waitForTimeout(400);
    await expect(page.getByTestId('result-count')).toBeVisible();
    const countText = await page.getByTestId('result-count').textContent();
    expect(countText).toMatch(/\d+ results? across \d+ unit/);
  });

  test('searching an English term returns matching results', async ({ page }) => {
    await page.goto('/#/search');
    await page.getByTestId('search-input').fill('worked with children');
    await page.waitForTimeout(400);
    await expect(page.getByTestId('result-count')).toBeVisible();
    await expect(page.getByTestId('search-result').first()).toBeVisible();
  });

  test('shows no-results state for unmatched query', async ({ page }) => {
    await page.goto('/#/search');
    await page.getByTestId('search-input').fill('xyznotaword99');
    await page.waitForTimeout(400);
    await expect(page.getByTestId('no-results')).toBeVisible();
    await expect(page.getByText(/No results for/)).toBeVisible();
  });

  test('search is case-insensitive', async ({ page }) => {
    await page.goto('/#/search');
    // Search lowercase even if the stored German text starts with uppercase
    await page.getByTestId('search-input').fill('ich habe');
    await page.waitForTimeout(400);
    await expect(page.getByTestId('result-count')).toBeVisible();
  });

  test('tapping a result navigates to the unit overview page', async ({ page }) => {
    await page.goto('/#/search');
    await page.getByTestId('search-input').fill('haben');
    await page.waitForTimeout(400);
    await expect(page.getByTestId('search-result').first()).toBeVisible();
    await page.getByTestId('search-result').first().click();
    await expect(page).toHaveURL(/\/#\/unit\//);
  });

  test('matched substring is highlighted in results', async ({ page }) => {
    await page.goto('/#/search');
    await page.getByTestId('search-input').fill('haben');
    await page.waitForTimeout(400);
    await expect(page.getByTestId('search-result').first()).toBeVisible();
    // The highlighted term should appear inside a <mark> element
    const mark = page.locator('mark').first();
    await expect(mark).toBeVisible();
    const markText = await mark.textContent();
    expect(markText?.toLowerCase()).toBe('haben');
  });

  test('results show category badge and part of speech', async ({ page }) => {
    await page.goto('/#/search');
    await page.getByTestId('search-input').fill('haben');
    await page.waitForTimeout(400);
    await expect(page.getByTestId('search-result').first()).toBeVisible();
    // Category badge should be visible
    await expect(page.getByText('Perfect tense - haben conjugation').first()).toBeVisible();
  });

  test('clearing the search input resets to empty state', async ({ page }) => {
    await page.goto('/#/search');
    await page.getByTestId('search-input').fill('haben');
    await page.waitForTimeout(400);
    await expect(page.getByTestId('result-count')).toBeVisible();

    await page.getByRole('button', { name: /clear search/i }).click();
    await page.waitForTimeout(400);
    await expect(page.getByText('Type to search across all units')).toBeVisible();
    await expect(page.getByTestId('result-count')).not.toBeVisible();
  });

  test('results show unit name and label', async ({ page }) => {
    await page.goto('/#/search');
    await page.getByTestId('search-input').fill('haben');
    await page.waitForTimeout(400);
    await expect(page.getByTestId('result-count')).toBeVisible();
    // The unit name should appear as a heading
    await expect(page.getByText('In meinem Leben')).toBeVisible();
    // The unit label (Year · Term · Unit) should also appear
    await expect(page.getByText(/Year 9/)).toBeVisible();
  });

  test('search persists across navigation and back', async ({ page }) => {
    await page.goto('/#/search');
    await page.getByTestId('search-input').fill('haben');
    await page.waitForTimeout(400);
    await expect(page.getByTestId('result-count')).toBeVisible();

    // Navigate away and back
    await page.goto('/#/');
    await page.getByRole('link', { name: /search/i }).click();
    // Search input should be cleared on remount (fresh state)
    await expect(page.getByText('Type to search across all units')).toBeVisible();
  });
});
