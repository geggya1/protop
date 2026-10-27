/**
 * Prosjekter som «hører til» en ansatt uten Admin på Prosjekt:
 * deltaker (Team), prosjektleder (navnet i «Leder») eller timer ført på prosjektet.
 *
 * Ansattlisten slår sammen selskap og søsterselskap, så samme person kan ha flere
 * ansatt-id-er. Personen gjenkjennes derfor på id, brukerkonto, e-post og navn.
 */

function text(value) {
  return String(value ?? '').trim();
}

function fold(value) {
  return text(value).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}

/** Navnevarianter: fullt navn og fornavn + etternavn (uten mellomnavn). */
export function employeeNameKeys(employee) {
  const person = employee?.person || {};
  const first = fold(person.firstName).split(' ')[0] || '';
  const last = fold(person.lastName);
  const full = fold([person.firstName, person.middleName, person.lastName].filter(Boolean).join(' '));
  return new Set([full, first && last ? `${first} ${last}` : ''].filter(Boolean));
}

function emailsOf(employee) {
  return [employee?.person?.email, employee?.company?.email, employee?.email]
    .map(fold)
    .filter((value) => value.includes('@'));
}

/** Alle ansatt-id-er som er samme person som `me`. */
export function sameEmployeeIds(employees = [], me = null) {
  const ids = new Set();
  if (!me) return ids;
  if (text(me.id)) ids.add(text(me.id));
  const uid = text(me.personUid);
  const mails = new Set(emailsOf(me));
  const names = employeeNameKeys(me);
  for (const row of employees || []) {
    if (!row?.id) continue;
    if (uid && text(row.personUid) === uid) ids.add(row.id);
    else if (emailsOf(row).some((mail) => mails.has(mail))) ids.add(row.id);
    else if ([...employeeNameKeys(row)].some((key) => names.has(key))) ids.add(row.id);
  }
  return ids;
}

export function myProjectIds(state, me, employees = []) {
  const out = new Set();
  if (!me) return out;
  const ids = sameEmployeeIds(employees, me);
  const names = employeeNameKeys(me);
  const mine = (row) => ids.has(text(row?.employeeId)) || (names.size && names.has(fold(row?.employeeName)));
  for (const row of state?.members || []) {
    if (row.active !== false && mine(row)) out.add(row.projectId);
  }
  for (const row of state?.timeEntries || []) {
    if (text(row.projectId) && mine(row)) out.add(row.projectId);
  }
  if (names.size) {
    for (const project of state?.projects || []) {
      if (names.has(fold(project.manager))) out.add(project.id);
    }
  }
  return out;
}

/** Prosjektadmin har åpnet prosjektet for alle i timelisten. */
function openToAll(project) {
  const settings = project?.workSettings || {};
  return settings.showInAllTimesheets === true || settings.allowSelfJoin === true;
}

/**
 * Prosjektene i en velger. Admin på Prosjekt (`all`) ser alle aktive prosjekter.
 * Ellers egne prosjekter og prosjekter prosjektadmin har åpnet for alle i timelisten.
 * `keepId` beholder prosjektet som allerede er valgt.
 */
export function pickableProjects(state, me, employees = [], { all = false, keepId = '' } = {}) {
  const live = (state?.projects || []).filter((project) => project.status !== 'arkivert');
  if (all) return live;
  const own = myProjectIds(state, me, employees);
  return live.filter((project) => own.has(project.id) || project.id === keepId || openToAll(project));
}

/**
 * Teamet på et prosjekt: registrerte deltakere, pluss de som har ført timer uten å
 * stå i teamet (vises som «Har ført timer»).
 */
export function teamWithHourParticipants(members = [], timeEntries = [], projectId = '') {
  const active = (members || []).filter((row) => row.projectId === projectId && row.active !== false);
  const known = new Set(active.map((row) => text(row.employeeId)));
  const extra = new Map();
  for (const row of timeEntries || []) {
    const id = text(row.employeeId);
    if (row.projectId !== projectId || !id || known.has(id) || extra.has(id)) continue;
    if (!(Number(row.hours) > 0)) continue;
    extra.set(id, {
      id: `timer-${id}`,
      projectId,
      employeeId: id,
      employeeName: text(row.employeeName) || 'Ukjent',
      role: 'Har ført timer',
      active: true,
      derived: true,
    });
  }
  return [...active, ...extra.values()];
}
