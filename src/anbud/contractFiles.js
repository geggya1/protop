/** Originalfiler for avtaledokumenter (PDF m.m.) i Firebase Storage. */

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function safeAgreementFileName(name) {
  return text(name).replace(/[^\w.\-()+ ]/g, '_').slice(0, 120) || 'avtale.pdf';
}

export function agreementFilePath(companyId, fileName, salt = '') {
  const id = text(companyId) || 'local';
  const unique = text(salt) || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `families/${id}/anbud/contracts/${unique}-${safeAgreementFileName(fileName)}`;
}

function href(value) {
  return String(value || '').trim();
}

/** Varig fil: https-adresse og lagringssti. blob:- og data:-URLer dør med fanen. */
export function agreementFileIsDurable(file) {
  const url = href(file?.url);
  const storagePath = href(file?.storagePath);
  if (!/^https?:\/\//i.test(url)) return false;
  if (!storagePath || storagePath.includes('..')) return false;
  if (/^https?:/i.test(storagePath) || storagePath.startsWith('blob:') || storagePath.startsWith('data:')) return false;
  return true;
}

/** Filen har innhold som må opp i Storage før avtalen kan lagres. */
export function agreementFileNeedsUpload(file) {
  if (!file || agreementFileIsDurable(file)) return false;
  return !!(file.blob || href(file.uri) || href(file.dataUrl));
}

/**
 * Sørger for at originalfilen ligger i Storage.
 * En lokal blob- eller data-URL er bare til forhåndsvisning i denne fanen.
 */
export async function ensureAgreementOriginal(companyId, file, options = {}) {
  if (!file) return file;
  if (agreementFileIsDurable(file)) {
    return {
      ...file,
      uri: href(file.uri).startsWith('blob:') ? '' : href(file.uri),
      dataUrl: '',
    };
  }
  if (!agreementFileNeedsUpload(file)) {
    return {
      ...file,
      uri: href(file.uri).startsWith('blob:') ? '' : href(file.uri),
    };
  }
  const uploaded = await uploadAgreementFile(companyId, {
    blob: file.blob || null,
    uri: href(file.uri),
    name: href(file.name) || 'Avtale.pdf',
    mimeType: href(file.mimeType) || 'application/pdf',
    size: Number(file.size) || 0,
  }, options);
  return {
    ...file,
    url: uploaded.url,
    storagePath: uploaded.storagePath,
    name: uploaded.name || file.name,
    mimeType: uploaded.mimeType || file.mimeType,
    size: uploaded.size || file.size || 0,
    uri: '',
    dataUrl: '',
  };
}

/** Laster opp én avtale-fil og returnerer varig nedlastings-URL. */
export async function uploadAgreementFile(companyId, picked, options = {}) {
  const name = text(picked?.name) || 'avtale.pdf';
  const mimeType = text(picked?.mimeType) || 'application/pdf';
  if (!text(companyId)) throw new Error('Mangler bedrift for fillagring.');
  if (!picked?.blob && !picked?.uri) throw new Error('Mangler filinnhold.');
  const { uploadFile } = await import('../utils/media.js');
  const path = agreementFilePath(companyId, name, options.salt);
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
