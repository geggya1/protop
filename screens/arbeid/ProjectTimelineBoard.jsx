import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { INTENSITY_SCALE, addDays, formatHours, toDateKey } from '../../src/capacity/plan';
import {
  ACTIVE_MONTHS,
  RECENT_WEEKS,
  TIMELINE_ZOOMS,
  activitySegments,
  formatDay,
  hoursRangeFor,
  monthWindow,
  placementLabel,
  quarterBands,
  shiftAnchor,
  spanPlacement,
  spanSourceLabel,
  timelineRows,
  timelineStats,
  xForDay,
} from '../../src/project/timeline';
import { BREAKPOINTS } from '../../src/ui/layout.js';

const ROW_H = 48;
const PLAN_TOP = 9;
const PLAN_H = 14;
const WORK_TOP = 29;
const WORK_H = 10;
const HEAD_H = 40;

/** Planlagt periode i fiolett, så den skiller seg fra de blå timene. */
export const PLAN_COLOR = '#8b93f0';
export const OPTION_COLOR = '#d9dcfb';
const DONE_PLAN_COLOR = '#c4c9d4';
const DONE_OPTION_COLOR = '#e6e9ef';
const TODAY_COLOR = '#e11d48';

export function timelineLabelWidth(screenWidth) {
  const width = Number(screenWidth) || 0;
  if (width > 0 && width < BREAKPOINTS.tablet) return 132;
  if (width > 0 && width < BREAKPOINTS.desktop) return 190;
  return 260;
}

function withAlpha(hex, alpha) {
  const raw = String(hex || '').replace('#', '');
  if (raw.length !== 6) return hex;
  return `#${raw}${alpha}`;
}

function monthText(month, monthW) {
  if (monthW >= 26) return month.label;
  if (monthW >= 11) return month.label.slice(0, 1).toUpperCase();
  return '';
}

function windowLabel(months) {
  if (!months.length) return '';
  const first = months[0];
  const last = months[months.length - 1];
  return `${first.label} ${first.year} – ${last.label} ${last.year}`;
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

/** Kvartalsstriper og dagens linje bak radene i en gruppe. */
function Backdrop({ colors, months, monthW, labelW, todayX }) {
  const bands = quarterBands(months);
  return (
    <View pointerEvents="none" style={[styles.backdrop, { left: labelW, width: months.length * monthW }]}>
      {bands.map((band) => (
        <View
          key={band.key}
          style={[
            styles.band,
            {
              left: band.start * monthW,
              width: band.span * monthW,
              backgroundColor: band.quarter % 2 === 0 ? (colors.sunken || colors.bg) : 'transparent',
              borderColor: colors.line,
            },
          ]}
        />
      ))}
      {todayX != null ? <View style={[styles.todayLine, { left: todayX }]} /> : null}
    </View>
  );
}

function Header({ colors, months, monthW, labelW, todayX }) {
  const bands = quarterBands(months);
  const quarterW = monthW * 3;
  const years = [];
  months.forEach((month, index) => {
    const last = years[years.length - 1];
    if (last && last.year === month.year) last.span += 1;
    else years.push({ year: month.year, start: index, span: 1 });
  });
  const wideQuarters = quarterW >= 72;
  return (
    <View style={[styles.head, { borderColor: colors.line }]}>
      <View style={{ width: labelW, justifyContent: 'flex-end', paddingBottom: 4 }}>
        <Text style={[styles.headLabel, { color: colors.muted }]}>Prosjekt</Text>
      </View>
      <View style={{ width: months.length * monthW, height: HEAD_H }}>
        <View style={styles.headRow}>
          {wideQuarters
            ? bands.map((band) => (
              <View key={band.key} style={[styles.headCell, { left: band.start * monthW, width: band.span * monthW }]}>
                <Text numberOfLines={1} style={[styles.headTop, { color: colors.ink }]}>{band.label}</Text>
              </View>
            ))
            : years.map((row) => (
              <View key={row.year} style={[styles.headCell, { left: row.start * monthW, width: row.span * monthW }]}>
                <Text numberOfLines={1} style={[styles.headTop, { color: colors.ink }]}>{row.span * monthW >= 30 ? String(row.year) : ''}</Text>
              </View>
            ))}
        </View>
        <View style={[styles.headRow, { top: 20 }]}>
          {wideQuarters
            ? months.map((month, index) => (
              <View key={month.key} style={[styles.headCell, { left: index * monthW, width: monthW }]}>
                <Text numberOfLines={1} style={[styles.headMonth, { color: colors.muted }]}>{monthText(month, monthW)}</Text>
              </View>
            ))
            : bands.map((band) => (
              <View key={band.key} style={[styles.headCell, { left: band.start * monthW, width: band.span * monthW }]}>
                <Text numberOfLines={1} style={[styles.headMonth, { color: colors.muted }]}>{band.span * monthW >= 18 ? `Q${band.quarter}` : ''}</Text>
              </View>
            ))}
        </View>
        {todayX != null ? <View style={[styles.todayLine, { left: todayX }]} /> : null}
      </View>
    </View>
  );
}

function PlanLane({ row, months, monthW, colors }) {
  const { span } = row;
  const fill = row.active ? PLAN_COLOR : DONE_PLAN_COLOR;
  const optionFill = row.active ? OPTION_COLOR : DONE_OPTION_COLOR;
  const total = months.length * monthW;
  if (span.start && span.end) {
    const main = spanPlacement(span.start, span.end, months, monthW);
    const option = span.optionEnd ? spanPlacement(addDays(span.end, 1), span.optionEnd, months, monthW) : null;
    return (
      <>
        {main ? (
          <View
            nativeID={`fremdrift-plan-${row.id}`}
            style={[
              styles.plan,
              {
                left: main.left,
                width: main.width,
                backgroundColor: fill,
                borderTopLeftRadius: main.openStart ? 0 : 4,
                borderBottomLeftRadius: main.openStart ? 0 : 4,
                borderTopRightRadius: main.openEnd || option ? 0 : 4,
                borderBottomRightRadius: main.openEnd || option ? 0 : 4,
              },
            ]}
          />
        ) : null}
        {option ? (
          <View
            nativeID={`fremdrift-option-${row.id}`}
            style={[
              styles.plan,
              {
                left: option.left,
                width: option.width,
                backgroundColor: optionFill,
                borderTopLeftRadius: main ? 0 : 4,
                borderBottomLeftRadius: main ? 0 : 4,
                borderTopRightRadius: option.openEnd ? 0 : 4,
                borderBottomRightRadius: option.openEnd ? 0 : 4,
              },
            ]}
          />
        ) : null}
      </>
    );
  }
  if (span.start || span.end) {
    // Bare den ene datoen: stiplet stolpe mot kanten av vinduet.
    const from = span.start ? span.start : `${months[0].key}-01`;
    const to = span.end ? span.end : addDays(`${months[months.length - 1].key}-01`, 40);
    const open = spanPlacement(from, to, months, monthW);
    if (!open) return null;
    return (
      <View
        nativeID={`fremdrift-plan-${row.id}`}
        style={[
          styles.plan,
          {
            left: open.left,
            width: Math.min(open.width, total - open.left),
            backgroundColor: withAlpha(fill, '33'),
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: fill,
          },
        ]}
      />
    );
  }
  return (
    <Text numberOfLines={1} style={[styles.planMissing, { color: colors.muted }]}>
      Ingen planlagt periode
    </Text>
  );
}

function WorkLane({ row, months, monthW, fullWeekHours, today }) {
  const segments = activitySegments(row.weeks, months, monthW, { fullWeekHours, today });
  return segments.map((seg) => (
    <View
      key={`${row.id}-${seg.from}`}
      nativeID={`fremdrift-work-${row.id}-${seg.from}`}
      style={[
        styles.work,
        {
          left: seg.left,
          width: seg.width,
          backgroundColor: seg.tone.color,
          borderTopLeftRadius: seg.joinLeft ? 0 : 2,
          borderBottomLeftRadius: seg.joinLeft ? 0 : 2,
          borderTopRightRadius: seg.joinRight ? 0 : 2,
          borderBottomRightRadius: seg.joinRight ? 0 : 2,
        },
      ]}
    />
  ));
}

function Detail({ row, colors, hoursFrom }) {
  const { span, project } = row;
  const source = spanSourceLabel(span);
  const planned = span.start || span.end
    ? `${formatDay(span.start) || '?'} – ${formatDay(span.end) || '?'}`
    : 'Ingen datoer på prosjekt eller avtale';
  const lines = [
    { label: 'Plassering', value: placementLabel(row) },
    { label: 'Planlagt', value: planned },
    source ? { label: 'Kilde', value: span.contractTitle && source !== 'Prosjekt' ? `${source} · ${span.contractTitle}` : source } : null,
    span.optionEnd ? { label: 'Opsjon / forlengelse', value: `til ${formatDay(span.optionEnd)}` } : null,
    {
      label: 'Utført',
      value: row.totalHours > 0
        ? `${formatHours(row.totalHours)} t siden ${formatDay(hoursFrom)} · siste føring ${formatDay(row.lastActivity || row.lastWorked)}`
        : `Ingen timer siden ${formatDay(hoursFrom)}`,
    },
    { label: `Siste ${RECENT_WEEKS} uker`, value: `${formatHours(row.recentHours)} t` },
    { label: 'Status', value: [row.phase, row.client, project?.manager ? `Leder ${project.manager}` : ''].filter(Boolean).join(' · ') },
  ].filter(Boolean);
  return (
    <View style={[styles.detail, { backgroundColor: colors.card, borderColor: colors.line }]} nativeID={`fremdrift-detail-${row.id}`}>
      {lines.map((line) => (
        <View key={line.label} style={styles.detailLine}>
          <Text style={[styles.detailLabel, { color: colors.muted }]}>{line.label}</Text>
          <Text style={[styles.detailValue, { color: colors.ink }]}>{line.value}</Text>
        </View>
      ))}
    </View>
  );
}

function Group({
  rows, colors, months, monthW, labelW, todayX, today, fullWeekHours, openId, onToggle, hoursFrom,
}) {
  return (
    <View style={styles.group}>
      <Backdrop colors={colors} months={months} monthW={monthW} labelW={labelW} todayX={todayX} />
      {rows.map((row) => {
        const open = openId === row.id;
        return (
          <View key={row.id}>
            <Pressable
              onPress={() => onToggle(row.id)}
              nativeID={`fremdrift-row-${row.id}`}
              style={[styles.row, { borderColor: colors.line }, open && { backgroundColor: withAlpha(colors.brand, '0d') }]}
            >
              <View style={[styles.labelCell, { width: labelW }]}>
                <Text numberOfLines={1} style={[styles.rowName, { color: row.active ? colors.ink : colors.muted }]}>{row.label}</Text>
                <Text numberOfLines={1} style={[styles.rowMeta, { color: colors.muted }]}>
                  {[row.client, row.phase].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <View style={[styles.track, { width: months.length * monthW }]}>
                <PlanLane row={row} months={months} monthW={monthW} colors={colors} />
                <WorkLane row={row} months={months} monthW={monthW} fullWeekHours={fullWeekHours} today={today} />
              </View>
            </Pressable>
            {open ? <Detail row={row} colors={colors} hoursFrom={hoursFrom} /> : null}
          </View>
        );
      })}
    </View>
  );
}

export default function ProjectTimelineBoard({
  colors,
  projects = [],
  contracts = [],
  timeEntries = [],
  fullWeekHours = 40,
  loadingHours = false,
  today: todayProp = '',
  onRange,
}) {
  const today = todayProp || toDateKey(new Date());
  const { width: screenWidth } = useWindowDimensions();
  const [zoomId, setZoomId] = useState('1');
  const [anchor, setAnchor] = useState(today);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [measured, setMeasured] = useState(0);

  const zoom = TIMELINE_ZOOMS.find((row) => row.id === zoomId) || TIMELINE_ZOOMS[0];
  const months = useMemo(() => monthWindow(anchor, zoom.months), [anchor, zoom.months]);
  const range = useMemo(() => hoursRangeFor(months, today), [months, today]);
  const labelW = timelineLabelWidth(screenWidth);
  const available = measured || Math.max(240, (Number(screenWidth) || 390) - 32);
  const monthW = Math.max(4, (available - labelW) / months.length);
  const todayRaw = xForDay(today, months, monthW);
  const todayX = todayRaw >= 0 && todayRaw <= months.length * monthW ? todayRaw : null;

  useEffect(() => {
    onRange?.(range);
  }, [range.fromDate, range.toDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => timelineRows({
    projects, contracts, timeEntries, query, today, hoursFrom: range.fromDate,
  }), [projects, contracts, timeEntries, query, today, range.fromDate]);
  const stats = useMemo(() => timelineStats(groups.active, today), [groups.active, today]);
  const toggle = (id) => setOpenId((current) => (current === id ? '' : id));
  const shared = {
    colors, months, monthW, labelW, todayX, today, fullWeekHours, openId, onToggle: toggle, hoursFrom: range.fromDate,
  };
  const hasProjects = groups.active.length + groups.inactive.length > 0;

  return (
    <View style={styles.page} nativeID="fremdrift-board">
      <View style={styles.toolbar}>
        <View style={[styles.search, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Søk prosjekt eller kunde"
            placeholderTextColor={colors.muted}
            style={[styles.searchInput, { color: colors.ink }]}
            nativeID="fremdrift-search"
          />
        </View>
        <View style={[styles.segment, { backgroundColor: colors.sunken || colors.bg, borderColor: colors.line }]}>
          {TIMELINE_ZOOMS.map((row) => {
            const on = zoomId === row.id;
            return (
              <Pressable
                key={row.id}
                onPress={() => setZoomId(row.id)}
                style={[styles.segmentBtn, on && { backgroundColor: colors.card }]}
                nativeID={`fremdrift-zoom-${row.id}`}
              >
                <Text style={{ color: on ? colors.ink : colors.muted, fontWeight: '600' }}>{row.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.navRow}>
          <Pressable onPress={() => setAnchor(shiftAnchor(anchor, -3))} accessibilityRole="button" accessibilityLabel="Tre måneder tilbake" style={[styles.iconBtn, { borderColor: colors.line }]} nativeID="fremdrift-prev">
            <Ionicons name="chevron-back" size={18} color={colors.ink} />
          </Pressable>
          <Pressable onPress={() => setAnchor(today)} style={[styles.todayBtn, { borderColor: colors.line }]} nativeID="fremdrift-today">
            <Text style={{ color: colors.ink, fontWeight: '600' }}>{windowLabel(months)}</Text>
          </Pressable>
          <Pressable onPress={() => setAnchor(shiftAnchor(anchor, 3))} accessibilityRole="button" accessibilityLabel="Tre måneder fram" style={[styles.iconBtn, { borderColor: colors.line }]} nativeID="fremdrift-next">
            <Ionicons name="chevron-forward" size={18} color={colors.ink} />
          </Pressable>
          {loadingHours ? <Text style={[styles.loading, { color: colors.muted }]}>Henter timer …</Text> : null}
        </View>
      </View>

      <View style={styles.stats}>
        <Stat colors={colors} label="Aktive prosjekter" value={String(stats.active)} hint={`${groups.inactive.length} deaktivert i skuffen`} />
        <Stat colors={colors} label="Aktivitet nå" value={String(stats.working)} hint={`Timer siste ${RECENT_WEEKS} uker`} />
        <Stat colors={colors} label="Avtalt slutt snart" value={String(stats.endingSoon)} hint="Innen 3 måneder" />
        <Stat colors={colors} label="Mangler periode" value={String(stats.missing)} hint="Uten start eller slutt" />
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendBar, { backgroundColor: PLAN_COLOR }]} />
          <Text style={[styles.legendText, { color: colors.muted }]}>Planlagt periode (prosjekt / avtale)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendBar, { backgroundColor: OPTION_COLOR }]} />
          <Text style={[styles.legendText, { color: colors.muted }]}>Opsjon / forlengelse</Text>
        </View>
        <View style={styles.legendItem}>
          {INTENSITY_SCALE.slice(1, 6).map((step) => (
            <View key={step.id} style={[styles.legendWork, { backgroundColor: step.color }]} />
          ))}
          <Text style={[styles.legendText, { color: colors.muted }]}>
            {`Utført arbeid per uke, mørkere er mer (${formatHours(fullWeekHours)} t = én full uke)`}
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendToday]} />
          <Text style={[styles.legendText, { color: colors.muted }]}>I dag</Text>
        </View>
      </View>

      <View
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}
        onLayout={(event) => {
          const width = Math.round(event?.nativeEvent?.layout?.width || 0) - 2;
          if (width > 0 && Math.abs(width - measured) > 1) setMeasured(width);
        }}
        nativeID="fremdrift-matrix"
      >
        {!hasProjects ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: colors.ink }]}>
              {query ? 'Ingen treff' : 'Ingen prosjekter ennå'}
            </Text>
            <Text style={[styles.emptySub, { color: colors.muted }]}>
              {query
                ? 'Søket gir ingen prosjekter. Prøv prosjektnummer, navn eller kunde.'
                : 'Prosjekter med start og slutt, eller en koblet avtale, vises her med planlagt periode og utført arbeid.'}
            </Text>
          </View>
        ) : (
          <>
            <Header colors={colors} months={months} monthW={monthW} labelW={labelW} todayX={todayX} />
            {groups.active.length ? (
              <Group rows={groups.active} {...shared} />
            ) : (
              <Text style={[styles.emptySub, { color: colors.muted, padding: 12 }]}>Ingen aktive prosjekter.</Text>
            )}
            {groups.inactive.length ? (
              <>
                <Pressable
                  onPress={() => setShowDone((value) => !value)}
                  style={[styles.drawer, { borderColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}
                  nativeID="fremdrift-drawer"
                >
                  <Ionicons name={showDone ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.ink} />
                  <View style={styles.drawerTexts}>
                    <Text style={[styles.drawerText, { color: colors.ink }]}>
                      {`Deaktiverte prosjekter (${groups.inactive.length})`}
                    </Text>
                    <Text style={[styles.drawerHint, { color: colors.muted }]}>
                      {`Ingen timer siste ${ACTIVE_MONTHS} måneder, og ingen planlagt sluttdato frem i tid`}
                    </Text>
                  </View>
                </Pressable>
                {showDone ? <Group rows={groups.inactive} {...shared} /> : null}
              </>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 12 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, minWidth: 220, flexGrow: 1 },
  searchInput: { flex: 1, paddingVertical: 8, fontSize: 15 },
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 3, gap: 2 },
  segmentBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  iconBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  todayBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  loading: { fontSize: 12 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, minWidth: 150, flexGrow: 1 },
  statLabel: { fontSize: 12, fontWeight: '600' },
  statValue: { fontSize: 26, fontWeight: '700', marginTop: 2 },
  statHint: { fontSize: 12, marginTop: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, maxWidth: '100%' },
  legendBar: { width: 22, height: 10, borderRadius: 3 },
  legendWork: { width: 8, height: 8, borderRadius: 2, marginRight: -4 },
  legendToday: { width: 2, height: 14, backgroundColor: TODAY_COLOR },
  legendText: { fontSize: 12, marginLeft: 4, flexShrink: 1 },
  card: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  head: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  headLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, paddingLeft: 12 },
  headRow: { position: 'absolute', left: 0, right: 0, top: 2, height: 18 },
  headCell: { position: 'absolute', top: 0, height: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  headTop: { fontSize: 12, fontWeight: '700' },
  headMonth: { fontSize: 10, fontWeight: '600' },
  group: { position: 'relative' },
  backdrop: { position: 'absolute', top: 0, bottom: 0 },
  band: { position: 'absolute', top: 0, bottom: 0, borderLeftWidth: StyleSheet.hairlineWidth },
  todayLine: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: TODAY_COLOR, opacity: 0.75 },
  row: { flexDirection: 'row', height: ROW_H, borderBottomWidth: StyleSheet.hairlineWidth },
  labelCell: { justifyContent: 'center', paddingLeft: 12, paddingRight: 8, gap: 1 },
  rowName: { fontSize: 13, fontWeight: '700' },
  rowMeta: { fontSize: 11 },
  track: { height: ROW_H, position: 'relative' },
  plan: { position: 'absolute', top: PLAN_TOP, height: PLAN_H },
  planMissing: { position: 'absolute', top: PLAN_TOP - 1, left: 6, fontSize: 10, fontStyle: 'italic' },
  work: { position: 'absolute', top: WORK_TOP, height: WORK_H },
  detail: { borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  detailLine: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detailLabel: { fontSize: 12, fontWeight: '600', minWidth: 120 },
  detailValue: { fontSize: 12, flexShrink: 1 },
  drawer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  drawerTexts: { flex: 1, gap: 1 },
  drawerText: { fontSize: 13, fontWeight: '700' },
  drawerHint: { fontSize: 11 },
  empty: { padding: 16, gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptySub: { fontSize: 13, lineHeight: 18 },
});
