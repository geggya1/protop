/**
 * Daglig SSB-sjekk for indeksregulering. Egen inngang slik at scheduler
 * ikke ligger i samme deploy som kallbare funksjoner.
 */
import './setRegion.js';

export { indeksSsbDaily } from './indeksreguleringAi.js';
