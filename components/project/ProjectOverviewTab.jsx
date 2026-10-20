import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatHours } from '../../src/arbeid/hours.js';
import { formatDate, formatMoney } from '../../src/economy/invoices.js';
import { projectAddressLabel } from '../../src/mileage/flow';
import {
  expenseSummaryForProject,
  hoursChartForOverview,
  memberHoursMap,
  projectDashboardKpis,
  projectPeriodProgress,
  salesSummaryForProject,
} from '../../src/project/projectDashboard.js';
import { resolveProjectInvoiceSettings } from '../../src/project/invoiceSettings.js';
import { updateProject } from '../../src/project/engine.js';
import { alertPhotoError, pickImage, uploadImage } from '../../src/utils/media';
import { showSaveToast } from '../../src/ui/saveToast';

function KpiCard({ label, value, sub, progress, colors, children }) {
  return (
    <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <Text style={{ color: colors.muted, fontSize: 10 }} numberOfLines={1}>{label}</Text>
      <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{value}</Text>
      {sub ? <Text style={{ color: colors.muted, fontSize: 10 }} numberOfLines={1}>{sub}</Text> : null}
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
 * Kompakt Hovedside: bilde, KPI, periodesøyle, diagram, økonomi + avtale.
 */
export default function ProjectOverviewTab({
  state,
  project,
  cross,
  summary,
  members,
  timeEntries,
  colors,
  isAdmin,
  familyId,
  onChangeState,
  onOpenTab,
  onOpenCustomer,
  onOpenAgreement,
}) {
  const [uploading, setUploading] = useState(false);
  const expenses = useMemo(
    () => expenseSummaryForProject(state.expenses, project.id),
    [state.expenses, project.id],
  );
  const sales = useMemo(
    () => salesSummaryForProject(state.sales, project.id),
    [state.sales, project.id],
  );
  const chart = useMemo(() => hoursChartForOverview(timeEntries), [timeEntries]);
  const period = useMemo(
    () => projectPeriodProgress(project.start, project.end),
    [project.start, project.end],
  );
  const teamRows = useMemo(() => memberHoursMap(timeEntries, members).slice(0, 3), [timeEntries, members]);
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
  const hasAgreement = !!cross?.contract;

  async function uploadCover() {
    if (!isAdmin || !familyId || uploading) return;
    try {
      const picked = await pickImage({ edit: true, aspect: [16, 9] });
      if (!picked) return;
      setUploading(true);
      const path = `families/${familyId}/projects/${project.id}/cover_${Date.now()}.jpg`;
      const url = await uploadImage(path, picked);
      const result = updateProject(state, project.id, { imageUrl: url });
      if (!result.ok) throw new Error(result.error || 'Kunne ikke lagre bildet.');
      onChangeState(result.state);
      showSaveToast('Prosjektbildet er lagret.');
    } catch (err) {
      alertPhotoError(err);
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={styles.wrap} nativeID="project-overview">
      <View style={styles.heroRow}>
        <TouchableOpacity
          onPress={uploadCover}
          disabled={!isAdmin || uploading}
          style={[styles.cover, { backgroundColor: colors.sunken || colors.line, borderColor: colors.line }]}
          accessibilityRole="button"
          accessibilityLabel="Last opp prosjektbilde"
          nativeID="project-cover-upload"
        >
          {project.imageUrl ? (
            <Image source={{ uri: project.imageUrl }} style={styles.coverImg} />
          ) : (
            <View style={styles.coverEmpty}>
              {uploading ? (
                <ActivityIndicator color={colors.brand} />
              ) : (
                <>
                  <Ionicons name="image-outline" size={22} color={colors.muted} />
                  <Text style={{ color: colors.muted, fontSize: 11 }}>
                    {isAdmin ? 'Last opp bilde' : 'Ingen bilde'}
                  </Text>
                </>
              )}
            </View>
          )}
          {project.imageUrl && isAdmin ? (
            <View style={styles.coverHint}>
              <Ionicons name="camera" size={12} color="#fff" />
            </View>
          ) : null}
        </TouchableOpacity>

        <View style={styles.heroMeta}>
          <View style={[styles.badge, { backgroundColor: '#dcfce7', borderColor: '#86efac' }]}>
            <View style={[styles.dot, { backgroundColor: '#16a34a' }]} />
            <Text style={{ color: '#166534', fontWeight: '600', fontSize: 11 }}>{kpis.status}</Text>
          </View>
          <Text style={{ color: colors.muted, fontSize: 11 }} numberOfLines={2}>
            {billing.sourceLabel} · kredittid {billing.effective.creditDays} d.
          </Text>
          <TouchableOpacity onPress={() => onOpenTab?.('innstillinger')} style={styles.settingsLink}>
            <Ionicons name="settings-outline" size={14} color={colors.brand} />
            <Text style={{ color: colors.brand, fontWeight: '600', fontSize: 12 }}>Prosjektinnstillinger</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.kpiRow}>
        <KpiCard label="Omsetning" value={kpis.revenueLabel} sub="Eks. mva" colors={colors} />
        <KpiCard label="Fakturert" value={kpis.invoicedLabel} sub={`${kpis.invoicedPct}%`} progress={kpis.invoicedPct} colors={colors} />
        <KpiCard label="Gjenstående" value={kpis.remainingLabel} colors={colors} />
        <KpiCard
          label="Timeforbruk"
          value={`${formatHours(kpis.hours)} t`}
          sub={kpis.estimatedHours ? `av ${formatHours(kpis.estimatedHours)} t` : undefined}
          progress={kpis.hoursPct || undefined}
          colors={colors}
        />
        <KpiCard label="Deltakere" value={`${kpis.memberCount}`} sub="aktive" colors={colors}>
          <View style={styles.avatarStack}>
            {members.slice(0, 4).map((row) => (
              row.photoUrl ? (
                <Image key={row.id} source={{ uri: row.photoUrl }} style={styles.miniAvatar} />
              ) : (
                <View key={row.id} style={[styles.miniAvatar, { backgroundColor: `${colors.brand}22`, alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="person" size={9} color={colors.brand} />
                </View>
              )
            ))}
          </View>
        </KpiCard>
        <KpiCard
          label="Status"
          value={kpis.status}
          sub={`${formatDate(project.start) || 'Start tom'} – ${formatDate(project.end) || 'Slutt tom'}`}
          colors={colors}
        />
      </View>

      <View style={styles.midRow}>
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line, flex: 1.6 }]}>
          <Text style={[styles.panelTitle, { color: colors.ink }]}>Prosjektperiode</Text>
          {period.ready ? (
            <View style={styles.timeline}>
              <Text style={{ color: colors.muted, fontSize: 11 }}>{formatDate(period.start)}</Text>
              <View style={[styles.timelineTrack, { backgroundColor: colors.sunken || colors.line }]}>
                <View style={[styles.timelineFill, { backgroundColor: colors.brand, width: `${period.pct}%` }]} />
                <View style={[styles.todayMark, { backgroundColor: colors.brand, left: `${period.pct}%` }]} />
              </View>
              <Text style={{ color: colors.muted, fontSize: 11 }}>{formatDate(period.end)}</Text>
            </View>
          ) : (
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {period.start || period.end
                ? `Mangler ${!period.start ? 'startdato' : 'sluttdato'}. Sett datoene under Prosjektinnstillinger.`
                : 'Start- og sluttdato er ikke satt.'}
            </Text>
          )}
        </View>
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line, flex: 1 }]}>
          <Text style={[styles.panelTitle, { color: colors.ink }]}>Beliggenhet</Text>
          <View style={styles.locRow}>
            <Ionicons name="location-outline" size={16} color={colors.brand} />
            <Text style={{ color: colors.ink, flex: 1, fontSize: 12 }} numberOfLines={2}>
              {address || 'Ingen adresse (sett under innstillinger)'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.midRow}>
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line, flex: 1.5 }]}>
          <Text style={[styles.panelTitle, { color: colors.ink }]}>
            Timeforbruk {chart.titleYear}
            {chart.fallback ? ' (foregående år)' : ''}
          </Text>
          <View style={styles.chart}>
            {chart.bars.map((bar) => (
              <View key={bar.key} style={styles.barCol}>
                <View style={[styles.barTrack, { backgroundColor: colors.sunken || colors.line }]}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        height: bar.hours > 0 ? `${Math.max(6, bar.pct)}%` : '2%',
                        backgroundColor: bar.hours > 0 ? colors.brand : colors.line,
                      },
                    ]}
                  />
                </View>
                <Text style={{ color: colors.muted, fontSize: 8 }} numberOfLines={1}>{bar.label.split(' ')[0]}</Text>
              </View>
            ))}
          </View>
          {!chart.total ? (
            <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>Ingen timeføringer i perioden.</Text>
          ) : null}
        </View>

        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line, flex: 0.85, minWidth: 140 }]}>
          <Text style={[styles.panelTitle, { color: colors.ink }]}>Prosjektøkonomi</Text>
          <Row label="Inntekter" value={formatMoney(income)} colors={colors} />
          <Row label="Kostnader" value={formatMoney(cost)} colors={colors} />
          <Row label="Profitt" value={formatMoney(profit)} colors={colors} />
          <View style={[styles.marginBox, { backgroundColor: '#dcfce7' }]}>
            <Text style={{ color: '#166534', fontWeight: '700', fontSize: 12 }}>Margin {margin}%</Text>
          </View>
        </View>

        <View
          style={[
            styles.panel,
            {
              backgroundColor: colors.card,
              borderColor: hasAgreement ? colors.line : (colors.danger || '#b42318'),
              flex: 1,
              minWidth: 160,
            },
          ]}
          nativeID="project-overview-agreement"
        >
          <View style={styles.panelHead}>
            <Text style={[styles.panelTitle, { color: colors.ink, marginBottom: 0 }]}>Avtale</Text>
            {!hasAgreement ? (
              <Ionicons name="warning" size={18} color={colors.danger || '#b45309'} />
            ) : null}
          </View>
          {hasAgreement ? (
            <>
              <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }} numberOfLines={2}>
                {cross.contract.title}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }} numberOfLines={1}>
                {project.client || 'Kunde'} · {project.manager ? `PL ${project.manager}` : '—'}
              </Text>
              <TouchableOpacity
                onPress={() => onOpenAgreement?.(cross.contract.id)}
                style={[styles.agreeBtn, { backgroundColor: colors.brand }]}
                accessibilityRole="button"
                accessibilityLabel="Åpne avtale"
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Åpne avtale</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={{ color: colors.danger || '#b45309', fontWeight: '600', fontSize: 12 }}>
                Ingen avtale er koblet
              </Text>
              <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>
                Prosjektet mangler oppdragsavtale. Koble avtale under Prosjektinnstillinger eller via kontrakter.
              </Text>
              <TouchableOpacity
                onPress={() => onOpenTab?.('innstillinger')}
                style={[styles.agreeBtn, { backgroundColor: colors.sunken || colors.line }]}
              >
                <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 12 }}>Til innstillinger</Text>
              </TouchableOpacity>
            </>
          )}
          {project.customerId ? (
            <TouchableOpacity onPress={() => onOpenCustomer?.(project.customerId)} style={{ marginTop: 6 }}>
              <Text style={{ color: colors.brand, fontSize: 12, fontWeight: '600' }}>Åpne kunde</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.midRow}>
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line, flex: 1 }]}>
          <View style={styles.panelHead}>
            <Text style={[styles.panelTitle, { color: colors.ink, marginBottom: 0 }]}>Team ({members.length})</Text>
            <TouchableOpacity onPress={() => onOpenTab?.('team')}>
              <Text style={{ color: colors.brand, fontWeight: '600', fontSize: 12 }}>Se alle</Text>
            </TouchableOpacity>
          </View>
          {teamRows.map((row) => (
            <View key={row.id} style={styles.teamLine}>
              <Text style={{ color: colors.ink, flex: 1, fontSize: 12 }} numberOfLines={1}>
                {row.employeeName} · {row.role}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 11 }}>{formatHours(row.hours)} t</Text>
            </View>
          ))}
          {!teamRows.length ? <Text style={{ color: colors.muted, fontSize: 12 }}>Ingen deltakere.</Text> : null}
        </View>
      </View>

      <View style={styles.footerCards}>
        <QuickCard
          colors={colors}
          title="Prosjektutlegg"
          lines={[`${expenses.count} utlegg · ${formatMoney(expenses.total)}`, `Ikke fakturert: ${formatMoney(expenses.unbilled)}`]}
          onPress={() => onOpenTab?.('utlegg')}
        />
        <QuickCard
          colors={colors}
          title="Produktsalg"
          lines={[`${sales.count} · ${formatMoney(sales.total)}`, `Margin: ${sales.margin}%`]}
          onPress={() => onOpenTab?.('produktsalg')}
        />
      </View>
    </View>
  );
}

function Row({ label, value, colors }) {
  return (
    <View style={styles.ecoRow}>
      <Text style={{ color: colors.muted, fontSize: 11 }}>{label}</Text>
      <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 11 }}>{value}</Text>
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
        <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 13, marginBottom: 2 }}>{title}</Text>
        {lines.map((line) => (
          <Text key={line} style={{ color: colors.muted, fontSize: 11 }} numberOfLines={1}>{line}</Text>
        ))}
      </View>
      <Ionicons name="arrow-forward" size={16} color={colors.brand} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  heroRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  cover: {
    width: 140,
    minHeight: 72,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  coverImg: { width: '100%', height: '100%', minHeight: 72 },
  coverEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 8 },
  coverHint: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    backgroundColor: 'rgba(15,23,42,0.55)',
    borderRadius: 12,
    padding: 4,
  },
  heroMeta: { flex: 1, gap: 6, justifyContent: 'center' },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  settingsLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  kpiCard: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 110,
    flexGrow: 1,
    flexBasis: 110,
    gap: 1,
  },
  progressTrack: { height: 3, borderRadius: 2, marginTop: 3, overflow: 'hidden' },
  progressFill: { height: 3 },
  avatarStack: { flexDirection: 'row', marginTop: 2 },
  miniAvatar: { width: 16, height: 16, borderRadius: 8, marginRight: -4, borderWidth: 1, borderColor: '#fff' },
  midRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  panel: { borderWidth: 1, borderRadius: 10, padding: 10, minWidth: 160, flexGrow: 1 },
  panelTitle: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  panelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  timeline: { gap: 4 },
  timelineTrack: { height: 10, borderRadius: 5, position: 'relative', overflow: 'visible' },
  timelineFill: { height: 10, borderRadius: 5 },
  todayMark: {
    position: 'absolute',
    top: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -7,
  },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 72 },
  barCol: { flex: 1, alignItems: 'center', gap: 2, height: '100%', justifyContent: 'flex-end' },
  barTrack: { flex: 1, width: '70%', borderRadius: 2, justifyContent: 'flex-end', overflow: 'hidden', minHeight: 24 },
  barFill: { width: '100%', borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  ecoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  marginBox: { marginTop: 4, borderRadius: 6, paddingVertical: 4, alignItems: 'center' },
  agreeBtn: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, marginTop: 8 },
  teamLine: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3, gap: 6 },
  footerCards: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quick: {
    flexGrow: 1,
    flexBasis: 200,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
