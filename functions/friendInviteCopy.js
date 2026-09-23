function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildFriendInviteMessage({
  to, name, fromName, registerUrl, existingUser = false,
}) {
  const who = fromName || 'Noen';
  const greet = name ? `Hei ${name}` : 'Hei';
  if (existingUser) {
    return {
      to,
      name,
      subject: `${who} vil gjerne bli venn med deg på Weekplan`,
      text:
        `${greet},\n\n` +
        `${who} har sendt deg en venneforespørsel på Weekplan.\n\n` +
        `Du har allerede konto — godta her: ${registerUrl}\n\n` +
        `Hilsen Weekplan-teamet`,
      html: `
    <p>${escapeHtml(greet)},</p>
    <p><strong>${escapeHtml(who)}</strong> vil gjerne bli venn med deg på Weekplan.</p>
    <p>Du har allerede en konto. Åpne lenken for å godta eller avslå.</p>
    <p>
      <a href="${registerUrl}"
         style="background:#1099F4;color:#fff;padding:10px 16px;border-radius:8px;
                text-decoration:none;display:inline-block">
        Se venneforespørsel
      </a>
    </p>
    <p style="color:#475569;font-size:13px">Hvis knappen ikke virker: ${escapeHtml(registerUrl)}</p>
    <p>Med vennlig hilsen,<br/>Weekplan-teamet</p>
  `,
    };
  }
  return {
    to,
    name,
    subject: `${who} inviterer deg til Weekplan`,
    text:
      `${greet},\n\n` +
      `${who} vil gjerne bli venn med deg på Weekplan.\n\n` +
      `Registrer deg her: ${registerUrl}\n\n` +
      `Når du er ferdig, blir dere venner — uten at du får tilgang til familien deres.\n\n` +
      `Hilsen Weekplan-teamet`,
    html: `
    <p>${escapeHtml(greet)},</p>
    <p><strong>${escapeHtml(who)}</strong> vil gjerne bli venn med deg på Weekplan.</p>
    <p>Opprett en gratis konto. Dere blir venner med hverandre — du får ikke tilgang til familien deres.</p>
    <p>
      <a href="${registerUrl}"
         style="background:#1099F4;color:#fff;padding:10px 16px;border-radius:8px;
                text-decoration:none;display:inline-block">
        Bli med på Weekplan
      </a>
    </p>
    <p style="color:#475569;font-size:13px">Hvis knappen ikke virker: ${escapeHtml(registerUrl)}</p>
    <p>Med vennlig hilsen,<br/>Weekplan-teamet</p>
  `,
  };
}

export function buildFriendInviteSms({ name, fromName, registerUrl, existingUser = false }) {
  const who = fromName || 'Noen';
  const hi = name ? `Hei ${name}!` : 'Hei!';
  const url = registerUrl || 'https://www.protop.no/register';
  if (existingUser) {
    return `${hi} ${who} vil bli venn med deg på Weekplan. Godta: ${url}`;
  }
  return `${hi} ${who} inviterer deg til Weekplan. Vil du bli venn? Registrer deg: ${url}`;
}
