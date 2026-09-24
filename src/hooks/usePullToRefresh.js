import { useCallback, useState } from 'react';
import { Platform, RefreshControl } from 'react-native';

/**
 * Pull-to-refresh for home-style ScrollViews.
 * Soft-refreshes via onSoftRefresh; use hardReloadApp() for a full page reload.
 */
export function usePullToRefresh(onSoftRefresh, tintColor = '#1099F4') {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onSoftRefresh?.();
    } catch { /* ignore */ }
    // Keep spinner visible briefly so the gesture feels intentional.
    await new Promise((r) => setTimeout(r, 400));
    setRefreshing(false);
  }, [onSoftRefresh, refreshing]);

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={tintColor}
      colors={[tintColor]}
    />
  );

  return { refreshing, onRefresh, refreshControl };
}

/** Full document reload (web PWA / home-screen shortcut). */
export function hardReloadApp() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.reload();
    return true;
  }
  return false;
}
