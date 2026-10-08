/** Originalfiler for tilbudsvedlegg i Firebase Storage. */

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export const MAX_BID_UPLOAD_BYTES = 25 * 1024 * 1024;

export function safeBidFileName(name) {
  return text(name).replace(/[^\w.\-()+ ]/g, '_').slice(0, 120) || 'vedlegg.bin';
}

export function bidFilePath(companyId, bidId, fileName, salt = '') {
  const company = text(companyId) || 'local';
  const bid = text(bidId) || 'bid';
  const unique = text(salt) || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `families/${company}/anbud/bids/${bid}/${unique}-${safeBidFileName(fileName)}`;
}

function sizeLabel(size) {
  const n = Number(size) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Laster opp ett tilbudsvedlegg og returnerer varig nedlastings-URL. */
export async function uploadBidFile(companyId, bidId, picked, options = {}) {
  const name = text(picked?.name) || 'vedlegg.bin';
  const mimeType = text(picked?.mimeType) || 'application/octet-stream';
  const size = Number(picked?.size) || 0;
  if (!text(companyId)) throw new Error('Mangler bedrift for fillagring.');
  if (!text(bidId)) throw new Error('Mangler tilbud for fillagring.');
  if (!picked?.blob && !picked?.uri) throw new Error('Mangler filinnhold.');
  if (size > MAX_BID_UPLOAD_BYTES) throw new Error('Filen er over 25 MB.');
  const { uploadFile } = await import('../utils/media.js');
  const path = bidFilePath(companyId, bidId, name, options.salt);
  const url = await uploadFile(path, picked, mimeType);
  if (!url) throw new Error('Kunne ikke lagre vedlegget.');
  return {
    url,
    storagePath: path,
    name,
    mimeType,
    size,
    sizeLabel: sizeLabel(size),
    status: 'lastet',
  };
}
