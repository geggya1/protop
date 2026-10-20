const FROM_EMAIL = 'noreply@protop.no';
const FROM_NAME = 'Weekplan';
const REPLY_TO = 'support@protop.no';

function detectProvider(apiKey) {
  const key = String(apiKey || '').trim();
  if (key.startsWith('re_')) return 'resend';
  if (key.startsWith('xkeysib-')) return 'brevo';
  if (key.startsWith('SG.')) return 'sendgrid';
  return 'brevo';
}

function mailError(status, message, extra = {}) {
  const err = new Error(message || `E-postfeil (${status || 'ukjent'})`);
  err.status = status || 0;
  err.details = extra;
  return err;
}

async function readJson(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 400) };
  }
}

function copyRows(cc) {
  return (Array.isArray(cc) ? cc : [])
    .map((row) => String(row || '').trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((email) => ({ email }));
}

export function normalizePdfAttachment(raw) {
  if (raw == null || raw === '') return { ok: true, attachment: null };
  if (typeof raw !== 'object') return { ok: false, error: 'PDF-vedlegget er ikke gyldig.' };
  const content = String(raw.content || '').replace(/\s/g, '');
  if (!content) return { ok: true, attachment: null };
  if (content.length > 2_000_000) return { ok: false, error: 'PDF-vedlegget er for stort.' };
  if (!/^[A-Za-z0-9+/=]+$/.test(content)) return { ok: false, error: 'PDF-vedlegget er ikke gyldig.' };
  const cleaned = String(raw.filename || 'indeksregulering.pdf').replace(/[^\w.\- ]+/g, '').slice(0, 120);
  const filename = (cleaned || 'indeksregulering.pdf').toLowerCase().endsWith('.pdf')
    ? (cleaned || 'indeksregulering.pdf')
    : `${cleaned || 'indeksregulering'}.pdf`;
  return { ok: true, attachment: { filename, contentType: 'application/pdf', content } };
}

export function providerAttachments(provider, attachments) {
  const rows = (Array.isArray(attachments) ? attachments : []).filter((row) => row?.content && row?.filename);
  if (!rows.length) return {};
  if (provider === 'brevo') {
    return { attachment: rows.map((row) => ({ content: row.content, name: row.filename })) };
  }
  if (provider === 'resend') {
    return { attachments: rows.map((row) => ({ filename: row.filename, content: row.content })) };
  }
  return {
    attachments: rows.map((row) => ({
      content: row.content,
      type: row.contentType || 'application/pdf',
      filename: row.filename,
      disposition: 'attachment',
    })),
  };
}

async function sendWithBrevo(apiKey, { to, cc, name, subject, text, html, attachments }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: to, ...(name ? { name } : {}) }],
      ...(copyRows(cc).length ? { cc: copyRows(cc) } : {}),
      replyTo: { email: REPLY_TO, name: FROM_NAME },
      subject,
      htmlContent: html,
      textContent: text,
      ...providerAttachments('brevo', attachments),
      tags: ['transactional', 'weekplan'],
      // Avoid rewriting links through the new branded tracker; inbox scanners
      // often hold those messages for 2–3 minutes on a fresh domain.
      headers: {
        'X-Mailin-Track': 'false',
        'X-Mailin-Track-Clicks': 'false',
        'X-Mailin-Track-Opens': 'false',
      },
    }),
  });
  const body = await readJson(res);
  if (!res.ok) {
    throw mailError(
      res.status,
      body?.message || body?.error || `Brevo HTTP ${res.status}`,
      body
    );
  }
  return body;
}

async function sendWithResend(apiKey, { to, cc, subject, text, html, attachments }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [to],
      ...(copyRows(cc).length ? { cc: copyRows(cc).map((row) => row.email) } : {}),
      reply_to: REPLY_TO,
      subject,
      html,
      text,
      ...providerAttachments('resend', attachments),
    }),
  });
  const body = await readJson(res);
  if (!res.ok) {
    throw mailError(
      res.status,
      body?.message || body?.name || `Resend HTTP ${res.status}`,
      body
    );
  }
  return body;
}

async function sendWithSendGrid(apiKey, { to, cc, name, subject, text, html, attachments }) {
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{
        to: [{ email: to, ...(name ? { name } : {}) }],
        ...(copyRows(cc).length ? { cc: copyRows(cc) } : {}),
      }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      reply_to: { email: REPLY_TO, name: FROM_NAME },
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html },
      ],
      ...providerAttachments('sendgrid', attachments),
    }),
  });
  const body = await readJson(res);
  if (!res.ok) {
    const first = Array.isArray(body?.errors) ? body.errors[0]?.message : '';
    throw mailError(res.status, first || `SendGrid HTTP ${res.status}`, body);
  }
  return body;
}

export function friendlyMailError(error) {
  const status = Number(error?.status || error?.code || 0);
  const raw = String(error?.message || '');
  const details = JSON.stringify(error?.details || error?.response || '');
  const blob = `${raw} ${details}`;

  if (/maximum credits exceeded/i.test(blob)) {
    return 'SendGrid-kontoen har brukt opp e-postkvoten. Bytt til Brevo eller Resend.';
  }
  if (/unverified|not verified|sender.*not|from address|domain/i.test(blob)) {
    return 'Avsender noreply@protop.no er ikke verifisert hos e-postleverandøren. Legg til og verifiser domenet protop.no.';
  }
  if (status === 401 || status === 403 || /unauthorized|forbidden|invalid api/i.test(blob)) {
    return 'E-post-API-nøkkelen er ugyldig, mangler tilgang, eller kontoen er stengt.';
  }
  return raw.slice(0, 240) || 'Kunne ikke sende e-post';
}

export async function sendMail(apiKey, message) {
  const key = String(apiKey || '').trim();
  if (!key || key.includes('undefined') || key.length < 12) {
    throw mailError(0, 'E-post-API-nøkkel mangler (MAIL_API_KEY er ikke satt).');
  }

  const provider = detectProvider(key);
  if (provider === 'resend') return sendWithResend(key, message);
  if (provider === 'sendgrid') return sendWithSendGrid(key, message);
  return sendWithBrevo(key, message);
}
