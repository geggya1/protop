import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatHours } from '../../src/arbeid/hours.js';
import { formatMoney } from '../../src/economy/invoices.js';
import { resolveProjectInvoiceSettings } from '../../src/project/invoiceSettings.js';

/**
 * Til fakturering — prosjektfiltrert grunnlag (timer, utlegg, salg) klar for faktura.
 */
export default function ProjectBillingReadyTab({
  state,
  project,
  // Salg på prosjektet, også importerte. Uten listen brukes salg i prosjektstate.
  sales: projectSales,
  colors,
  onOpenEconomyBilling,
  onOpenTab,
}) {
  const billing = resolveProjectInvoiceSettings(state, project);
  const showExpenses = project.pricingSettings?.showBillableExpenses !== false;
  const showSales = project.pricingSettings?.showBillableSales !== false;

  const hours = useMemo(() => (state.timeEntries || []).filter((row) => (
    row.projectId === project.id
    && row.billable !== false
    && (row.status === 'godkjent' || row.status === 'registrert')
    && !row.invoiceId
  )), [state.timeEntries, project.id]);

  const expenses = useMemo(() => (state.expenses || []).filter((row) => (
    row.projectId === project.id
    && row.billable !== false
    && row.status !== 'invoiced'
    && row.status !== 'draft'
  )), [state.expenses, project.id]);

  const sales = useMemo(() => (projectSales || state.sales || []).filter((row) => (
    row.projectId === project.id
    && row.billable !== false
    && row.status !== 'invoiced'
    && !row.invoiceId
  )), [projectSales, state.sales, project.id]);

  const hourSum = hours.reduce((sum, row) => sum + (Number(row.billableHours) || Number(row.hours) || 0), 0);
  const expenseSum = expenses.reduce((sum, row) => sum + (Number(row.amountExVat) || 0), 0);
  const saleSum = sales.reduce((sum, row) => sum + (Number(row.amountExVat) || 0), 0);
  const rate = Number(project.pricingSettings?.hourlyRate) || 0;
  const hourAmount = hourSum * rate;

  return (
    <View style={styles.wrap} nativeID="project-billing-ready-tab">
      <View style={[styles.banner, { backgroundColor: colors.brandSoft || '#e8f1ff', borderColor: colors.brand }]}>
        <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 19 }}>
          Grunnlag som kan faktureres på dette prosjektet. Kredittid og kontoer hentes fra{' '}
          {billing.sourceLabel.toLowerCase()}. Effektiv kredittid: {billing.effective.creditDays} dager.
        </Text>
      </View>

      <View style={styles.cards}>
        <ReadyCard
          colors={colors}
          title="Timer"
          value={`${formatHours(hourSum)} t`}
          sub={rate ? `≈ ${formatMoney(hourAmount)} eks. mva` : 'Sett timepris under Faktureringsvalg'}
          count={hours.length}
          onPress={() => onOpenTab?.('timerapport')}
        />
        {showExpenses ? (
          <ReadyCard
            colors={colors}
            title="Utlegg"
            value={formatMoney(expenseSum)}
            sub={`${expenses.length} poster`}
            count={expenses.length}
            onPress={() => onOpenTab?.('utlegg')}
          />
        ) : null}
        {showSales ? (
          <ReadyCard
            colors={colors}
            title="Produktsalg"
            value={formatMoney(saleSum)}
            sub={`${sales.length} poster`}
            count={sales.length}
            onPress={() => onOpenTab?.('produktsalg')}
          />
        ) : null}
      </View>

      <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <Text style={[styles.title, { color: colors.ink }]}>Klar til faktura</Text>
        <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 12 }}>
          Opprett faktura i Økonomi → Fakturagrunnlag. Prosjektet er forhåndsfiltrert der du jobber videre med bilag og EHF.
        </Text>
        <TouchableOpacity
          onPress={onOpenEconomyBilling}
          style={[styles.primary, { backgroundColor: colors.brand }]}
          accessibilityRole="button"
          nativeID="project-open-billing-desk"
        >
          <Ionicons name="receipt-outline" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700' }}>Åpne fakturagrunnlag</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <Text style={[styles.title, { color: colors.ink }]}>Poster</Text>
        {hours.slice(0, 8).map((row) => (
          <Text key={row.id} style={[styles.line, { color: colors.ink, borderColor: colors.line }]}>
            Timer · {row.date} · {row.employeeName} · {formatHours(row.billableHours || row.hours)} t
          </Text>
        ))}
        {showExpenses && expenses.slice(0, 8).map((row) => (
          <Text key={row.id} style={[styles.line, { color: colors.ink, borderColor: colors.line }]}>
            Utlegg · {row.date} · {row.description || 'Utlegg'} · {formatMoney(row.amountExVat)}
          </Text>
        ))}
        {showSales && sales.slice(0, 8).map((row) => (
          <Text key={row.id} style={[styles.line, { color: colors.ink, borderColor: colors.line }]}>
            Salg · {row.name} · {formatMoney(row.amountExVat)}
          </Text>
        ))}
        {!hours.length && !expenses.length && !sales.length ? (
          <Text style={{ color: colors.muted }}>Ingen poster klare til fakturering.</Text>
        ) : null}
      </View>
    </View>
  );
}

function ReadyCard({ colors, title, value, sub, count, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}
    >
      <Text style={{ color: colors.muted, fontSize: 12 }}>{title} ({count})</Text>
      <Text style={{ color: colors.ink, fontSize: 20, fontWeight: '700', marginTop: 4 }}>{value}</Text>
      <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>{sub}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  banner: { borderWidth: 1, borderRadius: 10, padding: 12 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { flexGrow: 1, flexBasis: 180, borderWidth: 1, borderRadius: 12, padding: 14 },
  panel: { borderWidth: 1, borderRadius: 12, padding: 14 },
  title: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  line: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8, fontSize: 13 },
});
