import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { absencePickerTypes, absenceTypeById } from '../../src/arbeid/absenceCatalog.js';
import { buildAbsenceOverview, hoursToDays } from '../../src/arbeid/balance.js';
import { employeeDisplayName, filterEmployeesForPicker } from '../../src/arbeid/roles.js';
import { toDateKey } from '../../src/arbeid/calendar.js';
import { parseHours } from '../../src/arbeid/hours.js';
import {
  ABSENCE_IMPORT_ACCEPT,
  buildAbsenceImportReview,
  linkAbsenceImportPlanEmployee,
  readAbsenceImport,
  toggleAbsenceReviewRow,
} from '../../src/arbeid/absenceImport.js';
import { saveAbsenceImport } from '../../src/arbeid/absenceStorage.js';
import { useLayout } from '../../src/theme';
import { pickDocument } from '../../src/utils/media';
import { showSaveToast } from '../../src/ui/saveToast';
import { importResult } from '../../src/imports/review';
import {
  addAbsence,
  deleteAbsences,
  importAbsences,
  setAbsenceStatuses,
} from '../../src/project/engine';
import {
  ensureProjectAbsences,
  persistProjectState,
  putProjectState,
} from '../../src/project/storage';
import BrandBusyOverlay from '../../components/BrandBusyOverlay';
import AbsenceImportReview from '../../components/arbeid/AbsenceImportReview';
import AbsencePeriodModal from '../../components/arbeid/AbsencePeriodModal';
import { ImportResult } from '../../components/ImportReview';
import { useTimesheetWorkspace } from './useTimesheetWorkspace';
import { AbsenceReportDesktop, PlannedAbsenceDesktop } from './CompanyAbsenceDesktop';

export { AbsenceOverviewScreen } from './AbsenceOverviewView';

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

function usePeople(lockedEmployeeId) {
  const year = new Date().getFullYear();
  const workspace = useTimesheetWorkspace({
    lockedEmployeeId,
    fromDate: `${year - 1}-01-01`,
    toDate: `${year + 1}-12-31`,
    absences: { all: true },
  });
  const [employeeId, setEmployeeId] = useState(lockedEmployeeId || '');
  const activeId = workspace.lockedId || employeeId || workspace.linked?.id || '';
  const employee = workspace.employees.find((row) => row.id === activeId) || workspace.linked;
  return { workspace, activeId, employee, setEmployeeId };
}

function PersonChips({ workspace, activeId, onPick }) {
  const colors = useColors();
  if (!workspace.manager || workspace.lockedId) return null;
  const choices = filterEmployeesForPicker(workspace.employees, '');
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
      {choices.map((row) => (
        <TouchableOpacity
          key={row.id}
          onPress={() => onPick(row.id)}
          style={[styles.chip, { borderColor: row.id === activeId ? colors.brand : colors.line }]}
        >
          <Text style={{ color: colors.ink }}>{employeeDisplayName(row)}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

export function AbsenceReportScreen({ lockedEmployeeId = '' } = {}) {
  const colors = useColors();
  const { isDesktop } = useLayout();
  const { workspace, activeId, employee, setEmployeeId } = usePeople(lockedEmployeeId);
  const fullDay = Number(workspace.state.fullDayHours) > 0 ? Number(workspace.state.fullDayHours) : 7.5;
  const today = toDateKey(new Date());
  const people = filterEmployeesForPicker(workspace.employees, '').filter((row) => row?.company?.status !== 'deleted');
  const names = {};
  for (const row of people) names[row.id] = employeeDisplayName(row);

  const [view, setView] = useState('list');
  const [importPlan, setImportPlan] = useState(null);
  const [dropped, setDropped] = useState(new Set());
  const [linkQuery, setLinkQuery] = useState({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [importReport, setImportReport] = useState(null);
  const [openPeriod, setOpenPeriod] = useState(null);
  const saveChain = useRef(Promise.resolve());

  const importReview = useMemo(
    () => (importPlan ? buildAbsenceImportReview(importPlan, { dropped }) : null),
    [importPlan, dropped],
  );
  const importReadyCount = importReview?.readyCount || 0;

  const rows = useMemo(() => absencePickerTypes().map((type) => {
    const overview = buildAbsenceOverview({
      employeeId: activeId,
      typeId: type.id,
      absences: workspace.state.absences,
      adjustments: workspace.state.absenceAdjustments,
      fullDayHours: fullDay,
      today,
    });
    return { type, summary: overview.summary };
  }).filter((row) => row.summary.used || row.summary.earned || row.summary.planned), [
    activeId, workspace.state.absences, workspace.state.absenceAdjustments, fullDay, today,
  ]);

  function persist(next) {
    workspace.setState(next);
    putProjectState(next, workspace.workspaceId);
    const job = saveChain.current.then(() => persistProjectState(next, workspace.workspaceId));
    saveChain.current = job.catch(() => {});
    return job;
  }

  async function importFile() {
    setError('');
    const file = await pickDocument({ accept: ABSENCE_IMPORT_ACCEPT });
    if (!file) return;
    if (!people.length) {
      setError('Fant ingen medarbeidere i Ansatte ennå. Vent til listen er lastet, eller åpne Ansatte og prøv igjen.');
      return;
    }
    setBusy(true);
    setProgress({ label: 'Leser fil…' });
    try {
      const bytes = await bytesFromFile(file);
      const plan = await readAbsenceImport(bytes, file.name, {
        existingAbsences: workspace.state.absences || [],
        employees: people,
      });
      if (!plan.rows.length) {
        setError('Fant ingen fravær i filen.');
        return;
      }
      setImportPlan(plan);
      setDropped(new Set());
      setImportReport(null);
      setLinkQuery({});
      setNote('Føringer som allerede finnes hoppes over. Kontroller medarbeiderkobling før lagring.');
      setView('import');
    } catch (cause) {
      const message = String(cause?.message || '');
      setError(/failed to fetch/i.test(message) || (cause?.name === 'TypeError' && !message)
        ? 'Kunne ikke lese Excel-filen. Eksporter listen som CSV og importer den i stedet.'
        : (message || 'Kunne ikke lese fraværslisten.'));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function confirmImport() {
    if (!importPlan || busy) return;
    const chosen = [];
    const leftOut = [];
    importPlan.rows.forEach((row, index) => {
      const id = String(index);
      const missingLink = !row.entry?.employeeId;
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
                ? 'Mangler kobling til medarbeider.'
                : 'Valgt bort før lagring.',
        });
        return;
      }
      chosen.push(row);
    });
    if (!chosen.length) {
      setError('Ingen fravær er valgt for import.');
      return;
    }
    setBusy(true);
    setError('');
    setProgress({ label: 'Lagrer fravær…', done: 0, total: chosen.length });
    try {
      const result = importAbsences(workspace.state, chosen.map((row) => ({
        ...row.entry,
        createdByUid: workspace.uid,
      })));
      if (!result.ok) throw new Error(result.error || 'Kunne ikke importere fravær.');
      putProjectState(result.state, workspace.workspaceId);
      workspace.setState(result.state);
      await saveAbsenceImport(workspace.workspaceId, result.added, {
        onProgress: (done, total) => setProgress({ label: 'Lagrer fravær…', done, total }),
      });
      try {
        await persistProjectState(result.state, workspace.workspaceId);
      } catch (projectError) {
        console.warn('Prosjektstate etter fraværsimport', projectError);
      }
      // Sørg for at alle ansatte får data synlig i oversikt/rapport.
      const refreshed = await ensureProjectAbsences(workspace.workspaceId, { all: true });
      workspace.setState(refreshed);
      const withIssues = chosen.filter((row) => (row.issues || []).length).length;
      const report = importResult(
        [{ name: `${result.added.length} fraværsdager`, issues: withIssues ? [`${withIssues} med avvik`] : [] }],
        leftOut,
      );
      report.saved = result.added.length;
      report.total = chosen.length + leftOut.length;
      report.complete = !leftOut.length && !withIssues && !result.skipped.length;
      setImportReport(report);
      setImportPlan(null);
      setDropped(new Set());
      setNote(`${result.added.length} fraværsdager er lagret. De vises for hver ansatt i fraværsoversikten.`);
      showSaveToast(`${result.added.length} fraværsdager er lagret.`);
      setView('list');
    } catch (cause) {
      const message = String(cause?.message || cause?.code || '');
      setError(
        /permission|insufficient/i.test(message)
          ? 'Mangler tilgang til å lagre fravær i skyen.'
          : /exceeds|too big|size|invalid-argument/i.test(message)
            ? 'Kunne ikke lagre: dataene er for store eller ugyldige. Prøv færre rader, eller last siden på nytt og importer igjen.'
            : (message || 'Kunne ikke lagre fraværet i skyen. Sjekk nettverket og prøv igjen.'),
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function dayRowsForPeriod(period) {
    const ids = new Set(period?.ids || []);
    return (workspace.state.absences || [])
      .filter((row) => ids.has(row.id))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  async function applyAbsenceMutation(result, toast) {
    if (!result?.ok) {
      setError(result?.error || 'Kunne ikke lagre.');
      return false;
    }
    setError('');
    await persist(result.state);
    if (toast) showSaveToast(toast);
    return true;
  }

  const busyOverlay = (
    <BrandBusyOverlay
      visible={busy || !workspace.ready}
      label={busy ? (progress?.label || 'Jobber…') : 'Vent…'}
      detail={busy ? 'Vent til operasjonen er ferdig før du går videre.' : 'Henter fravær.'}
      done={busy ? progress?.done : undefined}
      total={busy ? progress?.total : undefined}
    />
  );

  if (view === 'import' && importPlan && importReview) {
    return (
      <>
        <ScrollView
          nativeID="fravaer-import-view"
          style={{ flex: 1, backgroundColor: colors.bg }}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
          <AbsenceImportReview
            colors={colors}
            review={importReview}
            employees={people}
            busy={busy}
            readyCount={importReadyCount}
            linkQuery={linkQuery}
            setLinkQuery={setLinkQuery}
            onToggleCard={(card) => {
              setDropped((current) => toggleAbsenceReviewRow(current, card, importPlan));
            }}
            onToggleOkRow={(id) => {
              setDropped((current) => toggleAbsenceReviewRow(current, { id }, importPlan));
            }}
            onLinkEmployee={(rowIndex, person) => {
              setImportPlan((current) => linkAbsenceImportPlanEmployee(current, rowIndex, person, { applyGroup: true }));
              setNote(`Koblet til ${employeeDisplayName(person)}.`);
              showSaveToast(`Koblet til ${employeeDisplayName(person)}.`);
            }}
            onConfirm={confirmImport}
            onCancel={() => {
              setView('list');
              setImportPlan(null);
              setDropped(new Set());
            }}
          />
        </ScrollView>
        {busyOverlay}
      </>
    );
  }

  const periodModal = (
    <AbsencePeriodModal
      visible={!!openPeriod}
      period={openPeriod}
      dayRows={openPeriod ? dayRowsForPeriod(openPeriod) : []}
      fullDayHours={fullDay}
      canManage={!!workspace.manager}
      colors={colors}
      onClose={() => setOpenPeriod(null)}
      onApprove={async () => {
        const ids = openPeriod?.ids || [];
        const ok = await applyAbsenceMutation(
          setAbsenceStatuses(workspace.state, ids, 'godkjent'),
          'Perioden er godkjent.',
        );
        if (ok) setOpenPeriod(null);
      }}
      onReopen={async () => {
        const ids = openPeriod?.ids || [];
        const ok = await applyAbsenceMutation(
          setAbsenceStatuses(workspace.state, ids, 'registrert'),
          'Perioden er satt tilbake til behandling.',
        );
        if (ok) setOpenPeriod(null);
      }}
      onSaveDay={async (id, draft) => {
        const current = (workspace.state.absences || []).find((row) => row.id === id);
        if (!current) return;
        const ok = await applyAbsenceMutation(addAbsence(workspace.state, {
          ...current,
          hours: parseHours(draft.hours),
          description: draft.description,
          type: draft.type || current.type,
        }), 'Fraværsdag lagret.');
        if (ok) {
          setOpenPeriod((period) => (period ? { ...period } : null));
        }
      }}
      onDeletePeriod={async () => {
        const ids = openPeriod?.ids || [];
        const ok = await applyAbsenceMutation(
          deleteAbsences(workspace.state, ids),
          'Perioden er slettet.',
        );
        if (ok) setOpenPeriod(null);
      }}
    />
  );

  if (isDesktop) {
    return (
      <>
        {importReport ? (
          <View style={{ padding: 16, gap: 8 }}>
            <ImportResult result={importReport} colors={colors} />
            <TouchableOpacity onPress={() => setImportReport(null)} accessibilityRole="button">
              <Text style={{ color: colors.brand, fontWeight: '600' }}>Lukk</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <AbsenceReportDesktop
          employees={people}
          names={names}
          absences={workspace.state.absences || []}
          adjustments={workspace.state.absenceAdjustments || []}
          fullDayHours={fullDay}
          today={today}
          canChooseEmployee={!!workspace.manager && !workspace.lockedId}
          lockedEmployeeId={activeId}
          canImport={!!workspace.manager}
          onImport={importFile}
          onOpenPeriod={setOpenPeriod}
          note={note}
          error={error || workspace.error}
        />
        {periodModal}
        {busyOverlay}
      </>
    );
  }

  return (
    <>
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.body} nativeID="fravaersrapport">
        <Text style={[styles.crumb, { color: colors.muted }]}>Mine sider / Tid / Fraværsrapport</Text>
        <View style={styles.mobileHead}>
          <Text style={[styles.title, { color: colors.ink }]}>Fraværsrapport</Text>
          {workspace.manager ? (
            <TouchableOpacity
              onPress={importFile}
              style={[styles.mobileImport, { backgroundColor: colors.brand }]}
              accessibilityRole="button"
              nativeID="fravaer-import-mobile"
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>Importer</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={{ color: colors.muted, marginBottom: 8 }}>{employeeDisplayName(employee)}</Text>
        {error ? <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text> : null}
        {note ? <Text style={{ color: colors.muted }}>{note}</Text> : null}
        <PersonChips workspace={workspace} activeId={activeId} onPick={setEmployeeId} />
        {rows.map((row) => (
          <View key={row.type.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={{ color: colors.ink, fontWeight: '700' }}>{row.type.label}</Text>
            <Text style={{ color: colors.muted, marginTop: 4 }}>
              Brukt {row.summary.used} · til gode {row.summary.remaining} · planlagt {row.summary.planned}
            </Text>
          </View>
        ))}
        {!rows.length ? <Text style={{ color: colors.muted }}>Ingen fravær er registrert for denne personen.</Text> : null}
      </ScrollView>
      {periodModal}
      {busyOverlay}
    </>
  );
}

export function PlannedAbsenceScreen({ lockedEmployeeId = '' } = {}) {
  const colors = useColors();
  const { isDesktop } = useLayout();
  const { workspace, activeId, employee, setEmployeeId } = usePeople(lockedEmployeeId);
  const today = toDateKey(new Date());
  const fullDay = Number(workspace.state.fullDayHours) > 0 ? Number(workspace.state.fullDayHours) : 7.5;
  const people = filterEmployeesForPicker(workspace.employees, '').filter((row) => row?.company?.status !== 'deleted');
  const names = {};
  for (const row of people) names[row.id] = employeeDisplayName(row);
  const canChooseEmployee = !!workspace.manager && !workspace.lockedId;
  if (isDesktop) {
    return (
      <PlannedAbsenceDesktop
        employees={canChooseEmployee ? people : people.filter((row) => row.id === activeId)}
        names={names}
        absences={workspace.state.absences || []}
        adjustments={workspace.state.absenceAdjustments || []}
        fullDayHours={fullDay}
        today={today}
        canChooseEmployee={canChooseEmployee}
        lockedEmployeeId={activeId}
      />
    );
  }
  const rows = (workspace.state.absences || [])
    .filter((row) => row.employeeId === activeId && row.date >= today)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.body} nativeID="planlagt-fravaer">
      <Text style={[styles.crumb, { color: colors.muted }]}>Mine sider / Tid / Planlagt fravær</Text>
      <Text style={[styles.title, { color: colors.ink }]}>Planlagt fravær</Text>
      <Text style={{ color: colors.muted, marginBottom: 8 }}>{employeeDisplayName(employee)}</Text>
      <PersonChips workspace={workspace} activeId={activeId} onPick={setEmployeeId} />
      {rows.map((row) => (
        <View key={row.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{row.date} · {absenceTypeById(row.type).label}</Text>
          <Text style={{ color: colors.muted }}>{hoursToDays(row.hours, fullDay)} dager · {row.description || 'Ingen merknad'}</Text>
        </View>
      ))}
      {!rows.length ? <Text style={{ color: colors.muted }}>Ingen planlagt fravær frem i tid.</Text> : null}
    </ScrollView>
  );
}

export function MyOverviewScreen({ lockedEmployeeId = '', embedded = false } = {}) {
  const colors = useColors();
  const { workspace, activeId, employee } = usePeople(lockedEmployeeId);
  const today = toDateKey(new Date());
  const month = today.slice(0, 7);
  const hours = (workspace.state.timeEntries || [])
    .filter((row) => row.employeeId === activeId && String(row.date || '').startsWith(month))
    .reduce((sum, row) => sum + Number(row.hours || 0), 0);
  const lock = (workspace.state.timesheetLocks || []).find((row) => row.employeeId === activeId);
  const vacation = buildAbsenceOverview({
    employeeId: activeId,
    typeId: 'ferie',
    absences: workspace.state.absences,
    adjustments: workspace.state.absenceAdjustments,
    fullDayHours: Number(workspace.state.fullDayHours) || 7.5,
    today,
  });
  const year = today.slice(0, 4);
  const yearAbsences = (workspace.state.absences || [])
    .filter((row) => row.employeeId === activeId && String(row.date || '').startsWith(year))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={styles.body}
      nativeID="employee-overview"
    >
      {embedded ? null : (
        <Text style={[styles.crumb, { color: colors.muted }]}>Ansatte / Oversikt</Text>
      )}
      <Text style={[styles.title, { color: colors.ink }]}>
        {embedded ? 'Oversikt' : (employeeDisplayName(employee) || 'Oversikt')}
      </Text>
      <View style={styles.cards}>
        <Card colors={colors} label="Timer denne måneden" value={hours.toFixed(2)} />
        <Card colors={colors} label="Feriedager til gode" value={String(vacation.summary.remaining)} />
        <Card colors={colors} label="Timeliste" value={lock?.throughDate ? `Låst til ${lock.throughDate}` : 'Åpen'} />
        <Card colors={colors} label={`Fraværsdager ${year}`} value={String(yearAbsences.length)} />
      </View>
      {yearAbsences.slice(0, 12).map((row) => (
        <View key={row.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>
            {row.date} · {absenceTypeById(row.type).label}
          </Text>
          <Text style={{ color: colors.muted }}>
            {hoursToDays(row.hours, Number(workspace.state.fullDayHours) || 7.5)} d · {row.description || 'Ingen merknad'}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

function Card({ colors, label, value }) {
  return (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card, minWidth: 180 }]}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700', marginTop: 4 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 8, paddingBottom: 48 },
  crumb: { fontSize: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  mobileHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  mobileImport: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
});
