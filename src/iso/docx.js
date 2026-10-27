/**
 * Word (.docx) → Markdown for styrte dokumenter.
 * En .docx er en ZIP med XML. Vi tar med overskrifter, avsnitt, punkt- og nummererte lister,
 * tabeller, fet og kursiv og lenker – det dokumentvisningen i ProTop viser. Bilder, topp- og
 * bunntekst tas ikke med (originalen legges ved). Rene funksjoner – ingen lagring.
 */
import { strFromU8, unzipSync } from 'fflate';
import { parseXml } from './visio.js';
import { DOC_TYPES } from './documents.js';

const kids = (node, name) => (node?.children || []).filter((c) => typeof c === 'object' && (!name || c.name === name));
const kid = (node, name) => kids(node, name)[0] || null;
const attr = (node, name) => node?.attrs?.[name] ?? null;

function readFiles(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (data[0] === 0xd0 && data[1] === 0xcf) throw new Error('Dette er en gammel Word-fil (.doc). Åpne den i Word og lagre som .docx, så kan den importeres.');
  if (data[0] !== 0x50 || data[1] !== 0x4b) throw new Error('Filen er ikke en Word-fil (.docx).');
  const raw = unzipSync(data, { filter: (f) => /^word\/(document|styles|numbering)\.xml$|^word\/_rels\/document\.xml\.rels$/i.test(f.name) });
  const out = {};
  for (const [name, buf] of Object.entries(raw)) out[name] = strFromU8(buf);
  if (!out['word/document.xml']) throw new Error('Fant ikke dokumentinnholdet i Word-filen.');
  return out;
}

/** Stil-id → overskriftsnivå (1–4), «title» eller null. Norske og engelske stilnavn. */
function headingStyles(stylesXml) {
  const map = {};
  for (const s of kids(kid(parseXml(stylesXml || ''), 'styles'), 'style')) {
    const id = attr(s, 'styleId');
    const name = String(attr(kid(s, 'name'), 'val') || '').toLowerCase();
    const level = /^(heading|overskrift)\s*(\d)/.exec(name) || /^(heading|overskrift)(\d)$/i.exec(id || '');
    if (level) map[id] = Math.min(4, Number(level[2]));
    else if (/^(title|tittel)$/.test(name)) map[id] = 'title';
  }
  return map;
}

/** numId → nivå → «bullet» eller «decimal». */
function numberingFormats(numberingXml) {
  const root = kid(parseXml(numberingXml || ''), 'numbering');
  const abstract = {};
  for (const a of kids(root, 'abstractNum')) {
    const levels = {};
    for (const l of kids(a, 'lvl')) levels[attr(l, 'ilvl')] = attr(kid(l, 'numFmt'), 'val') || 'bullet';
    abstract[attr(a, 'abstractNumId')] = levels;
  }
  const out = {};
  for (const n of kids(root, 'num')) out[attr(n, 'numId')] = abstract[attr(kid(n, 'abstractNumId'), 'val')] || {};
  return out;
}

function relations(relsXml) {
  const out = {};
  for (const r of kids(kid(parseXml(relsXml || ''), 'Relationships'), 'Relationship')) out[attr(r, 'Id')] = attr(r, 'Target');
  return out;
}

const escapeMd = (s) => String(s).replace(/([*_`\\|[\]])/g, '\\$1');

/** Tekst i et avsnitt med fet/kursiv og lenker. */
function runsText(node, rels, out = { parts: [], images: 0 }) {
  for (const c of kids(node)) {
    if (c.name === 'r') {
      const pr = kid(c, 'rPr');
      const on = (n) => { const x = kid(pr, n); return !!x && !['0', 'false'].includes(String(attr(x, 'val') ?? '')); };
      let t = '';
      for (const p of kids(c)) {
        if (p.name === 't') t += (p.children || []).filter((x) => typeof x === 'string').join('');
        else if (p.name === 'tab') t += ' ';
        else if (p.name === 'br' || p.name === 'cr') t += ' ';
        else if (p.name === 'drawing' || p.name === 'pict') out.images += 1;
      }
      if (t) out.parts.push({ text: t, bold: on('b'), italic: on('i') });
    } else if (c.name === 'hyperlink') {
      const inner = runsText(c, rels, { parts: [], images: 0 });
      out.images += inner.images;
      const label = inner.parts.map((p) => p.text).join('');
      const href = rels[attr(c, 'id')] || '';
      if (label && /^(https?:|mailto:)/i.test(href)) out.parts.push({ text: label, href });
      else out.parts.push(...inner.parts);
    } else if (['ins', 'smartTag', 'fldSimple', 'sdt', 'sdtContent', 'customXml'].includes(c.name)) {
      runsText(c, rels, out);
    }
    // «del» (slettet tekst i sporede endringer) og «proofErr» hoppes over.
  }
  return out;
}

function inlineMarkdown(parts) {
  // Slå sammen nabobiter med lik formatering, så **fet** ikke brytes opp.
  const merged = [];
  for (const p of parts) {
    const last = merged[merged.length - 1];
    if (last && !last.href && !p.href && last.bold === p.bold && last.italic === p.italic) last.text += p.text;
    else merged.push({ ...p });
  }
  return merged.map((p) => {
    if (p.href) return `[${escapeMd(p.text.trim())}](${p.href})`;
    const raw = p.text;
    const core = raw.trim();
    if (!core) return raw;
    const lead = raw.slice(0, raw.indexOf(core));
    const tail = raw.slice(raw.indexOf(core) + core.length);
    let s = escapeMd(core);
    if (p.bold && p.italic) s = `***${s}***`;
    else if (p.bold) s = `**${s}**`;
    else if (p.italic) s = `*${s}*`;
    return lead + s + tail;
  }).join('').replace(/\s+/g, ' ').trim();
}

function paragraphInfo(p, ctx) {
  const pr = kid(p, 'pPr');
  const styleId = attr(kid(pr, 'pStyle'), 'val');
  const num = kid(pr, 'numPr');
  const res = runsText(p, ctx.rels);
  ctx.images += res.images;
  return {
    text: inlineMarkdown(res.parts),
    plain: res.parts.map((x) => x.text).join('').replace(/\s+/g, ' ').trim(),
    heading: styleId ? ctx.headings[styleId] ?? null : null,
    list: num ? {
      id: attr(kid(num, 'numId'), 'val') || '',
      level: Math.min(1, Number(attr(kid(num, 'ilvl'), 'val') || 0)),
      format: ctx.numbering[attr(kid(num, 'numId'), 'val')]?.[attr(kid(num, 'ilvl'), 'val') || '0'] || 'bullet',
    } : null,
  };
}

function tableMarkdown(tbl, ctx) {
  const rows = kids(tbl, 'tr').map((tr) => kids(tr, 'tc').map((tc) => {
    const parts = [];
    const walk = (n) => {
      for (const c of kids(n)) {
        if (c.name === 'p') { const t = paragraphInfo(c, ctx).text; if (t) parts.push(t); } else if (['tbl', 'sdt', 'sdtContent'].includes(c.name)) walk(c.name === 'tbl' ? { children: kids(c, 'tr').flatMap((r) => kids(r, 'tc')) } : c);
      }
    };
    walk(tc);
    return parts.join(' · ');
  })).filter((r) => r.some(Boolean));
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  // Én kolonne: vis som avsnitt, ikke som tabell.
  if (width === 1) return rows.map((r) => r[0]).filter(Boolean).join('\n\n');
  const pad = (r) => [...r, ...Array(width - r.length).fill('')];
  const lines = [`| ${pad(rows[0]).join(' | ')} |`, `|${Array(width).fill('---').join('|')}|`];
  for (const r of rows.slice(1)) lines.push(`| ${pad(r).join(' | ')} |`);
  return lines.join('\n');
}

/**
 * Les en .docx. Gir { title, markdown, headings, tables, images, words }.
 * title er dokumenttittelen (Tittel-stil eller første overskrift), ellers tom.
 */
export function docxToMarkdown(bytes) {
  const files = readFiles(bytes);
  const ctx = {
    headings: headingStyles(files['word/styles.xml']),
    numbering: numberingFormats(files['word/numbering.xml']),
    rels: relations(files['word/_rels/document.xml.rels']),
    images: 0,
  };
  const body = kid(kid(parseXml(files['word/document.xml']), 'document'), 'body');
  const blocks = [];
  let title = '';
  let headings = 0;
  let tables = 0;
  const counters = {};
  const walk = (node) => {
    for (const c of kids(node)) {
      if (c.name === 'p') {
        const info = paragraphInfo(c, ctx);
        if (!info.text) continue;
        if (info.heading === 'title') { if (!title) title = info.plain; blocks.push({ kind: 'title', text: info.text }); continue; }
        if (info.heading) {
          if (!title && info.heading === 1) title = info.plain;
          headings += 1;
          blocks.push({ kind: 'h', level: info.heading, text: info.text.replace(/^\*\*(.*)\*\*$/, '$1') });
          continue;
        }
        if (info.list) {
          const key = `${info.list.id}:${info.list.level}`;
          counters[key] = (counters[key] || 0) + 1;
          const marker = info.list.format === 'bullet' || info.list.format === 'none' ? '-' : `${counters[key]}.`;
          blocks.push({ kind: 'li', text: `${info.list.level ? '  ' : ''}${marker} ${info.text}` });
          continue;
        }
        Object.keys(counters).forEach((k) => { delete counters[k]; });
        blocks.push({ kind: 'p', text: info.text });
      } else if (c.name === 'tbl') {
        const md = tableMarkdown(c, ctx);
        if (md) { tables += 1; blocks.push({ kind: 't', text: md }); }
      } else if (['sdt', 'sdtContent', 'customXml'].includes(c.name)) {
        walk(c);
      }
    }
  };
  walk(body);
  // Har dokumentet en tittel, blir den # og overskriftene flyttes ett nivå ned.
  const shift = blocks.some((b) => b.kind === 'title') ? 1 : 0;
  for (const b of blocks) {
    if (b.kind === 'title') b.text = `# ${b.text}`;
    else if (b.kind === 'h') b.text = `${'#'.repeat(Math.min(4, b.level + shift))} ${b.text}`;
  }
  // Lister holdes samlet; andre blokker skilles med tom linje.
  let markdown = '';
  blocks.forEach((b, i) => {
    const prev = blocks[i - 1];
    markdown += i === 0 ? '' : (b.kind === 'li' && prev?.kind === 'li' ? '\n' : '\n\n');
    markdown += b.text;
  });
  const words = markdown.split(/\s+/).filter(Boolean).length;
  return { title, markdown: markdown.slice(0, 60000), truncated: markdown.length > 60000, headings, tables, images: ctx.images, words };
}

/* ───────── Fra filnavn til dokumentkort ───────── */

const TYPE_WORDS = [
  ['policy', /politikk|policy/i],
  ['instruks', /instruks/i],
  ['handbok', /h[åa]ndbok/i],
  ['sjekkliste', /sjekkliste/i],
  ['skjema', /\bskjema\b/i],
  ['mal', /\bmal\b|\bmaler\b/i],
  ['plan', /\bplan\b|beredskapsplan|handlingsplan/i],
  ['analyse', /analyse|kartlegging|swot/i],
  ['register', /register|matrise|oversikt/i],
  ['rapport', /rapport|referat/i],
  ['veileder', /veileder|oppl[æa]ring/i],
  ['prosedyre', /prosedyre|rutine/i],
];

/**
 * Dokument-ID, mappe, tittel og type fra filnavnet, slik dokumentene heter i SharePoint:
 * «F-01-009 Prosedyre - Dokumentstyring.docx», «C1-C-01-003 Taushetserklæring.docx».
 */
export function documentMetaFromFileName(fileName, wordTitle = '') {
  const base = String(fileName || '').replace(/\.docx?$/i, '').replace(/_/g, ' ').trim();
  const m = /^((?:C1-)?[A-Z]-\d{2}-\d{3})\b\s*[-–]?\s*(.*)$/i.exec(base);
  const code = m ? m[1].toUpperCase() : '';
  const rest = (m ? m[2] : base).replace(/\s+/g, ' ').trim();
  const folder = code ? code.replace(/^C1-/, '').split('-').slice(0, 2).join('-') : '';
  const probe = `${rest} ${wordTitle}`;
  const docType = (TYPE_WORDS.find(([, re]) => re.test(probe)) || ['prosedyre'])[0];
  // «Prosedyre - Dokumentstyring» → «Dokumentstyring»: typen vises allerede som dokumenttype.
  const trimmed = rest.replace(/^(prosedyre|rutine|instruks|mal|skjema|sjekkliste)\s*(?:[-–:]\s*|\s+(?=\S))/i, '').trim();
  const title = trimmed || rest || wordTitle || base;
  return { code: code.replace(/^C1-/, ''), originalCode: code, folder, title: title.slice(0, 200), docType: DOC_TYPES.some((d) => d.id === docType) ? docType : 'prosedyre' };
}
