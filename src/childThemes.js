/** Fargetema for barneprofiler — samme layout som foreldre, egen accent + valgfritt mønster. */

import { colors as baseColors } from './theme';

/**
 * pattern: optional backdrop motif rendered by ChildThemeBackdrop
 * emoji: shown in Utseende-picker preview
 */
export const CHILD_THEMES = [
  {
    id: 'sky',
    label: 'Himmel',
    emoji: '☁️',
    brand: '#2563eb',
    brandSoft: '#dbeafe',
    bg: '#f4f7fb',
    accent: '#6b4ee6',
  },
  {
    id: 'ocean',
    label: 'Hav',
    emoji: '🌊',
    brand: '#0ea5e9',
    brandSoft: '#e0f2fe',
    bg: '#f0f9ff',
    accent: '#0284c7',
  },
  {
    id: 'forest',
    label: 'Skog',
    emoji: '🌲',
    brand: '#16a34a',
    brandSoft: '#dcfce7',
    bg: '#f3faf5',
    accent: '#15803d',
  },
  {
    id: 'sunset',
    label: 'Solnedgang',
    emoji: '🌅',
    brand: '#ea580c',
    brandSoft: '#ffedd5',
    bg: '#fff7ed',
    accent: '#c2410c',
  },
  {
    id: 'berry',
    label: 'Bær',
    emoji: '🍓',
    brand: '#db2777',
    brandSoft: '#fce7f3',
    bg: '#fdf2f8',
    accent: '#be185d',
  },
  {
    id: 'grape',
    label: 'Drue',
    emoji: '🍇',
    brand: '#7c3aed',
    brandSoft: '#ede9fe',
    bg: '#f5f3ff',
    accent: '#6d28d9',
  },
  {
    id: 'bamse',
    label: 'Bamse',
    emoji: '🧸',
    brand: '#b45309',
    brandSoft: '#fef3c7',
    bg: '#fffbeb',
    accent: '#92400e',
    pattern: 'teddy',
  },
  {
    id: 'blomster',
    label: 'Blomster',
    emoji: '🌸',
    brand: '#e11d48',
    brandSoft: '#ffe4e6',
    bg: '#fff1f2',
    accent: '#be123c',
    pattern: 'flowers',
  },
  {
    id: 'stjerner',
    label: 'Stjerner',
    emoji: '⭐',
    brand: '#4f46e5',
    brandSoft: '#e0e7ff',
    bg: '#eef2ff',
    accent: '#3730a3',
    pattern: 'stars',
  },
  {
    id: 'bobler',
    label: 'Bobler',
    emoji: '🫧',
    brand: '#0891b2',
    brandSoft: '#cffafe',
    bg: '#ecfeff',
    accent: '#0e7490',
    pattern: 'bubbles',
  },
  {
    id: 'regnbue',
    label: 'Regnbue',
    emoji: '🌈',
    brand: '#f59e0b',
    brandSoft: '#fef9c3',
    bg: '#fffbeb',
    accent: '#db2777',
    pattern: 'rainbow',
  },
  {
    id: 'mint',
    label: 'Mint',
    emoji: '🍃',
    brand: '#0d9488',
    brandSoft: '#ccfbf1',
    bg: '#f0fdfa',
    accent: '#0f766e',
  },
  {
    id: 'korall',
    label: 'Korall',
    emoji: '🪸',
    brand: '#f43f5e',
    brandSoft: '#ffe4e6',
    bg: '#fff5f5',
    accent: '#e11d48',
  },
  {
    id: 'honning',
    label: 'Honning',
    emoji: '🐝',
    brand: '#d97706',
    brandSoft: '#fef3c7',
    bg: '#fffbeb',
    accent: '#b45309',
    pattern: 'honey',
  },
];

export const DEFAULT_CHILD_THEME_ID = 'sky';

export function getChildTheme(themeId) {
  const id = themeId || DEFAULT_CHILD_THEME_ID;
  return CHILD_THEMES.find((t) => t.id === id) || CHILD_THEMES[0];
}

/** Slår sammen barnets fargetema med base-paletten (layout/størrelser uendret). */
export function resolveColorsForChildTheme(themeId) {
  const theme = getChildTheme(themeId);
  return {
    ...baseColors,
    brand: theme.brand,
    brandSoft: theme.brandSoft,
    bg: theme.bg,
    fab: theme.brand,
    accent: theme.accent,
    kid: theme.brand,
    kidSoft: theme.brandSoft,
  };
}
