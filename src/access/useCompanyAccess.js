import { useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useEmployees } from '../context/CompanyDataContext';
import { isGroupAdmin, isSuperAdmin } from '../utils/groups';
import { isOrganizationType } from '../utils/groupTypes';
import { accessSignature, scheduleAccessSync } from './accessMirror';
import {
  allows,
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

const NO_EMPLOYEES = [];

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
    /** Egne rettigheter (uten «se som bruker»). Brukes som tak når man endrer andres tilgang. */
    actorGrants: actor?.grants || null,
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
 * «Se som bruker» viser den valgte brukerens moduler og rettigheter, begrenset til egne rettigheter.
 */
export function useCompanyAccess() {
  const { family, familyId, uid } = useApp();
  const org = isOrganizationType(family?.type);
  const bypass = isSuperAdmin(family, uid);
  const selection = useViewAsSelection();
  // Én felles lytter på ansatte i skallet (CompanyDataProvider), ikke én per komponent.
  const staff = useEmployees(familyId, { enabled: org });
  const live = !!(org && familyId);
  const employees = live && !staff.error ? staff.employees : NO_EMPLOYEES;
  const ready = !live || staff.ready;

  const selectedId = selection.key === viewAsKey(uid, familyId) ? selection.employeeId : '';

  // Tilgangsspeilet (accessAcl) og administratorlisten beregnes på serveren for alle selskaper,
  // ikke bare når ISO åpnes: én gang når skallet åpnes, og straks når den som kan endre tilgang
  // ser at matrisen, et nivå eller en status er endret.
  const accessPolicy = family?.company?.accessPolicy;
  const accessKey = useMemo(
    () => (org && ready ? accessSignature(accessPolicy, employees) : ''),
    [org, ready, accessPolicy, employees],
  );
  useEffect(() => {
    if (!org || !familyId || !uid || !ready) return undefined;
    const grants = bypass ? null : resolveActorAccess({ policy: accessPolicy, employees, uid }).grants;
    const manager = bypass || isGroupAdmin(family, uid)
      || allows(grants, 'accessControl', 'read') || allows(grants, 'employees', 'read');
    return scheduleAccessSync(familyId, { key: accessKey, force: manager });
    // accessKey dekker matrisen og ansatte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org, familyId, uid, ready, accessKey, bypass]);

  useEffect(() => {
    // Tom liste = ikke lastet ennå (f.eks. rett etter omlasting): behold valget.
    if (!org || !familyId || !uid || !ready || !selectedId || !employees.length) return;
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
