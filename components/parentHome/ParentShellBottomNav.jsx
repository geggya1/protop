import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import ParentHomeBottomNav from './ParentHomeBottomNav';
import HelpTarget from '../HelpTarget';
import { useApp } from '../../src/context/AppContext';
import { useUnread } from '../../src/context/NotificationContext';
import { useChatDock, useChatDockPreferred } from '../../src/context/ChatDockContext';
import { useLayout } from '../../src/theme';
import { useI18n } from '../../src/i18n';
import { useParentDashboardTheme } from '../../src/hooks/useParentDashboardTheme';
import { useHomeLayout } from '../../src/hooks/useHomeLayout';
import {
  childHomeStorageAliases,
  childHomeStorageId,
} from '../../src/utils/childHomeLayout';
import { buildParentDashboardApps } from '../../src/navigation/shellModules';
import { countForModule } from '../../src/utils/notifications';
import {
  PARENT_BOTTOM_NAV_CONTENT_HEIGHT,
  resolveActiveParentBottomId,
  resolveParentBottomNavAction,
  shouldShowParentBottomNav,
  setParentBottomNavChromeHeight,
} from '../../src/utils/parentBottomNav';

/**
 * Customizable bottom dock, mounted in AppShell so it stays on every module.
 * Same recipe for adult and child profiles — not tied to a layout theme.
 */
export default function ParentShellBottomNav({
  tab,
  moreSubView,
  kitchenMode = false,
  onSelectTab,
  glass = false,
}) {
  const nav = useNavigation();
  const focused = useIsFocused();
  const { t } = useI18n();
  const { hasRail } = useLayout();
  const {
    isParent, isChild, isActingAsChild, familyId, kids, uid, activeChild, meChild,
  } = useApp();
  const { unreadByModule } = useUnread();
  const chatDockPreferred = useChatDockPreferred();
  const { openDrawer: openChatDrawer } = useChatDock();
  const parentTheme = useParentDashboardTheme();
  const asChildView = isChild || isActingAsChild;
  const childId = asChildView
    ? (childHomeStorageId(activeChild)
      || childHomeStorageId(meChild)
      || activeChild?.uid
      || meChild?.uid
      || uid)
    : null;
  const childAliases = useMemo(
    () => (asChildView
      ? [
        ...childHomeStorageAliases(activeChild),
        ...childHomeStorageAliases(meChild),
        uid,
      ].filter(Boolean)
      : []),
    [asChildView, activeChild, meChild, uid],
  );
  const childHome = useHomeLayout(childId, { role: 'child', aliases: childAliases });
  const ready = asChildView ? childHome.ready : parentTheme.ready;
  const theme = parentTheme.theme;
  const bottomShortcutIds = asChildView ? childHome.layout.bottomIds : parentTheme.bottomShortcutIds;
  const [barHeight, setBarHeight] = useState(PARENT_BOTTOM_NAV_CONTENT_HEIGHT);

  const show = focused && shouldShowParentBottomNav({
    ready,
    theme,
    bottomShortcutIds,
    isParent,
    asChildView,
    hasRail,
    kitchenMode,
    bottomNavEnabled: asChildView ? childHome.layout?.bottomNavEnabled !== false : parentTheme.bottomNavEnabled !== false,
  });

  // Pin to the visual viewport on mobile web (same approach as the old ShellTabBar).
  const pinToViewport = Platform.OS === 'web';

  useEffect(() => {
    if (!show) {
      setParentBottomNavChromeHeight(0);
      setBarHeight(PARENT_BOTTOM_NAV_CONTENT_HEIGHT);
    }
    return () => setParentBottomNavChromeHeight(0);
  }, [show]);

  const activeKids = useMemo(
    () => (kids || []).filter((k) => k.active !== false),
    [kids],
  );

  const appById = useMemo(() => {
    const apps = buildParentDashboardApps({
      t,
      familyId,
      eventCount: 0,
      hasKids: activeKids.length > 0,
      firstKid: activeKids[0] || null,
    });
    const map = {};
    (apps || []).forEach((a) => { map[a.id] = a; });
    return map;
  }, [t, familyId, activeKids]);

  const badgeById = useMemo(() => {
    const ids = bottomShortcutIds || [];
    const out = {};
    ids.forEach((id) => {
      const n = countForModule(unreadByModule, id);
      if (n > 0) out[id] = n;
    });
    return out;
  }, [bottomShortcutIds, unreadByModule]);

  const activeId = useMemo(
    () => resolveActiveParentBottomId(tab, moreSubView, bottomShortcutIds),
    [tab, moreSubView, bottomShortcutIds],
  );

  const onSelect = useCallback((item) => {
    const action = resolveParentBottomNavAction(item, appById);
    if (!action) return;
    if (action.type === 'tab') {
      if (action.tab === 'chat' && chatDockPreferred) {
        openChatDrawer?.();
        return;
      }
      onSelectTab?.(action.tab, action.subView || null);
      return;
    }
    if (action.type === 'nav' && action.screen) {
      nav.navigate(action.screen, action.params);
    }
  }, [appById, chatDockPreferred, openChatDrawer, onSelectTab, nav]);

  const onLayout = useCallback((e) => {
    const h = e?.nativeEvent?.layout?.height;
    // Clamp: a bad layout pass must not inflate chrome / spacer to full screen.
    if (show && h > 0 && h < 160) {
      setParentBottomNavChromeHeight(h);
      setBarHeight(h);
    }
  }, [show]);

  if (!show) return null;

  const bar = (
    <ParentHomeBottomNav
      ids={bottomShortcutIds}
      appById={appById}
      badgeById={badgeById}
      activeId={activeId}
      onSelect={onSelect}
      tokens={theme?.tokens}
      includeSafeArea
      onLayout={onLayout}
      glass={glass}
    />
  );

  if (pinToViewport) {
    return (
      <>
        {/* Reserve flow space so module content does not sit under the fixed bar. */}
        <View style={{ height: barHeight, flexShrink: 0 }} pointerEvents="none" />
        <View style={styles.webDock} pointerEvents="box-none">
          <HelpTarget id="tabs" style={styles.webDockInner}>
            {bar}
          </HelpTarget>
        </View>
      </>
    );
  }

  return (
    <HelpTarget id="tabs" style={styles.flowDock}>
      {bar}
    </HelpTarget>
  );
}

const styles = StyleSheet.create({
  flowDock: { flexShrink: 0 },
  webDock: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  webDockInner: {
    flexShrink: 0,
  },
});
