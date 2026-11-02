/**
 * Signert kopi av medarbeidersamtalen som PDF (A4), uten eksterne biblioteker. Lages på serveren
 * når begge har signert (functions/hrReview.js) og kan lastes ned på Min side og i HR.
 *
 * Bygger på tegnehjelperne fra møtereferatet (minutesPdf.js), og leser skjemaet generelt:
 * enkle felt blir faktaboksen, tabeller blir nummererte blokker (tema med notater før og under
 * samtalen, handlingsplan med ansvar og frist), og signaturene står nederst med navn og tidspunkt.
 * Bedriftens egne varianter av malen skrives derfor ut uten egen kode.
 */
import { pdfDocument } from '../indeksregulering/office.js';
import { logoForDocument } from '../project/companyLogo.js';
import { tableRows } from '../anbud/formBuilder.js';
import { formWithTokens } from '../forms/tokens.js';
import {
  C, LEFT, RIGHT, WIDTH, accentBox, drawFacts, drawHeader, finish, heading, measure, pageWriter, paragraphs, wrapText,
} from '../meetings/minutesPdf.js';
import { splitTopic, stampLine, topicTable } from './reviewPrep.js';

const SIMPLE = new Set(['text', 'date', 'choice', 'number', 'email', 'phone']);
const SHORT_COLUMNS = new Set(['text', 'date', 'mark', 'check', 'number']);

function text(value) {
  return String(value ?? '').trim();
}

function nbDate(value) {
  const v = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v.slice(8, 10)}.${v.slice(5, 7)}.${v.slice(0, 4)}` : text(value);
}

function simpleValue(field) {
  const v = field.value;
  if (field.kind === 'date') return nbDate(v);
  if (field.kind === 'choice') return text((field.options || []).find((o) => o.id === v)?.label || v);
  return text(v);
}

function sectionsOf(fields) {
  const out = [];
  let current = { title: '', items: [] };
  for (const field of fields || []) {
    if (field.kind === 'title') {
      if (current.title || current.items.length) out.push(current);
      current = { title: field.label, items: [] };
    } else current.items.push(field);
  }
  if (current.title || current.items.length) out.push(current);
  return out;
}

function cellText(col, value) {
  if (col.type === 'check') return value ? 'Ja' : '';
  if (col.type === 'date') return nbDate(value);
  return text(value);
}

/** Én rad i en tabell: nummer, tittel og spørsmål fra malen, deretter svarene. */
function tableBlock(page, field, { topics = false } = {}) {
  const cols = field.columns || [];
  const fixed = cols.filter((c) => c.type === 'fixed');
  const answers = cols.filter((c) => c.type !== 'fixed');
  const rows = tableRows(field);
  let any = false;
  for (const row of rows) {
    if (row.group) {
      page.ensure(30);
      page.y += 6;
      page.text(row.group, LEFT, page.y, { size: 9.5, bold: true, color: C.navy });
      page.y += 15;
      continue;
    }
    const cells = { ...(row.preset || {}), ...(row.cells || {}) };
    const fixedTexts = fixed.map((c) => text(cells[c.id])).filter(Boolean);
    const numberLike = fixedTexts.length && /^\d+[.)]?$/.test(fixedTexts[0]) ? fixedTexts.shift() : '';
    const presetText = fixedTexts.join('\n');
    const filled = answers.map((c) => ({ col: c, value: cellText(c, cells[c.id]) })).filter((a) => a.value);
    if (!filled.length && !presetText) continue;
    any = true;
    const { title, prompts } = splitTopic(presetText);
    const long = filled.filter((a) => !SHORT_COLUMNS.has(a.col.type));
    const short = filled.filter((a) => SHORT_COLUMNS.has(a.col.type));
    // Uten tittel fra malen (handlingsplan): første lange svar er tittelen.
    const heads = title ? wrapText(title, WIDTH - 34, 10.2, true) : [];
    const lead = !title && long.length ? long.shift() : null;
    const leadLines = lead ? wrapText(lead.value, WIDTH - 34, 9.6) : [];
    page.ensure(Math.max(heads.length * 13.5, leadLines.length * 13.2) + 30);
    page.y += 4;
    const top = page.y;
    if (numberLike) page.text(numberLike, LEFT, top, { size: 10, bold: true, color: C.brand });
    heads.forEach((line, i) => page.text(line, LEFT + 34, top + i * 13.5, { size: 10.2, bold: true }));
    leadLines.forEach((line, i) => page.text(line, LEFT + 34, top + i * 13.2, { size: 9.6 }));
    page.y = top + heads.length * 13.5 + leadLines.length * 13.2;
    if (prompts.length && topics) {
      paragraphs(page, prompts.map((p) => `- ${p}`).join('\n'), LEFT + 34, WIDTH - 34, { size: 7.8, lead: 10.4, color: C.muted });
    }
    if (short.length) {
      const meta = short.map((a) => `${a.col.label}: ${a.value}`).join('   ·   ');
      wrapText(meta, WIDTH - 34, 8.2).forEach((line) => {
        page.ensure(12);
        page.text(line, LEFT + 34, page.y + 1, { size: 8.2, color: C.muted });
        page.y += 11.5;
      });
    }
    for (const a of long) {
      page.ensure(34);
      page.y += 5;
      page.text(a.col.label.toUpperCase(), LEFT + 34, page.y, { size: 6.6, bold: true, color: C.brand, space: 0.5 });
      page.y += 11;
      paragraphs(page, a.value, LEFT + 34, WIDTH - 34, { size: 9.3, lead: 13 });
    }
    if (topics && !filled.length) {
      page.text('Ingen notater', LEFT + 34, page.y + 1, { size: 8, color: C.faint });
      page.y += 12;
    }
    page.y += 6;
    page.line(LEFT + 34, page.y, RIGHT, { color: C.line, width: 0.4 });
    page.y += 4;
  }
  if (!any) {
    page.text('Ingen rader er fylt ut.', LEFT, page.y, { size: 8.5, color: C.faint });
    page.y += 14;
  }
}

function signatureBoxes(page, signs) {
  if (!signs.length) return;
  heading(page, 'Signaturer', { gap: 18 });
  const gap = 16;
  const w = (WIDTH - gap) / 2;
  for (let i = 0; i < signs.length; i += 2) {
    page.ensure(74);
    const top = page.y;
    signs.slice(i, i + 2).forEach((field, j) => {
      const x = LEFT + j * (w + gap);
      const sig = field.value && typeof field.value === 'object' && field.value.name ? field.value : null;
      page.round(x, top, w, 62, 7, sig ? C.greenSoft : C.soft);
      page.text(field.label.toUpperCase(), x + 12, top + 10, { size: 6.6, bold: true, color: sig ? C.green : C.muted, space: 0.5 });
      if (sig) {
        page.text(wrapText(sig.name, w - 24, 11, true)[0] || '', x + 12, top + 24, { size: 11, bold: true });
        page.text(`Signert digitalt ${stampLine(sig.at)}`.trim(), x + 12, top + 42, { size: 8, color: C.muted });
      } else {
        page.text('Ikke signert', x + 12, top + 28, { size: 9.5, color: C.faint });
      }
    });
    page.y = top + 72;
  }
}

/** Sidestrømmer for et utfylt samtaleskjema. company: tokenContext fra bedriftsprofilen. */
export function reviewCopyStreams(input, { company = {}, logo = null, employeeName = '', meetingDate = '' } = {}) {
  const doc = formWithTokens(input, company);
  const fields = doc?.fields || [];
  const facts = fields.filter((f) => SIMPLE.has(f.kind) && simpleValue(f)).map((f) => ({ label: f.label, value: simpleValue(f) }));
  const signs = fields.filter((f) => f.kind === 'sign');
  const topicsField = topicTable(doc);
  const date = nbDate(meetingDate) || facts.find((f) => /dato/i.test(f.label))?.value || '';
  const head = {
    label: (doc?.title || 'Dokument').toUpperCase(),
    title: doc?.title || 'Dokument',
    subtitle: [employeeName || doc?.subject?.name, date].filter(Boolean).join(' · '),
    company: text(company?.firma),
    draft: doc?.status !== 'ferdig',
    facts: facts.slice(0, 9),
    footerLeft: ['Fortrolig', text(company?.firma), doc?.number || doc?.doc?.docId || ''].filter(Boolean).join(' · '),
  };
  const page = pageWriter({
    onNewPage(api) {
      api.text(head.title, LEFT, 28, { size: 7.5, bold: true, color: C.muted });
      api.right(head.subtitle, RIGHT, 28, { size: 7.5, color: C.muted });
      api.line(LEFT, 41, RIGHT, { color: C.line, width: 0.4 });
    },
  });
  drawHeader(page, head, logo);
  if (head.facts.length) drawFacts(page, head);
  for (const section of sectionsOf(fields)) {
    // Seksjoner med bare enkle felt (de står i faktaboksen) og veiledning hoppes over.
    const content = section.items.filter((f) => f.kind === 'table' || (f.kind === 'long' && text(f.value)));
    if (!content.length) continue;
    if (section.title) heading(page, section.title, { gap: 16 });
    for (const field of section.items) {
      if (field.kind === 'note' && content.length) {
        paragraphs(page, field.label, LEFT, WIDTH, { size: 8, lead: 11, color: C.muted });
        page.y += 4;
      } else if (field.kind === 'table') {
        tableBlock(page, field, { topics: field.id === topicsField?.id });
      } else if (field.kind === 'long' && text(field.value)) {
        page.y += 4;
        accentBox(page, field.label, text(field.value), { fill: C.soft, bar: C.navy, size: 9.3 });
      }
    }
  }
  signatureBoxes(page, signs);
  const measured = measure(head.footerLeft, 7.2, false);
  if (measured > WIDTH * 0.7) head.footerLeft = head.footerLeft.slice(0, 90);
  return { streams: finish(page.pages, head), doc: head };
}

/** PDF-bytes. logo er bedriftens logo slik den lagres på selskapet (company.logo). */
export function buildReviewCopyPdf(doc, { company = {}, logo = null, employeeName = '', meetingDate = '' } = {}) {
  const image = logo ? logoForDocument(logo) : null;
  const { streams } = reviewCopyStreams(doc, { company, logo: image, employeeName, meetingDate });
  return pdfDocument(streams, image);
}
