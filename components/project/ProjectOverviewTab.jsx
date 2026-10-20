import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatHours } from '../../src/arbeid/hours.js';
import { formatDate, formatMoney } from '../../src/economy/invoices.js';
import { projectAddressLabel } from '../../src/mileage/flow';
import {
  expenseSummaryForProject,
  hoursByMonth,
  memberHoursMap,
  projectDashboardKpis,
  salesSummaryForProject,
} from '../../src/project/projectDashboard.js';
import { resolveProjectInvoiceSettings } from '../../src/project/invoiceSettings.js';

function StatusBadge({ label, colors }) {
  return (
    <View style={[styles.badge, { backgroundColor: '#dcfce7', borderColor: '#86efac' }]}>
      <View style={[styles.dot, { backgroundColor: '#16a34a' }]} />
      <Text style={{ color: '#166534', fontWeight: '600', fontSize: 12 }}>{label}</Text>
      <Ionicons name="chevron-down" size={12} color="#166534" />
    </View>
  );
}

function KpiCard({ label, value, sub, progress, colors, children }) {
  return (
    <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: colors.ink, fontSize: 20, fontWeight: '700', marginTop: 4 }}>{value}</Text>
      {sub ? <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>{sub}</Text> : null}
      {progress != null ? (
        <View style={[styles.progressTrack, { backgroundColor: colors.sunken || colors.line }]}>
          <View style={[styles.progressFill, { width: `${Math.min(100, progress)}%`, backgroundColor: colors.brand }]} />
        </View>
      ) : null}
      {children}
    </View>
  );
}

/**
 * Hovedside / landing for enkeltprosjekt — KPI, periode, team, økonomi og hurtiglenker.
 */
export default function ProjectOverviewTab({
  state,
  project,
  cross,
  summary,
  members,
  timeEntries,
  colors,
  onOpenTab,
  onOpenCustomer,
  onEditForm,
  onSaveEndDate,
}) {
  const expenses = useMemo(
    () => expenseSummaryForProject(state.expenses, project.id),
    [state.expenses, project.id],
  );
  const sales = useMemo(
    () => salesSummaryForProject(state.sales, project.id),
    [state.sales, project.id],
  );
  const bars = useMemo(() => hoursByMonth(timeEntries, 12), [timeEntries]);
  const teamRows = useMemo(() => memberHoursMap(timeEntries, members).slice(0, 4), [timeEntries, members]);
  const estimatedHours = useMemo(
    () => (state.activities || [])
      .filter((row) => row.projectId === project.id)
      .reduce((sum, row) => sum + (Number(row.estimatedHours) || 0), 0),
    [state.activities, project.id],
  );
  const kpis = projectDashboardKpis({
    cross,
    summary,
    members,
    project,
    estimatedHours,
  });
  const billing = resolveProjectInvoiceSettings(state, project);
  const address = projectAddressLabel(project) || project.place || '';
  const income = Number(cross?.totals?.amountExVat) || Number(cross?.honorarAmount) || 0;
  const cost = expenses.total;
  const profit = income - cost;
  const margin = income > 0 ? Math.round((profit / income) * 100) : 0;

  return (
    <View style={styles.wrap} nativeID="project-overview">
      <View style={styles.headActions}>
        <StatusBadge label={kpis.status} colors={colors} />
        {onEditForm ? (
          <TouchableOpacity
            onPress={onEditForm}
            style={[styles.editBtn, { borderColor: colors.line, backgroundColor: colors.card }]}
            accessibilityRole="button"
            accessibilityLabel="Rediger prosjekt"
          >
            <Ionicons name="create-outline" size={16} color={colors.ink} />
            <Text style={{ color: colors.ink, fontWeight: '600' }}>Rediger prosjekt</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View
        nativeID="project-overview-billing-inherit"
        style={[styles.inheritBanner, { backgroundColor: colors.brandSoft || '#e8f1ff', borderColor: colors.brand }]}
      >
        <Ionicons name="wallet-outline" size={16} color={colors.brand} />
        <Text style={{ color: colors.ink, flex: 1, fontSize: 12, lineHeight: 18 }}>
          {billing.sourceLabel}. Kredittid {billing.effective.creditDays} dager · påslag utlegg {billing.effective.markupExpenseHourly}%.
          {' '}
          <Text style={{ color: colors.brand, fontWeight: '600' }} onPress={() => onOpenTab?.('fakturering')}>
            Åpne faktureringsvalg
          </Text>
        </Text>
      </View>

      <View style={styles.kpiRow}>
        <KpiCard
          label="Omsetning / Inntekter"
          value={kpis.revenueLabel}
          sub="Eks. mva"
          colors={colors}
        />
        <KpiCard
          label="Fakturert"
          value={kpis.invoicedLabel}
          sub={`${kpis.invoicedPct}%`}
          progress={kpis.invoicedPct}
          colors={colors}
        />
        <KpiCard label="Gjenstående" value={kpis.remainingLabel} sub="Eks. mva" colors={colors} />
        <KpiCard
          label="Timeforbruk"
          value={`${formatHours(kpis.hours)} t`}
          sub={kpis.estimatedHours ? `av ${formatHours(kpis.estimatedHours)} t` : 'Uten estimat'}
          progress={kpis.hoursPct}
          colors={colors}
        />
        <KpiCard label="Deltakere" value={`${kpis.memberCount} aktive`} colors={colors}>
          <View style={styles.avatarStack}>
            {members.slice(0, 5).map((row) => (
              row.photoUrl ? (
                <Image key={row.id} source={{ uri: row.photoUrl }} style={styles.miniAvatar} />
              ) : (
                <View key={row.id} style={[styles.miniAvatar, { backgroundColor: `${colors.brand}22`, alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="person" size={10} color={colors.brand} />
                </View>
              )
            ))}
          </View>
        </KpiCard>
        <KpiCard label="Prosjektstatus" value={kpis.status} colors={colors}>
          <Text style={{ color: colors.muted, fontSize: 11, marginTop: 6 }}>
            Start {formatDate(project.start) || '—'}
          </Text>
          <View style={styles.endRow}>
            <Text style={{ color: colors.muted, fontSize: 11 }}>Planlagt slutt</Text>
            <TextInput
              value={project.end || ''}
              onChangeText={(v) => onSaveEndDate?.(v)}
              placeholder="ÅÅÅÅ-MM-DD"
              placeholderTextColor={colors.muted}
              style={[styles.endInput, { color: colors.ink, borderColor: colors.line }]}
              nativeID="project-overview-end-date"
            />
          </View>
        </KpiCard>
      </View>

      <View style={styles.midRow}>
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line, flex: 1.4 }]}>
          <Text style={[styles.panelTitle, { color: colors.ink }]}>Prosjektperiode</Text>
          <View style={styles.timeline}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{formatDate(project.start) || 'Start'}</Text>
            <View style={[styles.timelineTrack, { backgroundColor: colors.sunken || colors.line }]}>
              <View style={[styles.timelineFill, { backgroundColor: colors.brand, width: '55%' }]} />
              <View style={[styles.todayMark, { backgroundColor: colors.brand }]} />
            </View>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{formatDate(project.end) || 'Sluttdato'}</Text>
          </View>
        </View>
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line, flex: 1 }]}>
          <Text style={[styles.panelTitle, { color: colors.ink }]}>Prosjektets beliggenhet</Text>
          <View style={styles.locRow}>
            <Ionicons name="location" size={20} color={colors.brand} />
            <Text style={{ color: colors.ink, flex: 1, fontSize: 13 }}>{address || 'Ingen adresse satt'}</Text>
          </View>
        </View>
      </View>

      <View style={styles.midRow}>
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line, flex: 1.5 }]}>
          <Text style={[styles.panelTitle, { color: colors.ink }]}>Timeforbruk over tid</Text>
          <View style={styles.chart}>
            {bars.map((bar) => (
              <View key={bar.key} style={styles.barCol}>
                <View style={[styles.barTrack, { backgroundColor: colors.sunken || colors.line }]}>
                  <View style={[styles.barFill, { height: `${Math.max(4, bar.pct)}%`, backgroundColor: colors.brand }]} />
                </View>
                <Text style={{ color: colors.muted, fontSize: 9 }} numberOfLines={1}>{bar.label.split(' ')[0]}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line, flex: 1 }]}>
          <Text style={[styles.panelTitle, { color: colors.ink }]}>Prosjektøkonomi</Text>
          <Row label="Inntekter" value={formatMoney(income)} colors={colors} />
          <Row label="Kostnader" value={formatMoney(cost)} colors={colors} />
          <Row label="Profitt" value={formatMoney(profit)} colors={colors} />
          <View style={[styles.marginBox, { backgroundColor: '#dcfce7' }]}>
            <Text style={{ color: '#166534', fontWeight: '700' }}>Profittmargin {margin}%</Text>
          </View>
        </View>
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line, flex: 1 }]}>
          <View style={styles.panelHead}>
            <Text style={[styles.panelTitle, { color: colors.ink }]}>Team ({members.length})</Text>
            <TouchableOpacity onPress={() => onOpenTab?.('team')}>
              <Text style={{ color: colors.brand, fontWeight: '600', fontSize: 12 }}>Se alle</Text>
            </TouchableOpacity>
          </View>
          {teamRows.map((row) => (
            <View key={row.id} style={styles.teamLine}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>{row.employeeName}</Text>
                <Text style={{ color: colors.muted, fontSize: 11 }}>{row.role}</Text>
              </View>
              <Text style={{ color: colors.ink, fontSize: 12 }}>{formatHours(row.hours)} t</Text>
            </View>
          ))}
          {!teamRows.length ? <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen deltakere.</Text> : null}
        </View>
      </View>

      <View style={styles.footerCards}>
        <QuickCard
          colors={colors}
          title="Prosjektutlegg"
          lines={[`${expenses.count} utlegg`, formatMoney(expenses.total), `Ikke fakturert: ${formatMoney(expenses.unbilled)}`]}
          onPress={() => onOpenTab?.('utlegg')}
        />
        <QuickCard
          colors={colors}
          title="Produktsalg"
          lines={[`${sales.count} produkter`, formatMoney(sales.total), `Margin: ${sales.margin}%`]}
          onPress={() => onOpenTab?.('produktsalg')}
        />
        <QuickCard
          colors={colors}
          title="Avtale og kunde"
          lines={[
            project.client || '—',
            cross?.contract?.title || 'Ingen avtale',
            project.manager ? `PL: ${project.manager}` : '—',
          ]}
          onPress={() => onOpenCustomer?.(project.customerId)}
        />
      </View>
    </View>
  );
}

function Row({ label, value, colors }) {
  return (
    <View style={styles.ecoRow}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>{value}</Text>
    </View>
  );
}

function QuickCard({ colors, title, lines, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.quick, { backgroundColor: colors.card, borderColor: colors.line }]}
      accessibilityRole="button"
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.ink, fontWeight: '700', marginBottom: 6 }}>{title}</Text>
        {lines.map((line) => (
          <Text key={line} style={{ color: colors.muted, fontSize: 12, marginBottom: 2 }}>{line}</Text>
        ))}
      </View>
      <Ionicons name="arrow-forward" size={18} color={colors.brand} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  headActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inheritBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minWidth: 150,
    flexGrow: 1,
    flexBasis: 150,
  },
  progressTrack: { height: 6, borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: 6 },
  avatarStack: { flexDirection: 'row', marginTop: 8 },
  miniAvatar: { width: 22, height: 22, borderRadius: 11, marginRight: -6, borderWidth: 1, borderColor: '#fff' },
  endRow: { marginTop: 6, gap: 4 },
  endInput: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12 },
  midRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  panel: { borderWidth: 1, borderRadius: 12, padding: 14, minWidth: 240, flexGrow: 1 },
  panelTitle: { fontSize: 14, fontWeight: '700', marginBottom: 10 },
  panelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  timeline: { gap: 8 },
  timelineTrack: { height: 8, borderRadius: 4, position: 'relative', overflow: 'visible' },
  timelineFill: { height: 8, borderRadius: 4 },
  todayMark: {
    position: 'absolute',
    left: '55%',
    top: -3,
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -7,
  },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 120 },
  barCol: { flex: 1, alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' },
  barTrack: { flex: 1, width: '70%', borderRadius: 3, justifyContent: 'flex-end', overflow: 'hidden', minHeight: 40 },
  barFill: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  ecoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  marginBox: { marginTop: 8, borderRadius: 8, padding: 10, alignItems: 'center' },
  teamLine: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
  footerCards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quick: {
    flexGrow: 1,
    flexBasis: 220,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
