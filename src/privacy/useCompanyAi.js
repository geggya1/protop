import { useCallback } from 'react';
import { useOptionalApp } from '../context/AppContext';
import { companyAiAllowed, companyAiCall } from './companyPrivacy';

// useOptionalApp: komponentene rendres også uten AppProvider (forhåndsvisninger og tester).

/** «Tillat AI-funksjoner» for valgt selskap (på når ingenting er valgt). */
export function useCompanyAiAllowed() {
  const app = useOptionalApp();
  return companyAiAllowed(app?.family?.company);
}

/**
 * `guardAi(call)` gir AI-kallet når selskapet tillater AI, ellers et kall som feiler
 * med en forklaring. Skjermene viser feilen eller leser lokalt som før.
 */
export function useCompanyAiGuard() {
  const app = useOptionalApp();
  const company = app?.family?.company;
  return useCallback((call) => companyAiCall(company, call), [company]);
}
