import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../src/context/AppContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { isActiveEmployee, ownEmployee } from '../../src/employees/model';
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
import { waitForFirestoreAccess } from '../../src/utils/firestoreAccess';

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
  const [employeesReady, setEmployeesReady] = useState(false);
  const [absencesReady, setAbsencesReady] = useState(() => {
    const warm = peekProjectState(workspaceId);
    return Array.isArray(warm?.absences) && warm.absences.length > 0;
  });
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
    if (!workspaceId || absenceOff) {
      setAbsencesReady(true);
      return undefined;
    }
    if (!ready) return undefined;
    let live = true;
    const warm = peekProjectState(workspaceId);
    const hasAbsences = Array.isArray(warm?.absences) && warm.absences.length > 0;
    if (!hasAbsences) setAbsencesReady(false);
    const range = absenceAll
      ? { all: true }
      : { fromDate: absenceFrom, toDate: absenceTo || absenceFrom, employeeId: absenceEmployee };
    ensureProjectAbsences(workspaceId, range).then((loaded) => {
      if (!live) return;
      skipSave.current = true;
      setState((current) => applyAbsencesOntoState(current, loaded));
      setAbsencesReady(true);
    }).catch(() => {
      if (live) setAbsencesReady(true);
    });
    return () => { live = false; };
  }, [ready, workspaceId, absenceOff, absenceAll, absenceFrom, absenceTo, absenceEmployee]);

  // Åpne fraværsstrømmen mens prosjektstate lastes. Lesingen og lytteren under
  // bruker samme strøm, så fraværet hentes parallelt og bare én gang.
  useEffect(() => {
    if (!workspaceId || !uid || !liveAbsences || !absenceAll) return undefined;
    let live = true;
    let stop = null;
    let failed = false;
    const release = () => {
      failed = true;
      stop?.();
    };
    waitForFirestoreAccess(uid).then((ok) => {
      if (!live || !ok) return;
      // Feil kommer som tom liste. Slipp strømmen, så lytteren under starter på nytt som før.
      stop = subscribeFamilyCollection(workspaceId, 'absences', () => null, (rows) => {
        if (Array.isArray(rows)) release();
      });
      if (failed) stop();
    }).catch(() => {});
    return () => {
      live = false;
      stop?.();
    };
  }, [workspaceId, uid, liveAbsences, absenceAll]);

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
        setAbsencesReady(true);
        setState((current) => {
          skipSave.current = true;
          noteAbsencesImported(workspaceId, next);
          return putProjectState({ ...current, absences: next }, workspaceId);
        });
      },
    );
  }, [ready, workspaceId, liveAbsences, absenceAll]);

  useEffect(() => {
    if (!workspaceId) {
      setEmployees([]);
      setEmployeesReady(true);
      return undefined;
    }
    let live = true;
    let sawRemote = false;
    setEmployeesReady(false);
    const stop = watchEmployees(workspaceId, (rows, meta) => {
      if (!live) return;
      const list = Array.isArray(rows) ? rows : [];
      const remote = meta?.source === 'remote';
      if (remote) sawRemote = true;
      else if (sawRemote || !list.length) return;
      setEmployees(list);
      setEmployeesReady(true);
    }, () => {
      if (!live) return;
      setEmployees([]);
      setEmployeesReady(true);
    });
    return () => {
      live = false;
      stop();
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!ready) return;
    putProjectState(state, workspaceId);
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    // Timer og fravær går til egne samlinger. Prosjektdokumentet får bare radene som faktisk
    // er endret her (lås, saldo, fraværstyper), lagt på skyens ferske kopi.
    saveProjectState(state, workspaceId).catch(() => setError('Kunne ikke lagre.'));
  }, [state, ready, workspaceId]);

  const linked = useMemo(() => {
    // «Se som bruker»: følger personen som vises, ikke innlogget konto.
    const previewed = !personal && access.previewing && access.viewingAs
      ? employees.find((row) => row.id === access.viewingAs.id) || access.viewingAs
      : null;
    const row = previewed || (personal
      ? ownEmployee(employees, { uid, emails: [user?.email], name: user?.displayName || '' })
      : findLinkedEmployee(employees, uid));
    if (!row || !isActiveEmployee(row)) return null;
    return row;
  }, [employees, uid, personal, user?.email, user?.displayName, access.previewing, access.viewingAs]);

  // Andres timer følger bare tilgangsstyringen, ikke administratorlisten på selskapet (adminUids).
  const manager = personal
    ? false
    : (access.ready
      ? access.canEdit('hoursOthers')
      : canManageTimesheets({ isAdmin, employee: linked }));

  return {
    workspaceId,
    uid,
    state,
    setState,
    employees,
    employeesReady,
    absencesReady,
    ready,
    error,
    setError,
    linked,
    manager,
    lockedId: String(lockedEmployeeId || '').trim(),
    personal,
  };
}
