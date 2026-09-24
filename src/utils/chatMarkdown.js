/**
 * Lightweight markdown-lite for AI chat bubbles.
 * Supports **bold**, *italic*, __underline__, `code`, and bullet/numbered lines.
 */

function pushText(out, text, styles) {
  if (!text) return;
  out.push({ text, ...styles });
}

/** Parse inline markers within a single line into style segments. */
export function parseInlineMarkdown(line) {
  const src = String(line || '');
  const out = [];
  let i = 0;

  while (i < src.length) {
    if (src[i] === '*' && src[i + 1] === '*') {
      const end = src.indexOf('**', i + 2);
      if (end !== -1) {
        pushText(out, src.slice(i + 2, end), { bold: true });
        i = end + 2;
        continue;
      }
    }
    if (src[i] === '_' && src[i + 1] === '_') {
      const end = src.indexOf('__', i + 2);
      if (end !== -1) {
        pushText(out, src.slice(i + 2, end), { underline: true });
        i = end + 2;
        continue;
      }
    }
    if (src[i] === '`') {
      const end = src.indexOf('`', i + 1);
      if (end !== -1) {
        pushText(out, src.slice(i + 1, end), { code: true });
        i = end + 1;
        continue;
      }
    }
    if (src[i] === '*' && src[i + 1] && src[i + 1] !== ' ' && src[i + 1] !== '*') {
      const end = src.indexOf('*', i + 1);
      if (end !== -1 && src[end + 1] !== '*') {
        pushText(out, src.slice(i + 1, end), { italic: true });
        i = end + 1;
        continue;
      }
    }

    let next = src.length;
    for (const marker of ['**', '__', '`', '*']) {
      const at = src.indexOf(marker, i + 1);
      if (at !== -1 && at < next) next = at;
    }
    pushText(out, src.slice(i, next), {});
    i = next;
  }

  return out.length ? out : [{ text: src }];
}

/**
 * @returns {{ type: 'p'|'ul'|'ol', indent?: number, segments: object[] }[]}
 */
export function parseChatMarkdown(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n');
  if (!raw) return [{ type: 'p', segments: [{ text: '' }] }];

  const lines = raw.split('\n');
  const blocks = [];

  for (const line of lines) {
    const bullet = line.match(/^(\s*)([•\-*]|\d+\.)\s+(.*)$/);
    if (bullet) {
      const indent = Math.min(2, Math.floor(bullet[1].replace(/\t/g, '  ').length / 2));
      const marker = bullet[2];
      const type = /^\d+\./.test(marker) ? 'ol' : 'ul';
      const prefix = type === 'ol' ? `${marker} ` : '• ';
      blocks.push({
        type,
        indent,
        segments: [{ text: prefix }, ...parseInlineMarkdown(bullet[3])],
      });
      continue;
    }
    blocks.push({ type: 'p', segments: parseInlineMarkdown(line) });
  }
  return blocks;
}

/** Whether text looks like it has markdown worth rendering. */
export function hasChatMarkdown(text) {
  const s = String(text || '');
  return /\*\*.+?\*\*|\*[^*\n]+?\*|__.+?__|`[^`]+`|(^|\n)\s*([•\-*]|\d+\.)\s+/m.test(s);
}
