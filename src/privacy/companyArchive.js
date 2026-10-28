/**
 * ZIP-filen fra «Last ned bedriftens data» (GRUNN-03). Ren logikk uten Firebase:
 *   LESMEG.txt          hva filen inneholder, og hva som mangler
 *   data/bedrift.json   alle dokumentene fra serveren (exportCompanyData)
 *   filer/…             filene fra Storage, med samme mapper som i ProTop (faktura, HR, kvitteringer)
 */
import { strToU8, zipSync } from 'fflate';

/** Filer som er større enn dette, kan ikke hentes gjennom downloadStorageFile. */
export const MAX_ARCHIVE_FILE_BYTES = 15 * 1024 * 1024;

/** base64 (fra en callable) til bytes, uten Buffer, så det virker i nettleseren. */
export function base64ToBytes(value) {
  const raw = String(value || '');
  if (typeof atob === 'function') {
    const bin = atob(raw);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }
  return Uint8Array.from(Buffer.from(raw, 'base64'));
}

/** families/{id}/invoices/x.pdf → filer/invoices/x.pdf */
export function archiveFilePath(path, familyId) {
  const prefix = `families/${familyId}/`;
  const rel = String(path || '').startsWith(prefix) ? String(path).slice(prefix.length) : String(path || '');
  return `filer/${rel.replace(/\.\.+/g, '.').replace(/^\/+/, '')}`;
}

/** Filene som hentes enkeltvis. De for store står i LESMEG.txt. */
export function archiveFilePlan(files = []) {
  const wanted = [];
  const skipped = [];
  for (const row of Array.isArray(files) ? files : []) {
    if (!row?.path) continue;
    if (Number(row.size || 0) > MAX_ARCHIVE_FILE_BYTES) skipped.push({ path: row.path, reason: 'for stor (over 15 MB)' });
    else wanted.push(row);
  }
  return { fetch: wanted, skipped };
}

export function archiveReadme({
  companyName = '', exportedAt = '', documents = 0, files = 0, missing = [],
} = {}) {
  const lines = [
    `Eksport fra ProTop: ${companyName || 'bedriften'}`,
    `Laget: ${exportedAt}`,
    '',
    `data/bedrift.json: ${documents} dokumenter (alle moduler: ansatte, HR, timer, fravær, prosjekter, kunder, fakturaer, ISO, chat og mer).`,
    `filer/: ${files} filer fra ProTop (fakturaarkiv, kvitteringer, HR-dokumenter, bilder og vedlegg).`,
    '',
    'Regnskapsmateriale (fakturaer og bilag) skal oppbevares i fem år etter regnskapsårets slutt (bokføringsloven § 13).',
    'Fakturaene ligger som PDF under filer/invoices/ og som data under «invoices/» i bedrift.json.',
    'Tilgangsnøkler og passord er fjernet fra filen. Filen inneholder personopplysninger: oppbevar den trygt.',
  ];
  if (missing.length) {
    lines.push('', 'Ikke med (last ned enkeltvis i ProTop før bedriften slettes):');
    for (const row of missing) lines.push(`- ${row.path}: ${row.reason}`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Bygger ZIP-filen. json = tekst, files = [{ path, bytes }], missing = [{ path, reason }].
 * Filene pakkes ikke (PDF og bilder er allerede pakket), JSON pakkes.
 */
export function buildCompanyArchive({
  familyId, json, files = [], missing = [], companyName = '', exportedAt = '', documents = 0,
} = {}) {
  const entries = {
    'LESMEG.txt': strToU8(archiveReadme({
      companyName, exportedAt, documents, files: files.length, missing,
    })),
    'data/bedrift.json': [strToU8(json), { level: 6 }],
  };
  for (const row of files) entries[archiveFilePath(row.path, familyId)] = [row.bytes, { level: 0 }];
  return zipSync(entries, { level: 0 });
}
