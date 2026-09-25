import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform,
  useWindowDimensions, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../src/theme';
import { colorForFamilyEvent } from '../src/utils/calendarColors';
import { useApp } from '../src/context/AppContext';
import { useUnread } from '../src/context/NotificationContext';
import { useWeather } from '../src/hooks/useWeather';
import { useGreetingDayStatus } from '../src/hooks/useGreetingDayStatus';
import { useDeskHomeExternalEvents } from '../src/hooks/useDeskHomeExternalEvents';
import HelpTarget from './HelpTarget';
import { firstNameFromProfile, formatGreetingDate } from '../src/utils/timeGreeting';
import { roundTemp } from '../src/utils/weather';
import WeatherPeriodsView from './WeatherPeriodsView';
import LiveHomeWidgets from './LiveHomeWidgets';
import { isDoneOn } from '../src/utils/todos';
import { addDays, dateKey } from '../src/utils/dates';
import {
  deskGreetingEmoji,
  deskGreetingTitle,
  eventSourceHint,
  mergeDeskDayEvents,
  taskFocusMeta,
} from '../src/utils/deskHome';

const R = 16;

function Card({ children, style, onPress, fill }) {
  const inner = (
    <View style={[styles.card, fill && styles.cardFill, style]}>{children}</View>
  );
  if (!onPress) return inner;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      style={fill ? styles.cardFill : { minWidth: 0 }}
    >
      {inner}
    </TouchableOpacity>
  );
}

function eventDotColor(ev, members) {
  return colorForFamilyEvent(ev, members);
}

function weatherDetailBits(day, current) {
  if (!day && !current) return [];
  const bits = [];
  const label = current?.label || day?.label;
  if (label) bits.push(label);
  if (day?.tempRange) bits.push(day.tempRange);
  if (current && Number.isFinite(Number(current.temp))) {
    bits.push(`Nå ${roundTemp(current.temp)}°`);
  }
  if (current && Number.isFinite(Number(current.feelsLike)) && current.feelsLike !== current.temp) {
    bits.push(`føles som ${roundTemp(current.feelsLike)}°`);
  }
  if (day?.precipMm >= 0.5) bits.push(`${String(day.precipMm).replace('.', ',')} mm nedbør`);
  else if (day?.precipProb >= 40) bits.push(`${day.precipProb} % sjanse for nedbør`);
  else if (day) bits.push('Opphold');
  const wind = current?.windMs ?? day?.windMs;
  if (Number.isFinite(Number(wind))) bits.push(`${wind} m/s vind`);
  if (Number.isFinite(Number(current?.humidity))) bits.push(`${roundTemp(current.humidity)} % fukt`);
  return bits;
}

function WeatherDayBlock({ label, day, current, selected, onPress }) {
  const bits = weatherDetailBits(day, current);
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.weatherDay, selected && styles.weatherDayOn]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={styles.forecastLbl}>{label}</Text>
      <View style={styles.weatherDayHead}>
        <Ionicons name={current?.icon || day?.icon || 'partly-sunny'} size={22} color={colors.brand} />
        <Text style={styles.weatherDayTemp}>
          {current && Number.isFinite(Number(current.temp))
            ? `${roundTemp(current.temp)}°`
            : (day?.tempRange || '—')}
        </Text>
      </View>
      {bits.map((b) => (
        <Text key={b} style={styles.weatherDayBit}>{b}</Text>
      ))}
    </TouchableOpacity>
  );
}

export default function DeskHomeDashboard({
  widgetData,
  familyEventsToday = [],
  familyEventsTomorrow = [],
  onOpenEvent,
  onCreate,
  onTab,
  onNotify,
  onToggleTask,
  onUpgrade,
}) {
  const { height } = useWindowDimensions();
  const short = height < 860;
  const { activeProfile, kids, parents, uid, members, isParent, familyId } = useApp();
  const { unreadTotal } = useUnread();
  const { place, forecast } = useWeather();
  const day = useGreetingDayStatus({ enabled: true });
  const now = useMemo(() => new Date(), []);
  const todayKey = dateKey(now);
  const tomorrow = useMemo(() => addDays(now, 1), [now]);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [weatherFocus, setWeatherFocus] = useState('today');
  const [externalRefresh, setExternalRefresh] = useState(0);
  useFocusEffect(useCallback(() => setExternalRefresh((n) => n + 1), []));
  const externalEvents = useDeskHomeExternalEvents({
    enabled: !!(isParent && uid),
    uid,
    familyId,
    todayKey,
    refreshKey: externalRefresh,
  });
  const eventsToday = useMemo(
    () => mergeDeskDayEvents(familyEventsToday, externalEvents, now),
    [familyEventsToday, externalEvents, now],
  );
  const eventsTomorrow = useMemo(
    () => mergeDeskDayEvents(familyEventsTomorrow, externalEvents, tomorrow),
    [familyEventsTomorrow, externalEvents, tomorrow],
  );
  const firstNameMe = firstNameFromProfile(activeProfile, 'du');
  const dateLabel = formatGreetingDate(now);
  const temp = forecast?.current?.temp ?? forecast?.today?.temp;
  const placeName = place?.name || '';
  const weatherBit = Number.isFinite(Number(temp))
    ? `${roundTemp(temp)}° ${placeName || ''}`.trim()
    : placeName;
  const weatherIcon = forecast?.current?.icon || forecast?.today?.icon || 'partly-sunny';
  const note = widgetData?.notes?.items?.[0];
  const openTasks = day.tasks?.openItems || [];
  const doneTasks = (day.tasks?.items || [])
    .filter((t) => t && !openTasks.some((o) => o.id === t.id) && isDoneOn(t, todayKey))
    .slice(0, 2);
  const overdueTasks = openTasks.filter((t) => t._overdue);
  const activeKids = (kids || []).filter((k) => k.active !== false);
  const activeParents = (parents || []).filter((p) => p.active !== false);
  const allMembers = members?.length
    ? members
    : [...activeParents.map((p) => ({ ...p, id: p.uid || p.id, role: 'parent' })), ...activeKids];

  const openEvent = (ev) => {
    if (!ev) {
      onTab?.('plan');
      return;
    }
    if (ev.readOnly || ev.private || ev.connectionId) {
      onTab?.('plan');
      return;
    }
    onOpenEvent?.(ev);
  };

  const openWeather = (focus = 'today') => {
    setWeatherFocus(focus);
    setWeatherOpen(true);
  };

  return (
    <View style={[styles.page, short && styles.pageShort]}>
      <View style={styles.hero}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.hello, short && styles.helloShort]} numberOfLines={1}>
            {deskGreetingTitle(now, firstNameMe)} {deskGreetingEmoji(now)}
          </Text>
          <View style={styles.heroSubRow}>
            <Text style={styles.heroSub} numberOfLines={1}>{dateLabel}</Text>
            {weatherBit ? (
              <TouchableOpacity
                onPress={() => openWeather('today')}
                style={styles.heroWeather}
                accessibilityRole="button"
                accessibilityLabel="Vis været"
              >
                <Ionicons name={weatherIcon} size={14} color={colors.brand} />
                <Text style={styles.heroWeatherTxt} numberOfLines={1}>{weatherBit}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
        <View style={styles.heroActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={onNotify} accessibilityLabel="Varslinger">
            <Ionicons name="notifications-outline" size={18} color={colors.ink} />
            {unreadTotal > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeTxt}>{unreadTotal > 9 ? '9+' : unreadTotal}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryBtn} onPress={onCreate} accessibilityRole="button">
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.primaryBtnTxt}>Opprett</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={() => onTab?.('plan')} accessibilityRole="button">
            <Ionicons name="calendar-outline" size={15} color={colors.ink} />
            <Text style={styles.ghostBtnTxt}>Kalender</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.main}>
        <View style={styles.agendaCol}>
          <HelpTarget id="timeline" style={[styles.card, styles.cardFill]}>
            <View style={styles.cardHeadRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.cardTitle}>Dagens agenda</Text>
                <Text style={styles.cardHint}>
                  {eventsToday.length
                    ? `${eventsToday.length} ${eventsToday.length === 1 ? 'avtale' : 'avtaler'} · familie og kalendere`
                    : 'Familie, Outlook og ICS'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => onTab?.('plan')}>
                <Text style={styles.link}>Åpne kalender</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.agendaScroll}
              contentContainerStyle={styles.agendaScrollInner}
              showsVerticalScrollIndicator
              nestedScrollEnabled
            >
              {eventsToday.length === 0 ? (
                <TouchableOpacity style={styles.emptyCta} onPress={() => onTab?.('plan')} activeOpacity={0.85}>
                  <Ionicons name="calendar-outline" size={18} color={colors.brand} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.emptyCtaTitle}>Ingen hendelser i dag</Text>
                    <Text style={styles.statSub}>Åpne kalenderen for å legge til eller synke Outlook.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </TouchableOpacity>
              ) : eventsToday.map((ev, i, list) => {
                const hint = eventSourceHint(ev);
                return (
                  <TouchableOpacity key={ev.id || `${ev.title}-${i}`} style={styles.tlRow} onPress={() => openEvent(ev)}>
                    <Text style={styles.tlTime}>{ev.startTime || 'Heldag'}</Text>
                    <View style={styles.tlRail}>
                      <View style={[styles.tlDot, { backgroundColor: eventDotColor(ev, allMembers) }]} />
                      {i < list.length - 1 ? <View style={styles.tlLine} /> : null}
                    </View>
                    <View style={{ flex: 1, minWidth: 0, paddingBottom: 10 }}>
                      <Text style={styles.taskTitle}>{ev.title}</Text>
                      {hint ? (
                        <Text style={styles.statSub}>{hint}</Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
              {eventsTomorrow.length ? (
                <View style={styles.tomorrowBlock}>
                  <Text style={styles.tomorrowLbl}>I morgen</Text>
                  {eventsTomorrow.map((ev) => (
                    <TouchableOpacity
                      key={ev.id || ev.title}
                      style={styles.tmRow}
                      onPress={() => openEvent(ev)}
                    >
                      <Text style={styles.tlTime}>{ev.startTime || 'Heldag'}</Text>
                      <Text style={[styles.taskTitle, { flex: 1 }]} numberOfLines={1}>{ev.title}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </ScrollView>
          </HelpTarget>
        </View>

        <ScrollView
          style={styles.sideCol}
          contentContainerStyle={styles.sideInner}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <LiveHomeWidgets newsLimit={4} flushTop />

          <View style={[styles.card, styles.tasksCard]}>
            <View style={styles.cardHeadRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.cardTitle}>Oppgaver</Text>
                <Text style={styles.cardHint}>
                  {openTasks.length
                    ? `${openTasks.length} åpne${overdueTasks.length ? ` · ${overdueTasks.length} forfalt` : ''}`
                    : 'Ingen åpne i dag'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => onTab?.('stars')}>
                <Text style={styles.link}>Alle</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.tasksScroll} nestedScrollEnabled showsVerticalScrollIndicator>
              {openTasks.length === 0 && doneTasks.length === 0 ? (
                <Text style={styles.empty}>Ingen åpne oppgaver — fint utgangspunkt.</Text>
              ) : (
                <>
                  {openTasks.map((task) => {
                    const meta = taskFocusMeta(task);
                    return (
                      <View key={task.id} style={styles.taskRow}>
                        <TouchableOpacity
                          style={styles.check}
                          onPress={() => onToggleTask?.(task)}
                          accessibilityRole="checkbox"
                          accessibilityLabel={task.title}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.taskTitle} numberOfLines={2}>{task.title}</Text>
                          <View style={styles.taskMetaRow}>
                            {task.category ? (
                              <View style={styles.tag}>
                                <Text style={styles.tagTxt}>{task.category}</Text>
                              </View>
                            ) : null}
                            <Text style={[styles.taskMeta, meta.danger && styles.overdue]}>{meta.label}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                  {doneTasks.map((task) => (
                    <View key={task.id} style={styles.taskRow}>
                      <View style={[styles.check, styles.checkOn]}>
                        <Ionicons name="checkmark" size={12} color="#fff" />
                      </View>
                      <Text style={[styles.taskTitle, styles.taskDone]} numberOfLines={1}>{task.title}</Text>
                      <Text style={styles.doneLbl}>Ferdig</Text>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
          </View>

          <Card style={styles.noteCard} onPress={() => onTab?.('notes')}>
            <Text style={styles.noteKicker}>Notat</Text>
            <Text style={styles.noteTitle} numberOfLines={2}>{note?.title || 'Ingen notater ennå'}</Text>
            <Text style={styles.noteBody} numberOfLines={3}>
              {note?.meta || 'Skriv et notat du finner igjen.'}
            </Text>
          </Card>

          <View style={styles.card}>
            <TouchableOpacity
              onPress={() => (weatherOpen ? setWeatherOpen(false) : openWeather('today'))}
              accessibilityRole="button"
              accessibilityLabel="Vis været i dag og i morgen"
            >
              <View style={styles.cardHeadRow}>
                <Text style={styles.cardTitle}>Været{placeName ? ` i ${placeName}` : ''}</Text>
                <Ionicons name={weatherOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </View>
              <View style={styles.weatherNow}>
                <Ionicons name={weatherIcon} size={32} color={colors.brand} />
                <Text style={styles.weatherTemp}>
                  {Number.isFinite(Number(temp)) ? `${roundTemp(temp)}°` : '—'}
                </Text>
                <Text style={[styles.statSub, { flex: 1 }]} numberOfLines={2}>
                  {forecast?.current?.label || forecast?.today?.label || 'Henter vær…'}
                  {forecast?.today?.tempRange ? `  ·  ${forecast.today.tempRange}` : ''}
                </Text>
              </View>
            </TouchableOpacity>
            {forecast?.sourceLabel ? (
              <Text
                style={styles.cardHint}
                onPress={() => forecast.yrUrl && Linking.openURL(forecast.yrUrl).catch(() => {})}
              >
                {forecast.sourceLabel}
              </Text>
            ) : null}
            {weatherOpen ? (
              <View>
                <View style={styles.weatherDetail}>
                  <WeatherDayBlock
                    label="I dag"
                    day={forecast?.today}
                    current={forecast?.current}
                    selected={weatherFocus === 'today'}
                    onPress={() => setWeatherFocus('today')}
                  />
                  <WeatherDayBlock
                    label="I morgen"
                    day={forecast?.tomorrow}
                    selected={weatherFocus === 'tomorrow'}
                    onPress={() => setWeatherFocus('tomorrow')}
                  />
                </View>
                {weatherFocus === 'today' && forecast?.todayPeriods?.length ? (
                  <View style={styles.weatherPeriods}>
                    <WeatherPeriodsView
                      periods={forecast.todayPeriods}
                      clothing={forecast.clothing}
                      compact
                    />
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={styles.forecastRow}>
                {(forecast?.days || []).slice(0, 3).map((d, i) => (
                  <TouchableOpacity
                    key={d.date || i}
                    style={styles.forecastCol}
                    onPress={() => openWeather(i === 1 ? 'tomorrow' : 'today')}
                  >
                    <Text style={styles.forecastLbl}>{i === 0 ? 'I dag' : (d.weekday || '–')}</Text>
                    <Ionicons name={d.icon || 'partly-sunny'} size={16} color={colors.brand} />
                    <Text style={styles.forecastVal}>{d.tempRange || '—'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.upsell}>
            <Text style={styles.upsellTxt} numberOfLines={1}>
              Premium Familie — 14 dager gratis, deretter 49 kr/mnd
            </Text>
            <TouchableOpacity style={styles.upsellBtn} onPress={onUpgrade || onCreate}>
              <Text style={styles.upsellBtnTxt}>Oppgrader ✨</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const webShadow = Platform.OS === 'web'
  ? { boxShadow: '0 8px 22px rgba(15, 23, 42, 0.05)' }
  : {
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  };

const styles = StyleSheet.create({
  page: {
    flex: 1,
    minHeight: 0,
    padding: 16,
    paddingBottom: 10,
    gap: 12,
    width: '100%',
  },
  pageShort: { padding: 10, paddingBottom: 8, gap: 8 },
  hero: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16,
  },
  hello: { fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.5 },
  helloShort: { fontSize: 22 },
  heroSubRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' },
  heroSub: { fontSize: 13, color: colors.muted, fontWeight: '500' },
  heroWeather: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
    borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3,
  },
  heroWeatherTxt: { fontSize: 12, fontWeight: '600', color: colors.ink },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center',
  },
  badge: {
    position: 'absolute', top: -5, right: -5, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: '#e11d48', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeTxt: { color: '#fff', fontSize: 9, fontWeight: '800' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.brand, height: 36, paddingHorizontal: 12, borderRadius: 10,
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  ghostBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.card, height: 36, paddingHorizontal: 11, borderRadius: 10,
    borderWidth: 1, borderColor: colors.line,
  },
  ghostBtnTxt: { color: colors.ink, fontWeight: '600', fontSize: 13 },
  main: Platform.OS === 'web'
    ? {
      flex: 1,
      minHeight: 0,
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1.08fr) minmax(0, 1fr)',
      gap: 12,
    }
    : { flex: 1, minHeight: 0, flexDirection: 'row', gap: 12 },
  agendaCol: { minWidth: 0, minHeight: 0, flex: 1 },
  sideCol: { minWidth: 0, minHeight: 0, flex: 1 },
  sideInner: { gap: 10, paddingBottom: 8 },
  card: {
    backgroundColor: colors.card, borderRadius: R, padding: 14,
    borderWidth: 1, borderColor: colors.line, ...webShadow, minWidth: 0,
  },
  cardFill: { flex: 1, minHeight: 0 },
  cardHeadRow: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: -0.3 },
  cardHint: { fontSize: 12, color: colors.muted, fontWeight: '500', marginTop: 2 },
  link: { color: colors.brand, fontWeight: '700', fontSize: 12, marginTop: 2 },
  empty: { color: colors.muted, fontSize: 12, fontWeight: '500', paddingVertical: 4 },
  emptyCta: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#f8fafc', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 10,
  },
  emptyCtaTitle: { fontSize: 13, fontWeight: '700', color: colors.ink },
  agendaScroll: { flex: 1, minHeight: 0 },
  agendaScrollInner: { paddingBottom: 8, flexGrow: 1 },
  tasksCard: { minHeight: 180 },
  tasksScroll: { maxHeight: 260 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  check: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#cbd5e1', backgroundColor: colors.card,
  },
  checkOn: { backgroundColor: colors.success, borderColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  taskTitle: { fontSize: 13, fontWeight: '600', color: colors.ink },
  taskDone: { textDecorationLine: 'line-through', color: colors.muted, flex: 1 },
  doneLbl: { fontSize: 11, fontWeight: '700', color: colors.success },
  taskMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  taskMeta: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  overdue: { color: colors.danger, fontWeight: '700' },
  tag: { backgroundColor: colors.brandSoft, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  tagTxt: { fontSize: 10, fontWeight: '700', color: colors.brand, textTransform: 'capitalize' },
  tlRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  tlTime: { width: 48, fontSize: 11, fontWeight: '700', color: colors.muted, paddingTop: 1 },
  tlRail: { width: 12, alignItems: 'center', alignSelf: 'stretch' },
  tlDot: { width: 9, height: 9, borderRadius: 5, marginTop: 3 },
  tlLine: { width: 2, flex: 1, minHeight: 18, backgroundColor: '#e2e8f0', marginTop: 2 },
  tomorrowBlock: {
    marginTop: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line,
  },
  tomorrowLbl: {
    fontSize: 11, fontWeight: '800', color: colors.muted, letterSpacing: 0.4,
    textTransform: 'uppercase', marginBottom: 6,
  },
  tmRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  noteCard: { backgroundColor: '#fff8dc', borderColor: '#f3e4a8' },
  noteKicker: { fontSize: 11, fontWeight: '800', color: '#b45309', letterSpacing: 0.3, textTransform: 'uppercase' },
  noteTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 6, letterSpacing: -0.2 },
  noteBody: { fontSize: 13, color: '#78716c', fontWeight: '500', lineHeight: 19, marginTop: 6 },
  weatherNow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  weatherTemp: { fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.6 },
  forecastRow: { flexDirection: 'row', gap: 6 },
  forecastCol: { flex: 1, alignItems: 'center', gap: 3, backgroundColor: '#f8fafc', borderRadius: 10, paddingVertical: 8 },
  forecastLbl: { fontSize: 10, fontWeight: '700', color: colors.muted, textTransform: 'capitalize' },
  forecastVal: { fontSize: 11, fontWeight: '700', color: colors.ink },
  weatherDetail: {
    flexDirection: 'row', gap: 8, marginTop: 2,
  },
  weatherPeriods: { marginTop: 10 },
  weatherDay: {
    flex: 1, backgroundColor: '#f8fafc', borderRadius: 12, padding: 10, gap: 3,
    borderWidth: 1, borderColor: 'transparent',
  },
  weatherDayOn: { borderColor: colors.brandSoft, backgroundColor: '#eff6ff' },
  weatherDayHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 },
  weatherDayTemp: { fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -0.4 },
  weatherDayBit: { fontSize: 11, fontWeight: '600', color: colors.muted, lineHeight: 15 },
  statSub: { fontSize: 11, color: colors.muted, marginTop: 1, fontWeight: '500' },
  upsell: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    backgroundColor: '#eef2ff', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14,
    borderWidth: 1, borderColor: '#e0e7ff',
  },
  upsellTxt: { flex: 1, fontSize: 12, fontWeight: '600', color: '#4338ca' },
  upsellBtn: {
    backgroundColor: colors.accent, paddingHorizontal: 12, height: 30, borderRadius: 8, justifyContent: 'center',
  },
  upsellBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
