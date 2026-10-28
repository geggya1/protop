/**
 * Conservative HTML sanitizer for untrusted Outlook message bodies.
 * Regex-basert, så den er ikke vanntett. Bruk den bare der resultatet vises i en
 * iframe med sandbox="" (e-postvisningen). HTML som settes rett inn i appen
 * (dangerouslySetInnerHTML, innerHTML i skrivefeltet), skal gjennom sanitizeInlineHtml.
 */
export function sanitizeHtml(html) {
  let s = String(html || '');
  s = s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '');
  s = s.replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, '');
  s = s.replace(/<embed[\s\S]*?>/gi, '');
  s = s.replace(/<link[\s\S]*?>/gi, '');
  s = s.replace(/<meta[\s\S]*?>/gi, '');
  // Også <img/src=x/onerror=…> (skråstrek i stedet for mellomrom foran on…).
  s = s.replace(/[\s/]on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ' ');
  s = s.replace(/javascript:/gi, '');
  s = s.replace(/vbscript:/gi, '');
  s = s.replace(/data:text\/html/gi, '');
  return s;
}

/** Elementer som fjernes med alt innhold. */
const DROP_TAGS = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'svg', 'math',
  'template', 'noscript', 'base', 'link', 'meta', 'title', 'head', 'form', 'input', 'button',
  'textarea', 'select', 'option', 'video', 'audio', 'source', 'track', 'canvas', 'portal',
]);

/** Elementer som beholdes. Andre pakkes ut (innholdet blir stående). */
const ALLOWED_TAGS = new Set([
  'a', 'b', 'strong', 'i', 'em', 'u', 's', 'small', 'sub', 'sup', 'span', 'div', 'p', 'br', 'hr',
  'font', 'center', 'blockquote', 'pre', 'code', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'col', 'colgroup',
  'img',
]);

const ALLOWED_ATTRS = new Set([
  'href', 'src', 'alt', 'title', 'width', 'height', 'align', 'valign', 'color', 'bgcolor', 'border',
  'cellpadding', 'cellspacing', 'colspan', 'rowspan', 'style', 'dir', 'lang', 'face', 'size',
  'target', 'rel',
  // Markøren for signaturblokken i skrivefeltet (byttes ut når signaturen endres).
  'data-wp-signature',
]);

function compact(value) {
  // Nettleseren ignorerer kontrolltegn og mellomrom i protokollen («java\tscript:»).
  return String(value || '').replace(/[\u0000- \u007f-\u009f]+/g, '').toLowerCase();
}

/** Lenker: http(s), mailto, tel og ankere. Bilder i tillegg cid: og data:-bilder. */
export function safeHtmlUrl(value, { image = false } = {}) {
  const v = compact(value);
  if (!v) return false;
  if (/^(https?:|mailto:|tel:|#)/.test(v)) return true;
  if (image && /^(cid:|data:image\/(png|jpe?g|gif|webp);)/.test(v)) return true;
  // Relativ adresse uten protokoll.
  return !/^[a-z][a-z0-9+.-]*:/.test(v) && !v.startsWith('//');
}

export function safeInlineStyle(value) {
  const v = compact(value);
  return !/expression\(|javascript:|vbscript:|behavior:|-moz-binding|url\((?!['"]?(https?:|data:image\/))/.test(v);
}

function cleanChildren(node) {
  for (const child of Array.from(node.childNodes || [])) {
    if (child.nodeType === 3) continue;
    if (child.nodeType !== 1) {
      child.remove();
      continue;
    }
    const tag = String(child.nodeName || '').toLowerCase();
    if (DROP_TAGS.has(tag)) {
      child.remove();
      continue;
    }
    cleanChildren(child);
    if (!ALLOWED_TAGS.has(tag)) {
      while (child.firstChild) node.insertBefore(child.firstChild, child);
      child.remove();
      continue;
    }
    for (const attr of Array.from(child.attributes || [])) {
      const name = String(attr.name || '').toLowerCase();
      const keep = ALLOWED_ATTRS.has(name)
        && (name !== 'href' || safeHtmlUrl(attr.value))
        && (name !== 'src' || safeHtmlUrl(attr.value, { image: true }))
        && (name !== 'style' || safeInlineStyle(attr.value));
      if (!keep) child.removeAttribute(attr.name);
    }
    if (tag === 'a' && child.getAttribute?.('target')) child.setAttribute?.('rel', 'noopener noreferrer');
  }
}

/**
 * Streng sanitizer for HTML som settes rett inn i appen (signaturer, utkast og innliming i skrivefeltet).
 * Bruker nettleserens parser (DOMParser lager et inert dokument) og en tillatt-liste over
 * elementer, attributter og lenkeprotokoller. Uten DOMParser (native) faller den tilbake
 * til sanitizeHtml, men der vises HTML-en uansett ikke som HTML.
 */
export function sanitizeInlineHtml(html, { DOMParserImpl } = {}) {
  const source = String(html || '');
  const Parser = DOMParserImpl || (typeof DOMParser !== 'undefined' ? DOMParser : null);
  if (!Parser) return sanitizeHtml(source);
  try {
    const doc = new Parser().parseFromString(source, 'text/html');
    if (!doc?.body) return '';
    cleanChildren(doc.body);
    return doc.body.innerHTML;
  } catch {
    return '';
  }
}
