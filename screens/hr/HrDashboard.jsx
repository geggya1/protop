import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { displayName } from '../../src/employees/model';
import {
  choiceLabel,
  formatNbDate,
  JOB_STATUSES,
  openFollowUps,
  recruitmentFunnel,
  upcomingPeopleEvents,
} from '../../src/hr/model';
import { companyProductivity } from '../../src/hr/productivity';
import {
  EmptyHint, HrCard, HrSectionTitle, HrStat, RowLink, UtilizationBar,
} from './HrShared';

export default function HrDashboard({
  colors, employees, hr, entries, onOpenPeople, onOpenFollowUp, onOpenRecruitment, onOpenProductivity,
}) {
  const events = useMemo(
    () => upcomingPeopleEvents(employees, { withinDays: 45 }),
    [employees],
  );
  const follow = useMemo(() => openFollowUps(hr), [hr]);
  const funnel = useMemo(() => recruitmentFunnel(hr.applications), [hr.applications]);
  const productivity = useMemo(() => companyProductivity(entries), [entries]);
  const openJobs = (hr.jobs || []).filter((job) => job.status === 'open').length;
  const activePeople = (employees || []).filter((row) => row?.company?.status !== 'deleted').length;

  return (
    <View style={styles.page}>
      <View style={styles.statRow}>
        <HrStat colors={colors} label="Aktive" value={String(activePeople)} hint="i personaloversikt" />
        <HrStat colors={colors} label="Åpne saker" value={String(follow.cases.length)} hint="til oppfølging" />
        <HrStat colors={colors} label="Stillinger" value={String(openJobs)} hint="åpne annonser" />
        <HrStat
          colors={colors}
          label="Utnyttelse"
          value={`${productivity.utilizationPct.toFixed(0)} %`}
          hint={`${productivity.billable}t fakturerbart`}
        />
      </View>

      <HrCard colors={colors}>
        <HrSectionTitle
          colors={colors}
          title="Kommende"
          subtitle="Bursdager og jubileum de neste 45 dagene"
        />
        {events.length === 0 ? (
          <EmptyHint colors={colors} text="Ingen bursdager eller jubileum i perioden." />
        ) : events.slice(0, 8).map((event) => (
          <RowLink
            key={`${event.type}-${event.employeeId}-${event.date}`}
            colors={colors}
            title={event.name}
            subtitle={event.label}
            meta={formatNbDate(event.date)}
            icon={event.type === 'birthday' ? 'gift-outline' : 'ribbon-outline'}
            onPress={onOpenPeople}
          />
        ))}
      </HrCard>

      <HrCard colors={colors}>
        <HrSectionTitle
          colors={colors}
          title="Produktivitet"
          subtitle="Utfakturerbare timer mot total tid i valgt periode"
        />
        <UtilizationBar
          colors={colors}
          billablePct={productivity.utilizationPct}
          targetPct={productivity.targetPct}
          band={productivity.band}
        />
        <Text style={[styles.meta, { color: colors.muted }]}>
          {`${productivity.billable} t fakturerbart · ${productivity.nonBillable} t ikke-fakturerbart · ${productivity.total} t totalt`}
        </Text>
        <RowLink
          colors={colors}
          title="Se produktivitet per person"
          onPress={onOpenProductivity}
        />
      </HrCard>

      <HrCard colors={colors}>
        <HrSectionTitle
          colors={colors}
          title="Oppfølging"
          subtitle="Saker, oppgaver og planlagte medarbeidersamtaler"
        />
        <View style={styles.statRow}>
          <HrStat colors={colors} label="Saker" value={String(follow.cases.length)} />
          <HrStat colors={colors} label="Oppgaver" value={String(follow.tasks.length)} />
          <HrStat colors={colors} label="Samtaler" value={String(follow.reviews.length)} />
        </View>
        {follow.cases.slice(0, 3).map((row) => {
          const person = employees.find((e) => e.id === row.employeeId);
          return (
            <RowLink
              key={row.id}
              colors={colors}
              title={row.title}
              subtitle={person ? displayName(person) : 'Uten person'}
              meta={row.priority}
              onPress={onOpenFollowUp}
            />
          );
        })}
        {follow.cases.length === 0 && follow.tasks.length === 0 ? (
          <EmptyHint colors={colors} text="Ingen åpne oppfølginger akkurat nå." />
        ) : null}
      </HrCard>

      <HrCard colors={colors}>
        <HrSectionTitle
          colors={colors}
          title="Rekruttering"
          subtitle="Pipeline for søknader"
        />
        <View style={styles.funnel}>
          {funnel.filter((s) => !['withdrawn'].includes(s.id)).map((stage) => (
            <View key={stage.id} style={[styles.funnelCell, { borderColor: colors.line, backgroundColor: colors.bg }]}>
              <Text style={[styles.funnelCount, { color: colors.ink }]}>{stage.count}</Text>
              <Text style={[styles.funnelLabel, { color: colors.muted }]}>{stage.label}</Text>
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
        {(hr.jobs || []).length === 0 ? (
          <EmptyHint colors={colors} text="Ingen stillingsannonser ennå. Opprett den første under Rekruttering." />
        ) : null}
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
    minWidth: 72,
  },
  funnelCount: { fontSize: 18, fontWeight: '700' },
  funnelLabel: { fontSize: 11, marginTop: 2 },
});
