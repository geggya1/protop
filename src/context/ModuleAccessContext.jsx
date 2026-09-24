import React, { useCallback, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useApp } from './AppContext';
import { useI18n } from '../i18n';
import {
  ACTIVATION_SOURCES,
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
  MODULE_ACTIVATION_EVENTS,
  trackModuleActivationEvent,
} from '../utils/moduleActivationAnalytics';

const Ctx = React.createContext(null);

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
    userProfile, meParent,
  } = useApp();
  const { lang } = useI18n();
  const [overlay, setOverlay] = useState(null);

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

  const isActivated = useCallback((moduleId) => (
    isModuleActivated(getModuleAccess(accessMap, moduleId))
  ), [accessMap]);

  const needsWelcome = useCallback((moduleId) => {
    if (!moduleId) return false;
    if (familyId && family == null) return true;
    if (!accessReady) return true;
    return shouldShowModuleWelcome(liveFamily, moduleId);
  }, [accessReady, family, familyId, liveFamily]);

  const activateModule = useCallback(async (moduleId, { source = ACTIVATION_SOURCES.welcome } = {}) => {
    if (!moduleId) return false;
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
    trackModuleActivationEvent(MODULE_ACTIVATION_EVENTS.completed, {
      moduleId,
      userRole,
      role: ctx.role,
      platform: ctx.platform,
      timezone: ctx.timezone,
      subscriptionType: family?.subscriptionStatus || null,
    });
    return true;
  }, [accessMap, persistAccess, userRole, family?.subscriptionStatus, activationContext]);

  const deactivateModule = useCallback(async (moduleId) => {
    if (!moduleId || !canManage) return false;
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
  }, [accessMap, canManage, persistAccess, activationContext]);

  const value = useMemo(() => ({
    accessMap,
    accessReady,
    canManage,
    userRole,
    isActivated,
    needsWelcome,
    activateModule,
    deactivateModule,
  }), [
    accessMap, accessReady, canManage, userRole,
    isActivated, needsWelcome, activateModule, deactivateModule,
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
      isActivated: () => false,
      needsWelcome: () => true,
      activateModule: async () => false,
      deactivateModule: async () => false,
    };
  }
  return ctx;
}
