import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useColors } from '../src/context/ThemeContext';

/**
 * Vannrett meny inne i en modul (se src/navigation/moduleTabs.js).
 * Én rad med faner. Har modulen deler (ISO), velger første rad del og andre rad side.
 * Raden ruller sidelengs på smale skjermer, og aktiv fane rulles fram.
 */
function TabRow({ items, activeId, onPress, variant = 'tab', label }) {
  const colors = useColors();
  const scrollRef = useRef(null);
  const offsets = useRef({});
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const x = offsets.current[activeId];
    if (x == null || !scrollRef.current) return;
    scrollRef.current.scrollTo?.({ x: Math.max(0, x - 24), animated: false });
  }, [activeId, width]);

  const pill = variant === 'pill';
  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      contentContainerStyle={pill ? styles.pillRow : styles.tabRow}
      accessibilityRole="tablist"
      accessibilityLabel={label}
    >
      {items.map((item) => {
        const on = item.id === activeId;
        return (
          <Pressable
            key={item.id}
            testID={`module-tab-${item.id}`}
            nativeID={`module-tab-${item.id}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onLayout={(e) => { offsets.current[item.id] = e.nativeEvent.layout.x; }}
            onPress={() => onPress(item)}
            style={({ hovered, pressed }) => [
              pill ? styles.pill : styles.tab,
              pill
                ? { backgroundColor: on ? `${colors.brand}18` : (hovered || pressed ? colors.sunken : 'transparent') }
                : { borderBottomColor: on ? colors.brand : 'transparent', backgroundColor: hovered || pressed ? colors.sunken : 'transparent' },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[pill ? styles.pillText : styles.tabText, { color: on ? colors.brand : (pill ? colors.ink : colors.muted), fontWeight: on ? '600' : '400' }]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function ModuleTabs({ menu, onSelect }) {
  const colors = useColors();
  const [sectionId, setSectionId] = useState(menu?.activeSectionId || null);
  useEffect(() => { setSectionId(menu?.activeSectionId || null); }, [menu?.activeSectionId, menu?.moduleId]);
  if (!menu?.pages?.length) return null;
  const go = (page) => onSelect?.(page.action.tab, page.action.subView || null);
  const sections = menu.sections || null;
  const current = sections ? (sections.find((s) => s.id === sectionId) || sections[0]) : null;
  return (
    <View style={[styles.wrap, { borderBottomColor: colors.line, backgroundColor: colors.card }]} accessibilityLabel={`${menu.label}: meny`}>
      {sections ? (
        <>
          <TabRow
            label={menu.label}
            items={sections}
            activeId={current?.id}
            onPress={(s) => {
              setSectionId(s.id);
              // En del med én side (Oversikt) åpner siden med en gang. Ellers åpnes første side i delen.
              if (!s.pages.some((p) => p.id === menu.activeId)) go(s.pages[0]);
            }}
          />
          {current && current.pages.length > 1 ? (
            <View style={[styles.second, { borderTopColor: colors.line }]}>
              <TabRow label={current.label} items={current.pages} activeId={menu.activeId} onPress={go} variant="pill" />
            </View>
          ) : null}
        </>
      ) : (
        <TabRow label={menu.label} items={menu.pages} activeId={menu.activeId} onPress={go} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: 1, ...(Platform.OS === 'web' ? { position: 'sticky', top: 0, zIndex: 5 } : null) },
  tabRow: { paddingHorizontal: 12, gap: 2 },
  tab: { paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 2 },
  tabText: { fontSize: 14 },
  second: { borderTopWidth: StyleSheet.hairlineWidth },
  pillRow: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  pillText: { fontSize: 13 },
});
