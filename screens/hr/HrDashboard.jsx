import React, { useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { displayName } from '../../src/employees/model';
import {
  billableMonth, formatTimer, monthKeyOf, ownCompanyMatcher,
} from '../../src/hr/billable';
import { hrDashboard, staffKinMissing } from '../../src/hr/dashboard';
import {
  caseFromExpiringContract,
  caseFromPeopleEvent,
  choiceLabel,
  followUpTaskFromCase,
  formatNbDate,
  JOB_STATUSES,
  planFollowUpCases,
} from '../../src/hr/model';
import { showSaveToast } from '../../src/ui/saveToast';
import {
  ACCENT, Avatar, Bar, DashCard, IconDisc, KpiTile, MoreToggle, Pill, Ring, SectionLabel, Segmented,
  gridItem, gridStyle, tint,
} from './HrDashParts';
import {
  BillablePanel, CasesPanel, FollowRow, followRowProps,
} from './HrKpiPanels';
import { useBillableMonth } from './useBillableMonth';

const SHORT_LIST = 4;
const isWeb = Platform.OS === 'web';
// Panelet under et nøkkeltall fyller hele raden. «dense» lar flisene etter panelet fylle raden over.
const KPI_GRID = isWeb ? { gridAutoFlow: 'row dense' } : null;
const KPI_PANEL_CELL = isWeb ? { gridColumn: '1 / -1', minWidth: 0 } : null;

const MILESTONE_TYPES = {
  birthday: { label: 'Bursdager', icon: 'gift-outline', accent: ACCENT.rose },
  anniversary: { label: 'Jubileum', icon: 'ribbon-outline', accent: ACCENT.green },
  contract: { label: 'Avtaler som utløper', icon: 'document-text-outline', accent: ACCENT.amber },
};

function daysText(days) {
  if (days === 0) return 'I dag';
  if (days === 1) return 'I morgen';
  return `${days} dager`;
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/** «oktober hittil», «september» eller «desember 2025». */
function monthText(result) {
  const [name, year] = String(result.label || '').split(' ');
  const month = String(name || '').toLowerCase();
  if (result.current) return `${month} hittil`;
  return year && Number(year) !== new Date().getFullYear() ? `${month} ${year}` : month;
}

/** Saken «Planlegg» lager for raden. Samme tittel som planFollowUpCases ser etter. */
function milestoneCase(row, employeeName) {
  if (row.type === 'contract') return caseFromExpiringContract(row.contract, { employeeName });
  return caseFromPeopleEvent(row);
}

export default function HrDashboard({
  colors, employees, hr, canWrite, onPatch,
  onOpenPeople, onOpenEmployee, onOpenFollowUp, onOpenCase, onOpenRecruitment, onOpenProductivity,
  onOpenCompliance, onOpenContracts, onNewJob, onOpenJob,
  familyId, ownCompany, assigneeUid, assigneeName, onCreateFollowUpTask, kin = null,
}) {
  const [status, setStatus] = useState('active');
  const [panel, setPanel] = useState('');
  const todayMonth = monthKeyOf(new Date());
  const [month, setMonth] = useState(todayMonth);
  const dash = useMemo(
    () => hrDashboard(employees, hr, { status }),
    [employees, hr, status],
  );
  const nameOf = useMemo(() => {
    const map = new Map((employees || []).map((row) => [row.id, displayName(row)]));
    return (id) => map.get(id) || '';
  }, [employees]);
  const photoOf = useMemo(() => {
    const map = new Map((employees || []).map((row) => [row.id, row?.person?.photoUrl || '']));
    return (id) => map.get(id) || '';
  }, [employees]);
  const inactive = status === 'inactive';
  const { counts } = dash;
  const externalTotal = counts.external.active + counts.external.inactive;

  const monthData = useBillableMonth({ familyId, month });
  const isOwnCompany = useMemo(
    () => ownCompanyMatcher({ name: ownCompany?.name, orgnr: ownCompany?.orgnr, projects: monthData.projects }),
    [ownCompany?.name, ownCompany?.orgnr, monthData.projects],
  );
  const billable = useMemo(() => billableMonth({
    staff: dash.staff,
    entries: monthData.entries,
    absences: monthData.absences,
    month,
    redDays: monthData.redDays,
    fullDayHours: monthData.fullDayHours,
    absenceTypes: monthData.absenceTypes,
    isOwnCompany,
  }), [
    dash.staff, monthData.entries, monthData.absences, month, monthData.redDays,
    monthData.fullDayHours, monthData.absenceTypes, isOwnCompany,
  ]);

  // Personell åpnes med samme utvalg som tallet: egne ansatte, aktive eller deaktiverte.
  const openStaffList = () => onOpenPeople?.({ kind: 'internal', status });
  const openPerson = (id, sheet) => {
    if (id && onOpenEmployee) onOpenEmployee(id, sheet);
    else openStaffList();
  };
  const togglePanel = (id) => setPanel((current) => (current === id ? '' : id));

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

  function planMilestone(row) {
    if (row.type === 'contract') {
      planRow(
        caseFromExpiringContract(row.contract, { employeeName: nameOf(row.employeeId) }),
        'Oppfølgingssak for avtale opprettet',
      );
      return;
    }
    planRow(caseFromPeopleEvent(row), 'Planleggingssak opprettet');
  }

  const follow = dash.follow;
  const plannedCases = useMemo(() => {
    const open = new Map(follow.cases.map((row) => [`${row.employeeId}|${String(row.title).trim().toLowerCase()}`, row]));
    const map = new Map();
    for (const row of dash.milestones) {
      const draft = milestoneCase(row, nameOf(row.employeeId));
      const hit = draft && open.get(`${draft.employeeId}|${String(draft.title).trim().toLowerCase()}`);
      if (hit) map.set(row.key, hit);
    }
    return map;
  }, [follow.cases, dash.milestones, nameOf]);

  let billableValue = '–';
  let billableHint = `Ingen mulig tid · ${monthText(billable)}`;
  if (monthData.loading) {
    billableValue = '…';
    billableHint = 'Henter timer …';
  } else if (billable.capacity > 0) {
    billableValue = formatTimer(billable.billable);
    billableHint = `av ${formatTimer(billable.capacity)} mulig · ${monthText(billable)}`;
  }

  const kpis = [
    {
      id: 'staff',
      tile: (
        <KpiTile
          colors={colors}
          nativeID="hr-kpi-staff"
          icon="people-outline"
          accent={ACCENT.blue}
          label={inactive ? 'Deaktiverte ansatte' : 'Egne ansatte'}
          value={String(dash.staff.length)}
          badge={!inactive && dash.newHires ? `+${dash.newHires} nye` : ''}
          badgeAccent={ACCENT.green}
          hint={inactive ? 'Sluttet eller deaktivert' : 'Uten eksterne og innleide'}
          onPress={openStaffList}
        />
      ),
    },
    {
      id: 'cases',
      tile: (
        <KpiTile
          colors={colors}
          nativeID="hr-kpi-cases"
          icon="document-text-outline"
          accent={ACCENT.violet}
          label="Åpne HR-saker"
          value={String(follow.cases.length)}
          badge={dash.overdue ? `${dash.overdue} forfalt` : ''}
          badgeAccent={ACCENT.amber}
          hint={`${plural(follow.tasks.length, 'oppgave', 'oppgaver')} · ${plural(follow.reviews.length, 'samtale', 'samtaler')}`}
          expanded={panel === 'cases'}
          onPress={() => togglePanel('cases')}
        />
      ),
      panel: (
        <CasesPanel
          colors={colors}
          follow={follow}
          nameOf={nameOf}
          onOpenCase={onOpenCase}
          onOpenPerson={openPerson}
          onOpenFollowUp={onOpenFollowUp}
          onClose={() => setPanel('')}
        />
      ),
    },
    {
      id: 'applications',
      tile: (
        <KpiTile
          colors={colors}
          nativeID="hr-kpi-applications"
          icon="mail-unread-outline"
          accent={ACCENT.teal}
          label="Søknader i kø"
          value={String(dash.recruitment.queue)}
          badge={dash.recruitment.received ? `${dash.recruitment.received} nye` : ''}
          hint={`${dash.recruitment.processing} til behandling`}
          onPress={onOpenRecruitment}
        />
      ),
    },
    {
      id: 'billable',
      tile: (
        <KpiTile
          colors={colors}
          nativeID="hr-kpi-productivity"
          accent={ACCENT.green}
          label="Fakturerbar tid"
          value={billableValue}
          ringPct={monthData.loading ? 0 : (billable.pct || 0)}
          hint={billableHint}
          expanded={panel === 'billable'}
          onPress={() => togglePanel('billable')}
        />
      ),
      panel: (
        <BillablePanel
          colors={colors}
          result={billable}
          loading={monthData.loading}
          month={month}
          todayMonth={todayMonth}
          onMonth={setMonth}
          onOpenPerson={(id) => openPerson(id)}
          onOpenProductivity={onOpenProductivity}
          onClose={() => setPanel('')}
        />
      ),
    },
  ];
  const openPanel = kpis.find((kpi) => kpi.id === panel)?.panel || null;

  return (
    <View style={styles.page} nativeID="hr-dashboard">
      <SectionLabel
        colors={colors}
        icon="people-outline"
        title="Egne ansatte"
        hint={inactive ? 'Deaktiverte' : 'HR-oppfølging'}
        right={(
          <Segmented
            colors={colors}
            nativeID="hr-status"
            value={status}
            onChange={setStatus}
            options={[
              { id: 'active', label: 'Aktive', count: counts.staff.active },
              { id: 'inactive', label: 'Deaktiverte', count: counts.staff.inactive },
            ]}
          />
        )}
      />

      <View style={[gridStyle(4, 165, 12), KPI_GRID]} nativeID="hr-kpis">
        {kpis.map((kpi) => (
          <React.Fragment key={kpi.id}>
            <View style={gridItem(165)}>{kpi.tile}</View>
            {isWeb && panel === kpi.id && kpi.panel ? <View style={KPI_PANEL_CELL}>{kpi.panel}</View> : null}
          </React.Fragment>
        ))}
      </View>
      {!isWeb ? openPanel : null}

      <View style={gridStyle(3, 300, 16)} nativeID="hr-dash-staff">
        <View style={gridItem(300)}>
          <MilestonesCard
            colors={colors}
            rows={dash.milestones}
            photoOf={photoOf}
            canWrite={canWrite}
            plannedCases={plannedCases}
            onOpenPerson={(id) => openPerson(id)}
            onOpenContracts={onOpenContracts}
            onOpenCase={onOpenCase}
            onPlan={planMilestone}
          />
        </View>
        <View style={gridItem(300)}>
          <FollowUpCard
            colors={colors}
            follow={follow}
            nameOf={nameOf}
            onOpenCase={onOpenCase}
            onOpenFollowUp={onOpenFollowUp}
            onOpenPerson={openPerson}
          />
        </View>
        <View style={gridItem(300)}>
          <RecruitmentCard
            colors={colors}
            funnel={dash.recruitment.funnel}
            jobs={hr.jobs || []}
            canWrite={canWrite}
            onOpen={onOpenRecruitment}
            onOpenJob={onOpenJob}
            onNewJob={onNewJob}
          />
        </View>
        <View style={gridItem(300)}>
          <ComplianceCard colors={colors} compliance={dash.compliance} onOpen={onOpenCompliance} />
        </View>
        {kin && !inactive ? (
          <View style={gridItem(300)}>
            <KinCard colors={colors} kin={kin} total={dash.staff.length} canWrite={canWrite} onOpenPerson={openPerson} />
          </View>
        ) : null}
        <View style={gridItem(300)}>
          <RecentHiresCard
            colors={colors}
            rows={dash.recentHires}
            inactive={inactive}
            onOpenPerson={openPerson}
            onOpenAll={openStaffList}
          />
        </View>
      </View>

      {externalTotal ? (
        <>
          <SectionLabel
            colors={colors}
            icon="briefcase-outline"
            title="Eksterne og innleide"
            hint="Egen oppfølging, ikke med i tallene over"
          />
          <ExternalCard
            colors={colors}
            external={dash.external}
            inactive={inactive}
            onOpenPerson={openPerson}
            onOpenFollowUp={onOpenFollowUp}
          />
        </>
      ) : null}
    </View>
  );
}

function MilestonesCard({
  colors, rows, photoOf, canWrite, plannedCases, onOpenPerson, onOpenContracts, onOpenCase, onPlan,
}) {
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(false);
  const typeCounts = rows.reduce((acc, row) => ({ ...acc, [row.type]: (acc[row.type] || 0) + 1 }), {});
  const options = [
    { id: 'all', label: 'Alle', count: rows.length },
    ...Object.entries(MILESTONE_TYPES)
      .filter(([id]) => typeCounts[id])
      .map(([id, type]) => ({
        id, label: '', icon: type.icon, accent: type.accent, a11y: type.label, count: typeCounts[id],
      })),
  ];
  const active = options.some((row) => row.id === filter) ? filter : 'all';
  const list = active === 'all' ? rows : rows.filter((row) => row.type === active);
  const shown = expanded ? list : list.slice(0, SHORT_LIST);
  const more = list.length - SHORT_LIST;
  return (
    <DashCard
      colors={colors}
      nativeID="hr-milestones"
      icon="calendar-outline"
      title="Go-to dashboard"
      subtitle="Nedtelling til bursdag, jubileum og avtaleslutt de neste 90 dagene."
      actionLabel={more > 0 ? (expanded ? 'Vis færre' : 'Vis alle') : ''}
      onAction={() => setExpanded((v) => !v)}
    >
      {rows.length ? (
        <>
          {options.length > 2 ? (
            <Segmented colors={colors} compact nativeID="hr-milestone-filter" value={active} onChange={setFilter} options={options} />
          ) : null}
          <View style={styles.stack} nativeID="hr-event-list">
            {shown.map((row) => (
              <MilestoneRow
                key={row.key}
                colors={colors}
                row={row}
                photoUrl={photoOf(row.employeeId)}
                canWrite={canWrite}
                planned={plannedCases.get(row.key) || null}
                onOpen={() => (row.type === 'contract' && onOpenContracts ? onOpenContracts() : onOpenPerson(row.employeeId))}
                onOpenCase={onOpenCase}
                onPlan={() => onPlan(row)}
              />
            ))}
          </View>
          {more > 0 ? (
            <MoreToggle colors={colors} expanded={expanded} more={more} onPress={() => setExpanded((v) => !v)} />
          ) : null}
        </>
      ) : (
        <EmptyState colors={colors} icon="calendar-clear-outline" text="Ingen bursdager, jubileum eller avtaler som utløper de neste 90 dagene." />
      )}
    </DashCard>
  );
}

function MilestoneRow({
  colors, row, photoUrl, canWrite, planned, onOpen, onOpenCase, onPlan,
}) {
  const type = MILESTONE_TYPES[row.type] || MILESTONE_TYPES.birthday;
  const soon = row.days != null && row.days <= 7;
  return (
    <View style={[styles.milestone, { backgroundColor: tint(type.accent, 0.07), borderColor: tint(type.accent, 0.16) }]}>
      <Pressable onPress={onOpen} style={styles.milestoneMain} accessibilityRole="button" accessibilityLabel={`${row.name}, ${row.label}`}>
        <View>
          <Avatar name={row.name} photoUrl={photoUrl} size={40} accent={type.accent} />
          <View style={[styles.avatarBadge, { backgroundColor: type.accent, borderColor: colors.card }]}>
            <Ionicons name={type.icon.replace('-outline', '')} size={10} color="#fff" />
          </View>
        </View>
        <View style={styles.flexText}>
          <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.ink }]}>{row.name}</Text>
          <Text numberOfLines={1} style={[styles.rowSub, { color: colors.muted }]}>
            {`${row.label} · ${formatNbDate(row.date)}`}
          </Text>
        </View>
      </Pressable>
      <View style={styles.milestoneSide}>
        <View style={[styles.dayPill, { backgroundColor: soon ? type.accent : colors.card }]}>
          <Ionicons name="calendar-outline" size={12} color={soon ? '#fff' : type.accent} />
          <Text style={[styles.dayPillText, { color: soon ? '#fff' : colors.ink }]}>{row.days != null ? daysText(row.days) : formatNbDate(row.date)}</Text>
        </View>
        {planned ? (
          <Pressable
            onPress={() => onOpenCase?.(planned)}
            accessibilityRole="button"
            accessibilityLabel={`Åpne saken for ${row.name}`}
            style={styles.planBtn}
          >
            <Ionicons name="checkmark-circle-outline" size={13} color={ACCENT.green} />
            <Text style={[styles.planBtnText, { color: ACCENT.green }]}>{row.type === 'contract' ? 'Fulgt opp' : 'Planlagt'}</Text>
          </Pressable>
        ) : null}
        {!planned && canWrite ? (
          <Pressable
            onPress={onPlan}
            accessibilityRole="button"
            accessibilityLabel={`${row.type === 'contract' ? 'Følg opp' : 'Planlegg'} ${row.name}`}
            style={styles.planBtn}
          >
            <Ionicons name="flag-outline" size={13} color={colors.brand} />
            <Text style={[styles.planBtnText, { color: colors.brand }]}>{row.type === 'contract' ? 'Følg opp' : 'Planlegg'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const FOLLOW_TABS = [
  { id: 'cases', label: 'Saker', empty: 'Ingen åpne saker.' },
  { id: 'tasks', label: 'Oppgaver', empty: 'Ingen åpne oppgaver.' },
  { id: 'reviews', label: 'Samtaler', empty: 'Ingen planlagte samtaler.' },
];

function FollowUpCard({
  colors, follow, nameOf, onOpenCase, onOpenFollowUp, onOpenPerson,
}) {
  const firstWithRows = FOLLOW_TABS.find((tab) => follow[tab.id].length)?.id || 'cases';
  const [tab, setTab] = useState('');
  const current = tab || firstWithRows;
  const spec = FOLLOW_TABS.find((row) => row.id === current);
  const rows = follow[current].slice(0, SHORT_LIST);
  const handlers = {
    nameOf, onOpenCase, onOpenPerson, onOpenFollowUp,
  };
  return (
    <DashCard
      colors={colors}
      nativeID="hr-followup"
      icon="list-outline"
      title="Oppfølging"
      subtitle="Saker, oppgaver og planlagte samtaler for egne ansatte."
      actionLabel="Vis alle"
      onAction={onOpenFollowUp}
    >
      <Segmented
        colors={colors}
        compact
        nativeID="hr-follow-tabs"
        value={current}
        onChange={setTab}
        options={FOLLOW_TABS.map((row) => ({ id: row.id, label: row.label, count: follow[row.id].length }))}
      />
      {rows.length ? (
        <View>
          {rows.map((row, index) => (
            <FollowRow
              key={row.id}
              colors={colors}
              divider={index > 0}
              nativeID={current === 'cases' ? `hr-case-${row.id}` : undefined}
              {...followRowProps(current, row, handlers)}
            />
          ))}
        </View>
      ) : (
        <EmptyState colors={colors} icon="checkmark-done-outline" text={spec.empty} />
      )}
      {follow[current].length > SHORT_LIST ? (
        <Pressable onPress={onOpenFollowUp} style={styles.more}>
          <Text style={[styles.moreText, { color: colors.brand }]}>{`Se alle ${follow[current].length}`}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.brand} />
        </Pressable>
      ) : null}
    </DashCard>
  );
}

const FUNNEL_LOOK = {
  received: { icon: 'mail-unread-outline', accent: ACCENT.blue },
  processing: { icon: 'document-text-outline', accent: ACCENT.amber },
  completed: { icon: 'checkmark-done-outline', accent: ACCENT.slate },
  pending: { icon: 'hourglass-outline', accent: ACCENT.violet },
  hired: { icon: 'person-add-outline', accent: ACCENT.green },
  rejected: { icon: 'close-circle-outline', accent: ACCENT.red },
};

function RecruitmentCard({
  colors, funnel, jobs, canWrite, onOpen, onOpenJob, onNewJob,
}) {
  const tiles = [...(funnel.board || []), ...(funnel.outcomes || [])];
  const openJobs = jobs.filter((job) => job.status !== 'closed').slice(0, 2);
  return (
    <DashCard
      colors={colors}
      nativeID="hr-recruitment"
      icon="person-add-outline"
      title="Rekruttering"
      subtitle="Tre steg: mottatt → behandling → ferdig."
      actionLabel="Vis alle"
      onAction={onOpen}
    >
      <View style={styles.tiles}>
        {tiles.map((stage) => {
          const look = FUNNEL_LOOK[stage.id] || FUNNEL_LOOK.pending;
          return (
            <Pressable
              key={stage.id}
              onPress={onOpen}
              style={[styles.tile, { backgroundColor: tint(look.accent, 0.07) }]}
            >
              <View style={styles.tileHead}>
                <Ionicons name={look.icon} size={16} color={look.accent} />
                <Text style={[styles.tileCount, { color: colors.ink }]}>{stage.count}</Text>
              </View>
              <Text style={[styles.tileLabel, { color: colors.muted }]} numberOfLines={2}>{stage.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {openJobs.map((job) => (
        <Pressable key={job.id} onPress={() => (onOpenJob ? onOpenJob(job.id) : onOpen?.())} style={styles.jobRow}>
          <Ionicons name="briefcase-outline" size={16} color={colors.muted} />
          <View style={styles.flexText}>
            <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.ink }]}>{job.title}</Text>
            <Text numberOfLines={1} style={[styles.rowSub, { color: colors.muted }]}>
              {[job.department, job.location].filter(Boolean).join(' · ') || 'Stilling'}
            </Text>
          </View>
          <Pill label={choiceLabel(JOB_STATUSES, job.status)} accent={job.status === 'open' ? ACCENT.green : ACCENT.slate} />
        </Pressable>
      ))}
      {canWrite ? (
        <Pressable
          onPress={onNewJob || onOpen}
          accessibilityRole="button"
          style={[styles.cta, { borderColor: tint(colors.brand, 0.4), backgroundColor: tint(colors.brand, 0.04) }]}
        >
          <View style={[styles.ctaIcon, { backgroundColor: tint(colors.brand, 0.12) }]}>
            <Ionicons name="add" size={18} color={colors.brand} />
          </View>
          <View style={styles.flexText}>
            <Text style={[styles.rowTitle, { color: colors.brand }]}>Ny rekrutteringsprosess</Text>
            <Text style={[styles.rowSub, { color: colors.muted }]}>Opprett stilling og samle søknader</Text>
          </View>
        </Pressable>
      ) : null}
    </DashCard>
  );
}

function ComplianceCard({ colors, compliance, onOpen }) {
  const { pct, ok, total, withGaps, people, items } = compliance;
  const accent = pct >= 90 ? ACCENT.green : pct >= 60 ? ACCENT.amber : ACCENT.red;
  return (
    <DashCard
      colors={colors}
      nativeID="hr-compliance"
      icon="shield-checkmark-outline"
      title="Lovpålagt"
      subtitle="Påkrevde sjekkpunkter for egne ansatte, gruppert på det som mangler."
      actionLabel="Vis alle"
      onAction={onOpen}
    >
      {people ? (
        <View style={styles.complianceTop}>
          <Ring pct={pct} size={68} stroke={7} color={accent} label={`${pct}%`} labelColor={colors.ink} labelSize={15} />
          <View style={styles.flexText}>
            <Text style={[styles.rowTitle, { color: colors.ink }]}>{`${ok} av ${total} punkter på plass`}</Text>
            <Text style={[styles.rowSub, { color: colors.muted }]}>
              {withGaps ? `${withGaps} av ${people} ansatte har mangler` : 'Ingen påkrevde mangler'}
            </Text>
          </View>
        </View>
      ) : (
        <EmptyState colors={colors} icon="shield-outline" text="Ingen ansatte i dette utvalget." />
      )}
      {items.slice(0, SHORT_LIST).map((item) => (
        <Pressable key={item.id} onPress={onOpen} style={styles.gapRow}>
          <View style={styles.gapHead}>
            <Text numberOfLines={1} style={[styles.gapLabel, { color: colors.ink }]}>{item.label}</Text>
            <Text style={[styles.gapCount, { color: colors.muted }]}>{`${item.missing} mangler`}</Text>
          </View>
          <Bar ratio={people ? item.missing / people : 0} accent={accent} />
        </Pressable>
      ))}
      {items.length > SHORT_LIST ? (
        <Text style={[styles.rowSub, { color: colors.muted }]}>{`+ ${plural(items.length - SHORT_LIST, 'sjekkpunkt', 'sjekkpunkter')} til med mangler`}</Text>
      ) : null}
    </DashCard>
  );
}

/** Pårørende for egne ansatte: hvem som mangler, og status på oppgaven de har fått. */
function KinCard({
  colors, kin, total, canWrite, onOpenPerson,
}) {
  const [showAll, setShowAll] = useState(false);
  const missing = staffKinMissing(kin.missing);
  const tasks = missing.map((row) => row.task).filter(Boolean);
  const sent = tasks.length;
  const reminded = tasks.filter((task) => Number(task.reminders) > 0).length;
  const firstDeadline = tasks.map((task) => String(task.deadline || '')).filter(Boolean).sort()[0] || '';
  const noAccount = missing.filter((row) => !row.employee.personUid).length;
  const done = Math.max(0, total - missing.length);
  const faces = missing.slice(0, 6);
  return (
    <DashCard
      colors={colors}
      nativeID="hr-kin"
      icon="heart-outline"
      title="Pårørende"
      badge={missing.length || ''}
      subtitle={missing.length || !total ? 'Egne ansatte som mangler pårørende' : 'Alle egne ansatte har lagt inn pårørende'}
    >
      {total ? (
        <View style={styles.kinProgress}>
          <View style={styles.gapHead}>
            <Text style={[styles.gapLabel, { color: colors.ink }]}>{`${done} av ${total} registrert`}</Text>
            <Text style={[styles.gapCount, { color: colors.muted }]}>{`${Math.round((done / total) * 100)} %`}</Text>
          </View>
          <Bar ratio={done / total} accent={missing.length ? ACCENT.rose : ACCENT.green} height={8} />
        </View>
      ) : null}
      {missing.length ? (
        <>
          <Pressable
            onPress={() => setShowAll((v) => !v)}
            accessibilityRole="button"
            style={[styles.alert, { backgroundColor: tint(ACCENT.rose, 0.08), borderColor: tint(ACCENT.rose, 0.2) }]}
          >
            <View style={[styles.alertIcon, { backgroundColor: ACCENT.rose }]}>
              <Ionicons name="alert" size={16} color="#fff" />
            </View>
            <View style={styles.flexText}>
              <Text style={[styles.rowTitle, { color: colors.ink }]}>{`${plural(missing.length, 'ansatt', 'ansatte')} mangler pårørende`}</Text>
              <Text style={[styles.rowSub, { color: colors.muted }]}>Den ansatte fyller inn selv under Ansatte › Min side.</Text>
            </View>
            <Ionicons name={showAll ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
          </Pressable>
          <View style={styles.kinMeta}>
            <View style={styles.faces}>
              {faces.map(({ employee }, index) => (
                <View key={employee.id} style={index ? styles.faceOverlap : null}>
                  <Avatar name={displayName(employee)} photoUrl={employee.person?.photoUrl} size={30} accent={ACCENT.rose} ring={colors.card} />
                </View>
              ))}
              {missing.length > faces.length ? (
                <Text style={[styles.facesMore, { color: colors.muted }]}>{`+${missing.length - faces.length}`}</Text>
              ) : null}
            </View>
          </View>
          {sent ? (
            <View style={styles.kinLine}>
              <Ionicons name="mail-outline" size={14} color={ACCENT.blue} />
              <Text style={[styles.kinLineText, { color: colors.muted }]}>
                {`Oppgave sendt til ${sent}${firstDeadline ? `, første frist ${formatNbDate(firstDeadline)}` : ''}${reminded ? ` · ${reminded} påminnet` : ''}.`}
              </Text>
            </View>
          ) : null}
          {noAccount ? (
            <View style={styles.kinLine}>
              <Ionicons name="person-remove-outline" size={14} color={colors.muted} />
              <Text style={[styles.kinLineText, { color: colors.muted }]}>
                {`${noAccount} uten brukerkonto: inviter personen, eller fyll inn på personkortet.`}
              </Text>
            </View>
          ) : null}
          {showAll ? (
            <View style={styles.names} nativeID="hr-kin-names">
              {missing.map(({ employee, task }) => (
                <Pressable
                  key={employee.id}
                  onPress={() => onOpenPerson(employee.id)}
                  style={[styles.nameChip, { borderColor: colors.line, backgroundColor: colors.card }]}
                >
                  <Text style={[styles.nameChipText, { color: colors.ink }]} numberOfLines={1}>{displayName(employee)}</Text>
                  {task?.reminders ? <Text style={[styles.nameChipMeta, { color: colors.muted }]}>{`påminnet ${task.reminders}`}</Text> : null}
                  {!employee.personUid ? <Ionicons name="person-remove-outline" size={12} color={colors.muted} /> : null}
                </Pressable>
              ))}
            </View>
          ) : null}
          {canWrite && missing.some((row) => row.employee.personUid) ? (
            <Pressable
              disabled={kin.busy}
              onPress={async () => {
                const sentNow = await kin.remindNow();
                showSaveToast(sentNow ? 'Påminnelse er sendt.' : 'Ingen å minne på.');
              }}
              accessibilityRole="button"
              style={[styles.remindBtn, { borderColor: colors.line, opacity: kin.busy ? 0.5 : 1 }]}
            >
              <Ionicons name="notifications-outline" size={15} color={colors.ink} />
              <Text style={[styles.remindText, { color: colors.ink }]}>
                {kin.busy ? 'Sender …' : `Send påminnelse nå${sent ? ` (${sent})` : ''}`}
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <EmptyState
          colors={colors}
          icon={total ? 'checkmark-circle-outline' : 'people-outline'}
          text={total ? 'Alle har nærmeste pårørende registrert.' : 'Ingen aktive ansatte ennå.'}
          accent={total ? ACCENT.green : undefined}
        />
      )}
    </DashCard>
  );
}

function RecentHiresCard({
  colors, rows, inactive, onOpenPerson, onOpenAll,
}) {
  return (
    <DashCard
      colors={colors}
      nativeID="hr-recent"
      icon="person-circle-outline"
      title={inactive ? 'Sist ansatt (deaktiverte)' : 'Nye ansatte'}
      subtitle={inactive ? 'Sist startet blant de deaktiverte.' : 'Sist startet, og de som starter snart.'}
      actionLabel="Vis alle"
      onAction={onOpenAll}
    >
      {rows.length ? (
        <View style={styles.hires}>
          {rows.map(({ employee, date, upcoming }) => {
            const name = displayName(employee);
            return (
              <Pressable key={employee.id} onPress={() => onOpenPerson(employee.id)} style={styles.hire}>
                <Avatar name={name} photoUrl={employee.person?.photoUrl} size={46} accent={upcoming ? ACCENT.teal : ACCENT.blue} />
                <Text numberOfLines={1} style={[styles.hireName, { color: colors.ink }]}>{employee.person?.firstName || name}</Text>
                <Text numberOfLines={1} style={[styles.hireSub, { color: colors.muted }]}>{employee.company?.title || '—'}</Text>
                <Text numberOfLines={1} style={[styles.hireSub, { color: upcoming ? ACCENT.teal : colors.muted }]}>
                  {upcoming ? `Starter ${formatNbDate(date)}` : formatNbDate(date)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <EmptyState colors={colors} icon="person-outline" text="Ingen ansatte med startdato." />
      )}
    </DashCard>
  );
}

function ExternalCard({
  colors, external, inactive, onOpenPerson, onOpenFollowUp,
}) {
  const [expanded, setExpanded] = useState(false);
  const limit = expanded ? external.rows.length : 6;
  const shown = external.rows.slice(0, limit);
  const ext = external.total - external.innleid;
  return (
    <View
      nativeID="hr-dash-external"
      style={[styles.extCard, { backgroundColor: colors.card, borderColor: tint(ACCENT.slate, 0.35) }]}
    >
      <View style={styles.extHead}>
        <IconDisc icon="briefcase-outline" accent={ACCENT.slate} size={40} iconSize={19} />
        <View style={styles.flexText}>
          <Text style={[styles.extTitle, { color: colors.ink }]}>{inactive ? 'Deaktiverte eksterne' : 'Aktive eksterne'}</Text>
          <Text style={[styles.rowSub, { color: colors.muted }]}>
            Saker, oppgaver og avtaleslutt. Lønn, Lovpålagt og pårørende gjelder egne ansatte.
          </Text>
        </View>
        {onOpenFollowUp ? (
          <Pressable onPress={onOpenFollowUp} accessibilityRole="link" style={styles.extLink}>
            <Text style={[styles.moreText, { color: colors.brand }]}>Følg opp</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.brand} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.pills}>
        <Pill label={plural(ext, 'ekstern', 'eksterne')} accent={ACCENT.slate} icon="business-outline" solid />
        <Pill label={plural(external.innleid, 'innleid', 'innleide')} accent={ACCENT.slate} icon="swap-horizontal-outline" />
        {external.cases ? <Pill label={plural(external.cases, 'åpen sak', 'åpne saker')} accent={ACCENT.amber} icon="flag-outline" /> : null}
        {external.tasks ? <Pill label={plural(external.tasks, 'oppgave', 'oppgaver')} accent={ACCENT.teal} icon="checkbox-outline" /> : null}
      </View>
      {shown.length ? (
        <View style={gridStyle(3, 240, 10)} nativeID="hr-external-list">
          {shown.map((row) => {
            const open = row.openCases + row.openTasks;
            let meta = 'Ingen åpne saker';
            let metaColor = colors.muted;
            if (open) {
              meta = [
                row.openCases ? plural(row.openCases, 'åpen sak', 'åpne saker') : '',
                row.openTasks ? plural(row.openTasks, 'oppgave', 'oppgaver') : '',
              ].filter(Boolean).join(' · ');
              metaColor = ACCENT.amber;
            } else if (row.next) {
              meta = `${row.next.type === 'contract' ? 'Avtale utløper' : row.next.label} · ${daysText(row.next.days)}`;
            }
            return (
              <View key={row.id} style={gridItem(240)}>
                <Pressable
                  onPress={() => onOpenPerson(row.id, 'oppfolging')}
                  style={[styles.extRow, { backgroundColor: tint(ACCENT.slate, 0.06) }]}
                >
                  <Avatar name={row.name} photoUrl={row.employee.person?.photoUrl} size={38} accent={ACCENT.slate} square />
                  <View style={styles.flexText}>
                    <View style={styles.extNameRow}>
                      <Text numberOfLines={1} style={[styles.rowTitle, styles.extName, { color: colors.ink }]}>{row.name}</Text>
                      <Text style={[styles.kindTag, { color: ACCENT.slate, borderColor: tint(ACCENT.slate, 0.4) }]}>{row.kindLabel}</Text>
                    </View>
                    <Text numberOfLines={1} style={[styles.rowSub, { color: colors.muted }]}>{row.title || 'Uten rolle'}</Text>
                    <Text numberOfLines={1} style={[styles.extMeta, { color: metaColor }]}>{meta}</Text>
                  </View>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : (
        <EmptyState colors={colors} icon="briefcase-outline" text={inactive ? 'Ingen deaktiverte eksterne.' : 'Ingen aktive eksterne eller innleide.'} />
      )}
      {external.rows.length > 6 ? (
        <MoreToggle colors={colors} expanded={expanded} more={external.rows.length - 6} onPress={() => setExpanded((v) => !v)} />
      ) : null}
    </View>
  );
}

function EmptyState({
  colors, icon, text, accent,
}) {
  return (
    <View style={[styles.empty, { backgroundColor: tint(accent || ACCENT.slate, 0.06) }]}>
      <Ionicons name={icon} size={18} color={accent || colors.muted} />
      <Text style={[styles.emptyText, { color: colors.muted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 16 },
  stack: { gap: 8 },
  flexText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: '500' },
  rowSub: { fontSize: 12, lineHeight: 17, marginTop: 1 },
  milestone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  milestoneMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneSide: { alignItems: 'flex-end', gap: 4 },
  dayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dayPillText: { fontSize: 12, fontWeight: '500' },
  planBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 2 },
  planBtnText: { fontSize: 12, fontWeight: '500' },
  more: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'center' },
  moreText: { fontSize: 13, fontWeight: '500' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 84,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 9,
    gap: 2,
  },
  tileHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  tileCount: { fontSize: 20, fontWeight: '500' },
  tileLabel: { fontSize: 11, lineHeight: 14 },
  jobRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ctaIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  complianceTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  gapRow: { gap: 5 },
  gapHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  gapLabel: { fontSize: 13, flexShrink: 1 },
  gapCount: { fontSize: 12, flexShrink: 0 },
  kinProgress: { gap: 6 },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  alertIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  kinMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kinLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  kinLineText: { fontSize: 12, lineHeight: 17, flex: 1 },
  faces: { flexDirection: 'row', alignItems: 'center' },
  faceOverlap: { marginLeft: -8 },
  facesMore: { fontSize: 12, fontWeight: '500', marginLeft: 6 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  names: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  nameChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  nameChipText: { fontSize: 12, fontWeight: '500', flexShrink: 1 },
  nameChipMeta: { fontSize: 11 },
  remindBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
  },
  remindText: { fontSize: 13, fontWeight: '500' },
  hires: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'space-between' },
  hire: { alignItems: 'center', gap: 2, flexGrow: 1, flexBasis: 52, minWidth: 52, maxWidth: 96 },
  hireName: { fontSize: 13, fontWeight: '500', marginTop: 4 },
  hireSub: { fontSize: 11 },
  extCard: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  extHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  extTitle: { fontSize: 16, fontWeight: '500' },
  extLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  extRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    padding: 10,
  },
  extNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  extName: { flexShrink: 1 },
  kindTag: {
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  extMeta: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    padding: 12,
  },
  emptyText: { fontSize: 13, lineHeight: 18, flex: 1 },
});
