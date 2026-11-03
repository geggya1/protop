/**
 * Data til bedriftswidgetene på Hjem. Hver widget henter bare det den viser, og bare
 * når den står på Hjem. Ansatte, prosjekter og innstillinger kommer fra skallets felles
 * lyttere (CompanyDataContext); timeføringene leses som et lite vindu (én uke / én dag).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { useEmployees, useProjects, useCompanySettings } from '../context/CompanyDataContext';
import { loadTimeEntries } from '../economy/timeEntryStorage';
import { findLinkedEmployee, canManageTimesheets, employeeDisplayName } from '../arbeid/roles';
import { isActiveEmployee } from '../employees/employmentState';
import { hrKindBucket } from '../hr/directory';

/** Egne, aktive ansatte: uten innleide og eksterne. */
function ownStaff(employees) {
  return (employees || []).filter((row) => isActiveEmployee(row) && hrKindBucket(row) !== 'external');
}
import { projectPhaseOf } from '../project/statusFilter';
import { listenCompanyWall } from '../project/companyWall';
import { newsPlainText } from '../project/newsFormat';
import { normalizeTrip } from '../economy/mileage';
import { sameEmployeeIds } from '../project/myProjects';
import { loadAbsences } from '../arbeid/absenceStorage';
import { loadAnbudState, peekAnbudState, readCachedAnbudState } from '../anbud/storage';
import { loadMyReports } from '../iso/storage';
import {
  weekHoursSummary, homeProjects, teamToday, weekDays, isoDay, mileageSummary,
} from '../utils/proHome';
import {
  awayToday, celebrations, tenderPeek, approvalSummary, myReportsSummary,
} from '../utils/proHomeMore';

/** Teller opp når Hjem får fokus igjen, så tallene er ferske etter at man har ført timer. */
function useFocusTick() {
  const [tick, setTick] = useState(0);
  useFocusEffect(useCallback(() => { setTick((n) => n + 1); }, []));
  return tick;
}

/** Den innloggede personens ansattrad i selskapet (eller null). */
export function useMyEmployee(companyId) {
  const { uid } = useApp();
  const { employees, ready } = useEmployees(companyId, { enabled: !!companyId });
  const me = useMemo(() => findLinkedEmployee(employees || [], uid), [employees, uid]);
  return { me, employees: employees || [], ready };
}

/** Mine timer denne uken: { summary, ready, linked }. */
export function useMyWeekHours(companyId) {
  const { me, ready: empReady } = useMyEmployee(companyId);
  const settings = useCompanySettings(companyId, { enabled: !!companyId });
  const tick = useFocusTick();
  const [rows, setRows] = useState(null);
  const today = useMemo(() => new Date(), [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const range = useMemo(() => {
    const days = weekDays(today);
    return { fromDate: days[0].key, toDate: days[6].key };
  }, [today]);

  useEffect(() => {
    let live = true;
    if (!companyId || !me?.id) {
      setRows(empReady ? [] : null);
      return undefined;
    }
    loadTimeEntries(companyId, { ...range, employeeId: me.id })
      .then((list) => { if (live) setRows(Array.isArray(list) ? list : []); })
      .catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [companyId, me?.id, range, empReady, tick]);

  const summary = useMemo(
    () => weekHoursSummary(rows || [], { today, normalDay: settings?.fullDayHours || 7.5 }),
    [rows, today, settings?.fullDayHours],
  );
  return {
    summary,
    ready: rows != null,
    linked: !!me,
    employeeName: me ? employeeDisplayName(me) : '',
  };
}

/** Prosjektene på Hjem, med de jeg har ført timer på denne uken først. */
export function useHomeProjects(companyId, { recentIds = [], limit = 4 } = {}) {
  const { activeProfile } = useApp();
  const { projects, ready } = useProjects(companyId, { enabled: !!companyId });
  const recentKey = (recentIds || []).join('|');
  const result = useMemo(() => homeProjects(projects || [], {
    phaseOf: projectPhaseOf,
    recentIds: recentKey ? recentKey.split('|') : [],
    myName: String(activeProfile?.name || '').split(' ')[0] || '',
    limit,
  }), [projects, recentKey, activeProfile?.name, limit]);
  return { ...result, ready };
}

/**
 * Teamet i dag. Ledere og administratorer ser hvem som har ført timer; andre ser
 * bare hvem som er i teamet (timene til andre er ikke deres å se).
 */
export function useTeamToday(companyId, { limit = 8 } = {}) {
  const { isAdmin } = useApp();
  const { me, employees, ready } = useMyEmployee(companyId);
  const manager = canManageTimesheets({ isAdmin, employee: me });
  const tick = useFocusTick();
  const todayKey = useMemo(() => isoDay(new Date()), [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let live = true;
    if (!companyId || !manager) {
      setRows(null);
      return undefined;
    }
    loadTimeEntries(companyId, { fromDate: todayKey, toDate: todayKey })
      .then((list) => { if (live) setRows(Array.isArray(list) ? list : []); })
      .catch(() => { if (live) setRows(null); });
    return () => { live = false; };
  }, [companyId, manager, todayKey, tick]);

  const active = useMemo(
    () => (employees || []).filter((row) => {
      try { return isActiveEmployee(row); } catch { return row?.active !== false; }
    }),
    [employees],
  );
  const team = useMemo(
    () => teamToday(active, manager ? rows : null, { meId: me?.id || '', todayKey, limit }),
    [active, manager, rows, me?.id, todayKey, limit],
  );
  return { ...team, ready, manager };
}

function postDateKey(post) {
  const t = post?.createdAt?.toDate
    ? post.createdAt.toDate()
    : (post?.createdAt?.seconds ? new Date(post.createdAt.seconds * 1000) : null);
  return t ? isoDay(t) : '';
}

/** Siste nytt fra Selskap → Nyheter. */
export function useCompanyNewsPeek(companyId, { limit = 3 } = {}) {
  const [posts, setPosts] = useState(null);
  useEffect(() => {
    if (!companyId) {
      setPosts([]);
      return undefined;
    }
    return listenCompanyWall(companyId, (list) => setPosts((list || []).filter((p) => p && p.deleted !== true)));
  }, [companyId]);
  const items = useMemo(() => (posts || []).slice(0, limit).map((p) => {
    const body = newsPlainText(p.body || '');
    const firstLine = body.split('\n').find((line) => line.trim()) || '';
    return {
      id: p.id,
      title: String(p.title || firstLine || 'Nyhet').slice(0, 90),
      excerpt: p.title ? firstLine.slice(0, 120) : '',
      author: p.authorName || p.createdByName || '',
      date: postDateKey(p),
      pinned: !!p.pinned,
      category: p.category || '',
    };
  }), [posts, limit]);
  return { items, ready: posts != null, total: (posts || []).length };
}

/**
 * Kjøreboken min i ett selskap: mine turer denne måneden og i år.
 * Turene ligger i prosjektdokumentet (felles lytter); bare egne turer telles.
 */
export function useMyMileage(companyId) {
  const { me, employees, ready: empReady } = useMyEmployee(companyId);
  const { mileageTrips, ready } = useProjects(companyId, { enabled: !!companyId });
  const tick = useFocusTick();
  const today = useMemo(() => new Date(), [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const mine = useMemo(() => (me ? sameEmployeeIds(employees, me) : new Set()), [me, employees]);
  const trips = useMemo(
    () => (mileageTrips || []).map((row) => normalizeTrip(row)),
    [mileageTrips],
  );
  const summary = useMemo(
    // Uten ansattkobling vises ingen turer (ikke andres).
    () => mileageSummary(me ? trips : [], { mine, today }),
    [trips, mine, today, me],
  );
  return { summary, ready: !!ready && empReady, linked: !!me };
}

/**
 * Hvem som er borte i dag. Ledere og administratorer ser hele selskapet (årsak til
 * sykdom skjules likevel); andre får bare sitt eget fravær fra reglene.
 */
export function useAwayToday(companyId) {
  const { isAdmin } = useApp();
  const { me, employees } = useMyEmployee(companyId);
  const manager = canManageTimesheets({ isAdmin, employee: me });
  const tick = useFocusTick();
  const todayKey = useMemo(() => isoDay(new Date()), [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const toKey = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 21);
    return isoDay(d);
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let live = true;
    if (!companyId) {
      setRows([]);
      return undefined;
    }
    loadAbsences(companyId, { fromDate: todayKey, toDate: toKey, ...(manager ? {} : { employeeId: me?.id || '' }), all: false })
      .then((list) => { if (live) setRows(Array.isArray(list) ? list : []); })
      .catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [companyId, manager, me?.id, todayKey, toKey, tick]);
  const away = useMemo(
    () => awayToday(rows || [], employees, { todayKey, meId: me?.id || '' }),
    [rows, employees, todayKey, me?.id],
  );
  const present = useMemo(
    () => (employees || []).filter((row) => {
      try { return isActiveEmployee(row); } catch { return row?.active !== false; }
    }).length,
    [employees],
  );
  return { ...away, ready: rows != null, manager, staff: present };
}

/** Jubileer og nye i bedriften, fra ansattlisten skallet allerede har. */
export function useCelebrations(companyId, { limit = 4 } = {}) {
  const { employees, ready } = useMyEmployee(companyId);
  const tick = useFocusTick();
  const data = useMemo(
    // Jubileer og nye gjelder egne ansatte, ikke innleide og eksterne.
    () => celebrations(ownStaff(employees), { today: new Date(), limit }),
    [employees, limit, tick], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return { ...data, ready };
}

/** Anbud: nye treff og frister. Leser samme tilstand som Anbud-modulen (delt i minnet). */
export function useTenderPeek(companyId, { enabled = true, limit = 3 } = {}) {
  const tick = useFocusTick();
  const [state, setState] = useState(() => (companyId ? peekAnbudState(companyId) : null));
  useEffect(() => {
    let live = true;
    if (!companyId || !enabled) {
      setState(null);
      return undefined;
    }
    readCachedAnbudState(companyId)
      .then((cached) => { if (live && cached) setState(cached); })
      .catch(() => {});
    loadAnbudState(companyId)
      .then((next) => { if (live) setState(next || null); })
      .catch(() => {});
    return () => { live = false; };
  }, [companyId, enabled, tick]);
  const peek = useMemo(() => tenderPeek(state, { today: new Date(), limit }), [state, limit]);
  return { ...peek, ready: state != null };
}

/** Timer som venter på godkjenning (ledere): denne og forrige uke. */
export function useApprovals(companyId, { limit = 4 } = {}) {
  const { isAdmin } = useApp();
  const { me, employees } = useMyEmployee(companyId);
  const manager = canManageTimesheets({ isAdmin, employee: me });
  const tick = useFocusTick();
  const range = useMemo(() => {
    const days = weekDays(new Date());
    const from = new Date(`${days[0].key}T12:00:00`);
    from.setDate(from.getDate() - 7);
    return { fromDate: isoDay(from), toDate: days[6].key };
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let live = true;
    if (!companyId || !manager) {
      setRows(null);
      return undefined;
    }
    loadTimeEntries(companyId, range)
      .then((list) => { if (live) setRows(Array.isArray(list) ? list : []); })
      .catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [companyId, manager, range, tick]);
  const data = useMemo(() => approvalSummary(rows || [], employees, { limit }), [rows, employees, limit]);
  return { ...data, ready: rows != null, manager };
}

/** Mine meldte avvik og RUH. */
export function useMyReports(companyId, { enabled = true, limit = 3 } = {}) {
  const { uid } = useApp();
  const tick = useFocusTick();
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let live = true;
    if (!companyId || !uid || !enabled) {
      setRows([]);
      return undefined;
    }
    loadMyReports(companyId, uid)
      .then((list) => { if (live) setRows(Array.isArray(list) ? list : []); })
      .catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [companyId, uid, enabled, tick]);
  const data = useMemo(() => myReportsSummary(rows || [], { limit }), [rows, limit]);
  return { ...data, ready: rows != null };
}
