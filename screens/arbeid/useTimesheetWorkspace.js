import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../src/context/AppContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { ownEmployee } from '../../src/employees/model';
import { watchEmployees } from '../../src/employees/storage';
import { canManageTimesheets, findLinkedEmployee } from '../../src/arbeid/roles.js';
import { emptyProjectState, normalizeAbsenceRow } from '../../src/project/engine';
import { withoutDeletedAbsences } from '../../src/arbeid/absenceStorage.js';
import {
  applyAbsencesOntoState,
  applyHoursOntoState,
  keepFilledList,
  ensureProjectAbsences,
  ensureProjectHours,
  loadProjectState,
  noteAbsencesImported,
  peekProjectState,
  putProjectState,
  saveProjectState,
} from '../../src/project/storage';
import { subscribeFamilyCollection } from '../../src/utils/sharedCollectionListeners';

/** Delt lasting av prosjektstate og medarbeidere for tid-sidene. */
export function useTimesheetWorkspace({
  companyId = '',
  lockedEmployeeId = '',
  personal = false,
  fromDate = '',
  toDate = '',
  /** true = last all absences; object = date window; false = skip */
  absences = true,
  /** Hold fraværslisten i sanntid (fraværsoversikt og rapport). */
  liveAbsences = false,
} = {}) {
  const { familyId, user, isAdmin } = useApp();
  const access = useCompanyAccess();
  const workspaceId = String(companyId || '').trim() || familyId;
  const uid = user?.uid || null;
  const cached = peekProjectState(workspaceId);
  const [state, setState] = useState(() => cached || emptyProjectState());
  const [employees, setEmployees] = useState([]);
  const [ready, setReady] = useState(!!cached);
  const [error, setError] = useState('');
  const skipSave = useRef(true);
  const absenceAll = absences === true || absences === 'all' || absences?.all === true;
  const absenceOff = absences === false || absences === 'none';
  const absenceFrom = !absenceAll && !absenceOff ? String(absences?.fromDate || fromDate || '') : '';
  const absenceTo = !absenceAll && !absenceOff ? String(absences?.toDate || toDate || fromDate || '') : '';
  const absenceEmployee = !absenceAll && !absenceOff ? String(absences?.employeeId || '') : '';

  useEffect(() => {
    let live = true;
    const warm = peekProjectState(workspaceId);
    if (warm) {
      setState(warm);
      setReady(true);
      skipSave.current = true;
    }
    loadProjectState(workspaceId, { hours: false }).then((loaded) => {
      if (!live) return;
      skipSave.current = true;
      setState((current) => {
        const next = applyHoursOntoState(current, loaded);
        return {
          ...next,
          timeEntries: keepFilledList(current?.timeEntries, loaded?.timeEntries),
        };
      });
      setReady(true);
    });
    return () => { live = false; };
  }, [workspaceId]);

  useEffect(() => {
    if (!ready || !workspaceId || !fromDate) return undefined;
    let live = true;
    ensureProjectHours(workspaceId, { fromDate, toDate: toDate || fromDate }).then((loaded) => {
      if (!live) return;
      skipSave.current = true;
      setState((current) => applyHoursOntoState(current, loaded));
    }).catch(() => {});
    return () => { live = false; };
  }, [ready, workspaceId, fromDate, toDate]);

  useEffect(() => {
    if (!ready || !workspaceId || absenceOff) return undefined;
    let live = true;
    const range = absenceAll
      ? { all: true }
      : { fromDate: absenceFrom, toDate: absenceTo || absenceFrom, employeeId: absenceEmployee };
    ensureProjectAbsences(workspaceId, range).then((loaded) => {
      if (!live) return;
      skipSave.current = true;
      setState((current) => applyAbsencesOntoState(current, loaded));
    }).catch(() => {});
    return () => { live = false; };
  }, [ready, workspaceId, absenceOff, absenceAll, absenceFrom, absenceTo, absenceEmployee]);

  useEffect(() => {
    if (!ready || !workspaceId || !liveAbsences || !absenceAll) return undefined;
    return subscribeFamilyCollection(
      workspaceId,
      'absences',
      (snap) => withoutDeletedAbsences(
        workspaceId,
        snap.docs.map((item) => normalizeAbsenceRow({ ...item.data(), id: item.id })).filter(Boolean),
      ),
      (rows) => {
        const next = Array.isArray(rows) ? rows : [];
        if (!next.length) return;
        setState((current) => {
          skipSave.current = true;
          noteAbsencesImported(workspaceId, next);
          return putProjectState({ ...current, absences: next }, workspaceId);
        });
      },
    );
  }, [ready, workspaceId, liveAbsences, absenceAll]);

  useEffect(() => {
    if (!workspaceId) return undefined;
    return watchEmployees(workspaceId, setEmployees, () => setEmployees([]));
  }, [workspaceId]);

  useEffect(() => {
    if (!ready) return;
    putProjectState(state, workspaceId);
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    saveProjectState(state, workspaceId).catch(() => setError('Kunne ikke lagre.'));
  }, [state, ready, workspaceId]);

  const linked = useMemo(() => {
    const row = personal
      ? ownEmployee(employees, { uid, emails: [user?.email], name: user?.displayName || '' })
      : findLinkedEmployee(employees, uid);
    if (!row || row.company?.status === 'former' || row.company?.status === 'deleted') return null;
    return row;
  }, [employees, uid, personal, user?.email, user?.displayName]);

  const manager = personal
    ? false
    : (access.ready
      ? ((isAdmin && !access.previewLocks('hoursOthers')) || access.can('hoursOthers', 'write'))
      : canManageTimesheets({ isAdmin, employee: linked }));

  return {
    workspaceId,
    uid,
    state,
    setState,
    employees,
    ready,
    error,
    setError,
    linked,
    manager,
    lockedId: String(lockedEmployeeId || '').trim(),
    personal,
  };
}
