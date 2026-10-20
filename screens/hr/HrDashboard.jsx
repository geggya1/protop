import React, { useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { displayName } from '../../src/employees/model';
import { splitPeopleEventsByKind } from '../../src/hr/directory';
import {
  caseFromExpiringContract,
  caseFromPeopleEvent,
  choiceLabel,
  countHrEmployees,
  expiringContracts,
  filterHrEmployees,
  followUpTaskFromCase,
  formatNbDate,
  JOB_STATUSES,
  openFollowUps,
  planFollowUpCases,
  recruitmentFunnel,
  upcomingPeopleEvents,
} from '../../src/hr/model';
import {
  COMPLIANCE_CATALOG,
  companyComplianceOverview,
} from '../../src/hr/compliance';
import { showSaveToast } from '../../src/ui/saveToast';
import {
  EmptyHint, HrButton, HrCard, HrChip, HrSectionTitle, HrStat, RowLink,
} from './HrShared';

export default function HrDashboard({
  colors, employees, hr, canWrite, onPatch,
  onOpenPeople, onOpenFollowUp, onOpenCase, onOpenRecruitment, onOpenProductivity, onOpenCompliance, onOpenContracts,
  familyId, assigneeUid, assigneeName, onCreateFollowUpTask,
}) {
  const [staffFilter, setStaffFilter] = useState('active');
  const counts = useMemo(() => countHrEmployees(employees), [employees]);
  const people = useMemo(
    () => filterHrEmployees(employees, staffFilter),
    [employees, staffFilter],
  );
  const events = useMemo(
    () => upcomingPeopleEvents(people, { withinDays: 90 }),
    [people],
  );
  const eventGroups = useMemo(() => {
    const split = splitPeopleEventsByKind(events, people);
    const inactive = staffFilter === 'inactive';
    return [
      {
        id: 'internal',
        title: inactive ? 'Deaktiverte ansatte' : 'Aktive ansatte',
        events: split.internal,
      },
      {
        id: 'external',
        title: inactive ? 'Eksternt deaktivert' : 'Eksternt aktiv',
        events: split.external,
      },
    ];
  }, [events, people, staffFilter]);
  const ending = useMemo(() => expiringContracts(hr.contracts, { withinDays: 90 }), [hr.contracts]);
  const follow = useMemo(() => openFollowUps(hr), [hr]);
  const funnel = useMemo(() => recruitmentFunnel(hr.applications), [hr.applications]);
  const complianceRows = useMemo(
    () => companyComplianceOverview(people, hr.compliance, {
      contracts: hr.contracts,
      reviews: hr.reviews,
      applyEvidence: true,
    }),
    [people, hr.compliance, hr.contracts, hr.reviews],
  );
  const complianceGap = complianceRows.reduce((sum, row) => sum + row.missing, 0);
  const worstGaps = complianceRows.filter((row) => row.missing > 0).slice(0, 5);

  const received = funnel.board?.find((b) => b.id === 'received')?.count || 0;
  const processing = funnel.board?.find((b) => b.id === 'processing')?.count || 0;

  const planningRef = useRef(false);

  async function planRow(row, plainToast) {
    if (!canWrite || !onPatch || !row || planningRef.current) return;
    planningRef.current = true;
    try {
      let snapshot = null;
      onPatch((state) => {
        snapshot = planFollowUpCases(state.cases, row, {});
        if (!snapshot.created) return {};
        return { cases: snapshot.cases };
      });
      const target = snapshot?.case;
      if (!target) return;
      if (target.taskId) {
        showSaveToast?.('Sak finnes allerede');
        onOpenCase?.(target);
        return;
      }
      let taskId = '';
      if (familyId && assigneeUid && onCreateFollowUpTask) {
        const draft = followUpTaskFromCase(target, { assigneeUid, assigneeName });
        if (draft) {
          try {
            taskId = await onCreateFollowUpTask(draft) || '';
          } catch {
            showSaveToast?.(snapshot.created
              ? `${plainToast}. Oppgaven ble ikke lagret`
              : 'Kunne ikke opprette oppgave');
            return;
          }
        }
      }
      if (!taskId) {
        showSaveToast?.(snapshot.created ? plainToast : 'Sak finnes allerede');
        if (!snapshot.created) onOpenCase?.(target);
        return;
      }
      onPatch((state) => ({
        cases: planFollowUpCases(state.cases, target, {
          taskId,
          assigneeUid,
          assigneeName,
        }).cases,
      }));
      showSaveToast?.(snapshot.created
        ? 'Sak og oppgave opprettet'
        : 'Oppgave opprettet og koblet til saken');
    } finally {
      planningRef.current = false;
    }
  }

  function planEvent(event) {
    const row = caseFromPeopleEvent(event);
    planRow(row, 'Planleggingssak opprettet');
  }

  function planContract(contract) {
    const person = employees.find((e) => e.id === contract.employeeId);
    const row = caseFromExpiringContract(contract, {
      employeeName: person ? displayName(person) : '',
    });
    planRow(row, 'Oppfølgingssak for avtale opprettet');
  }

  return (
    <View style={styles.page} nativeID="hr-dashboard">
      <View style={styles.chips}>
        <HrChip
          colors={colors}
          label={`Aktive · ${counts.active}`}
          active={staffFilter === 'active'}
          onPress={() => setStaffFilter('active')}
        />
        <HrChip
          colors={colors}
          label={`Deaktiverte · ${counts.inactive}`}
          active={staffFilter === 'inactive'}
          onPress={() => setStaffFilter('inactive')}
        />
      </View>
      <View style={styles.statRow}>
        <HrStat
          colors={colors}
          label={staffFilter === 'inactive' ? 'Deaktiverte' : 'Aktive'}
          value={String(staffFilter === 'inactive' ? counts.inactive : counts.active)}
          hint="personell"
        />
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
        ) : eventGroups.map((group) => (
          <EventGroup
            key={group.id}
            id={group.id}
            colors={colors}
            title={group.title}
            events={group.events}
            canWrite={canWrite}
            onOpen={onOpenPeople}
            onPlan={planEvent}
          />
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
        <HrSectionTitle colors={colors} title="Produktivitet" subtitle="Belegg og kapasitet ligger under Produktivitet i bedriftsmenyen" />
        <RowLink colors={colors} title="Åpne produktivitet" onPress={onOpenProductivity} />
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
          const who = person ? displayName(person) : 'Uten person';
          const taskBit = row.assigneeName
            ? `oppgave til ${row.assigneeName}`
            : (row.taskId ? 'oppgave opprettet' : '');
          return (
            <RowLink
              key={row.id}
              nativeID={`hr-case-${row.id}`}
              colors={colors}
              title={row.title}
              subtitle={taskBit ? `${who} · ${taskBit}` : who}
              meta={row.dueDate ? formatNbDate(row.dueDate) : row.priority}
              onPress={() => (onOpenCase ? onOpenCase(row) : onOpenFollowUp?.())}
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

const EVENT_LIMIT = 10;

function EventGroup({
  id, colors, title, events, canWrite, onOpen, onPlan,
}) {
  if (!events.length) return null;
  const shown = events.slice(0, EVENT_LIMIT);
  const more = events.length > shown.length ? `${shown.length} av ${events.length}` : '';
  return (
    <View style={styles.group}>
      <View style={styles.groupHead}>
        <Text style={[styles.groupTitle, { color: colors.ink }]}>{title}</Text>
        {more ? <Text style={[styles.groupCount, { color: colors.muted }]}>{more}</Text> : null}
      </View>
      <View style={styles.grid} nativeID={`hr-event-grid-${id}`}>
        {shown.map((event) => (
          <EventTile
            key={`${event.type}-${event.employeeId}-${event.date}`}
            colors={colors}
            event={event}
            canWrite={canWrite}
            onOpen={onOpen}
            onPlan={onPlan}
          />
        ))}
      </View>
    </View>
  );
}

function EventTile({
  colors, event, canWrite, onOpen, onPlan,
}) {
  const days = event.days === 0 ? 'I dag' : `${event.days} dager`;
  const icon = event.type === 'birthday' ? 'gift-outline' : 'ribbon-outline';
  return (
    <View style={[styles.tile, { borderColor: colors.line, backgroundColor: colors.bg }]}>
      <Pressable onPress={onOpen} style={styles.tileMain}>
        <Ionicons name={icon} size={16} color={colors.muted} />
        <View style={styles.tileText}>
          <Text numberOfLines={1} style={[styles.tileName, { color: colors.ink }]}>{event.name}</Text>
          <Text numberOfLines={1} style={[styles.tileSub, { color: colors.muted }]}>
            {`${event.label} · ${formatNbDate(event.date)}`}
          </Text>
        </View>
      </Pressable>
      <View style={styles.tileSide}>
        <Text style={[styles.tileDays, { color: colors.ink }]}>{days}</Text>
        {canWrite ? (
          <Pressable
            onPress={() => onPlan(event)}
            style={[styles.planBtn, { borderColor: colors.line, backgroundColor: colors.card }]}
          >
            <Ionicons name="flag-outline" size={14} color={colors.ink} />
            <Text style={[styles.planBtnText, { color: colors.ink }]}>Planlegg</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  group: { gap: 6 },
  groupHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  groupTitle: { fontSize: 13, fontWeight: '600' },
  groupCount: { fontSize: 12 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    ...(Platform.OS === 'web' ? {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))',
    } : null),
  },
  tile: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '48%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tileSide: { alignItems: 'flex-end', gap: 4 },
  tileMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tileText: { flex: 1, minWidth: 0 },
  tileName: { fontSize: 14, fontWeight: '600' },
  tileSub: { fontSize: 13, lineHeight: 18 },
  tileDays: { fontSize: 12, fontWeight: '600' },
  planBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  planBtnText: { fontSize: 13, fontWeight: '600' },
});
