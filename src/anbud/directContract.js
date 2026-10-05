/** Direkteavtaler uten tilbudsarbeid, og overføring til indeksfeltene. */

import { emptyDraft, emptyLine, parseAmount, parseIsoDate, todayIso } from '../indeksregulering/engine.js';
import { agreementKindFromText } from './agreementTemplate.js';
import { formatNumberId, sortContractsChronological } from './numbering.js';

function text(value) {
  return String(value || '').trim();
}

function fold(value) {
  return text(value).toLowerCase();
}

export function contractValueFromDraft(draft) {
  const lines = Array.isArray(draft?.lines) ? draft.lines : [];
  const lump = lines.find((row) => /kontraktssum|entreprisesum|vederlag/i.test(row?.text || '') && parseAmount(row?.rate) != null);
  if (lump) return parseAmount(lump.rate);
  const priced = lines.map((row) => parseAmount(row?.rate)).find((n) => n != null && n > 0);
  return priced != null ? priced : 0;
}

export function fieldsFromDraft(draft, extras = {}) {
  return {
    standard: text(draft?.standard),
    model: text(draft?.model),
    indexId: text(draft?.indexId),
    sharePercent: text(draft?.sharePercent),
    vatPercent: text(draft?.vatPercent),
    offerDate: text(draft?.offerDate),
    tenderDeadline: text(draft?.tenderDeadline),
    contractDate: text(draft?.contractDate),
    honorar: text(draft?.honorar),
    place: text(draft?.place),
    address: text(extras.address || draft?.address),
    description: text(extras.description || draft?.description),
    poNumber: text(extras.poNumber || draft?.poNumber),
    orgnr: text(draft?.orgnr || extras.orgnr),
    supplierOrgnr: text(draft?.supplierOrgnr || extras.supplierOrgnr),
    personnummer: text(draft?.personnummer || extras.personnummer),
    contactName: text(draft?.contactName || extras.contactName),
    phone: text(draft?.phone || extras.phone),
    email: text(draft?.email || extras.email),
    projectName: text(extras.projectName || draft?.title),
    reference: text(draft?.reference),
    surchargePercent: text(draft?.surchargePercent || extras.surchargePercent),
    engine: text(draft?.engine),
    terms: draft?.terms || null,
    lines: Array.isArray(draft?.lines) ? draft.lines : [],
    findings: Array.isArray(draft?.findings) ? draft.findings : [],
  };
}

export function indexDraftFromInterpretation(draft, extras = {}) {
  const docs = Array.isArray(extras.documents) ? extras.documents : (draft?.documents || []);
  return emptyDraft({
    ...draft,
    title: text(extras.title || draft?.title),
    buyer: text(extras.buyer || draft?.buyer),
    supplier: text(extras.supplier || draft?.supplier),
    reference: text(extras.reference || draft?.reference),
    startDate: text(extras.start || draft?.startDate),
    endDate: text(extras.end || draft?.endDate),
    regulationDate: draft?.regulationDate || todayIso(),
    noticeDate: draft?.noticeDate || todayIso(),
    documents: docs.map((doc, index) => ({
      id: doc.id || `dok-${index + 1}`,
      name: text(doc.name) || `Dokument ${index + 1}`,
      text: text(doc.text).slice(0, 20000),
    })),
    lines: Array.isArray(draft?.lines) && draft.lines.length
      ? draft.lines
      : [emptyLine({ text: 'Kontraktssum' })],
  });
}

export function inputFromInterpretation(draft, extras = {}) {
  const title = text(extras.title || draft?.title) || 'Ny avtale';
  const start = parseIsoDate(extras.start || draft?.startDate) || '';
  const end = parseIsoDate(extras.end || draft?.endDate) || '';
  const documents = Array.isArray(extras.documents) ? extras.documents : [];
  const source = documents.map((doc) => doc.text).filter(Boolean).join('\n');
  return {
    title,
    buyer: text(extras.buyer || draft?.buyer),
    supplier: text(extras.supplier || draft?.supplier),
    projectName: text(extras.projectName || draft?.title || title),
    description: text(extras.description || draft?.description),
    address: text(extras.address || draft?.address),
    kind: text(extras.kind || draft?.kind || agreementKindFromText(source)),
    value: extras.value != null && extras.value !== '' ? extras.value : contractValueFromDraft(draft),
    start,
    end,
    projectId: text(extras.projectId),
    parentId: text(extras.parentId),
    customerId: text(extras.customerId),
    systemId: text(extras.systemId),
    oppdragId: text(extras.oppdragId || extras.reference || draft?.reference),
    honorar: text(extras.honorar || draft?.honorar),
    place: text(extras.place || draft?.place),
    poNumber: text(extras.poNumber || draft?.poNumber),
    orgnr: text(extras.orgnr || draft?.orgnr),
    supplierOrgnr: text(extras.supplierOrgnr || draft?.supplierOrgnr),
    personnummer: text(extras.personnummer || draft?.personnummer),
    contactName: text(extras.contactName || draft?.contactName),
    phone: text(extras.phone || draft?.phone),
    email: text(extras.email || draft?.email),
    reference: text(extras.reference || draft?.reference),
    standard: text(extras.standard || draft?.standard),
    indexId: text(extras.indexId || draft?.indexId),
    surchargePercent: text(extras.surchargePercent || draft?.surchargePercent),
    contractDate: text(extras.contractDate || draft?.contractDate),
    fields: fieldsFromDraft(draft, extras),
    documents,
    indexDraft: indexDraftFromInterpretation(draft, { ...extras, documents, title, start, end }),
  };
}

export function filterContracts(contracts, filters = {}) {
  const rows = Array.isArray(contracts) ? contracts : [];
  const buyer = fold(filters.buyer);
  const project = fold(filters.project);
  const query = fold(filters.query);
  const from = parseIsoDate(filters.from);
  const to = parseIsoDate(filters.to);
  const matched = rows.filter((row) => {
    if (buyer && !fold(row.buyer).includes(buyer)) return false;
    const projectText = `${row.projectName || ''} ${row.title || ''}`;
    if (project && !fold(projectText).includes(project)) return false;
    if (query) {
      const hay = [
        row.title, row.buyer, row.supplier, row.projectName, row.description,
        row.kind, row.systemId, row.oppdragId, formatNumberId(row.systemId), formatNumberId(row.oppdragId),
        row.fields?.reference, row.fields?.standard, row.fields?.contactName,
        row.fields?.orgnr, row.fields?.poNumber, row.address, row.place, row.fields?.place,
        ...(row.documents || []).map((doc) => doc.name),
      ]
        .map(fold)
        .join(' ');
      if (!hay.includes(query)) return false;
    }
    const date = row.start || row.fields?.contractDate || (row.createdAt || '').slice(0, 10);
    if (from && date && date < from) return false;
    if (to && date && date > to) return false;
    if ((from || to) && !date) return false;
    return true;
  });
  return sortContractsChronological(matched);
}

export function indeksCaseFromContract(contract) {
  const draft = contract?.indexDraft;
  if (!draft || typeof draft !== 'object') return null;
  return {
    id: `ir-${contract.id}`,
    projectId: text(contract.projectId),
    savedAt: new Date().toISOString(),
    title: contract.title || draft.title || 'Avtale',
    reference: text(draft.reference || contract.fields?.reference),
    addition: 0,
    regulatedPeriod: '',
    draft: {
      ...draft,
      sourceText: (contract.documents || []).map((doc) => doc.text).filter(Boolean).join('\n\n'),
    },
  };
}
