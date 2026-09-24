/** Escape text for HTML mail bodies. */
export function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function looksLikeHtml(value) {
  return /<[a-z][\s\S]*>/i.test(String(value || ''));
}

/** Convert a plain compose body to simple HTML paragraphs. */
export function plainTextToHtml(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n');
  if (!raw.trim()) return '<div><br></div>';
  const marked = escapeHtml(raw)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/(^|[^*])\*(?!\s)([^*]+)\*(?!\*)/g, '$1<i>$2</i>');
  return `<div>${marked.replace(/\n/g, '<br>')}</div>`;
}

/** Native toolbar wraps the current selection with markdown-lite markers. */
export function wrapPlainSelection(text, start, end, kind) {
  const src = String(text || '');
  const a = Math.max(0, Number(start) || 0);
  const b = Math.max(a, Number(end) || 0);
  const mid = src.slice(a, b) || (kind === 'ul' ? 'Punkt' : 'tekst');
  const wrapped = {
    bold: `**${mid}**`,
    italic: `*${mid}*`,
    underline: `__${mid}__`,
    ul: mid.split('\n').map((line) => (line.startsWith('• ') ? line : `• ${line}`)).join('\n'),
    ol: mid.split('\n').map((line, i) => `${i + 1}. ${line.replace(/^\d+\.\s+/, '')}`).join('\n'),
  }[kind] || mid;
  return {
    text: `${src.slice(0, a)}${wrapped}${src.slice(b)}`,
    start: a,
    end: a + wrapped.length,
  };
}

export function bulletsToHtml(text) {
  const html = looksLikeHtml(text) ? String(text) : plainTextToHtml(text);
  return html
    .replace(/(?:<br>)?•\s+/g, '<br>• ')
    .replace(/(?:<br>)?(\d+)\.\s+/g, '<br>$1. ');
}

export function wrapMailFont(innerHtml, { fontFamily, fontSize } = {}) {
  const inner = String(innerHtml || '<div><br></div>');
  const family = fontFamily || 'Calibri, "Segoe UI", Arial, sans-serif';
  const size = Number(fontSize) || 11;
  if (/data-wp-mail-font="1"/.test(inner)) return inner;
  return `<div data-wp-mail-font="1" style="font-family:${family};font-size:${size}pt;color:#1a2744">${inner}</div>`;
}

export function composeBodyToHtml(body, prefs = {}) {
  const html = looksLikeHtml(body) ? String(body || '') : plainTextToHtml(body);
  return wrapMailFont(html, prefs);
}
