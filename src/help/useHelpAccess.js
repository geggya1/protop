import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { useCompanyAccess } from '../access/useCompanyAccess';
import { allows, effectiveLevelId } from '../access/companyAccess';
import {
  accessContacts,
  evaluateHelpAccess,
  levelLabel,
  lockedParts,
  processStepNeed,
} from './helpAccess';
import { getProtopPage } from './protopPages';

const OPEN = { ok: true, page: false, need: null, text: '' };

/**
 * Hjelpens syn på brukerens tilgang. `check(pageKey, stepIndex)` sier om
 * brukeren kan gjøre steget (eller åpne siden når stepIndex er null), og gir
 * teksten som vises når det er låst: hva som kreves, eget nivå og hvem som
 * kan hjelpe. «Se som bruker» gir hjelpen slik den personen ser den.
 */
export function useHelpAccess() {
  const access = useCompanyAccess();
  const { family } = useApp();
  const { lang } = useI18n();
  const policy = family?.company?.accessPolicy || null;
  const ownerA = family?.ownerUid || '';
  const ownerB = family?.ownerId || '';

  return useMemo(() => {
    // Ikke bedrift, eller tilgangen lastes ennå: ingen sperrer (ingen blinkende lås).
    if (!access?.active || !access.ready) {
      return {
        active: false, level: '', check: () => OPEN, checkProcessStep: () => OPEN, checkNeed: () => OPEN,
      };
    }
    const bypass = !!access.bypass && !access.previewing;
    const grants = access.grants || null;
    const self = access.previewing ? access.viewingAs : access.employee;
    const level = bypass
      ? (lang === 'en' ? 'Owner' : 'Eier')
      : levelLabel(access.previewing && self ? effectiveLevelId(self) : access.levelId);
    const cache = new Map();
    const describe = (result, pageKey) => {
      if (result.ok) return OPEN;
      const key = `${result.need?.resource}:${result.need?.action}:${result.page}:${pageKey}`;
      if (!cache.has(key)) {
        const contacts = accessContacts({
          employees: access.employees,
          policy,
          need: result.need,
          selfEmployeeId: self?.id || '',
          ownerUids: [ownerA, ownerB],
          lang,
        });
        const page = getProtopPage(pageKey);
        const pageLabel = page ? (lang === 'en' ? page.label?.en : page.label?.nb) : '';
        const { head, who } = lockedParts({ need: result.need, page: result.page, pageLabel, level, contacts, lang });
        cache.set(key, {
          ...result,
          contacts,
          text: `${head} ${who}`,
          head,
          who,
        });
      }
      return cache.get(key);
    };
    const check = (pageKey, stepIndex = null) => {
      if (!pageKey) return OPEN;
      return describe(evaluateHelpAccess({ grants, bypass, pageKey, stepIndex }), pageKey);
    };
    const checkProcessStep = (processId, index, pageKey) => {
      const pageGate = check(pageKey, null);
      if (!pageGate.ok) return pageGate;
      const need = processStepNeed(processId, index);
      if (!need || bypass) return OPEN;
      return describe(evaluateHelpAccess({ grants, bypass, pageKey, need }), pageKey);
    };
    /** Trinn på et område uten egen side (f.eks. «Se som bruker»). */
    const checkNeed = (need) => {
      if (!need || bypass || allows(grants, need.resource, need.action)) return OPEN;
      return describe({ ok: false, need, page: false }, null);
    };
    return {
      active: true, level, check, checkProcessStep, checkNeed,
    };
  }, [access, policy, lang, ownerA, ownerB]);
}
