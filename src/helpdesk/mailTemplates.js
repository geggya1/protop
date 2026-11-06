/**
 * Helpdesk: e-poster til kunde og team. Tekst + enkel HTML (inline-stil,
 * fungerer i Outlook/Gmail). Ren JS, testes i node.
 */

import {
  categoryLabel, moduleLabel, priorityLabel, statusLabel,
} from './model.js';
import { escapeHtml as esc } from '../utils/mailHtml.js';

export const HELP_BASE_URL = 'https://protop.no';
const BRAND = '#0b6bcb';

function para(text) {
  return esc(text).replace(/\r?\n/g, '<br>');
}

function quote(text, max = 1200) {
  const t = String(text || '');
  return t.length > max ? `${t.slice(0, max)} …` : t;
}

export function ticketUrl(ticket) {
  return `${HELP_BASE_URL}/hjelp/sak/${encodeURIComponent(ticket?.id || '')}`;
}

export function portalUrl(ticket) {
  return ticket?.id
    ? `${HELP_BASE_URL}/helpdesk/sak/${encodeURIComponent(ticket.id)}`
    : `${HELP_BASE_URL}/helpdesk`;
}

function shell({ preheader = '', heading, bodyHtml, cta = null, footer = '' }) {
  const button = cta
    ? `<p style="margin:24px 0"><a href="${esc(cta.url)}" style="background:${BRAND};color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">${esc(cta.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f4f6f9;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1a2744">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #e2e8f0;border-radius:12px">
<tr><td style="padding:20px 28px;border-bottom:1px solid #e2e8f0;font-weight:700;font-size:18px;color:${BRAND}">ProTop Support</td></tr>
<tr><td style="padding:24px 28px;font-size:15px;line-height:1.55">
<h1 style="font-size:20px;margin:0 0 12px">${esc(heading)}</h1>
${bodyHtml}
${button}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">${footer || 'Svar gjerne på saken i ProTop, så holder vi alt samlet på ett sted. Dette er en automatisk e-post fra ProTop.'}</td></tr>
</table></td></tr></table></body></html>`;
}

function factRows(rows) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0;font-size:14px">${rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:3px 16px 3px 0;color:#64748b;white-space:nowrap">${esc(k)}</td><td style="padding:3px 0;font-weight:600">${esc(v)}</td></tr>`)
    .join('')}</table>`;
}

function textFacts(rows) {
  return rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');
}

/** Kvittering til kunden når saken er opprettet. */
export function ticketCreatedMail(ticket, { lang = 'nb', articles = [] } = {}) {
  const name = ticket.requester?.name ? ` ${ticket.requester.name.split(' ')[0]}` : '';
  const facts = [
    ['Saksnummer', ticket.number],
    ['Tittel', ticket.subject],
    ['Kategori', categoryLabel(ticket.category, lang)],
    ['Område', moduleLabel(ticket.module, lang)],
    ['Prioritet', priorityLabel(ticket.priority, lang)],
    ['Vedlegg', ticket.attachments?.length ? `${ticket.attachments.length} bilde(r)` : ''],
  ];
  const tips = (articles || []).slice(0, 3);
  const tipsHtml = tips.length
    ? `<p style="margin:16px 0 4px;font-weight:600">Mens du venter, kan dette hjelpe:</p><ul style="margin:0;padding-left:20px">${tips.map((a) => `<li><a href="${esc(`${HELP_BASE_URL}/hjelp/artikkel/${a.id}`)}" style="color:${BRAND}">${esc(a.title)}</a></li>`).join('')}</ul>`
    : '';
  const subject = `[${ticket.number}] Vi har mottatt saken din: ${ticket.subject}`;
  const text = [
    `Hei${name},`,
    '',
    `Takk for at du tok kontakt. Saken din er registrert med saksnummer ${ticket.number}.`,
    '',
    textFacts(facts),
    '',
    'Det du skrev:',
    quote(ticket.body),
    '',
    'Slik går det videre:',
    '1. Vi ser på saken og svarer deg i ProTop og på e-post.',
    '2. Trenger vi mer info, spør vi i saken.',
    '3. Når saken er løst, får du beskjed og kan gi oss en vurdering.',
    '',
    `Følg saken: ${ticketUrl(ticket)}`,
    tips.length ? `\nMens du venter:\n${tips.map((a) => `- ${a.title}: ${HELP_BASE_URL}/hjelp/artikkel/${a.id}`).join('\n')}` : '',
    '',
    'Hilsen ProTop Support',
  ].join('\n');
  const html = shell({
    preheader: `Saksnummer ${ticket.number}`,
    heading: `Vi har mottatt saken din (${ticket.number})`,
    bodyHtml: `<p>Hei${esc(name)},</p><p>Takk for at du tok kontakt. Saken din er registrert, og du får svar her på e-post og i ProTop.</p>
${factRows(facts)}
<p style="margin:16px 0 4px;font-weight:600">Det du skrev</p>
<div style="background:#f8fafc;border-left:3px solid ${BRAND};padding:10px 14px;border-radius:4px">${para(quote(ticket.body))}</div>
<p style="margin:16px 0 4px;font-weight:600">Slik går det videre</p>
<ol style="margin:0;padding-left:20px"><li>Vi ser på saken og svarer deg i ProTop og på e-post.</li><li>Trenger vi mer info, spør vi i saken.</li><li>Når saken er løst, får du beskjed og kan gi oss en vurdering.</li></ol>
${tipsHtml}`,
    cta: { label: 'Følg saken i ProTop', url: ticketUrl(ticket) },
  });
  return { subject, text, html };
}

/** Svar fra support til kunden. */
export function agentReplyMail(ticket, message, { lang = 'nb' } = {}) {
  const subject = `[${ticket.number}] Nytt svar på saken din: ${ticket.subject}`;
  const askedForInfo = ticket.status === 'pending';
  const text = [
    `${message.authorName || 'ProTop support'} har svart på saken din (${ticket.number}):`,
    '',
    quote(message.body, 4000),
    '',
    askedForInfo ? 'Vi venter på svar fra deg. Svar i ProTop, så går saken videre.' : '',
    `Svar eller se hele saken: ${ticketUrl(ticket)}`,
    '',
    'Hilsen ProTop Support',
  ].filter((l) => l !== null).join('\n');
  const html = shell({
    preheader: quote(message.body, 120),
    heading: `Nytt svar på ${ticket.number}`,
    bodyHtml: `<p><strong>${esc(message.authorName || 'ProTop support')}</strong> har svart på saken din «${esc(ticket.subject)}»:</p>
<div style="background:#f8fafc;border-left:3px solid ${BRAND};padding:10px 14px;border-radius:4px">${para(quote(message.body, 4000))}</div>
${askedForInfo ? '<p>Vi venter på svar fra deg. Svar i ProTop, så går saken videre.</p>' : ''}
${factRows([['Status', statusLabel(ticket.status, { lang })]])}`,
    cta: { label: 'Svar i ProTop', url: ticketUrl(ticket) },
  });
  return { subject, text, html };
}

/** Saken er løst eller lukket. Ber om vurdering (CSAT). */
export function ticketSolvedMail(ticket, { lang = 'nb', note = '' } = {}) {
  const closed = ticket.status === 'closed';
  const subject = `[${ticket.number}] Saken din er ${closed ? 'lukket' : 'løst'}: ${ticket.subject}`;
  const rateUrl = `${ticketUrl(ticket)}?vurder=1`;
  const text = [
    `Saken din ${ticket.number} «${ticket.subject}» er ${closed ? 'lukket og lagt i arkivet' : 'markert som løst'}.`,
    note ? `\n${quote(note, 2000)}\n` : '',
    closed
      ? 'Trenger du mer hjelp med det samme, oppretter du en ny sak og viser til saksnummeret.'
      : 'Er det ikke løst? Svar i saken innen 7 dager, så åpner vi den igjen.',
    '',
    `Hvordan var hjelpen? Gi oss en rask vurdering: ${rateUrl}`,
    '',
    'Hilsen ProTop Support',
  ].join('\n');
  const html = shell({
    preheader: `${ticket.number} er ${closed ? 'lukket' : 'løst'}`,
    heading: `Saken din er ${closed ? 'lukket' : 'løst'}`,
    bodyHtml: `<p>Saken <strong>${esc(ticket.number)}</strong> «${esc(ticket.subject)}» er ${closed ? 'lukket og lagt i arkivet' : 'markert som løst'}.</p>
${note ? `<div style="background:#f8fafc;border-left:3px solid ${BRAND};padding:10px 14px;border-radius:4px">${para(quote(note, 2000))}</div>` : ''}
<p>${closed ? 'Trenger du mer hjelp med det samme, oppretter du en ny sak og viser til saksnummeret.' : 'Er det ikke løst? Svar i saken innen 7 dager, så åpner vi den igjen.'}</p>
<p style="margin-top:20px;font-weight:600">Hvordan var hjelpen?</p>
<p><a href="${esc(`${rateUrl}&svar=good`)}" style="color:#15803d;font-weight:600;margin-right:18px">👍 Bra</a><a href="${esc(`${rateUrl}&svar=bad`)}" style="color:#b91c1c;font-weight:600">👎 Ikke bra</a></p>`,
    cta: { label: 'Se saken', url: ticketUrl(ticket) },
  });
  return { subject, text, html };
}

/** Varsel til helpdesk-teamet om ny sak eller nytt kundesvar. */
export function teamAlertMail(ticket, { kind = 'new', message = null, digest = '' } = {}) {
  const subject = kind === 'new'
    ? `[Helpdesk] Ny sak ${ticket.number} (${priorityLabel(ticket.priority)}): ${ticket.subject}`
    : `[Helpdesk] Kunden svarte på ${ticket.number}: ${ticket.subject}`;
  const facts = [
    ['Fra', `${ticket.requester?.name || ''} <${ticket.requester?.email || 'ukjent e-post'}>`],
    ['Bruker-id', ticket.requester?.uid],
    ['Bedrift', ticket.requester?.companyName],
    ['Kategori', categoryLabel(ticket.category)],
    ['Område', moduleLabel(ticket.module)],
    ['Prioritet', priorityLabel(ticket.priority)],
  ];
  const body = kind === 'new' ? ticket.body : message?.body || '';
  const aiLine = ticket.ai?.summary ? `AI: ${ticket.ai.summary}` : '';
  const text = [
    subject,
    '',
    textFacts(facts),
    aiLine,
    '',
    quote(body, 3000),
    '',
    digest ? `Teknisk:\n${digest}` : '',
    '',
    `Åpne i helpdesk: ${portalUrl(ticket)}`,
  ].join('\n');
  const html = shell({
    preheader: quote(body, 120),
    heading: kind === 'new' ? `Ny sak ${ticket.number}` : `Kundesvar på ${ticket.number}`,
    bodyHtml: `${factRows(facts)}
${aiLine ? `<p style="background:#eef6ff;padding:8px 12px;border-radius:6px">🤖 ${esc(ticket.ai.summary)}</p>` : ''}
<div style="background:#f8fafc;border-left:3px solid ${BRAND};padding:10px 14px;border-radius:4px">${para(quote(body, 3000))}</div>
${digest ? `<pre style="font-size:12px;background:#0f172a;color:#e2e8f0;padding:12px;border-radius:6px;white-space:pre-wrap">${esc(digest)}</pre>` : ''}`,
    cta: { label: 'Åpne i helpdesk', url: portalUrl(ticket) },
    footer: 'Du får denne fordi du er med i ProTop Helpdesk-teamet.',
  });
  return { subject, text, html };
}

/** Invitasjon til helpdesk-teamet. */
export function teamInviteMail({ email, invitedByName = '', role = 'agent' }) {
  const subject = 'Du er invitert til ProTop Helpdesk';
  const url = `${HELP_BASE_URL}/helpdesk`;
  const roleText = role === 'owner' ? 'eier' : 'saksbehandler';
  const text = [
    `${invitedByName || 'ProTop'} har invitert deg som ${roleText} i ProTop Helpdesk.`,
    '',
    `Logg inn med ${email} på ${url}. Tilgangen aktiveres første gang du logger inn.`,
    'Har du ikke ProTop-konto, oppretter du en med den samme e-postadressen.',
  ].join('\n');
  const html = shell({
    preheader: 'Invitasjon til ProTop Helpdesk',
    heading: 'Du er invitert til ProTop Helpdesk',
    bodyHtml: `<p><strong>${esc(invitedByName || 'ProTop')}</strong> har invitert deg som ${esc(roleText)} i ProTop Helpdesk.</p>
<p>Logg inn med <strong>${esc(email)}</strong>. Tilgangen aktiveres første gang du logger inn. Har du ikke ProTop-konto, oppretter du en med den samme e-postadressen.</p>`,
    cta: { label: 'Åpne ProTop Helpdesk', url },
    footer: 'Forventet du ikke denne invitasjonen, kan du se bort fra e-posten.',
  });
  return { subject, text, html };
}
