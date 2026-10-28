import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../src/context/AppContext';
import { colors, useLayout } from '../src/theme';
import { touch } from '../src/ui/tokens';
import { useColors } from '../src/context/ThemeContext';
import { isNavItemActive } from '../src/navigation/shellModules';
import { collapsedNavItems, navSections, railBackground, runNavAction } from '../src/navigation/navTree';
import { useAppearance } from '../src/appearance/AppearanceContext';
import { brandLogoToneForBackground } from '../src/brand/brandLogoTone';
import { useNavTree } from '../src/hooks/useNavTree';
import { useChatDockPreferred } from '../src/context/ChatDockContext';
import NavTree, { NavRow, useNavTreeState } from './NavTree';
import BrandLogo from './BrandLogo';
import { useUnread } from '../src/context/NotificationContext';
import { countForItem } from '../src/utils/notifications';
import HelpTarget from './HelpTarget';
import { companyDisplayName } from '../src/utils/companyName';

/**
 * Desktop-sidemeny. Innholdet er det samme som i skuffen på telefon (NavTree, src/navigation/navTree.js);
 * her kommer bare søket og kollaps til bare ikoner.
 * På berøringsskjerm (iPad i liggende format) er søkefeltet og kollaps-knappen 44 px høye (UX-23).
 */
export default function DesktopRail({
  activeTab,
  activeSubView,
  onSelectTab,
  collapsed = false,
  onToggleCollapse,
}) {
  const nav = useNavigation();
  const colors = useColors();
  const { isTouch } = useLayout();
  const t = isTouch ? touchStyles : null;
  const { scheme } = useAppearance();
  // Hvit logo når sidemenyen er mørk, som i skuffen.
  const logoTone = brandLogoToneForBackground(railBackground(colors, scheme));
  const searchRef = useRef(null);
  const [query, setQuery] = useState('');
  const { family } = useApp();
  const { unreadByModule } = useUnread();
  // Chatten ligger i chat-docken på web, så sidemenyen viser den ikke.
  const hideChat = useChatDockPreferred();
  const sections = useNavTree({ hideChat });
  const state = useNavTreeState(sections, activeTab, activeSubView);
  const shown = useMemo(() => navSections(sections, { query }), [sections, query]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const focusSearch = () => {
      if (collapsed) onToggleCollapse?.();
      requestAnimationFrame(() => searchRef.current?.focus?.());
    };
    window.addEventListener('protop:focus-tools-search', focusSearch);
    return () => window.removeEventListener('protop:focus-tools-search', focusSearch);
  }, [collapsed, onToggleCollapse]);

  const runAction = (action) => runNavAction(action, {
    onSelectTab,
    navigate: (screen, params) => nav.navigate(screen, params),
  });

  if (collapsed) {
    const { main, company } = collapsedNavItems(sections);
    const isItemActive = (item) => isNavItemActive(item, activeTab, activeSubView);
    return (
      <HelpTarget id="rail" style={styles.collapsedWrap}>
        <BrandLogo variant="mark" tone={logoTone} height={36} style={styles.brandMarkImg} />
        <ScrollView contentContainerStyle={styles.collapsedList} showsVerticalScrollIndicator={false}>
          {main.map((item) => (
            <NavRow
              key={item.id}
              variant="rail"
              item={item}
              collapsed
              active={isItemActive(item)}
              badgeCount={countForItem(unreadByModule, item)}
              onPress={() => runAction(item.action)}
            />
          ))}
          {company.length ? <View style={[styles.collapsedDivider, { backgroundColor: colors.line }]} /> : null}
          {company.map((item) => (
            <NavRow
              key={item.id}
              variant="rail"
              item={item}
              collapsed
              active={isItemActive(item) || item.action?.tab === activeTab}
              badgeCount={countForItem(unreadByModule, item)}
              onPress={() => runAction(item.action)}
            />
          ))}
        </ScrollView>
        <TouchableOpacity
          style={[styles.collapseBtn, t?.collapseBtn]}
          onPress={onToggleCollapse}
          accessibilityRole="button"
          accessibilityLabel="Utvid meny"
        >
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </TouchableOpacity>
      </HelpTarget>
    );
  }

  return (
    <HelpTarget id="rail" style={styles.wrap}>
      <BrandLogo variant="full" tone={logoTone} height={52} maxWidth={200} style={styles.brandLogo} />
      <Text style={[styles.fam, { color: colors.muted }]} numberOfLines={1}>{companyDisplayName(family, 'Familien')}</Text>

      <View dataSet={{ focusWithin: '1' }} style={[styles.searchWrap, t?.searchWrap, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <Ionicons name="search" size={14} color={colors.muted} />
        <TextInput
          ref={searchRef}
          value={query}
          onChangeText={setQuery}
          placeholder="Søk…"
          placeholderTextColor={colors.muted}
          style={[styles.searchInput, t?.searchInput, { color: colors.ink }, Platform.OS === 'web' && { outlineStyle: 'none' }]}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Søk i menyen"
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Tøm søk" style={t?.clearBtn}>
            <Ionicons name="close-circle" size={14} color={colors.muted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        <NavTree
          variant="rail"
          sections={shown}
          state={state}
          activeTab={activeTab}
          activeSubView={activeSubView}
          query={query}
          unreadByModule={unreadByModule}
          onAction={(item) => runAction(item.action)}
        />
        {query.trim() && shown.length === 0 ? (
          <Text style={[styles.empty, { color: colors.muted }]}>Ingen treff</Text>
        ) : null}
      </ScrollView>

      <TouchableOpacity
        style={[styles.collapseBtn, t?.collapseBtn]}
        onPress={onToggleCollapse}
        accessibilityRole="button"
        accessibilityLabel="Kollaps meny"
        {...(Platform.OS === 'web' ? { dataSet: { wpNav: '1' } } : null)}
      >
        <Ionicons name="chevron-back" size={14} color={colors.muted} />
        <Text style={[styles.collapseTxt, { color: colors.muted }]}>Kollaps</Text>
      </TouchableOpacity>
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
  collapsedDivider: {
    width: 18,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginVertical: 6,
  },
  empty: { color: colors.muted, fontWeight: '400', fontSize: 12, paddingHorizontal: 8, marginTop: 8 },
  collapseBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 6, marginTop: 2,
  },
  collapseTxt: { fontWeight: '400', fontSize: 12, color: colors.muted },
});

/** Berøringsskjerm: felt og knapper på minst touch.min. */
const touchStyles = StyleSheet.create({
  searchWrap: { minHeight: touch.min },
  // Feltet fyller hele høyden, så et trykk hvor som helst i rammen treffer det.
  searchInput: { alignSelf: 'stretch', minHeight: touch.min - 2 },
  clearBtn: { minWidth: touch.min, minHeight: touch.min, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  collapseBtn: { minHeight: touch.min },
});
