import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useCompanyAccess } from '../access/useCompanyAccess';
import { useCompanyModules } from '../access/useCompanyModules';
import { useI18n } from '../i18n';
import { buildNavTree, navTreeInput } from '../navigation/navTree';

/**
 * Menyens innhold for innlogget bruker, likt i sidemenyen, skuffen og Meny-siden.
 * Tilgang og moduler av/på kommer fra samme kilder som før (useCompanyAccess, useCompanyModules).
 */
export function useNavTree({ hideChat = false } = {}) {
  const { t } = useI18n();
  const {
    isParent, isChild, isActingAsChild, isAdmin, isSuperAdmin, isGrandparent,
    family, familyId, kids, meChild, meParent, activeChild,
  } = useApp();
  const companyAccess = useCompanyAccess();
  const companyModules = useCompanyModules();

  return useMemo(
    () => buildNavTree(navTreeInput({
      t,
      app: {
        isParent,
        isChild,
        isActingAsChild,
        isAdmin,
        isSuperAdmin,
        isGrandparent,
        family,
        familyId,
        kids,
        meChild,
        meParent,
        activeChild,
      },
      companyGrants: companyAccess.grants,
      companyModules: companyModules.state,
      companyModuleNote: companyModules.lockedLabel,
    }), { hideChat }),
    [
      t, isParent, isChild, isActingAsChild, isAdmin, isSuperAdmin, isGrandparent,
      family, familyId, kids, meChild, meParent, activeChild,
      companyAccess.grants, companyModules.state, companyModules.lockedLabel, hideChat,
    ],
  );
}
