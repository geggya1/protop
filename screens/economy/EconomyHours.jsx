import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import ImportReview, { ImportResult } from '../../components/ImportReview';
import { importResult } from '../../src/imports/review';
import { pickDocument } from '../../src/utils/media';
import {
  HOUR_IMPORT_ACCEPT,
  linkImportPlanCustomer,
  linkImportPlanEmployee,
  linkImportPlanProject,
  reviewRowsForHourPlan,
  suggestEmployees,
  toggleHourReviewRow,
} from '../../src/economy/hoursImport.js';
import { suggestCustomers } from '../../src/economy/invoiceImport.js';
import {
  employeeHourOptions,
  filterHours,
  formatDate,
  formatHours,
  hourTotals,
} from '../../src/economy/hoursList.js';
import { readHourImport } from '../../src/imports/assist';
import { askImportInterpret } from '../../src/imports/interpretClient';
import { emptyProjectState, importTimeEntries } from '../../src/project/engine';
import { loadProjectState, saveProjectState } from '../../src/project/storage';
import { watchEmployees } from '../../src/employees/storage';
import { displayName } from '../../src/employees/model.js';

async function bytesFromFile(file) {
  let blob = file?.blob || null;
  if (!blob && file?.uri && typeof fetch === 'function') {
    blob = await (await fetch(file.uri)).blob();
  }
  if (!blob || typeof blob.arrayBuffer !== 'function') {
    throw new Error('Kunne ikke lese filen.');
  }
  return new Uint8Array(await blob.arrayBuffer());
}

const PERIODS = [
  { id: 'all', label: 'Alle' },
  { id: '7', label: 'Siste 7 dager' },
  { id: '30', label: 'Siste 30 dager' },
  { id: '100', label: 'Siste 100 dager' },
  { id: 'year', label: 'I år' },
];

const COLUMNS = [
  { key: 'date', label: 'Dato', width: 96 },
  { key: 'employeeName', label: 'Medarbeider', flex: true, minWidth: 140 },
  { key: 'customerName', label: 'Kunde', flex: true, minWidth: 140 },
  { key: 'projectName', label: 'Prosjekt', flex: true, minWidth: 160 },
  { key: 'activityName', label: 'Aktivitet', width: 120 },
  { key: 'hours', label: 'Timer', width: 72 },
  { key: 'billableHours', label: 'Fakt.', width: 72 },
  { key: 'description', label: 'Beskrivelse', flex: true, minWidth: 160 },
];

const TABLE_MIN = COLUMNS.reduce((sum, column) => sum + (column.minWidth || column.width), 0);

function columnStyle(column) {
  if (column.flex) {
    return { flexGrow: 1, flexShrink: 1, flexBasis: column.minWidth || 160, minWidth: column.minWidth || 120 };
  }
  return { width: column.width, flexGrow: 0, flexShrink: 0 };
}

export default function EconomyHours({
  familyId,
  customers = [],
  projects = [],
  onOpenCustomer,
  onOpenProject,
}) {
  const colors = useColors();
  const { width, isPhone, hasRail, railWidth } = useLayout();
  const contentWidth = width - (hasRail ? railWidth : 0) - 32;
  const stackRows = isPhone || contentWidth < 720;

  const [state, setState] = useState(emptyProjectState());
  const [employees, setEmployees] = useState([]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState('list');
  const [query, setQuery] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [period, setPeriod] = useState('all');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [importPlan, setImportPlan] = useState(null);
  const [dropped, setDropped] = useState(new Set());
  const [importReport, setImportReport] = useState(null);
  const [linkQuery, setLinkQuery] = useState({});
  const [pageSize, setPageSize] = useState(80);
  const saveChain = useRef(Promise.resolve());

  useEffect(() => {
    let live = true;
    loadProjectState(familyId).then((loaded) => {
      if (!live) return;
      setState(loaded);
      setReady(true);
    });
    return () => { live = false; };
  }, [familyId]);

  useEffect(() => {
    const stop = watchEmployees(familyId, setEmployees, () => {});
    return stop;
  }, [familyId]);

  const entries = state.timeEntries || [];
  const projectList = projects.length ? projects : (state.projects || []);

  const visible = useMemo(() => filterHours(entries, {
    query,
    employeeId: employeeFilter,
    period,
  }).slice().sort((left, right) => (
    String(right.date || '').localeCompare(String(left.date || ''))
    || String(left.employeeName || '').localeCompare(String(right.employeeName || ''), 'nb')
  )), [entries, query, employeeFilter, period]);

  const pageRows = useMemo(() => visible.slice(0, pageSize), [visible, pageSize]);
  const totals = useMemo(() => hourTotals(visible), [visible]);
  const employeeOptions = useMemo(
    () => employeeHourOptions(entries, employees),
    [entries, employees],
  );
  const reviewRows = useMemo(
    () => (importPlan ? reviewRowsForHourPlan(importPlan, { dropped }) : []),
    [importPlan, dropped],
  );

  useEffect(() => {
    setPageSize(80);
  }, [query, employeeFilter, period, entries.length]);

  function persist(next) {
    setState(next);
    const job = saveChain.current.then(() => saveProjectState(next, familyId));
    saveChain.current = job.catch(() => {});
    return job;
  }

  async function importFile() {
    setError('');
    const file = await pickDocument({ accept: HOUR_IMPORT_ACCEPT });
    if (!file) return;
    setBusy(true);
    setProgress('Leser fil…');
    try {
      const bytes = await bytesFromFile(file);
      const plan = await readHourImport(bytes, file.name, {
        familyId,
        existingEntries: entries,
        employees,
        customers,
        projects: projectList,
      }, (payload) => askImportInterpret(payload));
      if (!plan.rows.length) {
        setError('Fant ingen timer i filen.');
        return;
      }
      setImportPlan(plan);
      setDropped(new Set());
      setImportReport(null);
      setLinkQuery({});
      const engine = plan.interpretation?.engine;
      setNote(engine && engine !== 'lokal'
        ? `Listen er tolket (${engine}). Kontroller koblinger før import.`
        : 'Duplikater hoppes over automatisk. Kontroller medarbeider og prosjekt før lagring.');
      setView('import');
      setProgress('');
    } catch (cause) {
      const message = String(cause?.message || '');
      setError(/failed to fetch/i.test(message) || (cause?.name === 'TypeError' && !message)
        ? 'Kunne ikke lese Excel-filen. Eksporter listen som CSV og importer den i stedet.'
        : (message || 'Kunne ikke lese timelisten.'));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  async function confirmImport() {
    if (!importPlan || busy) return;
    const chosen = [];
    const leftOut = [];
    importPlan.rows.forEach((row, index) => {
      const id = String(index);
      const missingLink = !row.entry?.employeeId || !row.entry?.projectId;
      if (
        row.severity === 'block'
        || row.severity === 'existing'
        || dropped.has(id)
        || !row.entry
        || missingLink
      ) {
        leftOut.push({
          name: row.title || 'Uten dato',
          reason: row.severity === 'existing'
            ? (row.issues?.[0] || 'Duplikat — hoppet over.')
            : row.severity === 'block'
              ? (row.issues?.[0] || 'Kan ikke importeres.')
              : missingLink
                ? 'Mangler kobling til medarbeider eller prosjekt.'
                : 'Valgt bort før lagring.',
        });
        return;
      }
      chosen.push(row);
    });
    if (!chosen.length) {
      setError('Ingen timer er valgt for import.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = importTimeEntries(state, chosen.map((row) => row.entry));
      if (!result.ok) throw new Error(result.error || 'Kunne ikke importere timer.');
      await persist(result.state);
      const withIssues = chosen.filter((row) => (row.issues || []).length).length;
      const report = importResult(
        [{ name: `${result.added.length} timeføringer`, issues: withIssues ? [`${withIssues} med avvik`] : [] }],
        leftOut,
      );
      report.saved = result.added.length;
      report.total = chosen.length + leftOut.length;
      report.complete = !leftOut.length && !withIssues && !result.skipped.length;
      setImportReport(report);
      setImportPlan(null);
      setDropped(new Set());
      setNote(`${result.added.length} timer er lagret. Medarbeidere er lagt til på prosjektene, og oppstillingene er oppdatert.`);
      setView('list');
    } catch (cause) {
      setError(String(cause?.message || '') || 'Kunne ikke lagre timene.');
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  function cellValue(row, key) {
    if (key === 'date') return formatDate(row.date);
    if (key === 'hours' || key === 'billableHours') return formatHours(row[key]);
    if (key === 'projectName') {
      return row.projectNumber
        ? `${row.projectNumber} ${row.projectName || ''}`.trim()
        : (row.projectName || '—');
    }
    return row[key] || '—';
  }

  function renderListRow({ item: row }) {
    if (stackRows) {
      return (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.ink }]}>
            {formatDate(row.date)} · {row.employeeName || '—'}
          </Text>
          <Text style={{ color: colors.muted }}>
            {[row.customerName, row.projectNumber || row.projectName, formatHours(row.hours)]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {row.description ? <Text style={{ color: colors.ink }}>{row.description}</Text> : null}
          <View style={styles.cardLinks}>
            {row.customerId ? (
              <TouchableOpacity onPress={() => onOpenCustomer?.(row.customerId)}>
                <Text style={{ color: colors.brand }}>Kunde</Text>
              </TouchableOpacity>
            ) : null}
            {row.projectId ? (
              <TouchableOpacity onPress={() => onOpenProject?.(row.projectId)}>
                <Text style={{ color: colors.brand }}>Prosjekt</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      );
    }
    return (
      <View style={[styles.tr, { borderBottomColor: colors.line, backgroundColor: colors.card }]}>
        {COLUMNS.map((column) => (
          <Text
            key={column.key}
            style={[styles.td, columnStyle(column), { color: colors.ink }]}
            numberOfLines={column.key === 'description' || column.key === 'projectName' ? 2 : 1}
          >
            {cellValue(row, column.key)}
          </Text>
        ))}
      </View>
    );
  }

  if (view === 'import' && importPlan) {
    return (
      <ScrollView
        nativeID="economy-hours-import"
        style={[styles.screen, { backgroundColor: colors.bg }]}
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.heading, { color: colors.ink }]}>Kontroller timeimport</Text>
        <Text style={{ color: colors.muted }}>
          Duplikater hoppes over. Medarbeidere legges automatisk inn på prosjektene ved lagring,
          og timene oppdaterer prosjektets oppstilling.
        </Text>
        {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
        {!!progress && <Text style={{ color: colors.muted }}>{progress}</Text>}
        <ImportReview
          colors={colors}
          nativeID="hour-import-review"
          lead="Fjern rader du ikke vil ha med. Grupper med samme avvik kan tas ut samlet."
          rows={reviewRows}
          busy={busy}
          confirmLabel={(count) => `Importer ${count} timer`}
          onToggle={(id) => {
            const row = reviewRows.find((item) => item.id === id);
            if (!row) return;
            setDropped((current) => toggleHourReviewRow(current, row, importPlan));
          }}
          onConfirm={confirmImport}
          onCancel={() => { setImportPlan(null); setView('list'); setDropped(new Set()); }}
          renderRowExtra={(row) => {
            if (row.severity === 'ok' || row.severity === 'existing') return null;
            const planRow = importPlan.rows[row.rowIndex];
            if (!planRow?.entry) return null;
            const q = linkQuery[row.id] || '';
            return (
              <View style={{ gap: 6, marginTop: 4 }}>
                {!planRow.employeeId ? (
                  <>
                    <TextInput
                      value={q}
                      onChangeText={(value) => setLinkQuery((current) => ({ ...current, [row.id]: value }))}
                      placeholder="Søk medarbeider for å koble…"
                      placeholderTextColor={colors.placeholder}
                      style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
                    />
                    {suggestEmployees(employees, {
                      ...planRow,
                      query: q || planRow.employeeName || planRow.employeeNumber,
                    }, 6).map((employee) => (
                      <TouchableOpacity
                        key={employee.id}
                        onPress={() => {
                          setImportPlan((current) => linkImportPlanEmployee(current, row.rowIndex, employee, { applyGroup: true }));
                          setNote(`Koblet til ${displayName(employee)}.`);
                        }}
                        accessibilityRole="button"
                      >
                        <Text style={{ color: colors.brand }}>
                          {displayName(employee)}
                          {employee.company?.externalEmployeeNumber
                            ? ` · ${employee.company.externalEmployeeNumber}`
                            : ''}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </>
                ) : null}
                {!planRow.projectId ? (
                  <TouchableOpacity
                    onPress={() => {
                      const hit = projectList.find((project) => (
                        String(project.number) === String(planRow.projectNumber)
                        || (planRow.projectName && project.name === planRow.projectName)
                      ));
                      if (hit) {
                        setImportPlan((current) => linkImportPlanProject(current, row.rowIndex, hit));
                        setNote(`Koblet prosjekt ${hit.number}.`);
                      } else {
                        setError('Fant ikke prosjektet i registeret. Importer prosjektlisten først.');
                      }
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={{ color: colors.brand }}>Prøv å koble prosjekt fra registeret</Text>
                  </TouchableOpacity>
                ) : null}
                {!planRow.customerId ? (
                  <>
                    <TextInput
                      value={linkQuery[`${row.id}-c`] || ''}
                      onChangeText={(value) => setLinkQuery((current) => ({ ...current, [`${row.id}-c`]: value }))}
                      placeholder="Søk kunde for å koble…"
                      placeholderTextColor={colors.placeholder}
                      style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
                    />
                    {suggestCustomers(customers, {
                      ...planRow,
                      client: planRow.customerName,
                      query: linkQuery[`${row.id}-c`] || '',
                    }, 6).map((customer) => (
                      <TouchableOpacity
                        key={customer.id}
                        onPress={() => {
                          setImportPlan((current) => linkImportPlanCustomer(current, row.rowIndex, customer, { applyGroup: true }));
                          setNote(`Koblet til ${customer.name}.`);
                        }}
                        accessibilityRole="button"
                      >
                        <Text style={{ color: colors.brand }}>
                          {customer.name}
                          {customer.customerNumber ? ` · ${customer.customerNumber}` : ''}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </>
                ) : null}
              </View>
            );
          }}
        />
      </ScrollView>
    );
  }

  const table = (
    <View style={[styles.tableWrap, { borderColor: colors.line, backgroundColor: colors.card }]}>
      {!stackRows ? (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={{ minWidth: TABLE_MIN }}>
            <View style={[styles.tr, styles.head, { borderBottomColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}>
              {COLUMNS.map((column) => (
                <Text key={column.key} style={[styles.th, columnStyle(column), { color: colors.muted }]}>{column.label}</Text>
              ))}
            </View>
            <FlatList
              data={pageRows}
              keyExtractor={(row) => row.id}
              renderItem={renderListRow}
              style={{ maxHeight: 720 }}
              initialNumToRender={24}
              ListEmptyComponent={(
                <View style={{ padding: 16 }}>
                  <Text style={{ color: colors.muted }}>
                    Ingen timer ennå. Bruk «Importer Excel» for å hente timeføringer fra regnskapssystemet.
                  </Text>
                </View>
              )}
              ListFooterComponent={visible.length > pageRows.length ? (
                <TouchableOpacity
                  onPress={() => setPageSize((n) => n + 80)}
                  accessibilityRole="button"
                  style={{ padding: 14, alignItems: 'center' }}
                >
                  <Text style={{ color: colors.brand, fontWeight: '600' }}>
                    Vis flere ({pageRows.length} av {visible.length})
                  </Text>
                </TouchableOpacity>
              ) : null}
            />
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={pageRows}
          keyExtractor={(row) => row.id}
          renderItem={renderListRow}
          style={{ maxHeight: 640 }}
          ListEmptyComponent={(
            <View style={{ padding: 16 }}>
              <Text style={{ color: colors.muted }}>
                Ingen timer ennå. Bruk «Importer Excel» for å hente timeføringer.
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]} nativeID="economy-hours">
      <View style={styles.inner}>
        <View style={styles.toolbar}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.heading, { color: colors.ink }]}>Timer</Text>
            <Text style={{ color: colors.muted }}>
              {ready
                ? `${entries.length} registrerte føringer · ${formatHours(totals.hours)} vist`
                : 'Laster timer…'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={importFile}
            disabled={busy || !familyId}
            accessibilityRole="button"
            accessibilityLabel="Importer timer"
            style={[styles.primaryBtn, { backgroundColor: colors.brand, opacity: busy || !familyId ? 0.6 : 1 }]}
          >
            <Text style={styles.primaryBtnText}>{busy ? 'Jobber…' : 'Importer Excel'}</Text>
          </TouchableOpacity>
        </View>

        {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
        {!!note && <Text style={{ color: colors.ink }}>{note}</Text>}
        {!!progress && <Text style={{ color: colors.muted }}>{progress}</Text>}
        <ImportResult colors={colors} result={importReport} />

        <View style={styles.filters}>
          <TextInput
            value={query}
            onChangeText={(value) => {
              setQuery(value);
              if (importReport) setImportReport(null);
            }}
            placeholder="Søk på ansatt, kunde, prosjekt, beskrivelse…"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { flex: 1, color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusChips}>
            {PERIODS.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => setPeriod(item.id)}
                style={[styles.chip, { borderColor: colors.line, backgroundColor: period === item.id ? colors.brand : colors.card }]}
              >
                <Text style={{ color: period === item.id ? '#fff' : colors.ink }}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusChips}>
            <TouchableOpacity
              onPress={() => setEmployeeFilter('')}
              style={[styles.chip, { borderColor: colors.line, backgroundColor: !employeeFilter ? colors.brand : colors.card }]}
            >
              <Text style={{ color: !employeeFilter ? '#fff' : colors.ink }}>Alle ansatte</Text>
            </TouchableOpacity>
            {employeeOptions.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => setEmployeeFilter(item.id)}
                style={[styles.chip, { borderColor: colors.line, backgroundColor: employeeFilter === item.id ? colors.brand : colors.card }]}
              >
                <Text style={{ color: employeeFilter === item.id ? '#fff' : colors.ink }}>
                  {item.name} · {formatHours(item.hours)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.summaryRow}>
          <Text style={{ color: colors.muted }}>Timer {formatHours(totals.hours)}</Text>
          <Text style={{ color: colors.muted }}>Fakturerbart {formatHours(totals.billable)}</Text>
          <Text style={{ color: colors.muted }}>{totals.count} føringer</Text>
        </View>

        {table}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: 16, paddingBottom: 48, maxWidth: 1100, width: '100%', alignSelf: 'flex-start', gap: 14 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' },
  heading: { fontSize: 22, fontWeight: '700' },
  primaryBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  filters: { gap: 10 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, minHeight: 42 },
  statusChips: { gap: 8, paddingVertical: 2 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  tableWrap: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'flex-start', borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 10, gap: 8 },
  head: { paddingVertical: 8 },
  th: { fontSize: 12, fontWeight: '700' },
  td: { fontSize: 13 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6, marginBottom: 8 },
  cardTitle: { fontWeight: '700' },
  cardLinks: { flexDirection: 'row', gap: 12, marginTop: 4 },
});
