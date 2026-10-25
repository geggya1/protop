/** Invitasjons-e-post uten Firebase. Samme tekst som sendInviteV2 sender. */

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isTeamGroupType(type) {
  return ['team', 'club'].includes(String(type || '').toLowerCase());
}

function isClassroomGroupType(type) {
  return ['class', 'classroom'].includes(String(type || '').toLowerCase());
}

export { escapeHtml };

export function buildInviteMessage({
  to, name, familyId, familyName, groupType, registerUrl, existingUser = false,
}) {
  const label = familyName || familyId || 'gruppen';
  const team = isTeamGroupType(groupType);
  const classroom = isClassroomGroupType(groupType);
  const organization = ['organization', 'company'].includes(String(groupType || '').toLowerCase());
  const product = organization ? 'ProTop' : 'Weekplan';
  const greet = name || (team || classroom || organization ? '' : 'foresatt');
  const hello = greet ? `Hei ${greet}` : 'Hei';
  const roleText = team
    ? `Du er invitert til idrettslaget «${label}» på Weekplan.`
    : (classroom
      ? `Du er invitert til klassen «${label}» på Weekplan.`
      : (organization
        ? `Du er invitert inn i bedriften «${label}» på ProTop.`
        : `Du er invitert som foresatt i familien «${label}» på Weekplan.`));
  const roleHtml = team
    ? `Du er invitert til idrettslaget <strong>${escapeHtml(label)}</strong> på Weekplan.`
    : (classroom
      ? `Du er invitert til klassen <strong>${escapeHtml(label)}</strong> på Weekplan.`
      : (organization
        ? `Du er invitert inn i bedriften <strong>${escapeHtml(label)}</strong> på ProTop.`
        : `Du er invitert som foresatt i familien <strong>${escapeHtml(label)}</strong> på Weekplan.`));
  const accountLine = organization
    ? 'Du har allerede en ProTop-konto. Du blir ikke med i bedriften før du godtar invitasjonen.'
    : 'Du har allerede en Weekplan-konto.';
  const accountHtml = organization
    ? 'Du har allerede en ProTop-konto. Du blir ikke med i bedriften før du godtar. Åpne lenken under for å godta eller avslå invitasjonen.'
    : 'Du har allerede en Weekplan-konto. Åpne lenken under for å godta eller avslå invitasjonen.';
  // Ny bruker: konto først, så Godta/Avslå når e-posten er bekreftet.
  const registerLine = organization
    ? 'Opprett en konto med denne e-postadressen og bekreft e-posten. Deretter godtar eller avslår du invitasjonen. Du blir ikke med i bedriften før du har godtatt'
    : 'Opprett en konto med denne e-postadressen og bekreft e-posten. Deretter godtar eller avslår du invitasjonen';
  const signoff = organization ? 'Hilsen ProTop' : 'Hilsen Weekplan-teamet';

  if (existingUser) {
    return {
      to,
      name,
      subject: organization ? `Invitasjon til bedriften ${label} på ProTop` : `Du er invitert til ${label} på ${product}`,
      text:
        `${hello},\n\n` +
        `${roleText}\n\n` +
        `${accountLine}\n\n` +
        `Godta eller avslå invitasjonen her: ${registerUrl}\n\n` +
        signoff,
      html: `
    <p>${escapeHtml(hello)},</p>
    <p>${roleHtml}</p>
    <p>${accountHtml}</p>
    <p>
      <a href="${registerUrl}"
         style="background:#1099F4;color:#fff;padding:10px 16px;border-radius:8px;
                text-decoration:none;display:inline-block">
        Godta eller avslå invitasjonen
      </a>
    </p>
    <p style="color:#475569;font-size:13px">Hvis knappen ikke virker: ${escapeHtml(registerUrl)}</p>
    <p>Med vennlig hilsen,<br/>${signoff.replace(/^Hilsen /, '')}</p>
  `,
    };
  }

  return {
    to,
    name,
    subject: organization ? `Invitasjon til bedriften ${label} på ProTop` : `Invitasjon til ${label} på ${product}`,
    text:
      `${hello},\n\n` +
      `${roleText}\n\n` +
      `${registerLine}.\n\n` +
      `Opprett konto her: ${registerUrl}\n\n` +
      signoff,
    html: `
    <p>${escapeHtml(hello)},</p>
    <p>${roleHtml}</p>
    <p>${escapeHtml(registerLine)}.</p>
    <p>
      <a href="${registerUrl}"
         style="background:#1099F4;color:#fff;padding:10px 16px;border-radius:8px;
                text-decoration:none;display:inline-block">
        Opprett konto og svar på invitasjonen
      </a>
    </p>
    <p style="color:#475569;font-size:13px">Hvis knappen ikke virker: ${escapeHtml(registerUrl)}</p>
    <p>Med vennlig hilsen,<br/>${signoff.replace(/^Hilsen /, '')}</p>
  `,
  };
}
