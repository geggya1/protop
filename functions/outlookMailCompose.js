import { sanitizeHtml } from './sanitizeHtml.js';

export function parseAddresses(input) {
  return String(input || '')
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));
}

function looksLikeHtml(value) {
  return /<[a-z][\s\S]*>/i.test(String(value || ''));
}

export function buildMailBody(content, { html } = {}) {
  const text = String(content || '');
  const useHtml = html === true || (html !== false && looksLikeHtml(text));
  return {
    contentType: useHtml ? 'HTML' : 'Text',
    content: useHtml ? sanitizeHtml(text) : text,
  };
}

export function mapInlineAttachments(list) {
  return (list || [])
    .map((item) => {
      const contentBytes = String(item?.contentBytes || '')
        .replace(/^data:[^;]+;base64,/, '');
      if (!contentBytes) return null;
      return {
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: String(item.name || 'image.png').slice(0, 80),
        contentType: String(item.contentType || 'image/png'),
        contentBytes,
        contentId: String(item.contentId || 'signature-logo'),
        isInline: true,
      };
    })
    .filter(Boolean);
}

export function importanceOf(value) {
  const v = String(value || 'normal').toLowerCase();
  return v === 'high' || v === 'low' ? v : 'normal';
}

export function buildSendPayload(data) {
  const to = parseAddresses(data?.to);
  const cc = parseAddresses(data?.cc);
  const bcc = parseAddresses(data?.bcc);
  const attachments = mapInlineAttachments(data?.attachments);
  const subject = String(data?.subject || '').trim() || '(uten emne)';
  const body = buildMailBody(data?.body, { html: data?.html === true || data?.contentType === 'html' });
  return {
    to,
    message: {
      subject,
      body,
      toRecipients: to,
      ...(cc.length ? { ccRecipients: cc } : {}),
      ...(bcc.length ? { bccRecipients: bcc } : {}),
      importance: importanceOf(data?.importance),
      ...(data?.readReceipt ? { isReadReceiptRequested: true } : {}),
      ...(attachments.length ? { attachments } : {}),
    },
  };
}
