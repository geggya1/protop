import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { isOrganizationType } from '../utils/groupTypes';
import { displayName } from '../employees/model';
import { accountDeactivated, employeeLevelIds } from './companyAccess';
import {
  isCompanyModuleActive,
  lockedCompanyModule,
  moduleContactNote,
  moduleLockedLabel,
  normalizeCompanyModules,
} from './companyModules';
import { useCompanyAccess } from './useCompanyAccess';

function isAdministrator(employee) {
  return !!employee && !accountDeactivated(employee) && employeeLevelIds(employee).includes('administrator');
}

/**
 * Hvilke moduler bedriften har slått på, og hvem som kan endre det.
 * Modulinnstillinger i tilgangsstyringen avgjør: Lese = se, Admin = slå av og på.
 */
export function useCompanyModules() {
  const { family } = useApp();
  const access = useCompanyAccess();
  const org = isOrganizationType(family?.type);
  const raw = family?.company?.modules;
  const key = JSON.stringify(raw || {});

  return useMemo(() => {
    const state = normalizeCompanyModules(raw);
    const adminNames = (access.employees || [])
      .filter(isAdministrator)
      .map(displayName)
      .sort((a, b) => a.localeCompare(b, 'nb'));
    return {
      active: org,
      state,
      canView: org && access.ready && access.canView('moduleSettings'),
      canManage: org && access.ready && access.canAdmin('moduleSettings'),
      adminNames,
      contactNote: moduleContactNote(adminNames),
      lockedLabel: moduleLockedLabel(adminNames),
      isActive: (id) => !org || isCompanyModuleActive(state, id),
      lockedFor: (tab, subView) => (org ? lockedCompanyModule(state, tab, subView) : null),
    };
  }, [org, key, access]);
}
