import React, { useCallback, useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ModuleWelcomeModal, { ModuleActivationScrim } from './ModuleWelcomeModal';
import { useModuleAccess } from '../src/context/ModuleAccessContext';
import { getModuleConfig, isActivatableModule } from '../src/modules/moduleActivationRegistry';
import { reassuranceForRole } from '../src/modules/moduleActivationLogic';
import { localizeModuleFields, localizeCatalogDefaults } from '../src/i18n/moduleCatalog';
import { useI18n } from '../src/i18n';
import {
  MODULE_ACTIVATION_EVENTS,
  trackModuleActivationEvent,
} from '../src/utils/moduleActivationAnalytics';
import { canActivateModule, getModuleAccess } from '../src/utils/moduleAccess';

/**
 * Viser den virkelige modulsiden i bakgrunnen og aktiveringsvinduet over
 * når modulen ikke er aktivert for familien.
 */
export default function ModuleActivationGate({
  moduleId,
  children,
  onBack,
  enabled = true,
}) {
  const nav = useNavigation();
  const { lang } = useI18n();
  const {
    needsWelcome, activateModule, userRole, accessMap,
  } = useModuleAccess();
  const viewedRef = useRef(null);
  const rawConfig = getModuleConfig(moduleId);
  const config = rawConfig
    ? {
      ...localizeModuleFields(rawConfig, lang),
      ...localizeCatalogDefaults(rawConfig, lang),
    }
    : null;
  const access = getModuleAccess(accessMap, moduleId);
  const showWelcome = enabled && isActivatableModule(moduleId) && needsWelcome(moduleId);
  const asChild = userRole === 'child';
  const canActivate = canActivateModule(access, { isChild: asChild });

  useEffect(() => {
    if (!showWelcome || !moduleId) return undefined;
    if (viewedRef.current === moduleId) return undefined;
    viewedRef.current = moduleId;
    trackModuleActivationEvent(MODULE_ACTIVATION_EVENTS.viewed, { moduleId, userRole });
    return undefined;
  }, [showWelcome, moduleId, userRole]);

  const handleBack = useCallback(() => {
    trackModuleActivationEvent(MODULE_ACTIVATION_EVENTS.back, { moduleId, userRole });
    if (typeof onBack === 'function') {
      onBack();
      return;
    }
    if (nav?.canGoBack?.()) {
      nav.goBack();
      return;
    }
    nav?.navigate?.('Home');
  }, [onBack, nav, moduleId, userRole]);

  const handleActivate = useCallback(() => {
    activateModule(moduleId, { source: 'welcome' });
  }, [activateModule, moduleId]);

  useEffect(() => {
    return () => {
      if (!showWelcome || Platform.OS !== 'web' || typeof document === 'undefined') return;
      try {
        document.getElementById(`module-nav-${moduleId}`)?.focus?.();
      } catch { /* ignore */ }
    };
  }, [showWelcome, moduleId]);

  if (!enabled || !isActivatableModule(moduleId) || !config || !showWelcome) {
    return children;
  }

  const modalModule = {
    ...config,
    illustration: config.illustrationPath || `/assets/module-activation/${config.illustration}`,
    illustrationPath: config.illustrationPath,
    reassuranceText: reassuranceForRole(config, { isChild: asChild, compact: false }),
    mobileReassuranceText: reassuranceForRole(config, { isChild: asChild, compact: true }),
    reassuranceTextCompact: reassuranceForRole(config, { isChild: asChild, compact: true }),
  };

  return (
    <View style={styles.wrap}>
      <View
        style={styles.background}
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        {children}
      </View>
      <ModuleActivationScrim onRequestBack={handleBack}>
        <ModuleWelcomeModal
          module={modalModule}
          onActivate={handleActivate}
          onBack={handleBack}
          canActivate={canActivate}
          showReassurance={!!modalModule.reassuranceText}
        />
      </ModuleActivationScrim>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    height: '100%',
    alignSelf: 'stretch',
    position: 'relative',
    overflow: 'hidden',
  },
  background: {
    flex: 1,
    minHeight: 0,
    height: '100%',
    ...(Platform.OS === 'web' ? { filter: 'blur(2px)' } : { opacity: 0.72 }),
  },
});
