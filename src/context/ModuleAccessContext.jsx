import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import {
  doc, onSnapshot, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useApp } from './AppContext';
import { useI18n } from '../i18n';
import { useCompanyModules } from '../access/useCompanyModules';
import { isOrganizationType } from '../utils/groupTypes';
import { waitForFirestoreAccess } from '../utils/firestoreAccess';
import {
  ACTIVATION_SOURCES,
  ENTITLEMENTS,
  activateModuleAccess,
  applyModuleAccessPatch,
  buildModuleAccessWrite,
  canManageModuleAccess,
  captureActivationContext,
  deactivateModuleAccess,
  getModuleAccess,
  isModuleActivated,
  readModuleAccessMap,
  shouldShowModuleWelcome,
} from '../utils/moduleAccess';
import {
  MODULE_PREFS_COLLECTION,
  effectiveModuleOn,
  modulePrefsWrite,
  moduleWriteScope,
  personalModuleBlocked,
  readModulePrefs,
} from '../utils/modulePrefs';
import {
  MODULE_ACTIVATION_EVENTS,
  trackModuleActivationEvent,
} from '../utils/moduleActivationAnalytics';

const Ctx = React.createContext(null);

/** Mitt eget valg i en bedrift (MENY-01): users/{uid}/modulePrefs/{bedrift}. */
function modulePrefsRef(uid, familyId) {
  return doc(db, 'users', uid, MODULE_PREFS_COLLECTION, familyId);
}

function profileLocationFromApp({ userProfile, meParent, family }) {
  return userProfile?.location
    || meParent?.location
    || family?.location
    || family?.homeLocation
    || null;
}

export function ModuleAccessProvider({ children }) {
  const {
    family, familyId, isParent, isChild, isActingAsChild, isAdmin, isGrandparent, loading,
    userProfile, meParent, uid,
  } = useApp();
  const { lang } = useI18n();
  const [overlay, setOverlay] = useState(null);
  // I en bedrift har hver ansatt sin egen visning oppå bedriftens valg (MENY-01).
  const company = isOrganizationType(family?.type);
  const prefsKey = company && uid && familyId ? `${uid}:${familyId}` : '';
  const [prefsBox, setPrefsBox] = useState({ key: '', prefs: {} });
  useEffect(() => {
    if (!prefsKey) return undefined;
    let live = true;
    let stop = null;
    waitForFirestoreAccess(uid).then((ok) => {
      if (!live || !ok) return;
      stop = onSnapshot(
        modulePrefsRef(uid, familyId),
        (snap) => setPrefsBox({ key: prefsKey, prefs: readModulePrefs(snap.exists() ? snap.data() : null) }),
        () => setPrefsBox({ key: prefsKey, prefs: {} }),
      );
    }).catch(() => {});
    return () => {
      live = false;
      stop?.();
    };
  }, [prefsKey]);
  const prefs = prefsBox.key === prefsKey ? prefsBox.prefs : {};

  const liveFamily = useMemo(() => {
    if (!family) return family;
    if (!overlay || overlay.familyId !== familyId) return family;
    return applyModuleAccessPatch(family, overlay.patch);
  }, [family, overlay, familyId]);

  const accessMap = useMemo(() => readModuleAccessMap(liveFamily), [liveFamily]);
  const accessReady = !familyId || family != null || !loading;
  const canManage = canManageModuleAccess({
    isParent, isChild, isActingAsChild, isAdmin, isGrandparent,
  });
  // Uten valg fra skjermen: eier og administrator endrer for hele bedriften, andre bare for seg selv.
  // Skjermene i skallet sender scope fra useModuleWriteScope (også Admin på Modulinnstillinger).
  const defaultScope = moduleWriteScope({ company, isAdmin });
  const userRole = (isChild || isActingAsChild) ? 'child' : 'parent';
  const auditRole = userRole === 'child' ? 'child' : 'adult';

  const activationContext = useCallback(() => captureActivationContext({
    platform: Platform.OS,
    role: auditRole,
    locale: (typeof navigator !== 'undefined' && navigator.language) || lang || family?.language || null,
    family: liveFamily || family,
    profileLocation: profileLocationFromApp({ userProfile, meParent, family: liveFamily || family }),
  }), [auditRole, lang, liveFamily, family, userProfile, meParent]);

  const persistAccess = useCallback(async (moduleId, nextAccess) => {
    if (!familyId || !moduleId) return null;
    const patch = buildModuleAccessWrite(liveFamily || family, moduleId, nextAccess);
    try {
      await updateDoc(doc(db, 'families', familyId), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
      setOverlay({ familyId, patch });
      return patch;
    } catch {
      /* keep welcome visible if the billing write did not land */
      return null;
    }
  }, [familyId, family, liveFamily]);

  /** Mitt eget valg i bedriften. Bedriftens valg (families/{id}) røres ikke. */
  const persistPersonal = useCallback(async (moduleId, on) => {
    if (!uid || !familyId || !moduleId) return false;
    const next = modulePrefsWrite(prefs, moduleId, on);
    try {
      await setDoc(modulePrefsRef(uid, familyId), { ...next, updatedAt: serverTimestamp() }, { merge: true });
      setPrefsBox({ key: prefsKey, prefs: next.modules });
      return true;
    } catch {
      return false;
    }
  }, [uid, familyId, prefs, prefsKey]);

  // Er modulen på for meg? I en bedrift: bedriftens valg med mitt eget oppå.
  const isActivated = useCallback((moduleId) => (
    company
      ? effectiveModuleOn(accessMap, prefs, moduleId)
      : isModuleActivated(getModuleAccess(accessMap, moduleId))
  ), [accessMap, company, prefs]);

  /** Bedriftens valg alene (Modulinnstillinger). */
  const companyActivated = useCallback((moduleId) => (
    isModuleActivated(getModuleAccess(accessMap, moduleId))
  ), [accessMap]);

  /** Slått av for hele bedriften: en ansatt kan ikke slå den på for seg selv. */
  const companyLocked = useCallback((moduleId) => (
    company && personalModuleBlocked(accessMap, moduleId)
  ), [accessMap, company]);

  const needsWelcome = useCallback((moduleId) => {
    if (!moduleId) return false;
    if (familyId && family == null) return true;
    if (!accessReady) return true;
    if (company) {
      if (getModuleAccess(accessMap, moduleId).entitlement === ENTITLEMENTS.unavailable) return false;
      return !effectiveModuleOn(accessMap, prefs, moduleId);
    }
    return shouldShowModuleWelcome(liveFamily, moduleId);
  }, [accessReady, family, familyId, liveFamily, company, accessMap, prefs]);

  /**
   * Slå på. scope 'personal': bare for meg (i en bedrift, når bedriften ikke har slått modulen av).
   * scope 'company': for hele gruppen (i en bedrift bare eier, administrator og Admin på
   * Modulinnstillinger, som reglene krever). Uten scope: defaultScope.
   */
  const activateModule = useCallback(async (moduleId, { source = ACTIVATION_SOURCES.welcome, scope = '' } = {}) => {
    if (!moduleId) return false;
    if ((scope || defaultScope) === 'personal') {
      if (personalModuleBlocked(accessMap, moduleId)) return false;
      return persistPersonal(moduleId, true);
    }
    const ctx = activationContext();
    trackModuleActivationEvent(MODULE_ACTIVATION_EVENTS.clicked, {
      moduleId,
      userRole,
      role: ctx.role,
      platform: ctx.platform,
      timezone: ctx.timezone,
    });
    const nextMap = activateModuleAccess(accessMap, moduleId, {
      ...ctx,
      source,
      entitlement: getModuleAccess(accessMap, moduleId).entitlement,
    });
    const patch = await persistAccess(moduleId, nextMap[moduleId]);
    if (!patch) return false;
    // Hadde jeg skjult modulen for meg selv, vises den igjen når jeg slår den på for alle.
    if (company && prefs[moduleId] === 'off') await persistPersonal(moduleId, true);
    trackModuleActivationEvent(MODULE_ACTIVATION_EVENTS.completed, {
      moduleId,
      userRole,
      role: ctx.role,
      platform: ctx.platform,
      timezone: ctx.timezone,
      subscriptionType: family?.subscriptionStatus || null,
    });
    return true;
  }, [
    accessMap, persistAccess, userRole, family?.subscriptionStatus, activationContext,
    defaultScope, persistPersonal, company, prefs,
  ]);

  /** Slå av. scope som for activateModule: 'personal' skjuler modulen bare for meg. */
  const deactivateModule = useCallback(async (moduleId, { scope = '' } = {}) => {
    if (!moduleId || !canManage) return false;
    if ((scope || defaultScope) === 'personal') return persistPersonal(moduleId, false);
    const ctx = activationContext();
    const nextMap = deactivateModuleAccess(accessMap, moduleId);
    const patch = await persistAccess(moduleId, nextMap[moduleId]);
    if (!patch) return false;
    trackModuleActivationEvent(MODULE_ACTIVATION_EVENTS.deactivated, {
      moduleId,
      userRole: 'parent',
      role: 'adult',
      platform: ctx.platform,
      timezone: ctx.timezone,
    });
    return true;
  }, [accessMap, canManage, persistAccess, activationContext, defaultScope, persistPersonal]);

  const value = useMemo(() => ({
    accessMap,
    accessReady,
    canManage,
    userRole,
    isCompany: company,
    isActivated,
    companyActivated,
    companyLocked,
    needsWelcome,
    activateModule,
    deactivateModule,
  }), [
    accessMap, accessReady, canManage, userRole, company,
    isActivated, companyActivated, companyLocked, needsWelcome, activateModule, deactivateModule,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useModuleAccess() {
  const ctx = React.useContext(Ctx);
  if (!ctx) {
    return {
      accessMap: {},
      accessReady: false,
      canManage: false,
      userRole: 'parent',
      isCompany: false,
      isActivated: () => false,
      companyActivated: () => false,
      companyLocked: () => false,
      needsWelcome: () => true,
      activateModule: async () => false,
      deactivateModule: async () => false,
    };
  }
  return ctx;
}

/**
 * Hvor den innloggede sine modulvalg lagres (MENY-01): 'company' (hele gruppen) eller
 * 'personal' (bare meg). I en bedrift endrer bare eier, administrator og Admin på
 * Modulinnstillinger hele bedriften, som firestore.rules krever.
 */
export function useModuleWriteScope() {
  const { family, isAdmin } = useApp();
  const companyModules = useCompanyModules();
  return moduleWriteScope({
    company: isOrganizationType(family?.type),
    isAdmin,
    canAdminModules: companyModules.canManage,
  });
}
