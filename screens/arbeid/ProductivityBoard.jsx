import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { displayName } from '../../src/employees/model';
import {
  HORIZON_CHOICES,
  TONE_COLOR,
  addAllocation,
  firstSlackWeek,
  formatHours,
  formatPercent,
  kindLabel,
  kindOf,
  loadTone,
  makeAllocation,
  matchesKind,
  occupancy,
  packLanes,
  patchAllocation,
  projectLabel,
  projectsForEmployee,
  removeAllocation,
  shiftPreview,
  suggestSpan,
  weekKeys,
  weekMeta,
  weekSeries,
} from '../../src/capacity/plan';

const WEEK_W = 54;
const LANE_H = 40;
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
  members = [],
  plan,
  canWrite = false,
  onPlan,
  initialOpenId = '',
  initialView = 'people',
  initialKind = 'staff',
  fullDayHours = 8,
}) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState(initialKind);
  const [view, setView] = useState(initialView);
  const [horizon, setHorizon] = useState(26);
  const [origin, setOrigin] = useState(() => weekKeys(new Date(), 1)[0]);
  const [openId, setOpenId] = useState(initialOpenId);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState(null);
  const [hover, setHover] = useState(null);
  const [otherQuery, setOtherQuery] = useState('');
  const [percentDraft, setPercentDraft] = useState('');
  const [hoursDraft, setHoursDraft] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const dragRef = useRef(null);
  const tracks = useRef({});
  const hoverRef = useRef(null);
  const suppressPress = useRef(false);
  const api = useRef({});

  const weeks = useMemo(() => weekKeys(origin, horizon), [origin, horizon]);
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
    () => weekSeries(visiblePeople, allocations, weeks, weekHours),
    [visiblePeople, allocations, weeks, weekHours],
  );
  const thisWeek = series[0];
  const peak = series.reduce((best, row) => (row.ofContract > (best?.ofContract || 0) ? row : best), null);
  const companySlack = series.find((row) => row.freeHours > 0.05);

  function commit(next) {
    onPlan?.(next);
  }

  function shown(alloc) {
    if (draft && draft.id === alloc.id) return { ...alloc, start: draft.start, weeks: draft.weeks };
    return alloc;
  }

  function selectAlloc(alloc) {
    setSelectedId(alloc.id);
    setNameDraft(alloc.name);
    setPercentDraft(String(alloc.percent).replace('.', ','));
    setHoursDraft(formatHours(alloc.hoursPerWeek));
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
    if (!rect) return hoverRef.current?.employeeId === employeeId ? hoverRef.current.index : null;
    const local = pageX - rect.left;
    if (local < 0 || local > rect.width) return null;
    return Math.max(0, Math.min(weeks.length - 1, Math.floor(local / WEEK_W)));
  }

  function onTrackPointerMove(event) {
    const drag = dragRef.current;
    if (!drag) return;
    const { x } = pointOf(event);
    const delta = Math.round((x - drag.x) / WEEK_W);
    if (drag.mode === 'new') {
      const index = weekIndexAt(drag.employeeId, x);
      const next = index == null ? null : { employeeId: drag.employeeId, index };
      hoverRef.current = next;
      setHover(next);
      return;
    }
    const next = shiftPreview(drag.alloc, delta, drag.mode);
    setDraft({ id: drag.alloc.id, start: next.start, weeks: next.weeks });
  }

  function onTrackPointerUp(event) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const { x } = pointOf(event);
    if (drag.mode === 'new') {
      const index = weekIndexAt(drag.employeeId, x);
      hoverRef.current = null;
      setHover(null);
      const moved = Math.abs(x - drag.x) > 6;
      if (!moved || index == null) return;
      suppressPress.current = true;
      addProjectBar(drag.person, drag.project, weeks[index]);
      return;
    }
    const delta = Math.round((x - drag.x) / WEEK_W);
    setDraft(null);
    if (delta !== 0) {
      suppressPress.current = true;
      const next = shiftPreview(drag.alloc, delta, drag.mode);
      patch(drag.alloc.id, drag.mode === 'resize' ? { weeks: next.weeks } : { start: next.start });
    }
  }

  api.current = { onTrackPointerMove, onTrackPointerUp };

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

  function beginDrag(event, payload) {
    if (!canWrite) return;
    const now = Date.now();
    const current = dragRef.current;
    if (payload.mode === 'move' && current?.mode === 'resize' && now - (current.at || 0) < 40) return;
    event?.preventDefault?.();
    dragRef.current = { ...payload, x: pointOf(event).x, at: now };
    if (payload.alloc) selectAlloc(payload.alloc);
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
        const now = occupancy(person, allocations, weeks[0], weekHours);
        const slack = firstSlackWeek(person, allocations, weeks, weekHours);
        const mine = projectsForEmployee(projects, members, person.id);
        const personAllocs = allocations.filter((row) => row.employeeId === person.id).map(shown);
        const packed = packLanes(personAllocs, weeks);
        const plannedIds = new Set(personAllocs.filter((row) => row.projectId).map((row) => row.projectId));
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
            <View style={styles.heat}>
              {weeks.map((key) => {
                const row = occupancy(person, allocations, key, weekHours);
                return (
                  <View
                    key={key}
                    style={[styles.heatCell, { backgroundColor: withAlpha(TONE_COLOR[loadTone(row.ofContract)], row.ofContract > 0 ? 'cc' : '33') }]}
                  />
                );
              })}
            </View>

            {open ? (
              <View style={styles.expand}>
                <ScrollView horizontal showsHorizontalScrollIndicator>
                  <View>
                    <View style={styles.monthRow}>
                      {monthBands(weeks).map((band) => (
                        <View key={band.key} style={[styles.monthBand, { width: band.span * WEEK_W }]}>
                          <Text style={[styles.monthLabel, { color: colors.muted }]}>{band.label}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={styles.weekHead}>
                      {weeks.map((key) => {
                        const meta = weekMeta(key);
                        return (
                          <View key={key} style={styles.weekHeadCell}>
                            <Text style={[styles.weekNo, { color: colors.ink }]}>{meta.short}</Text>
                            <Text style={[styles.weekDate, { color: colors.muted }]}>{meta.date}</Text>
                          </View>
                        );
                      })}
                    </View>
                    <View
                      ref={(node) => { tracks.current[person.id] = node; }}
                      nativeID={`produktivitet-track-${person.id}`}
                      style={[styles.track, { height: Math.max(LANE_H, packed.laneCount * LANE_H + 8), width: weeks.length * WEEK_W }]}
                    >
                      {weeks.map((key, index) => {
                        const hot = hover?.employeeId === person.id && hover.index === index;
                        return (
                          <View
                            key={key}
                            style={[
                              styles.col,
                              { left: index * WEEK_W, backgroundColor: hot ? withAlpha(colors.brand, '18') : 'transparent', borderColor: colors.line },
                            ]}
                          />
                        );
                      })}
                      {packed.items.map(({ alloc, place, lane }) => {
                        const on = selectedId === alloc.id;
                        return (
                          <View
                            key={alloc.id}
                            nativeID={`produktivitet-bar-${alloc.id}`}
                            onPointerDown={(event) => beginDrag(event, { mode: 'move', alloc, employeeId: person.id })}
                            style={[
                              styles.bar,
                              {
                                left: place.startIndex * WEEK_W + 4,
                                width: place.span * WEEK_W - 8,
                                top: 6 + lane * LANE_H,
                                backgroundColor: alloc.color,
                                borderStyle: alloc.source === 'dummy' ? 'dashed' : 'solid',
                                borderColor: on ? '#fff' : 'transparent',
                              },
                            ]}
                          >
                            <Text numberOfLines={1} style={styles.barText}>
                              {`${alloc.name} · ${formatPercent(alloc.percent)}`}
                            </Text>
                            <View
                              style={styles.resize}
                              onPointerDown={(event) => {
                                event?.stopPropagation?.();
                                beginDrag(event, { mode: 'resize', alloc, employeeId: person.id });
                              }}
                            />
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </ScrollView>

                <Text style={[styles.sectionLabel, { color: colors.muted }]}>Aktive prosjekt</Text>
                <View style={styles.chips}>
                  {mine.length === 0 ? (
                    <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen medlemskap på aktive prosjekt.</Text>
                  ) : mine.map((project) => {
                    const planned = plannedIds.has(project.id);
                    return (
                      <Pressable
                        key={project.id}
                        onPress={() => {
                          if (suppressPress.current) {
                            suppressPress.current = false;
                            return;
                          }
                          if (canWrite) addProjectBar(person, project, origin);
                        }}
                        onPointerDown={(event) => beginDrag(event, { mode: 'new', project, person, employeeId: person.id })}
                        style={[styles.chip, { borderColor: colors.line, backgroundColor: planned ? withAlpha(colors.brand, '14') : colors.bg }]}
                      >
                        <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>{projectLabel(project)}</Text>
                        <Text style={{ color: colors.muted, fontSize: 12 }}>{planned ? 'På planen' : 'Dra eller trykk'}</Text>
                      </Pressable>
                    );
                  })}
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
                      .filter((project) => !mine.some((row) => row.id === project.id))
                      .slice(0, 8)
                      .map((project) => (
                        <Pressable key={project.id} onPress={() => { addProjectBar(person, project, origin); setOtherQuery(''); }} style={[styles.chip, { borderColor: colors.line }]}>
                          <Text style={{ color: colors.ink }}>{projectLabel(project)}</Text>
                        </Pressable>
                      ))}
                  </View>
                ) : null}

                {selected && selected.employeeId === person.id ? (
                  <View style={[styles.inspector, { borderColor: colors.line, backgroundColor: colors.bg }]}>
                    <TextInput
                      value={nameDraft}
                      editable={canWrite}
                      onChangeText={setNameDraft}
                      onEndEditing={() => patch(selected.id, { name: nameDraft })}
                      style={[styles.nameInput, { color: colors.ink, borderColor: colors.line }]}
                    />
                    <View style={styles.inspectorRow}>
                      <Text style={[styles.fieldLabel, { color: colors.muted }]}>Prosent</Text>
                      <TextInput
                        value={percentDraft}
                        editable={canWrite}
                        onChangeText={setPercentDraft}
                        onEndEditing={() => patch(selected.id, { percent: percentDraft })}
                        keyboardType="decimal-pad"
                        style={[styles.fieldInput, { color: colors.ink, borderColor: colors.line }]}
                      />
                      <Text style={[styles.fieldLabel, { color: colors.muted }]}>Timer/uke</Text>
                      <TextInput
                        value={hoursDraft}
                        editable={canWrite}
                        onChangeText={setHoursDraft}
                        onEndEditing={() => patch(selected.id, { hoursPerWeek: hoursDraft })}
                        keyboardType="decimal-pad"
                        style={[styles.fieldInput, { color: colors.ink, borderColor: colors.line }]}
                      />
                    </View>
                    <View style={styles.inspectorRow}>
                      <Pressable disabled={!canWrite} onPress={() => patch(selected.id, shiftFields(selected, -1, 'move'))} style={[styles.iconBtn, { borderColor: colors.line }]}>
                        <Ionicons name="arrow-back" size={16} color={colors.ink} />
                      </Pressable>
                      <Pressable disabled={!canWrite} onPress={() => patch(selected.id, shiftFields(selected, 1, 'move'))} style={[styles.iconBtn, { borderColor: colors.line }]}>
                        <Ionicons name="arrow-forward" size={16} color={colors.ink} />
                      </Pressable>
                      <Pressable disabled={!canWrite} onPress={() => patch(selected.id, { weeks: Math.max(1, selected.weeks - 1) })} style={[styles.iconBtn, { borderColor: colors.line }]}>
                        <Text style={{ color: colors.ink, fontWeight: '700' }}>−1u</Text>
                      </Pressable>
                      <Text style={{ color: colors.ink, fontWeight: '600' }}>{`${selected.weeks} uker`}</Text>
                      <Pressable disabled={!canWrite} onPress={() => patch(selected.id, { weeks: selected.weeks + 1 })} style={[styles.iconBtn, { borderColor: colors.line }]}>
                        <Text style={{ color: colors.ink, fontWeight: '700' }}>+1u</Text>
                      </Pressable>
                      {canWrite ? (
                        <Pressable onPress={() => { commit(removeAllocation(plan, selected.id)); setSelectedId(''); }} style={styles.deleteBtn}>
                          <Ionicons name="trash-outline" size={16} color="#e11d48" />
                          <Text style={{ color: '#e11d48', fontWeight: '600' }}>Fjern</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <Text style={[styles.cardSub, { color: colors.muted }]}>
                      {`${formatHours(selected.hoursPerWeek)} t i uken · ${formatPercent(selected.percent)} av full uke. Dra stolpen for å flytte, høyre kant for å endre varighet.`}
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.cardSub, { color: colors.muted }]}>
                    Dra et prosjekt ut på ukene, eller trykk for å legge det på starten av vinduet. Dummy viser belegg som ikke er et ekte prosjekt ennå.
                  </Text>
                )}
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

function shiftFields(alloc, delta, mode) {
  const next = shiftPreview(alloc, delta, mode);
  return mode === 'resize' ? { weeks: next.weeks } : { start: next.start };
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
  monthRow: { flexDirection: 'row' },
  monthBand: { paddingBottom: 4 },
  monthLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  weekHead: { flexDirection: 'row' },
  weekHeadCell: { width: WEEK_W, alignItems: 'center' },
  weekNo: { fontSize: 12, fontWeight: '700' },
  weekDate: { fontSize: 10 },
  track: { position: 'relative', marginTop: 6 },
  col: { position: 'absolute', top: 0, bottom: 0, width: WEEK_W, borderLeftWidth: StyleSheet.hairlineWidth },
  bar: { position: 'absolute', height: 30, borderRadius: 8, borderWidth: 2, justifyContent: 'center', paddingLeft: 8, paddingRight: 12, cursor: 'grab' },
  resize: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 12, cursor: 'ew-resize' },
  barText: { color: '#fff', fontSize: 12, fontWeight: '700' },
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
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 4 },
});
