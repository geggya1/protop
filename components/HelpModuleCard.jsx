import React, { useEffect, useState } from 'react';
import ModuleWelcomeModal, { ModuleActivationScrim } from './ModuleWelcomeModal';
import { useHelp } from '../src/context/HelpContext';
import { useI18n } from '../src/i18n';
import { buildHelpWelcomeModule } from '../src/utils/helpWelcome';
import { subscribeAppRoute } from '../src/navigation/navRef';

/**
 * Lightbulb entry: same activation card (image + copy), help CTA instead of Aktiver.
 * First-visit activation still uses ModuleActivationGate unchanged.
 */
export default function HelpModuleCard() {
  const { t } = useI18n();
  const {
    mode, copy, scope, moduleId, dismiss, startModuleTour,
  } = useHelp();
  const [routeName, setRouteName] = useState('');
  useEffect(() => subscribeAppRoute(setRouteName), []);
  const helpHeld = routeName === 'ProfileSetup';

  const module = mode === 'moduleCard'
    ? buildHelpWelcomeModule({
      scope,
      moduleId,
      copy,
      walkthroughLabel: t('moduleIntro.walkthrough'),
      closeLabel: t('moduleIntro.close'),
    })
    : null;

  useEffect(() => {
    if (mode !== 'moduleCard') return undefined;
    if (module) return undefined;
    startModuleTour();
    return undefined;
  }, [mode, module, startModuleTour]);

  if (helpHeld || mode !== 'moduleCard' || !module) return null;

  return (
    <ModuleActivationScrim onRequestBack={dismiss} dismissLabel={t('moduleIntro.close')}>
      <ModuleWelcomeModal
        module={module}
        onActivate={startModuleTour}
        onBack={dismiss}
        canActivate
        showReassurance={false}
        primaryLabel={t('moduleIntro.walkthrough')}
      />
    </ModuleActivationScrim>
  );
}
