import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { CompanyAccessDenied } from '../../components/project/CompanyAccessSettings';
import { watchEmployees } from '../../src/employees/storage';
import { loadTimeEntries } from '../../src/economy/timeEntryStorage';
import { emptyHrState, normalizeHrState, patchHrState } from '../../src/hr/model';
import { loadHrState, saveHrState } from '../../src/hr/storage';
import { defaultHrSubView, HR_MENU } from '../../src/navigation/shellModules';
import { showSaveToast } from '../../src/ui/saveToast';
import { HrChip } from './HrShared';
import HrDashboard from './HrDashboard';
import HrPeople from './HrPeople';
import HrProductivity from './HrProductivity';
import HrSalary from './HrSalary';
import HrFollowUp from './HrFollowUp';
import HrRecruitment from './HrRecruitment';
import HrContracts from './HrContracts';
import HrCompliance from './HrCompliance';

function periodWindow(months = 3) {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - months);
  return {
    fromDate: from.toISOString().slice(0, 10),
    toDate: to.toISOString().slice(0, 10),
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
  const [months, setMonths] = useState(3);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!familyId) return undefined;
    return watchEmployees(familyId, (rows) => setEmployees(rows || []));
  }, [familyId]);

  useEffect(() => {
    let live = true;
    if (!familyId) return undefined;
    setReady(false);
    loadHrState(familyId).then((state) => {
      if (!live) return;
      setHr(state);
      setReady(true);
    }).catch(() => {
      if (!live) return;
      setHr(emptyHrState());
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

  const persist = useCallback(async (next) => {
    const normalized = normalizeHrState(next);
    setHr(normalized);
    if (!familyId) return;
    try {
      await saveHrState(normalized, familyId);
      showSaveToast?.('Lagret');
    } catch {
      showSaveToast?.('Kunne ikke lagre');
    }
  }, [familyId]);

  const onPatch = useCallback((partial) => {
    const next = patchHrState(hr, partial);
    persist(next);
  }, [hr, persist]);

  const go = useCallback((id) => {
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
    if (page === 'produktivitet') {
      return (
        <HrProductivity
          colors={colors}
          employees={employees}
          entries={entries}
          months={months}
          onMonthsChange={setMonths}
          onSelectEmployee={(id) => {
            setSelectedEmployeeId(id);
            go('personell');
          }}
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
          onSaveSalaries={(salaries) => onPatch({ salaries })}
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
    page, colors, employees, hr, entries, selectedEmployeeId, canWrite, onPatch, go, months, familyId,
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
      {ready ? body : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
