import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useApp, useShellNav } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import CompanyAccessDenied from '../../components/project/CompanyAccessDenied';
import { watchEmployees } from '../../src/employees/storage';
import { loadAbsences } from '../../src/arbeid/absenceStorage';
import { createFollowUpTask } from '../../src/hr/followUpTask';
import {
  emptyHrState, localIsoDate, normalizeHrState, patchHrState,
} from '../../src/hr/model';
import { hmsCardRequirement, mergeHmsCards } from '../../src/hr/hmsCard';
import { loadSelfHmsCards } from '../../src/hr/hmsSelf';
import { hrLoadMeta, loadHrState, saveHrState } from '../../src/hr/storage';
import { logSensitiveAccess } from '../../src/hr/accessLogClient';
import { hiredPeople, noticesFromAbsences } from '../../src/innleie/dashboard';
import { defaultInnleieSubView } from '../../src/navigation/shellModules';
import { showSaveToast } from '../../src/ui/saveToast';
import InnleieDashboard from './InnleieDashboard';
import InnleiePeople from './InnleiePeople';
import InnleieSuppliers from './InnleieSuppliers';
import InnleieFollowUp from './InnleieFollowUp';

function shiftDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localIsoDate(d);
}

/**
 * Modulen Innleie: innleide og eksterne, atskilt fra HR (egne ansatte).
 * Bruker HR-dokumentet (hr/state) til kravene, HMS-kortene og sakene, med samme lagring som HR.
 * Fravær er fraværsbeskjedene personene selv sender fra timelisten.
 */
export default function InnleieScreen({ subView = 'oversikt' }) {
  const colors = useColors();
  const nav = useNavigation();
  const {
    family, familyId, uid, activeProfile, requestShellTab, clearShellIntent,
  } = useApp();
  const { shellIntent } = useShellNav();
  const page = defaultInnleieSubView(subView);
  const access = useCompanyAccess();
  // HR-dokumentet har også lønn. Derfor samme tilgang som HR → Personell.
  const canSee = access.canView('hrPeople');
  const canWrite = access.canEdit('hrPeople');
  const assigneeName = String(activeProfile?.name || activeProfile?.displayName || '').trim();

  const [employees, setEmployees] = useState([]);
  const [hr, setHr] = useState(emptyHrState());
  const [absences, setAbsences] = useState([]);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [sheet, setSheet] = useState('krav');
  const [focusCaseId, setFocusCaseId] = useState('');
  const [gapFilter, setGapFilter] = useState('');
  const [followUpId, setFollowUpId] = useState('');
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
    const empty = emptyHrState();
    hrRef.current = empty;
    setHr(empty);
    setReady(false);
    const companyId = familyId;
    loadHrState(companyId).then((state) => {
      if (!live || familyIdRef.current !== companyId) return;
      hrRef.current = state;
      setHr(state);
      setReady(true);
      if (hrLoadMeta(companyId) === 'error') showSaveToast?.('Lastet fra lokal kopi — skyen ikke klar');
    }).catch(() => {
      if (!live || familyIdRef.current !== companyId) return;
      hrRef.current = emptyHrState();
      setHr(hrRef.current);
      setReady(true);
    });
    return () => { live = false; };
  }, [familyId]);

  // Fraværsbeskjeder: fra i går til en måned fram.
  useEffect(() => {
    let live = true;
    setAbsences([]);
    if (!familyId || !canSee) return undefined;
    loadAbsences(familyId, { fromDate: shiftDays(-1), toDate: shiftDays(31) })
      .then((rows) => { if (live) setAbsences(Array.isArray(rows) ? rows : []); })
      .catch(() => {});
    return () => { live = false; };
  }, [familyId, canSee]);

  // HMS-kort de har registrert selv, og om bedriften krever kort (som i HR).
  const [selfHmsCards, setSelfHmsCards] = useState([]);
  useEffect(() => {
    let live = true;
    setSelfHmsCards([]);
    if (familyId) loadSelfHmsCards(familyId).then((rows) => { if (live) setSelfHmsCards(rows); });
    return () => { live = false; };
  }, [familyId]);
  const naeringskode = String(family?.company?.naeringskode || '').trim();
  const hmsRule = useMemo(
    () => hmsCardRequirement({ naeringskode, setting: hr.settings?.hmsCard }),
    [naeringskode, hr.settings?.hmsCard],
  );
  const hrView = useMemo(
    () => ({ ...hr, hmsCards: mergeHmsCards(hr.hmsCards, selfHmsCards), hmsRequired: hmsRule.required, hmsRule }),
    [hr, selfHmsCards, hmsRule],
  );
  const notices = useMemo(
    () => noticesFromAbsences(absences, hiredPeople(employees, 'all')),
    [absences, employees],
  );

  const persist = useCallback((next) => {
    const normalized = normalizeHrState(next);
    const companyId = familyIdRef.current;
    hrRef.current = normalized;
    setHr(normalized);
    if (!companyId) return;
    const snapshot = normalized;
    saveChainRef.current = saveChainRef.current
      .catch(() => {})
      .then(async () => {
        const stillHere = familyIdRef.current === companyId;
        const latest = stillHere ? hrRef.current : null;
        const toSave = (stillHere && latest?.updatedAt && snapshot.updatedAt
          && String(latest.updatedAt) > String(snapshot.updatedAt)) ? latest : snapshot;
        try {
          await saveHrState(toSave, companyId);
          if (familyIdRef.current === companyId) showSaveToast?.('Lagret');
        } catch (err) {
          if (familyIdRef.current !== companyId) return;
          const code = String(err?.code || '');
          if (code === 'hr/permission') showSaveToast?.('Mangler tilgang til å lagre');
          else if (code === 'hr/skip-empty' || code === 'hr/skip-uncertain' || code === 'hr/auth') showSaveToast?.('Lagret lokalt — skyen ikke klar');
          else showSaveToast?.('Kunne ikke lagre i skyen');
        }
      });
  }, []);

  const onPatch = useCallback((partialOrFn) => {
    if (!canWrite) return;
    const base = hrRef.current || emptyHrState();
    const partial = typeof partialOrFn === 'function' ? partialOrFn(base) : partialOrFn;
    persist(patchHrState(base, partial));
  }, [persist, canWrite]);

  // Fra HR, saker og oversikten: åpne personen direkte.
  // Fra oversikten: åpne personen under Oppfølging.
  useEffect(() => {
    if (shellIntent?.type !== 'innleieFollowUp') return;
    setFollowUpId(shellIntent.employeeId || '');
    clearShellIntent?.();
  }, [shellIntent, clearShellIntent]);

  useEffect(() => {
    if (shellIntent?.type !== 'hrEmployee' || !shellIntent.employeeId) return;
    setSelectedId(shellIntent.employeeId);
    setSheet(shellIntent.sheet === 'oppfolging' ? 'oppfolging' : 'krav');
    setFocusCaseId(shellIntent.caseId || '');
    clearShellIntent?.();
  }, [shellIntent, clearShellIntent]);

  // Innsynslogg: en persons mappe.
  useEffect(() => {
    if (ready && familyId && canSee && page === 'personell' && selectedId) {
      logSensitiveAccess({ familyId, kind: 'hrFolder', employeeId: selectedId });
    }
  }, [ready, familyId, canSee, page, selectedId]);

  const openPerson = useCallback((id, nextSheet = 'krav') => {
    setSelectedId(id || '');
    setSheet(nextSheet);
    setFocusCaseId('');
    if (page !== 'personell') requestShellTab?.('innleie', 'personell', id ? { type: 'hrEmployee', employeeId: id, sheet: nextSheet } : null);
  }, [page, requestShellTab]);

  const openPeople = useCallback((filter) => {
    setSelectedId('');
    setGapFilter(filter?.gap || '');
    requestShellTab?.('innleie', 'personell');
  }, [requestShellTab]);

  const openFollowUp = useCallback((id) => {
    requestShellTab?.('innleie', 'oppfolging', id ? { type: 'innleieFollowUp', employeeId: id } : null);
  }, [requestShellTab]);

  const openProfile = useCallback((id) => {
    if (id) requestShellTab?.('ansatte', null, { type: 'openEmployee', employeeId: id });
  }, [requestShellTab]);

  const openLinkedTask = useCallback((taskId) => {
    if (taskId) nav.navigate('ParentTask', { task: { id: taskId }, familyId });
  }, [nav, familyId]);

  const createTask = useCallback((draft) => createFollowUpTask({
    familyId, uid, name: assigneeName, draft,
  }), [familyId, uid, assigneeName]);

  if (access.active && access.ready && !canSee) return <CompanyAccessDenied />;

  return (
    <ScrollView style={[styles.scroll, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content} nativeID="innleie-screen">
      {ready ? (
        <View key={familyId || 'innleie'}>
          {page === 'leverandorer' ? (
            <InnleieSuppliers
              colors={colors}
              employees={employees}
              hr={hrView}
              canWrite={canWrite}
              onPatch={onPatch}
            />
          ) : null}
          {page === 'oppfolging' ? (
            <InnleieFollowUp
              colors={colors}
              employees={employees}
              hr={hrView}
              canWrite={canWrite}
              onPatch={onPatch}
              assigneeName={assigneeName}
              selectedId={followUpId}
              onSelect={setFollowUpId}
            />
          ) : null}
          {page === 'personell' ? (
            <InnleiePeople
              colors={colors}
              employees={employees}
              hr={hrView}
              notices={notices}
              selectedId={selectedId}
              onSelect={(id) => { setSelectedId(id || ''); setFocusCaseId(''); }}
              sheet={sheet}
              onSheet={setSheet}
              canWrite={canWrite}
              onPatch={onPatch}
              familyId={familyId}
              focusCaseId={focusCaseId}
              assigneeUid={uid || ''}
              assigneeName={assigneeName}
              onOpenTask={openLinkedTask}
              onCreateFollowUpTask={createTask}
              gapFilter={gapFilter}
              onClearGap={() => setGapFilter('')}
              onOpenProfile={openProfile}
              onOpenFollowUp={openFollowUp}
            />
          ) : null}
          {page === 'oversikt' ? (
            <InnleieDashboard
              colors={colors}
              employees={employees}
              hr={hrView}
              notices={notices}
              onOpenPerson={(id) => openPerson(id, 'krav')}
              onOpenPeople={openPeople}
              onOpenFollowUp={openFollowUp}
              onOpenSuppliers={() => requestShellTab?.('innleie', 'leverandorer')}
            />
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
});
