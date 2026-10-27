import { useEffect, useRef, useState } from 'react';
import { loadAbsences, mergeAbsenceLists } from '../../src/arbeid/absenceStorage';
import { resolveAbsenceTypes } from '../../src/arbeid/absenceCatalog';
import { loadTimeEntries } from '../../src/economy/timeEntryStorage';
import { monthWindow } from '../../src/hr/billable';
import { aliasSourceIds } from '../../src/project/companyAlias';
import { loadProjectState } from '../../src/project/storage';

const EMPTY = { entries: [], absences: [] };
const NO_SETUP = {
  ready: false, projects: [], redDays: [], fullDayHours: 0, absenceTypes: undefined,
};

/** Fravær for selskapet og underenhetene som er slått sammen med det, som i Arbeid. */
async function monthAbsences(companyId, range) {
  const lists = await Promise.all([companyId, ...aliasSourceIds(companyId)].map(
    (id) => loadAbsences(id, range).catch(() => []),
  ));
  return mergeAbsenceLists(...lists);
}

/**
 * Timer og fravær for én måned, og selskapets oppsett fra Arbeid
 * (røde dager, normaldag, fraværstyper og prosjekter for «eget selskap»).
 * Måneder som er hentet, holdes i minnet så blaing går raskt.
 */
export function useBillableMonth({ familyId, month }) {
  const [setup, setSetup] = useState(NO_SETUP);
  const [data, setData] = useState({ key: '', ...EMPTY });
  const cache = useRef(new Map());

  useEffect(() => {
    let live = true;
    cache.current = new Map();
    setSetup(NO_SETUP);
    setData({ key: '', ...EMPTY });
    if (!familyId) return undefined;
    loadProjectState(familyId, { hours: false }).then((state) => {
      if (!live) return;
      setSetup({
        ready: true,
        projects: state?.projects || [],
        redDays: state?.redDays || [],
        fullDayHours: Number(state?.fullDayHours) || 0,
        absenceTypes: resolveAbsenceTypes(state),
      });
    }).catch(() => {
      if (live) setSetup({ ...NO_SETUP, ready: true });
    });
    return () => { live = false; };
  }, [familyId]);

  useEffect(() => {
    let live = true;
    if (!familyId || !month) return undefined;
    const key = `${familyId}:${month}`;
    const known = cache.current.get(key);
    if (known) {
      setData({ key, ...known });
      return undefined;
    }
    const { fromDate, toDate } = monthWindow(month);
    Promise.all([
      loadTimeEntries(familyId, { fromDate, toDate }).catch(() => []),
      monthAbsences(familyId, { fromDate, toDate }).catch(() => []),
    ]).then(([entries, absences]) => {
      const rows = {
        entries: Array.isArray(entries) ? entries : [],
        absences: Array.isArray(absences) ? absences : [],
      };
      cache.current.set(key, rows);
      if (live) setData({ key, ...rows });
    });
    return () => { live = false; };
  }, [familyId, month]);

  const key = familyId && month ? `${familyId}:${month}` : '';
  return {
    projects: setup.projects,
    redDays: setup.redDays,
    fullDayHours: setup.fullDayHours,
    absenceTypes: setup.absenceTypes,
    entries: data.key === key ? data.entries : EMPTY.entries,
    absences: data.key === key ? data.absences : EMPTY.absences,
    loading: !!key && (!setup.ready || data.key !== key),
  };
}
