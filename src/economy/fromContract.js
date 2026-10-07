/** Indeksutkast fra registrert avtale. Leser ikke inn nye sannheter, bare det som allerede ligger på kontrakten. */

import { coverFromRecord, kindLabel } from '../anbud/agreementTemplate.js';
import { emptyLine, parseAmount, parseIsoDate, todayIso } from '../indeksregulering/engine.js';
import { MODELS, STANDARDS, seriesById } from '../indeksregulering/catalog.js';
import { interpretDocuments } from '../indeksregulering/interpret.js';
import { formatKrone } from '../indeksregulering/letter.js';
import { honorarPrice } from '../indeksregulering/priceText.js';

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function pick(...values) {
  for (const value of values) {
    const next = text(value);
    if (next) return next;
  }
  return '';
}

function sameText(left, right) {
  const a = text(left).toLowerCase();
  const b = text(right).toLowerCase();
  return !!a && a === b;
}

function except(value, blocked) {
  return sameText(value, blocked) ? '' : text(value);
}

function standardRule(id) {
  return id && STANDARDS[id] ? STANDARDS[id] : null;
}

function modelLabel(id) {
  return MODELS.find((row) => row.id === id)?.label || text(id);
}

function moneyLine(cover, stored) {
  const storedLines = Array.isArray(stored.lines) ? stored.lines : [];
  if (storedLines.some((line) => parseAmount(line?.rate) != null)) return storedLines;
  const rate = parseAmount(cover.value) ?? parseAmount(cover.honorar);
  if (rate == null) return storedLines.length ? storedLines : [];
  return [emptyLine({
    text: pick(cover.honorar, cover.description, 'Avtalt honorar'),
    quantity: '1',
    unit: 'RS',
    rate: String(rate),
  })];
}

/**
 * Bygger beregningsutkastet fra kontrakt, kunde og bedrift.
 * Registrerte avtale-felt vinner. Standarden kan foreslå modell og serie når de mangler.
 */
export function draftFromRegisteredContract(contract, extras = {}) {
  const cover = coverFromRecord(contract || {});
  const stored = contract?.indexDraft && typeof contract.indexDraft === 'object' ? contract.indexDraft : {};
  const fields = contract?.fields && typeof contract.fields === 'object' ? contract.fields : {};
  const customer = extras.customer || null;
  const company = extras.company || null;
  const docs = Array.isArray(contract?.documents) ? contract.documents : [];
  const readable = docs.filter((doc) => text(doc.text).length >= 20);
  const needRead = !pick(cover.standard, stored.standard, cover.indexId, stored.indexId) && readable.length;
  const read = needRead ? interpretDocuments(readable) : null;

  const standard = pick(cover.standard, stored.standard, fields.standard, read?.standard);
  const rule = standardRule(standard);
  const indexId = pick(cover.indexId, stored.indexId, fields.indexId, read?.indexId, rule?.indexId);
  const model = pick(stored.model, fields.model, read?.model, rule?.model);
  const buyerOrgnr = pick(cover.orgnr, customer?.orgnr, stored.orgnr, read?.orgnr);
  const supplierOrgnr = pick(cover.supplierOrgnr, company?.organisasjonsnummer, stored.supplierOrgnr, extras.supplierOrgnr);
  const supplierName = pick(cover.supplier, contract?.supplier, company?.navn, extras.supplier, stored.supplier);
  const companyEmail = pick(company?.epostadresse, extras.email);
  const companyPhone = pick(company?.telefon, extras.phone);
  const clientEmail = pick(
    except(customer?.email, companyEmail),
    except(cover.email, companyEmail),
    except(stored.email, companyEmail),
    except(read?.email, companyEmail),
  );
  const clientPhone = pick(
    except(customer?.phone, companyPhone),
    except(cover.phone, companyPhone),
    except(stored.phone, companyPhone),
    except(read?.phone, companyPhone),
  );

  return {
    title: pick(cover.title, contract?.title, stored.title, read?.title),
    reference: pick(extras.projectNumber, cover.oppdragId, contract?.oppdragId, stored.reference, read?.reference),
    buyer: pick(cover.buyer, contract?.buyer, customer?.name, stored.buyer, read?.buyer),
    supplier: supplierName,
    standard,
    model,
    indexId,
    sharePercent: pick(stored.sharePercent, fields.sharePercent, cover.sharePercent, read?.sharePercent),
    vatPercent: pick(stored.vatPercent, fields.vatPercent, read?.vatPercent),
    offerDate: pick(stored.offerDate, fields.offerDate, cover.offerDate, read?.offerDate),
    tenderDeadline: pick(stored.tenderDeadline, fields.tenderDeadline, cover.tenderDeadline, read?.tenderDeadline),
    value: pick(cover.value, stored.value, fields.value),
    contractDate: pick(cover.contractDate, stored.contractDate, read?.contractDate),
    startDate: pick(cover.start, contract?.start, stored.startDate),
    endDate: pick(cover.end, contract?.end, stored.endDate),
    honorar: pick(cover.honorar, stored.honorar, read?.honorar),
    place: pick(cover.place, contract?.place, stored.place, read?.place),
    address: pick(cover.address, contract?.address, stored.address, read?.address),
    description: pick(cover.description, contract?.description, stored.description),
    poNumber: pick(cover.poNumber, stored.poNumber, read?.poNumber),
    orgnr: buyerOrgnr,
    personnummer: pick(cover.personnummer, customer?.personnummer, stored.personnummer),
    supplierOrgnr,
    contactName: pick(cover.contactName, customer?.contactName, stored.contactName, read?.contactName),
    phone: clientPhone,
    email: clientEmail,
    senderContact: pick(company?.kontaktperson, extras.senderContact),
    senderEmail: companyEmail,
    senderPhone: companyPhone,
    senderPlace: pick(company?.poststed, company?.forretning?.poststed, extras.senderPlace),
    website: pick(company?.hjemmeside, extras.website, stored.website),
    surchargePercent: pick(cover.surchargePercent, stored.surchargePercent),
    kind: pick(cover.kind, contract?.kind),
    lines: moneyLine(cover, stored),
    terms: stored.terms || read?.terms || null,
    documents: docs,
    findings: stored.findings || read?.findings || [],
    engine: stored.engine || read?.engine || 'avtale',
    regulationDate: stored.regulationDate || todayIso(),
    noticeDate: stored.noticeDate || todayIso(),
    regulationExcluded: stored.regulationExcluded === true,
    overrideExclusion: stored.overrideExclusion === true,
    weights: Array.isArray(stored.weights) ? stored.weights : [],
    periods: Array.isArray(stored.periods) ? stored.periods : [],
  };
}

export function knownIndexFacts(draft) {
  const series = seriesById(draft?.indexId);
  const rule = standardRule(draft?.standard);
  const price = honorarPrice(draft);
  return [
    { label: 'Avtale', value: draft?.title },
    { label: 'Avtaletype', value: kindLabel(draft?.kind) },
    { label: 'Oppdragsnummer', value: draft?.reference },
    { label: 'PO-nummer', value: draft?.poNumber },
    { label: 'Beskrivelse', value: draft?.description },
    { label: 'Oppdragsgiver', value: draft?.buyer },
    { label: 'Org.nr oppdragsgiver', value: draft?.orgnr },
    { label: 'Kontakt', value: [draft?.contactName, draft?.email, draft?.phone].filter(Boolean).join(' · ') },
    { label: 'Oppdragstaker', value: draft?.supplier },
    { label: 'Org.nr oppdragstaker', value: draft?.supplierOrgnr },
    { label: 'Standard', value: rule?.label || draft?.standard },
    { label: 'Indeks', value: series ? `${series.name} · tabell ${series.table}` : draft?.indexId },
    { label: 'Modell', value: modelLabel(draft?.model) },
    { label: 'Avtaledato', value: draft?.contractDate },
    { label: 'Tilbudsdato', value: draft?.offerDate },
    { label: 'Tilbudsfrist', value: draft?.tenderDeadline },
    { label: 'Periode', value: [draft?.startDate, draft?.endDate].filter(Boolean).join(' – ') },
    { label: 'Honorar', value: price.description },
    { label: 'Avtalt pris', value: price.amount == null ? '' : `${formatKrone(price.amount)}${price.phrase ? ` ${price.phrase}` : ''}` },
    { label: 'Påslag', value: draft?.surchargePercent ? `${draft.surchargePercent} %` : '' },
    { label: 'Sted', value: [draft?.address, draft?.place].filter(Boolean).join(', ') },
  ].filter((row) => text(row.value));
}

/** Felt som må på plass før SSB-beregningen kan kjøres. */
export function missingIndexFields(draft) {
  const missing = [];
  if (!draft?.indexId) {
    missing.push({
      id: 'indexId',
      label: 'Hvilken SSB-indeks avtalen følger',
      hint: draft?.standard
        ? `Avtalen peker på ${draft.standard}. Velg serien som hører til, eller den som er skrevet i kontrakten.`
        : 'Finnes i kontrakten under prisregulering. Modulen finner den ikke i de registrerte feltene.',
    });
  }
  if (!draft?.model) {
    missing.push({
      id: 'model',
      label: 'Reguleringsmodell',
      hint: 'NS 8403 bruker vanligvis engangsregulering av sats. NS 8405/8407 bruker NS 3405.',
    });
  }
  const basis = parseIsoDate(draft?.tenderDeadline) || parseIsoDate(draft?.offerDate) || parseIsoDate(draft?.contractDate);
  if (!basis) {
    missing.push({
      id: 'contractDate',
      label: 'Tilbudsfrist, tilbudsdato eller avtaledato',
      hint: 'Basismåneden hentes fra en av disse datoene. Registrer den på avtalen hvis den mangler.',
    });
  }
  const priced = (draft?.lines || []).some((line) => parseAmount(line?.rate) != null);
  if (!priced && parseAmount(draft?.honorar) == null) {
    missing.push({
      id: 'value',
      label: 'Sats eller honorar som skal reguleres',
      hint: 'Bruk avtalt honorarpris fra avtalen. Modulen skal ikke gjette beløpet.',
    });
  }
  if (parseAmount(draft?.sharePercent) == null) {
    missing.push({
      id: 'sharePercent',
      label: 'Regulert andel',
      hint: 'Hvis avtalen ikke sier noe annet, er andelen vanligvis 100 %.',
      suggest: '100',
    });
  }
  return missing;
}
