/** E-post når en avtale flytter seg mellom partene. */

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildAgreementNotice({
  title,
  detail,
  actorName,
  link,
  companyName,
} = {}) {
  const name = text(title) || 'Avtale';
  const who = text(actorName);
  const lead = text(detail) || `Det er en ny bevegelse på «${name}».`;
  const subject = `Avtale: ${name}`;
  const href = text(link);
  const textBody = [
    lead,
    who ? `Av: ${who}` : '',
    text(companyName) ? `Hos: ${companyName}` : '',
    href ? `Åpne avtalen: ${href}` : 'Åpne Avtalebehandling i ProTop.',
  ].filter(Boolean).join('\n');
  const html = `<p>${escapeHtml(lead)}</p>
${who ? `<p>Av: ${escapeHtml(who)}</p>` : ''}
${href ? `<p><a href="${escapeHtml(href)}">Åpne avtalen</a></p>` : '<p>Åpne Avtalebehandling i ProTop.</p>'}`;
  return { subject, text: textBody, html };
}
