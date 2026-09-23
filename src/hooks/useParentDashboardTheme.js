import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { composeParentDashboardTheme, getParentDashboardTheme } from '../parentDashboardThemes';
import {
  loadParentDashboardSetup,
  resolveBottomShortcutIds,
  subscribeParentDashboardTheme,
} from '../utils/parentDashboardTheme';
import { loadHomeLayout, subscribeHomeLayout } from '../utils/homeLayoutStore';
import { DEFAULT_HOME_BANNER_ID } from '../homeBanners';

function sameIds(a, b) {
  return JSON.stringify(a || []) === JSON.stringify(b || []);
}

/**
 * Parent dashboard look + bottom shortcuts.
 * Bottom ids come from the new home layout when present.
 */
export function useParentDashboardTheme() {
  const { uid } = useApp();
  const [themeId, setThemeId] = useState(null);
  const [artPackId, setArtPackId] = useState(null);
  const [backgroundId, setBackgroundId] = useState(null);
  const [storedIds, setStoredIds] = useState(null);
  const [bottomNavEnabled, setBottomNavEnabled] = useState(true);
  const [bannerId, setBannerId] = useState(DEFAULT_HOME_BANNER_ID);
  const [customBannerUri, setCustomBannerUri] = useState(null);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    if (!uid) {
      const fallback = getParentDashboardTheme(null);
      setThemeId(fallback.id);
      setArtPackId(null);
      setBackgroundId(null);
      setStoredIds(null);
      setBottomNavEnabled(true);
      setBannerId(DEFAULT_HOME_BANNER_ID);
      setCustomBannerUri(null);
      setReady(true);
      return;
    }
    const [setup, home] = await Promise.all([
      loadParentDashboardSetup(uid),
      loadHomeLayout(uid, { role: 'parent' }),
    ]);
    setThemeId((prev) => (prev === setup.layoutId ? prev : setup.layoutId));
    setArtPackId((prev) => (prev === setup.artPackId ? prev : setup.artPackId));
    setBackgroundId((prev) => (prev === setup.backgroundId ? prev : setup.backgroundId));
    const nextIds = Array.isArray(home?.bottomIds) ? home.bottomIds : setup.bottomIds;
    setStoredIds((prev) => (sameIds(prev, nextIds) ? prev : nextIds));
    setBottomNavEnabled(home?.bottomNavEnabled !== false);
    const nextBanner = home?.bannerId || DEFAULT_HOME_BANNER_ID;
    const nextUri = home?.customBannerUri || null;
    setBannerId((prev) => (prev === nextBanner ? prev : nextBanner));
    setCustomBannerUri((prev) => (prev === nextUri ? prev : nextUri));
    setReady(true);
  }, [uid]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => subscribeParentDashboardTheme(reload), [reload]);
  useEffect(() => subscribeHomeLayout(reload), [reload]);

  const theme = useMemo(() => {
    const composed = composeParentDashboardTheme(themeId, artPackId, backgroundId);
    return { ...composed, bottomNav: true };
  }, [themeId, artPackId, backgroundId]);
  const bottomShortcutIds = useMemo(
    () => resolveBottomShortcutIds(theme?.id, storedIds),
    [theme?.id, storedIds],
  );

  return {
    ready,
    theme,
    themeId: theme?.id,
    artPackId: theme?.artPackId,
    backgroundId: theme?.backgroundId,
    bottomShortcutIds,
    bottomNavEnabled,
    bannerId,
    customBannerUri,
    reload,
  };
}
