/**
 * HR-oversikten. HR gjelder egne ansatte: tall, merkedager, oppfølging,
 * Lov & ISO og pårørende regnes bare for dem. Eksterne og innleide samles
 * for seg med egne saker, oppgaver og avtaleslutt, og telles ikke med i
 * tallene for ansatte.
 */
import { displayName } from '../employees/model.js';
import { COMPLIANCE_CATALOG, companyComplianceOverview } from './compliance.js';
import { hrKindBucket, hrKindLabel } from './directory.js';
import {
  daysUntil,
  employeeHrBucket,
  expiringContracts,
  localIsoDate,
  openFollowUps,
  recruitmentFunnel,
  upcomingPeopleEvents,
} from './model.js';
import { summarizeProductivity } from './productivity.js';

export const DASHBOARD_DAYS = 90;
const RECENT_HIRES = 5;

function count(rows, bucket) {
  return rows.filter((row) => employeeHrBucket(row) === bucket).length;
}

function byDays(a, b) {
  return (a.days ?? 9999) - (b.days ?? 9999) || String(a.date).localeCompare(String(b.date));
}

/** Egne ansatte og eksterne hver for seg. Slettede er utelatt. */
export function splitHrPeople(employees) {
  const staff = [];
  const external = [];
  for (const row of employees || []) {
    if (!row?.id || employeeHrBucket(row) === 'deleted') continue;
    if (hrKindBucket(row) === 'external') external.push(row);
    else staff.push(row);
  }
  return { staff, external };
}

/** Lov & ISO for egne ansatte, gruppert på sjekkpunktet som mangler. */
export function complianceByItem(staff, hr = {}) {
  const rows = companyComplianceOverview(staff, hr.compliance, {
    contracts: hr.contracts,
    reviews: hr.reviews,
    applyEvidence: true,
  });
  const ok = rows.reduce((sum, row) => sum + row.ok, 0);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const missing = rows.reduce((sum, row) => sum + row.missing, 0);
  const items = COMPLIANCE_CATALOG
    .filter((cat) => cat.required)
    .map((cat) => ({
      id: cat.id,
      label: cat.label,
      missing: rows.filter((row) => (row.gapIds || []).includes(cat.id)).length,
    }))
    .filter((item) => item.missing > 0)
    .sort((a, b) => b.missing - a.missing);
  return {
    people: rows.length,
    withGaps: rows.filter((row) => row.missing > 0).length,
    ok,
    total,
    missing,
    pct: total ? Math.round((ok / total) * 100) : 100,
    items,
  };
}

/**
 * Alt oversikten trenger. status er 'active' eller 'inactive'.
 * Saker, oppgaver og samtaler følger personen uansett status,
 * men deles på egne ansatte og eksterne.
 */
export function hrDashboard(employees, hr = {}, {
  status = 'active',
  entries = [],
  today = new Date(),
} = {}) {
  const { staff: allStaff, external: allExternal } = splitHrPeople(employees);
  const kindOf = new Map();
  for (const row of allStaff) kindOf.set(row.id, 'internal');
  for (const row of allExternal) kindOf.set(row.id, 'external');
  const isExternal = (id) => kindOf.get(String(id || '')) === 'external';
  const byId = new Map([...allStaff, ...allExternal].map((row) => [row.id, row]));
  const staff = allStaff.filter((row) => employeeHrBucket(row) === status);
  const externals = allExternal.filter((row) => employeeHrBucket(row) === status);
  const inScope = (id) => {
    const person = byId.get(String(id || ''));
    return person ? employeeHrBucket(person) === status : status === 'active';
  };

  const contracts = expiringContracts(hr.contracts, { withinDays: DASHBOARD_DAYS, today });
  const contractRow = (row) => {
    const person = byId.get(row.employeeId);
    return {
      type: 'contract',
      key: `contract-${row.id}`,
      employeeId: row.employeeId,
      name: person ? displayName(person) : (row.title || 'Avtale'),
      label: row.title || 'Arbeidsavtale',
      date: row.endDate,
      days: row.days,
      contract: row,
    };
  };
  const milestones = [
    ...upcomingPeopleEvents(staff, { withinDays: DASHBOARD_DAYS, today })
      .map((event) => ({ ...event, key: `${event.type}-${event.employeeId}-${event.date}` })),
    ...contracts
      .filter((row) => !isExternal(row.employeeId) && inScope(row.employeeId))
      .map(contractRow),
  ].sort(byDays);

  const todayIso = localIsoDate(today);
  const follow = openFollowUps(hr);
  const own = (row) => !isExternal(row.employeeId);
  const staffFollow = {
    cases: follow.cases.filter(own),
    tasks: follow.tasks.filter(own),
    reviews: follow.reviews.filter(own),
  };
  const overdue = [...staffFollow.cases, ...staffFollow.tasks]
    .filter((row) => row.dueDate && row.dueDate < todayIso).length;

  const funnel = recruitmentFunnel(hr.applications);
  const stage = (id) => funnel.board.find((row) => row.id === id)?.count || 0;

  const recentHires = staff
    .map((row) => ({ employee: row, days: daysUntil(row?.company?.periodFrom, today) }))
    .filter((row) => row.days != null)
    .sort((a, b) => b.days - a.days)
    .slice(0, RECENT_HIRES)
    .map((row) => ({
      employee: row.employee,
      date: String(row.employee.company.periodFrom).slice(0, 10),
      upcoming: row.days > 0,
    }));
  const newHires = staff.filter((row) => {
    const days = daysUntil(row?.company?.periodFrom, today);
    return days != null && days <= 0 && days >= -DASHBOARD_DAYS;
  }).length;

  const staffIds = new Set(staff.map((row) => String(row.id)));
  const productivity = summarizeProductivity(
    (entries || []).filter((row) => staffIds.has(String(row?.employeeId || ''))),
  );

  const externalEvents = upcomingPeopleEvents(externals, { withinDays: DASHBOARD_DAYS, today });
  const externalContracts = contracts.filter((row) => isExternal(row.employeeId));
  const externalRows = externals.map((employee) => {
    const id = employee.id;
    const openCases = follow.cases.filter((row) => row.employeeId === id).length;
    const openTasks = follow.tasks.filter((row) => row.employeeId === id).length;
    const next = [
      ...externalEvents.filter((row) => row.employeeId === id),
      ...externalContracts.filter((row) => row.employeeId === id).map(contractRow),
    ].sort(byDays)[0] || null;
    return {
      employee,
      id,
      name: displayName(employee),
      kindLabel: hrKindLabel(employee),
      title: String(employee?.company?.title || '').trim(),
      openCases,
      openTasks,
      next,
    };
  }).sort((a, b) => (
    (b.openCases + b.openTasks) - (a.openCases + a.openTasks)
    || (a.next?.days ?? 9999) - (b.next?.days ?? 9999)
    || a.name.localeCompare(b.name, 'nb')
  ));

  return {
    counts: {
      staff: { active: count(allStaff, 'active'), inactive: count(allStaff, 'inactive') },
      external: { active: count(allExternal, 'active'), inactive: count(allExternal, 'inactive') },
    },
    staff,
    newHires,
    milestones,
    follow: staffFollow,
    overdue,
    recruitment: {
      funnel,
      queue: stage('received') + stage('processing'),
      received: stage('received'),
      processing: stage('processing'),
    },
    compliance: complianceByItem(staff, hr),
    recentHires,
    productivity,
    external: {
      rows: externalRows,
      total: externals.length,
      innleid: externalRows.filter((row) => row.kindLabel === 'Innleid').length,
      cases: follow.cases.filter((row) => isExternal(row.employeeId)).length,
      tasks: follow.tasks.filter((row) => isExternal(row.employeeId)).length,
    },
  };
}

/** Pårørende gjelder egne ansatte. */
export function staffKinMissing(missing) {
  return (missing || []).filter((row) => row?.employee && hrKindBucket(row.employee) !== 'external');
}
