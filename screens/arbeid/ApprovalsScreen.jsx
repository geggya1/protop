import { toDateKey } from '../../src/arbeid/calendar.js';
import { useModuleHeroHosted } from '../../components/ModulePageBg';
import { useColors } from '../../src/context/ThemeContext';
import { ApprovalsBody } from './ApprovalsView';
import { useTimesheetWorkspace } from './useTimesheetWorkspace';

function scanLockedEntries(rows) {
  return import('../../src/arbeid/timesheetReviewClient.js')
    .then((mod) => mod.scanTimesheetWithAi(rows));
}

export function ApprovalsScreen() {
  const colors = useColors();
  const hostedHero = useModuleHeroHosted();
  const year = new Date().getFullYear();
  const workspace = useTimesheetWorkspace({
    fromDate: `${year}-01-01`,
    toDate: toDateKey(new Date()),
  });
  return (
    <ApprovalsBody
      workspace={workspace}
      hostedHero={hostedHero}
      colors={colors}
      scan={scanLockedEntries}
    />
  );
}
