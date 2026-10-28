import { useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { companyAiAllowed, companyAiCall } from './companyPrivacy';

/** «Tillat AI-funksjoner» for valgt selskap (på når ingenting er valgt). */
export function useCompanyAiAllowed() {
  const { family } = useApp();
  return companyAiAllowed(family?.company);
}

/**
 * `guardAi(call)` gir AI-kallet når selskapet tillater AI, ellers et kall som feiler
 * med en forklaring. Skjermene viser feilen eller leser lokalt som før.
 */
export function useCompanyAiGuard() {
  const { family } = useApp();
  const company = family?.company;
  return useCallback((call) => companyAiCall(company, call), [company]);
}
