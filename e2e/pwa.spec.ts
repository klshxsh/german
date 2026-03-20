import { test, expect } from '@playwright/test';
import { clearAppData } from './helpers';

test.beforeEach(async ({ page }) => {
  await clearAppData(page);
});

test.describe('PWA: manifest', () => {
  test('manifest is served and contains required fields', async ({ page }) => {
    await page.goto('/');
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveCount(1);

    const manifestHref = await manifestLink.getAttribute('href');
    expect(manifestHref).toBeTruthy();

    const response = await page.request.get(manifestHref!);
    expect(response.ok()).toBe(true);

    const manifest = await response.json() as Record<string, unknown>;
    expect(manifest.name).toBe('Deutsch Learner');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#C4713B');
    expect(Array.isArray(manifest.icons)).toBe(true);
  });
});

test.describe('PWA: service worker', () => {
  test('service worker is registered', async ({ page }) => {
    await page.goto('/');
    // Wait for SW to register
    await page.waitForTimeout(1000);

    const swRegistered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const registrations = await navigator.serviceWorker.getRegistrations();
      return registrations.length > 0;
    });

    expect(swRegistered).toBe(true);
  });
});

test.describe('PWA: offline mode', () => {
  test('app loads and shows offline indicator when network is offline', async ({
    page,
    context,
  }) => {
    // Load the app first while online
    await page.goto('/');
    await expect(page.getByText('Home')).toBeVisible();

    // Wait for service worker caching
    await page.waitForTimeout(1500);

    // Go offline
    await context.setOffline(true);

    // Reload — should still load from cache
    await page.reload();

    // App should still render (cached)
    await expect(page.getByText('Home')).toBeVisible({ timeout: 10000 });

    // Offline indicator should be shown
    await expect(page.getByText(/you're offline/i)).toBeVisible();
  });

  test('offline indicator disappears when coming back online', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);

    // Go offline then back online
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText(/you're offline/i)).toBeVisible({ timeout: 10000 });

    await context.setOffline(false);
    await expect(page.getByText(/you're offline/i)).not.toBeVisible({ timeout: 5000 });
  });
});
