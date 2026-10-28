/**
 * HMS-kort per ansatt (forskrift om HMS-kort for bygge- og anleggsplasser) og daglig
 * oversiktsliste for byggeplass (byggherreforskriften § 15).
 * Kortet lagres i HR-tilstanden (hr.hmsCards), ikke på ansattposten.
 * Ren logikk uten avhengighet til resten av HR-modellen.
 */

/** Varsel så mange dager før kortet går ut. */
export const HMS_CARD_WARN_DAYS = 30;

function text(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function isoDate(value) {
  const raw = text(value, 40);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const nb = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (nb) return `${nb[3]}-${nb[2].padStart(2, '0')}-${nb[1].padStart(2, '0')}`;
  return '';
}

function dayIndex(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : null;
}

function nbDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

export function normalizeHmsCard(row = {}) {
  const employeeId = text(row.employeeId, 120);
  return {
    id: text(row.id, 120) || `hms_${employeeId || 'x'}`,
    employeeId,
    number: text(row.number, 40).replace(/\s+/g, ' '),
    validTo: isoDate(row.validTo),
    employerOrgnr: text(row.employerOrgnr, 20).replace(/\D/g, '').slice(0, 9),
    updatedAt: text(row.updatedAt, 40) || new Date().toISOString(),
  };
}

/** Kortet til en ansatt (ett per ansatt). */
export function hmsCardFor(employeeId, cards) {
  const id = text(employeeId, 120);
  if (!id) return null;
  return (Array.isArray(cards) ? cards : []).find((row) => text(row?.employeeId, 120) === id) || null;
}

/** Bytter ut kortet til den ansatte. Tomt kortnummer og tom dato fjerner kortet. */
export function upsertHmsCard(cards, card) {
  const next = normalizeHmsCard(card);
  const rest = (Array.isArray(cards) ? cards : []).filter((row) => text(row?.employeeId, 120) !== next.employeeId);
  if (!next.employeeId) return rest;
  if (!next.number && !next.validTo) return rest;
  return [...rest, next];
}

/**
 * Status for kortet på dagen today: missing (ikke registrert), valid, expiring (innen
 * HMS_CARD_WARN_DAYS dager) eller expired. Kort uten utløpsdato regnes som ikke registrert.
 */
export function hmsCardStatus(card, today = '') {
  const now = isoDate(today) || new Date().toISOString().slice(0, 10);
  if (!card || !text(card.number) || !isoDate(card.validTo)) {
    return { id: 'missing', label: card?.number ? 'Utløpsdato mangler' : 'Ikke registrert', daysLeft: null };
  }
  const daysLeft = dayIndex(card.validTo) - dayIndex(now);
  if (daysLeft < 0) return { id: 'expired', label: `Utløpt ${nbDate(card.validTo)}`, daysLeft };
  if (daysLeft <= HMS_CARD_WARN_DAYS) {
    return { id: 'expiring', label: `Utløper ${nbDate(card.validTo)} (om ${daysLeft} ${daysLeft === 1 ? 'dag' : 'dager'})`, daysLeft };
  }
  return { id: 'valid', label: `Gyldig til ${nbDate(card.validTo)}`, daysLeft };
}

/** Status i «Lovpålagt»: ok, overdue (utløpt) eller missing. */
export function hmsComplianceStatus(card, today = '') {
  const state = hmsCardStatus(card, today);
  if (state.id === 'valid' || state.id === 'expiring') return 'ok';
  return state.id === 'expired' ? 'overdue' : 'missing';
}

function personName(employee) {
  const p = employee?.person || {};
  return [p.firstName, p.middleName, p.lastName].map((v) => text(v)).filter(Boolean).join(' ')
    || text(employee?.name) || text(employee?.displayName);
}

/**
 * Kort som er utløpt eller går ut snart, for ansatte som ikke er slettet.
 * notApplicable er ansatt-id-er der HMS-kort er satt til «Ikke aktuelt».
 */
export function hmsCardAlerts(employees, cards, { today = '', notApplicable = [] } = {}) {
  const skip = new Set(notApplicable);
  const out = [];
  for (const employee of employees || []) {
    const id = text(employee?.id, 120);
    if (!id || skip.has(id) || employee?.company?.status === 'deleted') continue;
    const card = hmsCardFor(id, cards);
    const state = hmsCardStatus(card, today);
    if (state.id === 'expired' || state.id === 'expiring') {
      out.push({ employeeId: id, name: personName(employee), number: card.number, validTo: card.validTo, status: state.id, text: state.label });
    }
  }
  return out.sort((a, b) => a.validTo.localeCompare(b.validTo));
}

/**
 * Daglig oversiktsliste for byggeplass fra timeføringen (byggherreforskriften § 15):
 * én rad per dag, prosjekt og person med navn, fødselsdato, arbeidsgiver, org.nr. og HMS-kort.
 * Bare føringer med timer telles. projectId tomt gir alle prosjekter.
 */
export function siteOverviewRows({
  entries = [],
  employees = [],
  cards = [],
  employer = {},
  from = '',
  to = '',
  projectId = '',
} = {}) {
  const byId = new Map((employees || []).map((row) => [text(row?.id, 120), row]));
  const groups = new Map();
  for (const entry of entries || []) {
    const date = isoDate(entry?.date);
    if (!date || (from && date < from) || (to && date > to)) continue;
    if (projectId && text(entry.projectId, 120) !== projectId) continue;
    const hours = Number(entry.hours) || 0;
    if (hours <= 0) continue;
    const key = `${date}|${text(entry.projectId, 120)}|${text(entry.employeeId, 120)}`;
    const row = groups.get(key) || {
      date,
      projectId: text(entry.projectId, 120),
      projectNumber: text(entry.projectNumber, 40),
      projectName: text(entry.projectName),
      employeeId: text(entry.employeeId, 120),
      employeeName: text(entry.employeeName),
      hours: 0,
    };
    row.hours = Math.round((row.hours + hours) * 100) / 100;
    groups.set(key, row);
  }
  const orgnr = text(employer.orgnr, 20).replace(/\D/g, '');
  return [...groups.values()].map((row) => {
    const employee = byId.get(row.employeeId);
    const card = hmsCardFor(row.employeeId, cards);
    const state = hmsCardStatus(card, row.date);
    return {
      date: row.date,
      projectNumber: row.projectNumber,
      projectName: row.projectName,
      name: personName(employee) || row.employeeName,
      birthDate: isoDate(employee?.person?.birthDate),
      employer: text(employer.name),
      employerOrgnr: card?.employerOrgnr || orgnr,
      hmsCardNumber: card?.number || '',
      hmsValidTo: card?.validTo || '',
      hmsStatus: state.id,
      hours: row.hours,
    };
  }).sort((a, b) => a.date.localeCompare(b.date)
    || a.projectNumber.localeCompare(b.projectNumber)
    || a.name.localeCompare(b.name, 'nb'));
}

function csvCell(value) {
  const raw = String(value ?? '');
  return /[;"\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

const STATUS_TEXT = { valid: 'Gyldig', expiring: 'Gyldig, utløper snart', expired: 'Utløpt', missing: 'Mangler' };

/** CSV med semikolon (åpnes i Excel med norsk oppsett). */
export function siteOverviewCsv(rows) {
  const head = ['Dato', 'Prosjektnr', 'Prosjekt', 'Navn', 'Fødselsdato', 'Arbeidsgiver', 'Org.nr.', 'HMS-kort', 'HMS-kort gyldig til', 'HMS-kort status', 'Timer'];
  const lines = (rows || []).map((row) => [
    nbDate(row.date),
    row.projectNumber,
    row.projectName,
    row.name,
    nbDate(row.birthDate),
    row.employer,
    row.employerOrgnr,
    row.hmsCardNumber,
    nbDate(row.hmsValidTo),
    STATUS_TEXT[row.hmsStatus] || '',
    String(row.hours).replace('.', ','),
  ].map(csvCell).join(';'));
  return [head.join(';'), ...lines].join('\n');
}
