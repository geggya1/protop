import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { filterHrEmployees } from '../../src/hr/model';
import { KIN_TASK_TITLE, kinPlan, kinTaskId } from '../../src/hr/kinReminder';
import { closeKinTask, createKinTask, loadKinTasks, markKinReminded } from '../../src/hr/kinTasks';
import { notifyUsers } from '../../src/utils/notifications';

// Én automatisk gjennomgang per selskap og økt, så varsler ikke sendes hver gang HR åpnes.
const HANDLED = new Set();
const SETTLE_MS = 3000;

/**
 * Pårørende i HR: hvem som mangler, og oppgaver med varsel til dem som ikke har fylt inn.
 * Med skrivetilgang lages manglende oppgaver, påminnelser sendes og ferdige lukkes automatisk.
 */
export function useKinTasks({ familyId, employees, canWrite, actor }) {
  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const people = useMemo(() => filterHrEmployees(employees, 'active'), [employees]);
  const plan = useMemo(() => kinPlan(people, tasks), [people, tasks]);
  const planRef = useRef(plan);
  planRef.current = plan;

  useEffect(() => {
    let live = true;
    setLoaded(false);
    setTasks([]);
    if (!familyId) return undefined;
    loadKinTasks(familyId).then((rows) => {
      if (!live) return;
      setTasks(rows);
      setLoaded(true);
    });
    return () => { live = false; };
  }, [familyId]);

  const notify = useCallback((uid, title, body) => notifyUsers([uid], {
    eventType: 'taskReceived', title, body, familyId, createdBy: actor?.uid,
  }).catch(() => {}), [familyId, actor?.uid]);

  const apply = useCallback(async (next) => {
    const who = { uid: actor?.uid || '', name: actor?.name || '' };
    const byId = new Map(tasks.map((row) => [row.id, row]));
    const updates = [];
    for (const employee of next.create) {
      const previous = byId.get(kinTaskId(employee.id)) || null;
      try {
        updates.push(await createKinTask(familyId, employee, { ...who, previous }));
        notify(employee.personUid, previous ? 'Påminnelse: pårørende mangler' : 'Ny oppgave', KIN_TASK_TITLE);
      } catch (err) {
        console.warn('kin task create failed', err?.message || err);
      }
    }
    for (const task of next.remind) {
      try {
        updates.push(await markKinReminded(familyId, task));
        notify(task.assignedTo, 'Påminnelse: legg inn pårørende', `Fristen var ${task.deadline}. Gå til Ansatte › Min side › Pårørende.`);
      } catch (err) {
        console.warn('kin reminder failed', err?.message || err);
      }
    }
    for (const task of next.close) {
      if (await closeKinTask(familyId, task.employeeId, who)) updates.push({ ...task, done: true });
    }
    if (updates.length) {
      setTasks((rows) => [...rows.filter((row) => !updates.some((item) => item.id === row.id)), ...updates]);
    }
    return updates.length;
  }, [familyId, tasks, actor?.uid, actor?.name, notify]);

  useEffect(() => {
    if (!canWrite || !loaded || !people.length || !actor?.uid || HANDLED.has(familyId)) return undefined;
    // Vent litt, så ansattlisten er ferdig lastet fra serveren før noe sendes.
    const timer = setTimeout(() => {
      if (HANDLED.has(familyId)) return;
      HANDLED.add(familyId);
      const next = planRef.current;
      if (next.create.length || next.remind.length || next.close.length) apply(next);
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [canWrite, loaded, people.length, actor?.uid, familyId, apply]);

  /** Send påminnelse nå til alle med åpen oppgave, uavhengig av frist. */
  const remindNow = useCallback(async () => {
    const open = planRef.current.missing.map((row) => row.task).filter(Boolean);
    const create = planRef.current.create;
    setBusy(true);
    const count = await apply({ create, remind: open, close: [] });
    setBusy(false);
    return count;
  }, [apply]);

  return useMemo(() => ({ missing: plan.missing, tasks, loaded, busy, remindNow }), [plan.missing, tasks, loaded, busy, remindNow]);
}
