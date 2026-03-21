export interface ThemeColors {
  bg: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentLight: string;
  success: string;
  danger: string;
}

export interface Theme {
  id: string;
  name: string;
  colors: ThemeColors;
}

export const DEFAULT_THEME_ID = 'terracotta';

export const THEMES: Theme[] = [
  {
    id: 'terracotta',
    name: 'Terracotta',
    colors: {
      bg: '#F6F1EB',
      surface: '#FFFFFF',
      border: '#D4C8B8',
      text: '#2C2418',
      textMuted: '#7A6855',
      accent: '#C4713B',
      accentLight: '#EDE8E0',
      success: '#5B8C5A',
      danger: '#C0392B',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    colors: {
      bg: '#F0F6F9',
      surface: '#FFFFFF',
      border: '#B8D4E3',
      text: '#1A3545',
      textMuted: '#4A7A95',
      accent: '#2B7A9E',
      accentLight: '#DEF0F7',
      success: '#3E7C5A',
      danger: '#C0392B',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    colors: {
      bg: '#F2F5F0',
      surface: '#FFFFFF',
      border: '#C5D8BC',
      text: '#1D2E1A',
      textMuted: '#5A7A55',
      accent: '#4A7C59',
      accentLight: '#DEF0E0',
      success: '#4A7C59',
      danger: '#C0392B',
    },
  },
  {
    id: 'lavender',
    name: 'Lavender',
    colors: {
      bg: '#F5F2F8',
      surface: '#FFFFFF',
      border: '#D0C5E5',
      text: '#2A1E35',
      textMuted: '#7A6895',
      accent: '#7B5EA7',
      accentLight: '#EDE8F5',
      success: '#5B8C5A',
      danger: '#C0392B',
    },
  },
  {
    id: 'slate',
    name: 'Slate',
    colors: {
      bg: '#F8FAFC',
      surface: '#FFFFFF',
      border: '#CBD5E1',
      text: '#1E293B',
      textMuted: '#64748B',
      accent: '#64748B',
      accentLight: '#F1F5F9',
      success: '#5B8C5A',
      danger: '#C0392B',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    colors: {
      bg: '#1A1D2E',
      surface: '#252840',
      border: '#3D4165',
      text: '#E8EAF5',
      textMuted: '#9CA3B5',
      accent: '#8B9FCA',
      accentLight: '#2D3155',
      success: '#5BAF7A',
      danger: '#E55555',
    },
  },
];

export function applyTheme(themeId: string): void {
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
  const root = document.documentElement;
  root.style.setProperty('--color-bg', theme.colors.bg);
  root.style.setProperty('--color-surface', theme.colors.surface);
  root.style.setProperty('--color-border', theme.colors.border);
  root.style.setProperty('--color-text', theme.colors.text);
  root.style.setProperty('--color-text-muted', theme.colors.textMuted);
  root.style.setProperty('--color-accent', theme.colors.accent);
  root.style.setProperty('--color-accent-light', theme.colors.accentLight);
  root.style.setProperty('--color-success', theme.colors.success);
  root.style.setProperty('--color-danger', theme.colors.danger);
}
