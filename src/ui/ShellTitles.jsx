import React, { createContext, useContext } from 'react';
import { repeatsShellTitle } from './pageTitle';

/**
 * Titlene skallet viser for siden (AppShell: toppfeltet, tittelraden med brødsmule
 * og modulbåndet, se shellPageTitles). Sider utenfor skallet har ingen verdi her
 * og viser sin egen tittel som før.
 */
const ShellTitlesContext = createContext(null);

export function ShellTitlesProvider({ titles = null, children }) {
  return <ShellTitlesContext.Provider value={titles}>{children}</ShellTitlesContext.Provider>;
}

export function useShellTitles() {
  return useContext(ShellTitlesContext);
}

/**
 * Én tittel per side: sant når sidens egen overskrift sier det samme som skallet
 * allerede viser. Siden dropper da overskriften og beholder forklaring og knapper.
 */
export function useRepeatsShellTitle(title) {
  return repeatsShellTitle(title, useContext(ShellTitlesContext) || []);
}

/** Sidens egen overskrift (children), bare når skallet ikke allerede viser samme tittel. */
export function UnlessShellTitle({ title, children }) {
  return useRepeatsShellTitle(title) ? null : children;
}
