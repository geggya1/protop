/**
 * Sender indeksbrevet til kunden når noen ber om det.
 * Egen fil slik at avtaletolkningen ikke drar inn e-postnøkkelen.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { isValidEmail, requireAuth } from './security.js';
import { resolveMailApiKey } from './mailApiKey.js';
import { friendlyMailError, normalizePdfAttachment, sendMail } from './mail.js';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export const sendIndeksLetter = onCall(
  {
    region: 'europe-west1',
    cors: true,
    invoker: 'public',
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    requireAuth(request.auth);
    const to = String(request.data?.to || '').trim();
    if (!isValidEmail(to)) throw new HttpsError('invalid-argument', 'E-postadressen er ikke gyldig.');
    const subject = String(request.data?.subject || 'Varsel om indeksregulering').slice(0, 180);
    const cc = (Array.isArray(request.data?.cc) ? request.data.cc : [])
      .map((row) => String(row || '').trim())
      .filter((row) => isValidEmail(row))
      .slice(0, 5);
    const text = String(request.data?.text || '').trim().slice(0, 20000);
    if (text.length < 20) throw new HttpsError('invalid-argument', 'Brevet er for kort til å sendes.');
    const name = String(request.data?.name || '').slice(0, 120);
    const file = normalizePdfAttachment(request.data?.attachment);
    if (!file.ok) throw new HttpsError('invalid-argument', file.error);
    const key = await resolveMailApiKey();
    if (!key) throw new HttpsError('failed-precondition', 'E-post er ikke satt opp på serveren.');
    const html = `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;
    try {
      const sent = await sendMail(key, {
        to,
        cc,
        name,
        subject,
        text,
        html,
        attachments: file.attachment ? [file.attachment] : [],
      });
      return { ok: true, providerId: String(sent?.id || sent?.messageId || '') };
    } catch (error) {
      throw new HttpsError('internal', friendlyMailError(error));
    }
  },
);
