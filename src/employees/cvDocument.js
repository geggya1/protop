/**
 * Eksporter hele CV-en som PDF, strukturert som papir-CV-en.
 */
import { buildPdf } from '../indeksregulering/office.js';
import { plainFormatted, sortByStartDesc, sortCoursesDesc } from './cvFormat.js';

function filled(value) {
  return String(value ?? '').trim();
}

function filenameBase(cv) {
  const slug = filled(cv?.name)
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  return slug ? `${stamp}_CV_${slug}` : `${stamp}_CV`;
}

function bulletLines(text) {
  const raw = plainFormatted(text);
  if (!raw) return [];
  return raw.split(/\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    if (/^[•\-]\s/.test(trimmed)) return trimmed.replace(/^[-]\s/, '• ');
    return trimmed;
  }).filter((line) => line !== undefined);
}

function summaryLines(text) {
  const parts = bulletLines(text).filter(Boolean);
  if (!parts.length) return [];
  if (parts.some((line) => /^[•\-]/.test(line))) {
    return parts.map((line) => (line.startsWith('•') ? line : `• ${line.replace(/^[-]\s*/, '')}`));
  }
  return [`• ${parts.join(' ')}`];
}

function educationLine(row) {
  const when = filled(row.when).replace(/\u2013/g, '-');
  const school = [filled(row.school), filled(row.program)].filter(Boolean).join(' - ');
  return [when, school].filter(Boolean).join(' ');
}

function projectLines(row) {
  const lines = [];
  lines.push(filled(row.title) || 'Prosjekt');
  if (filled(row.address)) lines.push(filled(row.address));
  const facts = [
    ['Kategori', row.category],
    ['Objekt', row.object],
    ['Periode', row.period],
    ['Kostnad', row.cost],
    ['Areal', row.area],
    ['Kunde', row.client],
    ['Kontakt', row.contact],
    ['Telefon', row.phone],
    ['Epost', row.email],
    ['Arbeidsgiver i perioden', row.employer],
  ].filter(([, value]) => filled(value));
  for (const [label, value] of facts) lines.push(`${label} ${filled(value)}`);
  const roles = filled(row.roles)
    .split(/\n/)
    .map((line) => line.trim().replace(/^[-•]\s*/, ''))
    .filter(Boolean);
  if (roles.length) lines.push(`Roller i prosjektet ${roles.join(', ')}`);
  if (filled(row.responsibility)) {
    lines.push('Ansvar i prosjektet');
    bulletLines(row.responsibility).forEach((line) => lines.push(line));
  }
  if (filled(row.description)) {
    lines.push('');
    bulletLines(row.description).forEach((line) => lines.push(line));
  }
  return lines;
}

/** Linjer til PDF / forhåndsvisning, samme oppsett som papir-CV. */
export function cvDocumentLines(cv) {
  const lines = ['CURRICULUM VITAE'];
  if (filled(cv?.name)) lines.push(filled(cv.name));
  if (filled(cv?.title)) lines.push(filled(cv.title));
  lines.push('Profil');
  for (const [label, value] of cv?.facts || []) {
    if (filled(value)) lines.push(`${label} ${filled(value)}`);
  }
  lines.push('Oppsummering og nøkkelkvalifikasjoner');
  const summary = summaryLines(cv?.summary);
  if (summary.length) summary.forEach((line) => lines.push(line));
  else lines.push('');

  lines.push('Utdanning');
  const education = sortByStartDesc(cv?.education || [], (row) => {
    const match = String(row.when || '').match(/(19|20)\d{2}/);
    return match ? match[0] : '';
  });
  if (education.length) education.forEach((row) => lines.push(educationLine(row)));
  else lines.push('');

  lines.push('Sertifiseringer');
  for (const title of cv?.certifications || []) {
    if (filled(title)) lines.push(`• ${filled(title)}`);
  }

  lines.push('Kurs');
  const courses = sortCoursesDesc((cv?.courses || []).map((row) => ({ ...row, date: row.when || row.date })));
  for (const row of courses) {
    lines.push([filled(row.when || row.date), filled(row.title)].filter(Boolean).join(' '));
  }

  lines.push('Erfaringer');
  const experience = sortByStartDesc(cv?.experience || [], (row) => {
    const match = String(row.when || '').match(/(19|20)\d{2}/);
    return match ? match[0] : '';
  });
  for (const row of experience) {
    if (filled(row.employer)) lines.push(filled(row.employer));
    if (filled(row.place)) lines.push(filled(row.place));
    if (filled(row.title)) lines.push(filled(row.title));
    if (filled(row.when)) lines.push(filled(row.when).replace(/\u2013/g, '-'));
    const tasks = row.tasks || [];
    if (tasks.length) {
      lines.push('Arbeidsoppgaver');
      tasks.forEach((task) => lines.push(`• ${filled(task).replace(/^[-•]\s*/, '')}`));
    }
  }

  lines.push('Referanseprosjekter');
  for (const row of cv?.projects || []) {
    projectLines(row).forEach((line) => lines.push(line));
    lines.push('');
  }

  for (const field of cv?.custom || []) {
    if (filled(field.value)) lines.push(`${filled(field.label)}: ${filled(field.value)}`);
  }

  return lines.filter((line, index, all) => !(line === '' && all[index - 1] === ''));
}

export function cvPdf(cv) {
  return buildPdf({
    filenameBase: filenameBase(cv),
    paragraphs: [{ heading: '', lines: cvDocumentLines(cv) }],
  });
}

export function cvDocumentFile(cv) {
  return {
    filename: `${filenameBase(cv)}.pdf`,
    mime: 'application/pdf',
    bytes: cvPdf(cv),
  };
}
