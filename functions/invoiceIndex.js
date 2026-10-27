/**
 * Deploy entry for utsending av fakturaer: e-post med PDF og vedlegg, EHF via aksesspunkt,
 * og oppslag i Peppol-katalogen. Nøklene hentes i kjøring (runtimeSecret.js).
 */
import './setRegion.js';
import { initializeApp, getApps } from 'firebase-admin/app';

if (!getApps().length) initializeApp();

export { sendInvoiceMail, sendInvoiceEhf, lookupPeppolReceiver } from './invoiceDelivery.js';
