/**
 * E-post til kunden med lenke til kundeundersøkelsen (invitasjon og påminnelse).
 * Tekst + enkel HTML med inline-stil, så den fungerer i Outlook og Gmail.
 */

export const SURVEY_BASE_URL = 'https://protop.no';
const BRAND = '#0b6bcb';

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function answerUrl(token) {
  return `${SURVEY_BASE_URL}/svar/${encodeURIComponent(String(token || ''))}`;
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

/**
 * survey: normalisert undersøkelse (med companyName og senderName).
 * recipient: { name, customerName }. reminder: true for påminnelse.
 */
export function customerSurveyMail({ survey, recipient = {}, url, reminder = false }) {
  const company = String(survey?.companyName || '').trim() || 'oss';
  const hello = firstName(recipient.name) ? `Hei ${firstName(recipient.name)},` : 'Hei,';
  const count = (survey?.questions || []).length;
  const minutes = Math.max(1, Math.min(10, Math.round(count / 4)));
  const deadline = survey?.closesOn
    ? new Date(`${survey.closesOn}T12:00:00`).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' })
    : '';
  const lines = [
    reminder
      ? `Vi sendte deg nylig en kort undersøkelse, og ser at du ikke har rukket å svare ennå. Vi setter stor pris på svaret ditt.`
      : `Takk for at du har valgt ${company}. Vi vil gjerne vite hva du synes om jobben vi gjør, så vi kan bli bedre.`,
    `Undersøkelsen har ${count} spørsmål og tar rundt ${minutes} ${minutes === 1 ? 'minutt' : 'minutter'}.${deadline ? ` Svar gjerne innen ${deadline}.` : ''}`,
    survey?.anonymous
      ? `Svarene er anonyme: ${company} ser bare samlede resultater, ikke hva du har svart.`
      : `${company} ser svaret ditt og kan ta kontakt hvis noe bør følges opp.`,
  ];
  const sign = [survey?.senderName, company].filter(Boolean).join('\n');
  const subject = `${reminder ? 'Påminnelse: ' : ''}${survey?.title || 'Kundeundersøkelse'} – ${company}`.slice(0, 160);
  const textBody = [hello, '', ...lines.flatMap((l) => [l, '']), `Svar her: ${url}`, '', 'Hilsen', sign, '', 'Lenken er personlig. Ikke send den videre.'].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f9;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1a2744">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #e2e8f0;border-radius:12px">
<tr><td style="padding:20px 28px;border-bottom:1px solid #e2e8f0;font-weight:700;font-size:18px;color:#1a2744">${esc(company)}</td></tr>
<tr><td style="padding:24px 28px;font-size:15px;line-height:1.55">
<p style="margin:0 0 12px">${esc(hello)}</p>
${lines.map((l) => `<p style="margin:0 0 12px">${esc(l)}</p>`).join('\n')}
<p style="margin:24px 0"><a href="${esc(url)}" style="background:${BRAND};color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">Svar på undersøkelsen</a></p>
<p style="margin:0">Hilsen<br>${esc(sign).replace(/\n/g, '<br>')}</p>
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">Lenken er personlig. Ikke send den videre. Sendt med ProTop på vegne av ${esc(company)}.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text: textBody, html };
}
