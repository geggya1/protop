/** Kontroll av innleste avtale-felt. Interna KI-funn vises ikke for kunden. */

import { seriesById } from '../indeksregulering/catalog.js';
import { kindLabel } from './agreementTemplate.js';
import { formatOrgnr, namesLikelyMatch } from './customers.js';

const LABEL_LEAK = /om oppdragsgiver|oppdragsgiver|oppdragstaker|organisasjo|kontakt person|generelle bestemmelser|eksternt po/i;

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function money(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n === 0) return '';
  return `${new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(n)} kr`;
}

function domainOf(email) {
  const at = text(email).toLowerCase().split('@')[1] || '';
  return at.replace(/^www\./, '');
}

function nameToken(name) {
  return text(name)
    .toLowerCase()
    .replace(/\b(as|asa|ans|da|sa|nuf|ba|kf|iks|sf|avd)\b/g, '')
    .replace(/[^a-z0-9æøå]+/gi, ' ')
    .trim()
    .split(/\s+/)[0] || '';
}

export function indexLabel(id) {
  const series = seriesById(id);
  if (!series) return text(id);
  return `${series.name} (SSB ${series.table})`;
}

export function emailLooksLikeSupplier(email, supplier, buyer) {
  const domain = domainOf(email);
  if (!domain) return false;
  const supplierToken = nameToken(supplier);
  const buyerToken = nameToken(buyer);
  if (buyerToken && domain.includes(buyerToken)) return false;
  return !!(supplierToken && supplierToken.length >= 4 && domain.includes(supplierToken));
}

export function agreementSummary(form = {}) {
  const parts = [
    kindLabel(form.kind) || 'Avtale',
    text(form.title),
    text(form.buyer),
    text(form.standard),
    form.value ? money(form.value) : '',
    [form.start, form.end].filter(Boolean).join(' – '),
  ].filter(Boolean);
  return parts.join(' · ');
}

/**
 * Felt som må ses på før registrering. Nøkkel matcher skjemafelt.
 * registerHit: { name, orgnr } fra Enhetsregisteret.
 */
export function reviewFlags(form = {}, { registerHit = null } = {}) {
  const flags = {};
  const description = text(form.description);
  if (description && (LABEL_LEAK.test(description) || description.split(' ').length > 12)) {
    flags.description = 'Beskrivelsen ser ut til å inneholde etiketter fra skjemaet. Behold bare oppdraget.';
  }
  if (emailLooksLikeSupplier(form.email, form.supplier, form.buyer)) {
    flags.email = `E-posten ser ut til å tilhøre oppdragstaker (${form.supplier || 'leverandør'}), ikke oppdragsgiver.`;
  }
  if (registerHit?.name && text(form.buyer) && !namesLikelyMatch(form.buyer, registerHit.name)) {
    flags.buyer = `Enhetsregisteret har navnet ${registerHit.name}. Kontroller at oppdragsgiver er riktig.`;
  }
  if (registerHit?.orgnr && text(form.orgnr) && registerHit.orgnr !== String(form.orgnr || '').replace(/\D/g, '')) {
    flags.orgnr = 'Organisasjonsnummeret matcher ikke oppslaget i Enhetsregisteret.';
  }
  if (text(form.indexId) && /^[a-z0-9-]+$/.test(form.indexId) && !seriesById(form.indexId)) {
    flags.indexId = 'Indeksen er ikke kjent. Velg en SSB-serie.';
  }
  if (text(form.honorar) && LABEL_LEAK.test(form.honorar)) {
    flags.honorar = 'Honorarteksten inneholder skjemafelt. Skriv inn det som er avtalt.';
  }
  return flags;
}

export function registerConfirmText(form, customerHint, registerHit) {
  if (registerHit?.name) {
    const org = formatOrgnr(registerHit.orgnr || form.orgnr);
    const match = namesLikelyMatch(form.buyer, registerHit.name);
    if (match) {
      return `Org.nr ${org} er bekreftet i Enhetsregisteret som ${registerHit.name}.`;
    }
    return `Org.nr ${org} peker på ${registerHit.name} i Enhetsregisteret. Kontroller navnet.`;
  }
  if (customerHint?.status === 'new') {
    return 'Kunden ligger ikke i deres register ennå. Enhetsregisteret kan bekrefte org.nr når det er fylt ut.';
  }
  return '';
}
