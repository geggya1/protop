import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../src/context/ThemeContext';
import { useLayout } from '../src/theme';
import { radius, space, touch, type } from '../src/ui/tokens';
import { PHONE_MAX_TABS, splitModuleTabs } from '../src/navigation/moduleTabs';
import { badgedLabel, moduleTabBadges, subscribeModuleTabBadges } from '../src/navigation/moduleTabBadges';
import ScrollSheet from './ScrollSheet';

/**
 * Vannrett meny inne i en modul (se src/navigation/moduleTabs.js). Samme meny i alle moduler (UX-19).
 * Fanene som får plass står i raden; resten ligger under «Mer», som åpner et ark (ISO: med delene som titler).
 * Telefon: høyst 4 faner og kortnavn. Berøringsskjerm (også nettbrett og iPad i liggende format):
 * trykkflater på minst 44 px (UX-23). Siden du står på, er alltid i raden.
 * Aktiv fane har brandInk-tekst (kontrast 4,5:1); streken under bruker merkefargen.
 */
function useBadges(moduleId) {
  const [values, setValues] = useState(() => moduleTabBadges(moduleId));
  useEffect(() => {
    setValues(moduleTabBadges(moduleId));
    return subscribeModuleTabBadges(() => setValues(moduleTabBadges(moduleId)));
  }, [moduleId]);
  return values;
}

function TabButton({ id, label, on, onPress, onLayout, touchSize, more = false, accessibilityLabel }) {
  const colors = useColors();
  return (
    <Pressable
      testID={more ? 'module-tabs-more' : `module-tab-${id}`}
      nativeID={more ? 'module-tabs-more' : `module-tab-${id}`}
      accessibilityRole={more ? 'button' : 'tab'}
      accessibilityState={more ? { expanded: false } : { selected: on }}
      accessibilityLabel={accessibilityLabel}
      onLayout={onLayout}
      onPress={onPress}
      style={({ hovered, pressed }) => [
        styles.tab,
        touchSize && styles.tabTouch,
        { borderBottomColor: on ? colors.brand : 'transparent', backgroundColor: hovered || pressed ? colors.sunken : 'transparent' },
      ]}
    >
      <Text
        numberOfLines={1}
        style={[styles.tabText, { color: on ? colors.brandInk : colors.muted, fontWeight: on ? '600' : '400' }]}
      >
        {label}
      </Text>
      {more ? <Ionicons name="chevron-down" size={14} color={on ? colors.brandInk : colors.muted} /> : null}
    </Pressable>
  );
}

function MoreSheet({ groups, activeId, onPick, onClose, title, phone }) {
  const colors = useColors();
  return (
    <ScrollSheet visible title={title} onClose={onClose} placement={phone ? 'bottom' : 'center'}>
      <View style={styles.sheetList} nativeID="module-tabs-sheet">
        {groups.map((group) => (
          <View key={group.id} style={styles.sheetGroup}>
            {group.label ? (
              <Text style={[styles.groupTitle, { color: colors.muted }]} accessibilityRole="header">{group.label}</Text>
            ) : null}
            {group.pages.map((page) => {
              const on = page.id === activeId;
              return (
                <Pressable
                  key={page.id}
                  testID={`module-tab-${page.id}`}
                  nativeID={`module-tab-${page.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => onPick(page)}
                  style={({ hovered, pressed }) => [
                    styles.sheetRow,
                    {
                      borderColor: on ? colors.brand : colors.line,
                      backgroundColor: on ? colors.brandSoft : (hovered || pressed ? colors.sunken : colors.card),
                    },
                  ]}
                >
                  {page.icon ? <Ionicons name={page.icon} size={18} color={on ? colors.brandInk : colors.ink} /> : null}
                  <Text style={[styles.sheetLabel, { color: on ? colors.brandInk : colors.ink, fontWeight: on ? '600' : '400' }]}>
                    {page.label}
                  </Text>
                  {on ? <Ionicons name="checkmark" size={18} color={colors.brandInk} /> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollSheet>
  );
}

export default function ModuleTabs({ menu, onSelect, moreOpen = false }) {
  const colors = useColors();
  const {
    isPhone, isTouch, width: windowWidth, hasRail, railWidth,
  } = useLayout();
  const badges = useBadges(menu?.moduleId);
  const [rowWidth, setRowWidth] = useState(0);
  const [sheet, setSheet] = useState(moreOpen);
  const scrollRef = useRef(null);
  const offsets = useRef({});

  // Tallene (Anbud: «Tilbud (2)») er en del av teksten, så de regnes med når plassen fordeles.
  const decorated = useMemo(() => (menu ? {
    ...menu,
    pages: (menu.pages || []).map((p) => (badges[p.id]
      ? { ...p, label: badgedLabel(p.label, badges[p.id]), short: p.short ? badgedLabel(p.short, badges[p.id]) : undefined }
      : p)),
  } : null), [menu, badges]);
  // Før raden er målt: vindusbredden minus venstremenyen.
  const width = (rowWidth || (windowWidth - (hasRail ? railWidth : 0))) - space.sm * 2;
  const split = useMemo(
    () => splitModuleTabs(decorated, { width, max: isPhone ? PHONE_MAX_TABS : Infinity, short: isPhone }),
    [decorated, width, isPhone],
  );
  const activeId = menu?.activeId || null;

  useEffect(() => {
    const x = offsets.current[activeId];
    if (x == null || !scrollRef.current) return;
    scrollRef.current.scrollTo?.({ x: Math.max(0, x - 24), animated: false });
  }, [activeId, rowWidth]);

  if (!decorated?.pages?.length) return null;
  const go = (page) => onSelect?.(page.action.tab, page.action.subView || null);
  const text = (page) => (isPhone && page.short) || page.label;
  const moreCount = split.more.reduce((n, g) => n + g.pages.length, 0);

  return (
    <View
      style={[styles.wrap, { borderBottomColor: colors.line, backgroundColor: colors.card }]}
      onLayout={(e) => setRowWidth(Math.round(e.nativeEvent.layout.width))}
      nativeID="module-tabs"
      accessibilityLabel={`${menu.label}: meny`}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
        accessibilityRole="tablist"
        accessibilityLabel={menu.label}
      >
        {split.visible.map((page) => (
          <TabButton
            key={page.id}
            id={page.id}
            label={text(page)}
            accessibilityLabel={page.label}
            on={page.id === activeId}
            touchSize={isTouch}
            onLayout={(e) => { offsets.current[page.id] = e.nativeEvent.layout.x; }}
            onPress={() => go(page)}
          />
        ))}
        {moreCount ? (
          <TabButton
            more
            label="Mer"
            on={false}
            touchSize={isTouch}
            accessibilityLabel={`Flere sider i ${menu.label} (${moreCount})`}
            onPress={() => setSheet(true)}
          />
        ) : null}
      </ScrollView>
      {sheet && moreCount ? (
        <MoreSheet
          title={menu.label}
          groups={split.more}
          activeId={activeId}
          phone={isPhone}
          onClose={() => setSheet(false)}
          onPick={(page) => {
            setSheet(false);
            go(page);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: 1, ...(Platform.OS === 'web' ? { position: 'sticky', top: 0, zIndex: 5 } : null) },
  tabRow: { paddingHorizontal: space.sm, gap: 2 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: 2,
  },
  tabTouch: { minHeight: touch.min, justifyContent: 'center' },
  tabText: { fontSize: type.body.fontSize },
  sheetList: { gap: space.md },
  sheetGroup: { gap: space.xs },
  groupTitle: { ...type.label, textTransform: 'uppercase', letterSpacing: 0.4 },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.card,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    minHeight: 48,
  },
  sheetLabel: { flex: 1, fontSize: 15 },
});
