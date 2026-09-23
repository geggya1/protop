import React, { createContext, useContext, useMemo, useState } from 'react';
import { View, Image, StyleSheet, Platform } from 'react-native';
import { useLayout } from '../src/theme';
import {
  illustrationSourceById,
  moduleIdForPageName,
} from '../src/modules/moduleActivationAssets';
import ModuleHero from './ModuleHero';

const ModuleHeroHostContext = createContext(false);

/** AppShell sets this when the shared heading is already drawn above the page. */
export function ModuleHeroHostProvider({ hosted = false, children }) {
  return (
    <ModuleHeroHostContext.Provider value={!!hosted}>
      {children}
    </ModuleHeroHostContext.Provider>
  );
}

export function useModuleHeroHosted() {
  return useContext(ModuleHeroHostContext);
}

/** Same height formula as chat/notes/shop/wishlists (legacy bottom art). */
export function useModuleBgHeight() {
  const { isDesktop, width: layoutW, height: layoutH } = useLayout();
  return Math.round(Math.min(layoutW * 0.72, layoutH * 0.5, isDesktop ? 380 : 360));
}

/** Compact heading is used on phone, tablet and desktop. */
export function useShowModuleHero() {
  return true;
}

/** Bottom content pad so absolute art is not covered (wishlists uses ~120). */
export function useModuleBgPad() {
  const bgH = useModuleBgHeight();
  const { isDesktop } = useLayout();
  const showHero = useShowModuleHero();
  if (showHero) return 0;
  return isDesktop ? Math.max(140, Math.round(bgH * 0.38)) : Math.max(120, Math.round(bgH * 0.4));
}

export function useModuleBgPeek() {
  return useModuleBgPad();
}

export function ModuleBgSpacer() {
  const pad = useModuleBgPad();
  if (!pad) return null;
  return <View style={{ height: pad }} pointerEvents="none" />;
}

/** Hides duplicate page titles/leads when the shared top hero is visible. */
export function ModuleHubIntro({ children }) {
  const showHero = useShowModuleHero();
  if (showHero) return null;
  return children;
}

/**
 * Absolute bottom illustration — placement identical to notes/chat/wishlists.
 * `name` selects the module art (catalog illustration, same as help/activation).
 * On web, loads /assets/module-activation/*.png first.
 * Hidden when ModuleHero takes over (phone, tablet and desktop).
 */
export default function ModulePageBg({ name = null }) {
  const bgH = useModuleBgHeight();
  const showHero = useShowModuleHero();
  const [useBundled, setUseBundled] = useState(Platform.OS !== 'web');
  const moduleId = moduleIdForPageName(name);

  const imgSource = useMemo(() => {
    if (!moduleId) return null;
    return illustrationSourceById(moduleId, { preferBundled: useBundled });
  }, [moduleId, useBundled]);

  if (showHero || !imgSource) return null;

  return (
    <View
      pointerEvents="none"
      collapsable={false}
      style={[styles.bgWrap, { height: bgH }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image
        source={imgSource}
        style={styles.bgArt}
        resizeMode="contain"
        onError={() => {
          // Web public PNG failed → try bundled require.
          if (Platform.OS === 'web' && !useBundled) setUseBundled(true);
        }}
      />
    </View>
  );
}

/**
 * Notes/wishlists structure: absolute art, then ScrollView sibling.
 * When the shared ModuleHero sits above the page, skip the bottom illustration.
 */
export function ModulePageFrame({ name = null, children, hero = true }) {
  const showHero = useShowModuleHero();
  const hosted = useModuleHeroHosted();
  const { isPhone } = useLayout();
  const moduleId = moduleIdForPageName(name);

  // Phone chrome never paints a second heading card in the scroll body.
  if (hosted || isPhone) {
    return <View style={styles.frameBody}>{children}</View>;
  }

  if (hero && showHero && moduleId) {
    return (
      <View style={styles.frame}>
        <ModuleHero moduleId={moduleId} />
        <View style={styles.frameBody}>{children}</View>
      </View>
    );
  }

  return (
    <>
      <ModulePageBg name={name} />
      {children}
    </>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, minHeight: 0 },
  frameBody: { flex: 1, minHeight: 0 },
  bgWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 10,
    zIndex: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
  },
  bgArt: {
    width: '100%',
    height: '100%',
    opacity: 0.88,
  },
});
