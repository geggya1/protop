import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { displayName } from '../../src/employees/model';
import {
  caseFromExpiringContract,
  caseFromPeopleEvent,
  choiceLabel,
  expiringContracts,
  formatNbDate,
  hasOpenCaseLike,
  JOB_STATUSES,
  openFollowUps,
  recruitmentFunnel,
  upcomingPeopleEvents,
} from '../../src/hr/model';
import {
  COMPLIANCE_CATALOG,
  companyComplianceOverview,
} from '../../src/hr/compliance';
import { companyProductivity } from '../../src/hr/productivity';
import { showSaveToast } from '../../src/ui/saveToast';
import {
  EmptyHint, HrButton, HrCard, HrSectionTitle, HrStat, RowLink, UtilizationBar,
} from './HrShared';

export default function HrDashboard({
  colors, employees, hr, entries, canWrite, onPatch,
  onOpenPeople, onOpenFollowUp, onOpenRecruitment, onOpenProductivity, onOpenCompliance, onOpenContracts,
}) {
  const events = useMemo(
    () => upcomingPeopleEvents(employees, { withinDays: 90 }),
    [employees],
  );
  const ending = useMemo(() => expiringContracts(hr.contracts, { withinDays: 90 }), [hr.contracts]);
  const follow = useMemo(() => openFollowUps(hr), [hr]);
  const funnel = useMemo(() => recruitmentFunnel(hr.applications), [hr.applications]);
  const productivity = useMemo(() => companyProductivity(entries), [entries]);
  const activePeople = (employees || []).filter((row) => row?.company?.status !== 'deleted').length;

  const complianceRows = useMemo(
    () => companyComplianceOverview(employees, hr.compliance, {
      contracts: hr.contracts,
      reviews: hr.reviews,
      applyEvidence: true,
    }),
    [employees, hr.compliance, hr.contracts, hr.reviews],
  );
  const complianceGap = complianceRows.reduce((sum, row) => sum + row.missing, 0);
  const worstGaps = complianceRows.filter((row) => row.missing > 0).slice(0, 5);

  const received = funnel.board?.find((b) => b.id === 'received')?.count || 0;
  const processing = funnel.board?.find((b) => b.id === 'processing')?.count || 0;

  function planEvent(event) {
    if (!canWrite || !onPatch) return;
    const row = caseFromPeopleEvent(event);
    if (!row) return;
    let created = false;
    onPatch((state) => {
      if (hasOpenCaseLike(state.cases, row)) return {};
      created = true;
      return { cases: [row, ...(state.cases || [])] };
    });
    if (created) showSaveToast?.('Planleggingssak opprettet');
    else {
      showSaveToast?.('Sak finnes allerede');
      onOpenFollowUp?.();
    }
  }

  function planContract(contract) {
    if (!canWrite || !onPatch) return;
    const person = employees.find((e) => e.id === contract.employeeId);
    const row = caseFromExpiringContract(contract, {
      employeeName: person ? displayName(person) : '',
    });
    if (!row) return;
    let created = false;
    onPatch((state) => {
      if (hasOpenCaseLike(state.cases, row)) return {};
      created = true;
      return { cases: [row, ...(state.cases || [])] };
    });
    if (created) showSaveToast?.('Oppfølgingssak for avtale opprettet');
    else {
      showSaveToast?.('Sak finnes allerede');
      onOpenFollowUp?.();
    }
  }

  return (
    <View style={styles.page} nativeID="hr-dashboard">
      <View style={styles.statRow}>
        <HrStat colors={colors} label="Aktive" value={String(activePeople)} hint="personell" />
        <HrStat colors={colors} label="Åpne saker" value={String(follow.cases.length)} hint="oppfølging" />
        <HrStat colors={colors} label="Søknadskø" value={String(received + processing)} hint={`${received} nye · ${processing} i behandling`} />
        <HrStat colors={colors} label="Compliance" value={String(complianceGap)} hint="mangler lov/ISO" />
      </View>

      <HrCard colors={colors}>
        <HrSectionTitle
          colors={colors}
          title="Go-to dashboard"
          subtitle="Nedtelling til jubileum og bursdag — planlegg med ett trykk"
        />
        {events.length === 0 ? (
          <EmptyHint colors={colors} text="Ingen bursdager eller jubileum de neste 90 dagene." />
        ) : events.slice(0, 10).map((event) => (
          <View key={`${event.type}-${event.employeeId}-${event.date}`} style={styles.actionRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <RowLink
                colors={colors}
                title={event.name}
                subtitle={`${event.label} · ${formatNbDate(event.date)}`}
                meta={event.days === 0 ? 'I dag' : `${event.days} dager`}
                icon={event.type === 'birthday' ? 'gift-outline' : 'ribbon-outline'}
                onPress={onOpenPeople}
              />
            </View>
            {canWrite ? (
              <HrButton
                colors={colors}
                label="Planlegg"
                icon="flag-outline"
                onPress={() => planEvent(event)}
              />
            ) : null}
          </View>
        ))}
        {ending.length ? (
          <>
            <Text style={[styles.meta, { color: colors.muted, marginTop: 8 }]}>Kontrakter som snart utløper</Text>
            {ending.slice(0, 6).map((row) => {
              const person = employees.find((e) => e.id === row.employeeId);
              return (
                <View key={row.id} style={styles.actionRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <RowLink
                      colors={colors}
                      title={person ? displayName(person) : row.title}
                      subtitle={row.title}
                      meta={row.days != null ? `${row.days} dager` : formatNbDate(row.endDate)}
                      icon="alert-circle-outline"
                      onPress={onOpenContracts}
                    />
                  </View>
                  {canWrite ? (
                    <HrButton
                      colors={colors}
                      label="Følg opp"
                      icon="flag-outline"
                      onPress={() => planContract(row)}
                    />
                  ) : null}
                </View>
              );
            })}
          </>
        ) : null}
      </HrCard>

      <HrCard colors={colors}>
        <HrSectionTitle colors={colors} title="Produktivitet" subtitle="Utfakturerbart mot total tid" />
        <UtilizationBar
          colors={colors}
          billablePct={productivity.utilizationPct}
          targetPct={productivity.targetPct}
          band={productivity.band}
        />
        <Text style={[styles.meta, { color: colors.muted }]}>
          {`${productivity.billable} t fakturerbart · ${productivity.nonBillable} t ikke-fakturerbart`}
        </Text>
        <RowLink colors={colors} title="Se produktivitet per person" onPress={onOpenProductivity} />
      </HrCard>

      <HrCard colors={colors}>
        <HrSectionTitle colors={colors} title="Oppfølging" subtitle="Saker, oppgaver og planlagte samtaler" />
        <View style={styles.statRow}>
          <HrStat colors={colors} label="Saker" value={String(follow.cases.length)} />
          <HrStat colors={colors} label="Oppgaver" value={String(follow.tasks.length)} />
          <HrStat colors={colors} label="Samtaler" value={String(follow.reviews.length)} />
        </View>
        {follow.cases.slice(0, 4).map((row) => {
          const person = employees.find((e) => e.id === row.employeeId);
          return (
            <RowLink
              key={row.id}
              colors={colors}
              title={row.title}
              subtitle={person ? displayName(person) : 'Uten person'}
              meta={row.dueDate ? formatNbDate(row.dueDate) : row.priority}
              onPress={onOpenFollowUp}
            />
          );
        })}
        <RowLink colors={colors} title="Åpne oppfølging" onPress={onOpenFollowUp} />
      </HrCard>

      <HrCard colors={colors}>
        <HrSectionTitle colors={colors} title="Rekruttering" subtitle="Tre steg: mottatt → behandling → ferdig" />
        <View style={styles.funnel}>
          {(funnel.board || []).map((stage) => (
            <View key={stage.id} style={[styles.funnelCell, { borderColor: colors.line, backgroundColor: colors.bg }]}>
              <Text style={[styles.funnelCount, { color: colors.ink }]}>{stage.count}</Text>
              <Text style={[styles.funnelLabel, { color: colors.muted }]}>{stage.label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.funnel}>
          {(funnel.outcomes || []).map((o) => (
            <View key={o.id} style={[styles.funnelCell, { borderColor: colors.line, backgroundColor: colors.bg }]}>
              <Text style={[styles.funnelCount, { color: colors.ink }]}>{o.count}</Text>
              <Text style={[styles.funnelLabel, { color: colors.muted }]}>{o.label}</Text>
            </View>
          ))}
        </View>
        {(hr.jobs || []).slice(0, 3).map((job) => (
          <RowLink
            key={job.id}
            colors={colors}
            title={job.title}
            subtitle={[job.department, job.location].filter(Boolean).join(' · ') || 'Stilling'}
            meta={choiceLabel(JOB_STATUSES, job.status)}
            onPress={onOpenRecruitment}
          />
        ))}
        <RowLink colors={colors} title="Åpne rekruttering" onPress={onOpenRecruitment} />
      </HrCard>

      <HrCard colors={colors}>
        <HrSectionTitle
          colors={colors}
          title="Lov & ISO — gap"
          subtitle={`${COMPLIANCE_CATALOG.length} sjekkpunkter · ${complianceGap} mangler på tvers`}
        />
        {worstGaps.length === 0 ? (
          <EmptyHint colors={colors} text="Ingen påkrevde mangler registrert." />
        ) : worstGaps.map((row) => {
          const person = employees.find((e) => e.id === row.employeeId);
          return (
            <RowLink
              key={row.employeeId}
              colors={colors}
              title={person ? displayName(person) : row.employeeId}
              subtitle={row.gaps.slice(0, 3).join(' · ') || 'Mangler'}
              meta={`${row.pct} %`}
              onPress={onOpenCompliance}
            />
          );
        })}
        <RowLink colors={colors} title="Følg opp compliance per ansatt" onPress={onOpenCompliance} />
      </HrCard>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 14 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  meta: { fontSize: 13, lineHeight: 18 },
  funnel: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  funnelCell: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 96,
  },
  funnelCount: { fontSize: 18, fontWeight: '700' },
  funnelLabel: { fontSize: 11, marginTop: 2 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
