import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { watchEmployees } from '../employees/storage';
import { isOrganizationType } from '../utils/groupTypes';
import { companyChatContacts } from '../utils/companyChat';
import { subscribeFamilyCollection } from '../utils/sharedCollectionListeners';

/**
 * Hvem man kan chatte med i bedriften (se companyChat.js). null utenfor en bedrift.
 * `loaded`: ansattlisten er lest (lokal kopi eller server), så listen kan vises.
 * `ready`: hentet fra serveren. Fellestrådens medlemmer skrives først da,
 * så eksterne ikke kommer med i mellomtiden.
 * `threads`: siste melding per tråd fra chat-dokumentene (samme lytter som ulest-tellingen).
 */
export function useCompanyChatContacts() {
  const { familyId, family, parents, uid } = useApp();
  const company = isOrganizationType(family?.type);
  const [state, setState] = useState({
    key: '', employees: [], loaded: false, ready: false,
  });
  const [threads, setThreads] = useState({ key: '', map: {} });

  useEffect(() => {
    if (!company || !familyId) return undefined;
    setState({
      key: familyId, employees: [], loaded: false, ready: false,
    });
    return watchEmployees(familyId, (rows, meta) => {
      setState((prev) => {
        const same = prev.key === familyId;
        const remote = meta?.source === 'remote';
        return {
          key: familyId,
          employees: rows || [],
          // Tom lokal kopi betyr bare at den ikke finnes ennå.
          loaded: (same && prev.loaded) || remote || (rows || []).length > 0,
          ready: (same && prev.ready) || remote,
        };
      });
    }, () => setState({
      key: familyId, employees: [], loaded: true, ready: false,
    }));
  }, [company, familyId]);

  useEffect(() => {
    if (!company || !familyId) return undefined;
    return subscribeFamilyCollection(
      familyId,
      'chats',
      (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })),
      (rows) => {
        const map = {};
        (rows || []).forEach((row) => {
          map[row.id] = { preview: row.lastText || '', at: row.lastAt || null };
        });
        setThreads({ key: familyId, map });
      },
    );
  }, [company, familyId]);

  return useMemo(() => {
    if (!company) return null;
    const same = state.key === familyId;
    const loaded = same && state.loaded;
    const contacts = companyChatContacts({
      // Før ansattlisten er lest kan ingen skilles fra eksterne. Da vises ingen.
      employees: same ? state.employees : [],
      parents: loaded ? parents : [],
      uid,
    });
    return {
      ...contacts,
      loaded,
      ready: same && state.ready,
      threads: threads.key === familyId ? threads.map : {},
    };
  }, [company, familyId, state, threads, parents, uid]);
}
