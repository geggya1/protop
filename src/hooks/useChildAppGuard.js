import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { allowedAppsForChild, isChildAppAllowed } from '../utils/childApps';

/** Send child (or parent-as-child) back if this app is turned off. */
export function useChildAppGuard(appId) {
  const nav = useNavigation();
  const { isChild, isActingAsChild, meChild, activeChild, requestShellTab } = useApp();
  const child = isActingAsChild ? activeChild : (isChild ? meChild : null);
  const asChildView = isChild || isActingAsChild;
  const allowed = !asChildView || isChildAppAllowed(allowedAppsForChild(child), appId);

  useEffect(() => {
    if (allowed) return undefined;
    requestShellTab?.('home');
    const state = nav.getState?.();
    const routeName = state?.routes?.[state.index || 0]?.name;
    if (routeName && routeName !== 'Home' && nav.canGoBack()) {
      nav.goBack();
    }
    return undefined;
  }, [allowed, nav, requestShellTab]);

  return allowed;
}
