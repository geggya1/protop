/**
 * Møteoversikten: neste møte, det som venter, faner med tall, filtre og listen
 * gruppert per måned. Møteserier vises med neste møte og knapp for å lage det.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import OptionPicker from '../../components/OptionPicker';
import {
  LIST_TABS,
  actionCounts,
  agendaStats,
  collectActions,
  daysBetween,
  groupByMonth,
  inListTab,
  isParticipant,
  listCounts,
  longDate,
  meetingMatches,
  meetingPhase,
  nextMeeting,
  recurrenceLabel,
  seriesOverview,
  shortDate,
  sortMeetings,
  timeRange,
} from '../../src/meetings/model';
import { MEETING_TYPES, meetingType } from '../../src/meetings/templates';
import {
  AvatarStack,
  Btn,
  Card,
  DateTile,
  Empty,
  NumberChip,
  PhasePill,
  Pill,
  SearchBox,
  SectionHead,
  SegTabs,
  Stat,
  TypeIcon,
} from './meetingUi';

function relativeDay(date, today) {
  const diff = daysBetween(today, date);
  if (diff == null) return '';
  if (diff === 0) return 'I dag';
  if (diff === 1) return 'I morgen';
  if (diff === -1) return 'I går';
  if (diff > 1 && diff < 7) return `Om ${diff} dager`;
  if (diff < -1 && diff > -7) return `${-diff} dager siden`;
  return '';
}

function NextMeetingHero({ meeting, today, onOpen, onStart, canStart, wide }) {
  const colors = useColors();
  const type = meetingType(meeting.typeId);
  const rel = relativeDay(meeting.date, today);
  const isToday = meeting.date === today;
  const stats = agendaStats(meeting);
  return (
    <View nativeID="meetings-next" style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <View style={[styles.heroBand, { backgroundColor: type.color }]} />
      <View style={[styles.heroBody, !wide && { flexDirection: 'column', alignItems: 'flex-start' }]}>
        <DateTile date={meeting.date} size="lg" highlight={isToday} />
        <Pressable
          onPress={() => onOpen(meeting.id)}
          accessibilityRole="link"
          accessibilityLabel={`Neste møte: ${meeting.title}`}
          style={{ flex: 1, minWidth: 0, gap: 6, alignSelf: 'stretch' }}
        >
          <View style={styles.rowWrap}>
            <Text style={[styles.kicker, { color: type.color }]}>{rel ? `${rel.toUpperCase()} · ` : ''}NESTE MØTE</Text>
            <PhasePill phase={meetingPhase(meeting, today)} small />
          </View>
          <View style={styles.rowWrap}>
            <Text style={[styles.heroTitle, { color: colors.ink }]} numberOfLines={2}>{meeting.title}</Text>
            <NumberChip number={meeting.number} />
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={14} color={colors.muted} />
            <Text style={[styles.meta, { color: colors.muted }]}>{longDate(meeting.date)} {timeRange(meeting.start, meeting.end)}</Text>
          </View>
          {meeting.location || meeting.videoUrl ? (
            <View style={styles.metaRow}>
              <Ionicons name={meeting.location ? 'location-outline' : 'videocam-outline'} size={14} color={colors.muted} />
              <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>{meeting.location || 'Videomøte'}</Text>
            </View>
          ) : null}
          <View style={[styles.rowWrap, { marginTop: 4 }]}>
            <AvatarStack people={meeting.participants.filter((p) => p.role !== 'kopi')} max={5} />
            <Text style={[styles.meta, { color: colors.muted }]}>
              {meeting.participants.filter((p) => p.role !== 'kopi').length} deltakere · {stats.items} punkter{stats.openActions ? ` · ${stats.openActions} åpne oppfølgingspunkter` : ''}
            </Text>
          </View>
        </Pressable>
        <View style={[styles.heroActions, !wide && { flexDirection: 'row', alignSelf: 'stretch' }]}>
          {isToday && canStart ? (
            <Btn label="Start møtet" icon="play" tone="primary" onPress={() => onStart(meeting.id)} nativeID="meetings-next-start" />
          ) : null}
          <Btn label="Åpne" icon="arrow-forward" iconRight tone={isToday && canStart ? 'ghost' : 'primary'} onPress={() => onOpen(meeting.id)} />
        </View>
      </View>
    </View>
  );
}

function MeetingRow({ meeting, today, onOpen, compact, viewer }) {
  const colors = useColors();
  const phase = meetingPhase(meeting, today);
  const stats = agendaStats(meeting);
  const people = meeting.participants.filter((p) => p.role !== 'kopi');
  const mine = viewer && isParticipant(meeting, viewer);
  const leader = meeting.participants.find((p) => p.role === 'leder');
  const muted = phase === 'avlyst';
  return (
    <Pressable
      nativeID={`meeting-row-${meeting.id}`}
      onPress={() => onOpen(meeting.id)}
      accessibilityRole="button"
      accessibilityLabel={`${meeting.title}${meeting.number ? `, møte ${meeting.number}` : ''}`}
      style={({ hovered }) => [
        styles.row,
        { backgroundColor: colors.card, borderColor: hovered ? `${colors.brand}88` : colors.line },
        hovered && styles.rowHover,
      ]}
    >
      <DateTile date={meeting.date} highlight={phase === 'idag' || phase === 'pagar'} muted={muted} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={styles.rowWrap}>
          <Text style={[styles.rowTitle, { color: colors.ink }, muted && styles.strike]} numberOfLines={1}>{meeting.title}</Text>
          <NumberChip number={meeting.number} />
          <PhasePill phase={phase} small />
          {meeting.visibility === 'deltakere' ? <Pill label="Lukket" icon="lock-closed" small tone="muted" /> : null}
          {mine && leader && viewer && (leader.uid === viewer.uid || leader.email === viewer.email) ? <Pill label="Møteleder" icon="ribbon" small tone="brand" /> : null}
        </View>
        <View style={styles.metaRow}>
          <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>
            {[meetingType(meeting.typeId).label, meeting.date ? `${shortDate(meeting.date)} ${timeRange(meeting.start, meeting.end)}`.trim() : 'Ingen dato satt']
              .filter(Boolean).join(' · ')}
          </Text>
        </View>
        {meeting.location || meeting.projectName ? (
          <View style={styles.rowWrap}>
            {meeting.location ? (
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={13} color={colors.muted} />
                <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>{meeting.location}</Text>
              </View>
            ) : null}
            {meeting.projectName ? (
              <View style={styles.metaRow}>
                <Ionicons name="business-outline" size={13} color={colors.muted} />
                <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>{[meeting.projectNumber, meeting.projectName].filter(Boolean).join(' ')}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      {!compact ? (
        <View style={styles.rowSide}>
          {stats.openActions ? (
            <View style={[styles.counter, { backgroundColor: '#fef3c7' }]} accessibilityLabel={`${stats.openActions} åpne oppfølgingspunkter`}>
              <Ionicons name="flag" size={12} color="#92400e" />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#92400e' }}>{stats.openActions}</Text>
            </View>
          ) : null}
          {stats.decisions ? (
            <View style={[styles.counter, { backgroundColor: '#dcfce7' }]} accessibilityLabel={`${stats.decisions} beslutninger`}>
              <Ionicons name="checkmark-done" size={12} color="#166534" />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#166534' }}>{stats.decisions}</Text>
            </View>
          ) : null}
          <AvatarStack people={people} max={3} />
          <Text style={[styles.meta, { color: colors.muted, width: 78 }]}>{people.length} deltaker{people.length === 1 ? '' : 'e'}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      )}
    </Pressable>
  );
}

function SeriesCard({ series, onOpen, onNext, canCreate }) {
  const colors = useColors();
  const type = meetingType(series.typeId);
  return (
    <View style={[styles.series, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <View style={styles.rowWrap}>
        <TypeIcon typeId={series.typeId} size={34} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14.5, fontWeight: '700', color: colors.ink }} numberOfLines={1}>{series.title}</Text>
          <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>{recurrenceLabel(series.recurrence, series.latest.date)} · {series.count} møter</Text>
        </View>
      </View>
      <View style={{ gap: 4 }}>
        <Text style={[styles.meta, { color: colors.muted }]}>
          Sist: {series.last ? `møte ${series.last.number}, ${shortDate(series.last.date)}` : 'ingen holdt ennå'}
        </Text>
        <Text style={[styles.meta, { color: series.next ? colors.ink : colors.muted }]}>
          Neste: {series.next ? `møte ${series.next.number}, ${shortDate(series.next.date)}` : 'ikke planlagt'}
        </Text>
      </View>
      <View style={[styles.rowWrap, { marginTop: 'auto' }]}>
        <Btn small label="Åpne siste" tone="ghost" onPress={() => onOpen((series.next || series.latest).id)} />
        {canCreate && !series.next ? (
          <Btn small label={`Lag møte ${(series.latest.number || 0) + 1}`} icon="add" tone="soft" onPress={() => onNext(series.latest)} nativeID={`series-next-${series.id}`} />
        ) : null}
      </View>
      <View style={[styles.seriesBar, { backgroundColor: type.color }]} />
    </View>
  );
}

export default function MeetingList({
  meetings, today, viewer, projects = [], canCreate, onOpen, onStart, onNew, onNext, onFollowUp, width,
}) {
  const colors = useColors();
  const [tab, setTab] = useState('kommende');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [project, setProject] = useState('');
  const [mine, setMine] = useState(false);
  const wide = width >= 900;
  const phone = width < 640;

  const filtered = useMemo(() => meetings.filter((m) => (
    (!type || m.typeId === type)
    && (!project || m.projectId === project)
    && (!mine || isParticipant(m, viewer))
    && meetingMatches(m, query)
  )), [meetings, type, project, mine, query, viewer]);

  const counts = useMemo(() => listCounts(filtered, today), [filtered, today]);
  const rows = useMemo(
    () => sortMeetings(filtered.filter((m) => inListTab(m, tab, today)), tab),
    [filtered, tab, today],
  );
  const groups = useMemo(() => groupByMonth(rows), [rows]);
  const next = useMemo(() => nextMeeting(meetings.filter((m) => isParticipant(m, viewer)), today) || nextMeeting(meetings, today), [meetings, viewer, today]);
  const actions = useMemo(() => actionCounts(collectActions(meetings, today)), [meetings, today]);
  const waiting = useMemo(() => meetings.filter((m) => meetingPhase(m, today) === 'referat').length, [meetings, today]);
  const thisWeek = useMemo(() => meetings.filter((m) => {
    const d = daysBetween(today, m.date);
    return d != null && d >= 0 && d < 7 && m.status !== 'avlyst';
  }).length, [meetings, today]);
  const series = useMemo(() => seriesOverview(meetings, today).filter((s) => s.latest.status !== 'avlyst').slice(0, 6), [meetings, today]);

  const typeOptions = useMemo(() => MEETING_TYPES
    .filter((t) => meetings.some((m) => m.typeId === t.id))
    .map((t) => ({ id: t.id, label: t.label, icon: t.icon })), [meetings]);
  const projectOptions = useMemo(() => {
    const seen = new Map();
    for (const m of meetings) if (m.projectId) seen.set(m.projectId, [m.projectNumber, m.projectName].filter(Boolean).join(' '));
    for (const p of projects) if (!seen.has(p.id)) seen.set(p.id, [p.number, p.name].filter(Boolean).join(' '));
    return [...seen.entries()].map(([id, label]) => ({ id, label }));
  }, [meetings, projects]);

  if (!meetings.length) {
    return (
      <Card style={{ marginTop: 8 }}>
        <Empty
          icon="people-circle-outline"
          title="Ingen møter ennå"
          text="Start fra en ferdig møtemal, et skjema fra Skjemabygger, la AI sette opp dagsordenen, eller begynn blankt. Faste møter får løpenummer, og åpne oppfølgingspunkter følger med til neste møte."
          action={canCreate ? <Btn label="Nytt møte" icon="add" tone="primary" onPress={() => onNew()} nativeID="meetings-empty-new" /> : null}
        />
      </Card>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      {next ? (
        <NextMeetingHero meeting={next} today={today} onOpen={onOpen} onStart={onStart} canStart={canCreate} wide={wide} />
      ) : null}

      <View style={[styles.stats, phone && { flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'stretch' }]}>
        <Stat
          icon="document-text-outline"
          value={waiting}
          label="Venter på referat"
          tone={waiting ? 'warn' : 'muted'}
          hint={waiting ? 'Ferdigstill og send' : 'Alt er ferdigstilt'}
          onPress={waiting ? () => setTab('referat') : undefined}
          nativeID="meetings-stat-referat"
        />
        <Stat
          icon="flag-outline"
          value={actions.open}
          label="Åpne oppfølgingspunkter"
          tone={actions.overdue ? 'danger' : 'brand'}
          hint={actions.overdue ? `${actions.overdue} har passert fristen` : (actions.dueSoon ? `${actions.dueSoon} forfaller denne uken` : '')}
          onPress={onFollowUp}
          nativeID="meetings-stat-actions"
        />
        <Stat icon="calendar-outline" value={thisWeek} label="Møter de neste 7 dagene" tone="info" onPress={() => setTab('kommende')} />
      </View>

      <View style={[styles.toolbar, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <SegTabs
          nativeIDPrefix="meetings-tab"
          value={tab}
          onChange={setTab}
          tabs={LIST_TABS.map((t) => ({ ...t, count: counts[t.id], alert: t.id === 'referat' && counts.referat > 0 }))}
        />
        <View style={[styles.filters, phone && { flexDirection: 'column', alignItems: 'stretch' }]}>
          {typeOptions.length > 1 ? (
            <View style={{ minWidth: 170 }}>
              <OptionPicker options={typeOptions} value={type} onChange={setType} placeholder="Alle typer" clearLabel="Alle typer" small chipLimit={0} title="Møtetype" />
            </View>
          ) : null}
          {projectOptions.length ? (
            <View style={{ minWidth: 170 }}>
              <OptionPicker options={projectOptions} value={project} onChange={setProject} placeholder="Alle prosjekter" clearLabel="Alle prosjekter" small chipLimit={0} searchable title="Prosjekt" />
            </View>
          ) : null}
          <Pressable
            nativeID="meetings-mine"
            onPress={() => setMine((v) => !v)}
            accessibilityRole="switch"
            accessibilityState={{ checked: mine }}
            style={[styles.toggle, { borderColor: mine ? colors.brand : colors.line, backgroundColor: mine ? `${colors.brand}12` : colors.card }]}
          >
            <Ionicons name={mine ? 'person' : 'person-outline'} size={14} color={mine ? colors.brand : colors.muted} />
            <Text style={{ fontSize: 13, color: mine ? colors.brand : colors.ink, fontWeight: mine ? '700' : '500' }}>Mine møter</Text>
          </Pressable>
          <SearchBox value={query} onChange={setQuery} placeholder="Søk i møter, punkter og deltakere" style={{ flex: 1, minWidth: 220 }} nativeID="meetings-search" />
        </View>
      </View>

      {!rows.length ? (
        <Card>
          <Empty
            icon={tab === 'referat' ? 'checkmark-done-circle-outline' : 'search-outline'}
            title={tab === 'referat' && !query ? 'Ingen møter venter på referat' : 'Ingen møter her'}
            text={query ? 'Prøv et annet søk eller fjern filtrene.' : 'Velg en annen fane for å se flere møter.'}
          />
        </Card>
      ) : groups.map((group) => (
        <View key={group.key} style={{ gap: 8 }}>
          <SectionHead title={group.label} count={group.meetings.length} />
          {group.meetings.map((m) => (
            <MeetingRow key={m.id} meeting={m} today={today} onOpen={onOpen} compact={!wide} viewer={viewer} />
          ))}
        </View>
      ))}

      {series.length ? (
        <View style={{ gap: 8, marginTop: 10 }}>
          <SectionHead title="Møteserier" count={series.length} />
          <View style={styles.seriesGrid}>
            {series.map((s) => (
              <SeriesCard key={s.id} series={s} onOpen={onOpen} onNext={onNext} canCreate={canCreate} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderWidth: 1, borderRadius: 18, overflow: 'hidden', shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } },
  heroBand: { height: 4 },
  heroBody: { flexDirection: 'row', alignItems: 'center', gap: 18, padding: 18 },
  heroTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  heroActions: { gap: 8, alignItems: 'stretch', minWidth: 150 },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  rowWrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 },
  meta: { fontSize: 13 },
  stats: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  toolbar: { borderWidth: 1, borderRadius: 14, padding: 10, gap: 10 },
  filters: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, minHeight: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: 14, padding: 12 },
  rowHover: { shadowColor: '#0f172a', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
  rowTitle: { fontSize: 15.5, fontWeight: '700', flexShrink: 1 },
  strike: { textDecorationLine: 'line-through' },
  rowSide: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  seriesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  series: { flexGrow: 1, flexBasis: 260, maxWidth: 420, borderWidth: 1, borderRadius: 14, padding: 14, gap: 10, overflow: 'hidden', minHeight: 150 },
  seriesBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
});
