import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../src/context/AppContext';
import { useColors, useThemeMeta } from '../src/context/ThemeContext';
import { useLayout } from '../src/theme';
import { canShowModuleHero } from '../src/modules/moduleHero';
import ShellHeader, { ShellTitleRightContext } from './ShellHeader';
import ShellDrawer from './ShellDrawer';
import DesktopRail from './DesktopRail';
import ModuleHero from './ModuleHero';
import { ModuleHeroHostProvider } from './ModulePageBg';
import EdgeSwipeBack from './EdgeSwipeBack';

/**
 * Toppfelt + meny for stack-skjermer utenfor AppShell (Skole m.m.).
 * Beholder hamburger og desktop-rail — AppShell unmountes på disse sidene.
 * ModuleHero ligger øverst (telefon: i chrome under logo; nettbrett/desktop: bånd over innhold),
 * likt resten av modulene.
 */
export default function StackShellChrome({ title = 'Hjem', moduleId = null, children }) {
  const nav = useNavigation();
  const colors = useColors();
  const { highChildFriendliness } = useThemeMeta();
  const { isDesktop, isPhone, railWidth } = useLayout();
  const { requestShellTab } = useApp();
  const simpleChildUi = !!highChildFriendliness;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [shellTitleRight, setShellTitleRight] = useState(null);
  const shellTitleOwnerRef = useRef(null);

  const heroId = moduleId && canShowModuleHero(moduleId) ? moduleId : null;
  const headerHeroId = heroId && isPhone ? heroId : null;
  const pageHeroId = heroId && !headerHeroId ? heroId : null;

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

  const goHome = useCallback(() => {
    nav.navigate('Home');
    requestShellTab?.('home');
  }, [nav, requestShellTab]);

  const onEdgeSwipeBack = useCallback(() => {
    if (nav.canGoBack()) {
      nav.goBack();
      return;
    }
    goHome();
  }, [nav, goHome]);

  const onSelectTab = useCallback((id, subView = null) => {
    setDrawerOpen(false);
    nav.navigate('Home');
    requestShellTab?.(id, subView);
  }, [nav, requestShellTab]);

  const onMenuPress = useCallback(() => {
    if (isDesktop) {
      setRailCollapsed((v) => !v);
      return;
    }
    setDrawerOpen(true);
  }, [isDesktop]);

  return (
    <ShellTitleRightContext.Provider value={shellTitleApi}>
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: colors.bg }]}>
        <View style={[styles.wrap, isDesktop && styles.wrapRow]}>
          {isDesktop ? (
            <View style={[
              styles.rail,
              {
                width: railCollapsed ? 52 : railWidth,
                borderRightColor: colors.line,
              },
            ]}
            >
              <DesktopRail
                activeTab={null}
                activeSubView={null}
                onSelectTab={onSelectTab}
                collapsed={railCollapsed}
                onToggleCollapse={() => setRailCollapsed((v) => !v)}
              />
            </View>
          ) : null}
          <View style={styles.main}>
            <ModuleHeroHostProvider hosted={!!heroId}>
              <ShellHeader
                title={title}
                onMenuPress={simpleChildUi ? null : onMenuPress}
                compact={isDesktop}
                titleRight={!isDesktop ? shellTitleRight : null}
                onLogoHome={goHome}
                hero={headerHeroId ? (
                  <ModuleHero moduleId={headerHeroId} flush chrome />
                ) : null}
              />
              {pageHeroId ? (
                <View style={[
                  styles.heroBand,
                  isDesktop ? styles.heroBandDesk : styles.heroBandTablet,
                ]}
                >
                  <ModuleHero moduleId={pageHeroId} flush />
                </View>
              ) : null}
              <View style={styles.body}>
                <EdgeSwipeBack enabled={!isDesktop} onBack={onEdgeSwipeBack}>
                  {children}
                </EdgeSwipeBack>
              </View>
            </ModuleHeroHostProvider>
          </View>
        </View>
        {simpleChildUi ? null : (
          <ShellDrawer
            visible={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            activeTab={null}
            activeSubView={null}
            onSelectTab={onSelectTab}
          />
        )}
      </SafeAreaView>
    </ShellTitleRightContext.Provider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { flex: 1, overflow: 'visible' },
  wrapRow: { flexDirection: 'row' },
  rail: {
    backgroundColor: '#f7f8fb',
    borderRightWidth: 1,
    paddingTop: 12,
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  main: { flex: 1, minWidth: 0, overflow: 'visible', zIndex: 1 },
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
  body: { flex: 1, minHeight: 0 },
});
