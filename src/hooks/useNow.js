import { useEffect, useState } from 'react';

/**
 * Klokkeslett som oppdateres jevnlig slik at dagens visning følger faktisk tid.
 * `align: true` tikker på hele intervaller (f.eks. hvert minuttskifte), så en klokke som viser
 * tt:mm bytter når minuttet skifter, uten å tegne på nytt hvert sekund.
 */
export function useNow(intervalMs = 60_000, { align = false } = {}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let id = null;
    const start = () => {
      setNow(new Date());
      id = setInterval(() => setNow(new Date()), intervalMs);
    };
    if (!align) {
      id = setInterval(() => setNow(new Date()), intervalMs);
      return () => clearInterval(id);
    }
    const wait = intervalMs - (Date.now() % intervalMs) + 20;
    const first = setTimeout(start, wait);
    return () => {
      clearTimeout(first);
      if (id) clearInterval(id);
    };
  }, [intervalMs, align]);
  return now;
}
