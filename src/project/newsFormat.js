/**
 * Formatering i bedriftsnyheter. Teksten lagres som enkel markering, så den kan vises likt
 * på web og mobil og leses som ren tekst der formatering ikke vises (varsler, utdrag).
 *
 *   ## Underoverskrift
 *   **fet**, *kursiv* (eller _kursiv_), __understreket__
 *   - punktliste            1. nummerert liste
 *
 * Linjeskift inne i et avsnitt beholdes. Ren JavaScript, testes med node --test.
 */

const LETTER = /[\p{L}\p{N}]/u;

const HEADING_RE = /^\s*(#{1,6})\s+(.*)$/;
const BULLET_RE = /^(\s*)([-*•])\s+(.*)$/;
const NUMBER_RE = /^(\s*)(\d{1,4})([.)])\s+(.*)$/;
const PREFIX_RE = /^(\s*)(#{1,6}\s+|[-*•]\s+|\d{1,4}[.)]\s+)/;

/** Hvor mange `ch` på rad fra `at` i retning `dir` (1 fremover, -1 bakover). */
function runOf(src, at, ch, dir, stop = dir > 0 ? src.length : -1) {
  let n = 0;
  for (let i = at; i !== stop && src[i] === ch; i += dir) n += 1;
  return n;
}

/**
 * Inline-segmenter: [{ text, bold?, italic?, underline? }]
 * \* \_ \# \\ og \- gir tegnet slik det står.
 */
export function parseNewsInline(line) {
  const src = String(line ?? '');
  const out = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ text: buf });
    buf = '';
  };
  const nested = (inner, flag) => {
    flush();
    for (const seg of parseNewsInline(inner)) out.push({ ...seg, [flag]: true });
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\' && /[*_#\\-]/.test(src[i + 1] || '')) {
      buf += src[i + 1];
      i += 2;
      continue;
    }
    if ((ch === '*' || ch === '_') && src[i + 1] === ch && src[i + 2] && src[i + 2] !== ' ') {
      // **fet** og __understreket__. ***x*** er fet rundt *x*.
      let end = src.indexOf(ch + ch, i + 2);
      while (end > -1 && src[end + 2] === ch) end += 1;
      if (end > i + 2 && src[end - 1] !== ' ') {
        nested(src.slice(i + 2, end), ch === '*' ? 'bold' : 'underline');
        i = end + 2;
        continue;
      }
    }
    if ((ch === '*' || ch === '_') && src[i + 1] && src[i + 1] !== ' ' && src[i + 1] !== ch) {
      // _ inne i ord (filnavn, snake_case) er ikke kursiv.
      const inWord = ch === '_' && i > 0 && LETTER.test(src[i - 1]);
      let end = src.indexOf(ch, i + 1);
      while (end > -1 && src[end + 1] === ch && runOf(src, end, ch, 1) % 2 === 0) end = src.indexOf(ch, end + 2);
      const endInWord = ch === '_' && end > -1 && LETTER.test(src[end + 1] || '');
      if (!inWord && end > i + 1 && src[end - 1] !== ' ' && !endInWord) {
        nested(src.slice(i + 1, end), 'italic');
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

/**
 * Blokker:
 *  { type: 'h', inline }
 *  { type: 'p', inline }                     linjeskift som { text: '\n' }
 *  { type: 'list', ordered, items: [{ number, inline }] }
 */
export function parseNewsBody(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let para = null;
  let list = null;
  const close = () => {
    para = null;
    list = null;
  };
  for (const line of lines) {
    if (!line.trim()) {
      close();
      continue;
    }
    const h = HEADING_RE.exec(line);
    if (h) {
      close();
      blocks.push({ type: 'h', inline: parseNewsInline(h[2].replace(/\s+#+\s*$/, '').trim()) });
      continue;
    }
    const bullet = BULLET_RE.exec(line);
    const num = bullet ? null : NUMBER_RE.exec(line);
    if (bullet || num) {
      para = null;
      const ordered = !!num;
      if (!list || list.ordered !== ordered) {
        list = { type: 'list', ordered, items: [] };
        blocks.push(list);
      }
      list.items.push({
        number: ordered ? Number(num[2]) : null,
        inline: parseNewsInline(ordered ? num[4] : bullet[3]),
      });
      continue;
    }
    list = null;
    if (para) {
      para.inline.push({ text: '\n' }, ...parseNewsInline(line.trim()));
    } else {
      para = { type: 'p', inline: parseNewsInline(line.trim()) };
      blocks.push(para);
    }
  }
  return blocks;
}

const inlineText = (inline) => inline.map((seg) => seg.text).join('');

/** Ren tekst uten markering. Lister får • eller nummer, avsnitt skilles med tom linje. */
export function newsPlainText(text) {
  return parseNewsBody(text).map((block) => {
    if (block.type === 'list') {
      return block.items.map((item) => `${block.ordered ? `${item.number}.` : '•'} ${inlineText(item.inline)}`).join('\n');
    }
    return inlineText(block.inline);
  }).join('\n\n');
}

/* ---------- Redigering: verktøylinjen ---------- */

export const INLINE_MARKS = {
  bold: { chars: ['*'], size: 2, placeholder: 'fet tekst' },
  italic: { chars: ['*', '_'], size: 1, placeholder: 'kursiv tekst' },
  underline: { chars: ['_'], size: 2, placeholder: 'understreket tekst' },
};

// Et løp på 2 bærer fet/understrek, et oddetall bærer kursiv (***x*** er begge).
const carries = (run, size) => (size === 2 ? run >= 2 : run % 2 === 1);

function clampRange(value, start, end) {
  const from = Math.max(0, Math.min(Number(start) || 0, value.length));
  const to = Math.max(0, Math.min(Number.isFinite(Number(end)) ? Number(end) : from, value.length));
  return from <= to ? [from, to] : [to, from];
}

function lineStartAt(value, at) {
  return value.lastIndexOf('\n', at - 1) + 1;
}

function lineEndAt(value, at) {
  const nl = value.indexOf('\n', at);
  return nl === -1 ? value.length : nl;
}

/** Biter av utvalget per linje, uten liste-/overskriftstegn og mellomrom i kantene. */
function selectedPieces(value, from, to) {
  const out = [];
  let a = from;
  while (a <= to) {
    const b = Math.min(lineEndAt(value, a), to);
    const lineStart = lineStartAt(value, a);
    const prefix = PREFIX_RE.exec(value.slice(lineStart, lineEndAt(value, a)));
    let s = prefix ? Math.max(a, lineStart + prefix[0].length) : a;
    let e = b;
    while (s < e && /\s/.test(value[s])) s += 1;
    while (e > s && /\s/.test(value[e - 1])) e -= 1;
    if (e > s) out.push([s, e]);
    if (b >= to) break;
    a = b + 1;
  }
  return out;
}

/**
 * Er biten [s, e) allerede merket? Tegnene i kanten av utvalget telles med, så både
 * «fet» og «**fet**» (og «fet**» fra et utvalg over flere linjer) kjennes igjen.
 * @returns {{ cs: number, ce: number } | null} innholdet mellom tegnene
 */
function markState(value, s, e, mark) {
  for (const ch of mark.chars) {
    let cs = s;
    let ce = e;
    while (cs < ce && value[cs] === ch) cs += 1;
    while (ce > cs && value[ce - 1] === ch) ce -= 1;
    if (cs === ce) continue;
    if (carries(runOf(value, cs - 1, ch, -1), mark.size) && carries(runOf(value, ce, ch, 1), mark.size)) {
      return { cs, ce };
    }
  }
  return null;
}

/**
 * Slår fet, kursiv eller understrek av og på for utvalget.
 * Uten utvalg: ordet markøren står i, ellers settes inn en plassholder som blir markert.
 * @returns {{ text: string, start: number, end: number }}
 */
export function toggleInline(text, start, end, kind) {
  const value = String(text ?? '');
  const mark = INLINE_MARKS[kind];
  if (!mark) return { text: value, start, end };
  let [from, to] = clampRange(value, start, end);
  const sign = mark.chars[0].repeat(mark.size);

  if (from === to) {
    if (LETTER.test(value[from - 1] || '') && LETTER.test(value[from] || '')) {
      while (from > 0 && LETTER.test(value[from - 1])) from -= 1;
      while (to < value.length && LETTER.test(value[to])) to += 1;
    } else {
      const placeholder = mark.placeholder;
      const at = from + sign.length;
      return {
        text: `${value.slice(0, from)}${sign}${placeholder}${sign}${value.slice(from)}`,
        start: at,
        end: at + placeholder.length,
      };
    }
  }

  const pieces = selectedPieces(value, from, to);
  if (!pieces.length) return { text: value, start: from, end: to };
  const states = pieces.map(([s, e]) => markState(value, s, e, mark));
  const remove = states.every(Boolean);

  let out = '';
  let last = 0;
  let selStart = null;
  let selEnd = null;
  pieces.forEach(([s, e], index) => {
    const state = states[index];
    if (remove) {
      out += value.slice(last, state.cs - mark.size);
      selStart ??= out.length;
      out += value.slice(state.cs, state.ce);
      selEnd = out.length;
      last = state.ce + mark.size;
      return;
    }
    // Biter som alt er merket, står som de er; resten får tegnene rundt seg.
    out += value.slice(last, s);
    if (!state) out += sign;
    selStart ??= out.length;
    out += value.slice(s, e);
    selEnd = out.length;
    if (!state) out += sign;
    last = e;
  });
  out += value.slice(last);
  return { text: out, start: selStart ?? from, end: selEnd ?? to };
}

export const BLOCK_KINDS = ['heading', 'bullet', 'number'];

function blockKind(line) {
  if (HEADING_RE.test(line)) return 'heading';
  if (BULLET_RE.test(line)) return 'bullet';
  if (NUMBER_RE.test(line)) return 'number';
  return null;
}

/**
 * Underoverskrift, punktliste eller nummerert liste for linjene utvalget berører.
 * Er alle linjene allerede av den typen, fjernes den.
 * @returns {{ text: string, start: number, end: number }}
 */
export function toggleBlock(text, start, end, kind) {
  const value = String(text ?? '');
  if (!BLOCK_KINDS.includes(kind)) return { text: value, start, end };
  const [from, to] = clampRange(value, start, end);
  const first = lineStartAt(value, from);
  // Et utvalg som slutter rett etter et linjeskift, tar ikke med neste linje.
  const lastAt = to > from && value[to - 1] === '\n' ? to - 1 : to;
  const stop = lineEndAt(value, lastAt);
  const lines = value.slice(first, stop).split('\n');
  const used = lines.length === 1 ? lines : lines.filter((line) => line.trim());
  const removing = used.length > 0 && used.every((line) => blockKind(line) === kind);

  let number = 1;
  if (kind === 'number' && first > 0) {
    const prev = NUMBER_RE.exec(value.slice(lineStartAt(value, first - 1), first - 1));
    if (prev) number = Number(prev[2]) + 1;
  }

  let caretShift = null;
  const next = lines.map((line, index) => {
    if (lines.length > 1 && !line.trim()) return line;
    const prefix = PREFIX_RE.exec(line);
    const rest = prefix ? line.slice(prefix[0].length) : line.replace(/^\s+/, '');
    const oldLen = line.length - rest.length;
    let head = '';
    if (!removing) {
      if (kind === 'heading') head = '## ';
      else if (kind === 'bullet') head = `${prefix?.[1] || ''}- `;
      else head = `${prefix?.[1] || ''}${number++}. `;
    }
    if (index === 0) caretShift = { oldLen, newLen: head.length };
    return `${head}${rest}`;
  });

  const body = next.join('\n');
  const out = `${value.slice(0, first)}${body}${value.slice(stop)}`;
  if (from === to && lines.length === 1 && caretShift) {
    const caret = first + caretShift.newLen + Math.max(0, from - first - caretShift.oldLen);
    return { text: out, start: caret, end: caret };
  }
  return { text: out, start: first, end: first + body.length };
}

/**
 * Enter i en liste: neste linje får samme punkt (eller neste nummer).
 * Enter på et tomt punkt avslutter listen. Svarer null når endringen ikke var et linjeskift i en liste.
 * @returns {{ text: string, caret: number } | null}
 */
export function continueList(prev, next) {
  const before = String(prev ?? '');
  const after = String(next ?? '');
  if (after.length !== before.length + 1) return null;
  let at = 0;
  while (at < before.length && before[at] === after[at]) at += 1;
  if (after[at] !== '\n' || after.slice(at + 1) !== before.slice(at)) return null;
  const lineStart = lineStartAt(before, at);
  const line = before.slice(lineStart, at);
  const bullet = BULLET_RE.exec(line);
  const num = bullet ? null : NUMBER_RE.exec(line);
  if (!bullet && !num) return null;
  const content = bullet ? bullet[3] : num[4];
  const rest = before.slice(at, lineEndAt(before, at));
  if (!content.trim() && !rest.trim()) {
    return { text: `${before.slice(0, lineStart)}${before.slice(at)}`, caret: lineStart };
  }
  const head = bullet ? `${bullet[1]}${bullet[2]} ` : `${num[1]}${Number(num[2]) + 1}${num[3]} `;
  return {
    text: `${before.slice(0, at)}\n${head}${before.slice(at)}`,
    caret: at + 1 + head.length,
  };
}
