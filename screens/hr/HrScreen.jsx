import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { CompanyAccessDenied } from '../../components/project/CompanyAccessSettings';
import { watchEmployees } from '../../src/employees/storage';
import { loadTimeEntries } from '../../src/economy/timeEntryStorage';
import { createFollowUpTask } from '../../src/hr/followUpTask';
import { emptyHrState, filterHrEmployees, localIsoDate, normalizeHrState, patchHrState } from '../../src/hr/model';
import { hmsCardRequirement } from '../../src/hr/hmsCard';
import { hrLoadMeta, loadHrState, saveHrState } from '../../src/hr/storage';
import { companyRetention, hrRetentionPlan, retentionToast } from '../../src/hr/retention';
import { logSensitiveAccess } from '../../src/hr/accessLogClient';
import { defaultHrSubView } from '../../src/navigation/shellModules';
import { showSaveToast } from '../../src/ui/saveToast';
import HrDashboard from './HrDashboard';
import HrPeople from './HrPeople';
import HrRecruitment from './HrRecruitment';
import HrControl from './HrControl';
import HrHandbook from './HrHandbook';
import HrForms from './HrForms';
import { useFormContext } from '../anbud/useFormContext';
import { useKinTasks } from './useKinTasks';
import { useHmsTasks } from './useHmsTasks';
import { useDocControl } from '../doccontrol/useDocControl';
import { useDocReadTasks } from '../doccontrol/useDocReadTasks';
import { privacyDocState } from '../../src/hr/privacyDoc';
import { useIsoCompetence } from './useIsoCompetence';

function periodWindow(months = 3) {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - months);
  return {
    fromDate: localIsoDate(from),
    toDate: localIsoDate(to),
  };
}

export default function HrScreen({ subView = 'oversikt' }) {
  const colors = useColors();
  const nav = useNavigation();
  const {
    family, familyId, uid, activeProfile, requestShellTab, shellIntent, clearShellIntent,
  } = useApp();
  const assigneeName = String(activeProfile?.name || activeProfile?.displayName || '').trim();
  // Timer ført på eget selskap er ikke fakturerbare.
  const ownCompanyName = String(family?.company?.navn || family?.name || '').trim();
  const ownCompanyOrgnr = String(family?.company?.organisasjonsnummer || family?.orgnr || '').trim();
  const ownCompany = useMemo(
    () => ({ name: ownCompanyName, orgnr: ownCompanyOrgnr }),
    [ownCompanyName, ownCompanyOrgnr],
  );
  const access = useCompanyAccess();
  const forms = useFormContext();
  const page = defaultHrSubView(subView);
  const hrResource = ({
    oversikt: 'hr',
    personell: 'hrPeople',
    avtaler: 'hrAgreements',
    lonn: 'hrPayroll',
    oppfolging: 'hrFollowup',
    compliance: 'hrCompliance',
    rekruttering: 'hrRecruitment',
    handbok: 'hr',
    skjema: 'hrPeople',
  })[page] || 'hr';
  const canSee = access.canView(hrResource);
  const canWrite = access.canEdit(hrResource);

  const [employees, setEmployees] = useState([]);
  const [hr, setHr] = useState(emptyHrState());
  const [entries, setEntries] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [employeeSheet, setEmployeeSheet] = useState('oversikt');
  const [focusCaseId, setFocusCaseId] = useState('');
  const [peopleFilter, setPeopleFilter] = useState(null);
  const [recruitFocus, setRecruitFocus] = useState(null);
  const [ready, setReady] = useState(false);
  // Lagringstiden (L-07) kjøres først når ansattlisten er lest, så tidligere ansatte er kjent.
  const [employeesLoaded, setEmployeesLoaded] = useState(false);
  const retentionRanRef = useRef('');
  const hrRef = useRef(hr);
  // HMS-kort kreves etter næringskoden, med mindre bedriften har valgt selv (HR → Lovpålagt).
  const naeringskode = String(family?.company?.naeringskode || '').trim();
  const hmsRule = useMemo(
    () => hmsCardRequirement({ naeringskode, setting: hr.settings?.hmsCard }),
    [naeringskode, hr.settings?.hmsCard],
  );
  // Dokumentstyringen: personverninformasjonen i Lovpålagt og oppgaver om å lese og signere.
  const dc = useDocControl();
  const privacyDoc = useMemo(
    () => privacyDocState(dc.controls, dc.acks, filterHrEmployees(employees, 'active')),
    [dc.controls, dc.acks, employees],
  );
  // hmsRule og privacyDoc lagres ikke. normalizeHrState tar dem bort.
  const hrView = useMemo(
    () => ({ ...hr, hmsRequired: hmsRule.required, hmsRule, privacyDoc }),
    [hr, hmsRule, privacyDoc],
  );
  const familyIdRef = useRef(familyId);
  const saveChainRef = useRef(Promise.resolve());
  familyIdRef.current = familyId;

  useEffect(() => {
    if (!familyId) return undefined;
    setEmployeesLoaded(false);
    return watchEmployees(familyId, (rows) => {
      setEmployees(rows || []);
      setEmployeesLoaded(true);
    });
  }, [familyId]);

  // Pårørende fylles inn av den ansatte på profilen. Mangler det, får hen oppgave og varsel.
  const kin = useKinTasks({ familyId, employees, canWrite: ready && access.canEdit('hrPeople'), actor: forms.actor });
  // HMS-kort som går ut innen 30 dager: oppgave og varsel til HR om å fornye kortet.
  useHmsTasks({ familyId, employees, hr, canWrite: ready && access.canEdit('hrPeople'), actor: forms.actor });
  // Nyansatte og nye versjoner av dokumenter med lesekrav: oppgave og varsel til den ansatte.
  useDocReadTasks({ dc, employees, canWrite: ready && access.canEdit('hrPeople') });

  useEffect(() => {
    let live = true;
    if (!familyId) return undefined;
    // Bytt selskap: nullstill UI-state. Køede lagring for forrige selskap må fortsatt
    // skrive sitt snapshot (se persist) — vi nullstiller ikke saveChainRef midt i jobber.
    const empty = emptyHrState();
    hrRef.current = empty;
    setHr(empty);
    setEmployees([]);
    setEntries([]);
    setSelectedEmployeeId('');
    setEmployeeSheet('oversikt');
    setFocusCaseId('');
    setPeopleFilter(null);
    setRecruitFocus(null);
    setReady(false);
    const companyId = familyId;
    loadHrState(companyId).then((state) => {
      if (!live || familyIdRef.current !== companyId) return;
      hrRef.current = state;
      setHr(state);
      setReady(true);
      if (hrLoadMeta(companyId) === 'error') {
        showSaveToast?.('HR lastet fra lokal kopi — skyen ikke klar');
      }
    }).catch(() => {
      if (!live || familyIdRef.current !== companyId) return;
      const fallback = emptyHrState();
      hrRef.current = fallback;
      setHr(fallback);
      setReady(true);
    });
    return () => { live = false; };
  }, [familyId]);

  useEffect(() => {
    let live = true;
    if (!familyId) return undefined;
    const window = periodWindow(3);
    loadTimeEntries(familyId, window).then((rows) => {
      if (live) setEntries(Array.isArray(rows) ? rows : []);
    }).catch(() => {
      if (live) setEntries([]);
    });
    return () => { live = false; };
  }, [familyId]);

  const persist = useCallback((next) => {
    const normalized = normalizeHrState(next);
    const companyId = familyIdRef.current;
    hrRef.current = normalized;
    setHr(normalized);
    if (!companyId) return;
    const snapshot = normalized;
    const job = saveChainRef.current
      .catch(() => {})
      .then(async () => {
        const stillHere = familyIdRef.current === companyId;
        // Etter selskapsbytte: lagre det fangede snapshotet til riktig selskap,
        // aldri hrRef (som nå tilhører det nye selskapet).
        const latest = stillHere ? hrRef.current : null;
        const toSave = (stillHere && latest?.updatedAt && snapshot.updatedAt
          && String(latest.updatedAt) > String(snapshot.updatedAt))
          ? latest
          : snapshot;
        try {
          await saveHrState(toSave, companyId);
          if (familyIdRef.current === companyId) showSaveToast?.('Lagret');
        } catch (err) {
          if (familyIdRef.current !== companyId) return;
          const code = String(err?.code || '');
          if (code === 'hr/auth') showSaveToast?.('Ikke innlogget — lagret lokalt');
          else if (code === 'hr/permission') showSaveToast?.('Mangler tilgang til å lagre HR');
          else if (code === 'hr/skip-empty' || code === 'hr/skip-uncertain') {
            showSaveToast?.('Lagret lokalt — skyen ikke klar');
          } else showSaveToast?.('Kunne ikke lagre i skyen');
        }
      });
    saveChainRef.current = job;
  }, []);

  const onPatch = useCallback((partialOrFn) => {
    if (!canWrite) return;
    const base = hrRef.current || emptyHrState();
    const partial = typeof partialOrFn === 'function' ? partialOrFn(base) : partialOrFn;
    const next = patchHrState(base, partial);
    persist(next);
  }, [persist, canWrite]);
  // Lagringstid (L-07): når noen med Admin på HR åpner HR, slettes søknader og HR-opplysninger
  // om tidligere ansatte som har passert fristen (company.privacy.retention). CI deployer ikke
  // planlagte jobber, så jobben går her. Én gang per selskap og økt, og bare etter sikker lasting.
  const retention = useMemo(() => companyRetention(family?.company), [family?.company]);
  useEffect(() => {
    if (!ready || !employeesLoaded || !familyId || !access.ready || !access.canAdmin('hr')) return;
    if (retentionRanRef.current === familyId || hrLoadMeta(familyId) !== 'ok') return;
    retentionRanRef.current = familyId;
    const plan = hrRetentionPlan(hrRef.current, {
      employees,
      policy: retention,
      now: new Date(),
      actor: { uid, name: assigneeName },
    });
    if (!plan.changed) return;
    persist(patchHrState(hrRef.current, plan.state));
    const message = retentionToast(plan);
    saveChainRef.current.then(() => { if (message) showSaveToast?.(message); }).catch(() => {});
  }, [ready, employeesLoaded, familyId, access, employees, retention, uid, assigneeName, persist]);

  // Innsynslogg (L-19): en annens HR-mappe eller lønn. Eget innsyn logges ikke (serveren sjekker).
  useEffect(() => {
    if (!ready || !familyId || !canSee) return;
    if (page === 'personell' && selectedEmployeeId) {
      logSensitiveAccess({ familyId, kind: employeeSheet === 'lonn' ? 'salary' : 'hrFolder', employeeId: selectedEmployeeId });
    } else if (page === 'lonn') {
      logSensitiveAccess({ familyId, kind: 'salary' });
    }
  }, [ready, familyId, canSee, page, selectedEmployeeId, employeeSheet]);

  // Ny ansatt eller ny fane starter øverst, ikke midt i den forrige listen.
  const scrollRef = useRef(null);
  useEffect(() => {
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
  }, [page, selectedEmployeeId, employeeSheet]);

  const go = useCallback((id, intent = null) => {
    if (id === 'produktivitet') {
      requestShellTab?.('arbeid', 'produktivitet');
      return;
    }
    requestShellTab?.('hr', id, intent);
  }, [requestShellTab]);

  // Skallet monterer HR på nytt når undersiden skifter, så valgt ansatt
  // følger med som intent til Personell.
  useEffect(() => {
    if (page !== 'personell' || shellIntent?.type !== 'hrEmployee' || !shellIntent.employeeId) return;
    setSelectedEmployeeId(shellIntent.employeeId);
    setEmployeeSheet(shellIntent.sheet || 'oversikt');
    setFocusCaseId(shellIntent.caseId || '');
    clearShellIntent?.();
  }, [page, shellIntent, clearShellIntent]);

  // Fra oversikten: Personell med samme utvalg som tallet, og Rekruttering på valgt eller ny stilling.
  useEffect(() => {
    if (page === 'personell' && shellIntent?.type === 'hrPeopleFilter') {
      setPeopleFilter({ kind: shellIntent.kind || '', status: shellIntent.status || '' });
      clearShellIntent?.();
    } else if (page === 'rekruttering' && shellIntent?.type === 'hrRecruitment') {
      setRecruitFocus({ jobId: shellIntent.jobId || '', newJob: !!shellIntent.newJob });
      clearShellIntent?.();
    }
  }, [page, shellIntent, clearShellIntent]);

  const openEmployee = useCallback((id, sheet) => {
    setSelectedEmployeeId(id || '');
    setEmployeeSheet(sheet || 'oversikt');
    setFocusCaseId('');
    go('personell', id ? { type: 'hrEmployee', employeeId: id, sheet: sheet || 'oversikt' } : null);
  }, [go]);

  const openCase = useCallback((row) => {
    if (!row?.id || !row.employeeId) {
      go('oppfolging');
      return;
    }
    setSelectedEmployeeId(row.employeeId);
    setEmployeeSheet('oppfolging');
    setFocusCaseId(row.id);
    go('personell', { type: 'hrEmployee', employeeId: row.employeeId, sheet: 'oppfolging', caseId: row.id });
  }, [go]);

  const openLinkedTask = useCallback((taskId) => {
    if (!taskId) return;
    nav.navigate('ParentTask', { task: { id: taskId }, familyId });
  }, [nav, familyId]);

  const createTask = useCallback((draft) => createFollowUpTask({
    familyId,
    uid,
    name: assigneeName,
    draft,
  }), [familyId, uid, assigneeName]);

  // Kompetanse og opplæring eies av ISO. Personens «Lovpålagt»-fane viser status derfra.
  const canSeeIso = typeof access.canView === 'function' && access.canView('iso');
  const isoEmployee = useMemo(
    () => employees.find((row) => row.id === selectedEmployeeId) || null,
    [employees, selectedEmployeeId],
  );
  const isoCompetence = useIsoCompetence({
    companyId: familyId,
    uid,
    employee: isoEmployee,
    enabled: canSeeIso && page === 'personell' && employeeSheet === 'compliance' && !!selectedEmployeeId,
    family,
    employees: access.employees,
  });
  const openIsoCompetence = useCallback(() => requestShellTab?.('iso', 'kompetanse'), [requestShellTab]);

  const saveSalaries = useCallback((salariesOrFn) => onPatch((state) => ({
    salaries: typeof salariesOrFn === 'function'
      ? salariesOrFn(state.salaries || [])
      : salariesOrFn,
  })), [onPatch]);

  const body = useMemo(() => {
    if (page === 'personell') {
      return (
        <HrPeople
          colors={colors}
          employees={employees}
          hr={hrView}
          entries={entries}
          selectedId={selectedEmployeeId}
          onSelect={(id) => {
            setSelectedEmployeeId(id || '');
            setFocusCaseId('');
          }}
          canWrite={canWrite}
          onPatch={onPatch}
          sheet={employeeSheet}
          onSheet={setEmployeeSheet}
          familyId={familyId}
          onSaveSalaries={saveSalaries}
          focusCaseId={focusCaseId}
          assigneeUid={uid || ''}
          assigneeName={assigneeName}
          onOpenTask={openLinkedTask}
          onCreateFollowUpTask={createTask}
          isoCompetence={isoCompetence}
          onOpenIso={canSeeIso ? openIsoCompetence : null}
          onOpenLibraryTemplate={(key) => requestShellTab?.('skjema', null, { type: 'openLibraryTemplate', key })}
          listPreset={peopleFilter}
          onBackToSalary={() => {
            setSelectedEmployeeId('');
            go('lonn');
          }}
        />
      );
    }
    if (page === 'avtaler' || page === 'lonn' || page === 'oppfolging' || page === 'compliance') {
      return (
        <HrControl
          colors={colors}
          page={page}
          employees={employees}
          hr={hrView}
          entries={entries}
          onOpenEmployee={openEmployee}
          company={ownCompany}
          familyId={familyId}
          canSeeAccessLog={access.ready && access.canAdmin('hr')}
          canWrite={canWrite}
          onPatch={onPatch}
        />
      );
    }
    if (page === 'handbok') {
      return (
        <HrHandbook
          colors={colors}
          hr={hrView}
          canWrite={canWrite}
          onPatch={onPatch}
          employees={employees}
          familyId={familyId}
          actor={forms.actor}
          company={forms.company}
          logo={forms.logo?.dataUrl || ''}
        />
      );
    }
    if (page === 'skjema') {
      return (
        <HrForms
          colors={colors}
          employees={employees}
          canWrite={canWrite}
          familyId={familyId}
          actor={forms.actor}
          company={forms.company}
          logo={forms.logo}
        />
      );
    }
    if (page === 'rekruttering') {
      return (
        <HrRecruitment
          colors={colors}
          hr={hrView}
          canWrite={canWrite}
          onPatch={onPatch}
          familyId={familyId}
          focus={recruitFocus}
          retention={retention}
        />
      );
    }
    return (
      <HrDashboard
        colors={colors}
        employees={employees}
        hr={hrView}
        canWrite={canWrite}
        onPatch={onPatch}
        onOpenPeople={(filter) => go('personell', filter ? { type: 'hrPeopleFilter', ...filter } : null)}
        onOpenEmployee={openEmployee}
        onOpenFollowUp={() => go('oppfolging')}
        onOpenCase={openCase}
        familyId={familyId}
        ownCompany={ownCompany}
        assigneeUid={uid || ''}
        assigneeName={assigneeName}
        onCreateFollowUpTask={createTask}
        onOpenRecruitment={() => go('rekruttering')}
        onOpenJob={(jobId) => go('rekruttering', { type: 'hrRecruitment', jobId })}
        onNewJob={() => go('rekruttering', { type: 'hrRecruitment', newJob: true })}
        onOpenProductivity={() => go('produktivitet')}
        onOpenCompliance={() => go('compliance')}
        onOpenContracts={() => go('avtaler')}
        kin={kin}
      />
    );
  }, [
    page, colors, employees, hrView, entries, selectedEmployeeId, employeeSheet,
    focusCaseId, canWrite, onPatch, go, familyId, uid, assigneeName,
    openEmployee, openCase, openLinkedTask, createTask, saveSalaries, forms.actor, forms.company, forms.logo, kin,
    isoCompetence, canSeeIso, openIsoCompetence, peopleFilter, recruitFocus, ownCompany, retention, access,
  ]);

  if (access.active && access.ready && !canSee) {
    return <CompanyAccessDenied />;
  }

  // Undersidene ligger i modulmenyen i skallet (ModuleTabs), som i de andre modulene.
  // Skjemaer har egen rulling og full høyde ved utfylling.
  if (page === 'skjema') {
    return (
      <View style={[styles.scroll, styles.content, { backgroundColor: colors.bg }]} nativeID="hr-screen">
        {ready ? <View key={familyId || 'hr'} style={{ flex: 1, minHeight: 0 }}>{body}</View> : null}
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.scroll, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
      nativeID="hr-screen"
    >
      {ready ? <View key={familyId || 'hr'}>{body}</View> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
});
