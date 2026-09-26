import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Pressable,
  Animated, ScrollView, useWindowDimensions, Platform, InteractionManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../src/context/AppContext';
import { useI18n } from '../src/i18n';
import { colors } from '../src/theme';
import { useColors } from '../src/context/ThemeContext';
import { buildShellModules } from '../src/navigation/shellModules';
import { isParentAppSection } from '../src/navigation/parentAppGroups';
import { isChildAppSection } from '../src/navigation/childAppGroups';
import { useAiPlanImport } from '../src/hooks/useAiPlanImport';
import AiImportChildPicker from './AiImportChildPicker';
import IconBadge from './IconBadge';
import { useUnread } from '../src/context/NotificationContext';
import { countForItem } from '../src/utils/notifications';
import { allowedAppsForChild, isChildAppAllowed } from '../src/utils/childApps';
import { grandparentModulesFor } from '../src/utils/grandparentAccess';
import BrandLogo from './BrandLogo';

const DRAWER_WIDTH = 268;
const DEFAULT_OPEN = { main: true, company: true, skole: true, account: false };

function DrawerRow({ item, active, onPress, badgeCount = 0 }) {
  const colors = useColors();
  const highlight = !!item.highlight;
  const base = item.icon || 'ellipse';
  const alreadyOutline = base.endsWith('-outline');
  const iconName = highlight || active || alreadyOutline
    ? (alreadyOutline && (highlight || active) ? base.replace(/-outline$/, '') : base)
    : `${base}-outline`;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.row,
        active && styles.rowActive,
        highlight && styles.rowHighlight,
      ]}
      accessibilityRole="button"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: !!active }}
      nativeID={`module-nav-${item.id}`}
      id={`module-nav-${item.id}`}
    >
      <View style={[
        styles.iconWrap,
        active && styles.iconWrapActive,
        highlight && styles.iconWrapHighlight,
      ]}
      >
        <IconBadge count={badgeCount} size={14} offset={-6} borderColor={highlight ? colors.brand : '#fff'}>
          <Ionicons
            name={iconName}
            size={16}
            color={highlight ? '#fff' : active ? colors.brand : colors.ink}
          />
        </IconBadge>
      </View>
      <Text
        style={[
          styles.rowLabel,
          active && styles.rowLabelActive,
          highlight && styles.rowLabelHighlight,
        ]}
        numberOfLines={1}
      >
        {item.label}
      </Text>
    </TouchableOpacity>
  );
}

/**
 * Kompakt hamburger-skuff fra venstre.
 * Filtrerer bort foreldre-moduler når man ser som barn.
 * Foreldre får lukkbare app-mapper (Mat, Minner, …) — samme gruppering som desktop-rail.
 */
export default function ShellDrawer({
  visible,
  onClose,
  activeTab,
  activeSubView,
  onSelectTab,
}) {
  const nav = useNavigation();
  const { t } = useI18n();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const drawerW = Math.min(DRAWER_WIDTH, Math.round(winW * 0.78));
  const {
    isParent, isChild, isActingAsChild, isAdmin, isSuperAdmin, isGrandparent,
    family, familyId, kids, meChild, meParent, activeChild,
  } = useApp();

  const {
    startImport, canImport, activeKids: importKids,
    childPickerOpen, selectChild, closePicker,
  } = useAiPlanImport();

  const asChild = isChild || isActingAsChild;
  const asParent = isParent && !isActingAsChild;
  const [open, setOpen] = useState(DEFAULT_OPEN);

  const activeKids = useMemo(
    () => (kids || []).filter((k) => k.active !== false),
    [kids],
  );
  const childForSchedule = isActingAsChild ? activeChild : (isChild ? meChild : null);
  const { unreadByModule } = useUnread();
  const allowedApps = asChild ? allowedAppsForChild(childForSchedule) : null;
  const grandparentModules = isGrandparent ? grandparentModulesFor(meParent) : null;
  const showChildRestrictions = isActingAsChild && !!childForSchedule;
  const aiEnabled = asChild ? isChildAppAllowed(allowedApps, 'ai') : true;

  const sections = useMemo(
    () => buildShellModules({
      t,
      asChild,
      asParent,
      isAdmin,
      isSuperAdmin,
      familyId,
      family,
      canImport: asParent && canImport,
      hasKids: activeKids.length > 0,
      childForSchedule,
      aiEnabled,
      allowedApps,
      showChildRestrictions,
      firstKid: activeKids[0] || null,
      isGrandparent,
      grandparentModules,
    }),
    [
      t, asChild, asParent, isAdmin, isSuperAdmin, familyId, family,
      canImport, activeKids, childForSchedule, aiEnabled,
      allowedApps, showChildRestrictions, isGrandparent, grandparentModules,
    ],
  );

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
    if (action.type === 'fn' && action.id === 'aiImport') {
      animateClose(() => {
        onClose?.();
        startImport();
      });
      return;
    }
    animateClose(() => {
      onClose?.();
      if (action.type === 'tab') {
        onSelectTab?.(action.tab, action.subView || null);
      } else if (action.type === 'nav') {
        nav.navigate(action.screen, action.params);
      }
    });
  };

  const isItemActive = useCallback((item) => {
    const a = item.action;
    if (!a || a.type !== 'tab') return false;
    if (a.tab !== activeTab) return false;
    if (a.tab === 'more') return (a.subView || null) === (activeSubView || null);
    return !activeSubView;
  }, [activeTab, activeSubView]);

  const sectionHasActive = useCallback((section) => (
    (section.items || []).some((item) => isItemActive(item))
  ), [isItemActive]);

  const findActiveItem = useCallback(() => {
    for (const section of sections) {
      for (const item of section.items || []) {
        if (isItemActive(item)) {
          return { itemId: item.id, sectionId: section.id };
        }
      }
    }
    return null;
  }, [sections, isItemActive]);

  const isSectionExpanded = useCallback((section) => {
    if (Object.prototype.hasOwnProperty.call(open, section.id)) {
      return open[section.id] !== false;
    }
    if (sectionHasActive(section)) return true;
    if (isParentAppSection(section.id) || isChildAppSection(section.id)) return false;
    if (section.id === 'account') return false;
    return true;
  }, [open, sectionHasActive]);

  const sectionBadge = useCallback((section) => {
    if (isSectionExpanded(section)) return 0;
    return (section.items || []).reduce(
      (sum, item) => sum + (countForItem(unreadByModule, item) || 0),
      0,
    );
  }, [isSectionExpanded, unreadByModule]);

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

  // Når skuffen åpnes: åpne mappen med aktiv side og scroll dit.
  useEffect(() => {
    if (!visible) return undefined;
    const active = findActiveItem();
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
  }, [visible, findActiveItem, scrollActiveIntoView]);

  if (!visible && !childPickerOpen) return null;

  return (
    <>
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
            <View style={styles.drawerHead}>
              <View style={styles.logoRow}>
                <BrandLogo variant="full" height={40} maxWidth={180} style={styles.logo} />
                <TouchableOpacity
                  onPress={handleClose}
                  style={styles.closeBtn}
                  accessibilityLabel="Lukk"
                >
                  <Ionicons name="close" size={18} color={colors.muted} />
                </TouchableOpacity>
              </View>
              {asParent || asChild ? (
                <Text style={styles.hint}>Apper er gruppert — trykk en mappe for å åpne</Text>
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
              {sections.map((section) => {
                const expanded = isSectionExpanded(section);
                const appFolder = isParentAppSection(section.id) || isChildAppSection(section.id);
                const foldable = appFolder || section.id === 'account' || section.id === 'skole';
                const badge = sectionBadge(section);
                return (
                  <View
                    key={section.id}
                    style={[styles.section, appFolder && styles.appSection, section.id === 'company' && styles.companySection]}
                  >
                    {foldable ? (
                      <TouchableOpacity
                        style={[styles.sectionHead, appFolder && styles.appSectionHead]}
                        onPress={() => setOpen((prev) => ({ ...prev, [section.id]: !expanded }))}
                        accessibilityRole="button"
                        accessibilityState={{ expanded }}
                        accessibilityLabel={`${section.title}, ${expanded ? 'åpen' : 'lukket'}`}
                      >
                        <Text style={[styles.sectionTitle, appFolder && styles.appSectionTitle]}>
                          {section.title}
                        </Text>
                        <View style={styles.sectionRight}>
                          {badge > 0 ? (
                            <View style={styles.sectionBadge}>
                              <Text style={styles.sectionBadgeTxt}>
                                {badge > 9 ? '9+' : String(badge)}
                              </Text>
                            </View>
                          ) : null}
                          <Ionicons
                            name={expanded ? 'chevron-down' : 'chevron-forward'}
                            size={16}
                            color={appFolder ? colors.ink : colors.muted}
                          />
                        </View>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.sectionTitle}>{section.title}</Text>
                    )}
                    {expanded ? section.items.map((item) => (
                      <View
                        key={item.id}
                        ref={(node) => {
                          if (node) rowRefs.current[item.id] = node;
                          else delete rowRefs.current[item.id];
                        }}
                        collapsable={false}
                      >
                        <DrawerRow
                          item={item}
                          active={isItemActive(item)}
                          badgeCount={countForItem(unreadByModule, item)}
                          onPress={() => runAction(item.action)}
                        />
                      </View>
                    )) : null}
                  </View>
                );
              })}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
      <AiImportChildPicker
        visible={childPickerOpen}
        kids={importKids}
        onSelect={selectChild}
        onClose={closePicker}
      />
    </>
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
  section: { marginTop: 4 },
  companySection: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  appSection: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    overflow: 'hidden',
    marginTop: 6,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  appSectionHead: {
    backgroundColor: colors.sunken,
    paddingVertical: 10,
  },
  sectionRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '400' },
  sectionTitle: {
    fontSize: 12, fontWeight: '400', color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.4,
    marginBottom: 2, marginLeft: 6, marginTop: 2,
  },
  appSectionTitle: {
    marginBottom: 0,
    marginLeft: 2,
    marginTop: 0,
    fontSize: 14,
    fontWeight: '400',
    color: colors.ink,
    textTransform: 'none',
    letterSpacing: 0,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 7, paddingHorizontal: 8,
    borderRadius: 8, marginBottom: 1,
  },
  rowActive: { backgroundColor: colors.brandSoft },
  rowHighlight: { backgroundColor: colors.brand },
  iconWrap: {
    width: 26, height: 26, borderRadius: 7,
    backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'visible',
  },
  iconWrapActive: { backgroundColor: colors.card },
  iconWrapHighlight: { backgroundColor: 'rgba(255,255,255,0.2)' },
  rowLabel: { flex: 1, fontSize: 13, fontWeight: '400', color: colors.ink },
  rowLabelActive: { color: colors.brand },
  rowLabelHighlight: { color: '#fff' },
});
