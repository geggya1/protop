import { useMemo } from 'react';
import { toDateKey } from '../../src/arbeid/calendar.js';
import { useModuleHeroHosted } from '../../components/ModulePageBg';
import { useColors } from '../../src/context/ThemeContext';
import { ApprovalsBody } from './ApprovalsView';
import { useTimesheetWorkspace } from './useTimesheetWorkspace';
import { useOptionalApp } from '../../src/context/AppContext';
import { useCompanyAiAllowed } from '../../src/privacy/useCompanyAi';

function scanLockedEntries(rows, familyId) {
  return import('../../src/arbeid/timesheetReviewClient.js')
    .then((mod) => mod.scanTimesheetWithAi(rows, { familyId }));
}

export function ApprovalsScreen() {
  const colors = useColors();
  const hostedHero = useModuleHeroHosted();
  const year = new Date().getFullYear();
  const familyId = useOptionalApp()?.familyId || '';
  const aiAllowed = useCompanyAiAllowed();
  // Låste timelister sendes til Gemini bare når bedriften tillater AI.
  const scan = useMemo(
    () => (aiAllowed ? (rows) => scanLockedEntries(rows, familyId) : undefined),
    [aiAllowed, familyId],
  );
  const workspace = useTimesheetWorkspace({
    fromDate: `${year}-01-01`,
    toDate: toDateKey(new Date()),
  });
  return (
    <ApprovalsBody
      workspace={workspace}
      hostedHero={hostedHero}
      colors={colors}
      scan={scan}
    />
  );
}
