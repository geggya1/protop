import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { canImportList } from '../../src/access/companyAccess';
import { resolveAbsenceTypes } from '../../src/arbeid/absenceCatalog.js';
import {
  absenceRoster,
  absencesForRoster,
  eachWeekday,
  linkAbsencesToEmployees,
} from '../../src/arbeid/absenceDashboard.js';
import {
  ABSENCE_REPORT_COLUMNS,
  absenceReportTotals,
  formatHours,
  hydrateAbsenceReportRow,
} from '../../src/arbeid/absenceReport.js';
import { buildAbsenceOverview, hoursToDays } from '../../src/arbeid/balance.js';
import { employeeDisplayName, filterEmployeesForPicker } from '../../src/arbeid/roles.js';
import { employeeActivityTab } from '../../src/employees/model.js';
import { monthDateRange, toDateKey } from '../../src/arbeid/calendar.js';
import { parseHours } from '../../src/arbeid/hours.js';
import {
  ABSENCE_IMPORT_ACCEPT,
  buildAbsenceImportReview,
  linkAbsenceImportPlanEmployee,
  readAbsenceImport,
  toggleAbsenceReviewRow,
} from '../../src/arbeid/absenceImport.js';
import { clearAbsences, removeAbsences, saveAbsenceImport } from '../../src/arbeid/absenceStorage.js';
import { useModuleHeroHosted } from '../../components/ModulePageBg';
import { pickDocument } from '../../src/utils/media';
import { showSaveToast } from '../../src/ui/saveToast';
import { useConfirm } from '../../src/ui/useConfirm.js';
import { importResult } from '../../src/imports/review';
import {
  addAbsence,
  clearAbsencesState,
  deleteAbsences,
  importAbsences,
  setAbsenceStatuses,
} from '../../src/project/engine';
import {
  noteAbsencesImported,
  persistProjectState,
  putProjectState,
} from '../../src/project/storage';
import BrandBusyOverlay from '../../components/BrandBusyOverlay';
import AbsenceImportReview from '../../components/arbeid/AbsenceImportReview';
import AbsencePeriodModal from '../../components/arbeid/AbsencePeriodModal';
import { ImportResult } from '../../components/ImportReview';
import { useTimesheetWorkspace } from './useTimesheetWorkspace';
import { AbsenceReportDesktop, PlannedAbsenceDesktop } from './CompanyAbsenceDesktop';
import VacationPlanPanel from '../../components/arbeid/VacationPlanPanel';
import RegisterVacationModal from '../../components/arbeid/RegisterVacationModal';
import { loadVacationPlan } from '../../src/arbeid/vacationPlanStorage.js';
import { sweepVacationPlan } from '../../src/arbeid/vacationPlanClient.js';
import {
  normalizeVacationPlan,
  planningWindow,
} from '../../src/arbeid/vacationPlan.js';
import { companyDisplayName } from '../../src/utils/companyName';

// Fraværsrapport bruker samme dagstabell + filter på mobil og desktop.

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

/** hours: datovindu for timeføringer. Fraværssidene bruker ikke timer og henter ingen. */
function usePeople(lockedEmployeeId, hours = null) {
  const workspace = useTimesheetWorkspace({
    lockedEmployeeId,
    fromDate: hours?.fromDate || '',
    toDate: hours?.toDate || '',
    absences: { all: true },
    liveAbsences: true,
  });
  const [employeeId, setEmployeeId] = useState(lockedEmployeeId || '');
  const activeId = workspace.lockedId || employeeId || workspace.linked?.id || '';
  const employee = workspace.employees.find((row) => row.id === activeId) || workspace.linked;
  return { workspace, activeId, employee, setEmployeeId };
}

export function AbsenceReportScreen({ lockedEmployeeId = '' } = {}) {
  const colors = useColors();
  const confirm = useConfirm();
  const { workspace, activeId } = usePeople(lockedEmployeeId);
  // Import av fraværslister: leder for andres timer med Admin på Fraværsrapport.
  const adminImport = canImportList(useCompanyAccess(), 'absenceReport');
  const canImport = !!workspace.manager && adminImport;
  const fullDay = Number(workspace.state.fullDayHours) > 0 ? Number(workspace.state.fullDayHours) : 7.5;
  const people = useMemo(
    () => filterEmployeesForPicker(workspace.employees, '', { includeClosed: true }),
    [workspace.employees],
  );
  const roster = useMemo(() => absenceRoster(people), [people]);
  const names = useMemo(() => {
    const map = {};
    for (const row of roster) map[row.id] = employeeDisplayName(row);
    return map;
  }, [roster]);
  const reportAbsences = useMemo(
    () => absencesForRoster(workspace.state.absences || [], people, roster),
    [workspace.state.absences, people, roster],
  );
  const canChooseEmployee = !!workspace.manager && !workspace.lockedId;
  const scopedEmployeeId = canChooseEmployee ? '' : (workspace.lockedId || activeId || '');

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
      setNote('Føringer som allerede finnes hoppes over. Bruk «Tøm import» først hvis du vil importere på nytt.');
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

  // Sletting spør alltid i ProTops egen dialog (useConfirm). Før spurte bare nettleseren, og appen slettet uten å spørre.
  async function confirmClearImported() {
    const imported = (workspace.state.absences || []).filter((row) => (
      row.importFingerprint || row.source?.filename
    ));
    const count = imported.length || (workspace.state.absences || []).length;
    if (!count) {
      setNote('Ingen fravær å tømme.');
      return;
    }
    const ok = await confirm({
      title: imported.length ? `Fjerne ${imported.length} importerte fraværsdager?` : `Fjerne alle ${count} fraværsdager?`,
      message: imported.length
        ? 'Manuelt registrert fravær beholdes. Deretter kan du importere på nytt.'
        : 'Deretter kan du importere på nytt.',
      confirmText: 'Fjern',
      tone: 'danger',
    });
    if (!ok) return;
    clearImportedAbsences({ importedOnly: imported.length > 0 });
  }

  async function clearImportedAbsences({ importedOnly = true } = {}) {
    if (busy) return;
    setBusy(true);
    setError('');
    setProgress({ label: 'Tømmer fravær…', done: 0, total: (workspace.state.absences || []).length || 1 });
    try {
      const cleared = await clearAbsences(workspace.workspaceId, {
        rows: workspace.state.absences || [],
        importedOnly,
        onProgress: (done, total) => setProgress({ label: 'Tømmer fravær…', done, total }),
      });
      const next = clearAbsencesState(workspace.state, { importedOnly });
      if (!next.ok) throw new Error(next.error || 'Kunne ikke tømme fravær.');
      noteAbsencesImported(workspace.workspaceId, next.state.absences || []);
      putProjectState(next.state, workspace.workspaceId);
      workspace.setState(next.state);
      try {
        await persistProjectState(next.state, workspace.workspaceId);
      } catch (projectError) {
        console.warn('Prosjektstate etter tømming av fravær', projectError);
      }
      setNote(`${cleared.removed} fraværsdager er fjernet. Du kan importere på nytt.`);
      showSaveToast(`${cleared.removed} fraværsdager er fjernet.`);
      setImportReport(null);
    } catch (cause) {
      setError(String(cause?.message || 'Kunne ikke tømme fravær.'));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function deleteSelectedAbsences(ids) {
    if (!workspace.manager || busy) return;
    const unique = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
    if (!unique.length) return;
    const ok = await confirm({
      title: unique.length === 1
        ? 'Slette den valgte fraværslinjen?'
        : `Slette ${unique.length} valgte fraværslinjer?`,
      message: 'Fraværet slettes for godt.',
      confirmText: 'Slett',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setError('');
    setProgress({ label: 'Sletter fravær…', done: 0, total: unique.length });
    try {
      const removed = await removeAbsences(workspace.workspaceId, unique, {
        onProgress: (done, total) => setProgress({ label: 'Sletter fravær…', done, total }),
      });
      const next = deleteAbsences(workspace.state, unique);
      if (!next.ok) throw new Error(next.error || 'Kunne ikke slette fravær.');
      noteAbsencesImported(workspace.workspaceId, next.state.absences || []);
      putProjectState(next.state, workspace.workspaceId);
      workspace.setState(next.state);
      try {
        await persistProjectState(next.state, workspace.workspaceId);
      } catch (projectError) {
        console.warn('Prosjektstate etter sletting av fravær', projectError);
      }
      setNote(`${removed.removed} fraværslinjer er slettet.`);
      showSaveToast(`${removed.removed} fraværslinjer er slettet.`);
    } catch (cause) {
      setError(String(cause?.message || 'Kunne ikke slette fravær.'));
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
        // Trim Excel-kilde — hele values-objektet gjør 5k docs trege.
        source: row.entry?.source
          ? { filename: row.entry.source.filename, importedAt: row.entry.source.importedAt }
          : null,
      })));
      if (!result.ok) throw new Error(result.error || 'Kunne ikke importere fravær.');
      putProjectState(result.state, workspace.workspaceId);
      workspace.setState(result.state);
      await saveAbsenceImport(workspace.workspaceId, result.added, {
        onProgress: (done, total) => setProgress({ label: 'Lagrer fravær…', done, total }),
      });
      setProgress({ label: 'Fullfører…', done: result.added.length, total: result.added.length });
      // Marker som synket så persist ikke skriver alle 5k radene på nytt.
      noteAbsencesImported(workspace.workspaceId, result.state.absences || []);
      try {
        await persistProjectState(result.state, workspace.workspaceId);
      } catch (projectError) {
        // Fraværet ligger allerede i absences-subcollection — ikke mist dem.
        console.warn('Prosjektstate etter fraværsimport', projectError);
      }
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
      types={resolveAbsenceTypes(workspace.state)}
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
        employees={roster}
        names={names}
        absences={reportAbsences}
        canChooseEmployee={canChooseEmployee}
        lockedEmployeeId={scopedEmployeeId}
        canImport={canImport}
        onImport={importFile}
        onClearImported={confirmClearImported}
        onDeleteSelected={deleteSelectedAbsences}
        absenceCount={(workspace.state.absences || []).length}
        onOpenPeriod={setOpenPeriod}
        note={note}
        error={error || workspace.error}
        loading={!workspace.ready}
      />
      {periodModal}
      {busyOverlay}
    </>
  );
}

export function PlannedAbsenceScreen({ lockedEmployeeId = '' } = {}) {
  const colors = useColors();
  const hostedHero = useModuleHeroHosted();
  const { shellIntent, clearShellIntent, familyId, family } = useApp();
  const { workspace, activeId, setEmployeeId } = usePeople(lockedEmployeeId);
  const [focusEmployeeId, setFocusEmployeeId] = useState('');
  const [plan, setPlan] = useState(null);
  const [notice, setNotice] = useState('');
  const [planError, setPlanError] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);
  useEffect(() => {
    if (!shellIntent || shellIntent.type !== 'plannedAbsenceFocus') return;
    const id = String(shellIntent.employeeId || '');
    if (id) {
      setEmployeeId(id);
      setFocusEmployeeId(id);
    }
    clearShellIntent?.();
  }, [shellIntent, clearShellIntent, setEmployeeId]);
  useEffect(() => {
    let stop = false;
    if (!familyId) {
      setPlan(normalizeVacationPlan({}));
      return undefined;
    }
    loadVacationPlan(familyId).then((loaded) => {
      if (stop) return;
      setPlan(loaded);
      if (!loaded?.announcedAt) return;
      sweepVacationPlan(familyId).then((result) => {
        if (!stop && result?.plan) setPlan(normalizeVacationPlan(result.plan));
      }).catch(() => {});
    });
    return () => { stop = true; };
  }, [familyId]);
  const today = toDateKey(new Date());
  const fullDay = Number(workspace.state.fullDayHours) > 0 ? Number(workspace.state.fullDayHours) : 7.5;
  const people = (workspace.employees || []).filter((row) => employeeActivityTab(row) !== 'trash');
  const names = {};
  for (const row of people) names[row.id] = employeeDisplayName(row);
  const canChooseEmployee = !!workspace.manager && !workspace.lockedId;
  const companyName = companyDisplayName(family);
  const window = planningWindow(plan || {}, today);
  const registrationLocked = !!plan?.announcedAt && window.locked && !workspace.manager;

  function register({ personId, from, to, note, extraordinary }) {
    const days = eachWeekday(from, to);
    if (!personId) {
      setPlanError('Velg ansatt.');
      return false;
    }
    if (!days.length) {
      setPlanError('Velg minst én virkedag.');
      return false;
    }
    let state = workspace.state;
    const name = names[personId] || '';
    const flagged = extraordinary || registrationLocked;
    for (const date of days) {
      const result = addAbsence(state, {
        employeeId: personId,
        employeeName: name,
        date,
        hours: fullDay,
        type: 'ferie',
        description: note,
        extraordinary: flagged,
        createdByUid: workspace.uid,
      });
      if (!result.ok) {
        setPlanError(result.error);
        return false;
      }
      state = result.state;
    }
    workspace.setState(state);
    setPlanError('');
    setNotice(flagged ? 'Ferien er sendt til særskilt godkjenning.' : 'Ferien er registrert og venter på godkjenning.');
    return true;
  }

  function approve(ids) {
    const result = setAbsenceStatuses(workspace.state, ids, 'godkjent');
    if (!result.ok) {
      setPlanError(result.error);
      return;
    }
    workspace.setState(result.state);
    setNotice('Ferien er godkjent.');
  }

  const panel = (
    <VacationPlanPanel
      plan={plan || undefined}
      employees={people}
      names={names}
      absences={workspace.state.absences || []}
      dayHours={fullDay}
      today={today}
      canManage={canChooseEmployee}
      variant="board"
      focusEmployeeId={canChooseEmployee ? '' : activeId}
      companyName={companyName}
      notice={notice}
      error={planError}
      onApprove={approve}
      onRegister={() => setRegisterOpen(true)}
    />
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {hostedHero ? null : (
        <View style={styles.body}>
          <Text style={[styles.crumb, { color: colors.muted }]}>Mine sider / Tid / Planlagt fravær</Text>
          <Text style={[styles.title, { color: colors.ink }]}>Planlagt fravær</Text>
        </View>
      )}
    <PlannedAbsenceDesktop
      employees={canChooseEmployee ? people : people.filter((row) => row.id === activeId)}
      names={names}
      absences={workspace.state.absences || []}
      adjustments={workspace.state.absenceAdjustments || []}
      fullDayHours={fullDay}
      today={today}
      canChooseEmployee={canChooseEmployee}
      lockedEmployeeId={activeId}
      focusEmployeeId={focusEmployeeId}
      loading={!workspace.ready}
      header={plan ? panel : null}
    />
    <RegisterVacationModal
      visible={registerOpen}
      employees={people.map((row) => ({ id: row.id, name: names[row.id] || employeeDisplayName(row) }))}
      employeeId={canChooseEmployee ? (focusEmployeeId || activeId) : activeId}
      requireEmployee={canChooseEmployee && !(focusEmployeeId || activeId)}
      locked={registrationLocked}
      onClose={() => setRegisterOpen(false)}
      onSave={(payload) => {
        const ok = register(payload);
        if (ok) setRegisterOpen(false);
      }}
    />
    </View>
  );
}

/** Ansattens fraværsrapport: kolonnene fra Fraværsrapport, uten medarbeider. */
const PERSON_REPORT_KEYS = new Set(['date', 'typeLabel', 'statusLabel', 'description', 'hours', 'paidHours']);
const PERSON_REPORT_COLUMNS = ABSENCE_REPORT_COLUMNS.filter((column) => PERSON_REPORT_KEYS.has(column.key));
const PERSON_REPORT_MIN = PERSON_REPORT_COLUMNS.reduce((sum, column) => sum + (column.minWidth || column.width || 80), 0);
const NUMERIC_COLUMNS = new Set(['hours', 'paidHours']);

function reportCellStyle(column) {
  if (column.flex) return { flexGrow: 1, flexShrink: 1, flexBasis: column.minWidth || 160, minWidth: column.minWidth || 120 };
  return { width: column.width, flexGrow: 0, flexShrink: 0 };
}

function reportCell(row, key) {
  if (key === 'date') return row.dateLabel || row.date || '–';
  if (key === 'hours') return row.hoursLabel;
  if (key === 'paidHours') return row.paidHoursLabel;
  const value = row[key];
  return value == null || value === '' ? '–' : String(value);
}

function formatDays(value) {
  return String(Math.round((Number(value) || 0) * 100) / 100).replace('.', ',');
}

/** Rapport-fanen under Fravær på ansattsiden. Ett år om gangen. */
export function MyOverviewScreen({ lockedEmployeeId = '', embedded = false } = {}) {
  const colors = useColors();
  const today = toDateKey(new Date());
  const month = today.slice(0, 7);
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(thisYear);
  // Bare «Timer denne måneden» bruker timer.
  const { workspace, activeId, employee } = usePeople(
    lockedEmployeeId,
    monthDateRange(thisYear, Number(today.slice(5, 7)) - 1),
  );
  const fullDay = Number(workspace.state.fullDayHours) > 0 ? Number(workspace.state.fullDayHours) : 7.5;
  const hours = (workspace.state.timeEntries || [])
    .filter((row) => row.employeeId === activeId && String(row.date || '').startsWith(month))
    .reduce((sum, row) => sum + Number(row.hours || 0), 0);
  // Samme kobling som Fraværsrapport: importerte rader uten id følger navnet.
  const mine = useMemo(
    () => linkAbsencesToEmployees(workspace.state.absences || [], workspace.employees || [])
      .filter((row) => row && row.employeeId === activeId),
    [workspace.state.absences, workspace.employees, activeId],
  );
  const span = useMemo(() => {
    const found = mine
      .map((row) => Number(String(row.date || '').slice(0, 4)))
      .filter((value) => value > 1900);
    return { first: Math.min(thisYear, ...found), last: Math.max(thisYear, ...found) };
  }, [mine, thisYear]);
  const yearKey = String(year);
  const yearAbsences = useMemo(
    () => mine
      .filter((row) => String(row.date || '').startsWith(yearKey))
      .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [mine, yearKey],
  );
  // Saldo for valgt år, regnet som på Oversikt.
  const vacation = buildAbsenceOverview({
    employeeId: activeId,
    typeId: 'ferie',
    absences: yearAbsences,
    adjustments: workspace.state.absenceAdjustments,
    fullDayHours: fullDay,
    today,
    year: yearKey,
  });
  const name = employeeDisplayName(employee);
  const rows = useMemo(
    () => yearAbsences
      .map((row) => hydrateAbsenceReportRow(row, { names: { [activeId]: name } }))
      .filter(Boolean),
    [yearAbsences, activeId, name],
  );
  const totals = absenceReportTotals(rows);
  const days = hoursToDays(totals.hours, fullDay);

  const yearBar = (
    <View style={styles.yearBar}>
      <View style={[styles.stepper, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <TouchableOpacity
          onPress={() => setYear((value) => value - 1)}
          disabled={year <= span.first}
          accessibilityRole="button"
          accessibilityLabel="Forrige år"
          nativeID="fravaer-rapport-aar-forrige"
          style={[styles.stepHit, { opacity: year <= span.first ? 0.35 : 1 }]}
        >
          <Ionicons name="chevron-back" size={18} color={colors.ink} />
        </TouchableOpacity>
        <Text style={[styles.stepLabel, { color: colors.ink }]} nativeID="fravaer-rapport-aar">{yearKey}</Text>
        <TouchableOpacity
          onPress={() => setYear((value) => value + 1)}
          disabled={year >= span.last}
          accessibilityRole="button"
          accessibilityLabel="Neste år"
          nativeID="fravaer-rapport-aar-neste"
          style={[styles.stepHit, { opacity: year >= span.last ? 0.35 : 1 }]}
        >
          <Ionicons name="chevron-forward" size={18} color={colors.ink} />
        </TouchableOpacity>
      </View>
      <Text style={{ color: colors.muted, fontSize: 13 }}>
        {workspace.ready
          ? `${totals.count} ${totals.count === 1 ? 'dag' : 'dager'} · ${formatHours(totals.hours)} timer`
          : 'Laster fravær…'}
      </Text>
    </View>
  );

  const tableSheet = (
    <View style={{ minWidth: PERSON_REPORT_MIN, width: '100%' }}>
      <View style={[styles.tr, styles.head, { borderBottomColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}>
        {PERSON_REPORT_COLUMNS.map((column) => (
          <Text
            key={column.key}
            style={[styles.th, reportCellStyle(column), { color: colors.muted }, NUMERIC_COLUMNS.has(column.key) && styles.num]}
          >
            {column.label}
          </Text>
        ))}
      </View>
      {rows.length ? rows.map((row) => (
        <View key={row.id || `${row.date}-${row.type}`} style={[styles.tr, { borderBottomColor: colors.line }]}>
          {PERSON_REPORT_COLUMNS.map((column) => (
            <Text
              key={column.key}
              style={[
                styles.td,
                reportCellStyle(column),
                { color: NUMERIC_COLUMNS.has(column.key) || column.key === 'date' ? colors.ink : colors.muted },
                NUMERIC_COLUMNS.has(column.key) && styles.num,
              ]}
              numberOfLines={2}
            >
              {reportCell(row, column.key)}
            </Text>
          ))}
        </View>
      )) : (
        <Text style={{ color: colors.muted, padding: 16 }}>
          {workspace.ready ? `Ingen fravær registrert i ${yearKey}.` : 'Laster fravær…'}
        </Text>
      )}
      {rows.length ? (
        <View style={[styles.tr, styles.sumRow, { backgroundColor: colors.sunken || colors.bg }]} nativeID="fravaer-rapport-sum">
          {PERSON_REPORT_COLUMNS.map((column) => (
            <Text
              key={column.key}
              style={[styles.td, reportCellStyle(column), { color: colors.ink }, NUMERIC_COLUMNS.has(column.key) && styles.num]}
            >
              {column.key === 'date' ? `Sum ${yearKey}`
                : column.key === 'hours' ? formatHours(totals.hours)
                  : column.key === 'paidHours' ? formatHours(totals.paidHours)
                    : ''}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );

  const overviewBody = (
    <>
      {embedded ? null : (
        <>
          <Text style={[styles.crumb, { color: colors.muted }]}>Ansatte / Oversikt</Text>
          <Text style={[styles.title, { color: colors.ink }]}>
            {name || 'Oversikt'}
          </Text>
        </>
      )}
      {yearBar}
      <View style={styles.cards}>
        <Card colors={colors} label="Timer denne måneden" value={hours.toFixed(2)} />
        <Card colors={colors} label={`Feriedager til gode ${yearKey}`} value={formatDays(vacation.summary.remaining)} />
        <Card colors={colors} label={`Fraværsdager ${yearKey}`} value={formatDays(days)} />
      </View>
      <View
        style={[styles.tableWrap, { borderColor: colors.line, backgroundColor: colors.card }]}
        nativeID="fravaer-rapport-tabell"
      >
        {Platform.OS === 'web' ? (
          <View style={styles.hScroll}>{tableSheet}</View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator>{tableSheet}</ScrollView>
        )}
      </View>
    </>
  );
  if (embedded) {
    return (
      <View nativeID="employee-overview" style={styles.body}>
        {overviewBody}
      </View>
    );
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={styles.body}
      nativeID="employee-overview"
    >
      {overviewBody}
    </ScrollView>
  );
}

function Card({ colors, label, value }) {
  return (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card, minWidth: 180 }]}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '400', marginTop: 4 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 8, paddingBottom: 48 },
  crumb: { fontSize: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  mobileHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  mobileImport: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  yearBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 2 },
  stepHit: { minWidth: 34, minHeight: 34, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { fontSize: 14, fontWeight: '400', minWidth: 56, textAlign: 'center' },
  // Samme tabell som Fraværsrapport.
  tableWrap: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  hScroll: { width: '100%', overflowX: 'auto', overflowY: 'visible' },
  tr: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, minHeight: 40 },
  head: { minHeight: 42 },
  sumRow: { borderBottomWidth: 0 },
  th: { fontSize: 11, fontWeight: '400', paddingVertical: 10, paddingHorizontal: 4 },
  td: { fontSize: 13, fontWeight: '400', paddingVertical: 8, paddingHorizontal: 4 },
  num: { textAlign: 'right' },
});
