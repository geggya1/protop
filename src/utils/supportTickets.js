/**
 * Supportsaker fra ProTop-assistenten. Sakene går til ProTop Helpdesk
 * (src/helpdesk, callable `helpdesk`), med samme saksnummer, kvittering på
 * e-post og teknisk info som skjemaet i hjelpesenteret.
 */

import { helpdeskCall } from '../helpdesk/client';
import { collectDiagnostics } from '../helpdesk/diagnostics';

export function looksLikeBugReport(text = '') {
  const q = String(text).toLowerCase();
  return /feil|bug|error|crash|krasj|hvit skjerm|white screen|blank|500|404|fungerer ikke|virker ikke|broken|exception|stack/.test(q);
}

/**
 * Oppretter en helpdesk-sak. Returnerer { ticketId, ticketNumber } som før,
 * så assistenten kan vise saksnummeret.
 */
export async function createSupportTicket(payload = {}) {
  const subject = String(payload.title || '').trim();
  const body = String(payload.body || '').trim();
  const category = payload.category === 'bug' || looksLikeBugReport(`${subject} ${body}`) ? 'bug' : 'question';
  const res = await helpdeskCall('createTicket', {
    subject: subject.length >= 3 ? subject : 'Spørsmål fra assistenten',
    body: body.length >= 10 ? body : `${body}\n\n(Sendt fra ProTop-assistenten)`.trim(),
    category,
    impact: category === 'bug' ? 'hard' : 'minor',
    companyId: payload.familyId || '',
    transcript: body,
    lang: payload.lang === 'en' ? 'en' : 'nb',
    shareDiagnostics: true,
    diagnostics: collectDiagnostics({}),
    attachments: [],
  });
  return {
    ticketId: res?.id,
    ticketNumber: res?.number,
    channel: 'helpdesk',
    category,
    receiptSent: !!res?.receiptSent,
  };
}
