import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { watchEmployees } from '../employees/storage';
import { isSuperAdmin } from '../utils/groups';
import { isOrganizationType } from '../utils/groupTypes';
import {
  allows,
  companyTabAllowed,
  loadingGrants,
  resolveActorAccess,
} from './companyAccess';

const idle = {
  active: false,
  ready: true,
  bypass: false,
  grants: null,
  employees: [],
  levelId: '',
  employee: null,
  can: () => true,
  tabAllowed: () => true,
};

/**
 * Effektiv tilgang for innlogget bruker i bedriften.
 * Eier av bedriften har full tilgang, så grunninnstillingene ikke kan låses ute.
 */
export function useCompanyAccess() {
  const { family, familyId, uid } = useApp();
  const org = isOrganizationType(family?.type);
  const bypass = isSuperAdmin(family, uid);
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

  return useMemo(() => {
    if (!org) return idle;
    if (bypass) {
      const resolved = resolveActorAccess({ bypass: true });
      return {
        active: true,
        ready: true,
        bypass: true,
        grants: null,
        employees,
        levelId: resolved.levelId,
        employee: resolved.employee,
        can: () => true,
        tabAllowed: () => true,
      };
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
        tabAllowed: (tab, subView) => companyTabAllowed(tab, subView, grants),
      };
    }
    const resolved = resolveActorAccess({
      policy: family?.company?.accessPolicy,
      employees,
      uid,
    });
    return {
      active: true,
      ready: true,
      bypass: false,
      grants: resolved.grants,
      employees,
      levelId: resolved.levelId,
      employee: resolved.employee,
      customized: resolved.customized,
      hoursOnAssignedOnly: resolved.hoursOnAssignedOnly,
      can: (resource, action) => allows(resolved.grants, resource, action),
      tabAllowed: (tab, subView) => companyTabAllowed(tab, subView, resolved.grants),
    };
  }, [org, bypass, ready, employees, family?.company?.accessPolicy, uid]);
}
