import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { sendMail, friendlyMailError } from './mail.js';
import { resolveMailApiKey } from './mailApiKey.js';
import { requireAuth, isValidEmail, redactEmail, hashRateKey, assertRateLimit } from './security.js';
import { buildTenderAlert } from '../src/anbud/alertMail.js';

if (!getApps().length) initializeApp();

export const sendTenderAlert = onCall(
  {
    region: 'europe-west1',
    cors: true,
    invoker: 'public',
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    try {
      const uid = requireAuth(request.auth);
      const emails = (Array.isArray(request.data?.emails) ? request.data.emails : [])
        .map((row) => String(row || '').trim().toLowerCase())
        .filter((row) => isValidEmail(row))
        .slice(0, 10);
      if (!emails.length) throw new HttpsError('invalid-argument', 'Legg inn minst én mottaker.');
      const message = buildTenderAlert({
        companyName: request.data?.companyName,
        cpvCodes: request.data?.cpvCodes,
        notices: request.data?.notices,
      });
      const apiKey = await resolveMailApiKey();
      if (!apiKey) return { ok: false, error: 'E-post er ikke konfigurert (MAIL_API_KEY mangler).' };
      await assertRateLimit(getFirestore(), {
        key: hashRateKey(['tender-alert', uid]),
        limit: 10,
        windowMs: 60 * 60 * 1000,
      });
      for (const to of emails) {
        await sendMail(apiKey, { to, subject: message.subject, text: message.text, html: message.html });
        logger.info('anbudsvarsel sendt', { to: redactEmail(to) });
      }
      return { ok: true, sent: emails.length };
    } catch (error) {
      if (error instanceof HttpsError) return { ok: false, error: error.message };
      return { ok: false, error: friendlyMailError(error) };
    }
  },
);
