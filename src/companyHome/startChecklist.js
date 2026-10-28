/**
 * «Kom i gang» på bedriftens forside: fem steg som krysses av automatisk ut fra
 * det som finnes i bedriften. Listen forsvinner når alt er gjort, og kan skjules.
 * Ren logikk, så node-testene kan lese den.
 */

export const START_STEPS = [
  {
    id: 'employees',
    label: 'Inviter ansatte',
    hint: 'Legg inn de ansatte, så kan de føre timer og fravær.',
    action: { type: 'tab', tab: 'ansatte' },
  },
  {
    id: 'customers',
    label: 'Legg inn kunder',
    hint: 'Én og én, eller importer fra Excel.',
    action: { type: 'tab', tab: 'kunder' },
  },
  {
    id: 'project',
    label: 'Opprett første prosjekt',
    hint: 'Timer, utlegg og faktura samles på prosjektet.',
    action: { type: 'tab', tab: 'projects' },
  },
  {
    id: 'hours',
    label: 'Før første time',
    hint: 'Timelisten er der alle fører arbeidet sitt.',
    action: { type: 'tab', tab: 'arbeid', subView: 'timeliste' },
  },
  {
    id: 'accounting',
    label: 'Koble regnskap (PowerOffice)',
    hint: 'Fakturaene overføres til PowerOffice Go.',
    action: { type: 'tab', tab: 'okonomi', subView: 'innstillinger' },
  },
];

export const START_CHECKLIST_HIDDEN_KEY = 'protop.startChecklist.hidden.v1';

/** «Skjul» huskes per bedrift og bruker på enheten. */
export function startChecklistHiddenKey(familyId, uid) {
  return `${START_CHECKLIST_HIDDEN_KEY}.${familyId || ''}.${uid || ''}`;
}

function text(value) {
  return String(value || '').trim();
}

const CLOSED = new Set(['deleted', 'inactive', 'former', 'ended']);

/** Andre ansatte enn den som er innlogget (eieren er ofte den eneste i starten). */
export function hasOtherEmployees(employees = [], uid = '') {
  const me = text(uid);
  return (employees || []).some((row) => {
    if (!row?.id) return false;
    if (CLOSED.has(text(row.company?.status || row.status))) return false;
    return !me || text(row.personUid) !== me;
  });
}

/**
 * Stegene med avkrysning. Et steg der svaret ikke er kjent ennå (null), regnes
 * som ikke gjort, men `ready` er false til alt er lest, så listen ikke blinker.
 */
export function startChecklist({
  employees = null,
  customers = null,
  projects = null,
  hasHours = null,
  accountingConnected = null,
  uid = '',
} = {}) {
  const facts = {
    employees: employees == null ? null : hasOtherEmployees(employees, uid),
    customers: customers == null ? null : customers.some((row) => row && !row.deleted),
    project: projects == null ? null : projects.some((row) => row?.id && !row.deleted),
    hours: hasHours == null ? null : !!hasHours,
    accounting: accountingConnected == null ? null : !!accountingConnected,
  };
  const items = START_STEPS.map((step) => ({ ...step, done: facts[step.id] === true }));
  const done = items.filter((row) => row.done).length;
  const ready = Object.values(facts).every((value) => value !== null);
  return {
    items,
    done,
    total: items.length,
    ready,
    complete: done === items.length,
    progressLabel: `${done} av ${items.length}`,
  };
}

/** Vises for den som kan sette opp bedriften, til alt er gjort eller listen er skjult. */
export function showStartChecklist({ canSetup = false, hidden = false, checklist = null } = {}) {
  if (!canSetup || hidden || !checklist?.ready) return false;
  return !checklist.complete;
}
