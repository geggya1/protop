/**
 * Helside for ett referanseprosjekt.
 * PDF og Word inneholder bare felt som er fylt ut, og kan åpnes på nytt.
 */
import { buildPdf, zipStore } from '../indeksregulering/office.js';

function filled(value) {
  return String(value ?? '').trim();
}

function filenameBase(project) {
  const slug = filled(project?.title)
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return slug || 'referanseprosjekt';
}

export function projectSheetLines(project, personName = '') {
  const row = project && typeof project === 'object' ? project : {};
  const name = filled(personName) || filled(row.referenceName);
  const facts = [
    ['Oppdragsgiver', row.client],
    ['Periode', row.period],
    ['Areal', row.area],
    ['Prosjektsum', row.cost],
    ['Tiltaksklasse', row.buildingClass],
    ['Kategori', row.category],
    ['Objekt', row.object],
    ['Arbeidsgiver i perioden', row.employer],
  ].filter(([, value]) => filled(value));
  const lines = [filled(row.title) || 'Prosjekt'];
  if (filled(row.address)) lines.push(filled(row.address));
  lines.push('');
  for (const [label, value] of facts) lines.push(`${label}: ${filled(value)}`);
  if (filled(row.description)) {
    lines.push('');
    filled(row.description).split(/\n/).forEach((line) => lines.push(line));
  }
  if (name) {
    lines.push('');
    lines.push(name);
  }
  if (filled(row.responsibility)) lines.push(filled(row.responsibility));
  const contact = [
    ['Kontaktperson hos oppdragsgiver', row.contact],
    ['Firma', row.contactCompany],
    ['Telefon', row.phone],
    ['E-post', row.email],
  ].filter(([, value]) => filled(value));
  if (contact.length) {
    lines.push('');
    for (const [label, value] of contact) lines.push(`${label}: ${filled(value)}`);
  }
  const roles = filled(row.roles).split(/\n/).map((line) => line.trim()).filter(Boolean);
  if (roles.length) {
    lines.push('');
    lines.push('Roller i prosjektet');
    roles.forEach((role) => lines.push(`- ${role.replace(/^[-•]\s*/, '')}`));
  }
  return lines;
}

function xml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function paragraph(value, bold = false) {
  const size = bold ? 28 : 22;
  const run = `<w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>`;
  return `<w:p><w:r>${run}<w:t xml:space="preserve">${xml(value)}</w:t></w:r></w:p>`;
}

export function projectDocx(project, personName = '') {
  const lines = projectSheetLines(project, personName);
  const blocks = lines.map((line, index) => paragraph(line, index === 0 && line !== ''));
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${blocks.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body>
</w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  return zipStore([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rels },
    { name: 'word/document.xml', data: document },
  ]);
}

export function projectPdf(project, personName = '') {
  const lines = projectSheetLines(project, personName);
  return buildPdf({
    filenameBase: filenameBase(project),
    paragraphs: [{ heading: '', lines }],
  });
}

export function projectSheetFile(project, kind, personName = '') {
  const base = filenameBase(project);
  if (kind === 'pdf') {
    return {
      filename: `${base}.pdf`,
      mime: 'application/pdf',
      bytes: projectPdf(project, personName),
    };
  }
  return {
    filename: `${base}.docx`,
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes: projectDocx(project, personName),
  };
}
