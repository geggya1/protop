/**
 * Oversikten under Innstillinger: to–tre linjer per seksjon, så en ser hva som står der
 * (og hva som mangler) før en åpner seksjonen. Ren modul – brukes av skjermen og testene.
 */
import { accessLevelSections, accountDeactivated, employeeLevelIds } from '../access/companyAccess.js';
import { activeSchedule, timeSettingsOf, SCHEDULE_DAYS } from '../arbeid/schedule.js';
import { parseHours } from '../arbeid/hours.js';
import { employeeInviteState } from './invite.js';
import {
  formatNbDate, maskNationalId, periodLabel, personnelKind, personnelKindLabel,
} from './model.js';

function text(value) {
  return String(value ?? '').trim();
}

function row(label, value, missing = 'Ikke registrert') {
  const v = text(value);
  return { label, value: v || missing, missing: !v };
}

function hoursText(hours) {
  const rounded = Math.round(hours * 10) / 10;
  return `${String(rounded).replace('.', ',')} t`;
}

/** Timer per uke i tidsplanen som gjelder i dag, eller null uten plan. */
export function weeklyScheduleHours(employee, todayKey = new Date().toISOString().slice(0, 10)) {
  const plan = activeSchedule(employee?.extras?.schedules, todayKey);
  if (!plan?.days) return null;
  let sum = 0;
  for (const day of SCHEDULE_DAYS) sum += parseHours(plan.days?.[day.id]?.hours) || 0;
  return sum;
}

function accessLabels(employee) {
  const selected = employeeLevelIds(employee);
  return accessLevelSections()
    .flatMap((section) => section.levels.filter((level) => selected.includes(level.id)).map((level) => level.label));
}

/**
 * Linjene per seksjon (view-id → rader). `reveal`: personnummer og pårørende vises
 * bare for den som har innsyn (personen selv og administrator).
 */
export function settingsSummary(employee, { companyName = '', reveal = false, todayKey } = {}) {
  const person = employee?.person || {};
  const company = employee?.company || {};
  const settings = timeSettingsOf(employee);
  const kids = Array.isArray(employee?.extras?.childCare?.birthYears) ? employee.extras.childCare.birthYears.length : 0;
  const week = weeklyScheduleHours(employee, todayKey);
  const percent = Number(company.workPercent);
  const invite = employeeInviteState(employee);
  const levels = accessLabels(employee);
  const notify = [settings.notifyTimesheet !== false, settings.notifyApproval !== false].filter(Boolean).length;
  const address = [person.address1, [person.postalCode, person.place].map(text).filter(Boolean).join(' ')]
    .map(text).filter(Boolean).join(', ');

  let account = 'Ikke knyttet til en bruker';
  if (accountDeactivated(employee)) account = 'Deaktivert';
  else if (text(employee?.personUid)) account = 'Aktiv, knyttet til bruker';

  return {
    settingsProfile: [
      row('Stilling', company.title),
      row('E-post', company.email || person.email),
      row('Telefon', person.phone),
    ],
    settingsPersonal: [
      row('Fødselsdato', formatNbDate(person.birthDate)),
      row('Adresse', address),
      row('Personnummer', reveal ? maskNationalId(person.nationalId) : (person.nationalId ? 'Skjermet' : '')),
    ],
    settingsKin: [
      row('Pårørende', reveal ? person.kinName : (person.kinName ? 'Skjermet' : '')),
      row('Barn', kids ? `${kids} registrert` : '', 'Ingen registrert'),
    ],
    settingsEmployment: [
      row('Type', company.employmentType || personnelKindLabel(personnelKind(employee), companyName)),
      row('Stillingsprosent', Number.isFinite(percent) && percent > 0 ? `${percent} %` : ''),
      row('Periode', periodLabel(employee)),
    ],
    settingsWork: [
      row('Tidsplan', week == null ? '' : `${hoursText(week)} per uke`, 'Følger stillingsprosenten'),
    ],
    settingsGeneral: [
      row('Mål faktureringsgrad', `${settings.utilizationTarget ?? 100} %`),
      row('Timepris', settings.hourlyRate ? `${settings.hourlyRate} kr` : ''),
      row('Lønnsform', company.compensationType),
    ],
    settingsHms: [
      row('HMS-kort og dokumenter', 'Se status og last opp', ''),
    ],
    settings: [
      row('Konto', account),
      row('Invitasjon', invite.label, invite.key === 'member' || invite.key === 'accepted' ? 'Akseptert' : 'Ikke sendt'),
    ],
    settingsNotify: [
      row('Varsler', `${notify} av 2 på`),
    ],
    settingsAccess: [
      row('Nivå', levels.join(', '), 'Ikke plassert i noe nivå'),
    ],
    settingsAdmin: [
      row('Brukerlogg, tagger og papirkurv', 'Åpne for å se', ''),
    ],
  };
}

/** Seksjonene som teller når profilen måles: det personen (eller HR) fyller inn om seg. */
export const PROGRESS_SECTIONS = ['settingsProfile', 'settingsPersonal', 'settingsKin', 'settingsEmployment'];

/**
 * Hvor mye som er fylt ut, fra linjene i settingsSummary.
 * Gir { pct, filled, total, missing: [{ section, label }], bySection: { id: { filled, total } } }.
 * bySection gjelder alle seksjoner; pct og missing bare PROGRESS_SECTIONS.
 */
export function settingsProgress(summary = {}, { sections = PROGRESS_SECTIONS } = {}) {
  const bySection = {};
  for (const [id, rows] of Object.entries(summary || {})) {
    const list = Array.isArray(rows) ? rows : [];
    bySection[id] = { filled: list.filter((r) => !r.missing).length, total: list.length };
  }
  const missing = [];
  let filled = 0;
  let total = 0;
  for (const id of sections) {
    for (const r of summary?.[id] || []) {
      total += 1;
      if (r.missing) missing.push({ section: id, label: r.label });
      else filled += 1;
    }
  }
  return {
    pct: total ? Math.round((filled / total) * 100) : 100,
    filled,
    total,
    missing,
    bySection,
  };
}
