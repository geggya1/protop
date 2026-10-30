import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { filterHrEmployees } from '../../src/hr/model';
import { hmsTaskPlan } from '../../src/hr/hmsReminder';
import { closeHmsTask, createHmsTask, loadHmsTasks } from '../../src/hr/hmsTasks';
import { notifyUsers } from '../../src/utils/notifications';

// Én automatisk gjennomgang per selskap og økt, så varsler ikke sendes hver gang HR åpnes.
const HANDLED = new Set();
const SETTLE_MS = 3000;

/**
 * HMS-kort som går ut: oppgave med varsel til den i HR som åpner HR med skrivetilgang,
 * fra 30 dager før utløpsdatoen. Oppgaven lukkes når nytt kort er registrert.
 */
export function useHmsTasks({ familyId, employees, hr, canWrite, actor }) {
  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const active = useMemo(() => filterHrEmployees(employees, 'active'), [employees]);
  const notApplicable = useMemo(
    () => (hr?.compliance || []).filter((row) => row.catalogId === 'hms_card' && row.status === 'na').map((row) => row.employeeId),
    [hr?.compliance],
  );
  const plan = useMemo(
    () => hmsTaskPlan(active, hr?.hmsCards || [], tasks, { notApplicable }),
    [active, hr?.hmsCards, tasks, notApplicable],
  );
  const planRef = useRef(plan);
  planRef.current = plan;

  useEffect(() => {
    let live = true;
    setLoaded(false);
    setTasks([]);
    if (!familyId) return undefined;
    loadHmsTasks(familyId).then((rows) => {
      if (!live) return;
      setTasks(rows);
      setLoaded(true);
    });
    return () => { live = false; };
  }, [familyId]);

  const apply = useCallback(async (next) => {
    const who = { uid: actor?.uid || '', name: actor?.name || '' };
    const updates = [];
    for (const { employee, card } of next.create) {
      try {
        const task = await createHmsTask(familyId, employee, card, who);
        updates.push(task);
        notifyUsers([who.uid], {
          eventType: 'taskReceived', title: 'HMS-kort går ut', body: task.title, familyId, createdBy: who.uid,
        }).catch(() => {});
      } catch (err) {
        console.warn('hms task create failed', err?.message || err);
      }
    }
    for (const task of next.close) {
      if (await closeHmsTask(familyId, task, who)) updates.push({ ...task, done: true });
    }
    if (updates.length) {
      setTasks((rows) => [...rows.filter((row) => !updates.some((item) => item.id === row.id)), ...updates]);
    }
  }, [familyId, actor?.uid, actor?.name]);

  useEffect(() => {
    if (!canWrite || !loaded || !active.length || !actor?.uid || HANDLED.has(familyId)) return undefined;
    // Vent litt, så ansattlisten og HR er ferdig lastet før noe sendes.
    const timer = setTimeout(() => {
      if (HANDLED.has(familyId)) return;
      HANDLED.add(familyId);
      const next = planRef.current;
      if (next.create.length || next.close.length) apply(next);
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [canWrite, loaded, active.length, actor?.uid, familyId, apply]);

  return tasks;
}
