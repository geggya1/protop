/**
 * Oppfølging: alle oppfølgingspunkter fra møtene på ett sted, gruppert på
 * ansvarlig, frist eller møte. Forfalte står øverst.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import { actionCounts, collectActions, daysBetween, shortDate } from '../../src/meetings/model';
import {
  Avatar, Card, Choice, Empty, Pill, SearchBox, SectionHead, Stat,
} from './meetingUi';

const FILTERS = [
  { id: 'apne', label: 'Åpne' },
  { id: 'forfalt', label: 'Forfalt' },
  { id: 'mine', label: 'Mine' },
  { id: 'utfort', label: 'Utført' },
  { id: 'alle', label: 'Alle' },
];

const GROUPS = [
  { id: 'ansvarlig', label: 'Ansvarlig', icon: 'person-outline' },
  { id: 'frist', label: 'Frist', icon: 'calendar-outline' },
  { id: 'mote', label: 'Møte', icon: 'people-outline' },
];

function dueBucket(action, today) {
  if (action.done) return ['5', 'Utført'];
  if (!action.due) return ['4', 'Uten frist'];
  const d = daysBetween(today, action.due);
  if (d < 0) return ['0', 'Forfalt'];
  if (d <= 7) return ['1', 'Neste 7 dager'];
  if (d <= 31) return ['2', 'Neste 30 dager'];
  return ['3', 'Senere'];
}

function DuePill({ action, today }) {
  if (!action.due) return <Pill label="Ingen frist" tone="muted" small />;
  const d = daysBetween(today, action.due);
  if (action.done) return <Pill label={shortDate(action.due)} tone="muted" small icon="calendar-outline" />;
  if (d < 0) return <Pill label={`${shortDate(action.due)} · ${-d} d over`} tone="danger" small icon="alert-circle" />;
  if (d === 0) return <Pill label="I dag" tone="warn" small icon="time-outline" />;
  if (d <= 7) return <Pill label={shortDate(action.due)} tone="warn" small icon="calendar-outline" />;
  return <Pill label={shortDate(action.due)} tone="muted" small icon="calendar-outline" />;
}

export default function FollowUpView({ meetings, today, viewer, onOpen, width }) {
  const colors = useColors();
  const [filter, setFilter] = useState('apne');
  const [group, setGroup] = useState('ansvarlig');
  const [query, setQuery] = useState('');
  const phone = width < 640;
  const all = useMemo(() => collectActions(meetings, today), [meetings, today]);
  const counts = actionCounts(all);
  const myName = String(viewer?.name || '').toLowerCase();

  const rows = all.filter((a) => {
    if (filter === 'apne' && a.done) return false;
    if (filter === 'forfalt' && !a.overdue) return false;
    if (filter === 'utfort' && !a.done) return false;
    if (filter === 'mine' && (a.done || String(a.assigneeName).toLowerCase() !== myName)) return false;
    const q = query.trim().toLowerCase();
    if (q && !`${a.text} ${a.assigneeName} ${a.meetingTitle} ${a.itemTitle} ${a.projectName}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const groups = useMemo(() => {
    const map = new Map();
    for (const a of rows) {
      let key;
      let label;
      if (group === 'ansvarlig') {
        key = a.assigneeName || '~';
        label = a.assigneeName || 'Uten ansvarlig';
      } else if (group === 'frist') {
        [key, label] = dueBucket(a, today);
      } else {
        key = a.seriesId || a.meetingId;
        label = a.meetingTitle;
      }
      if (!map.has(key)) map.set(key, { key, label, rows: [] });
      map.get(key).rows.push(a);
    }
    return [...map.values()].sort((x, y) => x.key.localeCompare(y.key, 'nb'));
  }, [rows, group, today]);

  if (!all.length) {
    return (
      <Card>
        <Empty
          icon="flag-outline"
          title="Ingen oppfølgingspunkter ennå"
          text="Oppfølgingspunkter legges til på punktene i et møte, med ansvarlig og frist. De samles her, og åpne punkter følger med til neste møte i serien."
        />
      </Card>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      <View style={[styles.stats, phone && { flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'stretch' }]}>
        <Stat icon="flag-outline" value={counts.open} label="Åpne" tone="brand" onPress={() => setFilter('apne')} />
        <Stat icon="alert-circle-outline" value={counts.overdue} label="Har passert fristen" tone={counts.overdue ? 'danger' : 'muted'} onPress={() => setFilter('forfalt')} />
        <Stat icon="time-outline" value={counts.dueSoon} label="Forfaller innen 7 dager" tone={counts.dueSoon ? 'warn' : 'muted'} />
        <Stat icon="checkmark-done-outline" value={counts.done} label="Utført" tone="success" onPress={() => setFilter('utfort')} />
      </View>
      <View style={[styles.toolbar, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Choice options={FILTERS} value={filter} onChange={setFilter} small nativeIDPrefix="followup-filter" />
        <View style={styles.rowWrap}>
          <Text style={{ fontSize: 12.5, color: colors.muted }}>Gruppér etter</Text>
          <Choice options={GROUPS} value={group} onChange={setGroup} small nativeIDPrefix="followup-group" />
          <SearchBox value={query} onChange={setQuery} placeholder="Søk i oppfølgingspunkter" style={{ flex: 1, minWidth: 200 }} />
        </View>
      </View>

      {!rows.length ? (
        <Card><Empty icon="checkmark-done-circle-outline" title="Ingenting her" text="Velg et annet filter for å se flere oppfølgingspunkter." /></Card>
      ) : groups.map((g) => (
        <View key={g.key} style={{ gap: 6 }}>
          <SectionHead title={g.label} count={g.rows.length} />
          <View style={[styles.list, { borderColor: colors.line, backgroundColor: colors.card }]}>
            {g.rows.map((a, i) => (
              <Pressable
                key={a.id}
                nativeID={`followup-${a.id}`}
                onPress={() => onOpen(a.meetingId, 'agenda')}
                accessibilityRole="button"
                accessibilityLabel={`${a.text}. Åpne møtet`}
                style={({ hovered }) => [styles.item, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }, hovered && { backgroundColor: colors.sunken }]}
              >
                <View style={[styles.state, { borderColor: a.done ? '#16a34a' : (a.overdue ? '#ef4444' : colors.line), backgroundColor: a.done ? '#16a34a' : 'transparent' }]}>
                  {a.done ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <Text style={[{ fontSize: 14.5, color: colors.ink, fontWeight: '600' }, a.done && { color: colors.muted, textDecorationLine: 'line-through' }]}>{a.text}</Text>
                  <Text style={{ fontSize: 12.5, color: colors.muted }} numberOfLines={1}>
                    {[a.meetingTitle + (a.meetingNumber ? ` · møte ${a.meetingNumber}` : ''), `punkt ${a.itemNumber} ${a.itemTitle}`, a.originNumber && a.originNumber !== a.meetingNumber ? `registrert i møte ${a.originNumber}` : ''].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {!phone && group !== 'ansvarlig' ? (
                  <View style={styles.who}>
                    {a.assigneeName ? <Avatar name={a.assigneeName} size={24} /> : null}
                    <Text style={{ fontSize: 13, color: a.assigneeName ? colors.ink : colors.muted }} numberOfLines={1}>{a.assigneeName || 'Uten ansvarlig'}</Text>
                  </View>
                ) : null}
                <DuePill action={a} today={today} />
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  toolbar: { borderWidth: 1, borderRadius: 14, padding: 10, gap: 10 },
  rowWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  list: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  state: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 170 },
});
