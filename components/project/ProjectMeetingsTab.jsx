/**
 * Møter på prosjektet: møtene som er knyttet til prosjektet, åpne oppfølgingspunkter,
 * og snarvei til nytt møte. Selve møtet åpnes i Møter.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import {
  agendaStats, canSeeMeeting, collectActions, meetingPhase, shortDate, sortMeetings, timeRange, todayOslo,
} from '../../src/meetings/model';
import { createMeetingStore } from '../../src/meetings/storage';
import { meetingType } from '../../src/meetings/templates';
import {
  Btn, DateTile, Empty, NumberChip, PhasePill, Pill, SectionHead,
} from '../../screens/meetings/meetingUi';

export default function ProjectMeetingsTab({ familyId, project, colors, uid }) {
  const { requestShellTab, user } = useApp();
  const access = useCompanyAccess();
  const [meetings, setMeetings] = useState(null);
  const today = todayOslo();

  useEffect(() => {
    if (!familyId) return undefined;
    const store = createMeetingStore(familyId, { uid });
    return store.watchMeetings((rows) => setMeetings(rows), () => setMeetings([]));
  }, [familyId, uid]);

  const viewer = { uid, email: user?.email || '', admin: access.canAdmin('meetings') };
  const rows = useMemo(() => sortMeetings(
    (meetings || []).filter((m) => m.projectId === project.id && canSeeMeeting(m, viewer)),
    'alle',
  ), [meetings, project.id, viewer.uid, viewer.admin]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = useMemo(() => collectActions(rows, today).filter((a) => !a.done), [rows, today]);
  const canCreate = access.canEdit('meetings');
  const openMeeting = (meetingId) => requestShellTab?.('moter', 'oversikt', { type: 'openMeeting', meetingId, nonce: Date.now() });

  return (
    <View style={{ gap: 12 }} nativeID="project-meetings">
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>Møter i prosjektet</Text>
          <Text style={{ fontSize: 13, color: colors.muted }}>Byggemøter, oppstart og andre møter knyttet til {project.name}.</Text>
        </View>
        {canCreate ? (
          <Btn
            label="Nytt møte"
            icon="add"
            tone="primary"
            nativeID="project-meetings-new"
            onPress={() => requestShellTab?.('moter', 'oversikt', { type: 'newMeeting', projectId: project.id, nonce: Date.now() })}
          />
        ) : null}
      </View>

      {meetings == null ? <Text style={{ color: colors.muted }}>Henter møtene …</Text> : null}
      {meetings && !rows.length ? (
        <Empty icon="people-circle-outline" title="Ingen møter på prosjektet" text="Møter som knyttes til prosjektet, vises her med status og åpne oppfølgingspunkter." />
      ) : null}

      {open.length ? (
        <View style={{ gap: 6 }}>
          <SectionHead title="Åpne oppfølgingspunkter" count={open.length} />
          {open.slice(0, 6).map((a) => (
            <Pressable key={a.id} onPress={() => openMeeting(a.meetingId)} style={({ hovered }) => [styles.action, { borderColor: colors.line, backgroundColor: hovered ? colors.sunken : colors.card }]}>
              <Ionicons name="flag" size={14} color={a.overdue ? '#dc2626' : '#d97706'} />
              <Text style={{ flex: 1, color: colors.ink, fontSize: 13.5 }} numberOfLines={1}>{a.text}</Text>
              <Text style={{ color: colors.muted, fontSize: 12.5 }}>{a.assigneeName || 'Uten ansvarlig'}</Text>
              {a.due ? <Pill label={shortDate(a.due)} tone={a.overdue ? 'danger' : 'muted'} small /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {rows.length ? <SectionHead title="Møter" count={rows.length} /> : null}
      {rows.map((m) => {
        const stats = agendaStats(m);
        return (
          <Pressable
            key={m.id}
            nativeID={`project-meeting-${m.id}`}
            onPress={() => openMeeting(m.id)}
            accessibilityRole="button"
            style={({ hovered }) => [styles.row, { borderColor: hovered ? colors.brand : colors.line, backgroundColor: colors.card }]}
          >
            <DateTile date={m.date} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 14.5, fontWeight: '700', color: colors.ink }} numberOfLines={1}>{m.title}</Text>
                <NumberChip number={m.number} />
                <PhasePill phase={meetingPhase(m, today)} small />
              </View>
              <Text style={{ fontSize: 12.5, color: colors.muted }} numberOfLines={1}>
                {[meetingType(m.typeId).label, m.date ? `${shortDate(m.date)} ${timeRange(m.start, m.end)}` : 'Uten dato', `${stats.decisions} beslutninger`, `${stats.openActions} åpne punkter`].join(' · ')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={colors.muted} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 10 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
});
