import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadAbsences } from '../../src/arbeid/absenceStorage';
import { addDays, sickFollowUpRows, sickTaskPlan } from '../../src/hr/sickLeave';
import { annualTaskPlan } from '../../src/hr/annualWheel';
import { splitHrPeople } from '../../src/hr/dashboard';
import { filterHrEmployees, localIsoDate } from '../../src/hr/model';
import {
  closeHrDeadlineTask, createAnnualTask, createSickTask, loadAnnualTasks, loadSickTasks,
} from '../../src/hr/hrDeadlineTasks';
import { notifyUsers } from '../../src/utils/notifications';

// Én automatisk gjennomgang per selskap og økt, så oppgaver ikke lages hver gang HR åpnes.
const HANDLED = new Set();
const SETTLE_MS = 3500;
/** Dialogmøte 2 er etter 26 uker, så fraværet hentes et år tilbake. */
const LOOKBACK_DAYS = 380;

/** Er oppgavene sjekket for selskapet i denne økten? Da trengs fraværet bare på Årshjul-siden. */
export function hrDeadlinesHandled(familyId) {
  return HANDLED.has(familyId);
}

/** Egne, aktive ansatte (grunnlaget for antall ansatte i årshjulet). */
export function activeStaff(employees) {
  return splitHrPeople(filterHrEmployees(employees, 'active')).staff;
}

/**
 * Frister ved sykefravær og oppgaver fra HR-årshjulet.
 * Fraværet hentes når HR er åpnet med lesetilgang. Oppgaver lages og lukkes av den som åpner HR
 * med skrivetilgang, én gang per økt, og tildeles den personen.
 */
export function useHrDeadlines({ familyId, employees, hr, enabled, canWrite, actor }) {
  const [absences, setAbsences] = useState(null);
  const today = localIsoDate();

  useEffect(() => {
    let live = true;
    setAbsences(null);
    if (!familyId || !enabled) return undefined;
    loadAbsences(familyId, { fromDate: addDays(today, -LOOKBACK_DAYS), toDate: addDays(today, 200) })
      .then((rows) => { if (live) setAbsences(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (live) setAbsences([]); });
    return () => { live = false; };
  }, [familyId, enabled, today]);

  const staff = useMemo(() => activeStaff(employees), [employees]);
  const sickRows = useMemo(
    () => sickFollowUpRows(absences || [], hr?.sickFollowUps || [], { today, employees }),
    [absences, hr?.sickFollowUps, today, employees],
  );
  const allSickRows = useMemo(
    () => sickFollowUpRows(absences || [], hr?.sickFollowUps || [], { today, employees, all: true }),
    [absences, hr?.sickFollowUps, today, employees],
  );

  const stateRef = useRef({});
  stateRef.current = { allSickRows, annual: hr?.annual, staffCount: staff.length };

  const run = useCallback(async () => {
    const who = { uid: actor?.uid || '', name: actor?.name || '' };
    const { allSickRows: rows, annual, staffCount } = stateRef.current;
    const [sickTasks, annualTasks] = await Promise.all([loadSickTasks(familyId), loadAnnualTasks(familyId)]);
    // Feilet lesingen, lages ingenting (ellers kunne det blitt doble oppgaver).
    if (sickTasks) {
      const plan = sickTaskPlan(rows, sickTasks);
      for (const { id, milestone } of plan.create) {
        try {
          const task = await createSickTask(familyId, id, milestone, who);
          notifyUsers([who.uid], {
            eventType: 'taskReceived', title: 'Frist ved sykefravær', body: task.title, familyId, createdBy: who.uid,
          }).catch(() => {});
        } catch (err) {
          console.warn('sick task create failed', err?.message || err);
        }
      }
      for (const task of plan.close) {
        await closeHrDeadlineTask(familyId, task, 'Lukket: fristen er markert i HR, eller fraværet er over ✅', who);
      }
    }
    if (annualTasks) {
      const tasks = annualTaskPlan(annual, {
        staffCount, uid: who.uid, existingIds: annualTasks.map((row) => row.id),
      });
      for (const task of tasks) {
        try {
          await createAnnualTask(familyId, task, who);
        } catch (err) {
          console.warn('annual task create failed', err?.message || err);
        }
      }
    }
  }, [familyId, actor?.uid, actor?.name]);

  useEffect(() => {
    if (absences === null || !familyId || HANDLED.has(familyId)) return undefined;
    // Uten skrivetilgang lages ingen oppgaver, og fraværet trengs bare på Årshjul-siden.
    if (!canWrite) {
      HANDLED.add(familyId);
      return undefined;
    }
    if (!actor?.uid) return undefined;
    // Vent litt, så ansattlisten og HR er ferdig lastet før noe lages.
    const timer = setTimeout(() => {
      if (HANDLED.has(familyId)) return;
      HANDLED.add(familyId);
      run().catch((err) => console.warn('hr deadlines failed', err?.message || err));
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [canWrite, absences, actor?.uid, familyId, run]);

  // refresh: lag oppgaver nå (når oppgaver fra årshjulet nettopp er slått på).
  const refresh = useCallback(() => {
    if (canWrite && actor?.uid && familyId) run().catch(() => {});
  }, [canWrite, actor?.uid, familyId, run]);

  const loading = absences === null && !!enabled;
  return useMemo(() => ({ sickRows, loading, staff, refresh }), [sickRows, loading, staff, refresh]);
}
