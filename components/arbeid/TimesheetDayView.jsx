/**
 * Mobil Timeliste-visning (Moment-stil):
 * dagpil → Lønnsgrunnlag + sum → prosjekt-rader med kunde, rolle og timer.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatHours } from '../../src/arbeid/hours.js';
import { shortDayLabel } from '../../src/arbeid/calendar.js';

export function TimesheetDayNav({
  colors,
  dateKey,
  onPrev,
  onNext,
  hasHours = false,
  locked = false,
  onComment,
}) {
  return (
    <View style={styles.dayNav} nativeID="timesheet-day-nav">
      <TouchableOpacity onPress={onPrev} accessibilityRole="button" accessibilityLabel="Forrige dag" style={styles.navHit}>
        <Ionicons name="chevron-back" size={22} color={colors.ink} />
      </TouchableOpacity>
      <View style={styles.dayCenter}>
        {onComment ? (
          <TouchableOpacity onPress={onComment} accessibilityRole="button" style={styles.navHit}>
            <Ionicons name="chatbubble-outline" size={18} color={colors.muted} />
          </TouchableOpacity>
        ) : (
          <View style={styles.navHit} />
        )}
        <View style={styles.dayLabelWrap}>
          <Text style={[styles.dayLabel, { color: colors.ink }]}>{shortDayLabel(dateKey)}</Text>
          {hasHours ? <View style={[styles.statusDot, { backgroundColor: '#22c55e' }]} /> : null}
        </View>
        <View style={styles.navHit}>
          {locked ? <Ionicons name="lock-closed-outline" size={18} color={colors.muted} /> : null}
        </View>
      </View>
      <TouchableOpacity onPress={onNext} accessibilityRole="button" accessibilityLabel="Neste dag" style={styles.navHit}>
        <Ionicons name="chevron-forward" size={22} color={colors.ink} />
      </TouchableOpacity>
    </View>
  );
}

export function TimesheetProjectRow({
  colors,
  number,
  name,
  customer,
  role,
  hours,
  onPress,
  testID,
}) {
  const hasHours = hours > 0;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${number || ''} ${name || ''} ${hasHours ? formatHours(hours) : 'ingen timer'}`}
      nativeID={testID}
      style={[styles.row, { borderBottomColor: colors.line }]}
    >
      <View style={styles.rowMain}>
        <Text style={[styles.projectTitle, { color: colors.ink }]} numberOfLines={2}>
          {number ? `#${number} ` : ''}{name || 'Prosjekt'}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.meta, { color: colors.muted, flex: 1 }]} numberOfLines={1}>
            {customer || '—'}
          </Text>
          <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>
            {role || ''}
          </Text>
        </View>
      </View>
      <View style={[styles.hoursCol, { borderLeftColor: colors.line }]}>
        <Text style={[styles.hoursText, { color: hasHours ? colors.ink : colors.placeholder }]}>
          {hasHours ? formatHours(hours) : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function TimesheetDayView({
  colors,
  dateKey,
  totalHours = 0,
  rows = [],
  onPrevDay,
  onNextDay,
  locked = false,
  emptyText = 'Ingen prosjekt i listen.',
  headerRight = null,
}) {
  return (
    <View
      style={[styles.sheet, { borderColor: colors.line, backgroundColor: colors.card }]}
      nativeID="timesheet-day-view"
    >
      <TimesheetDayNav
        colors={colors}
        dateKey={dateKey}
        onPrev={onPrevDay}
        onNext={onNextDay}
        hasHours={totalHours > 0}
        locked={locked}
      />
      <View style={[styles.sectionHead, { backgroundColor: colors.sunken || '#f3f4f6', borderColor: colors.line }]}>
        <Text style={[styles.sectionTitle, { color: colors.ink }]}>Lønnsgrunnlag</Text>
        <View style={styles.sectionRight}>
          {headerRight}
          <Text style={[styles.sectionTotal, { color: colors.ink }]}>{formatHours(totalHours)}</Text>
        </View>
      </View>
      {rows.map((row) => (
        <TimesheetProjectRow
          key={row.id}
          colors={colors}
          number={row.number}
          name={row.name}
          customer={row.customer}
          role={row.role}
          hours={row.hours}
          onPress={row.onPress}
          testID={row.testID}
        />
      ))}
      {!rows.length ? (
        <Text style={[styles.empty, { color: colors.muted }]}>{emptyText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 0,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  dayCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  dayLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 72,
    justifyContent: 'center',
  },
  dayLabel: { fontSize: 16, fontWeight: '600' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  navHit: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: { fontSize: 15, fontWeight: '600' },
  sectionRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTotal: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
    backgroundColor: '#fff',
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
    justifyContent: 'center',
  },
  projectTitle: { fontSize: 14, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meta: { fontSize: 12 },
  hoursCol: {
    width: 64,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  hoursText: { fontSize: 15, fontWeight: '500', fontVariant: ['tabular-nums'] },
  empty: { padding: 16, fontSize: 13 },
});
