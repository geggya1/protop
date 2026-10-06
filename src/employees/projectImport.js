/**
 * Hurtigimport av referanseprosjekter fra Excel eller CSV.
 * Prosjektene knyttes til personen. Kobling til bedriftens prosjektregister kan settes senere.
 */
import { readSpreadsheetTables } from '../anbud/customerImport.js';

const FIELDS = [
  ['title', ['prosjekt', 'prosjektnavn', 'tittel', 'referanseprosjekt', 'navn']],
  ['imageUrl', ['prosjektbilde', 'bilde', 'bildeurl', 'foto']],
  ['address', ['adresse', 'lokasjon', 'beliggenhet']],
  ['category', ['kategori']],
  ['object', ['objekt', 'objekttype']],
  ['period', ['periode']],
  ['cost', ['kostnad', 'sum', 'verdi', 'kontraktssum']],
  ['client', ['kunde', 'oppdragsgiver', 'byggherre']],
  ['contact', ['kontakt', 'kontaktperson']],
  ['phone', ['telefon', 'tlf', 'mobil']],
  ['email', ['epost', 'email', 'mail']],
  ['employer', ['arbeidsgiver', 'arbeidsgiveriperioden', 'firma']],
  ['roles', ['roller', 'rolle', 'rolleriprosjektet']],
  ['responsibility', ['ansvar', 'ansvariprosjektet']],
];

function fold(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function fieldOf(header) {
  const key = fold(header);
  for (const [field, aliases] of FIELDS) {
    if (aliases.some((alias) => fold(alias) === key)) return field;
  }
  return '';
}

function headerIndex(table) {
  let best = -1;
  let score = 0;
  for (let index = 0; index < Math.min(table.length, 12); index += 1) {
    const rank = (table[index] || []).filter((cell) => fieldOf(cell)).length;
    if (rank > score) {
      score = rank;
      best = index;
    }
  }
  return score >= 1 ? best : -1;
}

export function personProject(input, source = 'excel') {
  const row = input && typeof input === 'object' ? input : {};
  return {
    title: text(row.title),
    imageUrl: text(row.imageUrl),
    address: text(row.address),
    category: text(row.category),
    client: text(row.client),
    object: text(row.object),
    period: text(row.period),
    cost: text(row.cost),
    contact: text(row.contact),
    phone: text(row.phone),
    email: text(row.email).replace(/\s+/g, ''),
    employer: text(row.employer),
    roles: text(row.roles),
    responsibility: text(row.responsibility),
    source,
    link: { owner: 'person', companyProjectId: '' },
  };
}

export async function readProjectTable(bytes, filename = '') {
  const tables = await readSpreadsheetTables(bytes, filename);
  let best = null;
  for (const sheet of tables || []) {
    const table = sheet?.table || [];
    const index = headerIndex(table);
    if (index < 0) continue;
    const rank = (table[index] || []).filter((cell) => fieldOf(cell)).length;
    if (!best || rank > best.rank) best = { table, index, rank };
  }
  if (!best) throw new Error('Fant ingen prosjektliste. Oversikten trenger en kolonne for prosjektnavn.');
  const header = best.table[best.index].map((cell) => fieldOf(cell));
  if (!header.includes('title')) throw new Error('Listen mangler en kolonne for prosjektnavn.');
  const projects = [];
  for (const cells of best.table.slice(best.index + 1)) {
    const row = {};
    header.forEach((field, index) => {
      if (!field || row[field]) return;
      const value = text(cells?.[index]);
      if (value) row[field] = value;
    });
    const project = personProject(row, 'excel');
    if (project.title) projects.push(project);
  }
  if (!projects.length) throw new Error('Listen har ingen prosjekter.');
  return projects;
}

export const PROJECT_IMPORT_ACCEPT = [
  '.csv', '.txt', '.xlsx', '.xls',
  'text/csv', 'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',');
