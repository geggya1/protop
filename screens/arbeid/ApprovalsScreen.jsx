import { useMemo } from 'react';
import { toDateKey } from '../../src/arbeid/calendar.js';
import { filterEmployeesForPicker } from '../../src/arbeid/roles.js';
import { useModuleHeroHosted } from '../../components/ModulePageBg';
import { useColors } from '../../src/context/ThemeContext';
import { ApprovalsBody } from './ApprovalsView';
import { useTimesheetWorkspace } from './useTimesheetWorkspace';
import { useOptionalApp } from '../../src/context/AppContext';
import { useCompanyAiAllowed } from '../../src/privacy/useCompanyAi';
import BillingChainLine from '../economy/billing/BillingChainLine';
import useBillingChain, { forgetBillingChain } from '../economy/billing/useBillingChain';

function scanLockedEntries(rows, familyId) {
  return import('../../src/arbeid/timesheetReviewClient.js')
    .then((mod) => mod.scanTimesheetWithAi(rows, { familyId }));
}

export function ApprovalsScreen() {
  const colors = useColors();
  const hostedHero = useModuleHeroHosted();
  const year = new Date().getFullYear();
  const app = useOptionalApp();
  const familyId = app?.familyId || '';
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
  const employees = useMemo(() => filterEmployeesForPicker(workspace.employees, ''), [workspace.employees]);
  // Sidens egne timer og låser, så tallene følger med når en liste godkjennes.
  const chain = useBillingChain({
    entries: workspace.state?.timeEntries || [],
    locks: workspace.state?.timesheetLocks || [],
    employees,
    enabled: !!workspace.manager,
  });
  return (
    <ApprovalsBody
      workspace={workspace}
      hostedHero={hostedHero}
      colors={colors}
      scan={scan}
      chainLine={<BillingChainLine current="godkjenn" counts={chain} />}
      readyCount={chain.fakturering}
      onOpenBilling={() => app?.requestShellTab?.('okonomi', 'fakturagrunnlag')}
      onApproved={() => forgetBillingChain(familyId)}
    />
  );
}
