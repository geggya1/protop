/**
 * Innstillinger på personen: menyen med seksjonene til venstre og seksjonen til høyre.
 * På mobil er menyen en oversikt med kort. En seksjon åpnes for seg, med vei tilbake.
 *
 * Oversikten: et bånd med bilde, rolle og hvor mye av profilen som er fylt ut (ring),
 * en liste over det som mangler (hvert punkt åpner seksjonen sin), og seksjonene gruppert
 * (Om meg, Arbeid, Konto og system) som kort med egen farge, fremdriftsstolpe og linjer.
 * En seksjon: fargebånd med ikon og status, innholdet, og forrige/neste nederst.
 *
 * Seksjonene og hva som står i dem: EMPLOYEE_SUB_TABS.settings og SETTINGS_GROUPS
 * (src/employees/personTabs.js). Linjene og fremdriften: settingsSummary og settingsProgress
 * (src/employees/settingsSummary.js). Sidetittelen står i skallet, så den gjentas ikke her.
 */
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useBreakpoints } from '../../src/theme';
import { SETTINGS_GROUPS } from '../../src/employees/personTabs.js';
import { elevation, radius, space, type } from '../../src/ui/tokens';
import SettingsCard from './SettingsCard.jsx';

const lift = Platform.OS === 'web' ? elevation[1].web : elevation[1].native;

export const OVERVIEW_ID = 'settingsOverview';

export { SettingsCard };

/** Farge med gjennomsiktighet, for myke flater. Bare #rrggbb, ellers fargen som den er. */
function tint(color, alpha) {
  const raw = String(color || '');
  if (!/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  return `${raw}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
}

function sectionColor(section, colors) {
  return section?.color || colors.brand;
}

function Ring({
  pct, color, size = 112, stroke = 11, children,
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const value = Math.max(0, Math.min(100, pct || 0));
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={tint(color, 0.16)} strokeWidth={stroke} fill="none" />
        {value > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${(value / 100) * c} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

function Bar({
  filled, total, color, colors,
}) {
  const pct = total ? Math.round((filled / total) * 100) : 0;
  return (
    <View style={[styles.bar, { backgroundColor: colors.sunken }]}>
      <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

/** Status for en seksjon: hake når alt er fylt ut, ellers antall som mangler. */
function StatusMark({ state, colors }) {
  if (!state || !state.total) return null;
  const missing = state.total - state.filled;
  if (!missing) return <Ionicons name="checkmark-circle" size={16} color={colors.success || '#16a34a'} />;
  return (
    <View style={[styles.missingBadge, { backgroundColor: tint(colors.warn || '#d97706', 0.16) }]}>
      <Text style={[styles.missingBadgeText, { color: colors.warnInk || '#92400e' }]}>{missing}</Text>
    </View>
  );
}

function NavItem({
  section, active, colors, onPress, state,
}) {
  const color = sectionColor(section, colors);
  return (
    <Pressable
      nativeID={`employee-settings-nav-${section.id}`}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={({ hovered }) => [
        styles.navItem,
        { backgroundColor: active ? tint(color, 0.12) : (hovered ? colors.sunken : 'transparent') },
      ]}
    >
      <View style={[styles.navBar, { backgroundColor: active ? color : 'transparent' }]} />
      <View style={[styles.navIcon, { backgroundColor: active ? color : tint(color, 0.12) }]}>
        <Ionicons name={section.icon} size={15} color={active ? '#fff' : color} />
      </View>
      <Text style={[type.body, styles.grow, { color: colors.ink, fontWeight: active ? '600' : '400' }]} numberOfLines={2}>
        {section.label}
      </Text>
      <StatusMark state={state} colors={colors} />
    </Pressable>
  );
}

/** Kortet for en seksjon i oversikten. Hele kortet åpner seksjonen. */
function OverviewCard({
  section, rows = [], colors, onPress, state,
}) {
  const color = sectionColor(section, colors);
  const missing = state ? state.total - state.filled : 0;
  return (
    <Pressable
      nativeID={`employee-settings-card-${section.id}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Åpne ${section.label}`}
      style={({ hovered, pressed }) => [
        styles.card,
        styles.overviewCard,
        lift,
        {
          backgroundColor: colors.card,
          borderColor: hovered ? color : colors.line,
          transform: pressed ? [{ scale: 0.99 }] : (hovered && Platform.OS === 'web' ? [{ translateY: -2 }] : undefined),
        },
      ]}
    >
      <View style={[styles.cardBand, { backgroundColor: tint(color, 0.1) }]}>
        <View style={[styles.cardBlob, { backgroundColor: tint(color, 0.12) }]} />
        <View style={[styles.cardIcon, { backgroundColor: color }]}>
          <Ionicons name={section.icon} size={20} color="#fff" />
        </View>
        <View style={styles.grow}>
          <Text style={[type.cardTitle, { color: colors.ink }]} numberOfLines={1}>{section.label}</Text>
          <Text style={[type.caption, { color: colors.muted }]} numberOfLines={2}>{section.hint}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        {state && state.total ? (
          <View style={styles.cardProgress}>
            <Bar filled={state.filled} total={state.total} color={missing ? color : (colors.success || color)} colors={colors} />
            <Text style={[type.caption, { color: missing ? colors.muted : (colors.successInk || colors.ink) }]}>
              {missing ? `${missing} mangler` : 'Alt på plass'}
            </Text>
          </View>
        ) : null}
        <View style={styles.overviewRows}>
          {rows.slice(0, 3).map((row) => (
            <View key={row.label} style={styles.overviewRow}>
              <Text style={[type.caption, styles.overviewLabel, { color: colors.muted }]} numberOfLines={1}>{row.label}</Text>
              {row.missing ? (
                <View style={[styles.pill, { backgroundColor: tint(colors.warn || '#d97706', 0.14) }]}>
                  <Text style={[styles.pillText, { color: colors.warnInk || colors.ink }]} numberOfLines={1}>{row.value}</Text>
                </View>
              ) : (
                <Text style={[type.caption, styles.shrink, { color: colors.ink }]} numberOfLines={1}>{row.value}</Text>
              )}
            </View>
          ))}
          {!rows.length ? <Text style={[type.caption, { color: colors.muted }]}>{section.hint}</Text> : null}
        </View>
        <View style={styles.openRow}>
          <Text style={[type.label, { color }]}>Åpne</Text>
          <Ionicons name="arrow-forward" size={14} color={color} />
        </View>
      </View>
    </Pressable>
  );
}

/** Båndet øverst i oversikten: bilde og rolle til venstre, utfyllingsgraden som ring til høyre. */
function Hero({
  person = {}, progress, colors, compact,
}) {
  const pct = progress?.pct ?? 100;
  const color = pct >= 100 ? (colors.success || colors.brand) : colors.brand;
  const left = progress ? progress.total - progress.filled : 0;
  return (
    <View
      nativeID="employee-settings-hero"
      style={[styles.hero, lift, compact && styles.heroCompact, { backgroundColor: colors.card, borderColor: colors.line }]}
    >
      <View style={[styles.heroBlobA, { backgroundColor: tint(colors.brand, 0.1) }]} />
      <View style={[styles.heroBlobB, { backgroundColor: tint(colors.accent || colors.brand, 0.08) }]} />
      <View style={[styles.heroLeft, compact && styles.heroLeftCompact]}>
        <View style={[styles.avatar, { backgroundColor: tint(colors.brand, 0.14), borderColor: colors.card }]}>
          {person.photo || <Text style={[styles.avatarText, { color: colors.brand }]}>{person.initials || '?'}</Text>}
        </View>
        <View style={styles.grow}>
          <Text style={[type.caption, styles.heroKicker, { color: colors.muted }]}>Profilen</Text>
          <Text style={[styles.heroHeadline, { color: colors.ink }]}>
            {pct >= 100 ? 'Profilen er komplett' : `Profilen er ${pct} % utfylt`}
          </Text>
          {person.role ? <Text style={[type.body, { color: colors.muted }]} numberOfLines={2}>{person.role}</Text> : null}
          <View style={styles.chips}>
            {(person.chips || []).map((chip) => (
              <View key={chip.label} style={[styles.chip, { backgroundColor: tint(chip.color || colors.brand, 0.12) }]}>
                <Ionicons name={chip.icon} size={12} color={chip.color || colors.brand} />
                <Text style={[styles.chipText, { color: colors.ink }]} numberOfLines={1}>{chip.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
      <View style={styles.heroRight}>
        <Ring pct={pct} color={color} size={compact ? 96 : 120}>
          <Text style={[styles.ringValue, { color: colors.ink }]}>{`${pct} %`}</Text>
          <Text style={[type.caption, { color: colors.muted }]}>utfylt</Text>
        </Ring>
        <Text style={[type.caption, styles.center, { color: colors.muted }]}>
          {left ? `${left} felt gjenstår` : 'Ingenting mangler'}
        </Text>
      </View>
    </View>
  );
}

/** «Gjør profilen komplett»: hvert manglende felt er en knapp til seksjonen der det fylles inn. */
function MissingPanel({
  progress, sections, colors, onSelect,
}) {
  const missing = progress?.missing || [];
  if (!missing.length) return null;
  const byId = new Map(sections.map((row) => [row.id, row]));
  return (
    <View nativeID="employee-settings-missing" style={[styles.card, lift, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <View style={styles.rowCenter}>
        <View style={[styles.smallIcon, { backgroundColor: tint(colors.warn || '#d97706', 0.16) }]}>
          <Ionicons name="sparkles" size={15} color={colors.warn || '#d97706'} />
        </View>
        <View style={styles.grow}>
          <Text style={[type.label, { color: colors.ink }]}>Gjør profilen komplett</Text>
          <Text style={[type.caption, { color: colors.muted }]}>Trykk på et felt for å fylle det inn.</Text>
        </View>
      </View>
      <View style={styles.missingWrap}>
        {missing.map((row) => {
          const section = byId.get(row.section);
          if (!section) return null;
          const color = sectionColor(section, colors);
          return (
            <Pressable
              key={`${row.section}:${row.label}`}
              nativeID={`employee-settings-missing-${row.section}-${String(row.label).replace(/[^A-Za-z0-9_-]/g, '-')}`}
              onPress={() => onSelect?.(row.section)}
              accessibilityRole="button"
              accessibilityLabel={`Legg inn ${row.label} under ${section.label}`}
              style={({ hovered }) => [
                styles.missingChip,
                { borderColor: hovered ? color : colors.line, backgroundColor: hovered ? tint(color, 0.08) : colors.card },
              ]}
            >
              <Ionicons name="add-circle" size={16} color={color} />
              <Text style={[type.label, { color: colors.ink }]} numberOfLines={1}>{row.label}</Text>
              <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>{section.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Seksjonene gruppert, med en overskrift per gruppe og kortene i et rutenett som tilpasser seg bredden. */
function OverviewGroups({
  sections, summary, progress, colors, onSelect, width,
}) {
  const groups = SETTINGS_GROUPS
    .map((group) => ({ ...group, items: sections.filter((row) => row.group === group.id) }))
    .filter((group) => group.items.length);
  const loose = sections.filter((row) => row.id !== OVERVIEW_ID && !SETTINGS_GROUPS.some((g) => g.id === row.group));
  if (loose.length) groups.push({ id: 'other', label: 'Annet', icon: 'ellipsis-horizontal', items: loose });
  // Kolonner etter bredden på innholdet: 1 på mobil, opptil 4 på brede skjermer.
  const cols = width >= 1500 ? 4 : width >= 1050 ? 3 : width >= 620 ? 2 : 1;
  const basis = cols === 1 ? '100%' : `${(100 / cols) - 2}%`;
  return (
    <View nativeID="employee-settings-overview" style={styles.groups}>
      {groups.map((group) => (
        <View key={group.id} nativeID={`employee-settings-group-${group.id}`} style={styles.group}>
          <View style={styles.groupHead}>
            <Ionicons name={group.icon} size={16} color={colors.muted} />
            <Text style={[styles.groupTitle, { color: colors.muted }]}>{group.label}</Text>
            <View style={[styles.groupLine, { backgroundColor: colors.line }]} />
          </View>
          <View style={styles.grid}>
            {group.items.map((section) => (
              <View key={section.id} style={[styles.gridCell, width ? { flexBasis: basis } : null]}>
                <OverviewCard
                  section={section}
                  rows={summary[section.id]}
                  state={progress?.bySection?.[section.id]}
                  colors={colors}
                  onPress={() => onSelect?.(section.id)}
                />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/** Fargebåndet øverst i en seksjon: ikon, forklaring og status. */
function SectionHeader({ section, colors, state }) {
  const color = sectionColor(section, colors);
  const missing = state ? state.total - state.filled : 0;
  return (
    <View nativeID="employee-settings-header" style={[styles.sectionHead, { backgroundColor: tint(color, 0.1), borderColor: tint(color, 0.25) }]}>
      <View style={[styles.sectionBlob, { backgroundColor: tint(color, 0.12) }]} />
      <View style={[styles.sectionIcon, { backgroundColor: color }]}>
        <Ionicons name={section.icon} size={22} color="#fff" />
      </View>
      <View style={styles.grow}>
        <Text accessibilityRole="header" style={[type.cardTitle, { color: colors.ink }]}>{section.label}</Text>
        {section.hint ? <Text style={[type.caption, { color: colors.muted }]}>{section.hint}</Text> : null}
      </View>
      {state && state.total ? (
        <View style={[styles.statusChip, { backgroundColor: colors.card }]}>
          <Ionicons
            name={missing ? 'ellipse' : 'checkmark-circle'}
            size={missing ? 8 : 14}
            color={missing ? (colors.warn || color) : (colors.success || color)}
          />
          <Text style={[type.label, { color: colors.ink }]}>{missing ? `${missing} mangler` : 'Alt på plass'}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Forrige og neste seksjon nederst, så en kan gå gjennom alt uten å gå tilbake til menyen. */
function Pager({
  sections, current, colors, onSelect,
}) {
  const list = sections.filter((row) => row.id !== OVERVIEW_ID);
  const at = list.findIndex((row) => row.id === current?.id);
  if (at < 0) return null;
  const prev = list[at - 1];
  const next = list[at + 1];
  const item = (section, dir) => (section ? (
    <Pressable
      nativeID={`employee-settings-${dir}`}
      onPress={() => onSelect?.(section.id)}
      accessibilityRole="link"
      accessibilityLabel={`${dir === 'prev' ? 'Forrige' : 'Neste'}: ${section.label}`}
      style={({ hovered }) => [
        styles.pagerItem,
        dir === 'next' && styles.pagerNext,
        { borderColor: hovered ? sectionColor(section, colors) : colors.line, backgroundColor: colors.card },
      ]}
    >
      {dir === 'prev' ? <Ionicons name="arrow-back" size={16} color={colors.muted} /> : null}
      <View style={[styles.grow, dir === 'next' && styles.alignEnd]}>
        <Text style={[type.caption, { color: colors.muted }]}>{dir === 'prev' ? 'Forrige' : 'Neste'}</Text>
        <Text style={[type.label, { color: colors.ink }]} numberOfLines={1}>{section.label}</Text>
      </View>
      {dir === 'next' ? <Ionicons name="arrow-forward" size={16} color={colors.muted} /> : null}
    </Pressable>
  ) : <View style={styles.pagerSpacer} />);
  return (
    <View nativeID="employee-settings-pager" style={styles.pager}>
      {item(prev, 'prev')}
      {item(next, 'next')}
    </View>
  );
}

export default function PersonSettingsLayout({
  sections = [], active, onSelect, colors, summary = {}, progress = null, person = null, children,
}) {
  const { isPhone } = useBreakpoints();
  const [width, setWidth] = useState(0);
  const current = sections.find((row) => row.id === active) || sections[0];
  const overview = current?.id === OVERVIEW_ID;
  const cards = sections.filter((row) => row.id !== OVERVIEW_ID);
  const state = (id) => progress?.bySection?.[id];

  const overviewBody = (
    <View style={styles.overviewStack}>
      <Hero person={person || {}} progress={progress} colors={colors} compact={isPhone || (!!width && width < 620)} />
      <MissingPanel progress={progress} sections={cards} colors={colors} onSelect={onSelect} />
      <OverviewGroups
        sections={cards}
        summary={summary}
        progress={progress}
        colors={colors}
        onSelect={onSelect}
        width={width}
      />
    </View>
  );

  const sectionBody = current && !overview ? (
    <>
      <SectionHeader section={current} colors={colors} state={state(current.id)} />
      <View style={styles.content}>{children}</View>
      <Pager sections={sections} current={current} colors={colors} onSelect={onSelect} />
    </>
  ) : null;

  if (isPhone) {
    return (
      <View nativeID="employee-settings" style={styles.phoneRoot} onLayout={(ev) => setWidth(ev.nativeEvent.layout.width)}>
        {overview ? overviewBody : (
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
            {sectionBody}
          </>
        )}
      </View>
    );
  }

  const groupsInNav = SETTINGS_GROUPS
    .map((group) => ({ ...group, items: sections.filter((row) => row.group === group.id) }))
    .filter((group) => group.items.length);
  const navLoose = sections.filter((row) => !SETTINGS_GROUPS.some((g) => g.id === row.group));

  return (
    <View nativeID="employee-settings" style={styles.root}>
      <View
        nativeID="employee-settings-nav"
        accessibilityRole="tablist"
        style={[styles.nav, lift, { backgroundColor: colors.card, borderColor: colors.line }]}
      >
        <Text style={[type.caption, styles.navTitle, { color: colors.muted }]}>Innstillinger</Text>
        {progress ? (
          <View style={styles.navProgress}>
            <Bar
              filled={progress.filled}
              total={progress.total}
              color={progress.pct >= 100 ? (colors.success || colors.brand) : colors.brand}
              colors={colors}
            />
            <Text style={[type.caption, { color: colors.muted }]}>{`Profilen er ${progress.pct} % utfylt`}</Text>
          </View>
        ) : null}
        {navLoose.map((section) => (
          <NavItem
            key={section.id}
            section={section}
            active={section.id === current?.id}
            colors={colors}
            onPress={() => onSelect?.(section.id)}
          />
        ))}
        {groupsInNav.map((group) => (
          <View key={group.id} style={styles.navGroup}>
            <Text style={[styles.navGroupTitle, { color: colors.muted }]}>{group.label}</Text>
            {group.items.map((section) => (
              <NavItem
                key={section.id}
                section={section}
                active={section.id === current?.id}
                colors={colors}
                state={state(section.id)}
                onPress={() => onSelect?.(section.id)}
              />
            ))}
          </View>
        ))}
      </View>
      <View style={styles.main} onLayout={(ev) => setWidth(ev.nativeEvent.layout.width)}>
        {overview ? overviewBody : sectionBody}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, width: '100%' },
  phoneRoot: { gap: space.sm, width: '100%' },
  center: { alignItems: 'center', justifyContent: 'center', textAlign: 'center' },
  grow: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1, minWidth: 0 },
  alignEnd: { alignItems: 'flex-end' },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  nav: {
    width: 264,
    flexShrink: 0,
    borderWidth: 1,
    borderRadius: radius.sheet,
    padding: space.xs,
    gap: 2,
    ...(Platform.OS === 'web' ? { position: 'sticky', top: 0 } : null),
  },
  navTitle: { textTransform: 'uppercase', letterSpacing: 0.4, paddingHorizontal: space.sm, paddingTop: space.xs, paddingBottom: space.xxs },
  navProgress: { paddingHorizontal: space.sm, paddingBottom: space.xs, gap: 4 },
  navGroup: { gap: 2, marginTop: space.xs },
  navGroupTitle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', paddingHorizontal: space.sm, paddingVertical: 4 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingRight: space.sm, paddingVertical: 7, borderRadius: radius.control, overflow: 'hidden' },
  navBar: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  navIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  missingBadge: { minWidth: 20, height: 20, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  missingBadgeText: { fontSize: 11, fontWeight: '600' },
  main: { flex: 1, minWidth: 0, gap: space.md },
  overviewStack: { gap: space.lg },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    borderWidth: 1,
    borderRadius: radius.sheet,
    padding: space.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  heroCompact: { flexDirection: 'column', alignItems: 'stretch', padding: space.md, gap: space.md },
  heroBlobA: { position: 'absolute', width: 280, height: 280, borderRadius: 140, top: -140, right: -60 },
  heroBlobB: { position: 'absolute', width: 180, height: 180, borderRadius: 90, bottom: -100, left: 120 },
  heroLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.md },
  heroLeftCompact: { alignItems: 'flex-start' },
  heroRight: { alignItems: 'center', gap: 4 },
  heroKicker: { textTransform: 'uppercase', letterSpacing: 0.5 },
  heroHeadline: { fontSize: 20, lineHeight: 26, fontWeight: '600', letterSpacing: -0.2 },
  avatar: { width: 84, height: 84, borderRadius: 42, borderWidth: 3, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 26, fontWeight: '600' },
  ringValue: { fontSize: 22, fontWeight: '600', letterSpacing: -0.3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontSize: 12 },
  smallIcon: { width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  missingWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  missingChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, maxWidth: '100%' },
  groups: { gap: space.lg },
  group: { gap: space.sm },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupTitle: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  groupLine: { flex: 1, height: StyleSheet.hairlineWidth },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  gridCell: { flexGrow: 1, flexBasis: 260, minWidth: 0 },
  card: { borderWidth: 1, borderRadius: radius.sheet, padding: space.md, gap: space.sm },
  overviewCard: { padding: 0, gap: 0, overflow: 'hidden', flexGrow: 1 },
  cardBand: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, overflow: 'hidden', position: 'relative' },
  cardBlob: { position: 'absolute', width: 120, height: 120, borderRadius: 60, right: -40, top: -50 },
  cardIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardBody: { padding: space.md, paddingTop: space.sm, gap: space.sm, flexGrow: 1 },
  cardProgress: { gap: 4 },
  bar: { height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radius.pill },
  overviewRows: { gap: 6, flexGrow: 1 },
  overviewRow: { flexDirection: 'row', gap: space.xs, alignItems: 'center' },
  overviewLabel: { width: 118, flexShrink: 0 },
  pill: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, flexShrink: 1 },
  pillText: { fontSize: 11 },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: 1,
    borderRadius: radius.sheet,
    padding: space.md,
    overflow: 'hidden',
    position: 'relative',
    flexWrap: 'wrap',
  },
  sectionBlob: { position: 'absolute', width: 200, height: 200, borderRadius: 100, right: -60, top: -110 },
  sectionIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  content: { gap: space.md, width: '100%' },
  pager: { flexDirection: 'row', gap: space.md, marginTop: space.sm },
  pagerItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderRadius: radius.card, padding: space.sm, minWidth: 0 },
  pagerNext: { justifyContent: 'flex-end' },
  pagerSpacer: { flex: 1 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', paddingVertical: 4 },
});
