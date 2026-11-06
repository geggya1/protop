/**
 * Innstillinger på personen: menyen med seksjonene til venstre og seksjonen til høyre.
 * På mobil er menyen en oversikt med kort. En seksjon åpnes for seg, med vei tilbake.
 *
 * Seksjonene og hva som står i dem: EMPLOYEE_SUB_TABS.settings (src/employees/personTabs.js).
 * Linjene på kortene i oversikten: settingsSummary (src/employees/settingsSummary.js).
 */
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBreakpoints } from '../../src/theme';
import { elevation, radius, space, type } from '../../src/ui/tokens';
import SettingsCard from './SettingsCard.jsx';

const lift = Platform.OS === 'web' ? elevation[1].web : elevation[1].native;

export const OVERVIEW_ID = 'settingsOverview';

export { SettingsCard };

function NavItem({ section, active, colors, onPress }) {
  return (
    <Pressable
      nativeID={`employee-settings-nav-${section.id}`}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={({ hovered }) => [
        styles.navItem,
        { backgroundColor: active ? colors.brandSoft : (hovered ? colors.sunken : 'transparent') },
      ]}
    >
      <Ionicons name={section.icon} size={18} color={active ? colors.brand : colors.muted} />
      <Text style={[type.body, styles.shrink, { color: active ? colors.brand : colors.ink }]} numberOfLines={2}>{section.label}</Text>
    </Pressable>
  );
}

function OverviewCard({ section, rows = [], colors, onPress }) {
  return (
    <Pressable
      nativeID={`employee-settings-card-${section.id}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Åpne ${section.label}`}
      style={({ hovered }) => [
        styles.card,
        styles.overviewCard,
        lift,
        { backgroundColor: colors.card, borderColor: hovered ? colors.brand : colors.line },
      ]}
    >
      <View style={styles.cardHeadLeft}>
        <View style={[styles.cardIcon, { backgroundColor: colors.brandSoft }]}>
          <Ionicons name={section.icon} size={16} color={colors.brand} />
        </View>
        <Text style={[type.cardTitle, styles.shrink, { color: colors.ink }]} numberOfLines={1}>{section.label}</Text>
      </View>
      <View style={styles.overviewRows}>
        {rows.slice(0, 3).map((row) => (
          <View key={row.label} style={styles.overviewRow}>
            <Text style={[type.caption, styles.overviewLabel, { color: colors.muted }]} numberOfLines={1}>{row.label}</Text>
            <Text style={[type.caption, styles.shrink, { color: row.missing ? colors.muted : colors.ink }]} numberOfLines={1}>{row.value}</Text>
          </View>
        ))}
        {!rows.length ? <Text style={[type.caption, { color: colors.muted }]}>{section.hint}</Text> : null}
      </View>
      <View style={styles.openRow}>
        <Text style={[type.label, { color: colors.brand }]}>Åpne</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.brand} />
      </View>
    </Pressable>
  );
}

export default function PersonSettingsLayout({
  sections = [], active, onSelect, colors, summary = {}, children,
}) {
  const { isPhone } = useBreakpoints();
  const current = sections.find((row) => row.id === active) || sections[0];
  const overview = current?.id === OVERVIEW_ID;
  const cards = sections.filter((row) => row.id !== OVERVIEW_ID);

  const grid = (
    <View nativeID="employee-settings-overview" style={styles.grid}>
      {cards.map((section) => (
        <OverviewCard
          key={section.id}
          section={section}
          rows={summary[section.id]}
          colors={colors}
          onPress={() => onSelect?.(section.id)}
        />
      ))}
    </View>
  );

  const header = current && !overview ? (
    <View style={styles.header}>
      <View style={[styles.headerIcon, { backgroundColor: colors.brandSoft }]}>
        <Ionicons name={current.icon} size={18} color={colors.brand} />
      </View>
      <View style={styles.shrink}>
        <Text accessibilityRole="header" style={[type.cardTitle, { color: colors.ink }]}>{current.label}</Text>
        {current.hint ? <Text style={[type.caption, { color: colors.muted }]}>{current.hint}</Text> : null}
      </View>
    </View>
  ) : null;

  if (isPhone) {
    return (
      <View nativeID="employee-settings" style={styles.phoneRoot}>
        {overview ? grid : (
          <>
            {sections.some((row) => row.id === OVERVIEW_ID) ? (
              <Pressable
                nativeID="employee-settings-back"
                onPress={() => onSelect?.(OVERVIEW_ID)}
                accessibilityRole="link"
                style={styles.back}
                hitSlop={6}
              >
                <Ionicons name="chevron-back" size={16} color={colors.brand} />
                <Text style={[type.label, { color: colors.brand }]}>Alle innstillinger</Text>
              </Pressable>
            ) : null}
            {header}
            <View style={styles.content}>{children}</View>
          </>
        )}
      </View>
    );
  }

  return (
    <View nativeID="employee-settings" style={styles.root}>
      <View
        nativeID="employee-settings-nav"
        accessibilityRole="tablist"
        style={[styles.nav, lift, { backgroundColor: colors.card, borderColor: colors.line }]}
      >
        <Text style={[type.caption, styles.navTitle, { color: colors.muted }]}>Innstillinger</Text>
        {sections.map((section) => (
          <NavItem
            key={section.id}
            section={section}
            active={section.id === current?.id}
            colors={colors}
            onPress={() => onSelect?.(section.id)}
          />
        ))}
      </View>
      <View style={styles.main}>
        {overview ? grid : (
          <>
            {header}
            <View style={styles.content}>{children}</View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, width: '100%' },
  phoneRoot: { gap: space.sm, width: '100%' },
  nav: {
    width: 240,
    flexShrink: 0,
    borderWidth: 1,
    borderRadius: radius.sheet,
    padding: space.xs,
    gap: 2,
    ...(Platform.OS === 'web' ? { position: 'sticky', top: 0 } : null),
  },
  navTitle: { textTransform: 'uppercase', letterSpacing: 0.4, paddingHorizontal: space.sm, paddingTop: space.xs, paddingBottom: space.xxs },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, paddingVertical: 9, borderRadius: radius.control },
  main: { flex: 1, minWidth: 0, gap: space.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  headerIcon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  content: { gap: space.md, maxWidth: 920, width: '100%' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', paddingVertical: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  card: { borderWidth: 1, borderRadius: radius.sheet, padding: space.md, gap: space.sm },
  overviewCard: { flexGrow: 1, flexBasis: 260, maxWidth: '100%', minWidth: 0 },
  overviewRows: { gap: 4, flexGrow: 1 },
  overviewRow: { flexDirection: 'row', gap: space.xs, alignItems: 'baseline' },
  overviewLabel: { width: 120, flexShrink: 0 },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-end' },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm },
  cardHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1, minWidth: 0 },
  cardIcon: { width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 10, paddingVertical: 5 },
  shrink: { flexShrink: 1, minWidth: 0 },
});
