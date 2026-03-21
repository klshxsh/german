import { describe, it, expect, afterEach } from 'vitest';
import { THEMES, DEFAULT_THEME_ID, applyTheme } from './themes';

afterEach(() => {
  // Reset to default theme so tests don't bleed
  applyTheme(DEFAULT_THEME_ID);
});

describe('THEMES', () => {
  it('exports exactly 6 themes', () => {
    expect(THEMES).toHaveLength(6);
  });

  it('includes terracotta as the default theme', () => {
    expect(DEFAULT_THEME_ID).toBe('terracotta');
    expect(THEMES.find((t) => t.id === 'terracotta')).toBeDefined();
  });

  it('includes all 6 named themes', () => {
    const ids = THEMES.map((t) => t.id);
    expect(ids).toContain('terracotta');
    expect(ids).toContain('ocean');
    expect(ids).toContain('forest');
    expect(ids).toContain('lavender');
    expect(ids).toContain('slate');
    expect(ids).toContain('midnight');
  });

  it('all themes have all required color keys', () => {
    const requiredKeys: (keyof (typeof THEMES)[0]['colors'])[] = [
      'bg', 'surface', 'border', 'text', 'textMuted', 'accent', 'accentLight', 'success', 'danger',
    ];
    for (const theme of THEMES) {
      for (const key of requiredKeys) {
        expect(theme.colors[key], `${theme.id}.colors.${key}`).toBeTruthy();
      }
    }
  });

  it('midnight theme has a dark background', () => {
    const midnight = THEMES.find((t) => t.id === 'midnight');
    expect(midnight?.colors.bg).toBe('#1A1D2E');
  });

  it('terracotta theme has the legacy accent colour', () => {
    const terracotta = THEMES.find((t) => t.id === 'terracotta');
    expect(terracotta?.colors.accent).toBe('#C4713B');
  });
});

describe('applyTheme', () => {
  it('sets --color-bg on documentElement', () => {
    applyTheme('terracotta');
    expect(document.documentElement.style.getPropertyValue('--color-bg')).toBe('#F6F1EB');
  });

  it('sets --color-accent on documentElement', () => {
    applyTheme('terracotta');
    expect(document.documentElement.style.getPropertyValue('--color-accent')).toBe('#C4713B');
  });

  it('sets all 9 CSS custom properties', () => {
    applyTheme('ocean');
    const props = [
      '--color-bg', '--color-surface', '--color-border', '--color-text',
      '--color-text-muted', '--color-accent', '--color-accent-light',
      '--color-success', '--color-danger',
    ];
    for (const prop of props) {
      expect(
        document.documentElement.style.getPropertyValue(prop),
        prop,
      ).toBeTruthy();
    }
  });

  it('falls back to terracotta for an unknown theme id', () => {
    applyTheme('nonexistent-theme');
    expect(document.documentElement.style.getPropertyValue('--color-accent')).toBe('#C4713B');
  });

  it('applies midnight theme correctly', () => {
    applyTheme('midnight');
    expect(document.documentElement.style.getPropertyValue('--color-bg')).toBe('#1A1D2E');
    expect(document.documentElement.style.getPropertyValue('--color-surface')).toBe('#252840');
  });

  it('switches theme when called again', () => {
    applyTheme('terracotta');
    expect(document.documentElement.style.getPropertyValue('--color-accent')).toBe('#C4713B');
    applyTheme('ocean');
    expect(document.documentElement.style.getPropertyValue('--color-accent')).toBe('#2B7A9E');
  });
});
