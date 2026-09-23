import { escapeHtml, looksLikeHtml } from './mailHtml.js';

export const DEFAULT_MAIL_SIGNATURE = {
  enabled: true,
  includeOnNew: true,
  includeOnReply: true,
  name: '',
  title: '',
  company: '',
  phone: '',
  website: '',
  extra: '',
  logoDataUrl: '',
};

export const MAIL_FONTS = [
  { id: 'calibri', label: 'Calibri', value: 'Calibri, "Segoe UI", Arial, sans-serif' },
  { id: 'segoe', label: 'Segoe UI', value: '"Segoe UI", Calibri, Arial, sans-serif' },
  { id: 'arial', label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { id: 'georgia', label: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
  { id: 'verdana', label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
];

export const MAIL_FONT_SIZES = [10, 11, 12, 14, 16, 18];

export function parseDataUrl(dataUrl) {
  const raw = String(dataUrl || '');
  const hit = raw.match(/^data:([^;]+);base64,(.+)$/i);
  if (!hit) return null;
  return { mime: hit[1], contentBytes: hit[2] };
}

export function logoFileName(mime) {
  if (/jpeg|jpg/i.test(mime || '')) return 'logo.jpg';
  if (/gif/i.test(mime || '')) return 'logo.gif';
  if (/webp/i.test(mime || '')) return 'logo.webp';
  return 'logo.png';
}

export function buildSignatureHtml(signature, { preview = false } = {}) {
  const sig = { ...DEFAULT_MAIL_SIGNATURE, ...(signature || {}) };
  if (!sig.enabled) return '';
  const hasText = [sig.name, sig.title, sig.company, sig.phone, sig.website, sig.extra]
    .some((v) => String(v || '').trim());
  if (!hasText && !sig.logoDataUrl) return '';

  const logoSrc = preview
    ? sig.logoDataUrl
    : (sig.logoDataUrl ? 'cid:signature-logo' : '');
  const img = logoSrc
    ? `<img src="${escapeHtml(logoSrc)}" alt="" width="88" style="width:88px;max-width:88px;height:auto;border:0;display:block" />`
    : '';

  const name = sig.name ? `<div style="font-weight:700;font-size:13pt;color:#1a2744">${escapeHtml(sig.name)}</div>` : '';
  const titleLine = [sig.title, sig.company].map((v) => String(v || '').trim()).filter(Boolean).join(' · ');
  const title = titleLine
    ? `<div style="color:#5b6b82;font-size:10pt">${escapeHtml(titleLine)}</div>`
    : '';
  const phone = sig.phone
    ? `<div style="color:#1a2744;font-size:10pt">${escapeHtml(sig.phone)}</div>`
    : '';
  const site = String(sig.website || '').trim();
  const website = site
    ? `<div style="font-size:10pt"><a href="${escapeHtml(site.startsWith('http') ? site : `https://${site}`)}" style="color:#2563eb;text-decoration:none">${escapeHtml(site)}</a></div>`
    : '';
  const extra = sig.extra
    ? `<div style="color:#5b6b82;font-size:10pt;margin-top:6px;white-space:pre-wrap">${escapeHtml(sig.extra)}</div>`
    : '';

  return `
<div data-wp-signature="1" style="margin-top:16px;font-family:Calibri,'Segoe UI',Arial,sans-serif">
  <div style="border-top:1px solid #e2e8f0;padding-top:12px;max-width:520px">
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <tr>
        ${img ? `<td style="vertical-align:top;padding-right:14px">${img}</td>` : ''}
        <td style="vertical-align:top;line-height:1.35">
          ${name}${title}${phone}${website}${extra}
        </td>
      </tr>
    </table>
  </div>
</div>`.trim();
}

export function shouldIncludeSignature(signature, mode) {
  const sig = { ...DEFAULT_MAIL_SIGNATURE, ...(signature || {}) };
  if (!sig.enabled) return false;
  if (mode === 'reply' || mode === 'replyAll' || mode === 'forward') return !!sig.includeOnReply;
  return sig.includeOnNew !== false;
}

export function appendSignatureHtml(bodyHtml, signature, { mode, preview = true } = {}) {
  if (!shouldIncludeSignature(signature, mode)) return String(bodyHtml || '');
  const sigHtml = buildSignatureHtml(signature, { preview });
  if (!sigHtml) return String(bodyHtml || '');
  const current = String(bodyHtml || '');
  if (current.includes('data-wp-signature="1"')) return current;
  const base = current.trim() ? current : '<div><br></div>';
  return `${base}${sigHtml}`;
}

export function prepareHtmlForSend(html, signature) {
  let out = String(html || '');
  const attachments = [];
  const parsed = parseDataUrl(signature?.logoDataUrl);
  if (parsed && (out.includes(signature.logoDataUrl) || out.includes('cid:signature-logo'))) {
    out = out.split(signature.logoDataUrl).join('cid:signature-logo');
    attachments.push({
      name: logoFileName(parsed.mime),
      contentType: parsed.mime,
      contentBytes: parsed.contentBytes,
      contentId: 'signature-logo',
      isInline: true,
    });
  }
  if (!looksLikeHtml(out)) {
    return { html: out, attachments };
  }
  return { html: out, attachments };
}

/** Shrink a data-URL logo so signatures stay small enough for Graph. */
export async function resizeLogoDataUrl(dataUrl, maxWidth = 180) {
  const src = String(dataUrl || '');
  if (!src.startsWith('data:image/') || typeof document === 'undefined') return src;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / Math.max(1, img.width));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(src);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}
