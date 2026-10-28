/**
 * Referat og innkalling som PDF (A4), uten eksterne biblioteker.
 * Bygger på pdfDocument (Helvetica, WinAnsi, én logo) og målte tegnbredder
 * fra fakturaen, men med egen layout: farget hode, faktaboks, deltakertabell,
 * nummererte saker med beslutninger og oppfølging, oppfølgingsliste og sidetall.
 */
import { pdfDocument, pdfEscape } from '../indeksregulering/office.js';
import { textWidth } from '../economy/invoicePdf.js';
import { fitLogoBox, logoForDocument } from '../project/companyLogo.js';
import { minutesDocument } from './minutesDoc.js';

const PAGE_W = 595;
const PAGE_H = 842;
const LEFT = 48;
const RIGHT = 547;
const WIDTH = RIGHT - LEFT;
const BOTTOM = 64;

const C = {
  ink: [0.07, 0.11, 0.18],
  navy: [0.027, 0.153, 0.298],
  muted: [0.42, 0.46, 0.53],
  faint: [0.62, 0.65, 0.7],
  line: [0.88, 0.9, 0.93],
  soft: [0.965, 0.972, 0.98],
  brand: [0.063, 0.6, 0.957],
  brandSoft: [0.91, 0.96, 1],
  green: [0.086, 0.55, 0.27],
  greenSoft: [0.92, 0.975, 0.94],
  amber: [0.75, 0.42, 0.02],
  amberSoft: [1, 0.965, 0.9],
  red: [0.75, 0.15, 0.15],
  redSoft: [0.995, 0.93, 0.93],
  white: [1, 1, 1],
};

/** WinAnsi-koder for typografiske tegn Helvetica har, men som pdfEscape gjør om til «?». */
const WIN_ANSI = new Map([
  [0x2013, 150], [0x2014, 151], [0x2022, 149], [0x2026, 133], [0x2018, 145], [0x2019, 146],
  [0x201C, 147], [0x201D, 148], [0x201E, 132], [0x20AC, 128], [0x2030, 137], [0x2122, 153],
]);

/** Fjerner usynlige tegn og bytter tegn som ikke finnes i WinAnsi. */
export function pdfSafe(value) {
  let out = '';
  for (const ch of String(value ?? '')) {
    const code = ch.codePointAt(0);
    if (code === 0x09) out += '  ';
    else if (code === 0xA0 || code === 0x2007 || code === 0x202F) out += ' ';
    else if ((code >= 0x200B && code <= 0x200D) || code === 0xFEFF) continue;
    else if (code === 0x2032 || code === 0x201A) out += "'";
    else if (code === 0x2033) out += '"';
    else if (code === 0x25CF || code === 0x25AA || code === 0x2023) out += String.fromCharCode(0x2022);
    else if (code === 0x2212) out += '-';
    else out += ch;
  }
  return out;
}

/** Som pdfEscape, men tankestrek, kulepunkt, anførselstegn og € beholdes. */
function escape(value) {
  let out = '';
  for (const ch of pdfSafe(value)) {
    const win = WIN_ANSI.get(ch.codePointAt(0));
    out += win ? `\\${win.toString(8).padStart(3, '0')}` : pdfEscape(ch);
  }
  return out;
}

function rgb(c) {
  return c.map((v) => Number(v).toFixed(3)).join(' ');
}

function measure(value, size, bold) {
  return textWidth(pdfSafe(value), size, bold);
}

/** Bryter tekst på målt bredde. Lange ord (lenker) deles hardt. */
export function wrapText(value, maxWidth, size, bold = false) {
  const out = [];
  for (const paragraph of pdfSafe(value).split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = '';
    for (let word of words) {
      while (measure(word, size, bold) > maxWidth && word.length > 1) {
        let cut = word.length - 1;
        while (cut > 1 && measure(word.slice(0, cut), size, bold) > maxWidth) cut -= 1;
        if (line) { out.push(line); line = ''; }
        out.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next, size, bold) > maxWidth) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

function pageWriter({ onNewPage } = {}) {
  const pages = [[]];
  let y = 0;
  const api = {
    pages,
    get y() { return y; },
    set y(value) { y = value; },
    ops() { return pages[pages.length - 1]; },
    text(value, x, top, { size = 9, bold = false, color = C.ink, space = 0 } = {}) {
      const clean = pdfSafe(value);
      if (!clean) return;
      const ops = api.ops();
      ops.push(`${rgb(color)} rg`, 'BT', `/${bold ? 'F2' : 'F1'} ${size} Tf`);
      if (space) ops.push(`${space} Tc`);
      ops.push(`1 0 0 1 ${x.toFixed(2)} ${(PAGE_H - top - size * 0.8).toFixed(2)} Tm`, `(${escape(clean)}) Tj`);
      if (space) ops.push('0 Tc');
      ops.push('ET', '0 0 0 rg');
    },
    right(value, xRight, top, opts = {}) {
      const w = measure(value, opts.size || 9, opts.bold) + (opts.space || 0) * pdfSafe(value).length;
      api.text(value, xRight - w, top, opts);
    },
    rect(x, top, w, h, fill) {
      api.ops().push(`${rgb(fill)} rg`, `${x.toFixed(2)} ${(PAGE_H - top - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`, '0 0 0 rg');
    },
    round(x, top, w, h, r, fill, stroke = null) {
      const k = 0.5523 * r;
      const x0 = x;
      const x1 = x + w;
      const y1 = PAGE_H - top;
      const y0 = y1 - h;
      const p = (n) => n.toFixed(2);
      const ops = api.ops();
      if (fill) ops.push(`${rgb(fill)} rg`);
      if (stroke) ops.push(`${rgb(stroke)} RG`, '0.6 w');
      ops.push(
        `${p(x0 + r)} ${p(y0)} m`,
        `${p(x1 - r)} ${p(y0)} l`,
        `${p(x1 - r + k)} ${p(y0)} ${p(x1)} ${p(y0 + r - k)} ${p(x1)} ${p(y0 + r)} c`,
        `${p(x1)} ${p(y1 - r)} l`,
        `${p(x1)} ${p(y1 - r + k)} ${p(x1 - r + k)} ${p(y1)} ${p(x1 - r)} ${p(y1)} c`,
        `${p(x0 + r)} ${p(y1)} l`,
        `${p(x0 + r - k)} ${p(y1)} ${p(x0)} ${p(y1 - r + k)} ${p(x0)} ${p(y1 - r)} c`,
        `${p(x0)} ${p(y0 + r)} l`,
        `${p(x0)} ${p(y0 + r - k)} ${p(x0 + r - k)} ${p(y0)} ${p(x0 + r)} ${p(y0)} c`,
        fill && stroke ? 'B' : (fill ? 'f' : 'S'),
        '0 0 0 rg',
        '0 0 0 RG',
      );
    },
    line(x1, top, x2, { width = 0.5, color = C.line } = {}) {
      api.ops().push(`${rgb(color)} RG`, `${width} w`, `${x1.toFixed(2)} ${(PAGE_H - top).toFixed(2)} m ${x2.toFixed(2)} ${(PAGE_H - top).toFixed(2)} l S`, '0 0 0 RG');
    },
    /** Sideskift når høyden ikke får plass. Returnerer true ved nytt ark. */
    ensure(height) {
      if (y + height <= PAGE_H - BOTTOM) return false;
      pages.push([]);
      y = 56;
      onNewPage?.(api);
      return true;
    },
  };
  return api;
}

/* ───────── Byggeklosser ───────── */

function heading(page, label, { count = null, gap = 22 } = {}) {
  page.ensure(gap + 40);
  page.y += gap;
  page.text(label, LEFT, page.y, { size: 12.5, bold: true, color: C.navy });
  if (count != null) {
    const w = measure(label, 12.5, true);
    page.round(LEFT + w + 7, page.y + 0.5, measure(String(count), 8, true) + 10, 13, 6.5, C.soft);
    page.text(String(count), LEFT + w + 12, page.y + 3.2, { size: 8, bold: true, color: C.muted });
  }
  page.y += 20;
}

/** Avsnitt med punktlister («- », «* », «• »). */
function paragraphs(page, value, x, maxWidth, { size = 9.5, lead = 13.6, color = C.ink } = {}) {
  const raw = pdfSafe(value).replace(/\s+$/, '');
  if (!raw) return;
  for (const para of raw.split(/\r?\n/)) {
    const bullet = para.match(/^\s*(?:[-*]|\d+[.)])\s+(.*)$/);
    const body = bullet ? bullet[1] : para;
    const indent = bullet ? 11 : 0;
    const lines = body.trim() ? wrapText(body, maxWidth - indent, size) : [''];
    lines.forEach((line, index) => {
      page.ensure(lead);
      if (bullet && index === 0) {
        const numbered = /^\s*\d/.test(para);
        if (numbered) page.text(para.trim().split(/\s+/)[0], x, page.y, { size, color: C.muted });
        else page.round(x + 2, page.y + size * 0.42, 3.2, 3.2, 1.6, C.brand);
      }
      page.text(line, x + indent, page.y, { size, color });
      page.y += line ? lead : lead * 0.55;
    });
  }
}

function badge(page, label, x, top, tone) {
  const tones = {
    T: [C.greenSoft, C.green],
    F: [C.amberSoft, C.amber],
    IM: [C.redSoft, C.red],
    K: [C.soft, C.muted],
    '–': [C.soft, C.faint],
  };
  const [bg, fg] = tones[tone] || tones['–'];
  const w = Math.max(18, measure(label, 7, true) + 10);
  page.round(x - w, top, w, 12, 6, bg);
  page.text(label, x - w + (w - measure(label, 7, true)) / 2, top + 2.8, { size: 7, bold: true, color: fg });
}

function drawHeader(page, doc, logo) {
  page.rect(0, 0, PAGE_W, 5, C.brand);
  let logoBottom = 0;
  if (logo) {
    const box = fitLogoBox(logo.width, logo.height, 150, 46);
    const ops = page.ops();
    ops.push('q', `${box.width.toFixed(2)} 0 0 ${box.height.toFixed(2)} ${(RIGHT - box.width).toFixed(2)} ${(PAGE_H - 36 - box.height).toFixed(2)} cm`, '/Im1 Do', 'Q');
    logoBottom = 36 + box.height;
  } else if (doc.company) {
    page.right(doc.company, RIGHT, 40, { size: 13, bold: true, color: C.navy });
    logoBottom = 56;
  }
  const textRight = logo ? RIGHT - 170 : RIGHT - (doc.company ? Math.min(220, measure(doc.company, 13, true) + 20) : 0);
  page.text(doc.label, LEFT, 38, { size: 8.5, bold: true, color: C.brand, space: 1.4 });
  if (doc.draft) {
    const x = LEFT + measure(doc.label, 8.5, true) + doc.label.length * 1.4 + 10;
    page.round(x, 35.5, 50, 14, 7, C.amberSoft);
    page.text('UTKAST', x + 9, 39.2, { size: 7, bold: true, color: C.amber, space: 0.6 });
  }
  const titleLines = wrapText(doc.title, Math.max(240, textRight - LEFT), 21, true).slice(0, 3);
  let y = 56;
  for (const line of titleLines) {
    page.text(line, LEFT, y, { size: 21, bold: true, color: C.navy });
    y += 26;
  }
  wrapText(doc.subtitle, Math.max(240, textRight - LEFT), 10).slice(0, 2).forEach((line) => {
    page.text(line, LEFT, y + 1, { size: 10, color: C.muted });
    y += 14;
  });
  page.y = Math.max(y + 14, logoBottom + 14);
}

function drawFacts(page, doc) {
  const cols = 3;
  const gap = 14;
  const pad = 14;
  const colW = (WIDTH - pad * 2 - gap * (cols - 1)) / cols;
  const rows = [];
  for (let i = 0; i < doc.facts.length; i += cols) rows.push(doc.facts.slice(i, i + cols));
  const heights = rows.map((row) => Math.max(...row.map((f) => wrapText(f.value, colW, 9.5).slice(0, 3).length)) * 12.5 + 14);
  const total = heights.reduce((s, h) => s + h, 0) + pad * 2 - 6;
  page.ensure(total + 10);
  const top = page.y;
  page.round(LEFT, top, WIDTH, total, 8, C.soft);
  let y = top + pad;
  rows.forEach((row, ri) => {
    row.forEach((fact, ci) => {
      const x = LEFT + pad + ci * (colW + gap);
      page.text(fact.label.toUpperCase(), x, y, { size: 6.8, bold: true, color: C.muted, space: 0.5 });
      wrapText(fact.value, colW, 9.5).slice(0, 3).forEach((line, li) => {
        page.text(line, x, y + 11 + li * 12.5, { size: 9.5, color: C.ink, bold: fact.label === 'Dato' });
      });
    });
    y += heights[ri];
  });
  page.y = top + total + 10;
  if (doc.keyline) {
    page.text(doc.keyline, LEFT, page.y, { size: 8.5, color: C.muted });
    page.y += 12;
  }
  if (doc.reopenReason && !doc.draft && doc.revision > 1) {
    page.text(`Revisjon ${doc.revision}: ${doc.reopenReason}`, LEFT, page.y, { size: 8, color: C.amber });
    page.y += 12;
  }
}

function accentBox(page, label, value, { fill = C.brandSoft, bar = C.brand, size = 9.5 } = {}) {
  const inner = WIDTH - 30;
  const lines = wrapText(value, inner, size);
  const lead = size * 1.45;
  // Lange tekster deles over sider; boksen tegnes per side.
  let index = 0;
  let first = true;
  while (index < lines.length) {
    page.ensure(first ? 50 : 30);
    const room = Math.max(1, Math.floor((PAGE_H - BOTTOM - page.y - 26) / lead));
    const chunk = lines.slice(index, index + room);
    const h = chunk.length * lead + (first ? 30 : 16);
    const top = page.y;
    page.round(LEFT, top, WIDTH, h, 7, fill);
    page.rect(LEFT, top + 5, 3, h - 10, bar);
    let y = top + 10;
    if (first) {
      page.text(label.toUpperCase(), LEFT + 16, y, { size: 6.8, bold: true, color: bar, space: 0.6 });
      y += 14;
    }
    chunk.forEach((line) => {
      page.text(line, LEFT + 16, y, { size, color: C.ink });
      y += lead;
    });
    page.y = top + h + 8;
    index += chunk.length;
    first = false;
  }
}

function participantsTable(page, doc) {
  const minutes = doc.kind === 'referat';
  const cols = { name: LEFT, role: LEFT + 178, email: LEFT + 268, phone: LEFT + 408, mark: RIGHT };
  const head = () => {
    page.text('NAVN', cols.name, page.y, { size: 6.8, bold: true, color: C.muted, space: 0.5 });
    page.text('ROLLE', cols.role, page.y, { size: 6.8, bold: true, color: C.muted, space: 0.5 });
    page.text('E-POST', cols.email, page.y, { size: 6.8, bold: true, color: C.muted, space: 0.5 });
    page.text('TELEFON', cols.phone, page.y, { size: 6.8, bold: true, color: C.muted, space: 0.5 });
    if (minutes) page.right('OPPMØTE', cols.mark, page.y, { size: 6.8, bold: true, color: C.muted, space: 0.5 });
    page.y += 12;
    page.line(LEFT, page.y, RIGHT, { color: C.line });
    page.y += 6;
  };
  page.ensure(40);
  head();
  for (const p of doc.participants) {
    const nameLines = wrapText(p.name, 168, 9, true).slice(0, 2);
    const sub = [p.company, p.title].filter(Boolean).join(' · ');
    const subLines = sub ? wrapText(sub, 168, 7.5).slice(0, 2) : [];
    const mailLines = wrapText(p.email, 134, 8).slice(0, 2);
    const h = Math.max(nameLines.length * 11.5 + subLines.length * 9.5, mailLines.length * 10.5, 14) + 8;
    if (page.ensure(h + 4)) head();
    const top = page.y;
    nameLines.forEach((line, i) => page.text(line, cols.name, top + i * 11.5, { size: 9, bold: true }));
    subLines.forEach((line, i) => page.text(line, cols.name, top + nameLines.length * 11.5 + i * 9.5, { size: 7.5, color: C.muted }));
    page.text(p.role, cols.role, top + 1, { size: 8.3, color: p.roleId === 'leder' || p.roleId === 'referent' ? C.navy : C.ink, bold: p.roleId === 'leder' });
    mailLines.forEach((line, i) => page.text(line, cols.email, top + 1 + i * 10.5, { size: 8, color: C.ink }));
    page.text(p.phone, cols.phone, top + 1, { size: 8, color: C.ink });
    if (minutes) badge(page, p.mark, cols.mark, top - 0.5, p.mark);
    else if (p.mark === 'K') badge(page, 'K', cols.mark, top - 0.5, 'K');
    page.y = top + h;
    page.line(LEFT, page.y - 4, RIGHT, { color: C.line, width: 0.4 });
  }
  page.y += 2;
  page.text(doc.legend, LEFT, page.y, { size: 7, color: C.faint });
  page.y += 10;
}

function decisionBlock(page, value) {
  const x = LEFT + 34;
  const w = RIGHT - x;
  const lines = wrapText(value, w - 26, 9.2);
  const h = lines.length * 12.6 + 26;
  page.ensure(h + 6);
  const top = page.y;
  page.round(x, top, w, h, 6, C.greenSoft);
  page.rect(x, top + 4, 3, h - 8, C.green);
  page.text('BESLUTNING', x + 13, top + 7, { size: 6.5, bold: true, color: C.green, space: 0.6 });
  lines.forEach((line, i) => page.text(line, x + 13, top + 19 + i * 12.6, { size: 9.2, color: C.ink }));
  page.y = top + h + 6;
}

function actionBlock(page, action) {
  const x = LEFT + 34;
  const w = RIGHT - x;
  const metaW = 156;
  const lines = wrapText(action.text, w - metaW - 30, 9.2);
  const h = Math.max(lines.length * 12.6 + 26, 40);
  page.ensure(h + 6);
  const top = page.y;
  const tone = action.done ? [C.soft, C.green] : [C.amberSoft, C.amber];
  page.round(x, top, w, h, 6, tone[0]);
  page.rect(x, top + 4, 3, h - 8, tone[1]);
  const label = action.done ? 'OPPFØLGING · UTFØRT' : 'OPPFØLGING';
  page.text(label, x + 13, top + 7, { size: 6.5, bold: true, color: tone[1], space: 0.6 });
  if (action.origin) {
    const lx = x + 13 + measure(label, 6.5, true) + label.length * 0.6 + 8;
    page.text(action.origin.toUpperCase(), lx, top + 7, { size: 6.5, bold: true, color: C.muted, space: 0.4 });
  }
  lines.forEach((line, i) => page.text(line, x + 13, top + 19 + i * 12.6, { size: 9.2, color: action.done ? C.muted : C.ink }));
  const mx = RIGHT - metaW;
  page.text('ANSVARLIG', mx, top + 7, { size: 6.2, bold: true, color: C.muted, space: 0.4 });
  wrapText(action.assignee || '–', 90, 8.5, true).slice(0, 2).forEach((line, i) => {
    page.text(line, mx, top + 16 + i * 10.5, { size: 8.5, bold: !!action.assignee });
  });
  page.text('FRIST', mx + 98, top + 7, { size: 6.2, bold: true, color: C.muted, space: 0.4 });
  page.text(action.due || '–', mx + 98, top + 16, { size: 8.5 });
  page.y = top + h + 6;
}

function sectionsBlock(page, doc) {
  const minutes = doc.kind === 'referat';
  heading(page, minutes ? 'Saker' : 'Dagsorden', { gap: 16 });
  for (const section of doc.sections) {
    page.ensure(64);
    page.y += 6;
    page.text(`${section.number}`, LEFT, page.y, { size: 12, bold: true, color: C.brand });
    page.text(section.title, LEFT + 34, page.y, { size: 12, bold: true, color: C.navy });
    page.y += 17;
    page.line(LEFT, page.y, RIGHT, { color: C.line, width: 0.6 });
    page.y += 9;
    for (const item of section.items) {
      const titleLines = wrapText(item.title, RIGHT - LEFT - 34 - 80, 10.2, true);
      page.ensure(titleLines.length * 13.5 + 30);
      const top = page.y;
      page.text(item.number, LEFT, top, { size: 9.5, bold: true, color: C.muted });
      titleLines.forEach((line, i) => page.text(line, LEFT + 34, top + i * 13.5, { size: 10.2, bold: true }));
      const empty = minutes && !item.notes && !item.decisions.length && !item.actions.length;
      if (!minutes && item.start) page.right(`kl. ${item.start.replace(':', '.')}`, RIGHT, top + 1, { size: 8.5, color: C.muted });
      else if (minutes && item.carried) page.right('Videreført', RIGHT, top + 1, { size: 7.5, bold: true, color: C.amber });
      else if (empty) page.right('Ingen merknader', RIGHT, top + 1.5, { size: 8, color: C.faint });
      page.y = top + titleLines.length * 13.5;
      const meta = [
        item.presenter ? `Innleder: ${item.presenter}` : '',
        !minutes && item.minutes ? `${item.minutes} min` : '',
      ].filter(Boolean).join('  ·  ');
      if (meta) {
        page.text(meta, LEFT + 34, page.y + 1, { size: 8, color: C.muted });
        page.y += 13;
      }
      page.y += 3;
      if (!minutes && item.description) {
        paragraphs(page, item.description, LEFT + 34, RIGHT - LEFT - 34, { size: 9, lead: 12.8, color: [0.25, 0.29, 0.35] });
        page.y += 2;
      }
      if (minutes) {
        if (item.notes) {
          paragraphs(page, item.notes, LEFT + 34, RIGHT - LEFT - 34, { size: 9.5, lead: 13.6 });
          page.y += 3;
        }
        item.decisions.forEach((d) => decisionBlock(page, d));
        item.actions.forEach((a) => actionBlock(page, a));
      } else if (item.actions.some((a) => !a.done)) {
        item.actions.filter((a) => !a.done).forEach((a) => actionBlock(page, a));
      }
      page.y += empty && !meta ? 2 : 8;
    }
  }
}

function actionsTable(page, doc) {
  const open = doc.actions.filter((a) => !a.done);
  const closed = doc.actions.filter((a) => a.done);
  const rows = [...open, ...closed];
  if (!rows.length) return;
  heading(page, 'Oppfølgingsliste', { count: `${open.length} åpne` });
  const cols = { nr: LEFT, text: LEFT + 34, who: LEFT + 300, due: LEFT + 400, status: RIGHT };
  const head = () => {
    page.text('PKT', cols.nr, page.y, { size: 6.8, bold: true, color: C.muted, space: 0.5 });
    page.text('OPPFØLGING', cols.text, page.y, { size: 6.8, bold: true, color: C.muted, space: 0.5 });
    page.text('ANSVARLIG', cols.who, page.y, { size: 6.8, bold: true, color: C.muted, space: 0.5 });
    page.text('FRIST', cols.due, page.y, { size: 6.8, bold: true, color: C.muted, space: 0.5 });
    page.right('STATUS', cols.status, page.y, { size: 6.8, bold: true, color: C.muted, space: 0.5 });
    page.y += 12;
    page.line(LEFT, page.y, RIGHT, { color: C.line });
    page.y += 6;
  };
  page.ensure(40);
  head();
  for (const a of rows) {
    const lines = wrapText(a.text, cols.who - cols.text - 12, 8.8);
    const who = wrapText(a.assignee || '–', cols.due - cols.who - 8, 8.5).slice(0, 2);
    const h = Math.max(lines.length, who.length) * 11.5 + 8 + (a.origin ? 9 : 0);
    if (page.ensure(h + 4)) head();
    const top = page.y;
    page.text(a.itemNumber, cols.nr, top, { size: 8.5, bold: true, color: C.muted });
    lines.forEach((line, i) => page.text(line, cols.text, top + i * 11.5, { size: 8.8, color: a.done ? C.muted : C.ink }));
    if (a.origin) page.text(a.origin, cols.text, top + lines.length * 11.5, { size: 7, color: C.faint });
    who.forEach((line, i) => page.text(line, cols.who, top + i * 11.5, { size: 8.5 }));
    page.text(a.due || '–', cols.due, top, { size: 8.5 });
    badge(page, a.done ? 'Utført' : 'Åpen', cols.status, top - 1, a.done ? 'T' : 'F');
    page.y = top + h;
    page.line(LEFT, page.y - 4, RIGHT, { color: C.line, width: 0.4 });
  }
}

function signatures(page) {
  page.ensure(90);
  page.y += 36;
  const w = (WIDTH - 40) / 2;
  ['Møteleder', 'Protokollvitne'].forEach((label, i) => {
    const x = LEFT + i * (w + 40);
    page.line(x, page.y, x + w, { color: C.ink, width: 0.6 });
    page.text(label, x, page.y + 5, { size: 8, color: C.muted });
  });
  page.y += 24;
}

function finish(pages, doc) {
  const total = pages.length;
  return pages.map((ops, index) => {
    const pre = [];
    if (doc.draft) {
      // Svakt vannmerke bak innholdet.
      pre.push('q', `${rgb([0.94, 0.95, 0.965])} rg`, 'BT', '/F2 92 Tf', `0.819 0.574 -0.574 0.819 150 260 Tm`, `(${pdfEscape('UTKAST')}) Tj`, 'ET', 'Q');
    }
    const foot = [];
    const footer = pageWriter();
    footer.line(LEFT, PAGE_H - 44, RIGHT, { color: C.line, width: 0.5 });
    footer.text(doc.footerLeft, LEFT, PAGE_H - 36, { size: 7.2, color: C.muted });
    footer.right(`Side ${index + 1} av ${total}`, RIGHT, PAGE_H - 36, { size: 7.2, color: C.muted });
    if (doc.draft) footer.text('Utkast – ikke ferdigstilt', LEFT + WIDTH / 2 - 40, PAGE_H - 36, { size: 7.2, bold: true, color: C.amber });
    foot.push(...footer.ops());
    return [...pre, ...ops, ...foot].join('\n');
  });
}

/** Sidestrømmer for referat eller innkalling. */
export function minutesPageStreams(meeting, { kind = 'referat', company = {}, logo = null } = {}) {
  const doc = minutesDocument(meeting, { kind, company });
  const page = pageWriter({
    onNewPage(api) {
      api.text(`${doc.docTitle}: ${doc.title}`, LEFT, 28, { size: 7.5, bold: true, color: C.muted });
      api.right(doc.subtitle, RIGHT, 28, { size: 7.5, color: C.muted });
      api.line(LEFT, 41, RIGHT, { color: C.line, width: 0.4 });
    },
  });
  drawHeader(page, doc, logo);
  drawFacts(page, doc);
  if (doc.kind === 'innkalling' && doc.purpose) {
    page.y += 6;
    accentBox(page, 'Formål', doc.purpose);
  }
  if (doc.summary) {
    page.y += 6;
    accentBox(page, 'Sammendrag', doc.summary);
  }
  heading(page, 'Deltakere', { count: doc.participants.length, gap: 12 });
  participantsTable(page, doc);
  sectionsBlock(page, doc);
  if (doc.kind === 'referat') actionsTable(page, doc);
  if (doc.next) {
    page.y += 14;
    accentBox(page, 'Neste møte', doc.next, { fill: C.soft, bar: C.navy });
  }
  if (doc.kind === 'innkalling' && doc.videoUrl) {
    accentBox(page, 'Videolenke', doc.videoUrl, { fill: C.soft, bar: C.brand, size: 8.5 });
  }
  if (doc.kind === 'referat' && meeting?.typeId === 'styre') signatures(page);
  return { streams: finish(page.pages, doc), doc };
}

/** PDF-bytes. logo er bedriftens logo slik den lagres på selskapet. */
export function buildMinutesPdf(meeting, { kind = 'referat', company = {}, logo = null } = {}) {
  const image = logo ? logoForDocument(logo) : null;
  const { streams } = minutesPageStreams(meeting, { kind, company, logo: image });
  return pdfDocument(streams, image);
}
