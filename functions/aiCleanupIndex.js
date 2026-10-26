/**
 * Opprydding av utløpte AI-utkast hver sjette time. Egen inngang slik at
 * scheduler ikke ligger i samme deploy som kallbare funksjoner.
 */
import './setRegion.js';
import './geminiEnv.js';

export { aiCleanupScheduled } from './aiCallables.js';
