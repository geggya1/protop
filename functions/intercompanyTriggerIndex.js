/**
 * Deploy-inngang for speiling av timer og salg mellom tilknyttede selskaper (Firestore-triggere).
 */
import './setRegion.js';

export {
  onIcTimeEntryWritten, onIcProjectStateWritten, onIcProjectExpenseWritten, onIcInvoiceWritten,
} from './intercompanyTriggers.js';
