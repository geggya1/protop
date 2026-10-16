import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { CompanyAccessDenied } from '../../components/project/CompanyAccessSettings';
import { watchEmployees } from '../../src/employees/storage';
import { loadTimeEntries } from '../../src/economy/timeEntryStorage';
import { emptyHrState, localIsoDate, normalizeHrState, patchHrState } from '../../src/hr/model';
import { hrLoadMeta, loadHrState, saveHrState } from '../../src/hr/storage';
import { defaultHrSubView, HR_MENU } from '../../src/navigation/shellModules';
import { showSaveToast } from '../../src/ui/saveToast';
import { HrChip } from './HrShared';
import HrDashboard from './HrDashboard';
import HrPeople from './HrPeople';
import HrProductivity from './HrProductivity';
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
  const { familyId, requestShellTab } = useApp();
  const access = useCompanyAccess();
  const page = defaultHrSubView(subView);
  const canSee = access.can('hr', 'see');
  const canWrite = access.can('hr', 'write');

  const [employees, setEmployees] = useState([]);
  const [hr, setHr] = useState(emptyHrState());
  const [entries, setEntries] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [employeeSheet, setEmployeeSheet] = useState('oversikt');
  const [months, setMonths] = useState(3);
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
    const window = periodWindow(months);
    loadTimeEntries(familyId, window).then((rows) => {
      if (live) setEntries(Array.isArray(rows) ? rows : []);
    }).catch(() => {
      if (live) setEntries([]);
    });
    return () => { live = false; };
  }, [familyId, months]);

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
    requestShellTab?.('hr', id);
  }, [requestShellTab]);

  const openEmployee = useCallback((id, sheet) => {
    setSelectedEmployeeId(id || '');
    setEmployeeSheet(sheet || 'oversikt');
    go('personell');
  }, [go]);

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
          onSelect={setSelectedEmployeeId}
          canWrite={canWrite}
          onPatch={onPatch}
          sheet={employeeSheet}
          onSheet={setEmployeeSheet}
          familyId={familyId}
          onSaveSalaries={saveSalaries}
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
    if (page === 'produktivitet') {
      return (
        <HrProductivity
          colors={colors}
          employees={employees}
          entries={entries}
          months={months}
          onMonthsChange={setMonths}
          onSelectEmployee={(id) => openEmployee(id, 'oversikt')}
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
        entries={entries}
        canWrite={canWrite}
        onPatch={onPatch}
        onOpenPeople={() => go('personell')}
        onOpenFollowUp={() => go('oppfolging')}
        onOpenRecruitment={() => go('rekruttering')}
        onOpenProductivity={() => go('produktivitet')}
        onOpenCompliance={() => go('compliance')}
        onOpenContracts={() => go('avtaler')}
      />
    );
  }, [
    page, colors, employees, hr, entries, selectedEmployeeId, employeeSheet,
    canWrite, onPatch, go, months, familyId, openEmployee, saveSalaries,
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
      <View style={styles.tabs} nativeID="hr-tabs">
        {HR_MENU.map((item) => (
          <HrChip
            key={item.id}
            colors={colors}
            label={item.label}
            active={page === item.id}
            onPress={() => go(item.id)}
          />
        ))}
      </View>
      {ready ? <View key={familyId || 'hr'}>{body}</View> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
