import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useOptionalRoute } from '../src/hooks/useOptionalRoute';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../src/i18n';
import { radius, useLayout } from '../src/theme';
import { useApp } from '../src/context/AppContext';
import { useColors, useThemeMeta } from '../src/context/ThemeContext';
import { isTeamType } from '../src/utils/teams';
import { isClassroomType } from '../src/utils/groupTypes';
import { openPlatformHome, goPlatformOverview } from '../src/utils/platformNav';
import HomeScreen from '../screens/v2/HomeScreen';
import PlanScreen from '../screens/v2/PlanScreen';
import RewardsScreen from '../screens/v2/RewardsScreen';
import ChoresScreen from '../screens/v2/ChoresScreen';
import NotesHubScreen from '../screens/v2/NotesHubScreen';
import ChatTabScreen from '../screens/v2/ChatTabScreen';
import MoreHubScreen from '../screens/v2/MoreHubScreen';
import MailHubScreen from '../screens/v2/MailHubScreen';
import ProjectPlatformScreen from '../screens/project/ProjectPlatformScreen';
import AnbudScreen from '../screens/anbud/AnbudScreen';
import {
  OPEN_CALENDAR_SETTINGS_KEY,
  OAUTH_COMPLETE_MESSAGE,
  consumeOpenMailHub,
} from '../src/utils/calendarIntegration';
import { SHELL_TABS } from './ShellTabBar';
import ShellHeader, { ShellTitleRightContext } from './ShellHeader';
import ShellDrawer from './ShellDrawer';
import DesktopRail from './DesktopRail';
import BrandLogo from './BrandLogo';
import EdgeSwipeBack from './EdgeSwipeBack';
import IconBadge from './IconBadge';
import PushEnableBanner from './PushEnableBanner';
import AddToHomeBanner from './AddToHomeBanner';
import AddToHomeGuide from './AddToHomeGuide';
import { useUnread } from '../src/context/NotificationContext';
import { countForModule } from '../src/utils/notifications';
import { useLocationSharing } from '../src/hooks/useLocationSharing';
import { effectiveLocationSharing } from '../src/utils/familyLocation';
import { allowedAppsForChild, isChildAppAllowed } from '../src/utils/childApps';
import { grandparentModulesFor, isGrandparentAppAllowed } from '../src/utils/grandparentAccess';
import ModuleIntroHost from './ModuleIntroHost';
import ModuleHero from './ModuleHero';
import HelpTarget from './HelpTarget';
import ModuleActivationGate from './ModuleActivationGate';
import { activationModuleIdForShell } from '../src/modules/moduleActivationRegistry';
import { phoneChromeHeroId, shellHeroModuleId } from '../src/modules/moduleHero';
import ModuleAside, { ModuleAsideProvider } from './ModuleAside';
import { ModuleHeroHostProvider, useShowModuleHero } from './ModulePageBg';
import { useChatDock, useChatDockPreferred } from '../src/context/ChatDockContext';
import { useModuleAccess } from '../src/context/ModuleAccessContext';
import { useNow } from '../src/hooks/useNow';
import { childShellTitle } from '../src/utils/childHome';
import { resolveShellHeaderTitle } from '../src/navigation/shellHeaderTitle';
import {
  isImmersivePhotoChromeOnly,
  isImmersivePhotoShell,
} from '../src/navigation/immersivePhotoShell';
import {
  loadKitchenDisplaySettings,
  saveKitchenDisplaySettings,
  subscribeKitchenDisplay,
  verifyKitchenPin,
} from '../src/utils/kitchenDisplay';
import KitchenPinModal from './KitchenPinModal';
import ParentShellBottomNav from './parentHome/ParentShellBottomNav';
import HomeBackdrop from './home/HomeBackdrop';
import { HomeImmersiveProvider } from '../src/context/HomeImmersiveContext';
import { useParentDashboardTheme } from '../src/hooks/useParentDashboardTheme';
import { useHomeLayout } from '../src/hooks/useHomeLayout';
import {
  childHomeStorageAliases,
  childHomeStorageId,
} from '../src/utils/childHomeLayout';
import { shouldShowParentBottomNav } from '../src/utils/parentBottomNav';

function RailTabItem({ tab, active, onPress, desktop, colors, badgeCount = 0 }) {
  const color = active ? colors.brand : colors.muted;
  const icon = (
    <IconBadge count={badgeCount} size={desktop ? 15 : 16} offset={desktop ? -6 : -7}>
      <Ionicons name={active ? tab.icon : `${tab.icon}-outline`} size={desktop ? 20 : 24} color={color} />
    </IconBadge>
  );
  if (desktop) {
    return (
      <TouchableOpacity
        onPress={onPress}
        style={[
          styles.railRow,
          active && styles.railRowActive,
          active && { backgroundColor: colors.brandSoft },
        ]}
        accessibilityRole="button"
        accessibilityLabel={tab.label}
        nativeID={`module-nav-${tab.id}`}
        {...(Platform.OS === 'web' ? { dataSet: { wpNav: '1', wpNavActive: active ? '1' : '0' } } : null)}
      >
        {icon}
        <Text style={[styles.railRowLabel, { color }]} numberOfLines={1}>{tab.label}</Text>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.tabItemBig,
        active && { backgroundColor: colors.brandSoft },
      ]}
      accessibilityRole="button"
      accessibilityLabel={tab.label}
      nativeID={`module-nav-${tab.id}`}
    >
      {icon}
      <Text style={[styles.tabLabel, { color }]} numberOfLines={1}>{tab.label}</Text>
    </TouchableOpacity>
  );
}

function AppShellInner() {
  const nav = useNavigation();
  const route = useOptionalRoute();
  const { t } = useI18n();
  const colors = useColors();
  const { highChildFriendliness } = useThemeMeta();
  const {
    isParent, isChild, isActingAsChild, isGrandparent, family, families, loading,
    shellNav, requestShellTab, clearShellIntent,
    familyId, uid, userProfile, meChild, meParent, members,
    activeChild,
  } = useApp();
  const { hasRail, isDesktop, isTablet, isPhone, contentMax, railWidth } = useLayout();
  const showPageHero = useShowModuleHero();
  const { unreadByModule } = useUnread();
  const { needsWelcome } = useModuleAccess();
  const chatDockPreferred = useChatDockPreferred();
  const { openDrawer: openChatDrawer } = useChatDock();
  const now = useNow();
  const {
    ready: parentThemeReady,
    theme: parentDashTheme,
    bottomShortcutIds,
    bottomNavEnabled,
    bannerId: homeBannerId,
    customBannerUri: homeCustomBannerUri,
  } = useParentDashboardTheme();
  const [tab, setTab] = useState('home');
  const [shellTitleRight, setShellTitleRight] = useState(null);
  const shellTitleOwnerRef = useRef(null);
  const shellTitleApi = useMemo(() => ({
    claim(owner, node) {
      shellTitleOwnerRef.current = owner;
      setShellTitleRight((prev) => (prev === node ? prev : node));
    },
    release(owner) {
      if (shellTitleOwnerRef.current !== owner) return;
      shellTitleOwnerRef.current = null;
      setShellTitleRight(null);
    },
  }), []);
  const [moreSubView, setMoreSubView] = useState(null);
  const prevNavRef = useRef({ tab: 'home', subView: null });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addHomeOpen, setAddHomeOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [planMounted, setPlanMounted] = useState(false);
  const [kitchenMode, setKitchenMode] = useState(false);
  const [kitchenPinEnabled, setKitchenPinEnabled] = useState(false);
  const [kitchenPinOpen, setKitchenPinOpen] = useState(false);

  useEffect(() => {
    if (!uid) {
      setKitchenMode(false);
      setKitchenPinEnabled(false);
      return undefined;
    }
    let alive = true;
    loadKitchenDisplaySettings(uid).then((s) => {
      if (!alive) return;
      setKitchenMode(!!s.enabled);
      setKitchenPinEnabled(!!s.pinEnabled);
    });
    const unsub = subscribeKitchenDisplay((s) => {
      if (!alive) return;
      const next = typeof s === 'object' && s ? s : { enabled: !!s };
      setKitchenMode(!!next.enabled);
      if (next.pinEnabled != null) setKitchenPinEnabled(!!next.pinEnabled);
    });
    return () => { alive = false; unsub(); };
  }, [uid]);

  useEffect(() => {
    if (kitchenMode) setTab('home');
  }, [kitchenMode]);

  const exitKitchen = async () => {
    setKitchenMode(false);
    if (uid) await saveKitchenDisplaySettings(uid, { enabled: false });
  };

  const requestExitKitchen = () => {
    if (kitchenPinEnabled) {
      setKitchenPinOpen(true);
      return;
    }
    exitKitchen();
  };

  // Publiser kun for innlogget identitet — ikke når foresatt bare «ser som barn».
  const locationSharingEnabled = useMemo(() => {
    if (isActingAsChild && !isChild) return false;
    return effectiveLocationSharing({
      userProfile,
      childRecord: isChild ? meChild : null,
      parentRecord: isChild ? null : meParent,
    });
  }, [userProfile, meChild, meParent, isChild, isActingAsChild]);

  const myMemberName = members.find((m) => m.uid === uid)?.name
    || userProfile?.displayName
    || 'Meg';
  const myRole = isChild ? 'child' : 'parent';
  const asChildView = isChild || isActingAsChild;
  const viewingChild = isActingAsChild ? activeChild : (isChild ? meChild : null);
  const viewingChildId = asChildView
    ? (childHomeStorageId(viewingChild) || viewingChild?.childId || uid)
    : null;
  const viewingChildAliases = useMemo(
    () => (asChildView
      ? [...childHomeStorageAliases(viewingChild), uid].filter(Boolean)
      : []),
    [asChildView, viewingChild, uid],
  );
  const childHome = useHomeLayout(viewingChildId, {
    role: 'child',
    aliases: viewingChildAliases,
  });
  const simpleChildUi = asChildView && highChildFriendliness;
  const allowedApps = useMemo(
    () => (asChildView ? allowedAppsForChild(viewingChild) : null),
    [asChildView, viewingChild],
  );
  const grandparentModules = useMemo(
    () => (isGrandparent ? grandparentModulesFor(meParent) : null),
    [isGrandparent, meParent],
  );

  useLocationSharing({
    familyId,
    uid,
    enabled: locationSharingEnabled,
    name: myMemberName,
    role: myRole,
    notifyUids: (members || []).map((m) => m.uid || m.id).filter(Boolean),
  });

  useEffect(() => {
    if (shellNav?.tab) {
      setMoreSubView(shellNav.subView || null);
      setTab(shellNav.tab);
      requestShellTab(null);
    }
  }, [shellNav, requestShellTab]);

  useEffect(() => {
    if (tab === 'more' && moreSubView === 'addMember') {
      setMoreSubView('members');
    }
    if (tab === 'more' && moreSubView === 'voiceNotes') {
      setTab('notes');
      setMoreSubView(null);
    }
    if (tab === 'more' && moreSubView === 'mail') {
      setTab('mail');
      setMoreSubView(null);
    }
  }, [tab, moreSubView]);

  // Deep-link / profilmeny: nav.navigate('Home', { openShell: { tab, subView } })
  useEffect(() => {
    const open = route?.params?.openShell;
    if (!open?.tab) return;
    setMoreSubView(open.subView || null);
    setTab(open.tab);
    if (open.intent) {
      // requestShellTab setter shellIntent når intent er satt
      requestShellTab(open.tab, open.subView || null, open.intent);
    }
    nav.setParams({ openShell: undefined });
  }, [route?.params?.openShell, nav, requestShellTab]);

  // Tilpass hjem → åpne hjem-fanen (editHome leses av theme hosts)
  useEffect(() => {
    if (!route?.params?.editHome) return;
    setTab('home');
    setMoreSubView(null);
  }, [route?.params?.editHome]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const layout = isDesktop ? 'desktop' : isTablet ? 'tablet' : 'phone';
    document.documentElement.dataset.wpLayout = layout;
    return () => {
      delete document.documentElement.dataset.wpLayout;
    };
  }, [isDesktop, isTablet, isPhone]);

  useEffect(() => {
    if (!isDesktop || Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onKey = (e) => {
      const key = e.key?.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && key === 'k') {
        e.preventDefault();
        if (simpleChildUi) return;
        window.dispatchEvent(new CustomEvent('weekplan:focus-tools-search'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDesktop, simpleChildUi]);

  useEffect(() => {
    if (!simpleChildUi) return;
    setDrawerOpen(false);
    // Små barn: skjul «Mer»-hubben, men tillat direkte app-åpning via subView (f.eks. spill, bøker).
    if (tab === 'more' && !moreSubView) {
      setTab('home');
      return;
    }
    if (tab === 'more' && moreSubView && !isChildAppAllowed(allowedApps, moreSubView)) {
      setMoreSubView(null);
      setTab('home');
    }
  }, [simpleChildUi, tab, moreSubView, allowedApps]);

  useEffect(() => {
    if (loading) return;
    const visible = (families || []).filter((f) => f.deleted !== true && f.hiddenFromApp !== true);
    const live = visible.filter((f) => f.archived !== true && f.active !== false);
    if (isParent && visible.length === 0) {
      // New / incomplete parents must finish ProfileSetup before home setup.
      // Otherwise mail-verify → Home → this redirect kicks them to
      // «Fant ikke familien din» before they can create a family.
      if (!userProfile?.profileComplete) {
        nav.replace('ProfileSetup');
        return;
      }
      // Personal shell is ensured by RootNav / HomeSetupOnboarding — never park on GetStarted.
      if (userProfile?.homeSetupComplete !== true) {
        nav.replace('HomeSetupOnboarding');
        return;
      }
      nav.replace('HomeSetupOnboarding');
      return;
    }
    if (isParent && live.length === 0) {
      goPlatformOverview(nav);
      return;
    }
    if (family?.deleted === true || family?.hiddenFromApp === true) {
      goPlatformOverview(nav);
      return;
    }
    if (family?.type && (isTeamType(family.type) || isClassroomType(family.type))) {
      openPlatformHome(nav, family);
    }
  }, [loading, isParent, families, family, nav, userProfile?.profileComplete]);

  const selectTab = (id, subView = null) => {
    prevNavRef.current = { tab, subView: moreSubView };
    clearShellIntent?.();
    if (simpleChildUi && id === 'more' && !subView) {
      setMoreSubView(null);
      setTab('home');
      return;
    }
    if (asChildView) {
      if (id === 'mail' || subView === 'mail') {
        setMoreSubView(null);
        setTab('home');
        return;
      }
      if (id !== 'more' && !isChildAppAllowed(allowedApps, id)) {
        setMoreSubView(null);
        setTab('home');
        return;
      }
      if (id === 'more' && subView && !isChildAppAllowed(allowedApps, moreSubView || subView)) {
        setMoreSubView(null);
        setTab('home');
        return;
      }
    }
    if (isGrandparent) {
      if (id !== 'more' && id !== 'home' && !isGrandparentAppAllowed(grandparentModules, id)) {
        setMoreSubView(null);
        setTab('home');
        return;
      }
      if (id === 'more' && subView && !isGrandparentAppAllowed(grandparentModules, subView)) {
        setMoreSubView(null);
        setTab('home');
        return;
      }
    }
    if (id === 'mail' || (id === 'more' && subView === 'mail')) {
      setMoreSubView(null);
      setTab('mail');
      return;
    }
    setMoreSubView(subView);
    setTab(id);
  };

  useEffect(() => {
    if (tab === 'plan') setPlanMounted(true);
  }, [tab]);

  useEffect(() => {
    const openMail = () => {
      setMoreSubView(null);
      setTab('mail');
    };
    try {
      if (consumeOpenMailHub()) {
        openMail();
      } else if (typeof sessionStorage !== 'undefined'
        && sessionStorage.getItem(OPEN_CALENDAR_SETTINGS_KEY) === '1') {
        setPlanMounted(true);
        setTab('plan');
      }
    } catch { /* ignore */ }
    if (typeof window === 'undefined') return undefined;
    const onStorage = () => {
      if (consumeOpenMailHub()) openMail();
    };
    const onMsg = (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === OAUTH_COMPLETE_MESSAGE && e.data.mail) openMail();
    };
    const onFocus = () => {
      if (consumeOpenMailHub()) openMail();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('message', onMsg);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('message', onMsg);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const goHome = () => selectTab('home');
  const goBackFromGate = () => {
    if (moreSubView) {
      setMoreSubView(null);
      if (isDesktop) setTab('home');
      else setTab('more');
      return;
    }
    goHome();
  };
  // Kant-sveip på telefon uten rail: modul/innstilling → ett skritt tilbake; ellers underside → Hjem.
  const edgeSwipeEnabled = !isDesktop && !hasRail && !kitchenMode && (!!moreSubView || tab !== 'home');
  const onEdgeSwipeBack = moreSubView ? goBackFromGate : goHome;

  const otherBody = useMemo(() => {
    if (tab === 'plan') return null;
    if (tab === 'chores') {
      if (isChild || isActingAsChild) return <ChoresScreen />;
      return <HomeScreen />;
    }
    if (tab === 'stars') return <RewardsScreen variant="tasks" />;
    if (tab === 'chat') return <ChatTabScreen />;
    if (tab === 'notes') return <NotesHubScreen />;
    if (tab === 'projects') return <ProjectPlatformScreen />;
    if (tab === 'anbud') return <AnbudScreen />;
    if (tab === 'mail') return <MailHubScreen />;
    if (tab === 'more') {
      return (
        <MoreHubScreen
          subView={moreSubView}
          setSubView={setMoreSubView}
        />
      );
    }
    return <HomeScreen />;
  }, [tab, moreSubView, isChild, isActingAsChild]);

  const body = (
    <>
          {planMounted ? (
        <View
          style={{ flex: 1, display: tab === 'plan' ? 'flex' : 'none' }}
          pointerEvents={tab === 'plan' ? 'auto' : 'none'}
          collapsable={false}
        >
          <PlanScreen active={tab === 'plan'} />
        </View>
      ) : null}
      {tab !== 'plan' ? otherBody : null}
    </>
  );

  useEffect(() => {
    if (isDesktop && tab === 'more' && !moreSubView) {
      if (consumeOpenMailHub()) {
        setTab('mail');
        return;
      }
      setTab('home');
    }
  }, [isDesktop, tab, moreSubView]);

  useEffect(() => {
    if (tab === 'chores' && !(isChild || isActingAsChild)) {
      setTab('home');
      return;
    }
    if (chatDockPreferred && tab === 'chat') {
      openChatDrawer();
      setTab('home');
      return;
    }
    if (asChildView && tab === 'mail') {
      setTab('home');
      setMoreSubView(null);
      return;
    }
    if (!asChildView && !isGrandparent) return;
    if (asChildView) {
      if (tab !== 'home' && tab !== 'more' && !isChildAppAllowed(allowedApps, tab)) {
        setTab('home');
        setMoreSubView(null);
        return;
      }
      if (moreSubView && !isChildAppAllowed(allowedApps, moreSubView)) {
        setTab('home');
        setMoreSubView(null);
      }
      return;
    }
    if (isGrandparent) {
      if (tab !== 'home' && tab !== 'more' && !isGrandparentAppAllowed(grandparentModules, tab)) {
        setTab('home');
        setMoreSubView(null);
        return;
      }
      if (moreSubView && !isGrandparentAppAllowed(grandparentModules, moreSubView)) {
        setTab('home');
        setMoreSubView(null);
      }
    }
  }, [tab, moreSubView, isChild, isActingAsChild, asChildView, allowedApps, isDesktop, chatDockPreferred, openChatDrawer, isGrandparent, grandparentModules]);

  const railTabs = SHELL_TABS
    .filter((item) => {
      const asChild = isChild || isActingAsChild;
      if (!asChild && item.id === 'chores') return false;
      if (asChild && item.id === 'mail') return false;
      if (asChild && item.id !== 'home' && item.id !== 'more' && !isChildAppAllowed(allowedApps, item.id)) {
        return false;
      }
      if (isGrandparent && item.id !== 'home' && item.id !== 'more'
        && !isGrandparentAppAllowed(grandparentModules, item.id)) {
        return false;
      }
      return true;
    })
    .map((item) => ({
      ...item,
      label: t(item.labelKey),
    }));

  const shellHeaderTitle = useMemo(() => resolveShellHeaderTitle({
    tab,
    moreSubView,
    t,
    asChildView,
    childHomeTitle: asChildView ? childShellTitle(now, { child: viewingChild }) : null,
    modulesHub: isPhone && !simpleChildUi && (asChildView || isParent),
  }), [tab, moreSubView, t, asChildView, now, viewingChild, isPhone, isParent, simpleChildUi]);

  const introModuleId = tab === 'more'
    ? (moreSubView || (isDesktop ? null : 'more'))
    : tab;
  const pageHeroId = (!kitchenMode && showPageHero)
    ? shellHeroModuleId(tab, moreSubView)
    : null;
  const headerHeroId = (!kitchenMode && showPageHero)
    ? phoneChromeHeroId(tab, moreSubView, isPhone)
    : null;

  const activationModuleId = kitchenMode
    ? null
    : activationModuleIdForShell(tab, moreSubView);
  const blockingWelcome = needsWelcome(activationModuleId);

  const onActivationBack = () => {
    const prev = prevNavRef.current || { tab: 'home', subView: null };
    if (prev.tab && (prev.tab !== tab || (prev.subView || null) !== (moreSubView || null))) {
      selectTab(prev.tab, prev.subView || null);
      return;
    }
    goBackFromGate();
  };

  const gatedBody = (
    <ModuleActivationGate
      moduleId={activationModuleId}
      onBack={onActivationBack}
      enabled={!kitchenMode}
    >
      {body}
    </ModuleActivationGate>
  );

  const showDeskAside = isDesktop && !kitchenMode
    && tab !== 'home' && tab !== 'plan' && tab !== 'chat' && tab !== 'mail';

  // Bottom nav owns home-indicator padding; keep shell flush to the viewport bottom.
  // Use object edges: on web, omitting a side from an array still applies additive inset
  // (react-native-safe-area-context 5.6.x). Explicit `bottom: 'off'` is required.
  const showParentBottomNav = shouldShowParentBottomNav({
    ready: parentThemeReady,
    theme: parentDashTheme,
    bottomShortcutIds,
    isParent,
    asChildView,
    hasRail,
    kitchenMode,
    bottomNavEnabled,
  });
  const immersiveHome = isImmersivePhotoShell({
    isPhone,
    tab,
    moreSubView,
    isParent,
    asChildView,
    kitchenMode,
    simpleChildUi,
  });
  const backdropBannerId = asChildView ? childHome.layout.bannerId : homeBannerId;
  const backdropCustomUri = asChildView ? childHome.layout.customBannerUri : homeCustomBannerUri;
  const safeEdges = showParentBottomNav
    ? { top: 'additive', right: 'additive', bottom: 'off', left: 'additive' }
    : { top: 'additive', right: 'additive', bottom: 'additive', left: 'additive' };

  return (
    <HomeImmersiveProvider value={immersiveHome}>
    <ModuleAsideProvider>
    <ShellTitleRightContext.Provider value={shellTitleApi}>
    <View style={[styles.safe, { backgroundColor: immersiveHome ? '#1a2430' : colors.bg }]}>
      {immersiveHome ? (
        <HomeBackdrop bannerId={backdropBannerId} customUri={backdropCustomUri} />
      ) : null}
      <SafeAreaView edges={safeEdges} style={[styles.safe, { backgroundColor: 'transparent' }]}>
      <View style={[styles.wrap, hasRail && !kitchenMode && styles.wrapRow, immersiveHome && styles.immersiveLayer]}>
        {hasRail && !kitchenMode && (
          <View style={[
            styles.rail,
            {
              width: isDesktop ? (railCollapsed ? 52 : railWidth) : railWidth,
              borderRightColor: colors.line,
              backgroundColor: colors.card,
            },
            isDesktop && styles.railDesktop,
          ]}
          >
            {isDesktop ? (
              <DesktopRail
                activeTab={tab}
                activeSubView={moreSubView}
                onSelectTab={selectTab}
                collapsed={railCollapsed}
                onToggleCollapse={() => setRailCollapsed((v) => !v)}
              />
            ) : (
              <HelpTarget id="rail" style={{ flex: 1 }}>
                <BrandLogo variant="full" height={48} maxWidth={180} style={styles.brandLogo} />
                <Text style={[styles.fam, { color: colors.muted }]} numberOfLines={1}>
                  {family?.name || 'Familien'}
                </Text>

                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ gap: 6, paddingBottom: 12 }}
                  showsVerticalScrollIndicator={false}
                >
                  {railTabs.map((item) => (
                    <RailTabItem
                      key={item.id}
                      tab={item}
                      active={item.id === 'more' ? (tab === 'more' && !moreSubView) : tab === item.id}
                      onPress={() => selectTab(item.id)}
                      desktop={false}
                      colors={colors}
                      badgeCount={countForModule(unreadByModule, item.id)}
                    />
                  ))}
                </ScrollView>

                {!simpleChildUi && (
                  <TouchableOpacity
                    style={[styles.railToolsBtn, { borderColor: colors.line }]}
                    onPress={() => setDrawerOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Mer"
                  >
                    <IconBadge count={countForModule(unreadByModule, 'more')} size={15} offset={-6}>
                      <Ionicons name="grid-outline" size={18} color={colors.brand} />
                    </IconBadge>
                    <Text style={[styles.railToolsTxt, { color: colors.brand }]}>Mer</Text>
                  </TouchableOpacity>
                )}
              </HelpTarget>
            )}
          </View>
        )}

        <View style={[styles.main, immersiveHome && styles.immersiveLayer]}>
          {!kitchenMode ? <AddToHomeBanner onOpenGuide={() => setAddHomeOpen(true)} /> : null}
          {kitchenMode && tab !== 'home' ? (
            <View style={[styles.kitchenNav, { borderBottomColor: colors.line, backgroundColor: colors.brandSoft }]}>
              <TouchableOpacity
                onPress={() => selectTab('home')}
                style={styles.kitchenNavBtn}
                accessibilityRole="button"
                accessibilityLabel="Tilbake til kjøkkenvisning"
              >
                <Ionicons name="arrow-back" size={18} color={colors.brand} />
                <Text style={[styles.kitchenNavTxt, { color: colors.brand }]}>Kjøkkenvisning</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={requestExitKitchen}
                accessibilityRole="button"
                accessibilityLabel="Avslutt kjøkkenvisning"
              >
                <Text style={[styles.kitchenNavExit, { color: colors.muted }]}>Avslutt</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <ModuleHeroHostProvider hosted={!!pageHeroId}>
          {!kitchenMode ? (
            <ShellHeader
              title={shellHeaderTitle}
              onMenuPress={(!hasRail && !simpleChildUi) ? () => setDrawerOpen(true) : null}
              compact={isDesktop}
              dense={false}
              chromeOnly={isImmersivePhotoChromeOnly({
                isPhone,
                tab,
                moreSubView,
                isParent,
                asChildView,
                simpleChildUi,
              })}
              showFamilyHint={isTablet && tab !== 'mail'}
              titleRight={shellTitleRight}
              onLogoHome={goHome}
              hero={headerHeroId ? (
                <ModuleHero moduleId={headerHeroId} flush chrome />
              ) : null}
            />
          ) : null}
          {!kitchenMode ? <PushEnableBanner /> : null}
          {!kitchenMode ? (
            <AddToHomeGuide visible={addHomeOpen} onClose={() => setAddHomeOpen(false)} />
          ) : null}
          <View style={[
            styles.contentArea,
            hasRail && !isDesktop && !kitchenMode && styles.contentAreaCentered,
            isDesktop && !kitchenMode && styles.contentAreaDesktop,
            kitchenMode && styles.contentAreaKitchen,
            immersiveHome && styles.immersiveLayer,
          ]}
          >
            <View style={[
              styles.contentInner,
              hasRail && !isDesktop && !kitchenMode && { maxWidth: contentMax, width: '100%' },
              isDesktop && !kitchenMode && styles.contentInnerDesktop,
              kitchenMode && styles.contentInnerKitchen,
              immersiveHome && styles.immersiveLayer,
            ]}
            >
              {pageHeroId && !headerHeroId ? (
                  <View style={[
                    styles.heroBand,
                    isDesktop ? styles.heroBandDesk : styles.heroBandTablet,
                  ]}>
                    <ModuleHero moduleId={pageHeroId} flush />
                  </View>
                ) : null}
                {showDeskAside ? (
                  <View style={[styles.deskSplit, pageHeroId && styles.deskSplitAfterHero]}>
                    <View style={styles.deskMain}>
                      <EdgeSwipeBack enabled={edgeSwipeEnabled} onBack={onEdgeSwipeBack}>
                        {gatedBody}
                      </EdgeSwipeBack>
                    </View>
                    <View style={styles.deskAside}>
                      <ModuleAside />
                    </View>
                  </View>
                ) : (
                  <View style={[styles.bodyFill, immersiveHome && styles.immersiveLayer]}>
                    <EdgeSwipeBack enabled={edgeSwipeEnabled} onBack={onEdgeSwipeBack}>
                      {gatedBody}
                    </EdgeSwipeBack>
                  </View>
                )}
              {!kitchenMode ? (
                <ModuleIntroHost
                  scope="family"
                  moduleId={introModuleId}
                  enabled={!loading && !!introModuleId && !blockingWelcome}
                />
              ) : null}
            </View>
          </View>
          </ModuleHeroHostProvider>
        </View>
        <ParentShellBottomNav
          tab={tab}
          moreSubView={moreSubView}
          kitchenMode={kitchenMode}
          onSelectTab={selectTab}
          glass={immersiveHome}
        />
      </View>

      {!simpleChildUi && !kitchenMode && (
        <ShellDrawer
          visible={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          activeTab={tab}
          activeSubView={moreSubView}
          onSelectTab={selectTab}
        />
      )}

      <KitchenPinModal
        visible={kitchenPinOpen}
        mode="unlock"
        onCancel={() => setKitchenPinOpen(false)}
        onSubmit={async (pin) => {
          const full = await loadKitchenDisplaySettings(uid);
          if (!(await verifyKitchenPin(full, pin))) return false;
          setKitchenPinOpen(false);
          await exitKitchen();
          return true;
        }}
      />

    </SafeAreaView>
    </View>
    </ShellTitleRightContext.Provider>
    </ModuleAsideProvider>
    </HomeImmersiveProvider>
  );
}

export default function AppShell() {
  const { familyId, family } = useApp();
  return <AppShellInner key={`fam-${familyId || 'none'}-${family?.type || 'x'}`} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, overflow: 'visible' },
  wrap: { flex: 1, overflow: 'visible', position: 'relative', zIndex: 1, backgroundColor: 'transparent' },
  immersiveLayer: { backgroundColor: 'transparent' },
  wrapRow: { flexDirection: 'row' },
  rail: {
    backgroundColor: '#fff',
    borderRightWidth: 1,
    paddingTop: 16,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  railDesktop: {
    paddingTop: 12,
    paddingHorizontal: 8,
    paddingBottom: 6,
    backgroundColor: '#f7f8fb',
  },
  brandLogo: { marginBottom: 6, marginHorizontal: 2, alignSelf: 'center' },
  fam: { marginBottom: 14, fontWeight: '600', fontSize: 13, paddingHorizontal: 4 },
  railSection: {
    fontSize: 11, fontWeight: '800', letterSpacing: 0.4,
    textTransform: 'uppercase', marginBottom: 6, marginTop: 4, paddingHorizontal: 8,
  },
  tabItemBig: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: radius.sm, minHeight: 56, gap: 2,
  },
  tabLabel: { fontWeight: '700', fontSize: 12, marginTop: 2 },
  railRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8,
    overflow: 'visible',
  },
  railRowActive: {
    borderRadius: 8,
  },
  railRowLabel: { fontWeight: '700', fontSize: 14, flex: 1 },
  railToolsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 12, borderWidth: 1, backgroundColor: '#f8fafc',
    marginTop: 8,
  },
  railToolsBtnDesktop: {
    justifyContent: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  railToolsTxt: { fontWeight: '800', fontSize: 13 },
  main: { flex: 1, minWidth: 0, overflow: 'visible', zIndex: 1, backgroundColor: 'transparent' },
  contentArea: { flex: 1, minHeight: 0, zIndex: 1, position: 'relative', backgroundColor: 'transparent' },
  contentAreaCentered: {
    alignItems: 'center',
  },
  contentAreaDesktop: {
    alignItems: 'stretch',
  },
  contentInner: { flex: 1, minWidth: 0, alignSelf: 'stretch', position: 'relative', backgroundColor: 'transparent' },
  contentInnerDesktop: {
    maxWidth: '100%',
    width: '100%',
  },
  heroBand: {
    flexShrink: 0,
    zIndex: 1,
  },
  heroBandDesk: {
    paddingLeft: 16,
    paddingRight: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  heroBandTablet: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  bodyFill: { flex: 1, minHeight: 0, backgroundColor: 'transparent' },
  deskSplit: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    gap: 24,
    paddingLeft: 16,
    paddingRight: 20,
    paddingTop: 8,
    paddingBottom: 12,
    width: '100%',
    alignSelf: 'stretch',
    minHeight: 0,
  },
  deskSplitAfterHero: {
    paddingTop: 4,
  },
  deskMain: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    maxWidth: 880,
    overflow: 'hidden',
  },
  deskAside: {
    width: 300,
    flexShrink: 0,
    marginLeft: 'auto',
    paddingTop: 4,
    minHeight: 0,
  },
  contentAreaKitchen: { alignItems: 'stretch' },
  contentInnerKitchen: { maxWidth: '100%', width: '100%' },
  kitchenNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  kitchenNavBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kitchenNavTxt: { fontWeight: '700', fontSize: 14 },
  kitchenNavExit: { fontWeight: '600', fontSize: 13 },
});
