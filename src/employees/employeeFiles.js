/**
 * Lagring for filer per ansatt: families/{id}/employeeFiles.
 * Filinnholdet ligger i Storage under families/{id}/employeeFiles/{ansatt}/.
 * Sletting er myk (deleted: true), så en feil kan rettes av admin.
 */
import {
  addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { uploadFile } from '../utils/media';
import { cleanEntryName, descendantIds, storageSafeName } from './employeeFilesModel';

function filesCol(companyId) {
  return collection(db, 'families', companyId, 'employeeFiles');
}

export function listenEmployeeFiles(companyId, employeeId, cb, onError) {
  if (!companyId || !employeeId) {
    cb([]);
    return () => {};
  }
  const qy = query(filesCol(companyId), where('employeeId', '==', employeeId));
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((row) => ({ id: row.id, ...row.data() })));
  }, (err) => {
    cb([]);
    onError?.(err);
  });
}

export async function createEmployeeFolder(companyId, employeeId, { name, parentId = '', uid = '' }) {
  const clean = cleanEntryName(name);
  if (!clean) throw new Error('Skriv et navn på mappen.');
  const ref = await addDoc(filesCol(companyId), {
    employeeId,
    kind: 'folder',
    name: clean,
    parentId: parentId || '',
    createdBy: uid || null,
    deleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function uploadEmployeeFile(companyId, employeeId, picked, { parentId = '', uid = '' } = {}) {
  if (!picked) return '';
  const name = cleanEntryName(picked.name) || 'fil';
  const path = `families/${companyId}/employeeFiles/${employeeId}/${Date.now()}-${storageSafeName(name)}`;
  const url = await uploadFile(path, picked, picked.mimeType);
  const ref = await addDoc(filesCol(companyId), {
    employeeId,
    kind: 'file',
    name,
    parentId: parentId || '',
    url,
    storagePath: path,
    size: Number(picked.size) || 0,
    contentType: picked.mimeType || '',
    createdBy: uid || null,
    deleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function renameEmployeeFileEntry(companyId, entryId, name) {
  const clean = cleanEntryName(name);
  if (!clean) throw new Error('Navnet kan ikke være tomt.');
  await updateDoc(doc(db, 'families', companyId, 'employeeFiles', entryId), {
    name: clean,
    updatedAt: serverTimestamp(),
  });
}

/** Admin: sletter filen, eller mappen med alt innhold. */
export async function deleteEmployeeFileEntry(companyId, entries, entry, { uid = '' } = {}) {
  if (!entry?.id) return;
  const ids = [entry.id, ...(entry.kind === 'folder' ? descendantIds(entries, entry.id) : [])];
  const batch = writeBatch(db);
  for (const id of ids) {
    batch.update(doc(db, 'families', companyId, 'employeeFiles', id), {
      deleted: true,
      deletedBy: uid || null,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}
