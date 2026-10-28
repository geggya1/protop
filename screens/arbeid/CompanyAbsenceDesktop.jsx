import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Rect } from 'react-native-svg';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import {
  ABSENCE_REPORT_COLUMNS,
  DEFAULT_ABSENCE_REPORT_COLUMNS,
  absenceReportTotals,
  dayRowAsPeriod,
  filterAbsenceReport,
  formatHours,
  hydrateAbsenceReportRow,
  sortAbsenceReport,
} from '../../src/arbeid/absenceReport.js';
import { parseDate } from '../../src/economy/invoices.js';
import AbsenceOrganizePanel from '../../components/arbeid/AbsenceOrganizePanel';
import { useModuleHeroHosted } from '../../components/ModulePageBg';
import { absenceRoster, absenceYears, buildAbsencePeriodGrid, buildAbsenceWebBoard, summarizeAbsenceSpan } from '../../src/arbeid/absenceDashboard.js';
import { absenceWidgetDestination } from '../../src/arbeid/absenceWidgetNav.js';
import { monthDateRange, monthLabel, parseDateKey, shiftMonth, shortDayLabel, toDateKey, weekAround } from '../../src/arbeid/calendar.js';
import { personnelKind, personnelKindLabel } from '../../src/employees/model.js';

const ink = '#152033';
const muted = '#8B95A6';
const line = '#E6EBF2';
const blue = '#2F6BDB';
const BARS = { ferie: '#2F6BDB', sykdom: '#E15D6A', annet: '#F0A04B' };
const AUDIENCE = [
  { id: 'staff', label: 'Eget personell' },
  { id: 'innleid', label: 'Innleid' },
  { id: 'external', label: 'Eksterne' },
];
const PLANNED_KINDS = [
  { id: 'staff', label: 'Intern' },
  { id: 'innleid', label: 'Innleid' },
  { id: 'external', label: 'Ekstern' },
];
const PLANNED_SORTS = [
  { id: 'date-asc', label: 'Tidligst' },
  { id: 'date-desc', label: 'Senest' },
  { id: 'name', label: 'Navn' },
];
const SPANS = [
  { id: 'dag', label: 'Dag' },
  { id: 'uke', label: 'Uke' },
  { id: 'maned', label: 'Måned' },
];

/** Minste tabellbredde og antall rader per «Vis flere» i fraværsrapporten. */
const TABLE_MIN_FALLBACK = 720;
const PAGE_STEP = 80;

function formatCount(value) {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  if (Number.isInteger(n)) return String(n);
  return String(n).replace('.', ',');
}

function monthTotal(month) {
  return (Number(month?.ferie) || 0) + (Number(month?.sykdom) || 0) + (Number(month?.annet) || 0);
}

function monthTone(month) {
  if (month.sykdom >= month.ferie && month.sykdom >= month.annet && month.sykdom > 0) return BARS.sykdom;
  if (month.annet > month.ferie && month.annet > 0) return BARS.annet;
  return BARS.ferie;
}

function shiftKey(key, delta) {
  const date = parseDateKey(key);
  if (!date) return key;
  date.setDate(date.getDate() + delta);
  return toDateKey(date);
}

function periodOf(span, cursor) {
  const date = parseDateKey(cursor) || new Date();
  if (span === 'dag') {
    const key = toDateKey(date);
    return { start: key, end: key, label: shortDayLabel(date) };
  }
  if (span === 'maned') {
    const range = monthDateRange(date.getFullYear(), date.getMonth());
    return { start: range.fromDate, end: range.toDate, label: monthLabel(date.getFullYear(), date.getMonth()) };
  }
  const week = weekAround(date);
  const start = week[0];
  const end = week[6];
  return {
    start: start.key,
    end: end.key,
    label: `Uke ${start.week} · ${shortDayLabel(start.date)} – ${shortDayLabel(end.date)}`,
  };
}

function stepCursor(span, cursor, delta) {
  if (span === 'maned') {
    const date = parseDateKey(cursor) || new Date();
    const next = shiftMonth(date.getFullYear(), date.getMonth(), delta);
    return toDateKey(new Date(next.year, next.monthIndex, 1));
  }
  return shiftKey(cursor, delta * (span === 'uke' ? 7 : 1));
}

function useAudience(employees) {
  const [kinds, setKinds] = useState({ staff: true, innleid: false, external: false });
  const [includeInactive, setIncludeInactive] = useState(false);
  const selected = AUDIENCE.filter((item) => kinds[item.id]).map((item) => item.id);
  const roster = useMemo(
    () => absenceRoster(employees, { kinds: selected, includeInactive }),
    [employees, selected.join('|'), includeInactive],
  );
  const toggleKind = (id) => setKinds((current) => ({ ...current, [id]: !current[id] }));
  const resetAudience = () => {
    setKinds({ staff: true, innleid: false, external: false });
    setIncludeInactive(false);
  };
  return { kinds, toggleKind, includeInactive, setIncludeInactive, roster, resetAudience };
}

function sortPlannedRows(rows, sort) {
  const copy = [...(rows || [])];
  if (sort === 'date-desc') {
    copy.sort((a, b) => String(b.start).localeCompare(String(a.start))
      || String(a.employeeName).localeCompare(String(b.employeeName), 'nb'));
  } else if (sort === 'name') {
    copy.sort((a, b) => String(a.employeeName).localeCompare(String(b.employeeName), 'nb')
      || String(a.start).localeCompare(String(b.start)));
  } else {
    copy.sort((a, b) => String(a.start).localeCompare(String(b.start))
      || String(a.employeeName).localeCompare(String(b.employeeName), 'nb'));
  }
  return copy;
}

function plannedScopeLabel(employeeId, selectedName, kinds, includeInactive) {
  if (employeeId) return selectedName || 'Ansatt';
  const on = PLANNED_KINDS.filter((item) => kinds[item.id]);
  if (on.length === 1 && on[0].id === 'staff' && !includeInactive) return 'Intern';
  if (!on.length && !includeInactive) return 'Ingen utvalg';
  return 'Utvalget';
}

function nameMatches(name, query) {
  const tokens = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const hay = String(name || '').toLowerCase();
  return tokens.every((token) => hay.includes(token));
}

function useBoard(props) {
  const {
    employees = [], names = {}, employeeId = '', absences = [], adjustments = [],
    fullDayHours = 7.5, today = '', year = '', types,
  } = props;
  return useMemo(() => buildAbsenceWebBoard({
    employees, employeeId, absences, adjustments, fullDayHours, today, names, year, types,
  }), [employees, employeeId, absences, adjustments, fullDayHours, today, names, year, types]);
}

export function CompanyAbsenceDesktop({
  employees = [],
  names = {},
  employeeId = '',
  canChooseEmployee = false,
  onSelectEmployee,
  absences = [],
  adjustments = [],
  fullDayHours = 7.5,
  today = '',
  error = '',
  opening = '',
  onOpeningChange,
  onSaveOpening,
  peopleLoading = false,
  absenceLoading = false,
  types,
}) {
  const { requestShellTab } = useApp();
  const audience = useAudience(employees);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [chartWidth, setChartWidth] = useState(420);
  const [view, setView] = useState('diagram');
  const [span, setSpan] = useState('uke');
  const [cursor, setCursor] = useState(today || '');
  const [yearChoice, setYearChoice] = useState('');
  const period = useMemo(() => periodOf(span, cursor || today), [span, cursor, today]);
  const weekYear = String(period.start || today).slice(0, 4);
  const roster = useMemo(
    () => (employeeId ? employees.filter((row) => row.id === employeeId) : audience.roster),
    [employeeId, employees, audience.roster],
  );
  const dataYears = useMemo(() => absenceYears(absences, roster), [absences, roster]);
  const boardYear = (yearChoice && dataYears.includes(yearChoice))
    ? yearChoice
    : (dataYears.includes(weekYear) ? weekYear : (dataYears[dataYears.length - 1] || weekYear));
  const board = useBoard({
    employees: roster, names, employeeId: '', absences, adjustments, fullDayHours, today, year: boardYear, types,
  });
  const grid = useMemo(() => buildAbsencePeriodGrid({
    employees: roster,
    absences,
    names,
    start: period.start,
    end: period.end,
    fullDayHours,
    types,
  }), [roster, absences, names, period.start, period.end, fullDayHours, types]);
  const spanSummary = useMemo(() => summarizeAbsenceSpan({
    absences,
    employees: roster,
    employeeIds: roster.map((row) => row.id),
    names,
    start: period.start,
    end: period.end,
    today,
    fullDayHours,
    types,
  }), [absences, roster, names, period.start, period.end, today, fullDayHours, types]);
  const earned = board.staff.reduce((sum, person) => sum + (Number(person.earned) || 0), 0);
  const yearUsed = Number(board.yearTotals?.ferie) || 0;
  const remaining = board.staff.reduce((sum, person) => sum + (person.earned ? Number(person.remaining) || 0 : 0), 0);
  const hasQuota = earned > 0;
  const away = spanSummary.away;
  const selectedName = employeeId ? (names[employeeId] || 'Ansatt') : 'Alle i utvalget';
  const openPerson = (id) => {
    if (!canChooseEmployee || !id) return;
    onSelectEmployee?.(id);
  };
  const openSource = (widget) => {
    const dest = absenceWidgetDestination(widget, {
      employeeId,
      category: 'ferie',
      today,
      fromDate: period.start,
      toDate: period.end,
    });
    if (dest) requestShellTab?.(dest.tab, dest.subView, dest.intent);
  };

  const person = board.staff[0];
  const summary = board.dash.summary || {};

  const ferieNow = spanSummary.ferie;
  const sykNow = spanSummary.sykdom;
  const annetNow = spanSummary.annet;
  const planned = board.planned || [];
  const onToday = span === 'dag' && period.start === today;
  const awayTitle = span === 'dag'
    ? (onToday ? 'Borte i dag' : `Borte ${period.label}`)
    : 'Borte i perioden';
  const awayEmpty = span === 'dag'
    ? (onToday ? 'Ingen registrert borte i dag' : 'Ingen registrert borte denne dagen')
    : 'Ingen registrert borte i perioden';
  const boardPending = !!(peopleLoading || absenceLoading);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#F4F7FB' }}
      contentContainerStyle={styles.page}
      nativeID="fravaer-oversikt-web"
    >
      {employeeId ? (
        <View style={styles.toolbar}>
          <TouchableOpacity onPress={() => onSelectEmployee?.('')} style={styles.back} accessibilityRole="button" nativeID="fravaer-tilbake">
            <Ionicons name="chevron-back" size={16} color={blue} />
            <Text style={styles.backTxt}>Alle i utvalget</Text>
          </TouchableOpacity>
          {canChooseEmployee ? (
            <TouchableOpacity
              onPress={() => setPeopleOpen((value) => !value)}
              style={[styles.personBtn, { borderColor: line, backgroundColor: '#fff' }]}
              accessibilityRole="button"
              accessibilityLabel="Velg ansatt"
            >
              <Ionicons name="people" size={14} color={blue} />
              <Text style={styles.personTxt}>{selectedName}</Text>
              <Ionicons name="chevron-down" size={13} color={muted} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {peopleOpen ? (
        <View style={[styles.menu, { borderColor: line }]}>
          <MenuRow label="Alle i utvalget" on={!employeeId} onPress={() => { setPeopleOpen(false); onSelectEmployee?.(''); }} />
          {audience.roster.map((row) => (
            <MenuRow
              key={row.id}
              label={names[row.id] || 'Ansatt'}
              on={row.id === employeeId}
              onPress={() => { setPeopleOpen(false); onSelectEmployee?.(row.id); }}
            />
          ))}
        </View>
      ) : null}
      {error ? <Text style={styles.errorTxt}>{error}</Text> : null}
      {employeeId ? (
        <EmployeePane
          name={selectedName}
          kind={personnelKindLabel(personnelKind(roster[0]))}
          person={person}
          year={board.year}
          earned={earned}
          yearUsed={yearUsed}
          remaining={remaining}
          hasQuota={hasQuota}
          planned={board.planned || []}
          opening={opening}
          openingPlaceholder={formatCount(summary.opening || 0)}
          onOpeningChange={onOpeningChange}
          onSaveOpening={onSaveOpening}
          chartWidth={chartWidth}
          onChartWidth={setChartWidth}
          pending={boardPending}
        />
      ) : (
        <>
          <View style={styles.controlStrip}>
            <View style={styles.controlEdge}>
              {canChooseEmployee ? (
                <AudienceBar
                  kinds={audience.kinds}
                  onToggleKind={audience.toggleKind}
                  includeInactive={audience.includeInactive}
                  onToggleInactive={() => audience.setIncludeInactive((value) => !value)}
                />
              ) : null}
            </View>
            <View style={styles.periodCenter} nativeID="periode-midten">
              <Segmented
                items={SPANS}
                value={span}
                onChange={setSpan}
                idPrefix="periode"
              />
              <View style={styles.stepper}>
                <TouchableOpacity onPress={() => setCursor(stepCursor(span, cursor || today, -1))} accessibilityRole="button" accessibilityLabel="Forrige periode" nativeID="periode-forrige" style={styles.navHit}>
                  <Ionicons name="chevron-back" size={18} color={ink} />
                </TouchableOpacity>
                <Text style={styles.stepLabel}>{period.label}</Text>
                <TouchableOpacity onPress={() => setCursor(stepCursor(span, cursor || today, 1))} accessibilityRole="button" accessibilityLabel="Neste periode" nativeID="periode-neste" style={styles.navHit}>
                  <Ionicons name="chevron-forward" size={18} color={ink} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.controlEdgeRight}>
              <Segmented
                items={[{ id: 'diagram', label: 'Diagram' }, { id: 'tabell', label: 'Tabell' }]}
                value={view}
                onChange={setView}
                idPrefix="visning"
              />
              {canChooseEmployee ? (
                <TouchableOpacity
                  onPress={() => setPeopleOpen((value) => !value)}
                  style={[styles.personBtn, { borderColor: line, backgroundColor: '#fff' }]}
                  accessibilityRole="button"
                  accessibilityLabel="Velg ansatt"
                >
                  <Ionicons name="people" size={14} color={blue} />
                  <Text style={styles.personTxt}>{selectedName}</Text>
                  <Ionicons name="chevron-down" size={13} color={muted} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {canChooseEmployee ? (
          <View style={styles.kpis}>
            <Kpi icon="people" tint={blue} bg="#E8F0FE" value={roster.length} label="Ansatte" pending={peopleLoading} pendingId="fravaer-loading-kpi-ansatte" onPress={() => openSource('headcount')} />
            <Kpi icon="calendar" tint="#1F9D55" bg="#E7F8EF" value={ferieNow} label={onToday ? 'På ferie nå' : 'På ferie'} pending={boardPending} pendingId="fravaer-loading-kpi-ferie" onPress={() => openSource('away-ferie')} />
            <Kpi icon="heart" tint="#E15B73" bg="#FDECEF" value={sykNow} label={onToday ? 'Sykemeldte nå' : 'Sykemeldte'} pending={boardPending} pendingId="fravaer-loading-kpi-syk" onPress={() => openSource('away-sykdom')} />
            <Kpi icon="time" tint="#E09A3E" bg="#FFF4E5" value={annetNow} label={onToday ? 'Annet fravær nå' : 'Annet fravær'} pending={boardPending} pendingId="fravaer-loading-kpi-annet" onPress={() => openSource('away-annet')} />
          </View>
          ) : null}

          {view === 'diagram' ? (
            <>
              <View style={styles.board} nativeID="fravaer-board">
                <View style={styles.boardMain} nativeID="fravaer-board-main">
                  <StatusCard
                    title={awayTitle}
                    count={away.length}
                    empty={awayEmpty}
                    nativeID="borte-i-dag"
                    pending={boardPending}
                    pendingLabel="Henter hvem som er borte"
                    pendingId="fravaer-loading-borte"
                  >
                    <View style={styles.awayList}>
                      {away.map((row) => (
                        <TouchableOpacity key={row.id} onPress={() => openPerson(row.employeeId)} style={styles.awayPill} accessibilityRole="button">
                          <View style={[styles.swatch, { backgroundColor: BARS[row.bucket] || BARS.annet }]} />
                          <Text style={styles.awayName} numberOfLines={1}>{row.employeeName}</Text>
                          <Text style={styles.awayType} numberOfLines={1}>{row.typeLabel}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </StatusCard>
                  <View style={styles.split}>
                    <TouchableOpacity
                      style={[styles.card, styles.splitCard]}
                      onPress={() => openSource('usage')}
                      accessibilityRole="button"
                      accessibilityLabel={`Åpne kilden for feriebruk ${board.year}`}
                      nativeID="widget-feriebruk"
                    >
                      <Text style={styles.cardTitle}>{`Feriebruk ${board.year}`}</Text>
                      {boardPending ? (
                        <CardPending label="Henter feriebruk" nativeID="fravaer-loading-ferie" />
                      ) : (
                        <>
                          <Text style={styles.hint}>Brukte feriedager mot startsaldo for utvalget.</Text>
                          <View style={styles.donutRow}>
                            <Donut used={yearUsed} total={earned} hasQuota={hasQuota} />
                            <View style={styles.legend}>
                              <Legend color={blue} label="Brukt i år" value={formatCount(yearUsed)} />
                              {hasQuota ? <Legend color="#D5DEEA" label="Til gode" value={formatCount(remaining)} /> : null}
                              {hasQuota ? <Legend label="Startsaldo" value={formatCount(earned)} /> : null}
                              {!hasQuota ? <Legend label="Ingen startsaldo satt" value="" /> : null}
                            </View>
                          </View>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.card, styles.splitCard]}
                      onPress={() => openSource('chart')}
                      onLayout={(event) => setChartWidth(Math.max(180, event.nativeEvent.layout.width - 28))}
                      accessibilityRole="button"
                      accessibilityLabel="Åpne fraværsrapporten for perioden"
                      nativeID="widget-periode"
                    >
                      <Text style={styles.cardTitle}>Fravær i perioden</Text>
                      {boardPending ? (
                        <CardPending label="Henter fravær i perioden" nativeID="fravaer-loading-periode" />
                      ) : (
                        <>
                          <Text style={styles.hint}>{period.label}</Text>
                          <MonthChart months={grid.totals} width={Math.max(chartWidth, grid.days.length * 16)} />
                          <View style={styles.keys}>
                            <Key color={BARS.ferie} label="Ferie" />
                            <Key color={BARS.sykdom} label="Sykdom" />
                            <Key color={BARS.annet} label="Annet" />
                          </View>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.boardSide} nativeID="fravaer-board-side">
                  <StatusCard
                    title="Planlagt fremover"
                    count={planned.length}
                    empty="Ingen planlagt fravær fremover"
                    nativeID="planlagt-fravaer"
                    pending={boardPending}
                    pendingLabel="Henter planlagt fravær"
                    pendingId="fravaer-loading-planlagt"
                  >
                    {planned.slice(0, 6).map((row) => (
                      <TouchableOpacity key={row.id} onPress={() => openPerson(row.employeeId)} style={styles.period} accessibilityRole="button">
                        <View style={[styles.swatch, { backgroundColor: BARS[row.bucket] || BARS.annet }]} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.periodName} numberOfLines={1}>{row.employeeName}</Text>
                          <Text style={styles.periodMeta} numberOfLines={1}>
                            {`${row.typeLabel} · ${row.start === row.end ? row.start : `${row.start} – ${row.end}`}`}
                          </Text>
                        </View>
                        <Text style={styles.periodDays}>{`${formatCount(row.days)} d`}</Text>
                      </TouchableOpacity>
                    ))}
                    {planned.length > 6 ? (
                      <Text style={styles.moreHint}>{`+ ${planned.length - 6} til i listen under`}</Text>
                    ) : null}
                  </StatusCard>
                </View>
              </View>

              <View style={styles.card} nativeID="fravaer-aar">
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle}>{`Fravær i ${board.year}`}</Text>
                  {dataYears.length > 1 ? (
                    <View style={styles.yearRow} accessibilityRole="tablist">
                      {dataYears.map((year) => {
                        const on = year === board.year;
                        return (
                          <TouchableOpacity
                            key={year}
                            onPress={() => setYearChoice(year)}
                            style={[styles.yearChip, on && styles.yearChipOn]}
                            accessibilityRole="button"
                            accessibilityState={{ selected: on }}
                            nativeID={`fravaer-aar-${year}`}
                          >
                            <Text style={[styles.yearChipTxt, on && styles.yearChipTxtOn]}>{year}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
                {boardPending ? (
                  <CardPending label={`Henter fravær for ${board.year || 'året'}`} nativeID="fravaer-loading-aar" />
                ) : (
                  <>
                    <Text style={styles.hint}>Dager per måned. Til gode = startsaldo minus registrert ferie.</Text>
                    {board.staff.length ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={styles.matrix}>
                          <View style={styles.matrixHead}>
                            <Text style={[styles.nameCol, styles.headTxt]}>Ansatt</Text>
                            {board.months.map((label) => (
                              <Text key={label} style={[styles.monthCol, styles.headTxt]}>{label}</Text>
                            ))}
                            <Text style={[styles.numCol, styles.headTxt]}>Ferie</Text>
                            <Text style={[styles.numCol, styles.headTxt]}>Til gode</Text>
                          </View>
                          {board.staff.map((staffRow) => (
                            <TouchableOpacity key={staffRow.id} onPress={() => openPerson(staffRow.id)} style={styles.matrixRow} accessibilityRole="button">
                              <Text style={[styles.nameCol, styles.nameTxt]} numberOfLines={1}>{staffRow.name}</Text>
                              {staffRow.months.map((month) => {
                                const total = monthTotal(month);
                                return (
                                  <Text key={month.label} style={[styles.monthCol, styles.monthNum, total ? { color: monthTone(month) } : null]}>
                                    {total ? formatCount(total) : ''}
                                  </Text>
                                );
                              })}
                              <Text style={[styles.numCol, styles.numTxt]}>{staffRow.vacationUsed ? formatCount(staffRow.vacationUsed) : ''}</Text>
                              <Text style={[styles.numCol, styles.numTxt]}>{staffRow.earned ? formatCount(staffRow.remaining) : '–'}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                    ) : (
                      <Text style={styles.empty}>{`Ingen fravær registrert i ${board.year}.`}</Text>
                    )}
                  </>
                )}
              </View>
            </>
          ) : (
            <PeriodTable grid={grid} today={today} onOpen={openPerson} pending={boardPending} />
          )}
        </>
      )}
    </ScrollView>
  );
}

function reportColumnStyle(column) {
  if (column.flex) {
    return { flexGrow: 1, flexShrink: 1, flexBasis: column.minWidth || 160, minWidth: column.minWidth || 120 };
  }
  return { width: column.width, flexGrow: 0, flexShrink: 0 };
}

function columnsAreDefault(keys) {
  const current = keys?.length ? keys : DEFAULT_ABSENCE_REPORT_COLUMNS;
  if (current.length !== DEFAULT_ABSENCE_REPORT_COLUMNS.length) return false;
  const visible = new Set(current);
  return DEFAULT_ABSENCE_REPORT_COLUMNS.every((key) => visible.has(key));
}

function toggleReportColumn(keys, key) {
  const current = keys?.length ? keys : DEFAULT_ABSENCE_REPORT_COLUMNS;
  if (current.includes(key)) {
    const next = current.filter((item) => item !== key);
    return next.length ? next : current;
  }
  return [...current, key];
}

function reportCellValue(row, key) {
  if (key === 'date') return row.dateLabel || row.date || '–';
  if (key === 'hours') return row.hoursLabel || formatHours(row.hours);
  if (key === 'paidHours') return row.paidHoursLabel || formatHours(row.paidHours);
  if (key === 'percent') {
    if (row.percent == null || Number.isNaN(Number(row.percent))) return '–';
    return `${Math.round(Number(row.percent))}`;
  }
  const value = row[key];
  return value == null || value === '' ? '–' : String(value);
}

export function AbsenceReportDesktop({
  employees = [],
  names = {},
  absences = [],
  canChooseEmployee = false,
  lockedEmployeeId = '',
  canImport = false,
  onImport,
  onClearImported,
  onDeleteSelected,
  absenceCount = 0,
  onOpenPeriod,
  note = '',
  error = '',
  loading = false,
}) {
  const colors = useColors();
  const hostedHero = useModuleHeroHosted();
  const { width, isPhone, hasRail, railWidth } = useLayout();
  const contentWidth = width - (hasRail ? railWidth : 0) - 32;
  const stackRows = isPhone || contentWidth < 960;

  const { shellIntent, clearShellIntent } = useApp();
  const [employeeId, setEmployeeId] = useState(canChooseEmployee ? '' : lockedEmployeeId);
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [category, setCategory] = useState('');
  const [typeId, setTypeId] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('date-desc');
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_ABSENCE_REPORT_COLUMNS);
  const [pageSize, setPageSize] = useState(PAGE_STEP);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const employeesById = useMemo(() => {
    const map = new Map();
    for (const row of employees) {
      if (row?.id) map.set(row.id, row);
    }
    return map;
  }, [employees]);

  const hydrated = useMemo(() => (
    (absences || [])
      .map((row) => hydrateAbsenceReportRow(row, { names, employeesById }))
      .filter(Boolean)
  ), [absences, names, employeesById]);

  const filtered = useMemo(() => filterAbsenceReport(hydrated, {
    query,
    employeeId: canChooseEmployee ? employeeId : (lockedEmployeeId || employeeId),
    category,
    typeId,
    status,
    period,
    fromDate,
    toDate,
  }), [
    hydrated, query, employeeId, canChooseEmployee, lockedEmployeeId,
    category, typeId, status, period, fromDate, toDate,
  ]);

  const visible = useMemo(() => sortAbsenceReport(filtered, sort), [filtered, sort]);
  const pageRows = useMemo(() => visible.slice(0, pageSize), [visible, pageSize]);
  const totals = useMemo(() => absenceReportTotals(visible), [visible]);

  const employeeOptions = useMemo(() => {
    const byId = new Map();
    for (const row of hydrated) {
      if (!row.employeeId) continue;
      const current = byId.get(row.employeeId) || {
        id: row.employeeId,
        // Registeret først. Kopien på fraværet er reserve for slettede personer (DS-08).
        name: names[row.employeeId] || row.employeeName || 'Ansatt',
        hours: 0,
      };
      current.hours += Number(row.hours) || 0;
      byId.set(row.employeeId, current);
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  }, [hydrated, names]);

  const columns = useMemo(() => {
    const keys = new Set(visibleColumns.length ? visibleColumns : DEFAULT_ABSENCE_REPORT_COLUMNS);
    const picked = ABSENCE_REPORT_COLUMNS.filter((column) => keys.has(column.key));
    return picked.length
      ? picked
      : ABSENCE_REPORT_COLUMNS.filter((column) => DEFAULT_ABSENCE_REPORT_COLUMNS.includes(column.key));
  }, [visibleColumns]);

  const tableMin = columns.reduce((sum, column) => sum + (column.minWidth || column.width || 80), 0) || TABLE_MIN_FALLBACK;

  useEffect(() => {
    if (!canChooseEmployee && lockedEmployeeId) setEmployeeId(lockedEmployeeId);
  }, [canChooseEmployee, lockedEmployeeId]);

  useEffect(() => {
    if (!shellIntent || shellIntent.type !== 'absenceReportFocus') return;
    const nextCategory = String(shellIntent.category || '');
    const nextType = String(shellIntent.typeId || '');
    const nextEmployee = String(shellIntent.employeeId || '');
    const nextPeriod = String(shellIntent.period || 'all');
    setCategory(nextCategory);
    setTypeId(nextType);
    setPeriod(nextPeriod || 'all');
    setFromDate(String(shellIntent.fromDate || ''));
    setToDate(String(shellIntent.toDate || ''));
    if (canChooseEmployee && nextEmployee) setEmployeeId(nextEmployee);
    clearShellIntent?.();
  }, [shellIntent, clearShellIntent, canChooseEmployee]);

  useEffect(() => {
    setPageSize(PAGE_STEP);
  }, [query, employeeId, category, typeId, status, period, fromDate, toDate, sort, absences.length]);

  useEffect(() => {
    const live = new Set((absences || []).map((row) => row.id).filter(Boolean));
    setSelectedIds((current) => {
      let changed = false;
      const next = new Set();
      for (const id of current) {
        if (live.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : current;
    });
  }, [absences]);

  const pageIds = pageRows.map((row) => row.id).filter(Boolean);
  const selectedOnPage = pageIds.filter((id) => selectedIds.has(id)).length;
  const allPageSelected = pageIds.length > 0 && selectedOnPage === pageIds.length;

  function toggleRow(id) {
    if (!id) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allPageSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  }

  function resetFilters() {
    setQuery('');
    setEmployeeId(canChooseEmployee ? '' : lockedEmployeeId);
    setPeriod('all');
    setFromDate('');
    setToDate('');
    setCategory('');
    setTypeId('');
    setStatus('');
    setSort('date-desc');
    setVisibleColumns(DEFAULT_ABSENCE_REPORT_COLUMNS);
  }

  const organizePanel = (
    <AbsenceOrganizePanel
      colors={colors}
      query={query}
      onQuery={setQuery}
      period={period}
      onPeriod={setPeriod}
      fromDate={fromDate}
      toDate={toDate}
      onFromDate={setFromDate}
      onToDate={setToDate}
      onFromDateBlur={() => setFromDate((current) => parseDate(current) || current)}
      onToDateBlur={() => setToDate((current) => parseDate(current) || current)}
      sort={sort}
      onSort={setSort}
      category={category}
      onCategory={(value) => {
        setCategory(value);
        setTypeId('');
      }}
      status={status}
      onStatus={setStatus}
      visibleColumns={visibleColumns}
      onToggleColumn={(key) => setVisibleColumns((current) => toggleReportColumn(current, key))}
      onResetColumns={() => setVisibleColumns(DEFAULT_ABSENCE_REPORT_COLUMNS)}
      employeeId={employeeId}
      onEmployee={canChooseEmployee ? setEmployeeId : () => {}}
      employees={canChooseEmployee
        ? employeeOptions
        : employeeOptions.filter((row) => row.id === (lockedEmployeeId || employeeId))}
      counts={totals}
      onReset={resetFilters}
      onClose={() => setFilterOpen(false)}
    />
  );

  const filtersActive = Boolean(
    String(query || '').trim()
    || period !== 'all'
    || category
    || status
    || sort !== 'date-desc'
    || (canChooseEmployee && employeeId)
    || !columnsAreDefault(visibleColumns)
  );
  const activeFilterCount = [
    String(query || '').trim(),
    period !== 'all',
    category,
    status,
    sort !== 'date-desc',
    canChooseEmployee && employeeId,
    !columnsAreDefault(visibleColumns),
  ].filter(Boolean).length;

  const emptyHint = (
    <View style={{ padding: 16 }}>
      <Text style={{ color: colors.muted }}>
        {loading
          ? 'Laster fravær…'
          : absences.length
            ? 'Ingen fravær i dette utvalget. Åpne Filtrer for periode, type eller sortering.'
            : canImport
              ? 'Ingen fravær er registrert. Importer Excel eller registrer fravær for ansatte.'
              : 'Ingen fravær er registrert.'}
      </Text>
    </View>
  );

  const moreButton = visible.length > pageRows.length ? (
    <TouchableOpacity
      onPress={() => setPageSize((n) => n + PAGE_STEP)}
      accessibilityRole="button"
      style={{ padding: 14, alignItems: 'center' }}
      nativeID="absence-report-more"
    >
      <Text style={{ color: colors.brand, fontWeight: '400' }}>
        Vis flere ({pageRows.length} av {visible.length})
      </Text>
    </TouchableOpacity>
  ) : null;

  const tableRows = (
    <>
      {!pageRows.length ? emptyHint : pageRows.map((row) => (
        <View
          key={row.id}
          style={[reportStyles.tr, { borderBottomColor: colors.line, backgroundColor: selectedIds.has(row.id) ? (colors.sunken || colors.bg) : 'transparent' }]}
        >
          {canImport ? (
            <TouchableOpacity
              onPress={() => toggleRow(row.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selectedIds.has(row.id) }}
              accessibilityLabel={`Velg fravær ${row.employeeName} ${row.dateLabel || row.date}`}
              nativeID={`absence-report-select-${row.id}`}
              style={reportStyles.checkCell}
            >
              <Ionicons
                name={selectedIds.has(row.id) ? 'checkbox' : 'square-outline'}
                size={18}
                color={selectedIds.has(row.id) ? colors.brand : colors.muted}
              />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={reportStyles.rowHit}
            onPress={() => onOpenPeriod?.(dayRowAsPeriod(row))}
            accessibilityRole="button"
            accessibilityLabel={`Åpne fravær ${row.employeeName} ${row.dateLabel || row.date}`}
            disabled={!onOpenPeriod}
          >
            {columns.map((column) => (
              <Text
                key={column.key}
                style={[
                  reportStyles.td,
                  reportColumnStyle(column),
                  { color: column.key === 'employeeName' || column.key === 'hours' || column.key === 'paidHours' ? colors.ink : colors.muted },
                  (column.key === 'hours' || column.key === 'paidHours' || column.key === 'percent') && { textAlign: 'right', fontWeight: '400' },
                  column.key === 'employeeName' && { fontWeight: '400', color: colors.ink },
                ]}
                numberOfLines={2}
              >
                {reportCellValue(row, column.key)}
              </Text>
            ))}
          </TouchableOpacity>
        </View>
      ))}
      {moreButton}
    </>
  );

  const tableSheet = (
    <View style={{ minWidth: Math.max(tableMin, stackRows ? contentWidth : tableMin) }}>
      <View style={[reportStyles.tr, reportStyles.head, { borderBottomColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}>
            {canImport ? (
              <TouchableOpacity
                onPress={togglePage}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: allPageSelected }}
                accessibilityLabel="Velg linjene på siden"
                nativeID="absence-report-select-all"
                style={reportStyles.checkCell}
                disabled={!pageIds.length}
              >
                <Ionicons
                  name={allPageSelected ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={allPageSelected ? colors.brand : colors.muted}
                />
              </TouchableOpacity>
            ) : null}
            {columns.map((column) => (
              <Text key={column.key} style={[reportStyles.th, reportColumnStyle(column), { color: colors.muted }]}>
                {column.label}
              </Text>
            ))}
      </View>
      {stackRows ? (
        <View nativeID="absence-report-table-body">{tableRows}</View>
      ) : (
        <View style={{ maxHeight: 720 }} nativeID="absence-report-table-body">
          <ScrollView nestedScrollEnabled>{tableRows}</ScrollView>
        </View>
      )}
    </View>
  );

  const table = (
    <View
      style={[reportStyles.tableWrap, { borderColor: colors.line, backgroundColor: colors.card }]}
      nativeID="absence-report-table"
    >
      {stackRows && Platform.OS === 'web' ? (
        <View style={reportStyles.hScroll}>{tableSheet}</View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          {tableSheet}
        </ScrollView>
      )}
    </View>
  );

  const ReportScreen = stackRows ? ScrollView : View;
  return (
    <ReportScreen
      style={[reportStyles.screen, { backgroundColor: colors.bg }]}
      {...(stackRows ? {
        contentContainerStyle: reportStyles.phoneScroll,
        keyboardShouldPersistTaps: 'handled',
      } : null)}
      nativeID="fravaersrapport"
    >
      <View style={stackRows ? reportStyles.phoneCol : reportStyles.desk}>
        <View style={stackRows ? reportStyles.phoneMain : reportStyles.mainCol}>
          <View style={reportStyles.toolbar}>
            <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
              {hostedHero ? null : (
                <>
                  <Text style={[reportStyles.crumb, { color: colors.muted }]}>Arbeid / Fraværsrapport</Text>
                  <Text style={[reportStyles.heading, { color: colors.ink }]}>Fraværsrapport</Text>
                </>
              )}
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {loading
                  ? 'Laster fravær…'
                  : `${absences.length} lastet · ${totals.count} vist · ${formatHours(totals.hours)} timer`}
              </Text>
            </View>
            <View style={reportStyles.toolbarRight}>
              {canImport && selectedIds.size > 0 && onDeleteSelected ? (
                <TouchableOpacity
                  onPress={() => onDeleteSelected([...selectedIds])}
                  style={[reportStyles.ghostBtn, { borderColor: colors.danger || '#b42318' }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Slett ${selectedIds.size} valgte fravær`}
                  nativeID="absence-report-delete-selected"
                >
                  <Ionicons name="trash-outline" size={15} color={colors.danger || '#b42318'} />
                  <Text style={{ color: colors.danger || '#b42318', fontWeight: '400' }}>
                    Slett ({selectedIds.size})
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={() => {
                  setFilterOpen((open) => !open);
                  setSettingsOpen(false);
                }}
                accessibilityRole="button"
                accessibilityLabel="Filtrer og sorter"
                accessibilityState={{ expanded: filterOpen }}
                nativeID="absence-filter-toggle"
                style={[
                  reportStyles.ghostBtn,
                  {
                    borderColor: filterOpen || filtersActive ? colors.brand : colors.line,
                    backgroundColor: filterOpen || filtersActive ? (colors.brandSoft || '#E8F1FF') : '#fff',
                  },
                ]}
              >
                <Ionicons name="options-outline" size={18} color={filterOpen || filtersActive ? colors.brand : colors.ink} />
                <Text style={{ color: filterOpen || filtersActive ? colors.brand : colors.ink, fontWeight: '400' }}>Filtrer</Text>
                {activeFilterCount > 0 ? (
                  <View style={[reportStyles.filterBadge, { backgroundColor: colors.brand }]}>
                    <Text style={reportStyles.filterBadgeText}>{activeFilterCount}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
              {canImport ? (
                <TouchableOpacity
                  onPress={() => {
                    setSettingsOpen((open) => !open);
                    setFilterOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Innstillinger"
                  accessibilityState={{ expanded: settingsOpen }}
                  nativeID="fravaer-report-settings"
                  style={[
                    reportStyles.iconBtn,
                    {
                      borderColor: settingsOpen ? colors.brand : colors.line,
                      backgroundColor: settingsOpen ? (colors.brandSoft || '#E8F1FF') : '#fff',
                    },
                  ]}
                >
                  <Ionicons name="settings-outline" size={18} color={settingsOpen ? colors.brand : colors.ink} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {error ? <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text> : null}
          {note ? <Text style={{ color: colors.muted }}>{note}</Text> : null}

          {table}
        </View>
      </View>
      <Modal transparent visible={filterOpen} animationType="slide" onRequestClose={() => setFilterOpen(false)}>
        <View style={[reportStyles.modalBg, reportStyles.modalBgSheet]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setFilterOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Lukk filter"
            nativeID="absence-filter-dismiss"
          />
          <View
            style={[reportStyles.filterSheet, { backgroundColor: colors.bg, borderColor: colors.line }]}
            accessibilityViewIsModal
            nativeID="absence-filter-sheet"
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={{ width: '100%' }}
              contentContainerStyle={reportStyles.sheetScroll}
            >
              {organizePanel}
            </ScrollView>
          </View>
        </View>
      </Modal>
      {canImport ? (
        <Modal transparent visible={settingsOpen} animationType="fade" onRequestClose={() => setSettingsOpen(false)}>
          <View style={[reportStyles.modalBg, reportStyles.modalBgSheet]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setSettingsOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Lukk innstillinger"
              nativeID="fravaer-settings-dismiss"
            />
            <View
              style={[reportStyles.settingsCard, { backgroundColor: colors.card, borderColor: colors.line }]}
              accessibilityViewIsModal
              nativeID="fravaer-settings-menu"
            >
              <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '400' }}>Innstillinger</Text>
              <TouchableOpacity
                onPress={() => {
                  setSettingsOpen(false);
                  onImport?.();
                }}
                style={[reportStyles.primaryBtn, { backgroundColor: colors.brand }]}
                accessibilityRole="button"
                accessibilityLabel="Importer fravær"
                nativeID="fravaer-import"
              >
                <Ionicons name="cloud-upload-outline" size={15} color="#fff" />
                <Text style={reportStyles.primaryBtnText}>Importer</Text>
              </TouchableOpacity>
              {absenceCount > 0 && onClearImported ? (
                <TouchableOpacity
                  onPress={() => {
                    setSettingsOpen(false);
                    onClearImported();
                  }}
                  style={[reportStyles.ghostBtn, { borderColor: colors.line }]}
                  accessibilityRole="button"
                  accessibilityLabel="Fjern importert fravær"
                  nativeID="fravaer-clear-imported"
                >
                  <Ionicons name="trash-outline" size={15} color={colors.muted} />
                  <Text style={{ color: colors.muted, fontWeight: '400' }}>Tøm import</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </Modal>
      ) : null}
    </ReportScreen>
  );
}

export function PlannedAbsenceDesktop({
  employees = [],
  names = {},
  absences = [],
  adjustments = [],
  fullDayHours = 7.5,
  today = '',
  canChooseEmployee = false,
  lockedEmployeeId = '',
  focusEmployeeId = '',
  loading = false,
  header = null,
}) {
  const audience = useAudience(employees);
  const [employeeId, setEmployeeId] = useState(canChooseEmployee ? (focusEmployeeId || '') : lockedEmployeeId);
  useEffect(() => {
    if (canChooseEmployee && focusEmployeeId) setEmployeeId(focusEmployeeId);
  }, [canChooseEmployee, focusEmployeeId]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('date-asc');
  const roster = employeeId ? employees.filter((row) => row.id === employeeId) : audience.roster;
  const board = useBoard({
    employees: roster, names, employeeId: '', absences, adjustments, fullDayHours, today,
  });
  const plannedRows = sortPlannedRows(board.planned || [], sort);
  const selectedName = employeeId ? (names[employeeId] || 'Ansatt') : '';
  const scope = plannedScopeLabel(employeeId, selectedName, audience.kinds, audience.includeInactive);
  const nameRows = audience.roster.filter((row) => nameMatches(names[row.id] || '', query));
  const filtersActive = !audience.kinds.staff
    || audience.kinds.innleid
    || audience.kinds.external
    || audience.includeInactive
    || !!employeeId
    || !!String(query || '').trim()
    || sort !== 'date-asc';
  const activeFilterCount = [
    !audience.kinds.staff,
    audience.kinds.innleid,
    audience.kinds.external,
    audience.includeInactive,
    !!employeeId,
    !!String(query || '').trim(),
    sort !== 'date-asc',
  ].filter(Boolean).length;

  function resetFilters() {
    audience.resetAudience();
    setEmployeeId(canChooseEmployee ? '' : lockedEmployeeId);
    setQuery('');
    setSort('date-asc');
  }

  function pickPerson(id) {
    setEmployeeId(id);
    setQuery('');
    setFilterOpen(false);
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F4F7FB' }}>
    <ScrollView
      style={{ flex: 1, backgroundColor: '#F4F7FB' }}
      contentContainerStyle={styles.page}
      nativeID="planlagt-fravaer-side"
    >
      <View style={styles.toolbar}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={styles.personHeading}>{scope}</Text>
          <Text style={styles.hint}>Fravær som er registrert frem i tid, også inn i neste år.</Text>
        </View>
        {canChooseEmployee ? (
          <TouchableOpacity
            onPress={() => setFilterOpen((open) => !open)}
            style={[
              reportStyles.ghostBtn,
              {
                borderColor: filterOpen || filtersActive ? blue : line,
                backgroundColor: filterOpen || filtersActive ? '#E8F1FF' : '#fff',
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Filtrer og sorter"
            accessibilityState={{ expanded: filterOpen }}
            nativeID="planlagt-filter-toggle"
          >
            <Ionicons name="options-outline" size={16} color={filterOpen || filtersActive ? blue : ink} />
            <Text style={{ color: filterOpen || filtersActive ? blue : ink, fontWeight: '400' }}>Filtrer</Text>
            {activeFilterCount > 0 ? (
              <View style={[reportStyles.filterBadge, { backgroundColor: blue }]}>
                <Text style={reportStyles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ) : null}
      </View>
      {header}
      {loading && !plannedRows.length ? (
        <View style={styles.card} nativeID="planlagt-fravaer">
          <Text style={styles.empty}>Laster fravær…</Text>
        </View>
      ) : (
        <PlannedCard rows={plannedRows} heading="" />
      )}
    </ScrollView>
      {canChooseEmployee ? (
        <Modal transparent visible={filterOpen} animationType="slide" onRequestClose={() => setFilterOpen(false)}>
          <View style={[reportStyles.modalBg, reportStyles.modalBgSheet]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setFilterOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Lukk filter"
              nativeID="planlagt-filter-dismiss"
            />
            <View
              style={[reportStyles.filterSheet, { backgroundColor: '#F4F7FB', borderColor: line }]}
              nativeID="planlagt-filter-sheet"
            >
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={reportStyles.sheetScroll}>
                <View style={styles.filterHead}>
                  <Text style={styles.cardTitle}>Filtrer og sorter</Text>
                  <TouchableOpacity
                    onPress={() => setFilterOpen(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Lukk filter"
                    nativeID="planlagt-filter-close"
                    hitSlop={8}
                  >
                    <Ionicons name="close" size={20} color={ink} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.hint}>Utvalg</Text>
                {PLANNED_KINDS.map((item) => (
                  <CheckRow
                    key={item.id}
                    label={item.label}
                    on={!!audience.kinds[item.id]}
                    onPress={() => audience.toggleKind(item.id)}
                    nativeID={item.id === 'staff' ? 'planlagt-intern' : `planlagt-kind-${item.id}`}
                  />
                ))}
                <CheckRow
                  label="Deaktiverte"
                  on={audience.includeInactive}
                  onPress={() => audience.setIncludeInactive((value) => !value)}
                  nativeID="planlagt-deaktivert"
                />
                <Text style={[styles.hint, { marginTop: 8 }]}>Sorter</Text>
                <View style={styles.chipWrap}>
                  {PLANNED_SORTS.map((item) => {
                    const on = sort === item.id;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        onPress={() => setSort(item.id)}
                        style={[styles.sortChip, on && styles.sortChipOn]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        nativeID={`planlagt-sort-${item.id}`}
                      >
                        <Text style={[styles.segmentLabel, on && styles.segmentLabelOn]}>{item.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={16} color={muted} />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Søk navn"
                    placeholderTextColor="#A0A8B8"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.searchInput}
                    accessibilityLabel="Søk navn"
                    nativeID="planlagt-navn-sok"
                  />
                </View>
                <Text style={styles.hint}>Navn</Text>
                <MenuRow
                  label="Alle i utvalget"
                  on={!employeeId}
                  onPress={() => pickPerson('')}
                  nativeID="planlagt-person-alle"
                />
                {nameRows.length ? nameRows.map((row) => (
                  <MenuRow
                    key={row.id}
                    label={names[row.id] || 'Ansatt'}
                    on={row.id === employeeId}
                    onPress={() => pickPerson(row.id)}
                    nativeID={`planlagt-person-${row.id}`}
                  />
                )) : (
                  <Text style={styles.empty}>{String(query || '').trim() ? 'Ingen treff.' : 'Ingen navn i utvalget.'}</Text>
                )}
                <TouchableOpacity
                  onPress={resetFilters}
                  style={[reportStyles.ghostBtn, { alignSelf: 'flex-start', marginTop: 8 }]}
                  accessibilityRole="button"
                  nativeID="planlagt-filter-reset"
                >
                  <Text style={styles.nameTxt}>Nullstill</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

function Segmented({ items, value, onChange, idPrefix }) {
  return (
    <View style={styles.segmentTrack} accessibilityRole="tablist">
      {items.map((item) => {
        const on = value === item.id;
        return (
          <TouchableOpacity
            key={item.id}
            onPress={() => onChange(item.id)}
            style={[styles.segment, on && styles.segmentOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            nativeID={idPrefix ? `${idPrefix}-${item.id}` : undefined}
          >
            <Text style={[styles.segmentLabel, on && styles.segmentLabelOn]}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function AudienceBar({ kinds, onToggleKind, includeInactive, onToggleInactive }) {
  const items = [
    ...AUDIENCE.map((item) => ({
      id: item.id,
      label: item.label,
      on: !!kinds[item.id],
      press: () => onToggleKind(item.id),
    })),
    {
      id: 'deaktivert',
      label: 'Deaktiverte',
      on: includeInactive,
      press: onToggleInactive,
      nativeID: 'fravaer-deaktivert',
    },
  ];
  return (
    <View style={styles.segmentTrack} nativeID="fravaer-utvalg" accessibilityRole="tablist">
      {items.map((item) => (
        <TouchableOpacity
          key={item.id}
          onPress={item.press}
          style={[styles.segment, item.on && styles.segmentOn]}
          accessibilityRole="button"
          accessibilityState={{ selected: item.on }}
          nativeID={item.nativeID}
        >
          <Text style={[styles.segmentLabel, item.on && styles.segmentLabelOn]}>{item.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function CardPending({ label, nativeID }) {
  return (
    <View
      style={styles.pending}
      nativeID={nativeID}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <View style={styles.pendingTrack}>
        <View style={[styles.pendingBar, { width: '78%' }]} />
        <View style={[styles.pendingBar, { width: '46%' }]} />
      </View>
      <View style={styles.pendingRow}>
        <ActivityIndicator size="small" color={blue} />
        <Text style={styles.pendingTxt}>{label}</Text>
      </View>
    </View>
  );
}

function StatusCard({ title, count, empty, children, nativeID, pending = false, pendingLabel = 'Henter', pendingId }) {
  return (
    <View style={[styles.card, styles.statusCard]} nativeID={nativeID}>
      <View style={styles.statusHead}>
        <Text style={styles.cardTitle}>{title}</Text>
        {pending ? (
          <ActivityIndicator size="small" color={blue} />
        ) : (
          <Text style={styles.countBadge}>{count}</Text>
        )}
      </View>
      {pending ? (
        <CardPending label={pendingLabel} nativeID={pendingId} />
      ) : (count > 0 ? children : <Text style={styles.empty}>{empty}</Text>)}
    </View>
  );
}

function PeriodTable({ grid, today, onOpen, pending = false }) {
  return (
    <View style={styles.card} nativeID="fravaer-tabell">
      <Text style={styles.cardTitle}>Hvem som har fravær</Text>
      {pending ? (
        <CardPending label="Henter fravær i perioden" nativeID="fravaer-loading-tabell" />
      ) : (
      <>
      <Text style={styles.hint}>Fargen viser registrert ferie, sykdom eller annet. Trykk på navnet for mer om personen.</Text>
      <View style={styles.keys}>
        <Key color={BARS.ferie} label="Ferie" />
        <Key color={BARS.sykdom} label="Sykdom" />
        <Key color={BARS.annet} label="Annet" />
      </View>
      {grid.people.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={styles.gridHead}>
              <Text style={[styles.gridName, styles.headTxt]}>Ansatt</Text>
              {grid.days.map((day) => (
                <Text key={day.key} style={[styles.gridDay, styles.headTxt, day.key === today && styles.gridToday]}>
                  {`${day.weekday}\n${day.day}`}
                </Text>
              ))}
            </View>
            {grid.people.map((person) => (
              <TouchableOpacity key={person.id} onPress={() => onOpen?.(person.id)} style={styles.gridRow} accessibilityRole="button">
                <Text style={[styles.gridName, styles.nameTxt]} numberOfLines={1}>{person.name}</Text>
                {person.cells.map((cell, index) => {
                  const day = grid.days[index];
                  return (
                    <View
                      key={day.key}
                      style={[
                        styles.gridCell,
                        day.weekend && styles.gridCellEnd,
                        cell ? { backgroundColor: BARS[cell.bucket] || BARS.annet } : null,
                      ]}
                    />
                  );
                })}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      ) : (
        <Text style={styles.empty}>Ingen ansatte i dette utvalget.</Text>
      )}
      </>
      )}
    </View>
  );
}

function EmployeePane({
  name, kind, person, year, earned, yearUsed, remaining, hasQuota, planned,
  opening, openingPlaceholder, onOpeningChange, onSaveOpening, chartWidth, onChartWidth,
  pending = false,
}) {
  return (
    <View nativeID="fravaer-ansatt" style={{ gap: 10 }}>
      <View>
        <Text style={styles.personHeading}>{name}</Text>
        <Text style={styles.hint}>{kind}</Text>
      </View>
      <View style={styles.split}>
        <View style={[styles.card, styles.splitCard]}>
          <Text style={styles.cardTitle}>{`Feriebruk ${year}`}</Text>
          {pending ? (
            <CardPending label="Henter feriebruk" nativeID="fravaer-loading-ferie" />
          ) : (
            <View style={styles.donutRow}>
              <Donut used={yearUsed} total={earned} hasQuota={hasQuota} />
              <View style={styles.legend}>
                <Legend color={blue} label="Brukt i år" value={formatCount(yearUsed)} />
                {hasQuota ? <Legend color="#D5DEEA" label="Til gode" value={formatCount(remaining)} /> : null}
                {hasQuota ? <Legend label="Startsaldo" value={formatCount(earned)} /> : null}
              </View>
            </View>
          )}
          <View style={styles.opening}>
            <Text style={styles.openingLabel}>Startsaldo ferie</Text>
            <TextInput
              value={opening}
              onChangeText={onOpeningChange}
              placeholder={openingPlaceholder}
              placeholderTextColor="#A0A8B8"
              keyboardType="decimal-pad"
              style={styles.input}
              accessibilityLabel="Startsaldo ferie"
              nativeID="ferie-startsaldo"
            />
            <TouchableOpacity onPress={() => onSaveOpening?.('ferie')} style={styles.save} nativeID="ferie-startsaldo-save">
              <Text style={styles.saveTxt}>Lagre</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={[styles.card, styles.splitCard]} onLayout={(event) => onChartWidth?.(Math.max(180, event.nativeEvent.layout.width - 28))}>
          <Text style={styles.cardTitle}>{`Fravær i ${year}`}</Text>
          {pending ? (
            <CardPending label={`Henter fravær for ${year || 'året'}`} nativeID="fravaer-loading-ansatt-aar" />
          ) : (
            <>
              <MonthChart months={person?.months || []} width={chartWidth} />
              <View style={styles.keys}>
                <Key color={BARS.ferie} label="Ferie" />
                <Key color={BARS.sykdom} label="Sykdom" />
                <Key color={BARS.annet} label="Annet" />
              </View>
            </>
          )}
        </View>
      </View>
      {pending ? (
        <View style={styles.card}>
          <CardPending label="Henter planlagt fravær" nativeID="fravaer-loading-planlagt" />
        </View>
      ) : (
        <PlannedCard rows={planned} />
      )}
    </View>
  );
}

function PlannedCard({ rows, onOpen, heading = 'Planlagt fravær' }) {
  return (
    <View style={styles.card} nativeID="planlagt-fravaer">
      {heading ? (
        <View style={styles.statusHead}>
          <Text style={styles.cardTitle}>{heading}</Text>
          <Text style={styles.countBadge}>{rows.length}</Text>
        </View>
      ) : null}
      <Text style={styles.hint}>Registrert fravær frem i tid.</Text>
      {rows.length ? rows.map((row) => (
        <TouchableOpacity
          key={row.id}
          onPress={() => onOpen?.(row.employeeId)}
          disabled={!onOpen}
          style={styles.period}
          accessibilityRole="button"
        >
          <View style={[styles.swatch, { backgroundColor: BARS[row.bucket] || BARS.annet }]} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.periodName} numberOfLines={1}>{row.employeeName}</Text>
            <Text style={styles.periodMeta}>{`${row.typeLabel} · ${row.start === row.end ? row.start : `${row.start} – ${row.end}`}`}</Text>
          </View>
          <Text style={styles.periodDays}>{`${formatCount(row.days)} d`}</Text>
          <Text style={styles.periodStatus}>Planlagt</Text>
        </TouchableOpacity>
      )) : (
        <Text style={styles.empty}>Ingen planlagt fravær frem i tid.</Text>
      )}
    </View>
  );
}

function Kpi({ icon, tint, bg, value, label, onPress, pending = false, pendingId }) {
  return (
    <TouchableOpacity
      style={styles.kpi}
      onPress={onPress}
      disabled={!onPress || pending}
      accessibilityRole="button"
      accessibilityLabel={pending ? `Henter ${label}` : `${label}. Åpne kilden`}
      nativeID={pending ? pendingId : undefined}
    >
      <View style={[styles.kpiIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={14} color={tint} />
      </View>
      <View style={styles.kpiCopy}>
        {pending ? (
          <ActivityIndicator size="small" color={tint} />
        ) : (
          <Text style={styles.kpiValue}>{value}</Text>
        )}
        <Text style={styles.kpiLabel} numberOfLines={1}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

function Legend({ color, label, value }) {
  return (
    <View style={styles.legendRow}>
      {color ? <View style={[styles.dot, { backgroundColor: color }]} /> : <View style={styles.dot} />}
      <Text style={styles.legendLabel}>{label}</Text>
      <Text style={styles.legendValue}>{value}</Text>
    </View>
  );
}

function Key({ color, label }) {
  return (
    <View style={styles.key}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={styles.periodMeta}>{label}</Text>
    </View>
  );
}

function CheckRow({ label, on, onPress, nativeID }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.checkRow}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!on }}
      nativeID={nativeID}
    >
      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={18} color={on ? blue : muted} />
      <Text style={styles.nameTxt}>{label}</Text>
    </TouchableOpacity>
  );
}

function MenuRow({ label, on, onPress, nativeID }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.menuRow}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      nativeID={nativeID}
    >
      <Text style={[styles.nameTxt, on && { color: blue }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Donut({ used, total, hasQuota }) {
  const size = 88;
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const c = 2 * Math.PI * radius;
  const ratio = hasQuota && total > 0 ? Math.min(1, Math.max(0, used / total)) : 0;
  const dash = c * ratio;
  const percent = hasQuota && total > 0 ? Math.round((used / total) * 100) : 0;
  const center = size / 2;
  return (
    <View style={{ width: size, height: size }} nativeID="feriebruk-donut">
      <Svg width={size} height={size}>
        <Circle cx={center} cy={center} r={radius} stroke="#E7EEF6" strokeWidth={stroke} fill="none" />
        {dash > 0 ? (
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={blue}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            transform={`rotate(-90 ${center} ${center})`}
          />
        ) : null}
      </Svg>
      <View style={styles.donutCenter} pointerEvents="none">
        <Text style={styles.donutValue}>{hasQuota ? `${percent}%` : formatCount(used)}</Text>
        <Text style={styles.donutCaption}>{hasQuota ? `${formatCount(used)} av ${formatCount(total)}` : 'dager'}</Text>
      </View>
    </View>
  );
}

function MonthChart({ months, width }) {
  const plotH = 88;
  const gap = 6;
  const count = Math.max(1, months.length);
  const barW = Math.max(10, (width - 24 - gap * (count - 1)) / count);
  const max = Math.max(1, ...months.map((month) => month.ferie + month.sykdom + month.annet));
  return (
    <View nativeID="fravaer-maneder">
      <View style={styles.chartPlot}>
        <Svg width={Math.max(80, width - 8)} height={plotH}>
          {months.map((month, index) => {
            const x = index * (barW + gap);
            const parts = [['ferie', month.ferie], ['sykdom', month.sykdom], ['annet', month.annet]].filter((part) => part[1] > 0);
            let y = plotH;
            return parts.map(([key, value]) => {
              const h = Math.max(3, (value / max) * (plotH - 6));
              y -= h;
              return <Rect key={`${month.key || month.label}-${key}`} x={x} y={y} width={barW} height={h} rx={2} fill={BARS[key]} />;
            });
          })}
        </Svg>
      </View>
      <View style={styles.monthLabels}>
        {months.map((month) => (
          <Text key={month.key || month.label} style={[styles.monthLabel, { width: barW + gap }]}>{month.label}</Text>
        ))}
      </View>
    </View>
  );
}

const reportStyles = StyleSheet.create({
  screen: { flex: 1 },
  phoneScroll: { paddingBottom: 120 },
  phoneCol: { width: '100%', padding: 16, gap: 14 },
  phoneMain: { width: '100%', minWidth: 0, gap: 14 },
  hScroll: { width: '100%', overflowX: 'auto', overflowY: 'visible' },
  desk: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 16, padding: 16, paddingBottom: 48, width: '100%' },
  mainCol: { flex: 1, minWidth: 0, gap: 14 },
  crumb: { fontSize: 12 },
  heading: { fontSize: 22, fontWeight: '400' },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' },
  toolbarRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  ghostBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
  },
  primaryBtn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  primaryBtnText: { color: '#fff', fontWeight: '400' },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  filterBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: { color: '#fff', fontSize: 11, fontWeight: '400' },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  modalBgSheet: { justifyContent: 'flex-end' },
  filterSheet: {
    maxHeight: '88%',
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    borderTopWidth: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    zIndex: 2,
  },
  sheetScroll: { padding: 12, paddingBottom: 28, width: '100%' },
  settingsCard: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    borderTopWidth: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 28,
    gap: 10,
    zIndex: 2,
  },
  tableWrap: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, minHeight: 40 },
  head: { minHeight: 42 },
  th: { fontSize: 11, fontWeight: '400', paddingVertical: 10, paddingHorizontal: 4 },
  td: { fontSize: 13, paddingVertical: 8, paddingHorizontal: 4 },
  checkCell: { width: 36, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  rowHit: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
});

const styles = StyleSheet.create({
  page: { padding: 14, gap: 10, paddingBottom: 36 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  controlStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: line,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  controlEdge: { flexGrow: 1, flexBasis: 160, minWidth: 0, alignItems: 'flex-start' },
  controlEdgeRight: {
    flexGrow: 1,
    flexBasis: 160,
    minWidth: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  periodCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  errorTxt: { color: '#b42318', fontSize: 13, fontWeight: '400' },
  filterHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sortChip: {
    borderWidth: 1,
    borderColor: line,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  sortChipOn: { borderColor: blue, backgroundColor: '#E8F1FF' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: line,
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    minHeight: 40,
  },
  searchInput: { flex: 1, color: ink, fontSize: 14, paddingVertical: 8 },
  personBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  personTxt: { color: ink, fontWeight: '400', fontSize: 13 },
  menu: { borderWidth: 1, borderRadius: 10, backgroundColor: '#fff', maxHeight: 280, overflow: 'hidden' },
  menuRow: { paddingHorizontal: 12, paddingVertical: 7 },
  kpis: {
    flexDirection: 'row',
    gap: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: line,
    borderRadius: 12,
    overflow: 'hidden',
  },
  kpi: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: line,
  },
  kpiIcon: { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  kpiCopy: { flex: 1, minWidth: 0, gap: 1 },
  kpiValue: { color: ink, fontSize: 13, fontWeight: '400', fontVariant: ['tabular-nums'] },
  kpiLabel: { color: muted, fontSize: 13, fontWeight: '400' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: line, borderRadius: 12, padding: 12, gap: 6 },
  statusCard: { alignSelf: 'stretch', gap: 4 },
  board: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' },
  boardMain: { flexGrow: 1.7, flexShrink: 1, flexBasis: 640, minWidth: 300, gap: 10 },
  boardSide: { flexGrow: 1, flexShrink: 1, flexBasis: 300, minWidth: 260 },
  pending: { gap: 8, paddingVertical: 4 },
  pendingTrack: { gap: 6 },
  pendingBar: { height: 8, borderRadius: 4, backgroundColor: '#E6EBF2' },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pendingTxt: { color: muted, fontSize: 13, fontWeight: '400' },
  statusHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  countBadge: {
    color: muted,
    fontSize: 13,
    fontWeight: '400',
    fontVariant: ['tabular-nums'],
    backgroundColor: '#F3F6FA',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  cardTitle: { color: ink, fontSize: 13, fontWeight: '400' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  yearRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' },
  yearChip: {
    borderWidth: 1, borderColor: line, backgroundColor: '#fff', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  yearChipOn: { borderColor: blue, backgroundColor: '#E8F0FE' },
  yearChipTxt: { color: muted, fontSize: 12, fontWeight: '400' },
  yearChipTxtOn: { color: blue, fontWeight: '400' },
  hint: { color: muted, fontSize: 13, fontWeight: '400', marginTop: -2 },
  empty: { color: muted, fontSize: 13, fontWeight: '400', paddingVertical: 2 },
  moreHint: { color: muted, fontSize: 13, fontWeight: '400', paddingTop: 2 },
  awayList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  awayPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F4F7FB', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5,
    maxWidth: '100%',
  },
  awayName: { color: ink, fontWeight: '400', fontSize: 13, flexShrink: 1 },
  awayType: { color: muted, fontSize: 13, fontWeight: '400', flexShrink: 1 },
  split: { flexDirection: 'row', gap: 10, alignItems: 'stretch', flexWrap: 'wrap' },
  splitCard: { flex: 1, minWidth: 260 },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 2 },
  donutCenter: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  donutValue: { color: ink, fontSize: 13, fontWeight: '400' },
  donutCaption: { color: muted, fontSize: 13, fontWeight: '400' },
  legend: { flex: 1, gap: 5 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendLabel: { color: muted, flex: 1, fontSize: 13, fontWeight: '400' },
  legendValue: { color: ink, fontWeight: '400', fontSize: 13, fontVariant: ['tabular-nums'] },
  dot: { width: 7, height: 7, borderRadius: 4 },
  swatch: { width: 7, height: 7, borderRadius: 2 },
  keys: { flexDirection: 'row', gap: 12, marginTop: 2 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chartPlot: { paddingTop: 2 },
  monthLabels: { flexDirection: 'row' },
  monthLabel: { color: muted, fontSize: 13, textAlign: 'center', fontWeight: '400' },
  opening: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  openingLabel: { color: muted, fontSize: 13, fontWeight: '400' },
  input: { borderWidth: 1, borderColor: line, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, minWidth: 72, color: ink, fontSize: 13, fontWeight: '400' },
  save: { backgroundColor: blue, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  saveTxt: { color: '#fff', fontWeight: '400', fontSize: 13 },
  matrix: { minWidth: 920, gap: 0 },
  matrixHead: { flexDirection: 'row', alignItems: 'center', paddingBottom: 4 },
  matrixRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: line, paddingVertical: 5 },
  nameCol: { width: 150 },
  monthCol: { width: 48, textAlign: 'center' },
  numCol: { width: 72, textAlign: 'right' },
  headTxt: { color: muted, fontSize: 13, fontWeight: '400' },
  nameTxt: { color: ink, fontWeight: '400', fontSize: 13 },
  monthNum: { fontSize: 13, fontWeight: '400' },
  numTxt: { color: ink, fontWeight: '400', fontSize: 13, textAlign: 'right', fontVariant: ['tabular-nums'] },
  segmentTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: line,
    borderRadius: 10,
    backgroundColor: '#F4F7FB',
    padding: 3,
    gap: 2,
    flexWrap: 'wrap',
  },
  segment: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 32,
  },
  segmentOn: { backgroundColor: '#fff' },
  segmentLabel: { color: muted, fontSize: 13, fontWeight: '400' },
  segmentLabelOn: { color: ink, fontWeight: '400' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  navHit: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { color: ink, fontWeight: '400', fontSize: 13, minWidth: 148, textAlign: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backTxt: { color: blue, fontWeight: '400', fontSize: 13 },
  personHeading: { color: ink, fontSize: 13, fontWeight: '400' },
  gridHead: { flexDirection: 'row', alignItems: 'flex-end' },
  gridRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: line, paddingVertical: 3 },
  gridName: { width: 160 },
  gridDay: { width: 36, textAlign: 'center', fontSize: 13 },
  gridToday: { color: blue },
  gridCell: { width: 28, height: 20, marginHorizontal: 4, borderRadius: 4, backgroundColor: '#F4F7FB' },
  gridCellEnd: { backgroundColor: '#EEF2F6' },
  period: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: line },
  periodName: { color: ink, fontWeight: '400', fontSize: 13 },
  periodMeta: { color: muted, fontSize: 13, fontWeight: '400' },
  periodDays: { color: ink, fontWeight: '400', width: 44, textAlign: 'right', fontVariant: ['tabular-nums'] },
  periodStatus: { color: muted, width: 80, textAlign: 'right', fontSize: 13, fontWeight: '400' },
  tableHead: { flexDirection: 'row', paddingBottom: 6 },
  tableRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: line, paddingVertical: 8 },
  colGrow: { flex: 1, minWidth: 0 },
  colDays: { width: 72, textAlign: 'right' },
  colStatus: { width: 100, textAlign: 'right' },
});
