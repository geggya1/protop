/**
 * Verktøylinjen i artikkelfeltet (Om oss, Bærekraft). Teksten er Markdown, som
 * src/iso/markdown.js tolker. Hver handling tar teksten og markeringen og gir ny tekst
 * og ny markering tilbake, så den kan testes uten skjerm og brukes likt på web og mobil.
 */

export const FORMAT_ACTIONS = [
  { id: 'h2', label: 'Overskrift', icon: 'format-header-2' },
  { id: 'h3', label: 'Mellomtittel', icon: 'format-header-3' },
  { id: 'bold', label: 'Fet', icon: 'format-bold' },
  { id: 'italic', label: 'Kursiv', icon: 'format-italic' },
  { id: 'ul', label: 'Punktliste', icon: 'format-list-bulleted' },
  { id: 'ol', label: 'Nummerert liste', icon: 'format-list-numbered' },
  { id: 'quote', label: 'Sitat', icon: 'format-quote-close' },
  { id: 'link', label: 'Lenke', icon: 'link-variant' },
];

const INLINE = { bold: '**', italic: '*' };
const LINE = {
  h2: () => '## ',
  h3: () => '### ',
  ul: () => '- ',
  ol: (index) => `${index + 1}. `,
  quote: () => '> ',
};
const LINE_PREFIX = /^(#{1,4}\s+|>\s?|[-*•]\s+|\d+[.)]\s+)/;
const MATCHES = {
  h2: /^##\s+/,
  h3: /^###\s+/,
  ul: /^[-*•]\s+/,
  ol: /^\d+[.)]\s+/,
  quote: /^>\s?/,
};
const PLACEHOLDER = {
  bold: 'fet tekst',
  italic: 'kursiv tekst',
  h2: 'Overskrift',
  h3: 'Mellomtittel',
  ul: 'Punkt',
  ol: 'Punkt',
  quote: 'Sitat',
  link: 'lenketekst',
};
export const LINK_PLACEHOLDER = 'https://';

function bounds(text, selection) {
  const length = text.length;
  const start = Math.max(0, Math.min(length, Number(selection?.start) || 0));
  const end = Math.max(start, Math.min(length, Number(selection?.end ?? start) || start));
  return { start, end };
}

function wrapInline(text, start, end, kind) {
  const mark = INLINE[kind];
  // Allerede markert med samme tegn rett utenfor: fjern dem (av/på).
  if (start >= mark.length
    && text.slice(start - mark.length, start) === mark
    && text.slice(end, end + mark.length) === mark
    && !(kind === 'italic' && (text[start - mark.length - 1] === '*' || text[end + mark.length] === '*'))) {
    const next = text.slice(0, start - mark.length) + text.slice(start, end) + text.slice(end + mark.length);
    return { text: next, selection: { start: start - mark.length, end: end - mark.length } };
  }
  let a = start;
  let b = end;
  // Mellomrom i kanten av markeringen havner utenfor tegnene, ellers tolkes ikke **ord **.
  while (a < b && /\s/.test(text[a])) a += 1;
  while (b > a && /\s/.test(text[b - 1])) b -= 1;
  const inner = text.slice(a, b) || PLACEHOLDER[kind];
  const next = `${text.slice(0, a)}${mark}${inner}${mark}${text.slice(b)}`;
  return { text: next, selection: { start: a + mark.length, end: a + mark.length + inner.length } };
}

function prefixLines(text, start, end, kind) {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const nl = text.indexOf('\n', end > start && text[end - 1] === '\n' ? end - 1 : end);
  const lineEnd = nl === -1 ? text.length : nl;
  const lines = text.slice(lineStart, lineEnd).split('\n');
  const content = lines.filter((line) => line.trim());
  const already = content.length > 0 && content.every((line) => MATCHES[kind].test(line));
  let count = 0;
  const changed = lines.map((line) => {
    if (!line.trim() && lines.length > 1) return line;
    const bare = line.replace(LINE_PREFIX, '');
    if (already) return bare;
    const prefix = LINE[kind](count);
    count += 1;
    return `${prefix}${bare || PLACEHOLDER[kind]}`;
  });
  let block = changed.join('\n');
  let before = text.slice(0, lineStart);
  let after = text.slice(lineEnd);
  // Overskrift, liste og sitat må stå i egen blokk: tom linje før og etter mot vanlig tekst.
  if (!already && (kind === 'h2' || kind === 'h3' || kind === 'quote')) {
    if (before && !before.endsWith('\n\n')) before = before.endsWith('\n') ? `${before}\n` : `${before}\n\n`;
    if (after && !after.startsWith('\n\n')) after = after.startsWith('\n') ? `\n${after}` : `\n\n${after}`;
  }
  if (!already && (kind === 'ul' || kind === 'ol')) {
    const prevLine = before.replace(/\n$/, '').split('\n').pop() || '';
    if (before && prevLine.trim() && !LINE_PREFIX.test(prevLine)) before = `${before.replace(/\n$/, '')}\n\n`;
  }
  block = block.replace(/\n+$/, '');
  return {
    text: `${before}${block}${after}`,
    selection: { start: before.length, end: before.length + block.length },
  };
}

function insertLink(text, start, end) {
  let a = start;
  let b = end;
  while (a < b && /\s/.test(text[a])) a += 1;
  while (b > a && /\s/.test(text[b - 1])) b -= 1;
  const label = text.slice(a, b) || PLACEHOLDER.link;
  const head = `${text.slice(0, a)}[${label}](`;
  const next = `${head}${LINK_PLACEHOLDER})${text.slice(b)}`;
  // Adressen markeres, så det man skriver erstatter «https://».
  return { text: next, selection: { start: head.length, end: head.length + LINK_PLACEHOLDER.length } };
}

/** Bruk en handling fra FORMAT_ACTIONS på teksten. selection: { start, end } fra TextInput. */
export function applyFormat(value, selection, kind) {
  const text = String(value ?? '');
  const { start, end } = bounds(text, selection);
  if (INLINE[kind]) return wrapInline(text, start, end, kind);
  if (LINE[kind]) return prefixLines(text, start, end, kind);
  if (kind === 'link') return insertLink(text, start, end);
  return { text, selection: { start, end } };
}

/**
 * Lenker uten protokoll ([oss](www.bedrift.no)) får https://, så tolkeren godtar dem.
 * Andre protokoller (javascript: o.l.) står igjen som tekst.
 */
export function withSafeLinks(value) {
  return String(value ?? '').replace(
    /\]\((?!https?:|mailto:|tel:)((?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/?#][^)\s]*)?)\)/gi,
    '](https://$1)',
  );
}
