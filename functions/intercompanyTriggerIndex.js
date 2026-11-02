/**
 * Deploy-inngang for speiling av timer og salg mellom tilknyttede selskaper (Firestore-triggere).
 */
import './setRegion.js';

export { onIcTimeEntryWritten, onIcProjectStateWritten } from './intercompanyTriggers.js';
