import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { dateKey } from '../utils/dates';
import { eventOccursOnDate, eventInvolvesMember } from '../utils/events';
import {
  listenParentTodos, parentTodosOnDate, isParentTaskOpen, parentTaskVisibleToUser,
} from '../utils/todos';
import { subscribeFamilyCollection } from '../utils/sharedCollectionListeners';

/**
 * Live-tall for modulikoner i ProTop: åpne oppgaver i dag (Oppgaver) og hendelser i dag (Kalender).
 * Fungerer uten inbox/push (Firestore-data direkte).
 *
 * Familieproduktets tellere (handleliste, måltider, lekser og barnas gjøremål) er fjernet: de
 * modulene finnes ikke i ProTop, og lytterne kostet lesninger for alle brukere.
 */
export function useModuleActivity() {
  const { familyId, uid, members } = useApp();

  const [parentTodos, setParentTodos] = useState([]);
  const [events, setEvents] = useState([]);

  // Alltid fersk kalenderdag (ikke frys ved mount — badge for forfalte oppgaver må følge midnatt).
  const todayKey = dateKey(new Date());
  const today = useMemo(() => {
    const [y, m, d] = todayKey.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  }, [todayKey]);
  const ids = useMemo(() => new Set([uid].filter(Boolean)), [uid]);

  useEffect(() => {
    if (!familyId) {
      setParentTodos([]);
      return undefined;
    }
    return listenParentTodos(familyId, setParentTodos);
  }, [familyId]);

  useEffect(() => {
    if (!familyId) {
      setEvents([]);
      return undefined;
    }
    // Delt med Hjem og hilsenen via subscribeFamilyCollection-huben.
    return subscribeFamilyCollection(
      familyId,
      'events',
      (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })),
      (items) => setEvents(items || []),
    );
  }, [familyId]);

  return useMemo(() => {
    const counts = {};

    // Oppgaver: egen dato-logikk (ikke «daily» via appliesOnDate).
    // Inkluder forfalte åpne eksplisitt — badge skal stå til oppgaven lukkes.
    const myOpen = (parentTodos || []).filter((t) => {
      if (!parentTaskVisibleToUser(t, { uid, ids, asChild: false }) || !isParentTaskOpen(t, today)) return false;
      return parentTodosOnDate([t], today, today).length > 0;
    });
    if (myOpen.length) counts.stars = myOpen.length;

    const myEvents = (events || []).filter((e) => (
      eventOccursOnDate(e, today)
      && eventInvolvesMember(e, ids, { asChild: false, members })
    ));
    if (myEvents.length) counts.plan = myEvents.length;

    return counts;
  }, [parentTodos, events, today, uid, ids, members]);
}
