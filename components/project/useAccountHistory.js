/**
 * Tidligere årsregnskap fra Regnskapsregisteret (via proxyen, som krever innlogget bruker).
 * Brukes av Økonomi → Oversikt og fanen Offentlig selskapsdata på bedriftssiden.
 */
import { useEffect, useRef, useState } from 'react';
import { accountHistoryEndpoint } from '../../src/project/companyPublic';
import { proxyAuthHeaders } from '../../src/anbud/proxyAuth';

export function useAccountHistory(orgnr, { enabled = true } = {}) {
  const [years, setYears] = useState(null);
  const [loading, setLoading] = useState(false);
  const loaded = useRef('');

  useEffect(() => {
    const id = String(orgnr || '').replace(/\D/g, '');
    if (!enabled || id.length !== 9 || loaded.current === id) return undefined;
    let alive = true;
    setLoading(true);
    proxyAuthHeaders()
      .then((headers) => fetch(accountHistoryEndpoint(), {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'account-history', orgnr: id }),
      }))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!alive) return;
        loaded.current = id;
        setYears(Array.isArray(data?.years) ? data.years : []);
      })
      .catch(() => {
        if (alive) setYears([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [orgnr, enabled]);

  return { years, loading };
}
