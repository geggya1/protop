import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Pressable,
  Animated, ScrollView, useWindowDimensions, Platform, InteractionManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../src/context/AppContext';
import { useCompanyAccess } from '../src/access/useCompanyAccess';
import { useCompanyModules } from '../src/access/useCompanyModules';
import { useI18n } from '../src/i18n';
import { colors } from '../src/theme';
import { useColors } from '../src/context/ThemeContext';
import {
  buildShellModules,
  drawerGroupOpen,
  drawerHasSubmenuToggle,
  drawerSubmenuOpen,
  groupCompanyDrawerItems,
  isNavItemActive,
  releaseClosedActiveGroups,
  releaseClosedActiveSubmenus,
} from '../src/navigation/shellModules';
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
import { brandLogoToneForBackground } from '../src/brand/brandLogoTone';

const DRAWER_WIDTH = 268;
const DEFAULT_OPEN = { main: true, company: true, skole: true, account: false };

function DrawerRow({
  item, active, onPress, badgeCount = 0, nested = false, depth = 0, expanded = false, onToggle,
}) {
  const colors = useColors();
  const highlight = !!item.highlight;
  const base = item.icon || 'ellipse';
  const alreadyOutline = base.endsWith('-outline');
  const iconName = highlight || active || alreadyOutline
    ? (alreadyOutline && (highlight || active) ? base.replace(/-outline$/, '') : base)
    : `${base}-outline`;
  const expandable = typeof onToggle === 'function';
  const nestPad = depth > 0 ? Math.min(14 + (depth - 1) * 12, 38) : 0;
  if (item.locked) {
    return (
      <View
        style={[styles.row, nested && { paddingLeft: nestPad }, styles.rowLocked]}
        accessible
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
        accessibilityLabel={`${item.label}. ${item.lockedNote || 'Ikke aktivert'}`}
        nativeID={`module-nav-${item.id}`}
        id={`module-nav-${item.id}`}
        dataSet={{ moduleLocked: '1' }}
      >
        <View style={styles.rowMain}>
          <View style={styles.iconWrap}>
            <Ionicons name={base.endsWith('-outline') ? base : `${base}-outline`} size={16} color={colors.muted} />
          </View>
          <View style={styles.lockedText}>
            <Text style={[styles.rowLabel, { color: colors.muted }]} numberOfLines={1}>{item.label}</Text>
            <Text style={[styles.lockedNote, { color: colors.muted }]} numberOfLines={2}>
              {item.lockedNote || 'Ikke aktivert'}
            </Text>
          </View>
          <Ionicons name="lock-closed" size={14} color={colors.muted} />
        </View>
      </View>
    );
  }
  return (
    <View
      style={[
        styles.row,
        nested && { paddingLeft: nestPad },
        active && styles.rowActive,
        highlight && styles.rowHighlight,
      ]}
    >
      <TouchableOpacity
        onPress={onPress}
        style={styles.rowMain}
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
      {expandable ? (
        <TouchableOpacity
          onPress={(event) => {
            event?.stopPropagation?.();
            onToggle();
          }}
          style={[styles.expandBtn, highlight && styles.expandBtnHighlight]}
          accessibilityRole="button"
          accessibilityLabel={`${expanded ? 'Skjul' : 'Vis'} undermeny, ${item.label}`}
          accessibilityState={{ expanded: !!expanded }}
          nativeID={`module-nav-expand-${item.id}`}
          id={`module-nav-expand-${item.id}`}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
        >
          <Ionicons
            name={expanded ? 'chevron-down' : 'chevron-forward'}
            size={18}
            color={highlight ? '#fff' : active ? colors.brand : colors.ink}
          />
        </TouchableOpacity>
      ) : null}
    </View>
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
  const logoTone = brandLogoToneForBackground(colors.card);
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
  const companyAccess = useCompanyAccess();
  const companyModules = useCompanyModules();
  const [open, setOpen] = useState(DEFAULT_OPEN);
  const [submenuOpen, setSubmenuOpen] = useState({});
  const [groupOpen, setGroupOpen] = useState({});

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
      companyGrants: companyAccess.grants,
      companyModules: companyModules.state,
      companyModuleAdmin: companyModules.canManage,
      companyModuleNote: companyModules.lockedLabel,
    }),
    [
      t, asChild, asParent, isAdmin, isSuperAdmin, familyId, family,
      canImport, activeKids, childForSchedule, aiEnabled,
      allowedApps, showChildRestrictions, isGrandparent, grandparentModules,
      companyAccess.grants, companyModules,
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

  const isItemActive = useCallback((item) => (
    isNavItemActive(item, activeTab, activeSubView)
  ), [activeTab, activeSubView]);

  const companyItems = useMemo(
    () => sections.find((section) => section.id === 'company')?.items || [],
    [sections],
  );

  useEffect(() => {
    setGroupOpen((prev) => releaseClosedActiveGroups(prev, companyItems, activeTab, activeSubView));
    setSubmenuOpen((prev) => releaseClosedActiveSubmenus(prev, companyItems, activeTab, activeSubView));
  }, [activeTab, activeSubView, companyItems]);

  const sectionHasActive = useCallback((section) => (
    (section.items || []).some((item) => isItemActive(item))
  ), [isItemActive]);

  const findActiveItem = useCallback(() => {
    const walk = (items, sectionId) => {
      for (const item of items || []) {
        const nested = walk(item.children || [], sectionId);
        if (nested) return nested;
        if (isItemActive(item)) return { itemId: item.id, sectionId };
      }
      return null;
    };
    for (const section of sections) {
      const hit = walk(section.items, section.id);
      if (hit) return hit;
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
                <BrandLogo variant="full" tone={logoTone} height={40} maxWidth={180} style={styles.logo} />
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
                    {expanded ? (section.id === 'company'
                      ? groupCompanyDrawerItems(section.items)
                      : section.items
                    ).map((item, index) => {
                      const renderNavBranch = (row, depth = 0) => {
                        const kids = row.children || [];
                        const expandable = !row.locked && drawerHasSubmenuToggle(row);
                        const submenuExpanded = drawerSubmenuOpen(row, activeTab, submenuOpen, activeSubView);
                        const showKids = expandable && submenuExpanded;
                        return (
                          <View
                            key={row.id}
                            ref={(node) => {
                              if (node) rowRefs.current[row.id] = node;
                              else delete rowRefs.current[row.id];
                            }}
                            collapsable={false}
                          >
                            <DrawerRow
                              item={row}
                              nested={depth > 0}
                              depth={depth}
                              active={isItemActive(row)}
                              badgeCount={countForItem(unreadByModule, row)}
                              expanded={submenuExpanded}
                              onToggle={expandable ? () => setSubmenuOpen((prev) => ({
                                ...prev,
                                [row.id]: !drawerSubmenuOpen(row, activeTab, prev, activeSubView),
                              })) : undefined}
                              onPress={() => runAction(row.action)}
                            />
                            {showKids ? kids.map((child) => renderNavBranch(child, depth + 1)) : null}
                          </View>
                        );
                      };
                      if (!item.group) return renderNavBranch(item);
                      const groupExpanded = drawerGroupOpen(item, activeTab, groupOpen, activeSubView);
                      const containsActive = (item.children || []).some((child) => isItemActive(child));
                      const groupIcon = item.icon || 'folder-outline';
                      return (
                        <View
                          key={item.id}
                          style={[styles.groupBlock, index === 0 && styles.groupBlockFirst]}
                        >
                          <TouchableOpacity
                            style={[styles.groupHead, containsActive && styles.groupHeadActive]}
                            onPress={() => setGroupOpen((prev) => ({
                              ...prev,
                              [item.id]: !drawerGroupOpen(item, activeTab, prev, activeSubView),
                            }))}
                            accessibilityRole="button"
                            accessibilityState={{ expanded: groupExpanded }}
                            accessibilityLabel={`${item.label}, ${groupExpanded ? 'åpen' : 'lukket'}`}
                            nativeID={`module-nav-${item.id}`}
                            id={`module-nav-${item.id}`}
                          >
                            <View style={[styles.groupIconWrap, containsActive && styles.groupIconWrapActive]}>
                              <Ionicons
                                name={containsActive ? groupIcon.replace(/-outline$/, '') : (
                                  groupIcon.endsWith('-outline') ? groupIcon : `${groupIcon}-outline`
                                )}
                                size={16}
                                color={containsActive ? colors.brand : colors.ink}
                              />
                            </View>
                            <Text
                              style={[styles.groupTitle, containsActive && styles.groupTitleActive]}
                              numberOfLines={2}
                            >
                              {item.label}
                            </Text>
                            <Ionicons
                              name={groupExpanded ? 'chevron-down' : 'chevron-forward'}
                              size={16}
                              color={containsActive ? colors.brand : colors.muted}
                            />
                          </TouchableOpacity>
                          {groupExpanded ? (
                            <View style={[styles.groupBody, item.processOrder && styles.groupBodyProcess]}>
                              {(item.children || []).map((child, childIndex) => (
                                <View key={child.id}>
                                  {item.processOrder && childIndex > 0 ? (
                                    <View style={[styles.processRail, { backgroundColor: colors.line }]} />
                                  ) : null}
                                  {renderNavBranch(child)}
                                </View>
                              ))}
                            </View>
                          ) : null}
                        </View>
                      );
                    }) : null}
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
  groupBlock: {
    marginTop: 8,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  groupBlockFirst: {
    marginTop: 2,
    paddingTop: 0,
    borderTopWidth: 0,
  },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 4,
    borderRadius: 8,
  },
  groupHeadActive: { backgroundColor: colors.brandSoft },
  groupIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  groupIconWrapActive: { backgroundColor: colors.card },
  groupTitle: {
    flex: 1,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '500',
    color: colors.ink,
  },
  groupTitleActive: { color: colors.brand },
  groupBody: { paddingLeft: 10, paddingTop: 2, gap: 1 },
  groupBodyProcess: { paddingLeft: 12 },
  processRail: {
    height: 8,
    width: 2,
    marginLeft: 20,
    marginVertical: 1,
    borderRadius: 1,
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
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 8, marginBottom: 1,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingLeft: 8,
    paddingRight: 8,
    minHeight: 40,
  },
  expandBtn: {
    width: 36,
    height: 36,
    marginRight: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    flexShrink: 0,
  },
  expandBtnHighlight: { backgroundColor: 'rgba(255,255,255,0.22)' },
  rowActive: { backgroundColor: colors.brandSoft },
  rowLocked: { opacity: 0.75, cursor: 'not-allowed' },
  lockedText: { flex: 1, minWidth: 0 },
  lockedNote: { fontSize: 11, lineHeight: 14, marginTop: 1 },
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
