import React, { Suspense, useState } from 'react';
import { useHelp } from '../src/context/HelpContext';

// Rundturen (HelpOverlay) og hjelpekortet (HelpModuleCard) med hjelpetekstene lastes
// første gang hjelpen åpnes. Før lå de i oppstartsbundlen og kjørte hooks på hver side.
const HelpOverlay = React.lazy(() => import('./HelpOverlay'));
const HelpModuleCard = React.lazy(() => import('./HelpModuleCard'));

function useOpenedOnce() {
  const { mode } = useHelp();
  const [used, setUsed] = useState(false);
  if (mode && !used) setUsed(true);
  return used || !!mode;
}

export default function HelpOverlayHost() {
  if (!useOpenedOnce()) return null;
  return (
    <Suspense fallback={null}>
      <HelpOverlay />
    </Suspense>
  );
}

export function HelpModuleCardHost() {
  if (!useOpenedOnce()) return null;
  return (
    <Suspense fallback={null}>
      <HelpModuleCard />
    </Suspense>
  );
}
