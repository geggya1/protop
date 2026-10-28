/**
 * «Last ned bedriftens data» og avslutning av bedriften (GRUNN-03), mot callables i
 * functions/companyClosure.js. Eksporten er en ZIP-fil med alle dokumentene (fra serveren,
 * så også det klienten ikke kan lese selv) og filene i Storage. Bare på web.
 */
import { Platform } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { gunzipSync, strFromU8 } from 'fflate';
import { functions } from '../../firebase';
import { archiveFilePlan, base64ToBytes, buildCompanyArchive } from './companyArchive';

export const COMPANY_EXPORT_WEB_ONLY = 'Eksporten lastes ned på protop.no fra en datamaskin.';

function callError(error, fallback) {
  const message = String(error?.message || '').trim();
  return new Error(message && !/^internal$/i.test(message) ? message : fallback);
}

function saveBlob(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Henter alt og lagrer ZIP-filen. onProgress({ step, done, total }) for fremdrift.
 * Svar: { filename, documents, files, missing }
 */
export async function downloadCompanyExport({ familyId, companyName = '', onProgress } = {}) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') throw new Error(COMPANY_EXPORT_WEB_ONLY);
  onProgress?.({ step: 'data', done: 0, total: 0 });
  let res;
  try {
    res = (await httpsCallable(functions, 'exportCompanyData', { timeout: 540000 })({ familyId })).data || {};
  } catch (error) {
    throw callError(error, 'Kunne ikke hente bedriftens data. Prøv igjen.');
  }
  const json = strFromU8(gunzipSync(base64ToBytes(res.gzipBase64)));
  const { fetch: wanted, skipped } = archiveFilePlan(res.files);
  const files = [];
  const missing = [...skipped];
  const download = httpsCallable(functions, 'downloadStorageFile', { timeout: 120000 });
  for (let i = 0; i < wanted.length; i += 1) {
    onProgress?.({ step: 'files', done: i, total: wanted.length });
    try {
      const file = (await download({ objectPath: wanted[i].path })).data || {};
      files.push({ path: wanted[i].path, bytes: base64ToBytes(file.fileBase64) });
    } catch (error) {
      missing.push({ path: wanted[i].path, reason: String(error?.message || 'kunne ikke hentes').slice(0, 120) });
    }
  }
  onProgress?.({ step: 'zip', done: wanted.length, total: wanted.length });
  const zip = buildCompanyArchive({
    familyId, json, files, missing, companyName, exportedAt: new Date().toISOString(), documents: Number(res.documents || 0),
  });
  const filename = `${res.fileName || 'protop-bedrift'}.zip`;
  saveBlob(zip, filename);
  return {
    filename, documents: Number(res.documents || 0), files: files.length, missing,
  };
}

export async function closeCompanyAccount({
  familyId, confirm, accountingConfirmed = false, reason = '',
} = {}) {
  try {
    const res = await httpsCallable(functions, 'closeCompany', { timeout: 60000 })({
      familyId, confirm, accountingConfirmed, reason,
    });
    return res.data || {};
  } catch (error) {
    throw callError(error, 'Kunne ikke avslutte bedriften. Prøv igjen.');
  }
}

export async function reopenCompanyAccount({ familyId } = {}) {
  try {
    const res = await httpsCallable(functions, 'reopenCompany', { timeout: 60000 })({ familyId });
    return res.data || {};
  } catch (error) {
    throw callError(error, 'Kunne ikke angre avslutningen. Prøv igjen.');
  }
}
