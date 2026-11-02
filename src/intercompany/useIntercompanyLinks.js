import { useEffect, useMemo, useState } from 'react';
import { watchLinks } from './client';
import { groupLinks, LINK_STATUS, linkView } from './model.js';

/**
 * Selskapets avtaler med tilknyttede selskaper, i sanntid.
 * active: aktive avtaler sett fra selskapet (partner, roller), til tildeling på prosjekt.
 */
export function useIntercompanyLinks(companyId) {
  const [links, setLinks] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setReady(false);
    setLinks([]);
    setError('');
    const stop = watchLinks(companyId, (rows) => {
      setLinks(rows);
      setReady(true);
    }, (cause) => {
      setError(cause?.message || 'Kunne ikke lese tilknytningene.');
      setReady(true);
    });
    return stop;
  }, [companyId]);

  const groups = useMemo(() => groupLinks(links, companyId), [links, companyId]);
  const active = useMemo(() => links
    .filter((row) => row.status === LINK_STATUS.active)
    .map((row) => linkView(row, companyId))
    .filter(Boolean), [links, companyId]);

  return { links, groups, active, ready, error };
}
