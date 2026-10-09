/**
 * Formattering og sortering for CV-redigering.
 * Enkel markering: **fet**, _kursiv_, __understreking__, linjer med • for kulepunkt.
 */

export function yearKey(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/(19|20)\d{2}/);
  if (!match) return 0;
  return Number(match[0]);
}

export function courseKey(value) {
  const raw = String(value || '').trim();
  const dotted = raw.match(/(\d{1,2})\.\s*((?:19|20)\d{2})/);
  if (dotted) return Number(dotted[2]) * 100 + Number(dotted[1]);
  return yearKey(raw) * 100;
}

/** Nyeste startår først. Tomme år sist. */
export function sortByStartDesc(items, keyOf = (row) => row?.from) {
  return [...(Array.isArray(items) ? items : [])].sort((left, right) => {
    const a = yearKey(keyOf(left));
    const b = yearKey(keyOf(right));
    if (a !== b) return b - a;
    return String(keyOf(right) || '').localeCompare(String(keyOf(left) || ''), 'nb');
  });
}

export function sortCoursesDesc(items) {
  return [...(Array.isArray(items) ? items : [])].sort((left, right) => (
    courseKey(right?.date) - courseKey(left?.date)
  ));
}

export function moveItem(list, index, delta) {
  const items = Array.isArray(list) ? [...list] : [];
  const next = index + delta;
  if (index < 0 || next < 0 || index >= items.length || next >= items.length) return items;
  const [row] = items.splice(index, 1);
  items.splice(next, 0, row);
  return items;
}

export function wrapSelection(text, start, end, prefix, suffix = prefix) {
  const value = String(text || '');
  const from = Math.max(0, Math.min(Number(start) || 0, value.length));
  const to = Math.max(from, Math.min(Number(end) || from, value.length));
  const selected = value.slice(from, to) || 'tekst';
  const next = `${value.slice(0, from)}${prefix}${selected}${suffix}${value.slice(to)}`;
  const caret = from + prefix.length + selected.length + suffix.length;
  return { text: next, start: from + prefix.length, end: caret - suffix.length, caret };
}

export function insertBullet(text, start = 0) {
  const value = String(text || '');
  const at = Math.max(0, Math.min(Number(start) || 0, value.length));
  const lineStart = value.lastIndexOf('\n', Math.max(0, at - 1)) + 1;
  const line = value.slice(lineStart, value.indexOf('\n', at) === -1 ? value.length : value.indexOf('\n', at));
  if (/^\s*[•\-]\s/.test(line)) {
    return { text: value, caret: at };
  }
  const next = `${value.slice(0, lineStart)}• ${value.slice(lineStart)}`;
  return { text: next, caret: at + 2 };
}

/** Fjerner markering for ren PDF/tekst, behold kulepunkt. */
export function plainFormatted(value) {
  return String(value || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|[\s(])_(.+?)_([\s).,]|$)/g, '$1$2$3')
    .replace(/\r\n/g, '\n')
    .trim();
}

export function formattedSegments(value) {
  const raw = String(value || '');
  if (!raw) return [];
  const out = [];
  const re = /(\*\*(.+?)\*\*|__(.+?)__|(^|[\s(])_(.+?)_([\s).,]|$))/g;
  let last = 0;
  let match = re.exec(raw);
  while (match) {
    if (match.index > last) out.push({ text: raw.slice(last, match.index) });
    if (match[2]) out.push({ text: match[2], bold: true });
    else if (match[3]) out.push({ text: match[3], underline: true });
    else out.push({ text: `${match[4] || ''}${match[5]}${match[6] || ''}`, italic: true });
    last = match.index + match[0].length;
    match = re.exec(raw);
  }
  if (last < raw.length) out.push({ text: raw.slice(last) });
  return out.length ? out : [{ text: raw }];
}
