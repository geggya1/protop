/**
 * Oppstart etter invitasjonslenke (UX-30): når e-posten er bekreftet, godtas invitasjonen til
 * bedriften i bakgrunnen mens «Åpner bedriften…» vises. Deretter velges bedriften og Timer
 * åpnes, med kortet «Slik fører du timer». Feiler det, eller tar det for lang tid, går appen
 * videre som før (invitasjonsvinduet med Godta/Avslå tar over).
 */
import { useEffect, useRef, useState } from 'react';
import { JOIN_INVITE_WAIT_MS, shouldAutoJoin } from '../utils/inviteLinkJoin';
import { runInviteLinkJoin } from '../utils/inviteLinkJoinClient';

export function useInviteLinkJoin({
  user, userProfile, families, familiesReady, selectFamily, requestShellTab,
}) {
  const joinInvite = userProfile?.joinInvite || null;
  const wanted = !!user?.uid && familiesReady && shouldAutoJoin({
    joinInvite,
    emailVerified: !!user?.emailVerified,
    families,
  });
  const key = wanted ? `${user.uid}:${joinInvite.familyId}` : '';
  const [finishedKey, setFinishedKey] = useState('');
  // Godtakingen pågår. Profilen får status «joined» før bedriften er valgt, så ønsket
  // alene kan ikke si om oppstarten skal vente (ellers lages et eget skall i mellomtiden).
  const [busyKey, setBusyKey] = useState('');
  const startedRef = useRef('');

  useEffect(() => {
    if (!key || startedRef.current === key) return undefined;
    startedRef.current = key;
    setBusyKey(key);
    const done = () => {
      setBusyKey((cur) => (cur === key ? '' : cur));
      setFinishedKey(key);
    };
    const timer = setTimeout(done, JOIN_INVITE_WAIT_MS);
    runInviteLinkJoin({ uid: user.uid, joinInvite })
      .then(async (res) => {
        if (!res?.ok) return;
        await selectFamily?.(res.familyId, { name: res.familyName, type: res.groupType });
        requestShellTab?.('timeliste');
      })
      .catch((err) => console.warn('[inviteLinkJoin]', err?.message || err))
      .finally(() => {
        clearTimeout(timer);
        done();
      });
    return undefined;
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return { joining: !!busyKey || (!!key && finishedKey !== key) };
}
