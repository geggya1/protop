/**
 * Prosjektet leser avtale, kunde, faktura og øvrige moduler.
 * Tomme prosjektfelt fylles fra avtalen. Felt som allerede har verdi blir stående.
 */
import { kindLabel, RENEWAL_TYPES } from '../anbud/agreementTemplate.js';
import { formatMoney, invoiceTotals, statusLabel } from '../economy/invoices.js';
import { formatHours } from '../arbeid/hours.js';
import { updateProject } from './engine.js';
import { projectNumberKey } from './projectFields.js';

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function blank(value) {
  return value == null || text(value) === '';
}

function alive(contract) {
  return !!(contract && !contract.deletedAt);
}

/** Beløp i honorartekst. Fri tekst som «etter medgått tid» gir null. */
export function parseHonorarAmount(value) {
  const raw = text(value);
  if (!raw) return null;
  const stripped = raw
    .replace(/\b(kr|nok|mva|eks|inkl|fastpris|honorar)\b\.?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (/[a-zæøå]/i.test(stripped)) return null;
  let compact = stripped.replace(/\s/g, '');
  if (compact.includes(',') && compact.includes('.')) {
    compact = compact.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(compact)) {
    compact = compact.replace(/\./g, '');
  } else if (compact.includes(',')) {
    compact = compact.replace(',', '.');
  }
  const amount = Number(compact);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function pickContract(rows) {
  const list = (Array.isArray(rows) ? rows : []).filter(alive);
  if (!list.length) return null;
  const active = list.filter((row) => row.status !== 'avsluttet');
  const pool = active.length ? active : list;
  return [...pool].sort((a, b) => text(b.createdAt).localeCompare(text(a.createdAt)))[0];
}

/** Avtale via prosjektets contractId, eller via avtalens projectId. */
export function resolveProjectAgreement(project, contracts) {
  const list = (Array.isArray(contracts) ? contracts : []).filter(alive);
  const byId = text(project?.contractId)
    ? list.find((row) => row.id === project.contractId) || null
    : null;
  const pointing = list.filter((row) => text(row.projectId) && row.projectId === project?.id);
  const contract = byId || pickContract(pointing);
  const frameworkId = text(project?.frameworkAgreementId)
    || (contract?.kind === 'avrop' ? text(contract.parentId) : '');
  const framework = frameworkId
    ? (list.find((row) => row.id === frameworkId) || null)
    : null;
  return { contract: contract || null, framework };
}

export function projectAgreementGap(project, contracts) {
  const { contract, framework } = resolveProjectAgreement(project, contracts);
  if (project?.agreementKind === 'avrop') return !(contract && framework);
  if (contract) return false;
  return !text(project?.contractId);
}

export function invoicesForProject(invoices, project) {
  const id = text(project?.id);
  const number = projectNumberKey(project?.number);
  const rows = (Array.isArray(invoices) ? invoices : []).filter((row) => {
    if (id && text(row?.projectId) === id) return true;
    if (number && projectNumberKey(row?.projectNumber) === number) return true;
    return false;
  });
  return rows.sort((a, b) => text(b.invoiceDate).localeCompare(text(a.invoiceDate))
    || text(b.invoiceNumber).localeCompare(text(a.invoiceNumber), 'nb', { numeric: true }));
}

function invoiceMethodLabel(value) {
  const raw = text(value).toUpperCase();
  if (raw === 'EPOST') return 'E-post';
  if (raw === 'EHF') return 'EHF';
  if (raw === 'POST') return 'Post';
  return text(value);
}

function renewalLabel(renewal) {
  const type = renewal?.type;
  if (!type || type === 'ingen') return '';
  const label = RENEWAL_TYPES.find((row) => row.id === type)?.label || type;
  return [label, renewal.until ? `til ${renewal.until}` : ''].filter(Boolean).join(' ');
}

function pushFact(facts, label, value) {
  const shown = text(value);
  if (!shown || shown === '—') return;
  facts.push({ label, value: shown });
}

function documentRows(project, contract) {
  const rows = [];
  const seen = new Set();
  const add = (doc, source) => {
    const name = text(doc?.name || doc?.title);
    if (!name) return;
    const key = `${name}|${text(doc?.url)}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({
      id: text(doc.id) || key,
      name,
      url: text(doc.url || doc.dataUrl),
      source,
    });
  };
  for (const doc of contract?.documents || []) add(doc, 'avtale');
  for (const doc of project?.agreementDocuments || []) add(doc, 'prosjekt');
  for (const doc of project?.offerDocuments || []) add(doc, doc.source === 'tilbud' ? 'tilbud' : 'prosjekt');
  return rows;
}

/**
 * Tomme felt fra avtalen. Returnerer null når prosjektet allerede har det som finnes.
 * Honorar som er et beløp med fastpris settes som prismodell. Fri tekst endrer ikke prismodellen.
 */
export function projectFillFromAgreement(project, contract, customer) {
  if (!project || !contract?.id) return null;
  const fields = contract.fields || {};
  const patch = {};
  if (blank(project.contractId)) patch.contractId = contract.id;
  if (blank(project.agreementKind)) {
    if (contract.kind === 'avrop') patch.agreementKind = 'avrop';
    else if (contract.kind === 'rammeavtale') patch.agreementKind = 'rammeavtale';
    else patch.agreementKind = 'oppdrag';
  }
  if (blank(project.frameworkAgreementId)) {
    if (contract.kind === 'avrop' && text(contract.parentId)) patch.frameworkAgreementId = contract.parentId;
    else if (contract.kind === 'rammeavtale') patch.frameworkAgreementId = contract.id;
  }
  const customerId = text(project.customerId) || text(contract.customerId) || text(customer?.id);
  if (blank(project.customerId) && customerId) patch.customerId = customerId;
  if (blank(project.client)) {
    const client = text(customer?.name) || text(contract.buyer);
    if (client) patch.client = client;
  }
  if (blank(project.customerNumber) && text(customer?.customerNumber)) {
    patch.customerNumber = customer.customerNumber;
  }
  if (blank(project.orgnr)) {
    const orgnr = text(customer?.orgnr) || text(fields.orgnr);
    if (orgnr) patch.orgnr = orgnr;
  }
  if (blank(project.manager)) {
    const manager = text(contract.ownerName) || text(fields.leaderName);
    if (manager) patch.manager = manager;
  }
  if (blank(project.start)) {
    const start = text(contract.start) || text(fields.contractDate);
    if (start) patch.start = start;
  }
  if (blank(project.end) && text(contract.end)) patch.end = contract.end;
  if (blank(project.description)) {
    const description = text(contract.description) || text(fields.description);
    if (description) patch.description = description;
  }
  const addressBlank = blank(project.street) && blank(project.postalCode)
    && blank(project.placeName) && blank(project.place);
  if (addressBlank) {
    const street = text(fields.address) || text(contract.address);
    const postalCode = text(fields.postalCode);
    const placeName = text(fields.place);
    if (street) patch.street = street;
    if (postalCode) patch.postalCode = postalCode;
    if (placeName) patch.placeName = placeName;
  }
  if (blank(project.cadastralId) && text(fields.gnrBnr)) patch.cadastralId = fields.gnrBnr;
  if (blank(project.pricingModel)) {
    const amount = parseHonorarAmount(fields.honorar);
    const form = `${text(fields.honorarForm)} ${text(fields.honorar)}`;
    const timed = /time|medg[åa]tt/i.test(form);
    if (amount != null && !timed) {
      patch.pricingModel = 'fixed';
      patch.pricingSettings = { fixedFee: amount };
    }
  }
  return Object.keys(patch).length ? patch : null;
}

export function mergeAgreementPatch(current, patch) {
  if (!patch) return current;
  const next = { ...current, ...patch };
  if (patch.pricingSettings) {
    next.pricingSettings = { ...(current.pricingSettings || {}), ...patch.pricingSettings };
  }
  if (patch.pricingSettings?.fixedFee != null && blank(current.feeEstimate)) {
    next.feeEstimate = patch.pricingSettings.fixedFee;
  }
  return next;
}

/** Skriver avtalens opplysninger inn på prosjekter som mangler dem. */
export function applyAgreementToProjects(projectState, contracts, customers = []) {
  let working = projectState;
  let changed = 0;
  for (const project of projectState?.projects || []) {
    if (!project || project.status === 'arkivert') continue;
    const { contract } = resolveProjectAgreement(project, contracts);
    if (!contract) continue;
    const customer = (customers || []).find((row) => row.id === (project.customerId || contract.customerId)) || null;
    const patch = projectFillFromAgreement(project, contract, customer);
    if (!patch) continue;
    const result = updateProject(working, project.id, patch);
    if (!result.ok) continue;
    working = result.state;
    changed += 1;
  }
  return { state: working, changed };
}

/** Alt prosjektet kan vise fra moduler som allerede har data. */
export function projectCrossView({
  project,
  contracts = [],
  customer = null,
  invoices = [],
  economy = null,
  time = null,
} = {}) {
  const { contract, framework } = resolveProjectAgreement(project, contracts);
  const rows = invoicesForProject(invoices, project);
  const totals = invoiceTotals(rows);
  const fields = contract?.fields || {};
  const honorarText = text(fields.honorar);
  const honorarAmount = parseHonorarAmount(honorarText);
  const contractValue = Number(contract?.value) > 0 ? Number(contract.value) : 0;
  const facts = [];
  pushFact(facts, 'Avtaletype', contract ? (kindLabel(contract.kind) || 'Avtale') : '');
  if (framework && framework.id !== contract?.id) pushFact(facts, 'Rammeavtale', framework.title);
  pushFact(facts, 'Oppdrag', contract?.oppdragId);
  pushFact(facts, 'System-ID', contract?.systemId);
  pushFact(facts, 'Ansvarlig', contract?.ownerName);
  pushFact(facts, 'Oppdragsleder', fields.leaderName);
  const follow = (fields.assignees || []).map((row) => text(row.name)).filter(Boolean);
  pushFact(facts, 'Oppfølging', follow.join(', '));
  pushFact(facts, 'Honorarsform', fields.honorarForm);
  pushFact(facts, 'Standard', fields.standard);
  pushFact(facts, 'Betalingsbetingelser', fields.paymentTerms);
  pushFact(facts, 'Fakturamottak', invoiceMethodLabel(fields.invoiceMethod));
  pushFact(facts, 'Faktura merkes', fields.invoiceAttn);
  pushFact(facts, 'Indeks', [fields.indexId, fields.indexBase].filter(Boolean).join(' · '));
  const lastRegulation = Array.isArray(contract?.regulations) ? contract.regulations[contract.regulations.length - 1] : null;
  if (lastRegulation && (lastRegulation.changePercent || lastRegulation.toPeriod)) {
    pushFact(
      facts,
      'Siste regulering',
      [
        lastRegulation.toPeriod,
        lastRegulation.changePercent ? `${lastRegulation.changePercent} %` : '',
      ].filter(Boolean).join(' · '),
    );
  }
  pushFact(facts, 'Fornyelse', renewalLabel(contract?.renewal));
  pushFact(facts, 'Biomkostninger', fields.biomkostninger);
  pushFact(facts, 'Særlige vilkår', fields.specialTerms);
  pushFact(facts, 'Kundenr', customer?.customerNumber || project?.customerNumber);
  pushFact(facts, 'Org.nr', customer?.orgnr || project?.orgnr || fields.orgnr);
  pushFact(facts, 'Kontakt', customer?.contactName || fields.contactName);
  pushFact(facts, 'E-post', customer?.email || fields.email);
  pushFact(facts, 'Telefon', customer?.phone || fields.phone);
  if (time && (time.hours || time.count)) {
    pushFact(facts, 'Timer jobbet', formatHours(time.hours));
    pushFact(facts, 'Fakturerbare timer', formatHours(time.billable));
  }
  if (economy && (economy.income || economy.cost || economy.approvedChanges)) {
    pushFact(facts, 'Bokførte inntekter', formatMoney(economy.income));
    pushFact(facts, 'Kostnader', formatMoney(economy.cost));
    pushFact(facts, 'Resultat', formatMoney(economy.result));
    if (economy.approvedChanges) pushFact(facts, 'Godkjente endringer', formatMoney(economy.approvedChanges));
  }
  const milestones = [
    ...(contract?.milestones || []).map((row) => ({ ...row, kind: 'Milepæl' })),
    ...(contract?.deliveries || []).map((row) => ({ ...row, kind: 'Leveranse' })),
  ].filter((row) => text(row.title));
  const options = (contract?.options || []).filter((row) => text(row.title));
  return {
    contract,
    framework,
    missing: projectAgreementGap(project, contracts),
    honorarText,
    honorarAmount,
    contractValue,
    invoices: rows.map((row) => ({
      id: row.id,
      invoiceNumber: text(row.invoiceNumber) || 'Uten nummer',
      invoiceDate: text(row.invoiceDate),
      dueDate: text(row.dueDate),
      amountExVat: row.amountExVat,
      amountInclVat: row.amountInclVat,
      outstanding: row.outstandingAmount ?? row.outstanding,
      status: statusLabel(row.status),
      customerName: text(row.customerName),
    })),
    totals,
    facts,
    documents: documentRows(project, contract),
    milestones,
    options,
  };
}
