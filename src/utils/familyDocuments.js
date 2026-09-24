import {
  collection, doc, addDoc, updateDoc,
  onSnapshot, serverTimestamp, getDocs,
} from 'firebase/firestore';
import { db } from '../../firebase';

export const FOLDER_PRESETS = [
  { id: 'family', emoji: '❤️', color: '#3b82f6', label: 'Familie' },
  { id: 'private', emoji: '🔒', color: '#64748b', label: 'Privat' },
  { id: 'house', emoji: '🏠', color: '#eab308', label: 'Hjem' },
  { id: 'holdings', emoji: '🔑', color: '#0f766e', label: 'Eiendom & bil' },
  { id: 'boligmappa', emoji: '🗂️', color: '#0284c7', label: 'Boligen' },
  { id: 'school', emoji: '📚', color: '#22c55e', label: 'Skole' },
  { id: 'health', emoji: '🏥', color: '#ef4444', label: 'Helse' },
  { id: 'travel', emoji: '🌴', color: '#f97316', label: 'Reise' },
  { id: 'finance', emoji: '💰', color: '#8b5cf6', label: 'Økonomi' },
  { id: 'work', emoji: '💼', color: '#475569', label: 'Jobb' },
  { id: 'sport', emoji: '🏀', color: '#10b981', label: 'Sport' },
  { id: 'other', emoji: '📁', color: '#0ea5e9', label: 'Annet' },
];

export function foldersCol(familyId) {
  return collection(db, 'families', familyId, 'documentFolders');
}

export function folderDoc(familyId, folderId) {
  return doc(db, 'families', familyId, 'documentFolders', folderId);
}

export function filesCol(familyId, folderId) {
  return collection(db, 'families', familyId, 'documentFolders', folderId, 'files');
}

export function fileDoc(familyId, folderId, fileId) {
  return doc(db, 'families', familyId, 'documentFolders', folderId, 'files', fileId);
}

function tsMs(v) {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v?.seconds === 'number') return v.seconds * 1000;
  return 0;
}

function sortByUpdatedDesc(items) {
  return [...items].sort((a, b) => tsMs(b.updatedAt || b.createdAt) - tsMs(a.updatedAt || a.createdAt));
}

export function listenAccessibleFolders(familyId, uid, cb) {
  if (!familyId || !uid) return () => {};
  return onSnapshot(foldersCol(familyId), (snap) => {
    const folders = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((f) => {
        if (f.deleted) return false;
        // Familie-mapper er synlige for alle i familien (inkl. barn),
        // også når memberIds ikke er oppdatert etter nye medlemmer.
        if (isFamilyFolder(f)) return true;
        return Array.isArray(f.memberIds) && f.memberIds.includes(uid);
      });
    cb(sortByUpdatedDesc(folders));
  }, () => cb([]));
}

/** Engangslesing — brukes når hubben må åpne mappe før listener har landet. */
export async function fetchAccessibleFolders(familyId, uid) {
  if (!familyId || !uid) return [];
  const snap = await getDocs(foldersCol(familyId));
  const folders = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((f) => {
      if (f.deleted) return false;
      if (isFamilyFolder(f)) return true;
      return Array.isArray(f.memberIds) && f.memberIds.includes(uid);
    });
  return sortByUpdatedDesc(folders);
}

export function listenFolderFiles(familyId, folderId, cb) {
  if (!familyId || !folderId) return () => {};
  return onSnapshot(filesCol(familyId, folderId), (snap) => {
    const files = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((f) => !f.deleted);
    cb(sortByUpdatedDesc(files));
  }, () => cb([]));
}

export function listenFolder(familyId, folderId, cb) {
  if (!familyId || !folderId) return () => {};
  return onSnapshot(folderDoc(familyId, folderId), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, () => cb(null));
}

export async function countFolderFiles(familyId, folderId) {
  const snap = await getDocs(filesCol(familyId, folderId));
  return snap.docs.filter((d) => !d.data()?.deleted).length;
}

export async function createFolder({
  familyId, uid, name, creatorName, scope = 'personal', memberIds,
  presetId, color, emoji, parentFolderId = null, parentFolder = null,
}) {
  const ids = [...new Set((memberIds || [uid]).filter(Boolean))];
  const preset = FOLDER_PRESETS.find((p) => p.id === presetId) || FOLDER_PRESETS.find((p) => p.id === 'other');
  const inheritedScope = parentFolder?.scope || scope;
  const inheritedMembers = parentFolder?.memberIds?.length ? parentFolder.memberIds : ids;
  return addDoc(foldersCol(familyId), {
    name: String(name || '').trim() || 'Ny mappe',
    scope: inheritedScope === 'family' ? 'family' : (inheritedScope === 'child' ? 'child' : 'personal'),
    ownerUid: uid,
    createdBy: uid,
    createdByName: creatorName || '',
    memberIds: [...new Set(inheritedMembers.filter(Boolean))],
    visibility: parentFolder?.visibility
      || (inheritedScope === 'family' ? 'family' : (ids.length <= 1 ? 'private' : 'shared')),
    parentFolderId: parentFolderId || null,
    forChildId: parentFolder?.forChildId || null,
    forChildName: parentFolder?.forChildName || null,
    presetId: presetId || preset?.id || 'other',
    emoji: emoji || preset?.emoji || '📁',
    color: color || preset?.color || '#0ea5e9',
    deleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateFolder(familyId, folderId, patch) {
  await updateDoc(folderDoc(familyId, folderId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function setFolderMembers(familyId, folderId, memberIds, visibility) {
  const ids = [...new Set(memberIds.filter(Boolean))];
  await updateFolder(familyId, folderId, {
    memberIds: ids,
    visibility: ids.length <= 1 ? 'private' : (visibility || 'shared'),
  });
}

export async function deleteFolder(familyId, folderId) {
  await updateFolder(familyId, folderId, { deleted: true });
}

export async function addFolderFile(familyId, folderId, data) {
  const bilag = data.bilag && typeof data.bilag === 'object' ? data.bilag : null;
  const ref = await addDoc(filesCol(familyId, folderId), {
    name: data.name || 'Fil',
    mimeType: data.mimeType || 'application/octet-stream',
    size: data.size || 0,
    storagePath: data.storagePath || '',
    downloadUrl: data.downloadUrl || '',
    uploadedBy: data.uploadedBy || '',
    uploadedByName: data.uploadedByName || '',
    locked: !!data.locked,
    lockedBy: data.lockedBy || null,
    kind: data.kind || (bilag ? 'receipt' : 'file'),
    bilag: bilag || null,
    pageCount: data.pageCount || (bilag ? 1 : null),
    deleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await updateFolder(familyId, folderId, { updatedAt: serverTimestamp() });
  return ref;
}

export async function updateFolderFile(familyId, folderId, fileId, patch) {
  const next = { ...patch, updatedAt: serverTimestamp() };
  if (typeof next.name === 'string') {
    next.name = next.name.trim() || 'Fil';
  }
  await updateDoc(fileDoc(familyId, folderId, fileId), next);
  await updateFolder(familyId, folderId, { updatedAt: serverTimestamp() });
}

export async function deleteFolderFile(familyId, folderId, fileId) {
  await updateDoc(fileDoc(familyId, folderId, fileId), {
    deleted: true,
    updatedAt: serverTimestamp(),
  });
  await updateFolder(familyId, folderId, { updatedAt: serverTimestamp() });
}

export function canManageFolder(folder, uid, isAdmin) {
  if (!folder || !uid) return false;
  return folder.ownerUid === uid || folder.createdBy === uid || isAdmin;
}

export function canEditFile(file, folder, uid, isAdmin) {
  if (!file || !folder || !uid) return false;
  if (file.locked && file.lockedBy && file.lockedBy !== uid && !isAdmin) return false;
  return canManageFolder(folder, uid, isAdmin)
    || file.uploadedBy === uid
    || isFamilyFolder(folder);
}

export function isPrivateFolder(folder) {
  return !folder || folder.visibility === 'private' || (folder.memberIds || []).length <= 1;
}

export function isFamilyFolder(folder) {
  return folder?.scope === 'family' || folder?.visibility === 'family';
}

export function isChildFolder(folder) {
  return folder?.scope === 'child' || !!folder?.forChildId;
}

export function memberSummary(folder, members) {
  const ids = folder?.memberIds || [];
  if (isFamilyFolder(folder)) return 'Hele familien';
  if (isChildFolder(folder)) {
    const childName = folder.forChildName || members.find((m) => m.id === folder.forChildId || m.docId === folder.forChildId)?.name;
    return childName ? `Barn · ${String(childName).split(' ')[0]}` : 'Barn';
  }
  if (ids.length <= 1) return 'Kun deg';
  const names = ids
    .map((id) => members.find((m) => m.uid === id)?.name?.split(' ')[0])
    .filter(Boolean)
    .slice(0, 3);
  return names.length ? names.join(', ') : `${ids.length} medlemmer`;
}

export function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatFileType(mimeType = '', name = '') {
  const mime = String(mimeType || '').toLowerCase();
  const ext = String(name || '').split('.').pop()?.toLowerCase() || '';
  if (mime.includes('pdf') || ext === 'pdf') return 'PDF';
  if (mime.startsWith('image/')) return 'Bilde';
  if (mime.startsWith('video/') || ['mp4', 'm4v', 'mov', 'webm', 'avi', 'mkv', 'mpeg', 'mpg'].includes(ext)) {
    return 'Film';
  }
  if (mime.includes('word') || ext === 'doc' || ext === 'docx') return 'Word-dokument';
  if (mime.includes('sheet') || ext === 'xls' || ext === 'xlsx') return 'Regneark';
  if (mime.startsWith('text/') || ext === 'txt') return 'Tekstfil';
  if (mime.includes('zip') || ext === 'zip') return 'Zip-arkiv';
  return ext ? ext.toUpperCase() : 'Fil';
}

export function formatFileDate(ts) {
  const ms = tsMs(ts);
  if (!ms) return '—';
  return new Date(ms).toLocaleString('nb-NO', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function fileIcon(mimeType = '', name = '') {
  const mime = String(mimeType || '').toLowerCase();
  const ext = String(name || '').split('.').pop()?.toLowerCase() || '';
  if (mime.startsWith('image/')) return 'image-outline';
  if (mime.startsWith('video/') || ['mp4', 'm4v', 'mov', 'webm', 'avi', 'mkv', 'mpeg', 'mpg'].includes(ext)) {
    return 'videocam-outline';
  }
  if (mime.includes('pdf')) return 'document-text-outline';
  if (mime.includes('word') || mime.includes('document')) return 'document-outline';
  return 'attach-outline';
}

/** Ensure default personal folder exists for user. */
export async function ensureDefaultFolders(familyId, uid, creatorName, allMemberUids = []) {
  if (!familyId || !uid) return;
  const snap = await getDocs(foldersCol(familyId));
  const existing = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((f) => !f.deleted);

  const hasPersonal = existing.some((f) => f.scope === 'personal' && f.ownerUid === uid && f.isDefault);
  if (!hasPersonal) {
    await addDoc(foldersCol(familyId), {
      name: 'Mine dokumenter',
      scope: 'personal',
      ownerUid: uid,
      createdBy: uid,
      createdByName: creatorName || '',
      memberIds: [uid],
      visibility: 'private',
      presetId: 'private',
      emoji: '🔒',
      color: '#64748b',
      isDefault: true,
      parentFolderId: null,
      deleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  const hasFamily = existing.some((f) => f.scope === 'family' && f.isDefault);
  if (!hasFamily && allMemberUids.length) {
    await addDoc(foldersCol(familyId), {
      name: 'Familie',
      scope: 'family',
      ownerUid: uid,
      createdBy: uid,
      createdByName: creatorName || '',
      memberIds: [...new Set(allMemberUids.filter(Boolean))],
      visibility: 'family',
      presetId: 'family',
      emoji: '❤️',
      color: '#3b82f6',
      isDefault: true,
      parentFolderId: null,
      deleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

/**
 * Sikrer én standardmappe per barn (foreldre + barn har tilgang).
 * Speiler ønskeliste-mønsteret med forChildId.
 */
export async function ensureChildDocumentFolders({
  familyId,
  kids = [],
  createdByUid,
  creatorName = '',
  parentUids = [],
}) {
  if (!familyId || !createdByUid || !kids.length) return;
  const snap = await getDocs(foldersCol(familyId));
  const existing = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((f) => !f.deleted);
  const parents = [...new Set((parentUids || []).filter(Boolean))];

  await Promise.all(kids.map(async (kid) => {
    const childId = kid.id || kid.docId || kid.childId;
    if (!childId) return;
    const has = existing.some(
      (f) => f.isDefault && isChildFolder(f) && String(f.forChildId) === String(childId),
    );
    if (has) {
      // Hold memberIds oppdatert (nye foresatte / barn-uid)
      const folder = existing.find(
        (f) => f.isDefault && isChildFolder(f) && String(f.forChildId) === String(childId),
      );
      if (!folder) return;
      const nextIds = [...new Set([
        ...(folder.memberIds || []),
        ...parents,
        createdByUid,
        kid.uid,
      ].filter(Boolean))];
      const current = folder.memberIds || [];
      const same = nextIds.length === current.length && nextIds.every((id) => current.includes(id));
      if (!same || folder.forChildName !== (kid.name || folder.forChildName)) {
        await updateFolder(familyId, folder.id, {
          memberIds: nextIds,
          forChildName: kid.name || folder.forChildName || 'Barn',
          visibility: 'shared',
          scope: 'child',
        });
      }
      return;
    }
    const memberIds = [...new Set([...parents, createdByUid, kid.uid].filter(Boolean))];
    await addDoc(foldersCol(familyId), {
      name: kid.name ? `${String(kid.name).split(' ')[0]}` : 'Barn',
      scope: 'child',
      forChildId: childId,
      forChildName: kid.name || 'Barn',
      ownerUid: createdByUid,
      createdBy: createdByUid,
      createdByName: creatorName || '',
      memberIds,
      visibility: 'shared',
      presetId: 'school',
      emoji: '🧒',
      color: '#8b5cf6',
      isDefault: true,
      parentFolderId: null,
      deleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }));
}

export function groupFolders(folders, uid) {
  const family = folders.filter((f) => f.scope === 'family' || f.visibility === 'family');
  const child = folders.filter((f) => isChildFolder(f) && !family.includes(f));
  const personal = folders.filter(
    (f) => f.scope === 'personal' && (f.ownerUid === uid || f.visibility !== 'family') && !isChildFolder(f),
  );
  const shared = folders.filter(
    (f) => !family.includes(f) && !personal.includes(f) && !child.includes(f) && !isPrivateFolder(f),
  );
  return { family, personal, shared, child };
}

export function getDefaultFolder(folders, section, uid, childId = null) {
  if (section === 'family') {
    return folders.find((f) => f.isDefault && isFamilyFolder(f)) || null;
  }
  if (section === 'personal') {
    return folders.find((f) => f.isDefault && f.scope === 'personal' && f.ownerUid === uid) || null;
  }
  if (section === 'child' && childId) {
    return folders.find(
      (f) => f.isDefault && isChildFolder(f) && String(f.forChildId) === String(childId),
    ) || null;
  }
  return null;
}

export function getChildDocumentFolders(folders, childId) {
  if (!childId) return [];
  return folders.filter((f) => isChildFolder(f) && String(f.forChildId) === String(childId));
}

export function folderMatchesSection(folder, section, uid, childId = null) {
  if (!folder || folder.isDefault) return false;
  if (section === 'family') return isFamilyFolder(folder);
  if (section === 'personal') return folder.scope === 'personal' && folder.ownerUid === uid && !isChildFolder(folder);
  if (section === 'child') {
    return isChildFolder(folder) && (!childId || String(folder.forChildId) === String(childId));
  }
  if (section === 'shared') {
    const grouped = groupFolders([folder], uid);
    return grouped.shared.includes(folder);
  }
  return false;
}

/** Subfolders inside a container folder (supports legacy root folders). */
export function getChildFolders(folders, parentFolder, section, uid, childId = null) {
  if (!parentFolder) return [];
  const pid = parentFolder.id;
  return folders.filter((f) => {
    if (f.deleted || f.isDefault || f.id === pid) return false;
    if (f.parentFolderId === pid) return true;
    if (parentFolder.isDefault && !f.parentFolderId && folderMatchesSection(f, section, uid, childId)) {
      return true;
    }
    return false;
  });
}

export function getCustomFolders(folders, section, uid, childId = null) {
  if (section === 'child' && childId) {
    return getChildDocumentFolders(folders, childId).filter((f) => !f.isDefault);
  }
  const grouped = groupFolders(folders, uid);
  return (grouped[section] || []).filter((f) => !f.isDefault);
}

export function canUploadToFolder(folder, uid, isAdmin) {
  if (!folder || !uid) return false;
  if (canManageFolder(folder, uid, isAdmin)) return true;
  // Hele familiens mappe: alle familiemedlemmer (inkl. barn) kan laste opp
  if (isFamilyFolder(folder)) return true;
  if (isChildFolder(folder) && (folder.memberIds || []).includes(uid)) return true;
  if (folder.scope === 'personal' && folder.ownerUid === uid) return true;
  if ((folder.memberIds || []).includes(uid)) return true;
  return false;
}

/** Opprette undermappe — samme tilgang som opplasting (ikke bare eier). */
export function canCreateSubfolder(folder, uid, isAdmin) {
  return canUploadToFolder(folder, uid, isAdmin);
}

export {
  emptyBilag,
  formatBilagAmount,
  bilagSearchHaystack,
  filterDocumentFiles,
  sortFilesForDocumentList,
  isReceiptFile,
} from './documentBilag.js';

/**
 * Hold Familie-mappens memberIds synkronisert med alle aktive familiemedlemmer.
 * Sikrer at barn (og nye foresatte) får tilgang uten manuell deling.
 */
export async function syncFamilyFolderMembers(familyId, allMemberUids = []) {
  if (!familyId || !allMemberUids.length) return;
  const ids = [...new Set(allMemberUids.filter(Boolean))];
  const snap = await getDocs(foldersCol(familyId));
  const familyFolders = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((f) => !f.deleted && isFamilyFolder(f));

  await Promise.all(familyFolders.map(async (folder) => {
    const current = Array.isArray(folder.memberIds) ? folder.memberIds : [];
    const missing = ids.filter((id) => !current.includes(id));
    if (!missing.length && current.length === ids.length) return;
    const next = [...new Set([...current, ...ids])];
    await updateFolder(familyId, folder.id, {
      memberIds: next,
      visibility: 'family',
      scope: 'family',
    });
  }));
}

export function isImageFile(file) {
  const mime = String(file?.mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const ext = String(file?.name || '').split('.').pop()?.toLowerCase() || '';
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp'].includes(ext);
}

export function isVideoFile(file) {
  const mime = String(file?.mimeType || '').toLowerCase();
  if (mime.startsWith('video/')) return true;
  const ext = String(file?.name || '').split('.').pop()?.toLowerCase() || '';
  return ['mp4', 'm4v', 'mov', 'webm', 'avi', 'mkv', 'mpeg', 'mpg'].includes(ext);
}

export function filesFromNativeFile(file) {
  if (!file) return null;
  return {
    uri: typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(file) : '',
    blob: file,
    name: file.name,
    mimeType: file.type,
    size: file.size,
  };
}
