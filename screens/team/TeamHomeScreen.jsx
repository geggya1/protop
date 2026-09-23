import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { teamColors as c } from '../../src/teamTheme';
import { listenTeamEvents } from '../../src/utils/teams';
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

export default function TeamHomeScreen({ teamId, team, onSelectTab }) {
  const nav = useNavigation();
  const { uid } = useApp();
  const isAdmin = isGroupAdmin(team, uid);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const goTab = (id) => {
    if (onSelectTab) onSelectTab(id);
    else nav.navigate('TeamHome', { module: id });
  };

  useEffect(() => {
    if (!teamId) { setLoading(false); return undefined; }
    setLoading(true);
    return listenTeamEvents(teamId, (list) => {
      const todayKey = new Date().toISOString().slice(0, 10);
      setEvents((list || []).filter((e) => (e.dateKey || '') >= todayKey));
      setLoading(false);
    });
  }, [teamId]);

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
    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      <View style={styles.welcome}>
        <Text style={styles.welcomeKicker}>Idrettslag</Text>
        <Text style={styles.welcomeTitle}>{team?.name || 'Laget'}</Text>
        <Text style={styles.welcomeSub}>
          {team?.sport
            ? `${team.sport} — trening, kamper og lagprat på ett sted.`
            : 'Trening, kamper og lagprat på ett sted — samme ProTop, egen lagflate.'}
        </Text>
      </View>

      <View style={styles.quickRow}>
        <TouchableOpacity style={styles.quick} onPress={() => goTab('events')}>
          <View style={[styles.quickIcon, { backgroundColor: c.brandSoft }]}>
            <Ionicons name="calendar-outline" size={20} color={c.brand} />
          </View>
          <Text style={styles.quickTxt}>Kalender</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quick} onPress={() => goTab('wall')}>
          <View style={[styles.quickIcon, { backgroundColor: c.tintSoft }]}>
            <Ionicons name="newspaper-outline" size={20} color={c.tint} />
          </View>
          <Text style={styles.quickTxt}>Vegg</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quick} onPress={() => goTab('members')}>
          <View style={[styles.quickIcon, { backgroundColor: '#fef3c7' }]}>
            <Ionicons name="people-outline" size={20} color="#b45309" />
          </View>
          <Text style={styles.quickTxt}>Lag</Text>
        </TouchableOpacity>
        {isAdmin && (
          <TouchableOpacity style={styles.quick} onPress={() => goTab('invite')}>
            <View style={[styles.quickIcon, { backgroundColor: '#ede9fe' }]}>
              <Ionicons name="key-outline" size={20} color="#6d28d9" />
            </View>
            <Text style={styles.quickTxt}>Kode</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.listHead}>
        <Text style={styles.listHeadTxt}>Kommende</Text>
        {isAdmin && (
          <TouchableOpacity onPress={() => nav.navigate('TeamCreateEvent', { teamId })}>
            <Text style={styles.listHeadLink}>Legg til</Text>
          </TouchableOpacity>
        )}
      </View>

      {grouped.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={36} color={c.muted} />
          <Text style={styles.emptyTitle}>Ingen arrangementer ennå</Text>
          <Text style={styles.emptySub}>
            Treninger og kamper vises her når de er lagt inn.
          </Text>
          {isAdmin && (
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => nav.navigate('TeamCreateEvent', { teamId })}
            >
              <Text style={styles.emptyBtnTxt}>Opprett arrangement</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : grouped.map(([label, items]) => (
        <View key={label} style={styles.weekBlock}>
          <Text style={styles.weekLabel}>{label}</Text>
          {items.map((ev) => {
            const d = parseKey(ev.dateKey);
            return (
              <View key={ev.id} style={styles.eventCard}>
                <View style={styles.dateBlock}>
                  <Text style={styles.month}>{MONTHS[d.getMonth()]}</Text>
                  <Text style={styles.day}>{d.getDate()}</Text>
                </View>
                <View style={styles.eventBody}>
                  <Text style={styles.eventTitle} numberOfLines={2}>{ev.title}</Text>
                  <Text style={styles.eventTime}>{timeLabel(ev)}</Text>
                  <Text style={styles.eventMeta} numberOfLines={1}>
                    {ev.location || team?.name || 'Lag'}
                    {ev.inviteCount > 0 ? ` · ${ev.inviteCount} invitert` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.muted} />
              </View>
            );
          })}
        </View>
      ))}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  welcome: {
    backgroundColor: c.surface,
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: c.line,
  },
  welcomeKicker: {
    fontSize: 11, fontWeight: '800', letterSpacing: 1.1,
    color: c.tint, textTransform: 'uppercase',
  },
  welcomeTitle: { marginTop: 4, color: c.ink, fontWeight: '900', fontSize: 24 },
  welcomeSub: { marginTop: 6, color: c.muted, fontWeight: '600', fontSize: 14, lineHeight: 20 },
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  quick: {
    flex: 1, alignItems: 'center', backgroundColor: c.surface,
    borderRadius: 16, paddingVertical: 12, borderWidth: 1, borderColor: c.line,
  },
  quickIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  quickTxt: { color: c.ink, fontWeight: '800', fontSize: 12 },
  listHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
  },
  listHeadTxt: { color: c.ink, fontWeight: '800', fontSize: 16 },
  listHeadLink: { color: c.brand, fontWeight: '800', fontSize: 14 },
  weekBlock: { marginBottom: 16 },
  weekLabel: { color: c.muted, fontWeight: '800', fontSize: 12, marginBottom: 8, letterSpacing: 0.6 },
  eventCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surface, borderRadius: 16, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: c.line,
  },
  dateBlock: { width: 48, alignItems: 'center' },
  month: { color: c.muted, fontWeight: '800', fontSize: 11 },
  day: { color: c.ink, fontWeight: '900', fontSize: 22, lineHeight: 26 },
  eventBody: { flex: 1, minWidth: 0 },
  eventTitle: { color: c.ink, fontWeight: '800', fontSize: 15 },
  eventTime: { color: c.ink, fontWeight: '700', fontSize: 13, marginTop: 2 },
  eventMeta: { color: c.muted, fontWeight: '600', fontSize: 12, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 36, gap: 8, backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: c.line },
  emptyTitle: { color: c.ink, fontWeight: '800', fontSize: 16 },
  emptySub: { color: c.muted, textAlign: 'center', fontWeight: '600', fontSize: 13, lineHeight: 18, paddingHorizontal: 24 },
  emptyBtn: {
    marginTop: 8, backgroundColor: c.brand, borderRadius: 14,
    paddingHorizontal: 18, paddingVertical: 12,
  },
  emptyBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
