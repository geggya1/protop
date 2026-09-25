import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { teamColors as c } from '../../src/teamTheme';
import { listenTeamEvents } from '../../src/utils/teams';
import { isGroupAdmin } from '../../src/utils/groups';
import { useApp } from '../../src/context/AppContext';
import { monthGrid, addDays, startOfWeekMonday, dateKey } from '../../src/utils/dates';
import { eventOccursOnDate } from '../../src/utils/events';
import HelpTarget from '../../components/HelpTarget';
import {
  listenEventsAcrossPlatforms,
  platformIdsFromFamilies,
} from '../../src/utils/crossPlatformData';

const MONTHS_NB = [
  'Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Desember',
];

function toKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseKey(k) {
  const [y, m, d] = String(k || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function weekdayLabels() {
  const monday = startOfWeekMonday(new Date());
  return Array.from({ length: 7 }, (_, i) =>
    addDays(monday, i).toLocaleDateString('nb-NO', { weekday: 'short' }).replace(/\.$/, ''),
  );
}

/** Lagkalender — egen flate (ikke samme som Hjem). */
export default function TeamEventsScreen({ teamId, team }) {
  const nav = useNavigation();
  const { uid, families } = useApp();
  const isAdmin = isGroupAdmin(team, uid);
  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedKey, setSelectedKey] = useState(toKey(today));
  const [teamEvents, setTeamEvents] = useState([]);
  const [linkedEvents, setLinkedEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const viewerIds = useMemo(() => new Set([uid].filter(Boolean)), [uid]);
  const platformIds = useMemo(() => {
    const ids = platformIdsFromFamilies(families);
    if (teamId && !ids.includes(teamId)) ids.push(teamId);
    return ids;
  }, [families, teamId]);

  useEffect(() => {
    if (!teamId) { setLoading(false); return undefined; }
    setLoading(true);
    return listenTeamEvents(teamId, (list) => {
      setTeamEvents(list || []);
      setLoading(false);
    });
  }, [teamId]);

  // Profil-koblede hendelser fra andre plattformer (familie m.m.)
  useEffect(() => {
    if (!teamId || !uid) {
      setLinkedEvents([]);
      return undefined;
    }
    return listenEventsAcrossPlatforms({
      platformIds,
      activePlatformId: teamId,
      viewerIds,
      platforms: families,
      onChange: (list) => {
        // Kun andre plattformer — lagets egne kommer via listenTeamEvents
        setLinkedEvents((list || []).filter((e) => e.crossPlatform));
      },
    });
  }, [teamId, uid, platformIds, viewerIds, families]);

  const events = useMemo(() => {
    const local = (teamEvents || []).map((ev) => ({
      ...ev,
      familyId: teamId,
      crossPlatform: false,
    }));
    return [...local, ...(linkedEvents || [])];
  }, [teamEvents, linkedEvents, teamId]);

  const days = useMemo(() => monthGrid(cursor), [cursor]);
  const labels = useMemo(() => weekdayLabels(), []);
  const title = cursor.toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' });

  const eventsByDay = useMemo(() => {
    const map = new Map();
    const push = (k, ev) => {
      if (!k) return;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(ev);
    };
    events.forEach((ev) => {
      if (ev.crossPlatform) {
        // Familie-hendelser kan være gjentakende — ekspander synlig måned
        days.forEach((d) => {
          if (d && eventOccursOnDate(ev, d)) push(dateKey(d), ev);
        });
        return;
      }
      push(ev.dateKey || '', ev);
    });
    return map;
  }, [events, days]);

  const dayEvents = useMemo(() => {
    const list = eventsByDay.get(selectedKey) || [];
    return [...list].sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')));
  }, [eventsByDay, selectedKey]);

  const monthEvents = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const list = [];
    const seen = new Set();
    events.forEach((ev) => {
      if (ev.crossPlatform) {
        days.forEach((d) => {
          if (!d || d.getFullYear() !== y || d.getMonth() !== m) return;
          if (!eventOccursOnDate(ev, d)) return;
          const k = dateKey(d);
          const id = `${ev.id}:${k}`;
          if (seen.has(id)) return;
          seen.add(id);
          list.push({ ...ev, dateKey: k });
        });
        return;
      }
      const d = parseKey(ev.dateKey);
      if (d.getFullYear() === y && d.getMonth() === m) list.push(ev);
    });
    return list.sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey))
      || String(a.startTime || '').localeCompare(String(b.startTime || '')));
  }, [events, cursor, days]);

  const shiftMonth = (delta) => {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  };

  const selectedLabel = (() => {
    try {
      return parseKey(selectedKey).toLocaleDateString('nb-NO', {
        weekday: 'long', day: 'numeric', month: 'long',
      });
    } catch {
      return selectedKey;
    }
  })();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={c.brand} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      <View style={styles.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Kalender</Text>
          <Text style={styles.title}>{team?.name || 'Laget'}</Text>
        </View>
        {isAdmin ? (
          <HelpTarget id="add">
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => nav.navigate('TeamCreateEvent', { teamId })}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.addBtnTxt}>Ny</Text>
            </TouchableOpacity>
          </HelpTarget>
        ) : null}
      </View>

      <View style={styles.calCard}>
        <View style={styles.nav}>
          <TouchableOpacity style={styles.navBtn} onPress={() => shiftMonth(-1)}>
            <Text style={styles.navTxt}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle}>{title}</Text>
          <TouchableOpacity style={styles.navBtn} onPress={() => shiftMonth(1)}>
            <Text style={styles.navTxt}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.weekRow}>
          {labels.map((l, i) => (
            <Text key={i} style={styles.weekLbl}>{l}</Text>
          ))}
        </View>

        <View style={styles.grid}>
          {days.map((d) => {
            const key = toKey(d);
            const outside = d.getMonth() !== cursor.getMonth();
            const on = key === selectedKey;
            const isToday = key === toKey(today);
            const hasEvents = (eventsByDay.get(key) || []).length > 0;
            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.day,
                  on && styles.dayOn,
                  isToday && !on && styles.dayToday,
                ]}
                onPress={() => setSelectedKey(key)}
              >
                <Text
                  style={[
                    styles.dayTxt,
                    outside && styles.dayMuted,
                    on && styles.dayOnTxt,
                  ]}
                >
                  {d.getDate()}
                </Text>
                {hasEvents ? (
                  <View style={[styles.dot, on && styles.dotOn]} />
                ) : (
                  <View style={styles.dotSpacer} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <Text style={styles.section}>{selectedLabel}</Text>
      {dayEvents.length === 0 ? (
        <View style={styles.emptyDay}>
          <Text style={styles.emptyDayTxt}>Ingen arrangementer denne dagen.</Text>
          {isAdmin ? (
            <TouchableOpacity
              style={styles.emptyLink}
              onPress={() => nav.navigate('TeamCreateEvent', { teamId })}
            >
              <Text style={styles.emptyLinkTxt}>Opprett arrangement</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : dayEvents.map((ev) => (
        <View key={`${ev.id}:${selectedKey}`} style={styles.eventRow}>
          <View style={styles.timeCol}>
            <Text style={styles.timeTxt}>{ev.startTime || 'Heldag'}</Text>
          </View>
          <View style={styles.eventBody}>
            <Text style={styles.eventTitle}>{ev.title}</Text>
            {!!ev.location && (
              <Text style={styles.eventMeta} numberOfLines={1}>{ev.location}</Text>
            )}
            {ev.crossPlatform && ev.sourcePlatformName ? (
              <Text style={styles.eventMeta}>Fra {ev.sourcePlatformName}</Text>
            ) : null}
            {!ev.crossPlatform && ev.inviteCount > 0 ? (
              <Text style={styles.eventMeta}>{ev.inviteCount} invitert</Text>
            ) : null}
          </View>
        </View>
      ))}

      <Text style={[styles.section, { marginTop: 20 }]}>
        {MONTHS_NB[cursor.getMonth()]} ({monthEvents.length})
      </Text>
      {monthEvents.length === 0 ? (
        <Text style={styles.monthEmpty}>Ingen arrangementer denne måneden.</Text>
      ) : monthEvents.map((ev) => {
        const d = parseKey(ev.dateKey);
        return (
          <TouchableOpacity
            key={`m-${ev.id}`}
            style={styles.monthRow}
            onPress={() => setSelectedKey(ev.dateKey)}
          >
            <View style={styles.dateBadge}>
              <Text style={styles.dateBadgeDay}>{d.getDate()}</Text>
              <Text style={styles.dateBadgeMon}>
                {d.toLocaleDateString('nb-NO', { month: 'short' }).replace(/\.$/, '')}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.eventTitle}>{ev.title}</Text>
              <Text style={styles.eventMeta}>
                {ev.startTime ? `kl. ${ev.startTime}` : 'Heldag'}
                {ev.location ? ` · ${ev.location}` : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={c.muted} />
          </TouchableOpacity>
        );
      })}

      <View style={{ height: 28 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  kicker: {
    fontSize: 11, fontWeight: '400', letterSpacing: 1,
    color: c.tint, textTransform: 'uppercase',
  },
  title: { color: c.ink, fontWeight: '400', fontSize: 22, marginTop: 2 },
  addBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: c.brand, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  addBtnTxt: { color: '#fff', fontWeight: '400', fontSize: 14 },
  calCard: {
    backgroundColor: c.surface, borderRadius: 18, padding: 12,
    borderWidth: 1, borderColor: c.line, marginBottom: 16,
  },
  nav: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  navBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: c.brandSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  navTxt: { fontSize: 26, fontWeight: '400', color: c.brand, marginTop: -2 },
  navTitle: {
    flex: 1, textAlign: 'center', fontWeight: '400', fontSize: 16,
    color: c.ink, textTransform: 'capitalize',
  },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekLbl: {
    flex: 1, textAlign: 'center', fontWeight: '400', color: c.muted,
    fontSize: 11, textTransform: 'capitalize',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  day: {
    width: '14.285%',
    aspectRatio: 1,
    maxHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  dayOn: { backgroundColor: c.brand },
  dayToday: { borderWidth: 2, borderColor: c.brand },
  dayTxt: { fontWeight: '400', color: c.ink, fontSize: 14 },
  dayOnTxt: { color: '#fff' },
  dayMuted: { color: c.muted, opacity: 0.55 },
  dot: {
    width: 5, height: 5, borderRadius: 3, backgroundColor: c.brand, marginTop: 2,
  },
  dotOn: { backgroundColor: '#fff' },
  dotSpacer: { height: 7 },
  section: {
    color: c.ink, fontWeight: '400', fontSize: 15, marginBottom: 8,
    textTransform: 'capitalize',
  },
  emptyDay: {
    backgroundColor: c.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: c.line, marginBottom: 8,
  },
  emptyDayTxt: { color: c.muted, fontWeight: '400', fontSize: 13 },
  emptyLink: { marginTop: 8 },
  emptyLinkTxt: { color: c.brand, fontWeight: '400', fontSize: 13 },
  eventRow: {
    flexDirection: 'row', gap: 12, backgroundColor: c.surface,
    borderRadius: 14, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: c.line,
  },
  timeCol: { width: 56, paddingTop: 2 },
  timeTxt: { color: c.brand, fontWeight: '400', fontSize: 12 },
  eventBody: { flex: 1, minWidth: 0 },
  eventTitle: { color: c.ink, fontWeight: '400', fontSize: 15 },
  eventMeta: { color: c.muted, fontWeight: '400', fontSize: 12, marginTop: 2 },
  monthEmpty: { color: c.muted, fontWeight: '400', marginBottom: 8 },
  monthRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surface, borderRadius: 14, padding: 10, marginBottom: 8,
    borderWidth: 1, borderColor: c.line,
  },
  dateBadge: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: c.brandSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  dateBadgeDay: { color: c.brand, fontWeight: '400', fontSize: 16, lineHeight: 18 },
  dateBadgeMon: { color: c.tint, fontWeight: '400', fontSize: 10, textTransform: 'uppercase' },
});
