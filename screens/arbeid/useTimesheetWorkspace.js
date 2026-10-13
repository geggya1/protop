import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../src/context/AppContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { ownEmployee } from '../../src/employees/model';
import { watchEmployees } from '../../src/employees/storage';
import { canManageTimesheets, findLinkedEmployee } from '../../src/arbeid/roles.js';
import { emptyProjectState } from '../../src/project/engine';
import {
  ensureProjectHours,
  loadProjectState,
  peekProjectState,
  putProjectState,
  saveProjectState,
} from '../../src/project/storage';

/** Delt lasting av prosjektstate og medarbeidere for tid-sidene. */
export function useTimesheetWorkspace({
  companyId = '',
  lockedEmployeeId = '',
  personal = false,
  fromDate = '',
  toDate = '',
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
      setState(loaded);
      setReady(true);
      skipSave.current = true;
    });
    return () => { live = false; };
  }, [workspaceId]);

  useEffect(() => {
    if (!ready || !workspaceId || !fromDate) return undefined;
    let live = true;
    ensureProjectHours(workspaceId, { fromDate, toDate: toDate || fromDate }).then((loaded) => {
      if (!live) return;
      setState(loaded);
      skipSave.current = true;
    }).catch(() => {});
    return () => { live = false; };
  }, [ready, workspaceId, fromDate, toDate]);

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
