/** Transactional SMS via Brevo (same MAIL_API_KEY when provider is Brevo). */

const SMS_SENDER = 'Weekplan'; // max 11 alphanumeric for Brevo

function detectProvider(apiKey) {
  const key = String(apiKey || '').trim();
  if (key.startsWith('re_')) return 'resend';
  if (key.startsWith('xkeysib-')) return 'brevo';
  if (key.startsWith('SG.')) return 'sendgrid';
  // Default assumption matches mail.js
  return 'brevo';
}

function smsError(status, message, extra = {}) {
  const err = new Error(message || `SMS-feil (${status || 'ukjent'})`);
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

/** Normalize to +E.164 digits for Brevo. */
export function toE164(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits || digits.length < 8 || digits.length > 15) return '';
  return `+${digits}`;
}

export function friendlySmsError(error) {
  const status = Number(error?.status || error?.code || 0);
  const raw = String(error?.message || '');
  const details = JSON.stringify(error?.details || error?.response || '');
  const blob = `${raw} ${details}`;

  if (/not.?brevo|resend|sendgrid/i.test(blob)) {
    return raw.slice(0, 240);
  }
  if (/insufficient|credit|balance|quota/i.test(blob)) {
    return 'Brevo SMS-kredittene er tomme. Kjøp SMS-kreditt i Brevo-kontoen.';
  }
  if (/sender|unauthorised|unauthorized|not.?allowed|not.?registered/i.test(blob)) {
    return 'SMS-avsender «Weekplan» er ikke godkjent hos Brevo for dette landet. Registrer avsendernavn i Brevo.';
  }
  if (/invalid.*(number|phone|recipient)|bad.?request/i.test(blob) || status === 400) {
    return 'Ugyldig telefonnummer. Bruk landskode, f.eks. +47…';
  }
  if (status === 401 || status === 403 || /unauthorized|forbidden|invalid api/i.test(blob)) {
    return 'API-nøkkelen mangler SMS-tilgang, er ugyldig, eller kontoen er stengt.';
  }
  return raw.slice(0, 240) || 'Kunne ikke sende SMS';
}

async function sendWithBrevoSms(apiKey, { to, content, sender = SMS_SENDER }) {
  const e164 = toE164(to);
  if (!e164) {
    throw smsError(400, 'Ugyldig telefonnummer');
  }
  // Brevo wants digits with country code, without leading +.
  const recipient = e164.replace(/^\+/, '');
  const safeSender = String(sender || SMS_SENDER).replace(/[^a-zA-Z0-9]/g, '').slice(0, 11) || 'Weekplan';
  const bodyText = String(content || '').trim().slice(0, 640);
  if (!bodyText) {
    throw smsError(400, 'Tom SMS-tekst');
  }

  const res = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender: safeSender,
      recipient,
      content: bodyText,
      type: 'transactional',
      unicodeEnabled: true,
    }),
  });
  const body = await readJson(res);
  if (!res.ok) {
    throw smsError(
      res.status,
      body?.message || body?.error || `Brevo SMS HTTP ${res.status}`,
      body
    );
  }
  return body;
}

/**
 * Send transactional SMS. Currently Brevo only (same key as email when xkeysib-…).
 */
export async function sendSms(apiKey, message) {
  const key = String(apiKey || '').trim();
  if (!key || key.includes('undefined') || key.length < 12) {
    throw smsError(0, 'E-post/SMS-API-nøkkel mangler (MAIL_API_KEY er ikke satt).');
  }

  const provider = detectProvider(key);
  if (provider === 'resend') {
    throw smsError(0, 'SMS støttes ikke via Resend. Bytt MAIL_API_KEY til Brevo, eller sett opp egen SMS-leverandør.');
  }
  if (provider === 'sendgrid') {
    throw smsError(0, 'SMS via SendGrid krever Twilio. Bytt til Brevo for SMS med samme nøkkel, eller koble Twilio separat.');
  }

  return sendWithBrevoSms(key, message);
}

export function buildInviteSms({ name, familyName, groupType, joinCode, registerUrl, existingUser = false }) {
  const label = familyName || 'gruppen';
  const team = ['team', 'club'].includes(String(groupType || '').toLowerCase());
  const classroom = ['class', 'classroom'].includes(String(groupType || '').toLowerCase());
  const who = name ? `Hei ${name}!` : 'Hei!';
  const codeBit = joinCode ? ` ${classroom ? 'Klassekode' : 'Lagkode'}: ${joinCode}.` : '';
  const url = registerUrl || 'https://www.protop.no/register';
  const role = team
    ? `Du er invitert til idrettslaget «${label}» på Weekplan.`
    : (classroom
      ? `Du er invitert til klassen «${label}» på Weekplan.`
      : `Du er invitert til familien «${label}» på Weekplan.`);
  if (existingUser) {
    return `${who} ${role}${codeBit} Du har allerede konto — godta invitasjonen: ${url}`;
  }
  return `${who} ${role}${codeBit} Registrer deg: ${url}`;
}
