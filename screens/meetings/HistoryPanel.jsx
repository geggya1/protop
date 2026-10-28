/**
 * Historikk: de andre møtene i serien, utsendelser og endringslogg.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import {
  agendaStats, meetingPhase, recurrenceLabel, seriesMeetings, shortDate, timeRange,
} from '../../src/meetings/model';
import { Btn, Card, DateTile, Empty, PhasePill, SectionHead } from './meetingUi';

function stamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' });
}

const KIND = {
  innkalling: { icon: 'paper-plane-outline', label: 'Innkalling', color: '#0ea5e9' },
  referat: { icon: 'mail-open-outline', label: 'Referat', color: '#16a34a' },
  avlysning: { icon: 'close-circle-outline', label: 'Avlysning', color: '#dc2626' },
};

export default function HistoryPanel({ meeting, meetings, today, onOpen, onCreateNext, canCreate, width }) {
  const colors = useColors();
  const series = meeting.seriesId ? seriesMeetings(meetings, meeting.seriesId) : [];
  const hasNext = series.some((m) => (m.number || 0) > (meeting.number || 0));
  const wide = width >= 900;
  return (
    <View style={[styles.split, !wide && { flexDirection: 'column' }]}>
      <View style={{ flex: 1.2, gap: 10, minWidth: 0, width: wide ? undefined : '100%' }}>
        <SectionHead
          title={meeting.seriesId ? `Møteserien · ${recurrenceLabel(meeting.recurrence, meeting.date)}` : 'Møteserie'}
          count={series.length || null}
          right={canCreate && !hasNext && meeting.status !== 'avlyst' ? (
            <Btn small label={`Lag møte ${(meeting.number || 1) + 1}`} icon="add" tone="soft" onPress={() => onCreateNext(meeting)} nativeID="history-next" />
          ) : null}
        />
        {series.length ? (
          <View style={[styles.list, { borderColor: colors.line, backgroundColor: colors.card }]}>
            {series.slice().reverse().map((m, i) => {
              const current = m.id === meeting.id;
              const stats = agendaStats(m);
              return (
                <Pressable
                  key={m.id}
                  onPress={() => !current && onOpen(m.id)}
                  disabled={current}
                  accessibilityRole="button"
                  style={({ hovered }) => [styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }, current && { backgroundColor: `${colors.brand}0c` }, hovered && !current && { backgroundColor: colors.sunken }]}
                >
                  <DateTile date={m.date} />
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Text style={{ fontSize: 14.5, fontWeight: '700', color: colors.ink }}>Møte {m.number || '–'}</Text>
                      <PhasePill phase={meetingPhase(m, today)} small />
                      {current ? <Text style={{ fontSize: 12, color: colors.brand, fontWeight: '700' }}>Dette møtet</Text> : null}
                    </View>
                    <Text style={{ fontSize: 12.5, color: colors.muted }}>
                      {m.date ? `${shortDate(m.date)} ${timeRange(m.start, m.end)}` : 'Uten dato'} · {stats.decisions} beslutninger · {stats.openActions} åpne punkter
                    </Text>
                  </View>
                  {!current ? <Ionicons name="chevron-forward" size={17} color={colors.muted} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Card>
            <Empty
              icon="repeat-outline"
              title="Enkeltmøte"
              text="Lag neste møte fra dette, så blir det en serie med løpenummer. Dagsordenen og åpne oppfølgingspunkter følger med."
              action={canCreate && meeting.status !== 'avlyst' ? <Btn label="Lag neste møte" icon="add" tone="soft" onPress={() => onCreateNext(meeting)} /> : null}
            />
          </Card>
        )}
      </View>
      <View style={{ flex: 1, gap: 10, minWidth: 0, width: wide ? undefined : '100%' }}>
        <SectionHead title="Utsendelser" count={meeting.deliveries.length || null} />
        <View style={[styles.list, { borderColor: colors.line, backgroundColor: colors.card }]}>
          {meeting.deliveries.length ? meeting.deliveries.slice().reverse().map((d, i) => {
            const k = KIND[d.kind] || KIND.innkalling;
            return (
              <View key={`${d.at}-${i}`} style={[styles.logRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
                <Ionicons name={k.icon} size={17} color={k.color} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13.5, color: colors.ink, fontWeight: '600' }}>
                    {k.label}{d.revision > 1 ? ` (revisjon ${d.revision})` : ''}{d.channel === 'manuell' ? ' · markert manuelt' : ` · ${d.to.length} mottaker${d.to.length === 1 ? '' : 'e'}`}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={2}>{[stamp(d.at), d.byName, d.to.slice(0, 4).join(', ') + (d.to.length > 4 ? ' …' : '')].filter(Boolean).join(' · ')}</Text>
                </View>
              </View>
            );
          }) : <Text style={{ padding: 14, color: colors.muted, fontSize: 13 }}>Ingenting er sendt ennå.</Text>}
        </View>
        <SectionHead title="Endringslogg" count={meeting.log.length || null} />
        <View style={[styles.list, { borderColor: colors.line, backgroundColor: colors.card }]}>
          {meeting.log.length ? meeting.log.slice().reverse().slice(0, 30).map((row, i) => (
            <View key={`${row.at}-${i}`} style={[styles.logRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
              <View style={[styles.dot, { backgroundColor: colors.brand }]} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 13.5, color: colors.ink }}>{row.text}</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>{[stamp(row.at), row.byName].filter(Boolean).join(' · ')}</Text>
              </View>
            </View>
          )) : <Text style={{ padding: 14, color: colors.muted, fontSize: 13 }}>Ingen endringer registrert.</Text>}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  split: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  list: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  logRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  dot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
});
