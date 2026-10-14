import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatHours } from '../../src/arbeid/hours.js';
import { isDateLocked } from '../../src/arbeid/locks.js';

const CELL_W = 46;
const LABEL_W = 280;
const TOTAL_W = 72;

function dayHeadColor(day, colors) {
  if (day.red || day.weekend) return colors.danger || '#dc2626';
  return colors.muted;
}

/**
 * Månedsruten for timelisten: uke, dag med hengelås, avtale, saldo, lønn og prosjekt.
 * Dagen timelisten er låst mot lyser som en vertikal linje.
 */
export default function TimesheetGrid({
  colors,
  days,
  weeks,
  monthLabel = '',
  projects,
  hiddenProjects = [],
  absenceRows = [],
  agreedByDay,
  balanceCells,
  payrollByDay,
  selectedDay,
  todayKey,
  lockThrough = '',
  showFlex = true,
  onSelectDay,
  onToggleLock,
  onOpenProject,
  onOpenAbsence,
  onToggleStar,
  onHideProject,
  onShowProject,
}) {
  const gridMinWidth = LABEL_W + days.length * CELL_W + TOTAL_W;
  const lockLine = lockThrough;
  const daysWidth = days.length * CELL_W;

  function cellBg(day, { hours = 0, selected = false } = {}) {
    if (lockLine && day.key === lockLine) return '#d7f7f3';
    if (day.key === todayKey) return `${colors.brand || '#6d28d9'}14`;
    if (selected && hours) return '#fef3c7';
    if (day.red && !day.half) return '#fff7f7';
    if (hours) return `${colors.brand || '#6d28d9'}08`;
    return 'transparent';
  }

  function sumMap(map) {
    let total = 0;
    for (const day of days) total += Number(map.get(day.key)) || 0;
    return total;
  }

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      style={[styles.gridScroll, { borderColor: colors.line, backgroundColor: colors.card }]}
      contentContainerStyle={{ minWidth: gridMinWidth }}
      nativeID="timesheet-grid"
    >
      <ScrollView nestedScrollEnabled>
        {monthLabel ? (
          <View style={styles.row} nativeID="timesheet-month-row">
            <View
              style={[
                styles.weekCell,
                styles.monthSideCell,
                { width: LABEL_W, borderColor: colors.line },
              ]}
            />
            <View
              style={[
                styles.weekCell,
                {
                  width: daysWidth,
                  borderColor: colors.line,
                  backgroundColor: colors.sunken || colors.bg,
                },
              ]}
            >
              <Text style={{ color: colors.ink, fontSize: 11, fontWeight: '700' }}>{monthLabel}</Text>
            </View>
            <View
              style={[
                styles.weekCell,
                styles.monthSideCell,
                { width: TOTAL_W, borderColor: colors.line, borderRightWidth: 0 },
              ]}
            />
          </View>
        ) : null}
        <View style={styles.row}>
          <View style={[styles.labelCell, { width: LABEL_W, borderColor: colors.line }]} />
          {weeks.map((week) => (
            <View
              key={`w-${week.week}-${week.span}`}
              style={[styles.weekCell, { width: week.span * CELL_W, borderColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}
            >
              <Text style={{ color: colors.muted, fontSize: 11 }}>Uke {week.week}</Text>
            </View>
          ))}
          <View style={[styles.totalHead, { width: TOTAL_W, borderColor: colors.line }]}>
            <Text style={{ color: colors.muted, fontSize: 11 }}>Sum</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.labelCell, { width: LABEL_W, borderColor: colors.line }]}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Prosjekt</Text>
          </View>
          {days.map((day) => {
            const locked = isDateLocked(lockThrough, day.key);
            const line = day.key === lockLine;
            return (
              <View
                key={day.key}
                style={[styles.dayHead, { width: CELL_W, borderColor: colors.line, backgroundColor: cellBg(day) }]}
              >
                <TouchableOpacity onPress={() => onSelectDay?.(day.key)} accessibilityRole="button">
                  <Text style={{ color: dayHeadColor(day, colors), fontSize: 10, textAlign: 'center' }}>{day.weekday}</Text>
                  <Text style={{ color: dayHeadColor(day, colors), fontSize: 12, fontWeight: '700', textAlign: 'center' }}>{day.day}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onToggleLock?.(day.key)}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel={line ? `Lås opp timeliste ${day.key}` : `Lås timer til ${day.key}`}
                  nativeID={`timesheet-lock-${day.key}`}
                >
                  <Ionicons
                    name={locked ? 'lock-closed' : 'lock-open-outline'}
                    size={12}
                    color={line ? '#0f766e' : (locked ? colors.ink : colors.placeholder)}
                  />
                </TouchableOpacity>
              </View>
            );
          })}
          <View style={[styles.totalHead, { width: TOTAL_W, borderColor: colors.line }]} />
        </View>

        <SummaryRow
          label="Avtalte timer"
          colors={colors}
          days={days}
          values={days.map((day) => agreedByDay.get(day.key) || 0)}
          cellBg={cellBg}
          total={sumMap(agreedByDay)}
        />
        {showFlex ? (
          <View style={styles.row}>
            <View style={[styles.labelCell, { width: LABEL_W, borderColor: colors.line }]}>
              <Text style={{ color: colors.ink, fontSize: 13 }}>Timebalanse</Text>
            </View>
            {balanceCells.map((value, index) => {
              const day = days[index];
              return (
                <View key={`b-${day.key}`} style={[styles.cell, { width: CELL_W, borderColor: colors.line, backgroundColor: cellBg(day) }]}>
                  <Text style={[styles.cellText, { color: value >= 0 ? (colors.success || '#15803d') : (colors.danger || '#dc2626'), fontSize: 10 }]}>
                    {day.workday || day.half || value !== balanceCells[index - 1] ? formatHours(value, { signed: true, empty: '0:00' }) : ''}
                  </Text>
                </View>
              );
            })}
            <Total value={balanceCells.at(-1) || 0} colors={colors} signed />
          </View>
        ) : null}
        <SummaryRow
          label="Lønnsgrunnlag"
          colors={colors}
          days={days}
          values={days.map((day) => payrollByDay.get(day.key) || 0)}
          cellBg={cellBg}
          total={[...payrollByDay.values()].reduce((sum, n) => sum + n, 0)}
          emphasize
        />

        {absenceRows.map((row) => (
          <HourRow
            key={row.id}
            colors={colors}
            days={days}
            title={row.label}
            subtitle="Fravær"
            hoursFor={row.hoursFor}
            cellBg={cellBg}
            selectedDay={selectedDay}
            onPressDay={(day) => onOpenAbsence?.(row, day)}
            tint="#fffbeb"
          />
        ))}

        {projects.map((row) => (
          <HourRow
            key={row.project.id}
            colors={colors}
            days={days}
            title={`#${row.project.number} ${row.project.name}`}
            subtitle={`${row.project.client || '—'} · ${row.member?.role || 'Deltaker'}`}
            hoursFor={(day) => row.hoursFor(day)}
            cellBg={cellBg}
            selectedDay={selectedDay}
            onPressDay={(day) => onOpenProject?.(row.project, day)}
            starred={row.starred}
            onStar={() => onToggleStar?.(row.member?.id)}
            onHide={() => onHideProject?.(row.project.id)}
          />
        ))}

        {hiddenProjects.length ? (
          <View style={[styles.row, { backgroundColor: '#fefce8' }]}>
            <View style={[styles.labelCell, { width: LABEL_W, borderColor: colors.line }]}>
              <Text style={{ color: colors.ink, fontSize: 13 }} numberOfLines={2}>
                Skjulte prosjekter ({hiddenProjects.map((row) => `#${row.project.number}`).join(', ')})
              </Text>
              <View style={styles.hiddenActions}>
                {hiddenProjects.map((row) => (
                  <TouchableOpacity key={row.project.id} onPress={() => onShowProject?.(row.project.id)} accessibilityRole="button">
                    <Text style={{ color: colors.brand, fontSize: 12 }}>Vis #{row.project.number}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        ) : null}

        {!projects.length && !absenceRows.length ? (
          <View style={{ padding: 24, width: LABEL_W + 200 }}>
            <Text style={{ color: colors.muted }}>
              Ingen prosjekt i listen. Legg til prosjekt du er deltaker på, eller be en leder legge deg inn på prosjektet.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </ScrollView>
  );
}

function SummaryRow({ label, colors, days, values, cellBg, total, emphasize = false }) {
  return (
    <View style={[styles.row, { backgroundColor: colors.sunken || colors.bg }]}>
      <View style={[styles.labelCell, { width: LABEL_W, borderColor: colors.line }]}>
        <Text style={{ color: colors.ink, fontSize: 13, fontWeight: emphasize ? '700' : '500' }}>{label}</Text>
      </View>
      {days.map((day, index) => (
        <View key={`${label}-${day.key}`} style={[styles.cell, { width: CELL_W, borderColor: colors.line, backgroundColor: cellBg(day) }]}>
          <Text style={styles.cellText}>{values[index] ? formatHours(values[index]) : ''}</Text>
        </View>
      ))}
      <Total value={total} colors={colors} />
    </View>
  );
}

function HourRow({
  colors, days, title, subtitle, hoursFor, cellBg, selectedDay, onPressDay, starred, onStar, onHide, tint,
}) {
  let monthSum = 0;
  return (
    <View style={[styles.row, tint ? { backgroundColor: tint } : null]}>
      <View style={[styles.labelCell, styles.projectLabel, { width: LABEL_W, borderColor: colors.line }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={{ color: colors.muted, fontSize: 11 }} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {onStar ? (
          <TouchableOpacity onPress={onStar} hitSlop={6} accessibilityRole="button" accessibilityLabel="Stjernemerk prosjekt">
            <Ionicons name={starred ? 'star' : 'star-outline'} size={15} color={starred ? (colors.star || '#e2a325') : colors.muted} />
          </TouchableOpacity>
        ) : null}
        {onHide ? (
          <TouchableOpacity onPress={onHide} hitSlop={6} accessibilityRole="button" accessibilityLabel="Skjul prosjekt">
            <Ionicons name="eye-off-outline" size={15} color={colors.muted} />
          </TouchableOpacity>
        ) : null}
      </View>
      {days.map((day) => {
        const hours = Number(hoursFor(day)) || 0;
        monthSum += hours;
        const selected = day.key === selectedDay;
        return (
          <TouchableOpacity
            key={`${title}-${day.key}`}
            onPress={() => onPressDay?.(day)}
            style={[styles.cell, { width: CELL_W, borderColor: colors.line, backgroundColor: cellBg(day, { hours, selected }) }]}
            accessibilityRole="button"
          >
            <Text style={[styles.cellText, hours ? { color: colors.ink, fontWeight: '600' } : { color: colors.placeholder }]}>
              {hours ? formatHours(hours) : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
      <Total value={monthSum} colors={colors} strong />
    </View>
  );
}

function Total({ value, colors, signed = false, strong = false }) {
  const color = signed
    ? ((value || 0) >= 0 ? (colors.success || '#15803d') : (colors.danger || '#dc2626'))
    : colors.ink;
  return (
    <View style={[styles.totalCell, { width: TOTAL_W, borderColor: colors.line }]}>
      <Text style={[styles.cellText, { color, fontWeight: strong ? '700' : '500' }]}>
        {formatHours(value || 0, signed ? { signed: true } : undefined)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  gridScroll: { flex: 1, borderWidth: 1, borderRadius: 10, minHeight: 280 },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  labelCell: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  projectLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  weekCell: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    minHeight: 28,
  },
  monthSideCell: {
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  dayHead: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 1,
  },
  cell: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  cellText: { fontSize: 11, fontVariant: ['tabular-nums'] },
  totalHead: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalCell: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
});
