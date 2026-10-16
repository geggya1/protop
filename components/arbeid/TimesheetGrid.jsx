import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatHours } from '../../src/arbeid/hours.js';
import { isDateLocked } from '../../src/arbeid/locks.js';
import { timesheetColumnMetrics } from '../../src/arbeid/timesheetProjects.js';

function dayHeadColor(day, colors) {
  if (day.red || day.weekend) return colors.danger || '#dc2626';
  return colors.muted;
}

/**
 * Månedsruten for timelisten: uke, dag med hengelås, avtale, saldo, lønn og prosjekt.
 * Timebalanse er dagsavvik. Endene er inngående og utgående timebank.
 * Topp (dato → timebalanse) er fryst; prosjektlisten scroller. Kolonner fyller bredden.
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
  balanceCells = [],
  incomingBalance = 0,
  outgoingBalance = 0,
  balanceReady = true,
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
  const [availableWidth, setAvailableWidth] = useState(0);
  const metrics = useMemo(
    () => timesheetColumnMetrics(availableWidth, days.length),
    [availableWidth, days.length],
  );
  const { labelW, dayW, totalW, gridWidth, daysWidth } = metrics;
  const lockLine = lockThrough;
  const dayLocked = (day) => isDateLocked(lockLine, day.key);

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

  const headerBlock = (
    <View nativeID="timesheet-frozen-header">
      {monthLabel ? (
        <View style={styles.row} nativeID="timesheet-month-row">
          <View style={[styles.weekCell, styles.monthSideCell, { width: labelW, borderColor: colors.line }]} />
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
              { width: totalW, borderColor: colors.line, borderRightWidth: 0 },
            ]}
          />
        </View>
      ) : null}
      <View style={styles.row}>
        <View style={[styles.labelCell, { width: labelW, borderColor: colors.line }]} />
        {weeks.map((week) => (
          <View
            key={`w-${week.week}-${week.span}`}
            style={[
              styles.weekCell,
              {
                width: week.span * dayW,
                borderColor: colors.line,
                backgroundColor: colors.sunken || colors.bg,
              },
            ]}
          >
            <Text style={{ color: colors.muted, fontSize: 11 }}>Uke {week.week}</Text>
          </View>
        ))}
        <View style={[styles.totalHead, { width: totalW, borderColor: colors.line }]}>
          <Text style={{ color: colors.muted, fontSize: 11 }}>Sum</Text>
        </View>
      </View>

      <View style={styles.row}>
        <View style={[styles.labelCell, { width: labelW, borderColor: colors.line }]}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Prosjekt</Text>
        </View>
        {days.map((day) => {
          const locked = isDateLocked(lockThrough, day.key);
          const line = day.key === lockLine;
          return (
            <View
              key={day.key}
              style={[styles.dayHead, { width: dayW, borderColor: colors.line, backgroundColor: cellBg(day) }]}
            >
              <TouchableOpacity onPress={() => onSelectDay?.(day.key)} accessibilityRole="button">
                <Text style={{ color: dayHeadColor(day, colors), fontSize: 10, textAlign: 'center' }}>{day.weekday}</Text>
                <Text style={{ color: dayHeadColor(day, colors), fontSize: 13, fontWeight: '700', textAlign: 'center' }} dataSet={{ ts: 'strong' }}>{day.day}</Text>
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
        <View style={[styles.totalHead, { width: totalW, borderColor: colors.line }]} />
      </View>

      <SummaryRow
        label="Avtalte timer"
        colors={colors}
        days={days}
        values={days.map((day) => agreedByDay.get(day.key) || 0)}
        cellBg={cellBg}
        locked={dayLocked}
        total={sumMap(agreedByDay)}
        labelW={labelW}
        dayW={dayW}
        totalW={totalW}
      />
      {showFlex ? (
        <View style={styles.row} nativeID="timesheet-balance-row">
          <View style={[styles.labelCell, { width: labelW, borderColor: colors.line, backgroundColor: '#f8fafc' }]}>
            <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '600' }} dataSet={{ ts: 'strong' }}>Timebalanse</Text>
            <Text style={styles.bankCaption}>Inngående</Text>
            <Text
              nativeID="timesheet-balance-in"
              style={[styles.bankFigure, { color: balanceColor(incomingBalance, colors) }]}
              dataSet={{ ts: 'strong' }}
            >
              {balanceReady ? formatHours(incomingBalance, { signed: true }) : '…'}
            </Text>
          </View>
          {days.map((day, index) => {
            const delta = Number(balanceCells[index]) || 0;
            return (
              <View key={`b-${day.key}`} style={[styles.cell, { width: dayW, borderColor: colors.line, backgroundColor: cellBg(day) }]}>
                <LockMark locked={dayLocked(day)} />
                <Text
                  style={[styles.cellText, { color: balanceColor(delta, colors), fontWeight: delta ? '600' : '400' }]}
                  dataSet={delta ? { ts: 'strong' } : undefined}
                >
                  {balanceReady && delta ? formatHours(delta, { signed: true }) : ''}
                </Text>
              </View>
            );
          })}
          <View
            nativeID="timesheet-balance-out"
            style={[styles.totalCell, styles.bankOut, { width: totalW, borderColor: colors.line, backgroundColor: '#f8fafc' }]}
          >
            <Text style={styles.bankCaption}>Utgående</Text>
            <Text style={[styles.bankFigure, { color: balanceColor(outgoingBalance, colors) }]} dataSet={{ ts: 'strong' }}>
              {balanceReady ? formatHours(outgoingBalance, { signed: true }) : '…'}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );

  const bodyBlock = (
    <View nativeID="timesheet-scroll-body">
      <SummaryRow
        label="Lønnsgrunnlag"
        colors={colors}
        days={days}
        values={days.map((day) => payrollByDay.get(day.key) || 0)}
        cellBg={cellBg}
        locked={dayLocked}
        total={[...payrollByDay.values()].reduce((sum, n) => sum + n, 0)}
        emphasize
        labelW={labelW}
        dayW={dayW}
        totalW={totalW}
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
          locked={dayLocked}
          selectedDay={selectedDay}
          onPressDay={(day) => onOpenAbsence?.(row, day)}
          tint="#fffbeb"
          labelW={labelW}
          dayW={dayW}
          totalW={totalW}
        />
      ))}

      {projects.map((row) => (
        <HourRow
          key={row.project.id}
          colors={colors}
          days={days}
          title={`#${row.project.number} ${row.project.name}`}
          subtitle={row.project.client || ''}
          hoursFor={(day) => row.hoursFor(day)}
          cellBg={cellBg}
          locked={dayLocked}
          selectedDay={selectedDay}
          onPressDay={(day) => onOpenProject?.(row.project, day)}
          starred={row.starred}
          onStar={() => onToggleStar?.(row.member?.id)}
          onHide={() => onHideProject?.(row.project.id)}
          labelW={labelW}
          dayW={dayW}
          totalW={totalW}
        />
      ))}

      {hiddenProjects.length ? (
        <View style={[styles.row, { backgroundColor: '#fefce8' }]}>
          <View style={[styles.labelCell, { width: labelW, borderColor: colors.line }]}>
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
        <View style={{ padding: 24, width: Math.max(labelW + 200, gridWidth) }}>
          <Text style={{ color: colors.muted }}>
            Ingen prosjekt i listen. Prosjekt uten timer de siste to månedene skjules, med mindre de er stjernemerket.
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View
      style={[styles.gridRoot, { borderColor: colors.line, backgroundColor: colors.card }]}
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        if (next > 0 && next !== availableWidth) setAvailableWidth(next);
      }}
      nativeID="timesheet-grid"
    >
      <ScrollView
        horizontal
        nestedScrollEnabled
        style={styles.gridScroll}
        contentContainerStyle={{ minWidth: Math.max(gridWidth, availableWidth || 0), flexGrow: 1 }}
      >
        <View style={[styles.gridColumn, { width: Math.max(gridWidth, availableWidth || 0) }]}>
          <View style={[styles.frozenHeader, { borderBottomColor: colors.line, backgroundColor: colors.card }]}>
            {headerBlock}
          </View>
          <ScrollView
            nestedScrollEnabled
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyScrollInner}
            keyboardShouldPersistTaps="handled"
          >
            {bodyBlock}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

function SummaryRow({
  label, colors, days, values, cellBg, locked, total, emphasize = false, labelW, dayW, totalW,
}) {
  return (
    <View style={[styles.row, { backgroundColor: colors.sunken || '#f8fafc' }]}>
      <View style={[styles.labelCell, { width: labelW, borderColor: colors.line }]}>
        <Text
          style={{ color: colors.ink, fontSize: 13, fontWeight: emphasize ? '700' : '500' }}
          dataSet={emphasize ? { ts: 'strong' } : undefined}
        >{label}</Text>
      </View>
      {days.map((day, index) => (
        <View key={`${label}-${day.key}`} style={[styles.cell, { width: dayW, borderColor: colors.line, backgroundColor: cellBg(day) }]}>
          <LockMark locked={locked?.(day)} />
          <Text style={styles.cellText}>{values[index] ? formatHours(values[index]) : ''}</Text>
        </View>
      ))}
      <Total value={total} colors={colors} totalW={totalW} strong={emphasize} />
    </View>
  );
}

function HourRow({
  colors, days, title, subtitle, hoursFor, cellBg, locked, selectedDay, onPressDay, starred, onStar, onHide, tint,
  labelW, dayW, totalW,
}) {
  let monthSum = 0;
  return (
    <View style={[styles.row, tint ? { backgroundColor: tint } : null]}>
      <View style={[styles.labelCell, styles.projectLabel, { width: labelW, borderColor: colors.line }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }} numberOfLines={1} dataSet={{ ts: 'title' }}>{title}</Text>
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
            style={[styles.cell, { width: dayW, borderColor: colors.line, backgroundColor: cellBg(day, { hours, selected }) }]}
            accessibilityRole="button"
          >
            <LockMark locked={locked?.(day)} />
            <Text style={[styles.cellText, hours ? { color: colors.ink, fontWeight: '600' } : { color: colors.placeholder }]} dataSet={hours ? { ts: 'strong' } : undefined}>
              {hours ? formatHours(hours) : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
      <Total value={monthSum} colors={colors} strong totalW={totalW} />
    </View>
  );
}

function Total({ value, colors, signed = false, strong = false, totalW }) {
  const color = signed ? balanceColor(value, colors) : colors.ink;
  return (
    <View style={[styles.totalCell, { width: totalW, borderColor: colors.line, backgroundColor: '#f8fafc' }]}>
      <Text
        style={[styles.cellText, { color, fontWeight: strong ? '700' : '600' }]}
        dataSet={{ ts: 'strong' }}
      >
        {formatHours(value || 0, signed ? { signed: true } : undefined)}
      </Text>
    </View>
  );
}

function balanceColor(value, colors) {
  const n = Number(value) || 0;
  if (n > 0) return colors.success || '#047857';
  if (n < 0) return colors.danger || '#dc2626';
  return colors.muted || '#64748b';
}

function LockMark({ locked }) {
  if (!locked) return null;
  return (
    <View pointerEvents="none" style={styles.lockMark} accessibilityElementsHidden>
      <Ionicons name="lock-closed" size={11} color="#94a3b8" />
    </View>
  );
}

const styles = StyleSheet.create({
  gridRoot: { flex: 1, alignSelf: 'stretch', width: '100%', maxWidth: '100%', borderWidth: 1, borderRadius: 8, minHeight: 280, overflow: 'hidden' },
  gridScroll: { flex: 1, width: '100%', alignSelf: 'stretch' },
  gridColumn: { flex: 1, minHeight: 0 },
  frozenHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 2,
  },
  bodyScroll: { flex: 1, minHeight: 0 },
  bodyScrollInner: { paddingBottom: 8 },
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
    minHeight: 34,
    position: 'relative',
  },
  cellText: { fontSize: 12, fontVariant: ['tabular-nums'] },
  bankCaption: { color: '#64748b', fontSize: 10, marginTop: 2 },
  bankFigure: { fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '600' },
  bankOut: { paddingVertical: 4 },
  lockMark: {
    position: 'absolute',
    top: 2,
    right: 2,
    opacity: 0.85,
  },
  totalHead: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalCell: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
});
