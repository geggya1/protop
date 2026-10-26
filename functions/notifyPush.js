/**
 * Push og e-post for hvert nytt varsel i users/{uid}/notifications, uansett hvem som
 * lagde det (appen eller en funksjon), etter brukerens varselinnstillinger.
 * Avgjørelse og sending ligger i pushDelivery.js og notifyEmail.js.
 */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { deliverNotification } from './pushDelivery.js';

if (!getApps().length) initializeApp();

export const onNotificationPush = onDocumentCreated(
  {
    document: 'users/{uid}/notifications/{notifId}',
    region: 'europe-west1',
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (event) => {
    const { uid, notifId } = event.params || {};
    const notif = event.data?.data?.() || {};
    if (!uid) return;
    try {
      const result = await deliverNotification({
        db: getFirestore(),
        uid,
        notifId,
        notif,
        ref: event.data?.ref || null,
      });
      logger.info('Varsel levert', {
        uid, notifId, eventType: notif.eventType || '', push: result.sent, reason: result.reason, mail: result.mail.reason,
      });
    } catch (err) {
      logger.warn('Push feilet', { uid, notifId, message: err?.message });
    }
  },
);
