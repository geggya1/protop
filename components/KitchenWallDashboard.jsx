/**
 * Dedikert kjøkken-vegg: i dag, middag, handle, kalender, rettferdighet.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, MEMBER_COLORS } from '../src/theme';
import { useApp } from '../src/context/AppContext';
import { dateKey, addDays, startOfWeekMonday } from '../src/utils/dates';
import { firstNameFromProfile, formatGreetingDate } from '../src/utils/timeGreeting';
import { listenChildTodos } from '../src/utils/todos';
import { choreFairnessByKid } from '../src/utils/familyProgress';
import { colorForFamilyEvent } from '../src/utils/calendarColors';
import IconBadge from './IconBadge';
import LiveHomeWidgets from './LiveHomeWidgets';

function formatTimeLabel(ev) {
  return ev?.startTime || 'Hele dagen';
}

export default function KitchenWallDashboard({
  widgetData,
  familyEventsToday = [],
  onOpenEvent,
  onTab,
  onExitRequest,
}) {
  const { height } = useWindowDimensions();
  const short = height < 780;
  const {
    family, kids, members, familyId, activeProfile,
  } = useApp();
  const now = useMemo(() => new Date(), []);
  const todayKey = dateKey(now);
  const weekKeys = useMemo(() => {
    const mon = startOfWeekMonday(now);
    return Array.from({ length: 7 }, (_, i) => dateKey(addDays(mon, i)));
  }, [now]);

  const activeKids = useMemo(
    () => (kids || []).filter((k) => k.active !== false),
    [kids],
  );
  const [kidMap, setKidMap] = useState({});
  const kidsKey = activeKids.map((k) => k.id).filter(Boolean).sort().join('|');

  useEffect(() => {
    if (!familyId || !kidsKey) return undefined;
    const ids = kidsKey.split('|');
    const unsubs = ids.map((kidId) => listenChildTodos(familyId, kidId, (items) => {
      setKidMap((prev) => ({ ...prev, [kidId]: items }));
    }));
    return () => unsubs.forEach((u) => u && u());
  }, [familyId, kidsKey]);

  const fairness = useMemo(
    () => choreFairnessByKid(activeKids, kidMap, weekKeys, todayKey),
    [activeKids, kidMap, weekKeys, todayKey],
  );

  const dinner = widgetData?.meals?.items?.[0];
  const shop = widgetData?.shopping;
  const firstName = firstNameFromProfile(activeProfile, 'familie');
  const events = (familyEventsToday || []).slice(0, 6);

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[styles.body, short && styles.bodyShort]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.kicker}>{family?.name || 'Familien'}</Text>
          <Text style={[styles.hello, short && styles.helloShort]} numberOfLines={1}>
            Kjøkkenveggen
          </Text>
          <Text style={styles.sub}>{formatGreetingDate(now)} · hei {firstName}</Text>
        </View>
        <TouchableOpacity
          style={styles.exitBtn}
          onPress={onExitRequest}
          accessibilityRole="button"
          accessibilityLabel="Avslutt kjøkkenvisning"
        >
          <Ionicons name="lock-closed-outline" size={18} color={colors.brand} />
          <Text style={styles.exitTxt}>Avslutt</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.grid}>
        <TouchableOpacity style={styles.card} onPress={() => onTab?.('more', 'meals')} activeOpacity={0.9}>
          <View style={styles.cardHead}>
            <Ionicons name="restaurant" size={20} color={colors.brand} />
            <Text style={styles.cardTitle}>Middag</Text>
          </View>
          <Text style={styles.cardBig} numberOfLines={2}>
            {dinner?.title || 'Ikke planlagt'}
          </Text>
          {dinner?.meta ? <Text style={styles.cardMeta}>{dinner.meta}</Text> : null}
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => onTab?.('more', 'shop')} activeOpacity={0.9}>
          <View style={styles.cardHead}>
            <IconBadge count={shop?.count || 0} size={14} offset={-4}>
              <Ionicons name="cart" size={20} color={colors.brand} />
            </IconBadge>
            <Text style={styles.cardTitle}>Handleliste</Text>
          </View>
          <Text style={styles.cardBig}>
            {shop?.count != null ? `${shop.count} varer` : 'Ingen åpne'}
          </Text>
          <Text style={styles.cardMeta}>
            {shop?.items?.[0]?.title || shop?.headline || 'Åpne handlelisten'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.cardWide}>
        <View style={styles.cardHead}>
          <Ionicons name="calendar" size={20} color={colors.brand} />
          <Text style={styles.cardTitle}>I dag</Text>
          <TouchableOpacity onPress={() => onTab?.('plan')} hitSlop={8}>
            <Text style={styles.link}>Kalender</Text>
          </TouchableOpacity>
        </View>
        {!events.length ? (
          <Text style={styles.empty}>Ingen hendelser i dag</Text>
        ) : events.map((ev) => (
          <TouchableOpacity
            key={ev.id}
            style={styles.eventRow}
            onPress={() => onOpenEvent?.(ev)}
          >
            <View style={[styles.dot, { backgroundColor: colorForFamilyEvent(ev, members) }]} />
            <Text style={styles.eventTime}>{formatTimeLabel(ev)}</Text>
            <Text style={styles.eventTitle} numberOfLines={1}>{ev.title || 'Hendelse'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {fairness.length > 0 ? (
        <View style={styles.cardWide}>
          <View style={styles.cardHead}>
            <Ionicons name="scale-outline" size={20} color={colors.brand} />
            <Text style={styles.cardTitle}>Rettferdig uke</Text>
            <TouchableOpacity onPress={() => onTab?.('more', 'progress')} hitSlop={8}>
              <Text style={styles.link}>Detaljer</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.fairHint}>Andel av fullførte gjøremål denne uken</Text>
          {fairness.map((row, i) => (
            <View key={row.kidId} style={styles.fairRow}>
              <Text style={styles.fairName} numberOfLines={1}>{row.name}</Text>
              <View style={styles.fairTrack}>
                <View
                  style={[
                    styles.fairFill,
                    {
                      width: `${Math.max(row.sharePct, row.weekDone ? 8 : 0)}%`,
                      backgroundColor: row.color || MEMBER_COLORS[i % MEMBER_COLORS.length],
                    },
                  ]}
                />
              </View>
              <Text style={styles.fairPct}>{row.weekDone}/{row.weekTotal || 0}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <LiveHomeWidgets compact allowCustomize={false} newsLimit={2} />

      <View style={styles.quickRow}>
        {[
          ['plan', null, 'calendar', 'Plan'],
          ['more', 'wall', 'newspaper', 'Vegg'],
          ['more', 'pantry', 'cube', 'Lager'],
          ['more', 'progress', 'stats-chart', 'Progresjon'],
        ].map(([tab, sub, icon, label]) => (
          <TouchableOpacity
            key={label}
            style={styles.quick}
            onPress={() => onTab?.(tab, sub)}
          >
            <Ionicons name={`${icon}-outline`} size={22} color={colors.brand} />
            <Text style={styles.quickLbl}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#eef3f8' },
  body: { padding: 20, paddingBottom: 40, gap: 14 },
  bodyShort: { padding: 14, gap: 10 },
  hero: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  kicker: {
    fontSize: 12, fontWeight: '400', color: colors.muted,
    letterSpacing: 0.6, textTransform: 'uppercase',
  },
  hello: { fontSize: 34, fontWeight: '400', color: colors.ink, letterSpacing: -0.5 },
  helloShort: { fontSize: 28 },
  sub: { marginTop: 4, color: colors.muted, fontWeight: '400', fontSize: 15 },
  exitBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: colors.line,
  },
  exitTxt: { fontWeight: '400', color: colors.brand, fontSize: 13 },
  grid: { flexDirection: 'row', gap: 12 },
  card: {
    flex: 1, backgroundColor: colors.card, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: colors.line, minHeight: 120,
  },
  cardWide: {
    backgroundColor: colors.card, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: colors.line, gap: 8,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardTitle: { flex: 1, fontWeight: '400', color: colors.ink, fontSize: 15 },
  cardBig: { fontSize: 22, fontWeight: '400', color: colors.ink },
  cardMeta: { marginTop: 4, color: colors.muted, fontWeight: '400', fontSize: 13 },
  link: { color: colors.brand, fontWeight: '400', fontSize: 13 },
  empty: { color: colors.muted, fontWeight: '400' },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  eventTime: { width: 72, color: colors.muted, fontWeight: '400', fontSize: 13 },
  eventTitle: { flex: 1, fontWeight: '400', color: colors.ink, fontSize: 15 },
  fairHint: { color: colors.muted, fontSize: 12, fontWeight: '400', marginBottom: 4 },
  fairRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  fairName: { width: 72, fontWeight: '400', color: colors.ink, fontSize: 13 },
  fairTrack: {
    flex: 1, height: 10, borderRadius: 6, backgroundColor: '#e2e8f0', overflow: 'hidden',
  },
  fairFill: { height: '100%', borderRadius: 6 },
  fairPct: { width: 48, textAlign: 'right', fontWeight: '400', color: colors.muted, fontSize: 12 },
  quickRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  quick: {
    flex: 1, alignItems: 'center', gap: 6, backgroundColor: colors.card,
    borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: colors.line,
  },
  quickLbl: { fontWeight: '400', color: colors.ink, fontSize: 12 },
});
