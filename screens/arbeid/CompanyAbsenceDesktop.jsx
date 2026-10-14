import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Rect } from 'react-native-svg';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import { absenceTypeById } from '../../src/arbeid/absenceCatalog.js';
import { buildAbsenceWebBoard } from '../../src/arbeid/absenceDashboard.js';
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

const ink = '#152033';
const muted = '#8B95A6';
const line = '#E6EBF2';
const blue = '#2F6BDB';
const BARS = { ferie: '#2F6BDB', sykdom: '#E15D6A', annet: '#F0A04B' };
const FILTERS = [
  { id: 'alle', label: 'Alle' },
  { id: 'ferie', label: 'Ferie' },
  { id: 'sykdom', label: 'Sykdom' },
  { id: 'permisjon', label: 'Permisjon' },
  { id: 'annet', label: 'Annet' },
];
const STATUS = {
  planlagt: 'Planlagt',
  pagar: 'Pågår',
  avsluttet: 'Avsluttet',
  registrert: 'Registrert',
  behandling: 'Til behandling',
  godkjent: 'Godkjent',
  låst: 'Låst',
};

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

function useBoard(props) {
  const {
    employees = [], names = {}, employeeId = '', absences = [], adjustments = [],
    fullDayHours = 7.5, today = '',
  } = props;
  return useMemo(() => buildAbsenceWebBoard({
    employees, employeeId, absences, adjustments, fullDayHours, today, names,
  }), [employees, employeeId, absences, adjustments, fullDayHours, today, names]);
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
}) {
  const colors = useColors();
  const board = useBoard({
    employees, names, employeeId, absences, adjustments, fullDayHours, today,
  });
  const [kind, setKind] = useState('alle');
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [chartWidth, setChartWidth] = useState(420);
  const summary = board.dash.summary || {};
  const earned = Number(summary.earned) || 0;
  const used = Number(summary.used) || 0;
  const hasQuota = earned > 0;
  const lines = board.lines.filter((row) => kind === 'alle' || row.category === kind);
  const away = board.lines.filter((row) => row.status === 'pagar');
  const selectedName = employeeId ? (names[employeeId] || 'Ansatt') : 'Alle ansatte';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#F4F7FB' }}
      contentContainerStyle={styles.page}
      nativeID="fravaer-oversikt-web"
    >
      <View style={styles.toolbar}>
        <Text style={styles.lead}>Registrert fravær, feriesaldo, hvem som er borte og hva som er planlagt.</Text>
        {canChooseEmployee ? (
          <TouchableOpacity
            onPress={() => setPeopleOpen((value) => !value)}
            style={[styles.personBtn, { borderColor: line, backgroundColor: '#fff' }]}
            accessibilityRole="button"
            accessibilityLabel="Velg ansatt"
          >
            <Ionicons name="people" size={15} color={blue} />
            <Text style={styles.personTxt}>{selectedName}</Text>
            <Ionicons name="chevron-down" size={14} color={muted} />
          </TouchableOpacity>
        ) : null}
      </View>
      {peopleOpen ? (
        <View style={[styles.menu, { borderColor: line }]}>
          <MenuRow label="Alle ansatte" on={!employeeId} onPress={() => { setPeopleOpen(false); onSelectEmployee?.(''); }} />
          {employees.map((row) => (
            <MenuRow
              key={row.id}
              label={names[row.id] || 'Ansatt'}
              on={row.id === employeeId}
              onPress={() => { setPeopleOpen(false); onSelectEmployee?.(row.id); }}
            />
          ))}
        </View>
      ) : null}
      {error ? <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text> : null}

      <View style={styles.kpis}>
        <Kpi icon="people" tint={blue} bg="#E8F0FE" value={board.dash.headcount || 0} label="Ansatte" />
        <Kpi icon="calendar" tint="#1F9D55" bg="#E7F8EF" value={board.dash.onVacation || 0} label="På ferie nå" />
        <Kpi icon="heart" tint="#E15B73" bg="#FDECEF" value={board.dash.sickNow || 0} label="Sykemeldte nå" />
        <Kpi icon="time" tint="#E09A3E" bg="#FFF4E5" value={board.dash.otherNow || 0} label="Annet fravær nå" />
      </View>

      <View style={[styles.card, styles.awayCard]}>
        <Text style={styles.cardTitle}>Borte i dag</Text>
        {away.length ? (
          <View style={styles.awayRow}>
            {away.map((row) => (
              <View key={row.id} style={styles.awayPill}>
                <View style={[styles.swatch, { backgroundColor: BARS[row.bucket] || BARS.annet }]} />
                <Text style={styles.awayName}>{row.employeeName}</Text>
                <Text style={styles.awayType}>{row.typeLabel}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>Ingen er registrert borte i dag.</Text>
        )}
      </View>

      <PlannedCard rows={board.planned || []} />

      <View style={styles.split}>
        <View style={[styles.card, styles.splitCard]}>
          <Text style={styles.cardTitle}>{`Feriebruk ${board.year}`}</Text>
          <View style={styles.donutRow}>
            <Donut used={used} total={earned} hasQuota={hasQuota} />
            <View style={styles.legend}>
              <Legend color={blue} label="Brukte dager" value={formatCount(used)} />
              {hasQuota ? <Legend color="#D5DEEA" label="Gjenstående" value={formatCount(Math.max(0, earned - used))} /> : null}
              {hasQuota ? <Legend label="Startsaldo" value={formatCount(earned)} /> : null}
            </View>
          </View>
          {employeeId ? (
            <View style={styles.opening}>
              <Text style={styles.openingLabel}>{`Startsaldo ${absenceTypeById('ferie').label.toLowerCase()}`}</Text>
              <TextInput
                value={opening}
                onChangeText={onOpeningChange}
                placeholder={formatCount(summary.opening || 0)}
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
          ) : null}
        </View>
        <View
          style={[styles.card, styles.splitCard]}
          onLayout={(event) => setChartWidth(Math.max(220, event.nativeEvent.layout.width - 36))}
        >
          <Text style={styles.cardTitle}>Fravær siste 6 måneder</Text>
          <MonthChart months={board.dash.recentMonths || []} width={chartWidth} />
          <View style={styles.keys}>
            <Key color={BARS.ferie} label="Ferie" />
            <Key color={BARS.sykdom} label="Sykdom" />
            <Key color={BARS.annet} label="Annet" />
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{`Fravær i ${board.year}`}</Text>
        <Text style={styles.hint}>Dager per måned. Feriesaldoen er lagret startsaldo minus registrert ferie.</Text>
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
              {board.staff.map((person) => (
                <View key={person.id} style={styles.matrixRow}>
                  <Text style={[styles.nameCol, styles.nameTxt]} numberOfLines={1}>{person.name}</Text>
                  {person.months.map((month) => {
                    const total = monthTotal(month);
                    return (
                      <Text key={month.label} style={[styles.monthCol, styles.monthNum, total ? { color: monthTone(month) } : null]}>
                        {total ? formatCount(total) : ''}
                      </Text>
                    );
                  })}
                  <Text style={[styles.numCol, styles.numTxt]}>{formatCount(person.vacationUsed)}</Text>
                  <Text style={[styles.numCol, styles.numTxt]}>{person.earned ? formatCount(person.remaining) : '–'}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        ) : (
          <Text style={styles.empty}>{`Ingen fravær er registrert i ${board.year}.`}</Text>
        )}
      </View>

      <View style={styles.card} nativeID="fravaer-perioder">
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>Registrerte perioder</Text>
          <View style={styles.filters}>
            {FILTERS.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => setKind(item.id)}
                style={[styles.filter, kind === item.id && styles.filterOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: kind === item.id }}
              >
                <Text style={[styles.filterTxt, kind === item.id && styles.filterTxtOn]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        {lines.length ? lines.map((row) => (
          <View key={row.id} style={styles.period}>
            <View style={[styles.swatch, { backgroundColor: BARS[row.bucket] || BARS.annet }]} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.periodName} numberOfLines={1}>{row.employeeName}</Text>
              <Text style={styles.periodMeta}>{`${row.typeLabel} · ${row.start === row.end ? row.start : `${row.start} – ${row.end}`}`}</Text>
            </View>
            <Text style={styles.periodDays}>{`${formatCount(row.days)} d`}</Text>
            <Text style={styles.periodStatus}>{STATUS[row.status] || 'Registrert'}</Text>
          </View>
        )) : (
          <Text style={styles.empty}>Ingen perioder i dette utvalget.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const TABLE_MIN_FALLBACK = 720;
const PAGE_STEP = 80;

function reportColumnStyle(column) {
  if (column.flex) {
    return { flexGrow: 1, flexShrink: 1, flexBasis: column.minWidth || 160, minWidth: column.minWidth || 120 };
  }
  return { width: column.width, flexGrow: 0, flexShrink: 0 };
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
  absenceCount = 0,
  onOpenPeriod,
  note = '',
  error = '',
  loading = false,
}) {
  const colors = useColors();
  const { width, isPhone, hasRail, railWidth } = useLayout();
  const contentWidth = width - (hasRail ? railWidth : 0) - 32;
  const stackRows = isPhone || contentWidth < 960;

  const [employeeId, setEmployeeId] = useState(canChooseEmployee ? '' : lockedEmployeeId);
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('date-desc');
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_ABSENCE_REPORT_COLUMNS);
  const [panelOpen, setPanelOpen] = useState(false);
  const [pageSize, setPageSize] = useState(PAGE_STEP);

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
    status,
    period,
    fromDate,
    toDate,
  }), [
    hydrated, query, employeeId, canChooseEmployee, lockedEmployeeId,
    category, status, period, fromDate, toDate,
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
        name: row.employeeName || names[row.employeeId] || 'Ansatt',
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
    setPageSize(PAGE_STEP);
  }, [query, employeeId, category, status, period, fromDate, toDate, sort, absences.length]);

  function resetFilters() {
    setQuery('');
    setEmployeeId(canChooseEmployee ? '' : lockedEmployeeId);
    setPeriod('all');
    setFromDate('');
    setToDate('');
    setCategory('');
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
      onCategory={setCategory}
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
      onReset={resetFilters}
      onClose={stackRows ? () => setPanelOpen(false) : undefined}
    />
  );

  const emptyHint = (
    <View style={{ padding: 16 }}>
      <Text style={{ color: colors.muted }}>
        {loading
          ? 'Laster fravær…'
          : absences.length
            ? 'Ingen fravær i dette utvalget. Endre periode eller filter i panelet til høyre.'
            : 'Ingen fravær er registrert. Importer Excel eller registrer fravær for ansatte.'}
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
      <Text style={{ color: colors.brand, fontWeight: '600' }}>
        Vis flere ({pageRows.length} av {visible.length})
      </Text>
    </TouchableOpacity>
  ) : null;

  const table = (
    <View
      style={[reportStyles.tableWrap, { borderColor: colors.line, backgroundColor: colors.card }]}
      nativeID="absence-report-table"
    >
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ minWidth: Math.max(tableMin, stackRows ? contentWidth : tableMin) }}>
          <View style={[reportStyles.tr, reportStyles.head, { borderBottomColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}>
            {columns.map((column) => (
              <Text key={column.key} style={[reportStyles.th, reportColumnStyle(column), { color: colors.muted }]}>
                {column.label}
              </Text>
            ))}
          </View>
          <View style={{ maxHeight: stackRows ? undefined : 720 }} nativeID="absence-report-table-body">
            <ScrollView nestedScrollEnabled={!stackRows}>
              {!pageRows.length ? emptyHint : pageRows.map((row) => (
                <TouchableOpacity
                  key={row.id}
                  style={[reportStyles.tr, { borderBottomColor: colors.line }]}
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
                        (column.key === 'hours' || column.key === 'paidHours' || column.key === 'percent') && { textAlign: 'right', fontWeight: '600' },
                        column.key === 'employeeName' && { fontWeight: '600', color: colors.ink },
                      ]}
                      numberOfLines={2}
                    >
                      {reportCellValue(row, column.key)}
                    </Text>
                  ))}
                </TouchableOpacity>
              ))}
              {moreButton}
            </ScrollView>
          </View>
        </View>
      </ScrollView>
    </View>
  );

  const filterModal = (
    <Modal transparent visible={panelOpen} animationType="slide" onRequestClose={() => setPanelOpen(false)}>
      <View style={reportStyles.modalBg}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setPanelOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Lukk filter"
        />
        <View
          style={[reportStyles.filterSheet, { backgroundColor: colors.bg, borderColor: colors.line }]}
          accessibilityViewIsModal
          nativeID="absence-filter-sheet"
        >
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
            {organizePanel}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={[reportStyles.screen, { backgroundColor: colors.bg }]} nativeID="fravaersrapport">
      <View style={reportStyles.desk}>
        <View style={reportStyles.mainCol}>
          <View style={reportStyles.toolbar}>
            <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
              <Text style={[reportStyles.crumb, { color: colors.muted }]}>Arbeid / Fraværsrapport</Text>
              <Text style={[reportStyles.heading, { color: colors.ink }]}>Fraværsrapport</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {loading
                  ? 'Laster fravær…'
                  : `${absences.length} lastet · ${totals.count} vist · ${formatHours(totals.hours)} timer`}
              </Text>
            </View>
            <View style={reportStyles.toolbarRight}>
              {stackRows ? (
                <TouchableOpacity
                  onPress={() => setPanelOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Filtrer og sorter"
                  nativeID="absence-organize-toggle"
                  style={[reportStyles.ghostBtn, { borderColor: colors.line }]}
                >
                  <Ionicons name="options-outline" size={18} color={colors.ink} />
                  <Text style={{ color: colors.ink, fontWeight: '600' }}>Filter</Text>
                </TouchableOpacity>
              ) : null}
              {canImport && absenceCount > 0 && onClearImported ? (
                <TouchableOpacity
                  onPress={onClearImported}
                  style={[reportStyles.ghostBtn, { borderColor: colors.line }]}
                  accessibilityRole="button"
                  accessibilityLabel="Fjern importert fravær"
                  nativeID="fravaer-clear-imported"
                >
                  <Ionicons name="trash-outline" size={15} color={colors.muted} />
                  <Text style={{ color: colors.muted, fontWeight: '600' }}>Tøm import</Text>
                </TouchableOpacity>
              ) : null}
              {canImport ? (
                <TouchableOpacity
                  onPress={onImport}
                  style={[reportStyles.primaryBtn, { backgroundColor: colors.brand }]}
                  accessibilityRole="button"
                  accessibilityLabel="Importer fravær"
                  nativeID="fravaer-import"
                >
                  <Ionicons name="cloud-upload-outline" size={15} color="#fff" />
                  <Text style={reportStyles.primaryBtnText}>Importer</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {error ? <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text> : null}
          {note ? <Text style={{ color: colors.muted }}>{note}</Text> : null}

          <View style={reportStyles.summaryRow}>
            <Text style={{ color: colors.muted }}>Ferie {totals.ferie}</Text>
            <Text style={{ color: colors.muted }}>Sykdom {totals.sykdom}</Text>
            <Text style={{ color: colors.muted }}>Annet {totals.annet}</Text>
            <Text style={{ color: colors.muted }}>Timer {formatHours(totals.hours)}</Text>
            <Text style={{ color: colors.muted }}>Lønn {formatHours(totals.paidHours)}</Text>
          </View>

          {table}
        </View>
        {!stackRows ? organizePanel : null}
      </View>
      {stackRows ? filterModal : null}
    </View>
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
}) {
  const [employeeId, setEmployeeId] = useState(canChooseEmployee ? '' : lockedEmployeeId);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const board = useBoard({
    employees, names, employeeId, absences, adjustments, fullDayHours, today,
  });
  const selectedName = employeeId ? (names[employeeId] || 'Ansatt') : 'Alle ansatte';
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#F4F7FB' }}
      contentContainerStyle={styles.page}
      nativeID="planlagt-fravaer-side"
    >
      <View style={styles.toolbar}>
        <Text style={styles.lead}>Fravær som er registrert frem i tid, også inn i neste år.</Text>
        {canChooseEmployee ? (
          <TouchableOpacity
            onPress={() => setPeopleOpen((value) => !value)}
            style={[styles.personBtn, { borderColor: line, backgroundColor: '#fff' }]}
            accessibilityRole="button"
            accessibilityLabel="Velg ansatt"
          >
            <Ionicons name="people" size={15} color={blue} />
            <Text style={styles.personTxt}>{selectedName}</Text>
            <Ionicons name="chevron-down" size={14} color={muted} />
          </TouchableOpacity>
        ) : null}
      </View>
      {peopleOpen ? (
        <View style={[styles.menu, { borderColor: line }]}>
          <MenuRow label="Alle ansatte" on={!employeeId} onPress={() => { setPeopleOpen(false); setEmployeeId(''); }} />
          {employees.map((row) => (
            <MenuRow
              key={row.id}
              label={names[row.id] || 'Ansatt'}
              on={row.id === employeeId}
              onPress={() => { setPeopleOpen(false); setEmployeeId(row.id); }}
            />
          ))}
        </View>
      ) : null}
      <PlannedCard rows={board.planned || []} />
    </ScrollView>
  );
}

function PlannedCard({ rows, onOpenPeriod }) {
  return (
    <View style={styles.card} nativeID="planlagt-fravaer">
      <Text style={styles.cardTitle}>Planlagt fravær</Text>
      <Text style={styles.hint}>Registrert fravær som ligger frem i tid.</Text>
      {rows.length ? rows.map((row) => (
        <TouchableOpacity
          key={row.id}
          style={styles.period}
          onPress={() => onOpenPeriod?.(row)}
          disabled={!onOpenPeriod}
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

function Kpi({ icon, tint, bg, value, label }) {
  return (
    <View style={styles.kpi}>
      <View style={[styles.kpiIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
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

function MenuRow({ label, on, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.menuRow} accessibilityRole="button">
      <Text style={[styles.nameTxt, on && { color: blue }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Donut({ used, total, hasQuota }) {
  const size = 128;
  const stroke = 12;
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
  const plotH = 140;
  const gap = 10;
  const count = Math.max(1, months.length);
  const barW = Math.max(12, (width - 28 - gap * (count - 1)) / count);
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
              return <Rect key={`${month.key || month.label}-${key}`} x={x} y={y} width={barW} height={h} rx={3} fill={BARS[key]} />;
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
  desk: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 16, padding: 16, paddingBottom: 48, width: '100%' },
  mainCol: { flex: 1, minWidth: 0, gap: 14 },
  crumb: { fontSize: 12 },
  heading: { fontSize: 24, fontWeight: '800' },
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
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  tableWrap: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, minHeight: 40 },
  head: { minHeight: 42 },
  th: { fontSize: 11, fontWeight: '700', paddingVertical: 10, paddingHorizontal: 4 },
  td: { fontSize: 13, paddingVertical: 8, paddingHorizontal: 4 },
  modalBg: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)', justifyContent: 'flex-end' },
  filterSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    maxHeight: '92%',
    padding: 12,
  },
});

const styles = StyleSheet.create({
  page: { padding: 20, gap: 14, paddingBottom: 48 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  toolbarRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  lead: { color: muted, fontSize: 14, flex: 1 },
  personBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8,
  },
  personTxt: { color: ink, fontWeight: '600' },
  menu: { borderWidth: 1, borderRadius: 12, backgroundColor: '#fff', maxHeight: 280, overflow: 'hidden' },
  menuRow: { paddingHorizontal: 12, paddingVertical: 8 },
  kpis: { flexDirection: 'row', gap: 12 },
  kpi: {
    flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: line, borderRadius: 14,
    padding: 14, gap: 4,
  },
  kpiIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  kpiValue: { color: ink, fontSize: 26, fontWeight: '800' },
  kpiLabel: { color: muted, fontSize: 13 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: line, borderRadius: 14, padding: 16, gap: 10 },
  awayCard: { gap: 8 },
  cardTitle: { color: ink, fontSize: 16, fontWeight: '700' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  hint: { color: muted, fontSize: 12, marginTop: -4 },
  empty: { color: muted, fontSize: 14 },
  awayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  awayPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F4F7FB', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6,
  },
  awayName: { color: ink, fontWeight: '700', fontSize: 13 },
  awayType: { color: muted, fontSize: 12 },
  split: { flexDirection: 'row', gap: 14, alignItems: 'stretch' },
  splitCard: { flex: 1, minWidth: 280 },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  donutCenter: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  donutValue: { color: ink, fontSize: 22, fontWeight: '800' },
  donutCaption: { color: muted, fontSize: 11 },
  legend: { flex: 1, gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendLabel: { color: muted, flex: 1 },
  legendValue: { color: ink, fontWeight: '700' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  keys: { flexDirection: 'row', gap: 14 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chartPlot: { paddingTop: 4 },
  monthLabels: { flexDirection: 'row' },
  monthLabel: { color: muted, fontSize: 11, textAlign: 'center' },
  opening: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  openingLabel: { color: muted, fontSize: 12 },
  input: { borderWidth: 1, borderColor: line, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, minWidth: 72, color: ink },
  save: { backgroundColor: blue, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  saveTxt: { color: '#fff', fontWeight: '700' },
  matrix: { minWidth: 920, gap: 2 },
  matrixHead: { flexDirection: 'row', alignItems: 'center', paddingBottom: 6 },
  matrixRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: line, paddingVertical: 6 },
  nameCol: { width: 150 },
  monthCol: { width: 48, textAlign: 'center' },
  numCol: { width: 72, textAlign: 'right' },
  headTxt: { color: muted, fontSize: 11, fontWeight: '700' },
  nameTxt: { color: ink, fontWeight: '600', fontSize: 13 },
  monthNum: { fontSize: 12, fontWeight: '700' },
  numTxt: { color: ink, fontWeight: '700', fontSize: 13, textAlign: 'right' },
  filters: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  filter: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#F3F6FA' },
  filterOn: { backgroundColor: '#102848' },
  filterTxt: { color: muted, fontSize: 13 },
  filterTxtOn: { color: '#fff', fontWeight: '700' },
  period: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: line },
  periodName: { color: ink, fontWeight: '700' },
  periodMeta: { color: muted, fontSize: 12 },
  periodDays: { color: ink, fontWeight: '700', width: 48, textAlign: 'right' },
  periodStatus: { color: muted, width: 88, textAlign: 'right', fontSize: 12 },
});
