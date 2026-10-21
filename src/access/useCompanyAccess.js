import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { watchEmployees } from '../employees/storage';
import { isSuperAdmin } from '../utils/groups';
import { isOrganizationType } from '../utils/groupTypes';
import {
  companyTabAllowed,
  loadingGrants,
  resolveActorAccess,
  resolveViewAsAccess,
  viewAsAllows,
  viewAsLocks,
} from './companyAccess';
import {
  clearViewAs,
  useViewAsSelection,
  viewAsKey,
} from './viewAsStore';

const idle = {
  active: false,
  ready: true,
  bypass: false,
  grants: null,
  employees: [],
  levelId: '',
  employee: null,
  can: () => true,
  canView: () => true,
  canEdit: () => true,
  canAdmin: () => true,
  tabAllowed: () => true,
  actorTabAllowed: () => true,
  previewLocks: () => false,
  previewing: false,
  previewStamp: '',
  viewingAs: null,
  viewAsScope: 'none',
  viewAsCapability: 'none',
  canViewAs: false,
};

function presentAccess({ bypass, ready, employees, actor, preview }) {
  const previewing = !!preview?.active;
  const grants = preview?.grants;
  const stamp = previewing
    ? `${preview.employee?.id || ''}:${preview.scope}:${JSON.stringify(grants)}`
    : '';
  return {
    active: true,
    ready,
    bypass: !!bypass,
    grants,
    employees,
    levelId: actor?.levelId || '',
    employee: actor?.employee || null,
    customized: !!actor?.customized,
    hoursOnAssignedOnly: !!actor?.hoursOnAssignedOnly,
    can: (resource, action) => viewAsAllows({ preview, actor, bypass, resource, action }),
    /** Lese — se innhold uten endring. */
    canView: (resource) => viewAsAllows({ preview, actor, bypass, resource, action: 'see' }),
    /** Begrenset redigering — opprette og redigere innhold. */
    canEdit: (resource) => viewAsAllows({ preview, actor, bypass, resource, action: 'read' }),
    /** Admin — innstillingsknapper og full modulstyring. */
    canAdmin: (resource) => viewAsAllows({ preview, actor, bypass, resource, action: 'write' }),
    tabAllowed: (tab, subView) => {
      if (!previewing && bypass) return true;
      return companyTabAllowed(tab, subView, grants);
    },
    actorTabAllowed: (tab, subView) => (
      bypass ? true : companyTabAllowed(tab, subView, actor?.grants)
    ),
    previewLocks: (resource) => viewAsLocks(preview, resource),
    previewing,
    previewStamp: stamp,
    viewingAs: previewing ? preview.employee : null,
    viewAsScope: preview?.scope || 'none',
    viewAsCapability: preview?.capability || 'none',
    canViewAs: (preview?.capability || 'none') !== 'none',
  };
}

/**
 * Effektiv tilgang for innlogget bruker i bedriften.
 * Eier av bedriften har full tilgang, så grunninnstillingene ikke kan låses ute.
 * «Se som bruker» bytter menyen til den valgte brukerens moduler uten å gi skrivetilgang.
 */
export function useCompanyAccess() {
  const { family, familyId, uid } = useApp();
  const org = isOrganizationType(family?.type);
  const bypass = isSuperAdmin(family, uid);
  const selection = useViewAsSelection();
  const [employees, setEmployees] = useState([]);
  const [ready, setReady] = useState(!org);

  useEffect(() => {
    if (!org || !familyId) {
      setEmployees([]);
      setReady(true);
      return undefined;
    }
    setReady(false);
    return watchEmployees(familyId, (rows) => {
      setEmployees(rows);
      setReady(true);
    }, () => {
      setEmployees([]);
      setReady(true);
    });
  }, [org, familyId]);

  const selectedId = selection.key === viewAsKey(uid, familyId) ? selection.employeeId : '';

  useEffect(() => {
    if (!org || !familyId || !uid || !ready || !selectedId) return;
    const exists = employees.some((row) => row.id === selectedId && row?.company?.status !== 'deleted');
    if (!exists) clearViewAs();
  }, [org, familyId, uid, ready, selectedId, employees]);

  return useMemo(() => {
    if (!org) return idle;
    const lens = selection.key === viewAsKey(uid, familyId) ? selection.lens : 'all';
    const target = selectedId
      ? employees.find((row) => row.id === selectedId && row?.company?.status !== 'deleted') || null
      : null;
    const policy = family?.company?.accessPolicy;

    if (bypass) {
      const actor = resolveActorAccess({ bypass: true });
      const preview = resolveViewAsAccess({ actor, targetEmployee: target, policy, lens });
      return presentAccess({
        bypass: true, ready: true, employees, actor, preview,
      });
    }
    if (!ready) {
      const grants = loadingGrants();
      return {
        active: true,
        ready: false,
        bypass: false,
        grants,
        employees: [],
        levelId: '',
        employee: null,
        can: () => false,
        canView: () => false,
        canEdit: () => false,
        canAdmin: () => false,
        tabAllowed: (tab, subView) => companyTabAllowed(tab, subView, grants),
        actorTabAllowed: (tab, subView) => companyTabAllowed(tab, subView, grants),
        previewLocks: () => false,
        previewing: false,
        previewStamp: '',
        viewingAs: null,
        viewAsScope: 'none',
        viewAsCapability: 'none',
        canViewAs: false,
      };
    }
    const actor = resolveActorAccess({ policy, employees, uid });
    const preview = resolveViewAsAccess({ actor, targetEmployee: target, policy, lens });
    return presentAccess({
      bypass: false, ready: true, employees, actor, preview,
    });
  }, [org, bypass, ready, employees, family?.company?.accessPolicy, uid, selectedId, selection.key, selection.lens, familyId]);
}
