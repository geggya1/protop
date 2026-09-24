import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { overlayExternalEventVisibility } from '../utils/externalEventVisibility';

/** Live map externalEventId → visibility doc for a family. */
export function useExternalEventVisibilityMap(familyId) {
  const [byEventId, setByEventId] = useState({});

  useEffect(() => {
    if (!familyId) {
      setByEventId({});
      return undefined;
    }
    return onSnapshot(
      collection(db, 'families', familyId, 'externalEventVisibility'),
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          const key = data.externalEventId || d.id;
          if (key) map[key] = { ...data, externalEventId: key };
        });
        setByEventId(map);
      },
      () => setByEventId({}),
    );
  }, [familyId]);

  return byEventId;
}

export function useEventsWithExternalVisibility(events, ownerUid, visibilityByEventId) {
  return useMemo(
    () => (events || []).map(
      (e) => overlayExternalEventVisibility(e, visibilityByEventId, ownerUid),
    ),
    [events, visibilityByEventId, ownerUid],
  );
}
