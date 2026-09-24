import React, { useMemo, useState } from 'react';
import {
  View, Text, Modal, Pressable, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dateKey, pad, sameDay, isToday } from '../src/utils/dates';
import { colors, radius } from '../src/theme';

function motivationCopy(pct, remaining, unit) {
  if (pct >= 100) {
    return { emoji: '🏆', title: 'Uka er fullført!', body: 'Helt rått — du klarte alt som var mulig denne uka!' };
  }
  if (pct >= 75) {
    return {
      emoji: '🔥',
      title: 'Nesten i mål!',
      body: remaining > 0
        ? `Bare ${remaining} ${unit} igjen. Du er så nær!`
        : 'Digg innsats — fortsett sånn!',
    };
  }
  if (pct >= 50) {
    return {
      emoji: '💪',
      title: 'Halvveis!',
      body: remaining > 0
        ? `Du har mer enn halvparten. ${remaining} ${unit} venter på deg.`
        : 'Du er godt i gang!',
    };
  }
  if (pct >= 25) {
    return {
      emoji: '🌟',
      title: 'Bra fremgang!',
      body: remaining > 0
        ? `Hver oppgave teller. ${remaining} ${unit} kan du fortsatt hente.`
        : 'Fortsett — du klarer mer!',
    };
  }
  if (pct > 0) {
    return {
      emoji: '🚀',
      title: 'Bra start!',
      body: remaining > 0
        ? `Du er i gang. ${remaining} ${unit} igjen denne uka — du får det til!`
        : 'Første steg er tatt!',
    };
  }
  return {
    emoji: '✨',
    title: 'Klar for uka?',
    body: possibleMessage(remaining, unit),
  };
}

function possibleMessage(remaining, unit) {
  if (remaining > 0) return `Det er ${remaining} ${unit} å hente. Start med én oppgave!`;
  return 'Ingen belønninger planlagt denne uka ennå.';
}

function ExpandSection({ title, open, onToggle, children, badge }) {
  return (
    <View style={styles.expandBlock}>
      <TouchableOpacity
        style={styles.expandHead}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.expandTitle}>{title}</Text>
        {badge != null && badge !== '' ? (
          <Text style={styles.expandBadge}>{badge}</Text>
        ) : null}
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.muted}
        />
      </TouchableOpacity>
      {open ? <View style={styles.expandBody}>{children}</View> : null}
    </View>
  );
}

/**
 * Pedagogisk ukeoppsummering for barn — oppnådd vs maks først,
 * detaljer skjult bak ekspandere.
 */
export default function WeekSummaryModal({
  visible,
  onClose,
  weekNumber,
  weekDates = [],
  perDayTotals = {},
  perDayPossible = {},
  earnedSum = 0,
  weekPossibleTotal = 0,
  weekTaskBreakdown = [],
  bagUnit = 'poeng',
  anchorDate = new Date(),
  taskLabel = 'gjøremål',
}) {
  const [daysOpen, setDaysOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);

  const unit = bagUnit || 'poeng';
  const earned = Math.max(0, Math.round(Number(earnedSum) || 0));
  const possible = Math.max(0, Math.round(Number(weekPossibleTotal) || 0));
  const remaining = Math.max(0, possible - earned);
  const pct = possible > 0 ? Math.min(100, Math.round((earned / possible) * 100)) : 0;
  const copy = useMemo(
    () => motivationCopy(pct, remaining, unit),
    [pct, remaining, unit],
  );

  const doneDays = useMemo(() => (
    (weekDates || []).filter((d) => {
      const k = dateKey(d);
      const p = perDayPossible[k] || 0;
      const e = perDayTotals[k] || 0;
      return p > 0 && e >= p;
    }).length
  ), [weekDates, perDayTotals, perDayPossible]);

  const activeDays = useMemo(() => (
    (weekDates || []).filter((d) => (perDayPossible[dateKey(d)] || 0) > 0).length
  ), [weekDates, perDayPossible]);

  const tasksDone = useMemo(() => (
    (weekTaskBreakdown || []).reduce((a, r) => a + (r.completed || 0), 0)
  ), [weekTaskBreakdown]);

  const tasksPossible = useMemo(() => (
    (weekTaskBreakdown || []).reduce((a, r) => a + (r.possibleCount || 0), 0)
  ), [weekTaskBreakdown]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onStartShouldSetResponder={() => true}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Lukk">
            <Ionicons name="close" size={20} color="#334155" />
          </TouchableOpacity>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
            bounces={false}
          >
            <Text style={styles.kicker}>Uke {weekNumber}</Text>

            <View style={styles.hero}>
              <Text style={styles.heroEmoji}>{copy.emoji}</Text>
              <Text style={styles.heroTitle}>{copy.title}</Text>
              <Text style={styles.heroBody}>{copy.body}</Text>

              <View style={styles.scoreRow}>
                <View style={styles.scoreBlock}>
                  <Text style={styles.scoreLabel}>Du har</Text>
                  <Text style={styles.scoreValue}>{earned}</Text>
                  <Text style={styles.scoreUnit}>{unit}</Text>
                </View>
                <Text style={styles.scoreDivider}>av</Text>
                <View style={styles.scoreBlock}>
                  <Text style={styles.scoreLabel}>Mulig</Text>
                  <Text style={[styles.scoreValue, styles.scoreMax]}>{possible}</Text>
                  <Text style={styles.scoreUnit}>{unit}</Text>
                </View>
              </View>

              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${pct}%` }]} />
              </View>
              <Text style={styles.pctTxt}>{pct}% av ukas belønning</Text>

              {remaining > 0 && pct < 100 ? (
                <View style={styles.remainChip}>
                  <Ionicons name="sparkles" size={14} color="#b45309" />
                  <Text style={styles.remainTxt}>
                    {remaining} {unit} igjen å hente
                  </Text>
                </View>
              ) : null}

              {pct >= 100 ? (
                <View style={[styles.remainChip, styles.doneChip]}>
                  <Ionicons name="checkmark-circle" size={16} color="#047857" />
                  <Text style={[styles.remainTxt, styles.doneTxt]}>Alt hentet denne uka</Text>
                </View>
              ) : null}
            </View>

            <ExpandSection
              title="Dag for dag"
              open={daysOpen}
              onToggle={() => setDaysOpen((v) => !v)}
              badge={activeDays ? `${doneDays}/${activeDays} dager` : null}
            >
              {(weekDates || []).map((d) => {
                const k = dateKey(d);
                const dayEarned = perDayTotals[k] || 0;
                const dayPossible = perDayPossible[k] || 0;
                const dayPct = dayPossible
                  ? Math.min(100, Math.round((dayEarned / dayPossible) * 100))
                  : 0;
                const isAnchor = sameDay(d, anchorDate);
                const isTodayDay = isToday(d);
                const dayDone = dayPossible > 0 && dayEarned >= dayPossible;
                return (
                  <View
                    key={k}
                    style={[
                      styles.dayRow,
                      isTodayDay && styles.dayRowToday,
                      isAnchor && styles.dayRowActive,
                    ]}
                  >
                    <View style={styles.dayTop}>
                      <Text style={[styles.dayName, isAnchor && styles.dayNameActive]}>
                        {d.toLocaleDateString('no-NO', { weekday: 'short' }).replace('.', '')}{' '}
                        {pad(d.getDate())}.
                        {isTodayDay ? ' · i dag' : ''}
                      </Text>
                      <Text style={[styles.dayScore, dayDone && styles.dayScoreDone]}>
                        {dayDone ? '✓ ' : ''}
                        {dayEarned} / {dayPossible} {unit}
                      </Text>
                    </View>
                    <View style={styles.miniTrack}>
                      <View
                        style={[
                          styles.miniFill,
                          dayDone && styles.miniFillDone,
                          { width: `${dayPct}%` },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </ExpandSection>

            <ExpandSection
              title={`Per ${taskLabel}`}
              open={tasksOpen}
              onToggle={() => setTasksOpen((v) => !v)}
              badge={tasksPossible ? `${tasksDone}/${tasksPossible}` : null}
            >
              {(weekTaskBreakdown || []).length === 0 ? (
                <Text style={styles.emptyTxt}>
                  Ingen planlagte/utførte {taskLabel} denne uken.
                </Text>
              ) : (weekTaskBreakdown || []).map((r) => {
                const taskPct = r.possibleSum
                  ? Math.min(100, Math.round((r.earnedSum / r.possibleSum) * 100))
                  : 0;
                const taskDone = r.possibleCount > 0 && r.completed >= r.possibleCount;
                return (
                  <View key={r.id} style={styles.taskRow}>
                    <View style={styles.dayTop}>
                      <Text style={styles.taskTitle} numberOfLines={2}>
                        {taskDone ? '✓ ' : ''}{r.title}
                      </Text>
                      <Text style={styles.dayScore}>
                        {r.earnedSum} / {r.possibleSum} {unit}
                      </Text>
                    </View>
                    <Text style={styles.taskMeta}>
                      {r.completed} av {r.possibleCount} ganger
                    </Text>
                    <View style={styles.miniTrack}>
                      <View
                        style={[
                          styles.miniFill,
                          taskDone && styles.miniFillDone,
                          { width: `${taskPct}%` },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </ExpandSection>

            <TouchableOpacity style={styles.cta} onPress={onClose}>
              <Text style={styles.ctaTxt}>
                {pct >= 100 ? 'Supert — lukk' : 'Fortsett å gjøre'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    width: '100%',
    maxWidth: 420,
    maxHeight: '88%',
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    right: 10,
    top: 10,
    zIndex: 2,
    padding: 6,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  scroll: { padding: 18, paddingTop: 20, paddingBottom: 22 },

  kicker: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  hero: {
    marginTop: 8,
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  heroEmoji: { fontSize: 36, marginBottom: 4 },
  heroTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.ink,
    textAlign: 'center',
  },
  heroBody: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
  },

  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 12,
    marginTop: 16,
  },
  scoreBlock: { alignItems: 'center', minWidth: 88 },
  scoreLabel: { fontSize: 11, fontWeight: '800', color: colors.muted, textTransform: 'uppercase' },
  scoreValue: {
    fontSize: 36,
    fontWeight: '900',
    color: colors.brand,
    fontVariant: ['tabular-nums'],
    lineHeight: 40,
  },
  scoreMax: { color: colors.ink },
  scoreUnit: { fontSize: 13, fontWeight: '700', color: colors.muted, marginTop: 1 },
  scoreDivider: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.muted,
    paddingBottom: 18,
  },

  barTrack: {
    marginTop: 14,
    height: 14,
    width: '100%',
    backgroundColor: '#e2e8f0',
    borderRadius: 999,
    overflow: 'hidden',
  },
  barFill: {
    height: 14,
    backgroundColor: '#10b981',
    borderRadius: 999,
  },
  pctTxt: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },

  remainChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    backgroundColor: '#fffbeb',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  remainTxt: { fontWeight: '800', fontSize: 13, color: '#92400e' },
  doneChip: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  doneTxt: { color: '#047857' },

  expandBlock: {
    marginTop: 12,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  expandHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#f8fafc',
  },
  expandTitle: { flex: 1, fontWeight: '800', fontSize: 14, color: colors.ink },
  expandBadge: {
    fontWeight: '800',
    fontSize: 12,
    color: colors.brand,
    backgroundColor: '#eef6ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  expandBody: { paddingHorizontal: 12, paddingBottom: 10, paddingTop: 4 },

  dayRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  dayRowToday: { borderLeftWidth: 3, borderLeftColor: colors.brand, paddingLeft: 8 },
  dayRowActive: { backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 6 },
  dayTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  dayName: { flex: 1, fontWeight: '700', color: colors.ink, fontSize: 13 },
  dayNameActive: { color: '#0b3d91' },
  dayScore: {
    fontWeight: '800',
    fontSize: 12,
    color: colors.muted,
    fontVariant: ['tabular-nums'],
  },
  dayScoreDone: { color: '#047857' },
  miniTrack: {
    marginTop: 6,
    height: 6,
    backgroundColor: '#e7effe',
    borderRadius: 999,
    overflow: 'hidden',
  },
  miniFill: { height: 6, backgroundColor: colors.brand, borderRadius: 999 },
  miniFillDone: { backgroundColor: '#10b981' },

  taskRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  taskTitle: { flex: 1, fontWeight: '700', color: colors.ink, fontSize: 13 },
  taskMeta: { marginTop: 2, fontSize: 11, fontWeight: '600', color: colors.muted },
  emptyTxt: { color: colors.muted, fontWeight: '600', fontSize: 13, paddingVertical: 8 },

  cta: {
    marginTop: 14,
    backgroundColor: colors.brand,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
