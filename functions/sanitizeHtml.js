/** Conservative HTML sanitizer for untrusted Outlook message bodies. */
export function sanitizeHtml(html) {
  let s = String(html || '');
  s = s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '');
  s = s.replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, '');
  s = s.replace(/<embed[\s\S]*?>/gi, '');
  s = s.replace(/<link[\s\S]*?>/gi, '');
  s = s.replace(/<meta[\s\S]*?>/gi, '');
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/javascript:/gi, '');
  s = s.replace(/vbscript:/gi, '');
  s = s.replace(/data:text\/html/gi, '');
  return s;
}

export function recipientsToList(items) {
  return (items || []).map((r) => ({
    name: r?.emailAddress?.name || '',
    address: r?.emailAddress?.address || '',
  })).filter((r) => r.address);
}

export function senderOf(message) {
  const e = message?.from?.emailAddress || message?.sender?.emailAddress || {};
  return { name: e.name || '', address: e.address || '' };
}
