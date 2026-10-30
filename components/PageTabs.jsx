import React, { useMemo } from 'react';
import ModuleTabs from './ModuleTabs';

/**
 * Faner inne i en side, med samme utseende og plass som modulmenyen (ModuleTabs, UX-19):
 * kant i kant rett under båndet, «Mer» når fanene ikke får plass. Brukes der siden selv
 * har faner (personsiden, Skjemabygger, Utstyr, Produktivitet), så alle sider har lik meny.
 * tabs: [{ id, label, short? }]. Knappene får nativeID `module-tab-{id}-{tab.id}`.
 */
export default function PageTabs({
  id, label, tabs, value, onChange,
}) {
  const menu = useMemo(() => ({
    moduleId: id,
    label,
    pages: (tabs || []).map((tab) => ({
      id: `${id}-${tab.id}`,
      label: tab.label,
      short: tab.short,
      action: { tab: id, subView: tab.id },
    })),
    activeId: value ? `${id}-${value}` : null,
  }), [id, label, tabs, value]);
  return <ModuleTabs menu={menu} onSelect={(_, tabId) => onChange?.(tabId)} />;
}
