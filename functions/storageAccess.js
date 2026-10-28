/**
 * Hvem som kan lese og skrive filer i Storage via uploadStorageFile / downloadStorageFile
 * (SEC-15, L-18). Samme vurdering som storage.rules (klienter som laster opp direkte).
 *
 * Mapper med personopplysninger i en bedrift:
 * - hr/{ansatt}/… (arbeidsavtaler, HR-vedlegg): HR (Lese for å lese, Begrenset redigering for
 *   å skrive), eier og administratorer. Den ansatte leser filene i sin egen mappe.
 * - hr/applications/… (CV-er fra søkere): bare HR, eier og administratorer.
 * - employeeFiles/{ansatt}/…: den ansatte selv, HR, Begrenset redigering på Ansatte, eier og administratorer.
 * - invoices/{faktura}/… (arkiv-PDF, EHF, vedlegg): lese med økonomi-tilgang, skrive med
 *   Begrenset redigering på Faktura. En fil som finnes, overskrives ikke (bokføringsloven § 13).
 * - mileage/… (kvitteringer i kjøreboken): den som lastet opp, økonomi, eier og administratorer.
 * Resten av gruppens mapper: medlemmer som før.
 *
 * families/personal/… og groups/… (uten bedrift): en fil kan bare overskrives eller leses av den
 * som lastet den opp (metadata uploadedBy). Eldre filer uten eier står som før.
 *
 * Ren modul – brukes av uploadStorage.js og tester.
 */
import { allows, allowsEconomy, HR_PAGE_RESOURCES } from '../src/access/companyAccess.js';

function text(value) {
  return String(value ?? '').trim();
}

/** Område og ansatt for en sti under families/{id}/. */
export function storageArea(objectPath) {
  const parts = text(objectPath).split('/');
  if (parts[0] !== 'families' || !parts[1]) return { companyId: '', area: 'other', employeeId: '' };
  const companyId = parts[1];
  const folder = parts[2] || '';
  if (folder === 'hr') {
    if (parts[3] === 'applications') return { companyId, area: 'hrApplications', employeeId: '' };
    return { companyId, area: 'hr', employeeId: text(parts[3]) };
  }
  if (folder === 'employeeFiles') return { companyId, area: 'employeeFiles', employeeId: text(parts[3]) };
  if (folder === 'invoices') return { companyId, area: 'invoices', employeeId: '' };
  if (folder === 'mileage') return { companyId, area: 'receipts', employeeId: '' };
  return { companyId, area: 'member', employeeId: '' };
}

function hrAtLeast(grants, action) {
  return HR_PAGE_RESOURCES.some((resource) => allows(grants, resource, action));
}

/**
 * Kan aktøren lese (op 'read') eller skrive (op 'write') i området?
 * actor: { uid, admin, organization, grants, employeeIds } – grants fra tilgangsmatrisen
 * (resolveActorAccess), employeeIds = egne ansattposter.
 * existing: metadata på filen som finnes (null når den ikke finnes).
 */
export function storageAllowed({ area, employeeId = '', op = 'read', actor = {}, existing = null } = {}) {
  const uid = text(actor.uid);
  if (!uid) return false;
  // Arkivet i en faktura endres ikke, heller ikke av eier.
  if (area === 'invoices' && op === 'write' && existing) return false;
  if (!actor.organization || actor.admin) return true;
  const grants = actor.grants || {};
  const own = !!employeeId && (actor.employeeIds || []).includes(employeeId);
  const uploader = text(existing?.uploadedBy);
  switch (area) {
    case 'hr':
      return op === 'read' ? (hrAtLeast(grants, 'see') || own) : hrAtLeast(grants, 'read');
    case 'hrApplications':
      return hrAtLeast(grants, op === 'read' ? 'see' : 'read');
    case 'employeeFiles':
      return own || hrAtLeast(grants, op === 'read' ? 'see' : 'read') || allows(grants, 'employees', 'read');
    case 'invoices':
      return op === 'read' ? allowsEconomy(grants, 'see') : allows(grants, 'economyInvoices', 'read');
    case 'receipts':
      if (op === 'write') return !uploader || uploader === uid;
      return (!!uploader && uploader === uid) || allowsEconomy(grants, 'see') || allows(grants, 'mileage', 'see');
    default:
      return true;
  }
}

/** Filer uten bedrift (families/personal/, groups/): bare den som lastet opp. Eldre uten eier som før. */
export function ownerOnlyAllowed({ uid, existing = null } = {}) {
  if (!text(uid)) return false;
  const uploader = text(existing?.uploadedBy);
  return !uploader || uploader === text(uid);
}

/** groups/{uid}-… eller groups/{gruppe-id}-…: navnet må starte med egen uid eller en gruppe. */
export function groupImageOwner(objectPath) {
  const match = text(objectPath).match(/^groups\/([A-Za-z0-9_-]+?)-\d+\.[A-Za-z0-9]+$/);
  return match ? match[1] : '';
}
