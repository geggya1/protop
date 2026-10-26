/**
 * E-post for et varsel når brukeren har e-post på for typen (varselinnstillingene).
 * Typer som sender egen e-post (invitasjoner, ferieplan) sendes ikke herfra.
 */
import * as logger from 'firebase-functions/logger';
import { sendMail } from './mail.js';
import { escapeHtml } from './inviteMessage.js';
import { resolveMailApiKey } from './mailApiKey.js';
import { notificationType } from '../src/notifications/prefs.js';

const APP_URL = 'https://www.protop.no';
export const NOTIFICATION_SETTINGS_URL = `${APP_URL}/settings/notifications`;
const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value) {
  return String(value ?? '').trim();
}

export function buildNotificationEmail({ to, name = '', notif = {} }) {
  const type = notificationType(notif.eventType);
  const title = text(notif.title) || type.label;
  const body = text(notif.body).slice(0, 2000);
  const hello = name ? `Hei ${name},` : 'Hei,';
  const why = `Du får denne e-posten fordi «${type.label}» er slått på i varselinnstillingene dine.`;
  return {
    to,
    name,
    fromName: 'ProTop',
    subject: `ProTop: ${title}`.slice(0, 160),
    text: [hello, '', title, body, '', `Åpne ProTop: ${APP_URL}`, '', why, `Endre varsler: ${NOTIFICATION_SETTINGS_URL}`]
      .filter((line, i, all) => line !== '' || all[i - 1] !== '')
      .join('\n'),
    html: `
      <p>${escapeHtml(hello)}</p>
      <p><strong>${escapeHtml(title)}</strong></p>
      ${body ? `<p style="color:#334155">${escapeHtml(body).replace(/\n/g, '<br/>')}</p>` : ''}
      <p><a href="${APP_URL}" style="display:inline-block;background:#0b74d1;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Åpne ProTop</a></p>
      <p style="color:#94a3b8;font-size:12px">${escapeHtml(why)}
        <a href="${NOTIFICATION_SETTINGS_URL}">Endre varsler</a></p>
    `,
  };
}

export async function sendNotificationEmail({ to, name, notif, deps = {} }) {
  const address = text(to).toLowerCase();
  if (!VALID_EMAIL.test(address)) return { sent: false, reason: 'no-address' };
  const key = deps.mailKey !== undefined ? deps.mailKey : await resolveMailApiKey();
  if (!key) return { sent: false, reason: 'missing-key' };
  try {
    await (deps.sendMail || sendMail)(key, buildNotificationEmail({ to: address, name, notif }));
    return { sent: true, reason: 'sent' };
  } catch (err) {
    logger.warn('Varsel-e-post feilet', { eventType: notif?.eventType || '', message: err?.message });
    return { sent: false, reason: 'failed' };
  }
}
