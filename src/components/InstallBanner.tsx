import { useState, useEffect, useRef } from 'react';
import { getSetting, setSetting } from '../db/settings';

const DISMISSED_KEY = 'installBannerDismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches;
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallBanner() {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other');
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) return;

    getSetting(DISMISSED_KEY).then((val) => {
      if (val === 'true') return;
      if (isIOS()) {
        setPlatform('ios');
        setVisible(true);
      }
    }).catch(() => {});

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      getSetting(DISMISSED_KEY).then((val) => {
        if (val !== 'true') {
          setPlatform('android');
          setVisible(true);
        }
      }).catch(() => {});
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleDismiss = async () => {
    setVisible(false);
    await setSetting(DISMISSED_KEY, 'true');
  };

  const handleInstall = async () => {
    if (deferredPrompt.current) {
      await deferredPrompt.current.prompt();
      const { outcome } = await deferredPrompt.current.userChoice;
      deferredPrompt.current = null;
      if (outcome === 'accepted') {
        setVisible(false);
        await setSetting(DISMISSED_KEY, 'true');
      }
    }
  };

  if (!visible) return null;

  return (
    <div
      role="banner"
      aria-label="Install app banner"
      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm"
      style={{ backgroundColor: '#C4713B', color: '#FFFFFF' }}
    >
      <span className="flex-1">
        {platform === 'ios'
          ? "Tap the share button ↑ then 'Add to Home Screen' to install"
          : "Tap the menu ⋮ then 'Install app' to install"}
      </span>
      {platform === 'android' && deferredPrompt.current && (
        <button
          onClick={handleInstall}
          className="font-semibold underline shrink-0"
          aria-label="Install app"
        >
          Install
        </button>
      )}
      <button
        onClick={handleDismiss}
        aria-label="Dismiss install banner"
        className="shrink-0 p-1 rounded"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
