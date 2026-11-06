import React, { createContext, useContext, useMemo } from 'react';
import { colors as baseColors } from '../theme';
import { useAppearance } from '../appearance/AppearanceContext';
import { paletteFor } from '../appearance/palette';

const ThemeContext = createContext({
  colors: baseColors,
  themeId: null,
  isChildTheme: false,
  theme: null,
  highChildFriendliness: false,
});

/**
 * Farger etter lys/mørk modus. Barnetemaene (Himmel, Hav, Skog og den myke dashbord-paletten)
 * hørte til familieproduktet og er fjernet; feltene isChildTheme, theme og
 * highChildFriendliness står igjen med faste verdier, så forbrukerne har samme form.
 */
export function ThemeProvider({ children }) {
  const { scheme } = useAppearance();

  const value = useMemo(() => ({
    colors: { ...baseColors, ...paletteFor(scheme) },
    scheme,
    themeId: null,
    isChildTheme: false,
    theme: null,
    highChildFriendliness: false,
  }), [scheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

/** Aktive farger for lys eller mørk modus. */
export function useColors() {
  return useContext(ThemeContext).colors;
}

export function useThemeMeta() {
  return useContext(ThemeContext);
}
