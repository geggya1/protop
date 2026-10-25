import React, { useEffect, useMemo, useState } from 'react';
import ModuleWelcomeModal, { ModuleActivationScrim } from './ModuleWelcomeModal';
import HelpPageCard from './HelpPageCard';
import { useHelp } from '../src/context/HelpContext';
import { useI18n } from '../src/i18n';
import { buildHelpWelcomeModule } from '../src/utils/helpWelcome';
import { subscribeAppRoute } from '../src/navigation/navRef';
import { openAssistant } from '../src/help/assistantBridge';
import { useLayout } from '../src/theme';
import { buildTourSteps } from '../src/utils/helpLayout';
import { pickIntroText } from '../src/utils/moduleIntros';
import { useHelpAccess } from '../src/help/useHelpAccess';
import { condenseStepLocks } from '../src/help/helpAccess';

/**
 * Lightbulb entry. ProTop-sider får hjelpekortet (forklaring, steg,
 * arbeidsflyt, FAQ og assistent). Andre moduler beholder aktiveringskortet
 * med hjelpeknapp. First-visit activation still uses ModuleActivationGate unchanged.
 */
export default function HelpModuleCard() {
  const { t, lang } = useI18n();
  const {
    mode, copy, scope, moduleId, dismiss, startModuleTour, startProcessTour,
  } = useHelp();
  const [routeName, setRouteName] = useState('');
  useEffect(() => subscribeAppRoute(setRouteName), []);
  const helpHeld = routeName === 'ProfileSetup';
  const protopPage = mode === 'moduleCard' && !!copy?.pageKey;
  const layout = useLayout();
  // Stegene på kortet følger skjermen (mobil/PC-varianter), som rundturen.
  const cardCopy = useMemo(() => {
    if (!protopPage || !copy?.rawSteps) return copy;
    const tour = buildTourSteps(copy.rawSteps, lang, pickIntroText, {
      isPhone: layout.isPhone,
      isTablet: layout.isTablet,
      isDesktop: layout.isDesktop,
      hasRail: layout.hasRail,
    });
    return { ...copy, tour, steps: tour.map((s) => s.text) };
  }, [protopPage, copy, lang, layout.isPhone, layout.isTablet, layout.isDesktop, layout.hasRail]);
  // Steg brukeren ikke har tilgang til: hva som kreves og hvem som kan hjelpe.
  const helpAccess = useHelpAccess();
  const { locks: stepLocks, who: lockWho } = useMemo(() => (
    protopPage && cardCopy?.tour
      ? condenseStepLocks(cardCopy.tour.map((_, i) => helpAccess.check(cardCopy.pageKey, i)))
      : { locks: [], who: '' }
  ), [protopPage, cardCopy, helpAccess]);

  const module = mode === 'moduleCard' && !protopPage
    ? buildHelpWelcomeModule({
      scope,
      moduleId,
      copy,
      walkthroughLabel: t('moduleIntro.walkthrough'),
      closeLabel: t('moduleIntro.close'),
    })
    : null;

  useEffect(() => {
    if (mode !== 'moduleCard' || protopPage) return undefined;
    if (module) return undefined;
    startModuleTour();
    return undefined;
  }, [mode, module, protopPage, startModuleTour]);

  if (helpHeld || mode !== 'moduleCard') return null;

  if (protopPage) {
    return (
      <HelpPageCard
        copy={cardCopy}
        stepLocks={stepLocks}
        lockWho={lockWho}
        onClose={() => dismiss()}
        onStartTour={startModuleTour}
        onStartProcess={(id, fromIndex) => {
          dismiss();
          startProcessTour(id, fromIndex);
        }}
        onAsk={() => {
          dismiss();
          const label = copy.label || copy.title;
          openAssistant({
            title: t('assistant.name'),
            question: lang === 'en' ? `How do I use ${label}?` : `Hvordan bruker jeg ${label}?`,
          });
        }}
      />
    );
  }

  if (!module) return null;

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
