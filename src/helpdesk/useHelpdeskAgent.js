/**
 * Er innlogget bruker med i helpdesk-teamet? Styrer «Helpdesk» i
 * Privat/Bedrift-bryteren. Spør serveren bare for faste eiere og for dem
 * som tidligere har vært inne i portalen, så vanlige brukere ikke får et
 * ekstra kall ved hver oppstart.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useOptionalApp } from '../context/AppContext';
import { isOwnerEmail } from './model';
import { helpdeskSession } from './client';

const KEY = 'protop.helpdesk.agent';

export async function rememberHelpdeskAgent(uid, isAgent) {
  try {
    if (isAgent) await AsyncStorage.setItem(KEY, uid);
    else await AsyncStorage.removeItem(KEY);
  } catch { /* ignore */ }
}

export function useHelpdeskAgent() {
  const app = useOptionalApp();
  const user = app?.user;
  const uid = user?.uid || '';
  const email = user?.email || '';
  const [agent, setAgent] = useState(false);

  useEffect(() => {
    let live = true;
    setAgent(false);
    if (!uid) return undefined;
    (async () => {
      let known = false;
      try { known = (await AsyncStorage.getItem(KEY)) === uid; } catch { /* ignore */ }
      if (!known && !isOwnerEmail(email)) return;
      if (known && live) setAgent(true);
      try {
        const res = await helpdeskSession({ uid });
        if (!live) return;
        setAgent(!!res?.isAgent);
        rememberHelpdeskAgent(uid, !!res?.isAgent);
      } catch {
        // Uten svar beholdes det vi visste fra før.
      }
    })();
    return () => { live = false; };
  }, [uid, email]);

  return agent;
}
