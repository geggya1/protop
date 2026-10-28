function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Venneinvitasjon på e-post og SMS (L-33). Én melding som en bruker selv sender, med tydelig
 * avsender («Ola Nordmann inviterer deg til ProTop»), uten markedsføring og uten purringer.
 * Avsendernavnet kommer fra serveren (senderName.js), ikke fra klienten.
 */
const SENT_FOR = (who) => `Sendt av ProTop (protop.no) på vegne av ${who}.`;
const SINGLE_NOTE = (who) => `${who} skrev inn adressen din i ProTop. Dette er én invitasjon, og du får ingen purringer fra oss. Vil du ikke, trenger du ikke gjøre noe.`;

export function buildFriendInviteMessage({
  to, name, fromName, registerUrl, existingUser = false,
}) {
  const who = fromName || 'En ProTop-bruker';
  const greet = name ? `Hei ${name}` : 'Hei';
  if (existingUser) {
    return {
      to,
      name,
      subject: `${who} vil bli venn med deg på ProTop`,
      text:
        `${greet},\n\n` +
        `${who} har sendt deg en venneforespørsel på ProTop.\n\n` +
        `Godta eller avslå her: ${registerUrl}\n\n` +
        `${SENT_FOR(who)}`,
      html: `
    <p>${escapeHtml(greet)},</p>
    <p><strong>${escapeHtml(who)}</strong> har sendt deg en venneforespørsel på ProTop.</p>
    <p>
      <a href="${registerUrl}"
         style="background:#1099F4;color:#fff;padding:10px 16px;border-radius:8px;
                text-decoration:none;display:inline-block">
        Godta eller avslå
      </a>
    </p>
    <p style="color:#475569;font-size:13px">Hvis knappen ikke virker: ${escapeHtml(registerUrl)}</p>
    <p style="color:#475569;font-size:13px">${escapeHtml(SENT_FOR(who))}</p>
  `,
    };
  }
  return {
    to,
    name,
    subject: `${who} inviterer deg til ProTop`,
    text:
      `${greet},\n\n` +
      `${who} inviterer deg til ProTop og vil gjerne bli venner der.\n\n` +
      `Se invitasjonen: ${registerUrl}\n\n` +
      `${SINGLE_NOTE(who)}\n\n` +
      `${SENT_FOR(who)}`,
    html: `
    <p>${escapeHtml(greet)},</p>
    <p><strong>${escapeHtml(who)}</strong> inviterer deg til ProTop og vil gjerne bli venner der.</p>
    <p>
      <a href="${registerUrl}"
         style="background:#1099F4;color:#fff;padding:10px 16px;border-radius:8px;
                text-decoration:none;display:inline-block">
        Se invitasjonen
      </a>
    </p>
    <p style="color:#475569;font-size:13px">Hvis knappen ikke virker: ${escapeHtml(registerUrl)}</p>
    <p style="color:#475569;font-size:13px">${escapeHtml(SINGLE_NOTE(who))}</p>
    <p style="color:#475569;font-size:13px">${escapeHtml(SENT_FOR(who))}</p>
  `,
  };
}

export function buildFriendInviteSms({ name, fromName, registerUrl, existingUser = false }) {
  const who = fromName || 'En ProTop-bruker';
  const hi = name ? `Hei ${name}!` : 'Hei!';
  const url = registerUrl || 'https://www.protop.no/register';
  if (existingUser) {
    return `${hi} ${who} vil bli venn med deg på ProTop. Godta eller avslå: ${url}`;
  }
  return `${hi} ${who} inviterer deg til ProTop: ${url} Én invitasjon, ingen purringer.`;
}
