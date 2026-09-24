/**
 * Client helpers for klasseliste-import (bilde/fil → AI → kontakter).
 */
import { pickPlanImage, pickPlanFile, uploadTempPlanImage } from './aiImport';
import { guardedCallable } from './guardedCallable';
import { addKlassenContact } from './klassen';
import { CONTACT_KINDS } from './klassenLogic';

export async function pickClassListImage({ camera = false } = {}) {
  return pickPlanImage({ camera });
}

export async function pickClassListFile() {
  return pickPlanFile({ camera: false });
}

export async function prepareClassListUpload(familyId, uid, blob, opts = {}) {
  return uploadTempPlanImage(familyId, uid, blob, opts);
}

/**
 * @param {{ familyId: string, storagePath?: string|null, imageBase64?: string|null, hint?: string }} params
 */
export async function askClassListOcr(params) {
  return guardedCallable('aiClassListOcr', {
    familyId: params.familyId,
    storagePath: params.storagePath || null,
    imageBase64: params.imageBase64 || null,
    hint: params.hint || null,
  }, { timeout: 90000 });
}

/**
 * @param {string} familyId
 * @param {string} classId
 * @param {Array<object>} contacts
 * @param {string|null} createdBy
 */
export async function importKlassenContacts(familyId, classId, contacts, createdBy = null) {
  const rows = Array.isArray(contacts) ? contacts : [];
  let imported = 0;
  for (const row of rows) {
    const name = String(row?.name || '').trim();
    if (!name) continue;
    const kind = CONTACT_KINDS[row.kind] || CONTACT_KINDS.student;
    await addKlassenContact(familyId, classId, {
      kind,
      name,
      phone: row.phone || '',
      email: row.email || '',
      roleTitle: row.roleTitle || '',
      linkedStudentName: row.linkedStudentName || '',
      notes: row.notes || '',
      createdBy,
    });
    imported += 1;
  }
  return imported;
}
