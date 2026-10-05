/** Originalfiler for avtaledokumenter (PDF m.m.) i Firebase Storage. */

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function safeAgreementFileName(name) {
  return text(name).replace(/[^\w.\-()+ ]/g, '_').slice(0, 120) || 'avtale.pdf';
}

export function agreementFilePath(companyId, fileName) {
  const id = text(companyId) || 'local';
  return `families/${id}/anbud/contracts/${Date.now()}-${safeAgreementFileName(fileName)}`;
}

/** Laster opp én avtale-fil og returnerer varig nedlastings-URL. */
export async function uploadAgreementFile(companyId, picked) {
  const name = text(picked?.name) || 'avtale.pdf';
  const mimeType = text(picked?.mimeType) || 'application/pdf';
  if (!text(companyId)) throw new Error('Mangler bedrift for fillagring.');
  if (!picked?.blob && !picked?.uri) throw new Error('Mangler filinnhold.');
  const { uploadFile } = await import('../utils/media.js');
  const path = agreementFilePath(companyId, name);
  const url = await uploadFile(path, picked, mimeType);
  if (!url) throw new Error('Kunne ikke lagre originalfilen.');
  return {
    url,
    storagePath: path,
    name,
    mimeType,
    size: Number(picked?.size) || 0,
  };
}
