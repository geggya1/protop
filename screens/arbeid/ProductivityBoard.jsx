import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View,
} from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { absenceTypeById } from '../../src/arbeid/absenceCatalog';
import { displayName } from '../../src/employees/model';
import {
  HORIZON_CHOICES,
  TONE_COLOR,
  actualHoursForWeek,
  addAllocation,
  addDays,
  allocationEnd,
  allocationInclusiveEnd,
  employeeCapacityHours,
  firstSlackWeek,
  formatHours,
  formatPercent,
  intensityOf,
  kindLabel,
  kindOf,
  loadTone,
  makeAllocation,
  matchesKind,
  mondayKey,
  occupancy,
  parseAmount,
  patchAllocation,
  placement,
  percentFromPointerDelta,
  planActivityFrom,
  planningRows,
  projectLabel,
  removeAllocation,
  round1,
  shareOfCapacity,
  shiftPreview,
  sizeFromHours,
  sizeFromPercent,
  spanBetween,
  spanFromDates,
  suggestSpan,
  toDateKey,
  visibleWeekKeys,
  weekKeys,
  weekMeta,
  weeklyAbsenceHours,
  weeklyActualHours,
  weekSeries,
} from '../../src/capacity/plan';

const WEEK_W = 54;
const MATRIX_W = 48;
const LABEL_W = 228;
const NARROW_LABEL_W = 132;
const ROW_H = 52;
const POPUP_W = 168;

export function labelColumnWidth(screenWidth) {
  const width = Number(screenWidth) || 0;
  if (width > 0 && width < 520) return NARROW_LABEL_W;
  if (width > 0 && width < 900) return 180;
  return LABEL_W;
}

/** Liten brikke rett under stolpen, innenfor det som er synlig i ukeløpet. */
export function editorLeft({ startIndex, trackWeeks, scrollX = 0, paneWidth, popupWidth = POPUP_W }) {
  const track = Math.max(popupWidth, (Number(trackWeeks) || 1) * MATRIX_W);
  const pane = Math.max(popupWidth, Number(paneWidth) || popupWidth);
  const maxLeft = Math.max(0, track - popupWidth);
  const preferred = Math.max(0, (Number(startIndex) || 0) * MATRIX_W);
  const visibleLeft = Math.max(0, Number(scrollX) || 0);
  const visibleRight = visibleLeft + pane;
  let left = preferred;
  if (left + popupWidth > visibleRight - 4) left = visibleRight - popupWidth - 4;
  if (left < visibleLeft) left = visibleLeft;
  return Math.round(Math.max(0, Math.min(maxLeft, left)));
}

export function editorTop(barPx) {
  return 16 + Math.max(0, Number(barPx) || 0) + 2;
}
const KINDS = [
  { id: 'alle', label: 'Alle' },
  { id: 'staff', label: 'Interne' },
  { id: 'external', label: 'Eksterne' },
  { id: 'innleid', label: 'Innleide' },
];

function initials(name) {
  const parts = String(name || '').split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}

function pointOf(event) {
  const native = event?.nativeEvent || {};
  return {
    x: native.pageX ?? native.clientX ?? 0,
    y: native.pageY ?? native.clientY ?? 0,
  };
}

function withAlpha(hex, alpha) {
  const raw = String(hex || '').replace('#', '');
  if (raw.length !== 6) return hex;
  return `#${raw}${alpha}`;
}

export function WeekSumChart({ series, colors }) {
  const scale = Math.max(120, ...series.map((row) => row.ofContract || 0));
  const width = Math.max(series.length * WEEK_W, WEEK_W);
  const height = 168;
  const inner = height - 8;
  return (
    <View>
      <Svg width={width} height={height}>
        <Line
          x1={0}
          x2={width}
          y1={8 + inner - (100 / scale) * inner}
          y2={8 + inner - (100 / scale) * inner}
          stroke={colors.line}
          strokeDasharray="4 4"
        />
        {series.map((row, index) => {
          const tone = TONE_COLOR[loadTone(row.ofContract)];
          const h = Math.max(row.ofContract > 0 ? 6 : 0, (Math.min(row.ofContract, scale) / scale) * inner);
          return (
            <Rect
              key={row.key}
              x={index * WEEK_W + 8}
              y={8 + inner - h}
              width={WEEK_W - 16}
              height={h}
              rx={7}
              fill={tone}
            />
          );
        })}
      </Svg>
      <View style={styles.axisRow}>
        {series.map((row) => (
          <View key={row.key} style={styles.axisCell}>
            <Text style={[styles.axisWeek, { color: colors.ink }]}>{row.meta.short}</Text>
            <Text style={[styles.axisPct, { color: TONE_COLOR[loadTone(row.ofContract)] }]}>
              {formatPercent(row.ofContract)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Stat({ colors, label, value, hint }) {
  return (
    <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.ink }]}>{value}</Text>
      {hint ? <Text style={[styles.statHint, { color: colors.muted }]}>{hint}</Text> : null}
    </View>
  );
}

export default function ProductivityBoard({
  colors,
  people = [],
  projects = [],
  plan,
  timeEntries = [],
  absences = [],
  canWrite = false,
  onPlan,
  initialOpenId = '',
  initialSelectedId = '',
  initialView = 'people',
  initialKind = 'staff',
  fullDayHours = 8,
}) {
  const { width: screenWidth } = useWindowDimensions();
  const labelW = labelColumnWidth(screenWidth);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState(initialKind);
  const [view, setView] = useState(initialView);
  const [horizon, setHorizon] = useState(26);
  const [origin, setOrigin] = useState(() => weekKeys(new Date(), 1)[0]);
  const [openId, setOpenId] = useState(initialOpenId);
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [draft, setDraft] = useState(null);
  const [paint, setPaint] = useState(null);
  const [otherQuery, setOtherQuery] = useState('');
  const [percentDraft, setPercentDraft] = useState('');
  const [hoursDraft, setHoursDraft] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const dragRef = useRef(null);
  const tracks = useRef({});
  const gridScroll = useRef({});
  const laneLock = useRef(false);
  const laneScrollRef = useRef(0);
  const [laneScroll, setLaneScroll] = useState(0);
  const suppressPress = useRef(false);
  const api = useRef({});

  const forwardWeeks = useMemo(() => weekKeys(origin, horizon), [origin, horizon]);
  const weeks = useMemo(() => visibleWeekKeys(origin, horizon), [origin, horizon]);
  const todayKey = mondayKey(new Date());
  const activityFrom = planActivityFrom(new Date());
  const weekHours = (Number(fullDayHours) > 0 ? Number(fullDayHours) : 8) * 5;
  const allocations = plan?.allocations || [];

  const visiblePeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people
      .filter((row) => matchesKind(row, kind))
      .filter((row) => !q || displayName(row).toLowerCase().includes(q))
      .slice()
      .sort((a, b) => displayName(a).localeCompare(displayName(b), 'nb'));
  }, [people, kind, query]);

  const series = useMemo(
    () => weekSeries(visiblePeople, allocations, forwardWeeks, weekHours),
    [visiblePeople, allocations, forwardWeeks, weekHours],
  );
  const thisWeek = series[0];
  const peak = series.reduce((best, row) => (row.ofContract > (best?.ofContract || 0) ? row : best), null);
  const companySlack = series.find((row) => row.freeHours > 0.05);

  function commit(next) {
    onPlan?.(next);
  }

  function shown(alloc) {
    if (!draft || draft.id !== alloc.id) return alloc;
    const next = { ...alloc };
    if (draft.start) next.start = draft.start;
    if (draft.weeks) next.weeks = draft.weeks;
    if (draft.hoursPerWeek != null) next.hoursPerWeek = draft.hoursPerWeek;
    return next;
  }

  function capacityBase(person, monday) {
    const hours = employeeCapacityHours(person, weekHours, monday || todayKey);
    return hours > 0 ? hours : weekHours;
  }

  function rememberSize(hours, base) {
    const size = sizeFromHours(hours, base);
    setPercentDraft(String(size.percent).replace('.', ','));
    setHoursDraft(formatHours(size.hoursPerWeek));
  }

  function fillSizeDraft(alloc, person) {
    const owner = person || people.find((row) => row.id === alloc.employeeId);
    const pct = shareOfCapacity(alloc.hoursPerWeek, capacityBase(owner, alloc.start));
    setNameDraft(alloc.name);
    setPercentDraft(String(pct).replace('.', ','));
    setHoursDraft(formatHours(alloc.hoursPerWeek));
  }

  function selectAlloc(alloc, person) {
    const fresh = selectedId !== alloc.id;
    setSelectedId(alloc.id);
    fillSizeDraft(alloc, person);
    if (fresh) revealEditor();
  }

  useEffect(() => {
    if (!selectedId) return;
    const alloc = allocations.find((row) => row.id === selectedId);
    if (!alloc) return;
    fillSizeDraft(alloc);
  }, [selectedId]);

  function removeSelected(id) {
    commit(removeAllocation(plan, id));
    setSelectedId('');
    setDraft(null);
  }

  function patch(id, fields) {
    commit(patchAllocation(plan, id, fields));
  }

  function addProjectBar(person, project, start) {
    const span = suggestSpan(project, start || origin, 8);
    const row = makeAllocation({
      employeeId: person.id,
      project,
      start: start || span.start,
      weeks: span.weeks,
      percent: 50,
      weekHours,
    });
    commit(addAllocation(plan, row));
    setOpenId(person.id);
    selectAlloc(row);
  }

  function addDummy(person) {
    const row = makeAllocation({
      employeeId: person.id,
      source: 'dummy',
      name: 'Dummy',
      start: origin,
      weeks: 4,
      percent: 20,
      weekHours,
    });
    commit(addAllocation(plan, row));
    selectAlloc(row);
  }

  function weekIndexAt(employeeId, pageX) {
    const node = tracks.current[employeeId];
    const el = node?.getBoundingClientRect
      ? node
      : (typeof document !== 'undefined' ? document.getElementById(`produktivitet-track-${employeeId}`) : null);
    const rect = el?.getBoundingClientRect?.();
    if (!rect) return null;
    const local = pageX - rect.left;
    if (local < 0 || local > rect.width) return null;
    return Math.max(0, Math.min(weeks.length - 1, Math.floor(local / MATRIX_W)));
  }

  function onTrackPointerMove(event) {
    const drag = dragRef.current;
    if (!drag) return;
    const { x, y } = pointOf(event);
    if (drag.mode === 'paint' || drag.mode === 'load') {
      const index = weekIndexAt(drag.employeeId, x);
      const percent = percentFromPointerDelta(drag.percent, y - drag.y);
      if (drag.mode === 'load' && drag.alloc) {
        const person = drag.person || people.find((row) => row.id === drag.alloc.employeeId);
        const base = capacityBase(person, drag.alloc.start);
        setDraft({ id: drag.alloc.id, hoursPerWeek: sizeFromPercent(percent, base).hoursPerWeek });
        return;
      }
      const endIndex = index == null ? drag.originIndex : index;
      setPaint({
        employeeId: drag.employeeId,
        projectId: drag.projectId || '',
        allocId: drag.allocId || '',
        startIndex: drag.originIndex,
        endIndex,
        percent,
      });
      if (drag.alloc) {
        const person = drag.person || people.find((row) => row.id === drag.alloc.employeeId);
        const base = capacityBase(person, drag.alloc.start);
        setDraft({ id: drag.alloc.id, hoursPerWeek: sizeFromPercent(percent, base).hoursPerWeek });
      }
      return;
    }
    const dx = x - drag.x;
    const dy = y - drag.y;
    if (drag.mode === 'move' && Math.abs(dy) > 16 && Math.abs(dy) > Math.abs(dx) + 6) {
      drag.mode = 'load';
      drag.percent = drag.basePercent ?? drag.alloc.percent;
      const person = drag.person || people.find((row) => row.id === drag.alloc.employeeId);
      const base = capacityBase(person, drag.alloc.start);
      setDraft({
        id: drag.alloc.id,
        hoursPerWeek: sizeFromPercent(percentFromPointerDelta(drag.percent, dy), base).hoursPerWeek,
      });
      return;
    }
    const delta = Math.round(dx / MATRIX_W);
    const next = shiftPreview(drag.alloc, delta, drag.mode);
    setDraft({ id: drag.alloc.id, start: next.start, weeks: next.weeks });
  }

  function commitSpan(person, row, start, count, percent) {
    const spanWeeks = Math.max(1, count);
    const end = addDays(start, spanWeeks * 7);
    const base = capacityBase(person, start);
    const hours = sizeFromPercent(percent, base).hoursPerWeek;
    if (row.allocId && !row.projectId) {
      patch(row.allocId, { start, weeks: spanWeeks, hoursPerWeek: hours });
      setSelectedId(row.allocId);
      rememberSize(hours, base);
      return;
    }
    const mine = (plan?.allocations || []).filter((alloc) => (
      alloc.employeeId === person.id && alloc.projectId === row.projectId
    ));
    const hit = mine.find((alloc) => alloc.start < end && allocationEnd(alloc) > start);
    if (hit) {
      patch(hit.id, { start, weeks: spanWeeks, hoursPerWeek: hours });
      setSelectedId(hit.id);
      rememberSize(hours, base);
      setNameDraft(hit.name);
      return;
    }
    const project = row.project || (row.projectId ? { id: row.projectId, name: row.name } : null);
    const created = makeAllocation({
      employeeId: person.id,
      project,
      source: project ? 'project' : 'dummy',
      name: row.name,
      start,
      weeks: spanWeeks,
      percent,
      weekHours,
    });
    commit(addAllocation(plan, created));
    selectAlloc(created);
  }

  function onTrackPointerUp(event) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const { x, y } = pointOf(event);
    if (drag.mode === 'paint') {
      setPaint(null);
      const index = weekIndexAt(drag.employeeId, x);
      const endIndex = index == null ? drag.originIndex : index;
      const span = spanBetween(weeks, drag.originIndex, endIndex);
      if (!span) return;
      let from = span.from;
      while (from <= span.to && weeks[from] < todayKey) from += 1;
      if (from > span.to) return;
      suppressPress.current = true;
      const percent = percentFromPointerDelta(drag.percent, y - drag.y);
      commitSpan(drag.person, drag.row, weeks[from], span.to - from + 1, percent);
      return;
    }
    if (drag.mode === 'load') {
      setDraft(null);
      const percent = percentFromPointerDelta(drag.percent, y - drag.y);
      if (Math.abs(y - drag.y) > 8) {
        suppressPress.current = true;
        const person = drag.person || people.find((row) => row.id === drag.alloc.employeeId);
        const base = capacityBase(person, drag.alloc.start);
        const hours = sizeFromPercent(percent, base).hoursPerWeek;
        patch(drag.alloc.id, { hoursPerWeek: hours });
        rememberSize(hours, base);
      }
      return;
    }
    const delta = Math.round((x - drag.x) / MATRIX_W);
    setDraft(null);
    if (delta !== 0) {
      suppressPress.current = true;
      const next = shiftPreview(drag.alloc, delta, drag.mode);
      patch(drag.alloc.id, drag.mode === 'resize' ? { weeks: next.weeks } : { start: next.start });
    }
  }

  api.current = { onTrackPointerMove, onTrackPointerUp };

  useEffect(() => {
    if (!openId) return undefined;
    const index = weeks.indexOf(todayKey);
    const node = gridScroll.current[openId];
    if (!node?.scrollTo || index < 1) return undefined;
    const timer = setTimeout(() => {
      node.scrollTo({ x: Math.max(0, index * MATRIX_W - MATRIX_W * 2), animated: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [openId, todayKey, weeks]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const move = (event) => api.current.onTrackPointerMove?.({ nativeEvent: event });
    const up = (event) => api.current.onTrackPointerUp?.({ nativeEvent: event });
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, []);

  function onLaneScroll(id, event) {
    const x = event?.nativeEvent?.contentOffset?.x;
    if (x == null || laneLock.current) return;
    laneLock.current = true;
    for (const [key, node] of Object.entries(gridScroll.current)) {
      if (key !== id && node?.scrollTo) node.scrollTo({ x, animated: false });
    }
    if (Math.abs(x - laneScrollRef.current) > 12) {
      laneScrollRef.current = x;
      setLaneScroll(x);
    }
    setTimeout(() => { laneLock.current = false; }, 40);
  }

  function beginPaint(event, person, row) {
    if (!canWrite) return;
    const index = weekIndexAt(person.id, pointOf(event).x);
    if (index == null || weeks[index] < todayKey) return;
    beginDrag(event, {
      mode: 'paint',
      person,
      row,
      employeeId: person.id,
      projectId: row.projectId || '',
      allocId: row.allocId || '',
      originIndex: index,
      percent: 50,
    });
  }

  function beginDrag(event, payload) {
    if (!canWrite) return;
    const now = Date.now();
    const current = dragRef.current;
    if (payload.mode === 'move' && current?.mode === 'resize' && now - (current.at || 0) < 40) return;
    event?.preventDefault?.();
    const point = pointOf(event);
    dragRef.current = { ...payload, x: point.x, y: point.y, at: now };
    if (payload.alloc) selectAlloc(payload.alloc, payload.person);
  }

  const selected = allocations.find((row) => row.id === selectedId) || null;

  return (
    <View style={styles.page} nativeID="produktivitet-board">
      <View style={styles.toolbar}>
        <View style={[styles.segment, { backgroundColor: colors.sunken || colors.bg, borderColor: colors.line }]}>
          {[
            { id: 'people', label: 'Personer' },
            { id: 'sum', label: 'Sammenslått' },
          ].map((row) => {
            const on = view === row.id;
            return (
              <Pressable
                key={row.id}
                onPress={() => setView(row.id)}
                style={[styles.segmentBtn, on && { backgroundColor: colors.card }]}
                nativeID={`produktivitet-view-${row.id}`}
              >
                <Text style={{ color: on ? colors.ink : colors.muted, fontWeight: '600' }}>{row.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={[styles.search, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Søk ansatt"
            placeholderTextColor={colors.muted}
            style={[styles.searchInput, { color: colors.ink }]}
          />
        </View>
      </View>

      <View style={styles.pills}>
        {KINDS.map((row) => {
          const on = kind === row.id;
          return (
            <Pressable
              key={row.id}
              onPress={() => setKind(row.id)}
              style={[styles.pill, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? withAlpha(colors.brand, '18') : colors.card }]}
            >
              <Text style={{ color: on ? colors.brand : colors.ink, fontWeight: '600', fontSize: 13 }}>{row.label}</Text>
            </Pressable>
          );
        })}
        {HORIZON_CHOICES.map((count) => {
          const on = horizon === count;
          return (
            <Pressable
              key={count}
              onPress={() => setHorizon(count)}
              style={[styles.pill, { borderColor: on ? colors.brand : colors.line, backgroundColor: colors.card }]}
            >
              <Text style={{ color: on ? colors.brand : colors.muted, fontWeight: '600', fontSize: 13 }}>{`${count} uker`}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.navRow}>
        <Pressable onPress={() => setOrigin(weekKeys(origin, 1).length ? shiftWeek(origin, -4) : origin)} style={[styles.iconBtn, { borderColor: colors.line }]}>
          <Ionicons name="chevron-back" size={18} color={colors.ink} />
        </Pressable>
        <Pressable onPress={() => setOrigin(weekKeys(new Date(), 1)[0])} style={[styles.todayBtn, { borderColor: colors.line }]}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>
            {`${weekMeta(origin).short} · ${weekMeta(origin).date}`}
          </Text>
        </Pressable>
        <Pressable onPress={() => setOrigin(shiftWeek(origin, 4))} style={[styles.iconBtn, { borderColor: colors.line }]}>
          <Ionicons name="chevron-forward" size={18} color={colors.ink} />
        </Pressable>
        <Text style={[styles.weekHours, { color: colors.muted }]}>
          {`Full uke ${formatHours(weekHours)} t`}
        </Text>
      </View>

      <View style={styles.stats}>
        <Stat
          colors={colors}
          label={thisWeek ? `Uke ${thisWeek.meta.week}` : 'Uke'}
          value={formatPercent(thisWeek?.ofContract || 0)}
          hint={`${formatHours(thisWeek?.hours || 0)} t av ${formatHours(thisWeek?.capacity || 0)} t`}
        />
        <Stat
          colors={colors}
          label="Topp i vinduet"
          value={peak ? formatPercent(peak.ofContract) : '0 %'}
          hint={peak ? `${peak.meta.short} · ${peak.meta.date}` : ''}
        />
        <Stat
          colors={colors}
          label="Ledig kapasitet"
          value={companySlack ? companySlack.meta.short : 'Fullt'}
          hint={companySlack ? `${formatHours(companySlack.freeHours)} t ledig` : 'Ingen ledig uke i vinduet'}
        />
      </View>

      {view === 'sum' ? (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]} nativeID="produktivitet-sum">
          <Text style={[styles.cardTitle, { color: colors.ink }]}>Sum per uke</Text>
          <Text style={[styles.cardSub, { color: colors.muted }]}>
            Stolpen er belegg mot samlet stillingsstørrelse. 100 % er stiplet. Rødt er overbooking.
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <WeekSumChart series={series} colors={colors} />
          </ScrollView>
          <View style={styles.legend}>
            {Object.entries({ open: 'Ledig', ok: 'I arbeid', full: 'Nær full', over: 'Over' }).map(([id, label]) => (
              <View key={id} style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: TONE_COLOR[id] }]} />
                <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {visiblePeople.length === 0 ? (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={[styles.cardTitle, { color: colors.ink }]}>Ingen aktive ansatte</Text>
          <Text style={[styles.cardSub, { color: colors.muted }]}>
            Filteret viser bare den valgte gruppen. Interne er fast ansatte i bedriften. Bytt filter eller registrer folk under Ansatte.
          </Text>
        </View>
      ) : visiblePeople.map((person) => {
        const name = displayName(person);
        const open = openId === person.id;
        const kindName = kindLabel(kindOf(person));
        const contract = person.company?.workPercent ? `${person.company.workPercent} % stilling` : '100 % stilling';
        const now = occupancy(person, allocations, forwardWeeks[0], weekHours);
        const slack = firstSlackWeek(person, allocations, forwardWeeks, weekHours);
        const personAllocs = allocations.filter((row) => row.employeeId === person.id).map(shown);
        const weekPane = Math.max(POPUP_W, screenWidth - labelW - 48);
        const rows = planningRows({
          projects,
          allocations: personAllocs,
          timeEntries,
          employeeId: person.id,
          activityFrom,
        });
        const actualByProject = weeklyActualHours(timeEntries, person.id, weeks);
        const absenceByWeek = weeklyAbsenceHours(absences, person.id, weeks, toDateKey(new Date()));
        const hasPlannedAbsence = absenceByWeek.size > 0;
        return (
          <View
            key={person.id}
            nativeID={`produktivitet-person-${person.id}`}
            style={[styles.person, { backgroundColor: colors.card, borderColor: colors.line }]}
          >
            <Pressable onPress={() => setOpenId(open ? '' : person.id)} style={styles.personHead}>
              <View style={[styles.avatar, { backgroundColor: withAlpha(colors.brand, '18') }]}>
                <Text style={{ color: colors.brand, fontWeight: '700' }}>{initials(name)}</Text>
              </View>
              <View style={styles.personText}>
                <Text style={[styles.personName, { color: colors.ink }]}>{name}</Text>
                <Text style={[styles.personMeta, { color: colors.muted }]}>
                  {`${kindName} · ${contract}`}
                </Text>
              </View>
              <View style={styles.personStats}>
                <Text style={[styles.personPct, { color: TONE_COLOR[loadTone(now.ofContract)] }]}>
                  {formatPercent(now.ofContract)}
                </Text>
                <Text style={[styles.personMeta, { color: colors.muted }]}>
                  {now.freeHours <= 0.05
                    ? (slack ? `Ledig fra ${slack.meta.short}` : 'Fullbooket')
                    : `${formatHours(now.freeHours)} t ledig`}
                </Text>
              </View>
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
            </Pressable>
            {!open ? (
              <View style={styles.freeLane} nativeID={`produktivitet-ledig-${person.id}`}>
                <View style={styles.freeCaption}>
                  <Text style={[styles.sumLabel, { color: colors.ink }]}>Ledig</Text>
                  <Text style={[styles.rowMeta, { color: colors.muted }]}>pr. uke</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  ref={(node) => { gridScroll.current[`ledig-${person.id}`] = node; }}
                  onScroll={(event) => onLaneScroll(`ledig-${person.id}`, event)}
                  scrollEventThrottle={16}
                >
                  <View>
                    <View style={styles.weekHead}>
                      {weeks.map((key) => {
                        const meta = weekMeta(key);
                        const current = key === todayKey;
                        return (
                          <View key={key} style={[styles.weekHeadCell, current && { backgroundColor: withAlpha(colors.brand, '18') }]}>
                            <Text style={[styles.weekNo, { color: current ? colors.brand : colors.ink }]}>{meta.short}</Text>
                            <Text style={[styles.weekDate, { color: colors.muted }]}>{meta.date}</Text>
                          </View>
                        );
                      })}
                    </View>
                    <View style={styles.freeRow}>
                      {weeks.map((key) => {
                        const occ = occupancy(person, allocations, key, weekHours);
                        const away = absenceByWeek.get(key)?.hours || 0;
                        const free = round1(occ.freeHours - away);
                        const future = key >= todayKey;
                        const bg = future ? freeTone(free, occ.capacity) : 'transparent';
                        return (
                          <View key={key} style={[styles.freeCell, { borderColor: colors.line, backgroundColor: bg }]}>
                            <Text style={[styles.cellText, { color: future && free <= 0.05 ? '#9f1239' : colors.ink }]}>
                              {future ? formatHours(free) : ''}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </ScrollView>
              </View>
            ) : null}

            {open ? (
              <View style={styles.expand} nativeID={`produktivitet-plan-${person.id}`}>
                <Text style={[styles.cardSub, { color: colors.muted }]}>
                  {`Mørkere blå er høyere belastning, i tydelige sprang. Prosenten står over stolpen. Planlagt fravær er oransje og stiplet.`}
                </Text>
                <View style={styles.matrix} nativeID={`produktivitet-matrix-${person.id}`}>
                  <View style={[styles.labelCol, { width: labelW }]} nativeID={`produktivitet-labels-${person.id}`}>
                    <View style={[styles.labelHead, { borderColor: colors.line }]}>
                      <Text style={[styles.sectionLabel, { color: colors.muted }]}>Prosjekt</Text>
                    </View>
                    <View style={[styles.labelSum, { borderColor: colors.line, backgroundColor: colors.bg }]}>
                      <Text style={[styles.sumLabel, { color: colors.ink }]}>Sum</Text>
                    </View>
                    {hasPlannedAbsence ? (
                      <View style={[styles.labelCell, { borderColor: colors.line, backgroundColor: '#fff7ed' }]}>
                        <Text numberOfLines={1} style={[styles.rowName, { color: '#9a3412' }]}>Fravær</Text>
                        <Text numberOfLines={1} style={[styles.rowMeta, { color: '#c2410c' }]}>Planlagt</Text>
                      </View>
                    ) : null}
                    {rows.map((row) => (
                      <View key={row.key} style={[styles.labelCell, { borderColor: colors.line }]}>
                        <Text numberOfLines={1} style={[styles.rowName, { color: colors.ink }]}>{row.name}</Text>
                        <Text numberOfLines={1} style={[styles.rowMeta, { color: colors.muted }]}>
                          {row.source === 'dummy' ? 'Ikke et ekte prosjekt' : `${formatHours(row.recentHours)} t siste 3 md`}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator
                    ref={(node) => { gridScroll.current[person.id] = node; }}
                    onScroll={(event) => onLaneScroll(person.id, event)}
                    scrollEventThrottle={16}
                  >
                    <View
                      ref={(node) => { tracks.current[person.id] = node; }}
                      nativeID={`produktivitet-track-${person.id}`}
                      style={{ width: weeks.length * MATRIX_W }}
                    >
                      <View style={styles.monthRow}>
                        {monthBands(weeks).map((band) => (
                          <View key={band.key} style={[styles.monthBand, { width: band.span * MATRIX_W }]}>
                            <Text numberOfLines={1} style={[styles.monthLabel, { color: colors.muted }]}>{band.label}</Text>
                          </View>
                        ))}
                      </View>
                      <View style={styles.weekHead}>
                        {weeks.map((key) => {
                          const meta = weekMeta(key);
                          const current = key === todayKey;
                          return (
                            <View key={key} style={[styles.weekHeadCell, current && { backgroundColor: withAlpha(colors.brand, '18') }]}>
                              <Text style={[styles.weekNo, { color: current ? colors.brand : colors.ink }]}>{meta.short}</Text>
                              <Text style={[styles.weekDate, { color: colors.muted }]}>{meta.date}</Text>
                            </View>
                          );
                        })}
                      </View>
                      <View style={[styles.sumRow, { backgroundColor: colors.bg }]}>
                        {weeks.map((key) => {
                          const past = key < todayKey;
                          const value = past
                            ? actualHoursForWeek(timeEntries, person.id, key)
                            : occupancy(person, personAllocs, key, weekHours).hours;
                          const tone = past ? colors.muted : TONE_COLOR[loadTone(occupancy(person, personAllocs, key, weekHours).ofContract)];
                          return (
                            <View key={key} style={[styles.matrixCell, { borderColor: colors.line, backgroundColor: key === todayKey ? withAlpha(colors.brand, '10') : 'transparent' }]}>
                              <Text style={[styles.cellText, { color: value > 0 ? tone : colors.muted }]}>
                                {value > 0 ? formatHours(value) : ''}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                      {hasPlannedAbsence ? (
                        <View style={styles.matrixRow} nativeID={`produktivitet-fravaer-${person.id}`}>
                          {weeks.map((key) => {
                            const away = absenceByWeek.get(key);
                            return (
                              <View key={key} style={[styles.matrixCell, { borderColor: colors.line, backgroundColor: away ? '#fff7ed' : 'transparent' }]}>
                                {away ? (
                                  <View style={styles.absenceMark}>
                                    <Text numberOfLines={2} style={styles.absenceText}>
                                      {absenceTypeById(away.type).label}
                                    </Text>
                                  </View>
                                ) : null}
                              </View>
                            );
                          })}
                        </View>
                      ) : null}
                      {rows.map((row) => {
                        const segments = segmentsFor(row, personAllocs, weeks, todayKey);
                        const painting = paint
                          && paint.employeeId === person.id
                          && paint.projectId === (row.projectId || '')
                          && paint.allocId === (row.allocId || '');
                        const selectedSeg = segments.find((seg) => seg.alloc.id === selectedId) || null;
                        return (
                          <View
                            key={row.key}
                            nativeID={`produktivitet-row-${person.id}-${row.projectId || row.allocId}`}
                            onPointerDown={(event) => beginPaint(event, person, row)}
                            style={[styles.matrixRow, selectedSeg && styles.matrixRowActive]}
                          >
                            {weeks.map((key) => {
                              const hours = row.projectId ? (actualByProject.get(row.projectId)?.get(key) || 0) : 0;
                              const past = key < todayKey;
                              const current = key === todayKey;
                              const pct = shareOfCapacity(hours, capacityBase(person, key));
                              const tone = intensityOf(pct);
                              return (
                                <View
                                  key={key}
                                  style={[
                                    styles.matrixCell,
                                    {
                                      borderColor: colors.line,
                                      backgroundColor: current ? withAlpha(colors.brand, '10') : 'transparent',
                                    },
                                  ]}
                                >
                                  {hours > 0 && (past || current) ? (
                                    <>
                                      <Text style={[styles.pctAbove, { color: '#1e3a8a' }]}>{formatPercent(pct)}</Text>
                                      <View style={[styles.actualBar, { height: barHeight(pct), backgroundColor: tone.color }]} />
                                    </>
                                  ) : null}
                                </View>
                              );
                            })}
                            {segments.map(({ alloc, startIndex, span }) => {
                              const on = selectedId === alloc.id;
                              const base = capacityBase(person, alloc.start);
                              const pct = shareOfCapacity(alloc.hoursPerWeek, base);
                              const tone = intensityOf(pct);
                              const height = barHeight(pct);
                              return (
                                <View
                                  key={alloc.id}
                                  nativeID={`produktivitet-bar-${alloc.id}`}
                                  onPointerDown={(event) => {
                                    event?.stopPropagation?.();
                                    beginDrag(event, {
                                      mode: 'move',
                                      alloc,
                                      person,
                                      employeeId: person.id,
                                      percent: pct,
                                    });
                                  }}
                                  style={[
                                    styles.bar,
                                    {
                                      left: startIndex * MATRIX_W + 3,
                                      width: span * MATRIX_W - 6,
                                      height,
                                      backgroundColor: tone.color,
                                      borderStyle: alloc.source === 'dummy' ? 'dashed' : 'solid',
                                      borderColor: on ? '#0f172a' : tone.color,
                                    },
                                  ]}
                                >
                                  <Text numberOfLines={1} style={styles.barPct}>{formatPercent(pct)}</Text>
                                  <View
                                    style={styles.resize}
                                    onPointerDown={(event) => {
                                      event?.stopPropagation?.();
                                      beginDrag(event, {
                                        mode: 'resize',
                                        alloc,
                                        person,
                                        employeeId: person.id,
                                        percent: pct,
                                      });
                                    }}
                                  />
                                </View>
                              );
                            })}
                            {selectedSeg ? (
                              <AllocationSettings
                                colors={colors}
                                alloc={selectedSeg.alloc}
                                canWrite={canWrite}
                                percentDraft={percentDraft}
                                hoursDraft={hoursDraft}
                                top={editorTop(barHeight(shareOfCapacity(selectedSeg.alloc.hoursPerWeek, capacityBase(person, selectedSeg.alloc.start))))}
                                left={editorLeft({
                                  startIndex: selectedSeg.startIndex,
                                  trackWeeks: weeks.length,
                                  scrollX: laneScroll,
                                  paneWidth: weekPane,
                                })}
                                caret={Math.max(8, Math.min(
                                  POPUP_W - 16,
                                  selectedSeg.startIndex * MATRIX_W - editorLeft({
                                    startIndex: selectedSeg.startIndex,
                                    trackWeeks: weeks.length,
                                    scrollX: laneScroll,
                                    paneWidth: weekPane,
                                  }) + 12,
                                ))}
                                onPercent={(value) => {
                                  setPercentDraft(value);
                                  if (parseAmount(value) == null) return;
                                  const base = capacityBase(person, selectedSeg.alloc.start);
                                  const hours = sizeFromPercent(value, base).hoursPerWeek;
                                  setHoursDraft(formatHours(hours));
                                  patch(selectedSeg.alloc.id, { hoursPerWeek: hours });
                                }}
                                onHours={(value) => {
                                  setHoursDraft(value);
                                  if (parseAmount(value) == null) return;
                                  const base = capacityBase(person, selectedSeg.alloc.start);
                                  const size = sizeFromHours(value, base);
                                  setPercentDraft(String(size.percent).replace('.', ','));
                                  patch(selectedSeg.alloc.id, { hoursPerWeek: size.hoursPerWeek });
                                }}
                                onFrom={(value) => {
                                  const span = spanFromDates(value, allocationInclusiveEnd(selectedSeg.alloc));
                                  if (!span) return;
                                  patch(selectedSeg.alloc.id, { start: span.start, weeks: span.weeks });
                                }}
                                onTo={(value) => {
                                  const span = spanFromDates(selectedSeg.alloc.start, value);
                                  if (!span) return;
                                  patch(selectedSeg.alloc.id, { start: span.start, weeks: span.weeks });
                                }}
                                onRemove={() => removeSelected(selectedSeg.alloc.id)}
                              />
                            ) : null}
                            {painting ? (
                              <View
                                pointerEvents="none"
                                style={[
                                  styles.bar,
                                  {
                                    left: Math.min(paint.startIndex, paint.endIndex) * MATRIX_W + 3,
                                    width: (Math.abs(paint.endIndex - paint.startIndex) + 1) * MATRIX_W - 6,
                                    height: barHeight(paint.percent),
                                    backgroundColor: withAlpha(colors.brand, '88'),
                                    borderColor: colors.brand,
                                  },
                                ]}
                              >
                                <Text numberOfLines={1} style={styles.barText}>{formatPercent(paint.percent)}</Text>
                              </View>
                            ) : null}
                          </View>
                        );
                      })}
                      {personAllocs.some((alloc) => alloc.id === selectedId) ? (
                        <View pointerEvents="none" style={{ height: 36 }} />
                      ) : null}
                    </View>
                  </ScrollView>
                </View>

                {rows.length === 0 ? (
                  <Text style={[styles.cardSub, { color: colors.muted }]}>
                    Ingen prosjekt med timer de siste tre månedene. Legg til et prosjekt under, eller et dummy-prosjekt for å prøve belegg.
                  </Text>
                ) : null}

                <View style={styles.chips}>
                  {canWrite ? (
                    <Pressable onPress={() => addDummy(person)} style={[styles.chip, styles.dummyChip, { borderColor: colors.brand }]} nativeID="produktivitet-dummy">
                      <Ionicons name="add" size={16} color={colors.brand} />
                      <Text style={{ color: colors.brand, fontWeight: '700' }}>Dummy-prosjekt</Text>
                    </Pressable>
                  ) : null}
                </View>

                <TextInput
                  value={openId === person.id ? otherQuery : ''}
                  onChangeText={setOtherQuery}
                  placeholder="Legg til annet aktivt prosjekt"
                  placeholderTextColor={colors.muted}
                  style={[styles.otherInput, { color: colors.ink, borderColor: colors.line }]}
                />
                {otherQuery.trim() ? (
                  <View style={styles.chips}>
                    {projects
                      .filter((project) => projectLabel(project).toLowerCase().includes(otherQuery.trim().toLowerCase()))
                      .filter((project) => !rows.some((row) => row.projectId === project.id))
                      .slice(0, 8)
                      .map((project) => (
                        <Pressable key={project.id} onPress={() => { addProjectBar(person, project, origin); setOtherQuery(''); }} style={[styles.chip, { borderColor: colors.line }]}>
                          <Text style={{ color: colors.ink }}>{projectLabel(project)}</Text>
                        </Pressable>
                      ))}
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function shiftWeek(key, delta) {
  const rows = weekKeys(key, Math.abs(delta) + 1);
  if (delta >= 0) return rows[delta] || key;
  const back = weekKeys(key, 1)[0];
  const [y, m, d] = back.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12);
  dt.setDate(dt.getDate() + delta * 7);
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${month}-${day}`;
}

function revealEditor() {
  if (typeof document === 'undefined') return;
  setTimeout(() => {
    const node = document.getElementById('produktivitet-editor');
    if (!node?.getBoundingClientRect) return;
    const rect = node.getBoundingClientRect();
    const visible = rect.height > 0 && rect.top >= 8 && rect.bottom <= window.innerHeight - 8;
    if (visible) return;
    node.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, 30);
}

function barHeight(percent) {
  const n = Math.max(0, Math.min(150, Number(percent) || 0));
  const room = ROW_H - 18;
  return Math.max(8, Math.min(room, Math.round((n / 100) * room)));
}

function freeTone(free, capacity) {
  if (!(capacity > 0) || free <= 0.05) return '#fecdd3';
  const ratio = free / capacity;
  if (ratio < 0.25) return '#fed7aa';
  if (ratio < 0.6) return '#fde68a';
  return '#bbf7d0';
}

function segmentsFor(row, allocs, weeks, todayKey) {
  const mine = (allocs || []).filter((alloc) => (
    row.allocId
      ? alloc.id === row.allocId
      : alloc.projectId === row.projectId && alloc.source !== 'dummy'
  ));
  const todayIndex = (weeks || []).findIndex((key) => key >= todayKey);
  return mine.map((alloc) => {
    const place = placement(alloc, weeks);
    if (!place) return null;
    let { startIndex, span } = place;
    if (todayIndex >= 0 && startIndex < todayIndex) {
      span -= todayIndex - startIndex;
      startIndex = todayIndex;
    }
    if (span <= 0) return null;
    return { alloc, startIndex, span };
  }).filter(Boolean);
}

function AllocationSettings({
  colors,
  alloc,
  canWrite,
  percentDraft,
  hoursDraft,
  top,
  left,
  caret,
  onPercent,
  onHours,
  onFrom,
  onTo,
  onRemove,
}) {
  return (
    <View
      nativeID="produktivitet-editor"
      pointerEvents="auto"
      onPointerDown={(event) => event?.stopPropagation?.()}
      style={[
        styles.editor,
        {
          top,
          left,
          borderColor: colors.line,
          backgroundColor: colors.card || '#ffffff',
        },
      ]}
    >
      <View
        pointerEvents="none"
        style={[styles.caret, { left: caret, borderColor: colors.line, backgroundColor: colors.card || '#ffffff' }]}
      />
      <View style={styles.editorLine}>
        <TextInput
          value={percentDraft}
          editable={canWrite}
          onChangeText={onPercent}
          keyboardType="decimal-pad"
          nativeID="produktivitet-percent"
          accessibilityLabel="Prosent"
          style={[styles.miniInput, { color: colors.ink, borderColor: colors.line }]}
        />
        <Text style={[styles.miniSuffix, { color: colors.muted }]}>%</Text>
        <TextInput
          value={hoursDraft}
          editable={canWrite}
          onChangeText={onHours}
          keyboardType="decimal-pad"
          nativeID="produktivitet-hours"
          accessibilityLabel="Timer/uke"
          style={[styles.miniInput, { color: colors.ink, borderColor: colors.line }]}
        />
        <Text style={[styles.miniSuffix, { color: colors.muted }]}>t</Text>
        {canWrite ? (
          <Pressable
            onPress={onRemove}
            onPointerDown={(event) => event?.stopPropagation?.()}
            accessibilityRole="button"
            accessibilityLabel="Fjern belegg"
            nativeID="produktivitet-remove"
            hitSlop={8}
            style={styles.deleteBtn}
          >
            <Text style={styles.deleteTxt}>×</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.editorLine}>
        <DateChip
          colors={colors}
          label="Fra"
          value={alloc.start || ''}
          editable={canWrite}
          onChange={onFrom}
          nativeID="produktivitet-from"
        />
        <Text style={[styles.miniSuffix, { color: colors.muted }]}>–</Text>
        <DateChip
          colors={colors}
          label="Til"
          value={allocationInclusiveEnd(alloc)}
          editable={canWrite}
          onChange={onTo}
          nativeID="produktivitet-to"
        />
      </View>
    </View>
  );
}

function DateChip({ colors, label, value, editable, onChange, nativeID }) {
  const [text, setText] = useState(value || '');
  useEffect(() => { setText(value || ''); }, [value]);
  const shown = weekMeta(value).date || '–';
  const commit = (next) => {
    const raw = String(next || '');
    setText(raw);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return;
    onChange(raw);
  };
  return (
    <View nativeID={nativeID} style={[styles.dateChip, { borderColor: colors.line }]}>
      <Text style={[styles.dateChipLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.dateChipValue, { color: colors.ink }]}>{shown}</Text>
      {Platform.OS === 'web' ? (
        <input
          type="date"
          value={value || ''}
          disabled={!editable}
          aria-label={label}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => commit(event.target.value)}
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0,
            width: '100%',
            height: '100%',
            border: 'none',
            cursor: 'pointer',
          }}
        />
      ) : (
        <TextInput
          value={text}
          editable={editable}
          onChangeText={commit}
          placeholder="ÅÅÅÅ-MM-DD"
          autoCapitalize="none"
          accessibilityLabel={label}
          style={styles.nativeDate}
        />
      )}
    </View>
  );
}

function monthBands(weeks) {
  const bands = [];
  for (const key of weeks) {
    const meta = weekMeta(key);
    const label = `${meta.month} ${meta.year}`;
    const last = bands[bands.length - 1];
    if (last && last.label === label) last.span += 1;
    else bands.push({ key, label, span: 1 });
  }
  return bands;
}

const styles = StyleSheet.create({
  page: { gap: 12 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 3, gap: 2 },
  segmentBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, minWidth: 220, flexGrow: 1 },
  searchInput: { flex: 1, paddingVertical: 8, fontSize: 15 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  iconBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  todayBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  weekHours: { fontSize: 13, marginLeft: 4 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, minWidth: 160, flexGrow: 1 },
  statLabel: { fontSize: 12, fontWeight: '600' },
  statValue: { fontSize: 26, fontWeight: '700', marginTop: 2 },
  statHint: { fontSize: 12, marginTop: 2 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardSub: { fontSize: 13, lineHeight: 18 },
  axisRow: { flexDirection: 'row' },
  axisCell: { width: WEEK_W, alignItems: 'center', gap: 2 },
  axisWeek: { fontSize: 11, fontWeight: '700' },
  axisPct: { fontSize: 11, fontWeight: '700' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 5 },
  person: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 10 },
  personHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  personText: { flex: 1, gap: 2 },
  personName: { fontSize: 16, fontWeight: '700' },
  personMeta: { fontSize: 12 },
  personStats: { alignItems: 'flex-end', gap: 2 },
  personPct: { fontSize: 18, fontWeight: '700' },
  heat: { flexDirection: 'row', gap: 3, height: 8 },
  heatCell: { flex: 1, borderRadius: 3 },
  expand: { gap: 10 },
  monthRow: { flexDirection: 'row', height: 18 },
  monthBand: { paddingBottom: 4 },
  monthLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  weekHead: { flexDirection: 'row', height: 34 },
  weekHeadCell: { width: MATRIX_W, alignItems: 'center', justifyContent: 'center', height: 34 },
  weekNo: { fontSize: 11, fontWeight: '700' },
  weekDate: { fontSize: 10 },
  matrix: { flexDirection: 'row', alignItems: 'flex-start' },
  labelCol: { flexShrink: 0 },
  labelHead: { height: 52, justifyContent: 'flex-end', paddingBottom: 6, paddingRight: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  labelSum: { height: ROW_H, justifyContent: 'center', paddingRight: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  sumLabel: { fontSize: 12, fontWeight: '700' },
  labelCell: { height: ROW_H, justifyContent: 'center', paddingRight: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: 1 },
  rowName: { fontSize: 13, fontWeight: '700' },
  rowMeta: { fontSize: 11 },
  sumRow: { flexDirection: 'row', height: ROW_H },
  matrixRow: { flexDirection: 'row', height: ROW_H, position: 'relative' },
  matrixRowActive: { zIndex: 8 },
  matrixCell: { width: MATRIX_W, height: ROW_H, borderLeftWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 3 },
  cellText: { fontSize: 11, fontWeight: '600' },
  bar: { position: 'absolute', top: 16, borderRadius: 5, borderWidth: 1, cursor: 'grab' },
  resize: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 10, cursor: 'ew-resize' },
  barPct: { position: 'absolute', top: -15, left: 2, fontSize: 10, fontWeight: '800', color: '#1e3a8a' },
  barText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  pctAbove: { fontSize: 10, fontWeight: '800' },
  actualBar: { position: 'absolute', left: 6, right: 6, bottom: 4, borderRadius: 4 },
  absenceMark: { marginHorizontal: 3, marginVertical: 8, flex: 1, alignSelf: 'stretch', borderWidth: 2, borderStyle: 'dashed', borderColor: '#c2410c', borderRadius: 4, backgroundColor: '#ffedd5', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 1 },
  absenceText: { color: '#9a3412', fontSize: 8, fontWeight: '800', textAlign: 'center' },
  freeLane: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  freeCaption: { width: 52, paddingBottom: 8 },
  freeRow: { flexDirection: 'row', height: 28 },
  freeCell: { width: MATRIX_W, height: 28, borderLeftWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  editor: {
    position: 'absolute',
    width: POPUP_W,
    zIndex: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingTop: 5,
    paddingBottom: 4,
    gap: 3,
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  caret: {
    position: 'absolute',
    top: -4,
    width: 8,
    height: 8,
    borderLeftWidth: 1,
    borderTopWidth: 1,
    transform: [{ rotate: '45deg' }],
  },
  editorLine: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  miniInput: {
    borderWidth: 1,
    borderRadius: 7,
    width: 38,
    paddingHorizontal: 2,
    paddingVertical: 1,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  miniSuffix: { fontSize: 11, fontWeight: '700' },
  dateChip: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  dateChipLabel: { fontSize: 9, fontWeight: '700' },
  dateChipValue: { fontSize: 12, fontWeight: '700' },
  nativeDate: { width: 78, fontSize: 11, paddingVertical: 0 },
  sectionLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  dummyChip: { flexDirection: 'row', alignItems: 'center', borderStyle: 'dashed' },
  otherInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  inspector: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 },
  nameInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, fontWeight: '600' },
  inspectorRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '600' },
  fieldInput: { borderWidth: 1, borderRadius: 10, minWidth: 72, paddingHorizontal: 8, paddingVertical: 6, fontSize: 15 },
  deleteBtn: {
    marginLeft: 'auto',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff1f2',
    cursor: 'pointer',
  },
  deleteTxt: { color: '#e11d48', fontWeight: '800', fontSize: 16, lineHeight: 18 },
});
