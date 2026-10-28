/**
 * Generell Storage-opplasting via Admin SDK — omgår Firebase Storage CORS i nettleseren.
 * Bucket-CORS settes ikke her: Admin SDK trenger det ikke, og setCorsConfiguration
 * på opplastingsstien kan henge / feile og blokkere CV-bilder.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID, timingSafeEqual } from 'crypto';
import { resolveActorAccess } from '../src/access/companyAccess.js';
import { isOrganizationType } from '../src/utils/groupTypes.js';
import { assertFamilyMember, isFamilyOwnerOrAdmin } from './security.js';
import {
  groupImageOwner, ownerOnlyAllowed, storageAllowed, storageArea,
} from './storageAccess.js';
import { ensureStorageCors } from './storageCors.js';
import { mediaBucket } from './storageBucket.js';

const MAX_BASE64_BYTES = 15 * 1024 * 1024;

function cleanObjectPath(objectPath) {
  const path = String(objectPath || '').trim();
  if (!path || path.includes('..') || path.length > 500 || path.startsWith('/')) {
    throw new Error('Ugyldig lagringssti');
  }
  return path;
}

/** Aktøren i gruppen: eier/administrator, og rettighetene fra tilgangsmatrisen i bedrifter. */
async function storageActor(db, companyId, uid) {
  const fam = await assertFamilyMember(db, companyId, uid);
  const family = fam.data() || {};
  const admin = isFamilyOwnerOrAdmin(family, uid);
  const organization = isOrganizationType(family.type);
  if (!organization || admin) return { uid, admin, organization, grants: {}, employeeIds: [] };
  const own = await db.collection(`families/${companyId}/employees`).where('personUid', '==', uid).limit(5).get();
  const employees = own.docs.map((row) => ({ id: row.id, ...row.data() }));
  const actor = resolveActorAccess({ policy: family.company?.accessPolicy, employees, uid });
  return {
    uid, admin, organization, grants: actor?.grants || {}, employeeIds: employees.map((row) => row.id),
  };
}

/**
 * Tilgang til en sti. op: 'read' eller 'write'. existing: metadata på filen som ligger der
 * (null når den ikke finnes). Se storageAccess.js for hvem som får hva.
 */
async function assertObjectAccess(db, uid, objectPath, op, existing = null) {
  const path = cleanObjectPath(objectPath);
  if (!uid) throw new Error('Ikke innlogget');
  if (path.startsWith(`users/${uid}/`)) return path;
  if (path.startsWith('families/personal/')) {
    if (ownerOnlyAllowed({ uid, existing })) return path;
    throw new Error('Ingen tilgang til filen.');
  }
  if (path.startsWith('groups/')) {
    // Gruppebilder vises for alle innloggede. Nye bilder har egen uid eller en gruppe en er med i.
    if (op === 'read') return path;
    const owner = groupImageOwner(path);
    if (!owner) throw new Error('Ugyldig lagringssti');
    if (owner !== uid) await assertFamilyMember(db, owner, uid);
    if (ownerOnlyAllowed({ uid, existing })) return path;
    throw new Error('Ingen tilgang til filen.');
  }
  const { companyId, area, employeeId } = storageArea(path);
  if (companyId && companyId !== 'personal') {
    const actor = await storageActor(db, companyId, uid);
    if (storageAllowed({ area, employeeId, op, actor, existing })) return path;
    throw new Error(area === 'invoices' && existing
      ? 'Arkivet for fakturaen kan ikke overskrives.'
      : 'Ingen tilgang til filen.');
  }
  throw new Error('Ugyldig lagringssti');
}

export async function assertCanWriteObjectPath(db, uid, objectPath, existing = null) {
  return assertObjectAccess(db, uid, objectPath, 'write', existing);
}

/** Lesing: egen mappe, gruppens filer etter mappe (HR, ansattfiler, faktura, kvitteringer). */
export async function assertCanReadObjectPath(db, uid, objectPath, existing = null) {
  return assertObjectAccess(db, uid, objectPath, 'read', existing);
}

async function fileOwner(file) {
  const [exists] = await file.exists();
  if (!exists) return null;
  const [metadata] = await file.getMetadata();
  return { ...(metadata?.metadata || {}), size: metadata?.size, contentType: metadata?.contentType };
}

function objectPathFromUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^gs:\/\//i.test(value)) return value.replace(/^gs:\/\/[^/]+\//i, '');
  if (/firebasestorage\.googleapis\.com\/v0\/b\//i.test(value)) {
    try {
      const after = value.split('/o/')[1] || '';
      return decodeURIComponent((after.split('?')[0] || ''));
    } catch {
      return '';
    }
  }
  if (!/^https?:\/\//i.test(value)) return value.replace(/^\//, '');
  return '';
}

/**
 * Last ned bilde via Admin SDK — omgår Firebase Storage CORS i nettleseren
 * (samme årsak som uploadStorageFile finnes).
 */
export async function handleDownloadStorageFile(data, auth) {
  const db = getFirestore();
  const uid = auth?.uid;
  if (!uid) throw new Error('Ikke innlogget');

  const fromUrl = objectPathFromUrl(data?.url);
  const requested = cleanObjectPath(data?.objectPath || fromUrl);
  const bucket = await mediaBucket();
  const file = bucket.file(requested);
  const existing = await fileOwner(file);
  // Tilgangen sjekkes før svaret sier om filen finnes.
  const objectPath = await assertCanReadObjectPath(db, uid, requested, existing);
  if (!existing) throw new Error('Filen finnes ikke.');

  const metadata = existing;
  const size = Number(metadata?.size || 0);
  if (size > MAX_BASE64_BYTES) {
    throw new Error('Filen er for stor til PDF-eksport (maks 15 MB).');
  }

  const [buffer] = await file.download();
  if (!buffer?.length) throw new Error('Tom fil.');
  if (buffer.length > MAX_BASE64_BYTES) {
    throw new Error('Filen er for stor til PDF-eksport (maks 15 MB).');
  }

  return {
    storagePath: objectPath,
    contentType: String(metadata?.contentType || 'application/octet-stream').slice(0, 120),
    fileBase64: buffer.toString('base64'),
    size: buffer.length,
    bucket: bucket.name,
  };
}

export async function handleUploadStorageFile(data, auth) {
  const db = getFirestore();
  const uid = auth?.uid;
  if (!uid) throw new Error('Ikke innlogget');

  const requested = cleanObjectPath(data?.objectPath);
  const target = (await mediaBucket()).file(requested);
  const objectPath = await assertCanWriteObjectPath(db, uid, requested, await fileOwner(target));
  const contentType = String(data?.contentType || 'application/octet-stream').slice(0, 120);
  // Klienten kan sende data-URL eller ren base64.
  const fileBase64 = String(data?.fileBase64 || '').replace(/^data:[^;]+;base64,/i, '');
  if (!fileBase64) throw new Error('Mangler fil.');

  let buffer;
  try {
    buffer = Buffer.from(fileBase64, 'base64');
  } catch {
    throw new Error('Kunne ikke lese filen.');
  }
  if (!buffer.length) throw new Error('Tom fil.');
  if (buffer.length > MAX_BASE64_BYTES) {
    throw new Error('Filen er for stor for reservedelopplasting (maks 15 MB).');
  }

  const token = randomUUID();
  const bucket = await mediaBucket();
  const file = bucket.file(objectPath);
  try {
    // uploadedBy: hvem som eier filen (kvitteringer, personlige filer og gruppebilder).
    await file.save(buffer, {
      metadata: {
        contentType,
        metadata: { firebaseStorageDownloadTokens: token, uploadedBy: uid },
      },
    });
  } catch (err) {
    const msg = String(err?.message || err || '');
    if (/bucket does not exist|No such object|Not Found/i.test(msg)) {
      throw new Error(`Lagringsbucket mangler (${bucket.name}).`);
    }
    throw err;
  }

  const encoded = encodeURIComponent(objectPath);
  const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encoded}?alt=media&token=${token}`;
  return { downloadUrl, storagePath: objectPath, size: buffer.length, bucket: bucket.name };
}

/**
 * Bucket-CORS gjelder hele appen, så bare driften kan sette den (SEC-22): en konto med
 * custom claim `admin` (settes bare med Admin SDK) eller kallet med servernøkkelen
 * STORAGE_CORS_KEY. Appen kaller aldri denne.
 */
export function storageCorsAllowed(auth, data, env = process.env) {
  if (!auth?.uid) return false;
  if (auth.token?.admin === true) return true;
  const expected = String(env?.STORAGE_CORS_KEY || '');
  const given = String(data?.key || '');
  if (!expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/** Engangs/periodisk: sett bucket-CORS fra Admin SDK. */
export async function handleApplyStorageCors(data, auth) {
  if (!auth?.uid) throw new Error('Ikke innlogget');
  if (!storageCorsAllowed(auth, data)) throw new Error('Bare driften kan endre Storage CORS.');
  const result = await ensureStorageCors({ force: true });
  if (!result?.ok) throw new Error(result?.error || 'Klarte ikke sette Storage CORS.');
  return { ok: true, origins: result.origins || 0 };
}
