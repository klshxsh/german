import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InstallBanner } from './InstallBanner';
import { db } from '../db/db';
import { getSetting } from '../db/settings';

function mockMatchMedia(standalone: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: query === '(display-mode: standalone)' ? standalone : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function mockUserAgent(ua: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
}

afterEach(async () => {
  await db.appSettings.clear();
  vi.restoreAllMocks();
});

describe('InstallBanner', () => {
  describe('when app is already installed (standalone mode)', () => {
    beforeEach(() => {
      mockMatchMedia(true);
    });

    it('does not show the banner', async () => {
      render(<InstallBanner />);
      // Give async effect time to run
      await act(async () => {});
      expect(screen.queryByRole('banner', { name: /install/i })).not.toBeInTheDocument();
    });
  });

  describe('when app is not installed', () => {
    beforeEach(() => {
      mockMatchMedia(false);
    });

    it('shows iOS instructions for iOS user agents', async () => {
      mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15');
      render(<InstallBanner />);
      await waitFor(() => {
        expect(screen.getByRole('banner', { name: /install/i })).toBeInTheDocument();
      });
      expect(screen.getByText(/share button/i)).toBeInTheDocument();
      expect(screen.getByText(/add to home screen/i)).toBeInTheDocument();
    });

    it('does not show banner for non-iOS without beforeinstallprompt', async () => {
      mockUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      render(<InstallBanner />);
      await act(async () => {});
      expect(screen.queryByRole('banner', { name: /install/i })).not.toBeInTheDocument();
    });

    it('shows Android instructions when beforeinstallprompt fires', async () => {
      mockUserAgent('Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36');
      render(<InstallBanner />);

      const promptEvent = new Event('beforeinstallprompt');
      await act(async () => {
        window.dispatchEvent(promptEvent);
      });

      await waitFor(() => {
        expect(screen.getByRole('banner', { name: /install/i })).toBeInTheDocument();
      });
      expect(screen.getByText(/menu/i)).toBeInTheDocument();
    });

    it('hides banner and stores dismissal when dismiss button clicked (iOS)', async () => {
      mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)');
      render(<InstallBanner />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));

      await waitFor(() => {
        expect(screen.queryByRole('banner', { name: /install/i })).not.toBeInTheDocument();
      });

      const dismissed = await getSetting('installBannerDismissed');
      expect(dismissed).toBe('true');
    });

    it('does not show banner if already dismissed in DB', async () => {
      mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)');
      await db.appSettings.add({ key: 'installBannerDismissed', value: 'true' });

      render(<InstallBanner />);
      await act(async () => {});

      // Wait a bit for async DB check
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.queryByRole('banner', { name: /install/i })).not.toBeInTheDocument();
    });
  });
});
