import { useEffect, useState } from 'react';
import {
  loadProductSales,
  peekProductSales,
  productSalesAge,
  subscribeProductSales,
} from './productSalesStorage.js';

/**
 * Produktsalg i egen samling for selskapet. Kjent liste vises med en gang,
 * og en fersk lesing oppdaterer den i bakgrunnen. Lagring og sletting andre
 * steder i appen kommer inn via lytteren.
 * maxAgeMs: hopp over ny lesing når listen er lest så nylig (prosjektsidene).
 */
export function useProductSales(companyId, { maxAgeMs = 0 } = {}) {
  const id = String(companyId || '').trim();
  const [rows, setRows] = useState(() => peekProductSales(id));
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setRows(id ? peekProductSales(id) : []);
    setError('');
    const off = subscribeProductSales((key, next) => {
      if (live && key === id) setRows(next);
    });
    const fresh = maxAgeMs > 0 && peekProductSales(id) && productSalesAge(id) < maxAgeMs;
    if (id && !fresh) {
      loadProductSales(id).then((next) => {
        if (live) setRows(next);
      }).catch((cause) => {
        if (!live) return;
        setRows((current) => current || []);
        setError(String(cause?.message || '') || 'Kunne ikke laste produktsalg.');
      });
    }
    return () => {
      live = false;
      off();
    };
  }, [id, maxAgeMs]);

  return { rows: rows || [], ready: rows != null, error };
}
