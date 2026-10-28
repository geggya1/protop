import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { useLayout } from '../../src/theme';
import { showSaveToast } from '../../src/ui/saveToast';
import { supplierFromCompany } from '../../src/economy/ehf.js';
import { buildReadyProjects, PERIOD_OPTIONS, periodEndFor } from '../../src/economy/billingReady.js';
import { osloDate } from '../../src/indeksregulering/watch';
import ConfirmDialog from '../ConfirmDialog';
import BrandBusyOverlay from '../BrandBusyOverlay';
import BillingProjectRow from '../../screens/economy/billing/BillingProjectRow';
import useBillingData from '../../screens/economy/billing/useBillingData';
import useBillingWorkflow from '../../screens/economy/billing/useBillingWorkflow';
import { Banner } from '../../screens/economy/billing/ui';
import { withIndexWarnings } from '../../screens/economy/billing/indexWarnings';

/**
 * Prosjekt · Til fakturering: samme blokk som i Økonomi → Til fakturering, for dette prosjektet.
 */
export default function ProjectBillingReadyTab({
  project,
  colors,
  onOpenEconomyBilling,
  onOpenTab,
  onOpenInvoice,
}) {
  const { familyId, family, uid, activeProfile, isAdmin } = useApp();
  const access = useCompanyAccess();
  const { isPhone, isWide } = useLayout();
  const canEdit = !!isAdmin || access.canEdit('economyBilling');
  const data = useBillingData({ familyId, projectId: project.id, project, canSeePowerOffice: !!isAdmin });
  const today = osloDate();
  const [period, setPeriod] = useState('today');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const periodEnd = periodEndFor(period, today);
  const supplier = useMemo(() => supplierFromCompany(family?.company, family?.name), [family]);
  const actor = useMemo(() => ({ byUid: uid || '', byName: activeProfile?.name || '' }), [uid, activeProfile?.name]);

  const ready = useMemo(() => {
    if (!data.ready) return null;
    const built = buildReadyProjects({
      projects: data.projects.filter((row) => row.id === project.id),
      customers: data.customers,
      timeEntries: data.timeEntries,
      expenses: data.expenses,
      trips: data.trips,
      sales: data.sales,
      invoices: data.invoices,
      timesheetLocks: data.timesheetLocks,
      contracts: data.contracts,
      settingsFor: data.settingsFor,
      chart: data.chart,
      periodEnd,
      today,
      includeEmpty: true,
    });
    return withIndexWarnings(built, data, today)[0] || null;
  }, [data, project.id, periodEnd, today]);

  const workflow = useBillingWorkflow({
    familyId,
    projects: ready ? [ready] : [],
    data,
    supplier,
    actor,
    periodEnd,
    onCreated: (created, failed) => {
      setError(failed.map((row) => row.error).join('\n'));
      if (created.length) {
        showSaveToast('Fakturautkastet er laget.');
        // Rett til utkastet, så det kan kontrolleres med en gang.
        if (onOpenInvoice) {
          onOpenInvoice(created[0].id);
          return;
        }
        setNote('Fakturautkastet er laget. Kontroller og ferdigstill det fra fakturasiden.');
      }
    },
    onError: (message) => setError(message),
  });

  return (
    <View style={styles.wrap} nativeID="project-billing-ready-tab">
      <View style={styles.toolbar}>
        {PERIOD_OPTIONS.filter((row) => row.id !== 'custom').map((row) => {
          const on = period === row.id;
          return (
            <TouchableOpacity
              key={row.id}
              onPress={() => setPeriod(row.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.chip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
            >
              <Text style={{ color: on ? colors.brand : colors.ink, fontSize: 13 }}>{row.label}</Text>
            </TouchableOpacity>
          );
        })}
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={onOpenEconomyBilling} accessibilityRole="link" nativeID="project-open-billing-desk">
          <Text style={{ color: colors.brand, fontWeight: '600' }}>Alle prosjekter til fakturering</Text>
        </TouchableOpacity>
      </View>

      {data.error ? <Banner tone="block" colors={colors}>{data.error}</Banner> : null}
      {error ? <Banner tone="block" colors={colors}>{error}</Banner> : null}
      {note ? <Banner tone="ok" colors={colors}>{note}</Banner> : null}

      {!data.ready ? (
        <Text style={{ color: colors.muted }}>Henter det som skal faktureres…</Text>
      ) : ready ? (
        <BillingProjectRow
          project={ready}
          colors={colors}
          open
          onToggleOpen={() => {}}
          selected={workflow.selectedFor(ready)}
          onToggleKey={(key) => workflow.toggleKey(ready, key)}
          showCheck={false}
          fixedAmount={workflow.fixedAmounts[ready.projectId]}
          onFixedAmount={(value) => workflow.setFixedAmount(ready.projectId, value)}
          stacked={isPhone || !isWide}
          busy={!!workflow.busy}
          canEdit={canEdit}
          onApprove={async () => {
            const count = await workflow.approve([ready]);
            if (count) showSaveToast(count === 1 ? '1 post er godkjent.' : `${count} poster er godkjent.`);
          }}
          onCreateDraft={() => { setError(''); setNote(''); workflow.requestCreate([ready]); }}
          onOpenDraft={(invoice) => onOpenInvoice?.(invoice.id)}
          onOpenProject={(tab) => onOpenTab?.(tab)}
        />
      ) : (
        <Text style={{ color: colors.muted }}>Ingen poster klare til fakturering.</Text>
      )}

      <ConfirmDialog
        visible={!!workflow.pending}
        title="Ikke godkjent"
        message={workflow.pending
          ? `${workflow.pending.unapproved === 1 ? '1 post' : `${workflow.pending.unapproved} poster`} er ikke godkjent. Vil du godkjenne dem og ta dem med, eller bare ta med det som er godkjent?`
          : ''}
        buttons={[
          { text: 'Avbryt', style: 'cancel', onPress: workflow.cancelPending },
          { text: 'Bare godkjente', style: 'cancel', onPress: () => workflow.confirmPending(false) },
          { text: 'Godkjenn og lag utkast', onPress: () => workflow.confirmPending(true) },
        ]}
        onClose={() => {}}
      />
      <BrandBusyOverlay
        visible={workflow.busy === 'draft'}
        label="Lager fakturautkast…"
        detail="Postene reserveres på utkastet."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
});
