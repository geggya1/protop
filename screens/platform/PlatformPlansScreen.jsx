import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { listenPlatformEvents, setEventRsvp } from '../../src/platform/platformCore';
import { isGroupAdmin } from '../../src/utils/groups';
import { useApp } from '../../src/context/AppContext';

function parseKey(k) {
  const [y, m, d] = String(k || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatDate(dateKey) {
  const d = parseKey(dateKey);
  return d.toLocaleDateString('no-NO', { weekday: 'long', day: 'numeric', month: 'long' });
}

function RsvpBar({ config, groupId, event, uid }) {
  const c = config.theme;
  const rsvp = event.rsvp || { going: [], maybe: [], no: [] };
  const current = rsvp.going?.includes(uid) ? 'going'
    : rsvp.maybe?.includes(uid) ? 'maybe'
      : rsvp.no?.includes(uid) ? 'no' : null;

  const pick = async (status) => {
    try {
      await setEventRsvp(groupId, event.id, uid, current === status ? null : status);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke å svare.');
    }
  };

  const opts = [
    { id: 'going', label: 'Kommer', icon: 'checkmark-circle' },
    { id: 'maybe', label: 'Kanskje', icon: 'help-circle' },
    { id: 'no', label: 'Nei', icon: 'close-circle' },
  ];

  return (
    <View style={styles.rsvpRow}>
      {opts.map((o) => {
        const on = current === o.id;
        return (
          <TouchableOpacity
            key={o.id}
            style={[styles.rsvpBtn, on && { backgroundColor: c.brandSoft, borderColor: c.brand }]}
            onPress={() => pick(o.id)}
          >
            <Ionicons name={o.icon} size={16} color={on ? c.brand : c.muted} />
            <Text style={[styles.rsvpLabel, { color: on ? c.brand : c.muted }]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function PlatformPlansScreen({ config, groupId, group }) {
  const c = config.theme;
  const nav = useNavigation();
  const { uid } = useApp();
  const isAdmin = isGroupAdmin(group, uid);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId) { setLoading(false); return undefined; }
    return listenPlatformEvents(groupId, (list) => {
      const todayKey = new Date().toISOString().slice(0, 10);
      setEvents((list || []).filter((e) => (e.dateKey || '') >= todayKey));
      setLoading(false);
    });
  }, [groupId]);

  const grouped = useMemo(() => {
    const map = new Map();
    events.forEach((ev) => {
      const key = ev.dateKey || 'unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
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
    <ScrollView contentContainerStyle={[styles.body, { backgroundColor: c.bg }]}>
      {isAdmin && (
        <TouchableOpacity
          style={[styles.addBar, { backgroundColor: c.brand }]}
          onPress={() => nav.navigate(config.createEventRoute, { groupId, group })}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addTxt}>Ny {config.eventsLabel.toLowerCase().slice(0, -1) || 'plan'}</Text>
        </TouchableOpacity>
      )}

      {grouped.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Ionicons name="calendar-outline" size={28} color={c.muted} />
          <Text style={[styles.emptyTxt, { color: c.muted }]}>
            Ingen {config.eventsLabel.toLowerCase()} planlagt.
          </Text>
        </View>
      ) : grouped.map(([dateKey, items]) => (
        <View key={dateKey} style={styles.dayBlock}>
          <Text style={[styles.dayLabel, { color: c.muted }]}>{formatDate(dateKey)}</Text>
          {items.map((ev) => (
            <View key={ev.id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
              <View style={styles.cardTop}>
                <Text style={[styles.title, { color: c.ink }]}>{ev.title}</Text>
                {!!ev.startTime && (
                  <Text style={[styles.time, { color: c.brand }]}>{ev.startTime}{ev.endTime ? `–${ev.endTime}` : ''}</Text>
                )}
              </View>
              {!!ev.location && (
                <View style={styles.locRow}>
                  <Ionicons name="location-outline" size={14} color={c.muted} />
                  <Text style={[styles.loc, { color: c.muted }]}>{ev.location}</Text>
                </View>
              )}
              {!!ev.description && (
                <Text style={[styles.desc, { color: c.muted }]}>{ev.description}</Text>
              )}
              {ev.rsvpEnabled !== false && (
                <>
                  <RsvpBar config={config} groupId={groupId} event={ev} uid={uid} />
                  <Text style={[styles.rsvpSummary, { color: c.muted }]}>
                    {(ev.rsvp?.going?.length || 0)} kommer · {(ev.rsvp?.maybe?.length || 0)} kanskje
                  </Text>
                </>
              )}
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  addBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 14 },
  addTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  empty: { borderRadius: 16, padding: 28, alignItems: 'center', gap: 8, borderWidth: 1 },
  emptyTxt: { fontSize: 14, textAlign: 'center' },
  dayBlock: { gap: 8 },
  dayLabel: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  card: { borderRadius: 16, padding: 14, borderWidth: 1, gap: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  title: { fontSize: 16, fontWeight: '800', flex: 1 },
  time: { fontSize: 13, fontWeight: '700' },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  loc: { fontSize: 13 },
  desc: { fontSize: 13, lineHeight: 18 },
  rsvpRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  rsvpBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  rsvpLabel: { fontSize: 11, fontWeight: '700' },
  rsvpSummary: { fontSize: 11 },
});
