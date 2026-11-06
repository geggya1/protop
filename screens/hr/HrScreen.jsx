import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useApp, useShellNav } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { CompanyAccessDenied } from '../../components/project/CompanyAccessSettings';
import { watchEmployees } from '../../src/employees/storage';
import { loadTimeEntries } from '../../src/economy/timeEntryStorage';
import { createFollowUpTask } from '../../src/hr/followUpTask';
import { hrKindBucket } from '../../src/hr/directory';
import { emptyHrState, filterHrEmployees, localIsoDate, normalizeHrState, patchHrState } from '../../src/hr/model';
import { hmsCardRequirement, mergeHmsCards } from '../../src/hr/hmsCard';
import { loadSelfHmsCards } from '../../src/hr/hmsSelf';
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
import HrAnnual from './HrAnnual';
import HrSickLeave from './HrSickLeave';
import HrSickCases from './HrSickCases';
import HrSurvey from './HrSurvey';
import { hrDeadlinesHandled, useHrDeadlines } from './useHrDeadlines';
import { useHrFormStart } from './useHrFormStart';
import { useIsoAnnual } from './useIsoAnnual';
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
    family, familyId, uid, activeProfile, requestShellTab, clearShellIntent,
  } = useApp();
  const { shellIntent } = useShellNav();
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
  // Personalskjema (KS-maler): samme start og visning under Skjemaer og under Oppfølging.
  const formStart = useHrFormStart(familyId);
  const formKit = useMemo(
    () => ({ start: formStart.start, actor: forms.actor, company: forms.company, logo: forms.logo }),
    [formStart.start, forms.actor, forms.company, forms.logo],
  );
  const page = defaultHrSubView(subView);
  const hrResource = ({
    oversikt: 'hr',
    personell: 'hrPeople',
    avtaler: 'hrAgreements',
    lonn: 'hrPayroll',
    oppfolging: 'hrFollowup',
    compliance: 'hrCompliance',
    sykefravaer: 'hrFollowup',
    undersokelse: 'hrFollowup',
    rekruttering: 'hrRecruitment',
    handbok: 'hr',
    skjema: 'hrPeople',
  })[page] || 'hr';
  // Personell samler Personell, Avtaler, Lønn og Lovpålagt. Hver del vises med sin egen rettighet.
  const parts = useMemo(() => ({
    people: access.canView('hrPeople'),
    agreements: access.canView('hrAgreements'),
    payroll: access.canView('hrPayroll'),
    compliance: access.canView('hrCompliance'),
  }), [access]);
  const canSee = page === 'personell'
    ? (parts.people || parts.agreements || parts.payroll || parts.compliance)
    : access.canView(hrResource);
  const canWrite = access.canEdit(hrResource);
  const canWriteCompliance = access.canEdit('hrCompliance');

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
  // HMS-kort de ansatte har registrert selv på Min side › Gjøremål (employeesPrivate).
  const [selfHmsCards, setSelfHmsCards] = useState([]);
  useEffect(() => {
    let live = true;
    setSelfHmsCards([]);
    if (familyId) loadSelfHmsCards(familyId).then((rows) => { if (live) setSelfHmsCards(rows); });
    return () => { live = false; };
  }, [familyId]);
  // hmsRule, privacyDoc og de sammenslåtte kortene lagres ikke. normalizeHrState tar dem bort,
  // og lagring går mot HR-tilstanden (hrRef), ikke hrView.
  const hrView = useMemo(
    () => ({ ...hr, hmsCards: mergeHmsCards(hr.hmsCards, selfHmsCards), hmsRequired: hmsRule.required, hmsRule, privacyDoc }),
    [hr, selfHmsCards, hmsRule, privacyDoc],
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
  useHmsTasks({ familyId, employees, hr: hrView, canWrite: ready && access.canEdit('hrPeople'), actor: forms.actor });
  // Nyansatte og nye versjoner av dokumenter med lesekrav: oppgave og varsel til den ansatte.
  useDocReadTasks({ dc, employees, canWrite: ready && access.canEdit('hrPeople') });
  // Frister ved sykefravær og oppgaver fra HR-årshjulet. Fravær er helseopplysninger: bare med Oppfølging.
  // Fraværet hentes på Sykefravær-siden, og ellers én gang per økt for å lage oppgavene.
  // Nøkkelen til oppgave-id-ene lagres i HR første gang (se ensureSaltRef under persist).
  const ensureSaltRef = useRef(null);
  const ensureSalt = useCallback((salt) => ensureSaltRef.current?.(salt) || Promise.resolve(''), []);
  const deadlines = useHrDeadlines({
    familyId,
    employees,
    hr,
    enabled: ready && access.ready && access.canView('hrFollowup')
      && (page === 'sykefravaer' || !hrDeadlinesHandled(familyId)),
    canWriteSick: ready && access.ready && access.canEdit('hrFollowup'),
    canWriteAnnual: ready && access.ready && access.canEdit('hr'),
    // Bare fra skyen og med ansattlisten lastet (ikke fra lokal kopi).
    stateOk: ready && employeesLoaded && hrLoadMeta(familyId) === 'ok',
    actor: forms.actor,
    ensureSalt,
  });

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

  ensureSaltRef.current = async (salt) => {
    const base = hrRef.current || emptyHrState();
    if (base.settings?.sickSalt) return base.settings.sickSalt;
    persist(patchHrState(base, { settings: { ...base.settings, sickSalt: salt } }));
    await saveChainRef.current.catch(() => {});
    return hrRef.current?.settings?.sickSalt || '';
  };

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
    } else if (page === 'personell' && parts.payroll) {
      // Listen viser lønnen til alle i Lønn-kolonnen.
      logSensitiveAccess({ familyId, kind: 'salary' });
    }
  }, [ready, familyId, canSee, page, selectedEmployeeId, employeeSheet, parts.payroll]);

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
  // følger med som intent til Personell (egne ansatte) eller Innleid personell.
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

  // Innleide og eksterne åpnes under Innleid personell, ikke i egne ansattes personellmappe.
  const isHired = useCallback(
    (id) => hrKindBucket(employees.find((row) => row.id === id)) === 'external',
    [employees],
  );

  const openEmployee = useCallback((id, sheet) => {
    // Innleide og eksterne følges opp i modulen Innleie, ikke i egne ansattes personellmappe.
    if (id && isHired(id)) {
      requestShellTab?.('innleie', 'personell', { type: 'hrEmployee', employeeId: id, sheet: sheet === 'oppfolging' ? 'oppfolging' : 'krav' });
      return;
    }
    setSelectedEmployeeId(id || '');
    setEmployeeSheet(sheet || 'oversikt');
    setFocusCaseId('');
    go('personell', id ? { type: 'hrEmployee', employeeId: id, sheet: sheet || 'oversikt' } : null);
  }, [go, isHired, requestShellTab]);

  const openCase = useCallback((row) => {
    if (!row?.id || !row.employeeId) {
      go('oppfolging');
      return;
    }
    const intent = { type: 'hrEmployee', employeeId: row.employeeId, sheet: 'oppfolging', caseId: row.id };
    if (isHired(row.employeeId)) {
      requestShellTab?.('innleie', 'personell', intent);
      return;
    }
    setSelectedEmployeeId(row.employeeId);
    setEmployeeSheet('oppfolging');
    setFocusCaseId(row.id);
    go('personell', intent);
  }, [go, isHired, requestShellTab]);

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
  // Samlet årshjul: ISO-årshjulet i HR-årshjulet, lastet bare når det er slått på.
  const [showIsoWheel, setShowIsoWheel] = useState(false);
  const isoAnnual = useIsoAnnual({
    companyId: familyId,
    uid,
    enabled: canSeeIso && page === 'arshjul' && showIsoWheel,
    family,
    employees: access.employees,
  });
  const isoWheel = useMemo(() => ({
    available: canSeeIso,
    show: showIsoWheel,
    onToggle: () => setShowIsoWheel((v) => !v),
    status: isoAnnual.status,
    state: isoAnnual.state,
  }), [canSeeIso, showIsoWheel, isoAnnual.status, isoAnnual.state]);
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
          formKit={formKit}
          listPreset={peopleFilter}
          parts={parts}
          company={ownCompany}
          canWriteCompliance={canWriteCompliance}
          canSeeAccessLog={access.ready && access.canAdmin('hr')}
        />
      );
    }
    if (page === 'oppfolging') {
      return (
        <HrControl
          colors={colors}
          page={page}
          employees={employees}
          hr={hrView}
          entries={entries}
          onOpenEmployee={openEmployee}
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
    if (page === 'arshjul') {
      return (
        <HrAnnual
          colors={colors}
          hr={hrView}
          canWrite={canWrite}
          onPatch={onPatch}
          familyId={familyId}
          actorName={assigneeName}
          staff={deadlines.staff}
          onRefreshTasks={deadlines.refresh}
          onOpen={(target) => {
            if (target === 'fravaer') requestShellTab?.('arbeid', 'fravaer-innstillinger');
            else go(target);
          }}
          onOpenIso={canSeeIso ? (target) => requestShellTab?.('iso', target) : null}
          iso={isoWheel}
        />
      );
    }
    if (page === 'sykefravaer') {
      return (
        <View style={styles.sickStack}>
          <HrSickLeave
            colors={colors}
            rows={deadlines.sickRows}
            loading={deadlines.loading}
            loadFailed={deadlines.loadFailed}
            canWrite={canWrite}
            onPatch={(fn) => {
              onPatch(fn);
              // Oppgaven for fristen lukkes med en gang, ikke først neste gang HR åpnes.
              setTimeout(() => deadlines.refresh(), 800);
            }}
            actorName={assigneeName}
          />
          {/* Egenmelding, sykt barn og sykmelding: behandling, korttidsfravær, kvoter og regler. */}
          <HrSickCases colors={colors} canWrite={canWrite} />
        </View>
      );
    }
    if (page === 'undersokelse') {
      return (
        <HrSurvey
          colors={colors}
          familyId={familyId}
          canWrite={canWrite}
          invited={deadlines.staff.filter((e) => String(e?.personUid || '').trim()).length}
          uid={uid || ''}
          onCreateTask={createTask}
          onOpenHandbook={() => go('handbok')}
          plans={hrView.surveyPlans}
          onPatch={canWrite ? onPatch : undefined}
        />
      );
    }
    if (page === 'skjema') {
      return (
        <HrForms
          colors={colors}
          employees={employees}
          canWrite={canWrite}
          reviews={hrView.reviews}
          onPatch={onPatch}
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
          employees={employees}
          uid={uid || ''}
          assigneeName={assigneeName}
          companyName={ownCompany.name}
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
        onOpenHired={() => requestShellTab?.('innleie', 'oversikt')}
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
        onOpenCompliance={() => go('personell')}
        onOpenContracts={() => go('personell')}
        kin={kin}
      />
    );
  }, [
    page, colors, employees, hrView, entries, selectedEmployeeId, employeeSheet,
    focusCaseId, canWrite, onPatch, go, familyId, uid, assigneeName,
    openEmployee, openCase, openLinkedTask, createTask, saveSalaries, forms.actor, forms.company, forms.logo, kin,
    isoCompetence, canSeeIso, openIsoCompetence, peopleFilter, recruitFocus, ownCompany, retention, access,
    deadlines, requestShellTab, formKit, isoWheel, parts, canWriteCompliance,
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
  sickStack: { gap: 12 },
});
