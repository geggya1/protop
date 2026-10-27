/**
 * Markdown for styrte dokumenter (policy, prosedyre, instruks, håndbok).
 * Ren JavaScript, så tolkningen kan testes med node --test og brukes likt på web og mobil.
 *
 * Støtter: overskrifter (# – ####), avsnitt, punkt- og nummererte lister (to nivåer),
 * avkrysningslister (- [ ] / - [x]), tabeller (| a | b |), sitat/merknad (>),
 * skillelinje (---), og i linjen **fet**, *kursiv*, `kode` og [lenke](https://…).
 */

const SAFE_URL = /^(https?:\/\/|mailto:|tel:)/i;

/** Inline-segmenter: [{ text, bold?, italic?, code?, href? }] */
export function parseInline(line) {
  const src = String(line ?? '');
  const out = [];
  let i = 0;
  let buf = '';
  const flush = () => {
    if (buf) out.push({ text: buf });
    buf = '';
  };
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\' && i + 1 < src.length && /[*_`[\]\\|#>-]/.test(src[i + 1])) {
      buf += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === '[') {
      const close = src.indexOf('](', i + 1);
      const end = close > -1 ? src.indexOf(')', close + 2) : -1;
      if (close > -1 && end > -1) {
        const label = src.slice(i + 1, close);
        const href = src.slice(close + 2, end).trim();
        if (label && SAFE_URL.test(href)) {
          flush();
          out.push({ text: label, href });
          i = end + 1;
          continue;
        }
      }
    }
    if (ch === '*' && src[i + 1] === '*') {
      const end = src.indexOf('**', i + 2);
      if (end > i + 2) {
        flush();
        for (const seg of parseInline(src.slice(i + 2, end))) out.push({ ...seg, bold: true });
        i = end + 2;
        continue;
      }
    }
    if ((ch === '*' || ch === '_') && src[i + 1] && src[i + 1] !== ' ' && src[i + 1] !== ch) {
      const end = src.indexOf(ch, i + 1);
      // _ inne i ord (snake_case, filnavn) er ikke kursiv
      const wordBefore = ch === '_' && i > 0 && /\w/.test(src[i - 1]);
      if (end > i + 1 && src[end - 1] !== ' ' && !wordBefore) {
        flush();
        for (const seg of parseInline(src.slice(i + 1, end))) out.push({ ...seg, italic: true });
        i = end + 1;
        continue;
      }
    }
    if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i) {
        flush();
        out.push({ text: src.slice(i + 1, end), code: true });
        i = end + 1;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
  return out.length ? out : [{ text: '' }];
}

function splitRow(line) {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  const cells = [];
  let cur = '';
  for (let i = 0; i < row.length; i += 1) {
    if (row[i] === '\\' && row[i + 1] === '|') { cur += '|'; i += 1; continue; }
    if (row[i] === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += row[i];
  }
  cells.push(cur.trim());
  return cells;
}

const isDivider = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);
const isTableLine = (line) => /^\s*\|.*\|\s*$/.test(line);

/**
 * Blokker:
 *  { type: 'h', level, inline }
 *  { type: 'p', inline }
 *  { type: 'li', ordered, number, depth, checked (null|true|false), inline }
 *  { type: 'table', head: [inline[]], rows: [[inline[]]] }
 *  { type: 'quote', inline }
 *  { type: 'hr' }
 */
export function parseMarkdown(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let para = [];
  const flushPara = () => {
    if (para.length) blocks.push({ type: 'p', inline: parseInline(para.join(' ')) });
    para = [];
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) { flushPara(); continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      blocks.push({ type: 'h', level: h[1].length, inline: parseInline(h[2].replace(/\s+#+\s*$/, '')) });
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushPara();
      blocks.push({ type: 'hr' });
      continue;
    }
    if (isTableLine(line) && i + 1 < lines.length && isDivider(lines[i + 1])) {
      flushPara();
      const head = splitRow(line).map(parseInline);
      const rows = [];
      i += 2;
      while (i < lines.length && isTableLine(lines[i])) {
        const cells = splitRow(lines[i]);
        while (cells.length < head.length) cells.push('');
        rows.push(cells.slice(0, Math.max(head.length, cells.length)).map(parseInline));
        i += 1;
      }
      i -= 1;
      blocks.push({ type: 'table', head, rows });
      continue;
    }
    const q = /^\s*>\s?(.*)$/.exec(line);
    if (q) {
      flushPara();
      const parts = [q[1]];
      while (i + 1 < lines.length && /^\s*>/.test(lines[i + 1])) {
        i += 1;
        parts.push(lines[i].replace(/^\s*>\s?/, ''));
      }
      blocks.push({ type: 'quote', inline: parseInline(parts.join(' ').trim()) });
      continue;
    }
    const li = /^(\s*)([-*•]|(\d+)[.)])\s+(.*)$/.exec(line);
    if (li) {
      flushPara();
      const indent = li[1].replace(/\t/g, '  ').length;
      let body = li[4];
      let checked = null;
      const box = /^\[( |x|X)\]\s+(.*)$/.exec(body);
      if (box) { checked = box[1] !== ' '; body = box[2]; }
      blocks.push({
        type: 'li',
        ordered: !!li[3],
        number: li[3] ? Number(li[3]) : null,
        depth: indent >= 2 ? 1 : 0,
        checked,
        inline: parseInline(body),
      });
      continue;
    }
    // Fortsettelseslinje under et listepunkt (innrykket)
    const last = blocks[blocks.length - 1];
    if (!para.length && last?.type === 'li' && /^\s{2,}\S/.test(line)) {
      last.inline = [...last.inline, { text: ' ' }, ...parseInline(line.trim())];
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  return blocks;
}

/** Ren tekst (søk, forhåndsvisning, sjekksum uten formatering). */
export function markdownToPlain(text) {
  return parseMarkdown(text).map((b) => {
    const t = (inline) => inline.map((s) => s.text).join('');
    if (b.type === 'table') return [b.head, ...b.rows].map((r) => r.map(t).join(' | ')).join('\n');
    if (b.type === 'hr') return '';
    return t(b.inline);
  }).filter(Boolean).join('\n');
}

/** Overskrifter for innholdsfortegnelse: [{ level, text, index }] */
export function outline(text) {
  return parseMarkdown(text)
    .map((b, index) => ({ b, index }))
    .filter(({ b }) => b.type === 'h' && b.level <= 3)
    .map(({ b, index }) => ({ level: b.level, text: b.inline.map((s) => s.text).join(''), index }));
}
