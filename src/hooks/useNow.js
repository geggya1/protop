import { useEffect, useState } from 'react';

/** Klokkeslett som oppdateres jevnlig slik at dagens visning følger faktisk tid. */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
