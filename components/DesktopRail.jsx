import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Platform,
} from 'react-native';
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
import { useChatDockPreferred } from '../src/context/ChatDockContext';
import { useAiPlanImport } from '../src/hooks/useAiPlanImport';
import AiImportChildPicker from './AiImportChildPicker';
import IconBadge from './IconBadge';
import BrandLogo from './BrandLogo';
import { useUnread } from '../src/context/NotificationContext';
import { countForItem } from '../src/utils/notifications';
import { allowedAppsForChild, isChildAppAllowed } from '../src/utils/childApps';
import { grandparentModulesFor } from '../src/utils/grandparentAccess';
import HelpTarget from './HelpTarget';
import { companyDisplayName } from '../src/utils/companyName';

/** Personlig åpen; app-mapper lukket til de åpnes eller inneholder aktiv side. */
const DEFAULT_OPEN = { main: true, company: true, skole: true, account: false };

function itemIcon(item, active) {
  const base = item.icon || 'ellipse';
  const alreadyOutline = base.endsWith('-outline');
  if (active || alreadyOutline) {
    return alreadyOutline && active ? base.replace(/-outline$/, '') : base;
  }
  return `${base}-outline`;
}

function NavRow({
  item, active, nested, child, depth = 0, collapsed, onPress, badgeCount = 0,
  expanded = false, onToggle,
}) {
  const colors = useColors();
  const color = active ? colors.brand : colors.ink;
  const expandable = typeof onToggle === 'function' && !collapsed;
  const nestPad = depth > 0 ? Math.min(8 + depth * 12, 32) : 0;
  if (item.locked) {
    const note = item.lockedNote || 'Ikke aktivert';
    return (
      <View
        style={[
          styles.rowWrap,
          nested && styles.rowNested,
          depth > 0 && { paddingLeft: nestPad },
          collapsed && styles.rowCollapsed,
          styles.rowLocked,
        ]}
        accessible
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
        accessibilityLabel={`${item.label}. ${note}`}
        nativeID={`module-nav-${item.id}`}
        {...(Platform.OS === 'web' ? { dataSet: { moduleLocked: '1' }, title: `${item.label} – ${note}` } : null)}
      >
        <View style={styles.rowMain}>
          <Ionicons name={itemIcon(item, false)} size={16} color={colors.muted} />
          {collapsed ? null : (
            <View style={styles.lockedText}>
              <Text style={[styles.rowLabel, { color: colors.muted }]} numberOfLines={1}>{item.label}</Text>
              <Text style={[styles.lockedNote, { color: colors.muted }]} numberOfLines={2}>{note}</Text>
            </View>
          )}
          {collapsed ? null : <Ionicons name="lock-closed" size={12} color={colors.muted} style={styles.lockIcon} />}
        </View>
      </View>
    );
  }
  return (
    <View
      style={[
        styles.rowWrap,
        nested && styles.rowNested,
        depth > 0 && { paddingLeft: nestPad },
        active && styles.rowActive,
        active && { backgroundColor: colors.brandSoft },
        collapsed && styles.rowCollapsed,
      ]}
    >
      <TouchableOpacity
        onPress={onPress}
        style={styles.rowMain}
        accessibilityRole="button"
        accessibilityLabel={item.label}
        nativeID={`module-nav-${item.id}`}
        accessibilityState={{ selected: active }}
        {...(Platform.OS === 'web' ? { dataSet: { wpNav: '1', wpNavActive: active ? '1' : '0' } } : null)}
      >
        <IconBadge count={collapsed ? badgeCount : badgeCount} size={13} offset={-5}>
          <Ionicons name={itemIcon(item, active)} size={16} color={color} />
        </IconBadge>
        {collapsed ? null : (
          <Text style={[styles.rowLabel, active && styles.rowLabelActive]} numberOfLines={1}>
            {item.label}
          </Text>
        )}
      </TouchableOpacity>
      {expandable ? (
        <TouchableOpacity
          onPress={(event) => {
            event?.stopPropagation?.();
            onToggle();
          }}
          style={styles.expandBtn}
          accessibilityRole="button"
          accessibilityLabel={`${expanded ? 'Skjul' : 'Vis'} undermeny, ${item.label}`}
          accessibilityState={{ expanded: !!expanded }}
          nativeID={`module-nav-expand-${item.id}`}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 6 }}
        >
          <Ionicons
            name={expanded ? 'chevron-down' : 'chevron-forward'}
            size={16}
            color={active ? colors.brand : colors.ink}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/**
 * Desktop-sidemeny: alle moduler i ekspanderbare grupper.
 * Mobil/nettbrett bruker ikke denne — de beholder rail + skuff.
 */
export default function DesktopRail({
  activeTab,
  activeSubView,
  onSelectTab,
  collapsed = false,
  onToggleCollapse,
}) {
  const nav = useNavigation();
  const { t } = useI18n();
  const colors = useColors();
  const searchRef = useRef(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(DEFAULT_OPEN);
  const [submenuOpen, setSubmenuOpen] = useState({});
  const [groupOpen, setGroupOpen] = useState({});
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
  const hideChatNav = useChatDockPreferred();

  const sections = useMemo(
    () => {
      const built = buildShellModules({
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
        companyModuleNote: companyModules.lockedLabel,
      });
      if (!hideChatNav) return built;
      return built.map((section) => ({
        ...section,
        items: (section.items || []).filter((item) => item.id !== 'chat'),
      }));
    },
    [
      t, asChild, asParent, isAdmin, isSuperAdmin, familyId, family,
      canImport, activeKids, childForSchedule, aiEnabled,
      allowedApps, showChildRestrictions, hideChatNav, isGrandparent, grandparentModules,
      companyAccess.grants, companyModules,
    ],
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const focusSearch = () => {
      if (collapsed) onToggleCollapse?.();
      requestAnimationFrame(() => searchRef.current?.focus?.());
    };
    window.addEventListener('protop:focus-tools-search', focusSearch);
    return () => window.removeEventListener('protop:focus-tools-search', focusSearch);
  }, [collapsed, onToggleCollapse]);

  const runAction = (action) => {
    if (!action) return;
    if (action.type === 'fn' && action.id === 'aiImport') {
      startImport();
      return;
    }
    if (action.type === 'tab') {
      onSelectTab?.(action.tab, action.subView || null);
      return;
    }
    if (action.type === 'nav') {
      nav.navigate(action.screen, action.params);
    }
  };

  const isItemActive = (item) => isNavItemActive(item, activeTab, activeSubView);

  const companyItems = useMemo(
    () => sections.find((section) => section.id === 'company')?.items || [],
    [sections],
  );

  useEffect(() => {
    setGroupOpen((prev) => releaseClosedActiveGroups(prev, companyItems, activeTab, activeSubView));
    setSubmenuOpen((prev) => releaseClosedActiveSubmenus(prev, companyItems, activeTab, activeSubView));
  }, [activeTab, activeSubView, companyItems]);

  const q = query.trim().toLowerCase();
  const filteredSections = useMemo(() => {
    const match = (item) => String(item.label || '').toLowerCase().includes(q);
    const narrow = (list) => (list || []).map((item) => {
      const kids = (item.children || []).filter(match);
      if (!q || match(item)) return item;
      if (kids.length) return { ...item, children: kids, forceOpen: true };
      return null;
    }).filter(Boolean);
    return sections
      .map((section) => {
        const items = q ? narrow(section.items) : (section.items || []);
        if (section.id !== 'company') return q ? { ...section, items } : section;
        return { ...section, items: groupCompanyDrawerItems(items) };
      })
      .filter((section) => (section.items || []).length > 0);
  }, [sections, q]);

  const sectionHasActive = useCallback((section) => (
    (section.items || []).some((item) => isItemActive(item))
  ), [activeTab, activeSubView]);

  const isSectionExpanded = useCallback((section) => {
    if (q) return true;
    if (Object.prototype.hasOwnProperty.call(open, section.id)) {
      return open[section.id] !== false;
    }
    if (sectionHasActive(section)) return true;
    if (isParentAppSection(section.id) || isChildAppSection(section.id)) return false;
    if (section.id === 'account') return false;
    return true;
  }, [q, open, sectionHasActive]);

  if (collapsed) {
    const mainItems = sections.find((s) => s.id === 'main')?.items || [];
    const companyItems = groupCompanyDrawerItems(
      sections.find((s) => s.id === 'company')?.items || [],
    ).flatMap((item) => {
      if (!item.group) return [item];
      return item.collapsedItems || item.children || [];
    });
    return (
      <HelpTarget id="rail" style={styles.collapsedWrap}>
        <BrandLogo variant="mark" height={36} style={styles.brandMarkImg} />
        <ScrollView contentContainerStyle={styles.collapsedList} showsVerticalScrollIndicator={false}>
          {mainItems.map((item) => (
            <NavRow
              key={item.id}
              item={item}
              collapsed
              active={isItemActive(item)}
              badgeCount={countForItem(unreadByModule, item)}
              onPress={() => runAction(item.action)}
            />
          ))}
          {companyItems.length ? <View style={styles.collapsedDivider} /> : null}
          {companyItems.map((item) => (
            <NavRow
              key={item.id}
              item={item}
              collapsed
              active={isItemActive(item) || item.action?.tab === activeTab}
              badgeCount={countForItem(unreadByModule, item)}
              onPress={() => runAction(item.action)}
            />
          ))}
        </ScrollView>
        <TouchableOpacity
          style={styles.collapseBtn}
          onPress={onToggleCollapse}
          accessibilityRole="button"
          accessibilityLabel="Utvid meny"
        >
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </TouchableOpacity>
        <AiImportChildPicker
          visible={childPickerOpen}
          kids={importKids}
          onSelect={selectChild}
          onClose={closePicker}
        />
      </HelpTarget>
    );
  }

  return (
    <HelpTarget id="rail" style={styles.wrap}>
      <BrandLogo variant="full" height={52} maxWidth={200} style={styles.brandLogo} />
      <Text style={styles.fam} numberOfLines={1}>{companyDisplayName(family, 'Familien')}</Text>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={14} color={colors.muted} />
        <TextInput
          ref={searchRef}
          value={query}
          onChangeText={setQuery}
          placeholder="Søk…"
          placeholderTextColor={colors.muted}
          style={[styles.searchInput, Platform.OS === 'web' && { outlineStyle: 'none' }]}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Søk i menyen"
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Tøm søk">
            <Ionicons name="close-circle" size={14} color={colors.muted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {filteredSections.map((section) => {
          const expanded = isSectionExpanded(section);
          const appFolder = isParentAppSection(section.id) || isChildAppSection(section.id);
          return (
            <View key={section.id} style={[styles.section, appFolder && styles.appSection, section.id === 'company' && styles.companySection]}>
              <TouchableOpacity
                style={[styles.sectionHead, appFolder && styles.appSectionHead]}
                onPress={() => setOpen((prev) => ({ ...prev, [section.id]: !expanded }))}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={`${section.title}, ${expanded ? 'åpen' : 'lukket'}`}
                {...(Platform.OS === 'web' ? { dataSet: { wpSection: '1' } } : null)}
              >
                <Text style={[styles.sectionTitle, appFolder && styles.appSectionTitle]}>
                  {section.title}
                </Text>
                <Ionicons
                  name={expanded ? 'chevron-down' : 'chevron-forward'}
                  size={14}
                  color={appFolder ? colors.ink : colors.muted}
                />
              </TouchableOpacity>
              {expanded ? section.items.map((item, index) => {
                const renderNavBranch = (row, depth = 0) => {
                  const kids = row.children || [];
                  const expandable = !row.locked && drawerHasSubmenuToggle(row);
                  const submenuExpanded = !!q || drawerSubmenuOpen(row, activeTab, submenuOpen, activeSubView);
                  const showKids = expandable && submenuExpanded;
                  return (
                    <View key={row.id}>
                      <NavRow
                        item={row}
                        nested
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
                const groupExpanded = !!q || drawerGroupOpen(item, activeTab, groupOpen, activeSubView);
                const containsActive = (item.children || []).some((child) => isItemActive(child));
                const groupIcon = item.icon || 'folder-outline';
                return (
                  <View key={item.id} style={[styles.groupBlock, index === 0 && styles.groupBlockFirst]}>
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
                    >
                      <View style={[styles.groupIconWrap, containsActive && styles.groupIconWrapActive]}>
                        <Ionicons
                          name={containsActive ? groupIcon.replace(/-outline$/, '') : (
                            groupIcon.endsWith('-outline') ? groupIcon : `${groupIcon}-outline`
                          )}
                          size={14}
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
                        size={14}
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
        {q && filteredSections.length === 0 ? (
          <Text style={styles.empty}>Ingen treff</Text>
        ) : null}
      </ScrollView>

      <TouchableOpacity
        style={styles.collapseBtn}
        onPress={onToggleCollapse}
        accessibilityRole="button"
        accessibilityLabel="Kollaps meny"
        {...(Platform.OS === 'web' ? { dataSet: { wpNav: '1' } } : null)}
      >
        <Ionicons name="chevron-back" size={14} color={colors.muted} />
        <Text style={styles.collapseTxt}>Kollaps</Text>
      </TouchableOpacity>

      <AiImportChildPicker
        visible={childPickerOpen}
        kids={importKids}
        onSelect={selectChild}
        onClose={closePicker}
      />
    </HelpTarget>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  collapsedWrap: { flex: 1, alignItems: 'center' },
  brandLogo: {
    marginBottom: 6, marginHorizontal: 4, marginTop: 2,
  },
  brandMarkImg: {
    marginBottom: 10, marginTop: 6,
  },
  fam: {
    fontWeight: '400', fontSize: 12, color: colors.muted,
    marginBottom: 8, paddingHorizontal: 8,
  },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
    borderRadius: 5, paddingHorizontal: 8, minHeight: 28, marginBottom: 8,
  },
  searchInput: { flex: 1, fontWeight: '400', color: colors.ink, paddingVertical: 4, fontSize: 13 },
  list: { paddingBottom: 8 },
  collapsedList: { alignItems: 'center', gap: 1, paddingBottom: 8 },
  section: { marginBottom: 6 },
  companySection: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  collapsedDivider: {
    width: 18,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginVertical: 6,
  },
  appSection: {
    marginBottom: 8,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  sectionHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 5,
  },
  appSectionHead: {
    paddingVertical: 8,
    backgroundColor: colors.sunken,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '400', color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.45,
  },
  groupBlock: {
    marginTop: 6,
    paddingTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  groupBlockFirst: {
    marginTop: 0,
    paddingTop: 0,
    borderTopWidth: 0,
  },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingVertical: 4,
    paddingLeft: 6,
    paddingRight: 4,
    borderRadius: 5,
  },
  groupHeadActive: { backgroundColor: colors.brandSoft },
  groupIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 5,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  groupIconWrapActive: { backgroundColor: colors.card },
  groupTitle: {
    flex: 1,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '500',
    color: colors.ink,
  },
  groupTitleActive: { color: colors.brand },
  groupBody: { paddingLeft: 8, paddingTop: 1 },
  groupBodyProcess: { paddingLeft: 10 },
  processRail: {
    height: 6,
    width: 2,
    marginLeft: 16,
    marginVertical: 0,
    borderRadius: 1,
  },
  appSectionTitle: {
    fontSize: 12, fontWeight: '400', color: colors.ink,
    textTransform: 'none', letterSpacing: 0,
  },
  rowWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 5, minHeight: 28, marginBottom: 1,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    paddingLeft: 8,
    paddingRight: 4,
    minHeight: 28,
  },
  expandBtn: {
    width: 28,
    height: 28,
    marginRight: 4,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    flexShrink: 0,
  },
  rowNested: { paddingLeft: 0 },
  rowChild: { paddingLeft: 14 },
  rowCollapsed: { justifyContent: 'center', paddingHorizontal: 6, width: 36 },
  rowActive: { backgroundColor: colors.brandSoft },
  rowLocked: { opacity: 0.75, cursor: 'not-allowed' },
  lockedText: { flex: 1, minWidth: 0 },
  lockedNote: { fontSize: 11, lineHeight: 14, marginTop: 1 },
  lockIcon: { marginRight: 6 },
  rowLabel: { flex: 1, fontWeight: '400', fontSize: 13, color: colors.ink },
  rowLabelActive: { fontWeight: '500', color: colors.brand },
  empty: { color: colors.muted, fontWeight: '400', fontSize: 12, paddingHorizontal: 8, marginTop: 8 },
  collapseBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 6, marginTop: 2,
  },
  collapseTxt: { fontWeight: '400', fontSize: 12, color: colors.muted },
});
