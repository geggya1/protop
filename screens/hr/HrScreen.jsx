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
import { emptyHrState, localIsoDate, normalizeHrState, patchHrState } from '../../src/hr/model';
import { hrLoadMeta, loadHrState, saveHrState } from '../../src/hr/storage';
import { defaultHrSubView } from '../../src/navigation/shellModules';
import { useLayout } from '../../src/theme';
import { showSaveToast } from '../../src/ui/saveToast';
import HrSectionNav from './HrSectionNav';
import HrDashboard from './HrDashboard';
import HrPeople from './HrPeople';
import HrRecruitment from './HrRecruitment';
import HrControl from './HrControl';

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
  const { isPhone } = useLayout();
  const nav = useNavigation();
  const { familyId, uid, activeProfile, requestShellTab } = useApp();
  const assigneeName = String(activeProfile?.name || activeProfile?.displayName || '').trim();
  const access = useCompanyAccess();
  const page = defaultHrSubView(subView);
  const hrResource = ({
    oversikt: 'hr',
    personell: 'hrPeople',
    avtaler: 'hrAgreements',
    lonn: 'hrPayroll',
    oppfolging: 'hrFollowup',
    compliance: 'hrCompliance',
    rekruttering: 'hrRecruitment',
  })[page] || 'hr';
  const canSee = access.can(hrResource, 'see');
  const canWrite = access.can(hrResource, 'write');

  const [employees, setEmployees] = useState([]);
  const [hr, setHr] = useState(emptyHrState());
  const [entries, setEntries] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [employeeSheet, setEmployeeSheet] = useState('oversikt');
  const [focusCaseId, setFocusCaseId] = useState('');
  const [ready, setReady] = useState(false);
  const hrRef = useRef(hr);
  const familyIdRef = useRef(familyId);
  const saveChainRef = useRef(Promise.resolve());
  familyIdRef.current = familyId;

  useEffect(() => {
    if (!familyId) return undefined;
    return watchEmployees(familyId, (rows) => setEmployees(rows || []));
  }, [familyId]);

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
  const go = useCallback((id) => {
    if (id === 'produktivitet') {
      requestShellTab?.('arbeid', 'produktivitet');
      return;
    }
    requestShellTab?.('hr', id);
  }, [requestShellTab]);

  const openEmployee = useCallback((id, sheet) => {
    setSelectedEmployeeId(id || '');
    setEmployeeSheet(sheet || 'oversikt');
    setFocusCaseId('');
    go('personell');
  }, [go]);

  const openCase = useCallback((row) => {
    if (!row?.id || !row.employeeId) {
      go('oppfolging');
      return;
    }
    setSelectedEmployeeId(row.employeeId);
    setEmployeeSheet('oppfolging');
    setFocusCaseId(row.id);
    go('personell');
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
          hr={hr}
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
        />
      );
    }
    if (page === 'avtaler' || page === 'lonn' || page === 'oppfolging' || page === 'compliance') {
      return (
        <HrControl
          colors={colors}
          page={page}
          employees={employees}
          hr={hr}
          entries={entries}
          onOpenEmployee={openEmployee}
        />
      );
    }
    if (page === 'rekruttering') {
      return (
        <HrRecruitment
          colors={colors}
          hr={hr}
          canWrite={canWrite}
          onPatch={onPatch}
          familyId={familyId}
        />
      );
    }
    return (
      <HrDashboard
        colors={colors}
        employees={employees}
        hr={hr}
        canWrite={canWrite}
        onPatch={onPatch}
        onOpenPeople={() => go('personell')}
        onOpenFollowUp={() => go('oppfolging')}
        onOpenCase={openCase}
        familyId={familyId}
        assigneeUid={uid || ''}
        assigneeName={assigneeName}
        onCreateFollowUpTask={createTask}
        onOpenRecruitment={() => go('rekruttering')}
        onOpenProductivity={() => go('produktivitet')}
        onOpenCompliance={() => go('compliance')}
        onOpenContracts={() => go('avtaler')}
      />
    );
  }, [
    page, colors, employees, hr, entries, selectedEmployeeId, employeeSheet,
    focusCaseId, canWrite, onPatch, go, familyId, uid, assigneeName,
    openEmployee, openCase, openLinkedTask, createTask, saveSalaries,
  ]);

  if (access.active && access.ready && !canSee) {
    return <CompanyAccessDenied />;
  }

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
      nativeID="hr-screen"
    >
      <HrSectionNav colors={colors} page={page} isPhone={isPhone} onChange={go} />
      {ready ? <View key={familyId || 'hr'}>{body}</View> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
});
