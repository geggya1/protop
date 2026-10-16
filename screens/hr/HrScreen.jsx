import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { CompanyAccessDenied } from '../../components/project/CompanyAccessSettings';
import { watchEmployees } from '../../src/employees/storage';
import { emptyHrState, normalizeHrState, patchHrState } from '../../src/hr/model';
import { hrLoadMeta, loadHrState, saveHrState } from '../../src/hr/storage';
import { defaultHrSubView, HR_MENU } from '../../src/navigation/shellModules';
import { showSaveToast } from '../../src/ui/saveToast';
import { HrChip } from './HrShared';
import HrDashboard from './HrDashboard';
import HrPeople from './HrPeople';
import HrSalary from './HrSalary';
import HrFollowUp from './HrFollowUp';
import HrRecruitment from './HrRecruitment';
import HrContracts from './HrContracts';
import HrCompliance from './HrCompliance';

export default function HrScreen({ subView = 'oversikt' }) {
  const colors = useColors();
  const { familyId, requestShellTab } = useApp();
  const access = useCompanyAccess();
  const page = defaultHrSubView(subView);
  const canSee = access.can('hr', 'see');
  const canWrite = access.can('hr', 'write');

  const [employees, setEmployees] = useState([]);
  const [hr, setHr] = useState(emptyHrState());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
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
    setSelectedEmployeeId('');
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

  const body = useMemo(() => {
    if (page === 'personell') {
      return (
        <HrPeople
          colors={colors}
          employees={employees}
          hr={hr}
          selectedId={selectedEmployeeId}
          onSelect={setSelectedEmployeeId}
          canWrite={canWrite}
          onPatch={onPatch}
          onGo={go}
        />
      );
    }
    if (page === 'avtaler') {
      return (
        <HrContracts
          colors={colors}
          employees={employees}
          hr={hr}
          canWrite={canWrite}
          onPatch={onPatch}
          familyId={familyId}
          selectedEmployeeId={selectedEmployeeId}
          onSelectEmployee={setSelectedEmployeeId}
        />
      );
    }
    if (page === 'lonn') {
      return (
        <HrSalary
          colors={colors}
          employees={employees}
          hr={hr}
          canWrite={canWrite}
          selectedEmployeeId={selectedEmployeeId}
          onSelectEmployee={setSelectedEmployeeId}
          onSaveSalaries={(salariesOrFn) => onPatch((state) => ({
            salaries: typeof salariesOrFn === 'function'
              ? salariesOrFn(state.salaries || [])
              : salariesOrFn,
          }))}
        />
      );
    }
    if (page === 'oppfolging') {
      return (
        <HrFollowUp
          colors={colors}
          employees={employees}
          hr={hr}
          canWrite={canWrite}
          selectedEmployeeId={selectedEmployeeId}
          onSelectEmployee={setSelectedEmployeeId}
          onPatch={onPatch}
          familyId={familyId}
        />
      );
    }
    if (page === 'compliance') {
      return (
        <HrCompliance
          colors={colors}
          employees={employees}
          hr={hr}
          canWrite={canWrite}
          onPatch={onPatch}
          selectedEmployeeId={selectedEmployeeId}
          onSelectEmployee={setSelectedEmployeeId}
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
        onOpenRecruitment={() => go('rekruttering')}
        onOpenProductivity={() => go('produktivitet')}
        onOpenCompliance={() => go('compliance')}
        onOpenContracts={() => go('avtaler')}
      />
    );
  }, [
    page, colors, employees, hr, selectedEmployeeId, canWrite, onPatch, go, familyId,
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
