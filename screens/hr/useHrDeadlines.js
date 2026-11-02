import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadAbsences } from '../../src/arbeid/absenceStorage';
import { addDays, newSickSalt, sickFollowUpRows, sickTaskPlan } from '../../src/hr/sickLeave';
import { annualTaskPlan } from '../../src/hr/annualWheel';
import { splitHrPeople } from '../../src/hr/dashboard';
import { filterHrEmployees, localIsoDate } from '../../src/hr/model';
import {
  closeHrDeadlineTask, createAnnualTask, createSickTask, loadAnnualTasks, loadSickTasks, reopenHrDeadlineTask,
} from '../../src/hr/hrDeadlineTasks';
import { notifyUsers } from '../../src/utils/notifications';

// Én automatisk gjennomgang per selskap og økt, så oppgaver ikke lages hver gang HR åpnes.
const HANDLED = new Set();
const SETTLE_MS = 1500;
/**
 * Dialogmøte 2 er etter 26 uker, og sykepenger varer høyst et år. Halvannet år tilbake dekker
 * nesten alle tilfeller; et tilfelle som startet før det, merkes og får ingen oppgaver.
 */
const LOOKBACK_DAYS = 550;

/** Er oppgavene sjekket for selskapet i denne økten? Da trengs fraværet bare på Sykefravær-siden. */
export function hrDeadlinesHandled(familyId) {
  return HANDLED.has(familyId);
}

/** Egne, aktive ansatte (grunnlaget for antall ansatte i årshjulet). */
export function activeStaff(employees) {
  return splitHrPeople(filterHrEmployees(employees, 'active')).staff;
}

/**
 * Frister ved sykefravær og oppgaver fra HR-årshjulet.
 *  - Fraværet hentes når personen kan se Oppfølging (enabled).
 *  - Oppgaver lages og lukkes én gang per økt av den som åpner HR, og tildeles den personen:
 *    sykefravær med skrivetilgang til Oppfølging (canWriteSick), årshjulet med skrivetilgang til
 *    HR (canWriteAnnual).
 *  - Bare når HR er lest fra skyen og ansattlisten er lastet (stateOk). Fra en lokal kopi kunne
 *    det blitt oppgaver for frister som allerede er markert.
 *  - ensureSalt lagrer nøkkelen til oppgave-id-ene (hr.settings.sickSalt) første gang.
 */
export function useHrDeadlines({
  familyId, employees, hr, enabled, canWriteSick, canWriteAnnual, stateOk, actor, ensureSalt,
}) {
  const [absences, setAbsences] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const today = localIsoDate();
  const windowStart = addDays(today, -LOOKBACK_DAYS);

  useEffect(() => {
    let live = true;
    setAbsences(null);
    setLoadFailed(false);
    if (!familyId || !enabled) return undefined;
    // strict: ingen lokal kopi eller tomt svar ved feil, ellers kunne oppgaver bli lukket.
    loadAbsences(familyId, { fromDate: windowStart, toDate: addDays(today, 200), strict: true })
      .then((rows) => { if (live) setAbsences(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (live) setLoadFailed(true); });
    return () => { live = false; };
  }, [familyId, enabled, today, windowStart]);

  const staff = useMemo(() => activeStaff(employees), [employees]);
  const sickRows = useMemo(
    () => sickFollowUpRows(absences || [], hr?.sickFollowUps || [], { today, employees, windowStart }),
    [absences, hr?.sickFollowUps, today, employees, windowStart],
  );
  const allSickRows = useMemo(
    () => sickFollowUpRows(absences || [], hr?.sickFollowUps || [], { today, employees, all: true, windowStart }),
    [absences, hr?.sickFollowUps, today, employees, windowStart],
  );

  const stateRef = useRef({});
  stateRef.current = {
    allSickRows,
    sickReady: absences !== null && !loadFailed,
    annual: hr?.annual,
    salt: hr?.settings?.sickSalt || '',
    staffCount: staff.length || null,
  };

  const runSick = useCallback(async (who) => {
    let { salt } = stateRef.current;
    const { allSickRows: rows, sickReady } = stateRef.current;
    // Uten fullstendig lastet fravær lages og lukkes ingenting.
    if (!sickReady) return;
    if (!salt) salt = (await ensureSalt?.(newSickSalt())) || '';
    if (!salt) return;
    const tasks = await loadSickTasks(familyId);
    // Feilet lesingen, lages ingenting (ellers kunne det blitt doble oppgaver).
    if (!tasks) return;
    const plan = sickTaskPlan(rows, tasks, { salt });
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
    for (const task of plan.stale) {
      await closeHrDeadlineTask(familyId, task, 'Lukket: fraværet er endret, og fristen gjelder ikke lenger', { ...who, closedReason: 'stale' });
    }
    for (const task of plan.reopen) {
      await reopenHrDeadlineTask(familyId, task, who);
    }
  }, [familyId, ensureSalt]);

  const runAnnual = useCallback(async (who) => {
    const { annual, staffCount } = stateRef.current;
    const tasks = await loadAnnualTasks(familyId);
    if (!tasks) return;
    const plan = annualTaskPlan(annual, { staffCount, uid: who.uid, existingIds: tasks.map((row) => row.id) });
    for (const task of plan) {
      try {
        await createAnnualTask(familyId, task, who);
      } catch (err) {
        console.warn('annual task create failed', err?.message || err);
      }
    }
  }, [familyId]);

  // Én kjøring om gangen; trykk mens den går gir én kjøring til etterpå.
  const busyRef = useRef(null);
  const againRef = useRef(false);
  const run = useCallback(async ({ sick = canWriteSick, annual = canWriteAnnual } = {}) => {
    const who = { uid: actor?.uid || '', name: actor?.name || '' };
    if (!who.uid || !familyId) return;
    if (busyRef.current) {
      againRef.current = true;
      return;
    }
    busyRef.current = (async () => {
      if (sick) await runSick(who).catch((err) => console.warn('sick deadlines failed', err?.message || err));
      if (annual) await runAnnual(who).catch((err) => console.warn('annual tasks failed', err?.message || err));
    })();
    await busyRef.current;
    busyRef.current = null;
    if (againRef.current) {
      againRef.current = false;
      await run({ sick, annual });
    }
  }, [actor?.uid, actor?.name, familyId, canWriteSick, canWriteAnnual, runSick, runAnnual]);

  // Venter til HR og ansatte er lastet, og fraværet er hentet (eller ikke trengs).
  const sickSettled = !canWriteSick || absences !== null || loadFailed;
  useEffect(() => {
    if (!stateOk || !sickSettled || !actor?.uid || !familyId || HANDLED.has(familyId)) return undefined;
    if (!canWriteSick && !canWriteAnnual) {
      HANDLED.add(familyId);
      return undefined;
    }
    const timer = setTimeout(() => {
      if (HANDLED.has(familyId)) return;
      HANDLED.add(familyId);
      run();
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [stateOk, sickSettled, actor?.uid, familyId, canWriteSick, canWriteAnnual, run]);

  // Når HR har markert en frist eller slått på oppgaver: oppdater oppgavene med en gang.
  const refresh = useCallback(() => { run(); }, [run]);

  const loading = absences === null && !loadFailed && !!enabled;
  return useMemo(
    () => ({ sickRows, loading, loadFailed, staff, refresh }),
    [sickRows, loading, loadFailed, staff, refresh],
  );
}
