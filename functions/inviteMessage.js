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
  const product = 'ProTop';
  const greet = name || (team || classroom || organization ? '' : 'foresatt');
  const hello = greet ? `Hei ${greet}` : 'Hei';
  const roleText = team
    ? `Du er invitert til idrettslaget «${label}» på ProTop.`
    : (classroom
      ? `Du er invitert til klassen «${label}» på ProTop.`
      : (organization
        ? `Du er invitert inn i bedriften «${label}» på ProTop.`
        : `Du er invitert som foresatt i familien «${label}» på ProTop.`));
  const roleHtml = team
    ? `Du er invitert til idrettslaget <strong>${escapeHtml(label)}</strong> på ProTop.`
    : (classroom
      ? `Du er invitert til klassen <strong>${escapeHtml(label)}</strong> på ProTop.`
      : (organization
        ? `Du er invitert inn i bedriften <strong>${escapeHtml(label)}</strong> på ProTop.`
        : `Du er invitert som foresatt i familien <strong>${escapeHtml(label)}</strong> på ProTop.`));
  const accountLine = organization
    ? 'Du har allerede en ProTop-konto. Du blir ikke med i bedriften før du godtar invitasjonen.'
    : 'Du har allerede en ProTop-konto.';
  const accountHtml = organization
    ? 'Du har allerede en ProTop-konto. Du blir ikke med i bedriften før du godtar. Åpne lenken under for å godta eller avslå invitasjonen.'
    : 'Du har allerede en ProTop-konto. Åpne lenken under for å godta eller avslå invitasjonen.';
  // Ny bruker i en bedrift: kontoen fra lenken er svaret, og invitasjonen godtas når e-posten
  // er bekreftet (UX-30). Andre grupper: konto først, så Godta/Avslå.
  const registerLine = organization
    ? 'Opprett en konto med denne e-postadressen fra lenken og bekreft e-posten, så er du med i bedriften. Er invitasjonen ikke til deg, kan du avslå den i appen'
    : 'Opprett en konto med denne e-postadressen og bekreft e-posten. Deretter godtar eller avslår du invitasjonen';
  const registerButton = organization ? 'Opprett konto og bli med' : 'Opprett konto og svar på invitasjonen';
  const signoff = 'Hilsen ProTop';

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
        ${registerButton}
      </a>
    </p>
    <p style="color:#475569;font-size:13px">Hvis knappen ikke virker: ${escapeHtml(registerUrl)}</p>
    <p>Med vennlig hilsen,<br/>${signoff.replace(/^Hilsen /, '')}</p>
  `,
  };
}
