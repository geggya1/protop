import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { listenPlatformEvents } from '../../src/platform/platformCore';
import { getISOWeek } from '../../src/utils/dates';
import { isGroupAdmin } from '../../src/utils/groups';
import { useApp } from '../../src/context/AppContext';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DES'];

function parseKey(k) {
  const [y, m, d] = String(k || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function weekLabel(dateKey) {
  try {
    const d = parseKey(dateKey);
    const { week } = getISOWeek(d);
    return `Uke ${week}`;
  } catch {
    return 'Kommende';
  }
}

function timeLabel(ev) {
  const d = parseKey(ev.dateKey);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const weekday = d.toLocaleDateString('no-NO', { weekday: 'long' });
  if (ev.startTime) {
    return isToday ? `I dag kl. ${ev.startTime}` : `${weekday} kl. ${ev.startTime}`;
  }
  return isToday ? 'I dag' : weekday;
}

export default function PlatformHomeScreen({ config, groupId, group, onSelectTab }) {
  const c = config.theme;
  const { uid } = useApp();
  const isAdmin = isGroupAdmin(group, uid);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const goTab = (id) => onSelectTab?.(id);

  useEffect(() => {
    if (!groupId) { setLoading(false); return undefined; }
    setLoading(true);
    return listenPlatformEvents(groupId, (list) => {
      const todayKey = new Date().toISOString().slice(0, 10);
      setEvents((list || []).filter((e) => (e.dateKey || '') >= todayKey));
      setLoading(false);
    });
  }, [groupId]);

  const grouped = useMemo(() => {
    const map = new Map();
    events.forEach((ev) => {
      const label = weekLabel(ev.dateKey);
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(ev);
    });
    return [...map.entries()];
  }, [events]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={c.brand} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.body, { backgroundColor: c.bg }]} showsVerticalScrollIndicator={false}>
      <View style={[styles.welcome, { backgroundColor: c.surface, borderColor: c.line }]}>
        <Text style={[styles.welcomeKicker, { color: c.brand }]}>{config.homeKicker}</Text>
        <Text style={[styles.welcomeTitle, { color: c.ink }]}>{group?.name || config.label}</Text>
        <Text style={[styles.welcomeSub, { color: c.muted }]}>{config.homeSubtitle}</Text>
      </View>

      <View style={styles.quickRow}>
        {(config.quickActions || []).map((qa) => (
          <TouchableOpacity key={qa.tab} style={styles.quick} onPress={() => goTab(qa.tab)}>
            <View style={[styles.quickIcon, { backgroundColor: qa.soft || c.brandSoft }]}>
              <Ionicons name={qa.icon} size={20} color={c.brand} />
            </View>
            <Text style={[styles.quickTxt, { color: c.ink }]}>{qa.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: c.ink }]}>Kommende {config.eventsLabel.toLowerCase()}</Text>
        <TouchableOpacity onPress={() => goTab(config.type === 'congregation' ? 'calendar' : 'plans')}>
          <Text style={[styles.sectionLink, { color: c.brand }]}>Se alle</Text>
        </TouchableOpacity>
      </View>

      {grouped.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Ionicons name="calendar-outline" size={28} color={c.muted} />
          <Text style={[styles.emptyTxt, { color: c.muted }]}>
            Ingen planer ennå.{isAdmin ? ' Trykk + for å legge til.' : ''}
          </Text>
        </View>
      ) : grouped.slice(0, 2).map(([label, items]) => (
        <View key={label} style={styles.weekBlock}>
          <Text style={[styles.weekLabel, { color: c.muted }]}>{label}</Text>
          {items.slice(0, 3).map((ev) => (
            <TouchableOpacity
              key={ev.id}
              style={[styles.eventCard, { backgroundColor: c.surface, borderColor: c.line }]}
              onPress={() => goTab(config.type === 'congregation' ? 'calendar' : 'plans')}
            >
              <View style={[styles.eventDate, { backgroundColor: c.brandSoft }]}>
                <Text style={[styles.eventDay, { color: c.brand }]}>
                  {parseKey(ev.dateKey).getDate()}
                </Text>
                <Text style={[styles.eventMon, { color: c.brand }]}>
                  {MONTHS[parseKey(ev.dateKey).getMonth()]}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.eventTitle, { color: c.ink }]} numberOfLines={1}>{ev.title}</Text>
                <Text style={[styles.eventSub, { color: c.muted }]} numberOfLines={1}>
                  {timeLabel(ev)}{ev.location ? ` · ${ev.location}` : ''}
                </Text>
                {ev.rsvpEnabled && (
                  <Text style={[styles.rsvpHint, { color: c.brand }]}>
                    {(ev.rsvp?.going?.length || 0)} kommer
                    {(ev.rsvp?.maybe?.length || 0) > 0 ? ` · ${ev.rsvp.maybe.length} kanskje` : ''}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.muted} />
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { padding: 16, paddingBottom: 32, gap: 14 },
  welcome: { borderRadius: 20, padding: 18, borderWidth: 1 },
  welcomeKicker: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  welcomeTitle: { fontSize: 22, fontWeight: '800', marginTop: 4 },
  welcomeSub: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quick: { width: '22%', minWidth: 72, alignItems: 'center', gap: 6 },
  quickIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  quickTxt: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  sectionLink: { fontSize: 13, fontWeight: '700' },
  empty: { borderRadius: 16, padding: 24, alignItems: 'center', gap: 8, borderWidth: 1 },
  emptyTxt: { fontSize: 14, textAlign: 'center' },
  weekBlock: { gap: 8 },
  weekLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  eventCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1 },
  eventDate: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  eventDay: { fontSize: 18, fontWeight: '800', lineHeight: 20 },
  eventMon: { fontSize: 9, fontWeight: '700' },
  eventTitle: { fontSize: 15, fontWeight: '700' },
  eventSub: { fontSize: 12, marginTop: 2 },
  rsvpHint: { fontSize: 11, fontWeight: '600', marginTop: 4 },
});
