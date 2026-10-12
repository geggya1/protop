/**
 * Morgenpost for anbudsvarsling. Leser bare selskaper som har slått på e-post.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { sendMail } from './mail.js';
import { resolveMailApiKey } from './mailApiKey.js';
import { searchDoffinNotices } from './anbud/doffinQuery.js';
import { buildTenderAlert } from '../src/anbud/alertMail.js';
import { digestSelection } from '../src/anbud/desk.js';
import { normalizeDoffinHit, watchQuery } from '../src/anbud/model.js';

if (!getApps().length) initializeApp();

export async function runAnbudDigest({ limit = 20 } = {}) {
  const apiKey = await resolveMailApiKey();
  if (!apiKey) {
    logger.info('anbud digest hoppet over, e-post er ikke konfigurert');
    return { ok: false, sent: 0 };
  }
  const db = getFirestore();
  const snap = await db.collectionGroup('anbud').where('digestEnabled', '==', true).limit(limit).get();
  let sent = 0;
  for (const doc of snap.docs) {
    if (doc.id !== 'state') continue;
    const state = doc.data()?.state || {};
    const watch = state.watch || {};
    const emails = Array.isArray(watch.emails) ? watch.emails.slice(0, 10) : [];
    const query = watchQuery(watch);
    if (!query || !emails.length) continue;
    try {
      const found = await searchDoffinNotices({
        cpvCodes: query.cpvCodes,
        locationIds: query.locationIds,
        searchString: query.cpvCodes?.length ? '' : ((query.keywords || [])[0] || ''),
        numHitsPerPage: 20,
      });
      const hits = (found.hits || []).map(normalizeDoffinHit).filter(Boolean);
      const notices = digestSelection(hits, { limit: 12 });
      if (!notices.length) continue;
      const message = buildTenderAlert({
        companyName: watch.companyName,
        cpvCodes: watch.cpvCodes,
        keywords: watch.keywords,
        notices,
        lead: 'Dette er morgenvarslet. Treffene er hentet fra åpne kunngjøringer og sortert med det som ligner mest på profilen først.',
      });
      for (const to of emails) {
        await sendMail(apiKey, { to, subject: message.subject, text: message.text, html: message.html });
      }
      await doc.ref.set({
        state: { ...state, watch: { ...watch, digestAt: new Date().toISOString() } },
      }, { merge: true });
      sent += 1;
    } catch (error) {
      logger.warn('anbud digest feilet for ett selskap', { message: error?.message });
    }
  }
  logger.info('anbud digest ferdig', { companies: sent });
  return { ok: true, sent };
}

export const anbudDigestDaily = onSchedule(
  {
    schedule: 'every day 06:15',
    timeZone: 'Europe/Oslo',
    region: 'europe-west1',
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async () => {
    try {
      await runAnbudDigest();
    } catch (error) {
      logger.error('anbud digest feilet', { message: error?.message });
    }
  },
);
