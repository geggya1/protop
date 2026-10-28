import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Pressable,
  Animated, ScrollView, useWindowDimensions, Platform, InteractionManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../src/context/AppContext';
import { colors } from '../src/theme';
import { useColors } from '../src/context/ThemeContext';
import { findActiveNavItem, navSections, runNavAction } from '../src/navigation/navTree';
import { useNavTree } from '../src/hooks/useNavTree';
import NavTree, { useNavTreeState } from './NavTree';
import { useUnread } from '../src/context/NotificationContext';
import BrandLogo from './BrandLogo';
import { brandLogoToneForBackground } from '../src/brand/brandLogoTone';

const DRAWER_WIDTH = 268;

/**
 * Kompakt hamburger-skuff fra venstre. Innholdet er det samme som sidemenyen på PC
 * (NavTree, src/navigation/navTree.js); her kommer bare skuffen, animasjonen og
 * rulling til siden som er åpen.
 */
export default function ShellDrawer({
  visible,
  onClose,
  activeTab,
  activeSubView,
  onSelectTab,
}) {
  const nav = useNavigation();
  const colors = useColors();
  const logoTone = brandLogoToneForBackground(colors.card);
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const drawerW = Math.min(DRAWER_WIDTH, Math.round(winW * 0.78));
  const { isParent, isChild, isActingAsChild } = useApp();
  const asChild = isChild || isActingAsChild;
  const asParent = isParent && !isActingAsChild;
  const { unreadByModule } = useUnread();
  const sections = useNavTree();
  const state = useNavTreeState(sections, activeTab, activeSubView);
  const shown = useMemo(() => navSections(sections), [sections]);
  const { setOpen } = state;

  const slide = useRef(new Animated.Value(-drawerW)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef(null);
  const rowRefs = useRef({});
  const scrollOffsetY = useRef(0);

  useEffect(() => {
    if (visible) {
      scrollOffsetY.current = 0;
      slide.setValue(-drawerW);
      fade.setValue(0);
      Animated.parallel([
        Animated.timing(slide, {
          toValue: 0, duration: 200, useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(fade, {
          toValue: 1, duration: 160, useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start();
    }
  }, [visible, drawerW, slide, fade]);

  const animateClose = (after) => {
    Animated.parallel([
      Animated.timing(slide, {
        toValue: -drawerW, duration: 160, useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(fade, {
        toValue: 0, duration: 140, useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start(({ finished }) => {
      if (finished) after?.();
    });
  };

  const handleClose = () => animateClose(onClose);

  const runAction = (action) => {
    if (!action) return;
    animateClose(() => {
      onClose?.();
      runNavAction(action, {
        onSelectTab,
        navigate: (screen, params) => nav.navigate(screen, params),
      });
    });
  };

  const rowRef = useCallback((id, node) => {
    if (node) rowRefs.current[id] = node;
    else delete rowRefs.current[id];
  }, []);

  const scrollActiveIntoView = useCallback((itemId) => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const el = document.getElementById(`module-nav-${itemId}`);
      if (!el) return false;
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      return true;
    }
    const row = rowRefs.current[itemId];
    const scroll = scrollRef.current;
    if (!row || !scroll) return false;
    row.measureInWindow((rx, ry, rw, rh) => {
      if (rh <= 0) return;
      scroll.measureInWindow((sx, sy, sw, sh) => {
        if (sh <= 0) return;
        const rowCenter = ry + rh / 2;
        const viewCenter = sy + sh / 2;
        const delta = rowCenter - viewCenter;
        if (Math.abs(delta) < 8) return;
        scroll.scrollTo({
          y: Math.max(0, scrollOffsetY.current + delta),
          animated: true,
        });
      });
    });
    return true;
  }, []);

  // Når skuffen åpnes: åpne seksjonen med aktiv side og rull dit.
  useEffect(() => {
    if (!visible) return undefined;
    const active = findActiveNavItem(shown, activeTab, activeSubView);
    if (!active) return undefined;

    setOpen((prev) => {
      if (prev[active.sectionId] === true) return prev;
      return { ...prev, [active.sectionId]: true };
    });

    let cancelled = false;
    let done = false;
    const tryScroll = () => {
      if (cancelled || done) return;
      if (scrollActiveIntoView(active.itemId)) done = true;
    };

    const handle = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      tryScroll();
    });
    const timers = [50, 180, 320].map((ms) => setTimeout(tryScroll, ms));

    return () => {
      cancelled = true;
      handle?.cancel?.();
      timers.forEach(clearTimeout);
    };
  }, [visible, shown, activeTab, activeSubView, setOpen, scrollActiveIntoView]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: fade }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} accessibilityLabel="Lukk meny" />
        </Animated.View>
        <Animated.View
          style={[
            styles.drawer,
            {
              width: drawerW,
              paddingTop: Math.max(insets.top, 8),
              paddingBottom: Math.max(insets.bottom, 8),
              transform: [{ translateX: slide }],
              backgroundColor: colors.card,
            },
          ]}
        >
          <View style={[styles.drawerHead, { borderBottomColor: colors.line }]}>
            <View style={styles.logoRow}>
              <BrandLogo variant="full" tone={logoTone} height={40} maxWidth={180} style={styles.logo} />
              <TouchableOpacity
                onPress={handleClose}
                style={[styles.closeBtn, { backgroundColor: colors.bg }]}
                accessibilityLabel="Lukk"
              >
                <Ionicons name="close" size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>
            {asParent || asChild ? (
              <Text style={[styles.hint, { color: colors.muted }]}>Apper er gruppert — trykk en mappe for å åpne</Text>
            ) : null}
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={styles.scrollBody}
            showsVerticalScrollIndicator={false}
            onScroll={(e) => {
              scrollOffsetY.current = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
          >
            <NavTree
              variant="drawer"
              sections={shown}
              state={state}
              activeTab={activeTab}
              activeSubView={activeSubView}
              unreadByModule={unreadByModule}
              onAction={(item) => runAction(item.action)}
              rowRef={rowRef}
            />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  drawer: {
    height: '100%',
    backgroundColor: colors.card,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    shadowColor: '#0f172a',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 3, height: 0 },
    elevation: 10,
    zIndex: 2,
  },
  drawerHead: {
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 40,
  },
  logo: { flexShrink: 1 },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bg,
    flexShrink: 0,
  },
  hint: {
    marginTop: 8,
    marginHorizontal: 2,
    fontSize: 12,
    fontWeight: '400',
    color: colors.muted,
    lineHeight: 16,
  },
  scroll: { flex: 1 },
  scrollBody: { paddingHorizontal: 8, paddingTop: 8, paddingBottom: 20, gap: 6 },
});
