/**
 * Chat i bedriften: hvem som er med i fellestråden, og hvem man kan skrive til én og én.
 * Fellestråden er for aktive faste ansatte (personellgruppen Intern). Eksterne og innleide
 * er ikke med der, men kan få meldinger én og én fra de ansatte og skrive til dem.
 * Deaktiverte og slettede er ikke med.
 * Bare personer med innlogging kan få meldinger. Et medlem uten ansattkort regnes som
 * eget personell, slik ansattkortet ellers står som standard.
 */
import { accountDeactivated } from '../access/companyAccess.js';
import { kindOf } from '../employees/employmentFlags.js';
import { employeeMatchEmails } from '../employees/invite.js';
import { displayName } from '../employees/model.js';
import { preferAuthUid } from './inviteAuthUid.js';
import { memberDocGrantsAccess } from './memberAccess.js';

/** Fellestråden. `g_` gjør at bare memberIds varsles, ikke hele bedriften. */
export const STAFF_CHAT_ID = 'g_ansatte';
/** Lagret tittel. Fast tekst, så brukere med ulikt språk ikke skriver den om hver gang. */
export const STAFF_CHAT_TITLE = 'Alle ansatte';

function text(value) {
  return String(value ?? '').trim();
}

/** Undertekst på personen i chatlisten: stillingen, ellers personellgruppen. */
export function companyChatLabel(person, t) {
  if (text(person?.title)) return text(person.title);
  if (person?.kind === 'innleid') return t('chat.hiredLabel');
  if (person?.kind === 'external') return t('chat.externalLabel');
  return t('chat.staffLabel');
}

function employeeUid(row) {
  return text(row?.personUid) || text(row?.invite?.acceptedUid);
}

function rank(row) {
  if (accountDeactivated(row)) return 0;
  return kindOf(row) === 'staff' ? 2 : 1;
}

function byName(a, b) {
  return a.name.localeCompare(b.name, 'nb');
}

function memberName(member) {
  return text(member?.name || member?.displayName) || text(member?.email).split('@')[0];
}

function employeeName(row, member) {
  const name = displayName(row);
  if (name && name !== 'Uten navn') return name;
  return memberName(member) || name;
}

function memberPhoto(member) {
  return member?.photoURL || member?.photoUrl || null;
}

/**
 * @param {object} opts
 * @param {object[]} opts.employees ansattkort (watchEmployees)
 * @param {object[]} opts.parents medlemsdokumentene i bedriften (useApp().parents)
 * @param {string} opts.uid innlogget bruker
 */
export function companyChatContacts({ employees = [], parents = [], uid = '' } = {}) {
  const rows = (employees || []).filter((row) => row && row.company?.status !== 'deleted');
  // Ventende invitasjoner, deaktiverte og de som har gått ut har ingen innlogging i bedriften.
  const memberByUid = new Map();
  const removed = new Set();
  for (const member of parents || []) {
    const id = text(preferAuthUid(member?.uid, member?.id));
    if (!id) continue;
    if (!memberDocGrantsAccess(member) || member.archived === true) {
      removed.add(id);
      continue;
    }
    if (!memberByUid.has(id)) memberByUid.set(id, member);
  }
  for (const id of memberByUid.keys()) removed.delete(id);

  // Samme person kan stå med flere kort (for eksempel fra et tilknyttet selskap). Aktiv fast ansatt vinner.
  const rowByUid = new Map();
  const claimed = new Set();
  const consider = (id, row) => {
    if (!id) return;
    claimed.add(row);
    const current = rowByUid.get(id);
    if (!current || rank(row) > rank(current)) rowByUid.set(id, row);
  };
  for (const row of rows) consider(employeeUid(row), row);
  // Medlem uten koblet ansattkort: samme e-post som på kortet.
  for (const [id, member] of memberByUid) {
    if (rowByUid.has(id)) continue;
    const email = text(member.email).toLowerCase();
    if (!email) continue;
    rows
      .filter((row) => !employeeUid(row) && employeeMatchEmails(row).includes(email))
      .forEach((row) => consider(id, row));
  }

  const staff = [];
  const external = [];
  for (const [id, row] of rowByUid) {
    // Ansattkortet kan stå som aktivt etter at personen er tatt ut av bedriften.
    if (accountDeactivated(row) || removed.has(id)) continue;
    const member = memberByUid.get(id) || null;
    const kind = kindOf(row);
    const person = {
      uid: id,
      name: employeeName(row, member),
      title: text(row.company?.title),
      photoURL: memberPhoto(member) || text(row.person?.photoUrl) || null,
      avatarId: member?.avatarId || null,
      kind,
    };
    (kind === 'staff' ? staff : external).push(person);
  }
  for (const [id, member] of memberByUid) {
    if (rowByUid.has(id)) continue;
    staff.push({
      uid: id,
      name: memberName(member) || 'Uten navn',
      title: '',
      photoURL: memberPhoto(member),
      avatarId: member.avatarId || null,
      kind: 'staff',
    });
  }
  staff.sort(byName);
  external.sort(byName);

  const withoutLogin = rows.filter((row) => (
    !claimed.has(row) && !accountDeactivated(row) && kindOf(row) === 'staff'
  )).length;

  const staffChatIds = staff.map((person) => person.uid).sort();
  const me = text(uid);
  const inStaffChat = !!me && staffChatIds.includes(me);
  // En ekstern skriver til de ansatte, men ser ikke andre eksterne eller innleide.
  return {
    staffChatIds,
    inStaffChat,
    staff: staff.filter((person) => person.uid !== me),
    external: inStaffChat ? external : [],
    withoutLogin: inStaffChat ? withoutLogin : 0,
  };
}
