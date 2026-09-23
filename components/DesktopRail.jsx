import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../src/context/AppContext';
import { useI18n } from '../src/i18n';
import { colors } from '../src/theme';
import { useColors } from '../src/context/ThemeContext';
import { buildShellModules } from '../src/navigation/shellModules';
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

/** Hoved åpen; app-mapper lukket til de åpnes eller inneholder aktiv side. */
const DEFAULT_OPEN = { main: true, skole: true, account: false };

function itemIcon(item, active) {
  const base = item.icon || 'ellipse';
  const alreadyOutline = base.endsWith('-outline');
  if (active || alreadyOutline) {
    return alreadyOutline && active ? base.replace(/-outline$/, '') : base;
  }
  return `${base}-outline`;
}

function NavRow({ item, active, nested, collapsed, onPress, badgeCount = 0 }) {
  const colors = useColors();
  const color = active ? colors.brand : colors.ink;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.row,
        nested && styles.rowNested,
        active && styles.rowActive,
        active && { backgroundColor: colors.brandSoft },
        collapsed && styles.rowCollapsed,
      ]}
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
    ],
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const focusSearch = () => {
      if (collapsed) onToggleCollapse?.();
      requestAnimationFrame(() => searchRef.current?.focus?.());
    };
    window.addEventListener('weekplan:focus-tools-search', focusSearch);
    return () => window.removeEventListener('weekplan:focus-tools-search', focusSearch);
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

  const isItemActive = (item) => {
    const a = item.action;
    if (!a || a.type !== 'tab') return false;
    if (a.tab !== activeTab) return false;
    if (a.tab === 'more') return (a.subView || null) === (activeSubView || null);
    return true;
  };

  const q = query.trim().toLowerCase();
  const filteredSections = useMemo(() => {
    if (!q) return sections;
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => String(item.label || '').toLowerCase().includes(q)),
      }))
      .filter((section) => section.items.length > 0);
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
      <Text style={styles.fam} numberOfLines={1}>{family?.name || 'Familien'}</Text>

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
            <View key={section.id} style={[styles.section, appFolder && styles.appSection]}>
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
              {expanded ? section.items.map((item) => (
                <NavRow
                  key={item.id}
                  item={item}
                  nested
                  active={isItemActive(item)}
                  badgeCount={countForItem(unreadByModule, item)}
                  onPress={() => runAction(item.action)}
                />
              )) : null}
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
    fontSize: 11, fontWeight: '700', color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.45,
  },
  appSectionTitle: {
    fontSize: 12, fontWeight: '700', color: colors.ink,
    textTransform: 'none', letterSpacing: 0,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 5, paddingHorizontal: 8, borderRadius: 5, minHeight: 28,
  },
  rowNested: { paddingLeft: 8 },
  rowCollapsed: { justifyContent: 'center', paddingHorizontal: 6, width: 36 },
  rowActive: { backgroundColor: colors.brandSoft },
  rowLabel: { flex: 1, fontWeight: '400', fontSize: 13, color: colors.ink },
  rowLabelActive: { fontWeight: '500', color: colors.brand },
  empty: { color: colors.muted, fontWeight: '400', fontSize: 12, paddingHorizontal: 8, marginTop: 8 },
  collapseBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 6, marginTop: 2,
  },
  collapseTxt: { fontWeight: '400', fontSize: 12, color: colors.muted },
});
