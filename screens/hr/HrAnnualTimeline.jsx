import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { chartColorsFor } from '../../src/ui/chartColors';
import { radius, space, type } from '../../src/ui/tokens';
import { MONTHS_NB } from '../../src/hr/annualWheel';
import { useLayout } from '../../src/theme';
import { statusColor } from './HrAnnualWheel';

const MONTH_LETTER = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export const STATUS_LEGEND = [
  { id: 'done', label: 'Gjort' },
  { id: 'now', label: 'Denne måneden' },
  { id: 'late', label: 'Ikke krysset av' },
  { id: 'later', label: 'Planlagt' },
  { id: 'off', label: 'Gjelder ikke' },
];

export function StatusLegend({ colors, withIso = false }) {
  const chart = chartColorsFor(colors);
  const list = withIso ? [...STATUS_LEGEND, { id: 'iso', label: 'ISO-årshjulet' }] : STATUS_LEGEND;
  return (
    <View style={styles.legend} accessibilityRole="list">
      {list.map((s) => (
        <View key={s.id} style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: statusColor(s.id, chart) }]} />
          <Text style={[styles.legendText, { color: colors.muted }]}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Året som tidslinje: én rad per aktivitet, med en strek over månedene den gjelder (farge = status)
 * og inneværende måned markert. Trykk en rad for å gå rett til aktiviteten (onSelectActivity).
 * Bare raden som er valgt (selectedId) markeres.
 * layout fra wheelLayout(). compact: telefon (bokstav for måned, navnet over streken).
 */
export default function HrAnnualTimeline({ colors, layout, nowMonth = -1, selectedId = null, onSelectActivity, compact = false }) {
  const chart = chartColorsFor(colors);
  const { isWide } = useLayout();
  // Hele navnet når det er plass, ellers «Sep», og bokstav på telefon.
  const label = (name, m) => (compact ? MONTH_LETTER[m] : isWide ? name : name.slice(0, 3));
  const head = (
    <View style={styles.months}>
      {MONTHS_NB.map((name, m) => (
        <Text
          key={name}
          numberOfLines={1}
          accessibilityLabel={name}
          style={[styles.monthHead, { color: m === nowMonth ? colors.ink : colors.muted, fontWeight: m === nowMonth ? '600' : '400' }]}
        >
          {label(name, m)}
        </Text>
      ))}
    </View>
  );
  return (
    <View nativeID="hr-annual-timeline" style={styles.wrap}>
      <View style={[styles.row, compact && styles.rowCompact]}>
        {compact ? null : <View style={styles.name} />}
        {head}
      </View>
      {layout.items.map((i) => {
        const muted = i.track < 0 && i.status !== 'iso';
        const on = selectedId === i.activity.id;
        return (
          <Pressable
            key={i.activity.id}
            onPress={() => onSelectActivity?.(i)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${i.activity.title}: ${i.period || ''} ${i.status}. Gå til aktiviteten.`}
            style={({ hovered }) => [
              styles.row,
              compact && styles.rowCompact,
              { borderTopColor: colors.line, backgroundColor: hovered || on ? colors.sunken : 'transparent' },
            ]}
          >
            <Text numberOfLines={compact ? 2 : 1} style={[styles.name, compact && styles.nameCompact, { color: muted ? colors.muted : colors.ink }]}>
              {i.status === 'iso' ? `ISO · ${i.activity.title}` : i.activity.title}
            </Text>
            <View style={styles.months}>
              {MONTH_LETTER.map((l, m) => (
                <View key={`${l}${m}`} style={[styles.cell, m === nowMonth && { backgroundColor: chart.segmentNow }]} />
              ))}
              {(i.segments || [[i.start, i.end]]).map(([from, to]) => (
                <View key={from} style={[styles.barSlot, { left: `${(from / 12) * 100}%`, width: `${((to - from + 1) / 12) * 100}%` }]}>
                  <View style={[styles.bar, { backgroundColor: statusColor(i.status, chart) }]} />
                </View>
              ))}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 6, paddingHorizontal: space.xxs, borderTopWidth: 1, borderTopColor: 'transparent', borderRadius: radius.control },
  rowCompact: { flexDirection: 'column', alignItems: 'stretch', gap: 4 },
  name: { width: 260, ...type.label, fontWeight: '400' },
  nameCompact: { width: 'auto' },
  months: { flex: 1, flexDirection: 'row', minHeight: 16, position: 'relative', alignItems: 'center' },
  monthHead: { flex: 1, textAlign: 'center', ...type.caption },
  cell: { flex: 1, alignSelf: 'stretch' },
  barSlot: { position: 'absolute', top: 0, bottom: 0, paddingHorizontal: 3, justifyContent: 'center' },
  bar: { height: 10, borderRadius: radius.pill },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: radius.pill },
  legendText: { ...type.caption },
});
