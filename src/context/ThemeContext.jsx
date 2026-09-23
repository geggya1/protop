import React, { createContext, useContext, useMemo } from 'react';
import { colors as baseColors } from '../theme';
import { getChildTheme, resolveColorsForChildTheme } from '../childThemes';
import { isHighChildFriendliness } from '../utils/childUi';
import { profileAge, isMinor } from '../utils/age';
import { soft } from '../../components/parentHome/softTheme';
import { useAppearance } from '../appearance/AppearanceContext';
import { paletteFor } from '../appearance/palette';
import { useApp } from './AppContext';

const ThemeContext = createContext({
  colors: baseColors,
  themeId: null,
  isChildTheme: false,
  theme: null,
  highChildFriendliness: false,
});

/** Soft cream palette for under-18 — matches the new dashboard look. Always light. */
function softChildColors() {
  return {
    ...baseColors,
    bg: soft.bg,
    card: soft.card,
    ink: soft.ink,
    muted: soft.muted,
    line: soft.line,
    brand: soft.sage || baseColors.brand,
    brandSoft: soft.brandSoft || baseColors.brandSoft,
    accent: soft.sage || baseColors.accent,
  };
}

export function ThemeProvider({ children }) {
  const { activeProfileKind, activeChild, isChild, meChild } = useApp();
  const { scheme } = useAppearance();

  const value = useMemo(() => {
    const pal = paletteFor(scheme);
    const child = activeProfileKind === 'child'
      ? (activeChild || (isChild ? meChild : null))
      : null;
    if (!child) {
      return {
        colors: { ...baseColors, ...pal },
        scheme,
        themeId: null,
        isChildTheme: false,
        theme: null,
        highChildFriendliness: false,
      };
    }

    const age = profileAge(child);
    // Under 18: soft dashboard look (not the old Himmel/Hav/Skog color themes).
    if (age == null || isMinor(age)) {
      return {
        colors: softChildColors(),
        scheme,
        themeId: 'soft-dashboard',
        isChildTheme: true,
        theme: null,
        highChildFriendliness: isHighChildFriendliness(child),
      };
    }

    const themeId = child.themeId || 'sky';
    const themed = resolveColorsForChildTheme(themeId);
    return {
      colors: scheme === 'dark'
        ? {
          ...themed,
          ...pal,
          brand: themed.brand,
          fab: themed.fab,
          accent: themed.accent,
          kid: themed.kid,
        }
        : themed,
      scheme,
      themeId,
      isChildTheme: true,
      theme: getChildTheme(themeId),
      highChildFriendliness: isHighChildFriendliness(child),
    };
  }, [activeProfileKind, activeChild, isChild, meChild, scheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

/** Aktive farger — barnets tema når profil er barn, ellers standard. */
export function useColors() {
  return useContext(ThemeContext).colors;
}

export function useThemeMeta() {
  return useContext(ThemeContext);
}
