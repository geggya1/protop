import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { filterHrEmployees } from '../../src/hr/model';
import { todayKey } from '../../src/doccontrol/model';
import { docTaskPlan } from '../../src/doccontrol/readTasks';
import { closeDocTask, createDocTask, loadDocTasks } from '../../src/doccontrol/store';
import { loadFilledDocs } from '../../src/forms/filledStore';
import { notifyUsers } from '../../src/utils/notifications';

// Én automatisk gjennomgang per selskap og økt, så varsler ikke sendes hver gang HR åpnes.
const HANDLED = new Set();
const SETTLE_MS = 3000;

/**
 * Dokumenter med lesekrav: nyansatte og alle som mangler en ny versjon får en oppgave med
 * varsel om å lese og bekrefte, eller fylle ut og signere. Kjøres når noen med skrivetilgang
 * åpner HR. Oppgaven lukkes når dokumentet er bekreftet (også rett fra Min side).
 */
export function useDocReadTasks({ dc, employees, canWrite }) {
  const familyId = dc?.familyId || '';
  const actor = dc?.actor || {};
  const [tasks, setTasks] = useState([]);
  const [filled, setFilled] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const active = useMemo(() => filterHrEmployees(employees, 'active'), [employees]);
  const plan = useMemo(
    () => docTaskPlan(active, dc?.controls || [], tasks, { acks: dc?.acks || [], filled }),
    [active, dc?.controls, dc?.acks, tasks, filled],
  );
  const planRef = useRef(plan);
  planRef.current = plan;

  useEffect(() => {
    let live = true;
    setLoaded(false);
    setTasks([]);
    if (!familyId) return undefined;
    Promise.all([loadDocTasks(familyId), loadFilledDocs(familyId)]).then(([rows, docs]) => {
      if (!live) return;
      setTasks(rows);
      setFilled((docs || []).filter((row) => row.scope === 'hr'));
      setLoaded(true);
    });
    return () => { live = false; };
  }, [familyId]);

  const apply = useCallback(async (next) => {
    const today = todayKey();
    const updates = [];
    for (const { control, employee } of next.create) {
      try {
        const task = await createDocTask(familyId, control, employee, { uid: actor.uid, today });
        updates.push(task);
        notifyUsers([task.assignedTo], {
          eventType: 'documentPublished', title: 'Ny oppgave', body: task.title, familyId, createdBy: actor.uid,
        }).catch(() => {});
      } catch (err) {
        console.warn('doc task create failed', err?.message || err);
      }
    }
    for (const task of next.close) {
      if (await closeDocTask(familyId, task, { today })) updates.push({ ...task, done: true });
    }
    if (updates.length) {
      setTasks((rows) => [...rows.filter((row) => !updates.some((item) => item.id === row.id)), ...updates]);
    }
  }, [familyId, actor.uid]);

  useEffect(() => {
    if (!canWrite || !loaded || !dc?.ready || !active.length || !actor.uid || HANDLED.has(familyId)) return undefined;
    // Vent litt, så ansattlisten og dokumentene er ferdig lastet før noe sendes.
    const timer = setTimeout(() => {
      if (HANDLED.has(familyId)) return;
      HANDLED.add(familyId);
      const next = planRef.current;
      if (next.create.length || next.close.length) apply(next);
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [canWrite, loaded, dc?.ready, active.length, actor.uid, familyId, apply]);

  return tasks;
}
