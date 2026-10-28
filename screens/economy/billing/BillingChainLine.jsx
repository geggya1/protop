import React from 'react';
import ProcessLine from '../../../components/ProcessLine';
import { useOptionalApp } from '../../../src/context/AppContext';
import { useCompanyAccess } from '../../../src/access/useCompanyAccess';
import { billingChainSteps } from '../../../src/economy/billingChain.js';
import useBillingChain from './useBillingChain';

/** Den som godkjenner timer eller fakturerer, ser hele kjeden. Andre ser den ikke. */
export function useSeesBillingChain() {
  const isAdmin = !!useOptionalApp()?.isAdmin;
  const access = useCompanyAccess();
  if (isAdmin) return true;
  if (!access?.ready) return false;
  return !!(access.canEdit?.('hoursOthers') || access.canView?.('economyBilling'));
}

/**
 * Prosesslinjen øverst på Timeliste, Godkjenninger, Til fakturering og Faktura:
 * ① Timer → ② Godkjenn → ③ Til fakturering → ④ Faktura, med antall per steg.
 * `counts` kan sendes inn når siden allerede har regnet dem ut.
 */
export default function BillingChainLine({ current, counts = null, entries = null, locks = null, employees = null, invoices = null }) {
  const requestShellTab = useOptionalApp()?.requestShellTab;
  const visible = useSeesBillingChain();
  const loaded = useBillingChain({ entries, locks, employees, invoices, enabled: visible && !counts });
  if (!visible) return null;
  const steps = billingChainSteps(counts || loaded, current);
  return (
    <ProcessLine
      steps={steps}
      label="Fra timer til faktura"
      nativeID="billing-chain"
      onSelect={(step) => requestShellTab?.(step.tab, step.subView)}
    />
  );
}
