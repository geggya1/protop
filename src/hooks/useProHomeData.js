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
import { projectPhaseOf } from '../project/statusFilter';
import { listenCompanyWall } from '../project/companyWall';
import { newsPlainText } from '../project/newsFormat';
import {
  weekHoursSummary, homeProjects, teamToday, weekDays, isoDay,
} from '../utils/proHome';

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
