import { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';

/**
 * Lenker som /groups/{id} skal vise den gruppen. Skjermene leser den aktive gruppen,
 * så gruppen i adressen gjøres aktiv når personen er med i den (én gang per lenke).
 * switching er sann til byttet er gjort, så skjermen ikke viser en annen gruppe imens.
 */
export function useRouteFamily(routeFamilyId) {
  const { familyId, families, selectFamily } = useApp();
  const handled = useRef(null);
  const known = !!routeFamilyId && (families || []).some((f) => f.id === routeFamilyId);

  useEffect(() => {
    if (!known || handled.current === routeFamilyId) return;
    handled.current = routeFamilyId;
    if (routeFamilyId !== familyId) selectFamily(routeFamilyId);
  }, [known, routeFamilyId, familyId, selectFamily]);

  return { switching: known && routeFamilyId !== familyId && handled.current !== routeFamilyId };
}
