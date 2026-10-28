/**
 * Avslutning av en bedrift og sletting av dataene (GRUNN-03). Ren logikk uten Firebase,
 * brukt av appen (Selskapsinnstillinger → Personvern) og av functions/companyClosure.js.
 *
 * Databehandleravtalen lover at bedriftens data slettes innen 90 dager etter at avtalen
 * opphører, og at bedriften kan hente ut dataene først. Slik gjøres det:
 *   1. Eier eller administrator laster ned eksporten (exportCompanyData) og ber om avslutning
 *      (closeCompany) med bedriftens navn som bekreftelse. Har bedriften utstedte fakturaer,
 *      må de også bekrefte at regnskapsmaterialet er tatt vare på (bokføringsloven § 13).
 *   2. Serveren skriver companyClosures/{id} (bare serveren leser og skriver) og merker
 *      bedriften med closure, closedAt og deleteAfter (90 dager). Bedriften virker som før til
 *      fristen, så eksport og angring (reopenCompany) er mulig.
 *   3. Når fristen er ute, sletter driften bedriften (purgeClosedCompanies eller
 *      scripts/purge-closed-companies.mjs): dokumentet med alle underkolleksjoner, filene under
 *      families/{id}/ i Storage og koblinger på toppnivå. Bare når companyClosures og
 *      selskapsdokumentet har samme frist.
 */
import { companyDisplayName } from '../utils/companyName.js';
import { isOrganizationType } from '../utils/groupTypes.js';

export const CLOSURE_COLLECTION = 'companyClosures';
/** Dager fra avslutning til sletting (databehandleravtalen punkt 12). */
export const CLOSURE_GRACE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

function text(value) {
  return String(value ?? '').trim();
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function norm(value) {
  return text(value).toLocaleLowerCase('nb-NO').replace(/\s+/g, ' ');
}

/** Bedrift (ikke familie eller lag): samme vurdering som ved sletting av konto. */
export function isClosableCompany(family) {
  return isOrganizationType(family?.type) || !!text(family?.company?.navn);
}

/** Eier eller administrator. Bare feltene reglene beskytter (ownerUid, ownerId, adminUids). */
export function canCloseCompany(family, uid) {
  if (!uid || !family) return false;
  return family.ownerUid === uid
    || family.ownerId === uid
    || (Array.isArray(family.adminUids) && family.adminUids.includes(uid));
}

/** Navnet som må skrives for å bekrefte. */
export function closureConfirmName(family) {
  return companyDisplayName(family, 'bedriften').replace(/\s+/g, ' ');
}

export function closureConfirmMatches(input, family) {
  const want = norm(closureConfirmName(family));
  return !!want && norm(input) === want;
}

/** Fristen for sletting: closedAt + 90 dager (ISO). */
export function deleteAfterIso(closedAt, days = CLOSURE_GRACE_DAYS) {
  const at = iso(closedAt);
  return at ? new Date(new Date(at).getTime() + days * DAY_MS).toISOString() : '';
}

/** Avslutningen slik den står på selskapsdokumentet, eller null. */
export function companyClosure(family) {
  const row = family?.closure;
  if (!row || typeof row !== 'object' || row.status !== 'closed') return null;
  const deleteAfter = text(row.deleteAfter);
  if (!deleteAfter) return null;
  return {
    status: 'closed',
    closedAt: text(row.closedAt),
    deleteAfter,
    closedByUid: text(row.closedByUid),
    closedByName: text(row.closedByName),
  };
}

export function isCompanyClosed(family) {
  return !!companyClosure(family);
}

/**
 * Feilmelding når avslutningen ikke kan gjøres, ellers ''.
 * hasAccounting: bedriften har utstedte fakturaer (regnskapsmateriale).
 */
export function closureRequestError({
  family, uid, confirm = '', accountingConfirmed = false, hasAccounting = false,
} = {}) {
  if (!family) return 'Fant ikke bedriften.';
  if (!isClosableCompany(family)) return 'Bare bedrifter kan avsluttes her.';
  if (!canCloseCompany(family, uid)) return 'Bare eier eller administrator kan avslutte bedriften.';
  if (companyClosure(family)) return 'Bedriften er allerede avsluttet.';
  if (!closureConfirmMatches(confirm, family)) return `Skriv bedriftens navn («${closureConfirmName(family)}») for å bekrefte.`;
  if (hasAccounting && accountingConfirmed !== true) {
    return 'Bekreft at regnskapsmaterialet (fakturaer og bilag) er lastet ned eller tatt vare på i regnskapssystemet. Det skal oppbevares i fem år (bokføringsloven § 13).';
  }
  return '';
}

/** Det som lagres på selskapsdokumentet (closure) og i companyClosures. */
export function closureRecord({
  uid, name = '', now = new Date(), reason = '', exportedBeforeClose = false,
} = {}) {
  const closedAt = iso(now);
  return {
    status: 'closed',
    closedAt,
    deleteAfter: deleteAfterIso(closedAt),
    closedByUid: text(uid),
    closedByName: text(name).slice(0, 120),
    reason: text(reason).slice(0, 500),
    exportedBeforeClose: exportedBeforeClose === true,
  };
}

/** Angre er mulig til fristen er ute (og dataene ennå ikke er slettet). */
export function reopenError({ family, uid, now = new Date() } = {}) {
  if (!family) return 'Fant ikke bedriften.';
  if (!canCloseCompany(family, uid)) return 'Bare eier eller administrator kan angre avslutningen.';
  const closure = companyClosure(family);
  if (!closure) return 'Bedriften er ikke avsluttet.';
  if (closure.deleteAfter <= iso(now)) return 'Fristen er ute. Dataene slettes nå.';
  return '';
}

/**
 * Skal bedriften slettes nå? record = companyClosures/{id}, family = selskapsdokumentet
 * (null når det er borte). Begge må ha samme frist, så et dokument som er endret av en klient
 * eller en angret avslutning aldri slettes.
 */
export function purgeDecision({ record, family, now = new Date() } = {}) {
  if (!record || record.status !== 'closed') return { purge: false, reason: 'not-closed' };
  const deleteAfter = text(record.deleteAfter);
  if (!deleteAfter) return { purge: false, reason: 'no-deadline' };
  if (deleteAfter > iso(now)) return { purge: false, reason: 'not-due' };
  if (family) {
    const closure = companyClosure(family);
    if (!closure || closure.deleteAfter !== deleteAfter) return { purge: false, reason: 'mismatch' };
  }
  return { purge: true, reason: 'due' };
}

function dayLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Oslo' });
}

export function daysLeft(family, now = new Date()) {
  const closure = companyClosure(family);
  if (!closure) return null;
  return Math.max(0, Math.ceil((new Date(closure.deleteAfter).getTime() - new Date(now).getTime()) / DAY_MS));
}

/** Teksten medlemmene ser når bedriften er avsluttet. */
export function closureNotice(family, now = new Date()) {
  const closure = companyClosure(family);
  if (!closure) return '';
  const who = closure.closedByName ? ` av ${closure.closedByName}` : '';
  return `Bedriften ble avsluttet ${dayLabel(closure.closedAt)}${who}. Alle bedriftens data og filer slettes etter `
    + `${dayLabel(closure.deleteAfter)} (om ${daysLeft(family, now)} dager). Last ned eksporten før det. `
    + 'Eier eller administrator kan angre til da.';
}

/** Filnavn for eksporten: «protop-bedrift-bygg-as-2026-10-28». */
export function companyExportName(family, now = new Date()) {
  const slug = norm(closureConfirmName(family))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'bedrift';
  return `protop-bedrift-${slug}-${iso(now).slice(0, 10)}`;
}
