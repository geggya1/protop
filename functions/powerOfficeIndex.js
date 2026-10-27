/**
 * Deploy entry for PowerOffice Go (fakturautkast og fakturastatus).
 * Nøklene hentes fra Secret Manager i kjøring (runtimeSecret.js), uten defineSecret,
 * så GitHub-deployen ikke trenger tilgang til dem.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2/options';

if (!getApps().length) initializeApp();
setGlobalOptions({ region: 'europe-west1' });

export {
  powerOfficeStatus,
  powerOfficeConnect,
  powerOfficeDisconnect,
  powerOfficeProducts,
  powerOfficeTransferInvoice,
  powerOfficeSyncInvoices,
} from './powerOffice.js';
