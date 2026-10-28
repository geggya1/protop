import React, { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import ParentHomeBottomNav from './ParentHomeBottomNav';
import HelpTarget from '../HelpTarget';
import { useApp } from '../../src/context/AppContext';
import { useUnread } from '../../src/context/NotificationContext';
import { useChatDock, useChatDockPreferred } from '../../src/context/ChatDockContext';
import { useLayout } from '../../src/theme';
import { useColors } from '../../src/context/ThemeContext';
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
  resolveActiveParentBottomId,
  resolveParentBottomNavAction,
  shouldShowParentBottomNav,
  setParentBottomNavChromeHeight,
} from '../../src/utils/parentBottomNav';
import { isOrganizationType } from '../../src/utils/groupTypes';
import { COMPANY_BOTTOM_NAV } from '../../src/companyHome/model';
import { privateDockPreset } from '../../src/navigation/protopShell';
import { isLiveOrganization } from '../../src/project/companyOffer';

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
  const colors = useColors();
  const { hasRail } = useLayout();
  const {
    isParent, isChild, isActingAsChild, familyId, family, families, kids, uid, activeChild, meChild,
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
  const companyLocked = !asChildView && isOrganizationType(family?.type);
  const ready = asChildView ? childHome.ready : (companyLocked || parentTheme.ready);
  const theme = parentTheme.theme;
  const hasCompany = useMemo(() => (families || []).some(isLiveOrganization), [families]);
  // Privat: samme dock som i bedriften (Timer, Oppgaver og Meny på samme plass), med mindre
  // personen har valgt egne snarveier.
  const privatePreset = useMemo(
    () => (companyLocked || asChildView ? null : privateDockPreset({
      hasCompany,
      bottomShortcutIds: parentTheme.bottomShortcutIds,
    })),
    [companyLocked, asChildView, hasCompany, parentTheme.bottomShortcutIds],
  );
  const presetItems = companyLocked ? COMPANY_BOTTOM_NAV : privatePreset;
  const bottomShortcutIds = presetItems
    ? presetItems.map((item) => item.id)
    : (asChildView ? childHome.layout.bottomIds : parentTheme.bottomShortcutIds);
  const show = focused && shouldShowParentBottomNav({
    ready,
    theme,
    bottomShortcutIds,
    isParent: companyLocked || isParent,
    asChildView,
    hasRail,
    kitchenMode,
    bottomNavEnabled: companyLocked
      ? true
      : (asChildView ? childHome.layout?.bottomNavEnabled !== false : parentTheme.bottomNavEnabled !== false),
  });

  useEffect(() => {
    if (!show) setParentBottomNavChromeHeight(0);
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
    // Clamp: a bad layout pass must not inflate chrome to the full screen.
    // The bar can be taller than the icon row when Safari's toolbar band
    // is padding inside it.
    if (show && h > 0 && h < 320) setParentBottomNavChromeHeight(h);
  }, [show]);

  if (!show) return null;

  const bar = (
    <ParentHomeBottomNav
      ids={bottomShortcutIds}
      appById={appById}
      badgeById={badgeById}
      activeId={activeId}
      onSelect={onSelect}
      tokens={presetItems ? {
        surface: '#ffffff',
        border: '#E6EAF0',
        accent: colors.brand,
        accentSoft: 'transparent',
        textMuted: '#8E99A8',
      } : theme?.tokens}
      includeSafeArea
      onLayout={onLayout}
      glass={presetItems ? false : glass}
      presetItems={presetItems}
    />
  );

  return (
    <HelpTarget id="tabs" style={styles.flowDock}>
      {bar}
    </HelpTarget>
  );
}

const styles = StyleSheet.create({
  /* In the shell column, flush with the visible bottom. Not position:fixed:
     that anchors to the layout viewport and floats above the browser toolbar. */
  flowDock: { flexShrink: 0, zIndex: 40 },
});
