/** Tilbudsstrategi, kravsjekk, kontrakt og logg for en utførende bedrift. */

import { AGREEMENT_KINDS, emptyOption } from './agreementTemplate.js';
import { normalizeOrgnr, normalizePersonnummer } from './customers.js';
import { assignContractNumbers, claimContractNumbers, normalizeNumberId } from './numbering.js';

export const STAGES = ['planlegging', 'gjennomforing', 'levert', 'kontrakt', 'tapt', 'trukket'];

export const STAGE_LABELS = {
  planlegging: 'Planlegging',
  gjennomforing: 'Gjennomføring',
  levert: 'Levert',
  kontrakt: 'Vunnet',
  tapt: 'Tapt',
  trukket: 'Trukket',
};

export const STRATEGY_ITEMS = [
  { id: 'fag', label: 'Fag og geografi passer oppdraget' },
  { id: 'kapasitet', label: 'Kapasitet i perioden' },
  { id: 'referanser', label: 'Referanser dekker kravet' },
  { id: 'okonomi', label: 'Økonomi, garantier og forsikring' },
  { id: 'hms', label: 'HMS og kvalitet kan dokumenteres' },
  { id: 'grunnlag', label: 'Konkurransegrunnlaget er lest' },
];

export const DEFAULT_MILESTONES = [
  { key: 'signert', title: 'Kontrakt signert' },
  { key: 'oppstart', title: 'Oppstart' },
  { key: 'delfaktura', title: 'Delfaktura' },
  { key: 'overlevering', title: 'Overlevering' },
  { key: 'sluttfaktura', title: 'Sluttfaktura' },
];

const STRATEGY_IDS = new Set(STRATEGY_ITEMS.map((item) => item.id));
const STAGE_SET = new Set(STAGES);

function text(value) {
  return String(value || '').trim();
}

function fail(state, error) {
  return { ok: false, state, error };
}

function ok(state) {
  return { ok: true, state, error: null };
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isoDate(value) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const [year, month, day] = raw.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return raw;
}

export function parseDeadline(value) {
  const raw = text(value);
  if (!raw) return '';
  const iso = raw.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso && isoDate(iso[1])) return iso[1];
  const norwegian = raw.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!norwegian) return '';
  const day = norwegian[1].padStart(2, '0');
  const month = norwegian[2].padStart(2, '0');
  return isoDate(`${norwegian[3]}-${month}-${day}`);
}

/** Kalenderdagen er passert. Selve fristdagen regnes fortsatt som åpen. */
export function deadlineHasPassed(value, now = new Date()) {
  const deadline = parseDeadline(value);
  if (!deadline) return false;
  return dayNumber(deadline) < dayNumber(todayIso(now));
}

function dayNumber(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return Math.round(new Date(year, month - 1, day).getTime() / 86400000);
}

function todayIso(now) {
  const date = now instanceof Date ? now : new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return todayIso(date);
}

function daysBetween(start, end) {
  return dayNumber(end) - dayNumber(start);
}

export function normalizeStrategy(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const strategy = {};
  for (const id of STRATEGY_IDS) strategy[id] = !!src[id];
  return strategy;
}

export function normalizeBidRecord(raw) {
  const row = raw && typeof raw === 'object' ? raw : {};
  return {
    ...row,
    stage: STAGE_SET.has(row.stage) ? row.stage : 'planlegging',
    strategy: normalizeStrategy(row.strategy),
  };
}

function normalizeMilestones(input) {
  const byKey = new Map();
  for (const row of Array.isArray(input) ? input : []) {
    const key = text(row?.key);
    if (!DEFAULT_MILESTONES.some((item) => item.key === key)) continue;
    byKey.set(key, row);
  }
  return DEFAULT_MILESTONES.map((item) => {
    const row = byKey.get(item.key) || {};
    return {
      id: text(row.id) || `ms_${item.key}`,
      key: item.key,
      title: item.title,
      due: isoDate(row.due),
      status: row.status === 'utfort' ? 'utfort' : 'planlagt',
      owner: text(row.owner),
    };
  });
}

function normalizeDeliveries(input) {
  if (!Array.isArray(input)) return [];
  return input.map((row) => {
    const title = text(row?.title);
    const id = text(row?.id);
    if (!id || !title) return null;
    return {
      id,
      title,
      due: isoDate(row.due),
      status: row.status === 'levert' ? 'levert' : 'avtalt',
      note: text(row.note),
    };
  }).filter(Boolean);
}

const KIND_SET = new Set(AGREEMENT_KINDS.map((row) => row.id));

function normalizeKind(value) {
  const raw = text(value);
  return KIND_SET.has(raw) ? raw : '';
}

function normalizeRenewal(raw) {
  const row = raw && typeof raw === 'object' ? raw : {};
  const type = row.type === 'automatisk' || row.type === 'opsjon' ? row.type : 'ingen';
  const notice = Number(row.noticeDays);
  return {
    type,
    until: isoDate(row.until),
    noticeDays: Number.isFinite(notice) && notice >= 0 ? Math.round(notice) : '',
  };
}

function normalizeOptions(input) {
  if (!Array.isArray(input)) return [];
  return input.map((row, index) => {
    const title = text(row?.title).slice(0, 160);
    if (!title) return null;
    return emptyOption({
      id: text(row?.id) || `opsjon_${index + 1}`,
      title,
      start: isoDate(row.start),
      end: isoDate(row.end),
      exercised: !!row?.exercised,
      note: text(row?.note).slice(0, 240),
    });
  }).filter(Boolean).slice(0, 20);
}

function normalizeFields(raw) {
  if (!raw || typeof raw !== 'object') return emptyCoverFields();
  const lines = Array.isArray(raw.lines)
    ? raw.lines.slice(0, 40).map((row) => ({
      text: text(row?.text).slice(0, 120),
      quantity: text(row?.quantity).slice(0, 20),
      unit: text(row?.unit).slice(0, 20),
      rate: text(row?.rate).slice(0, 40),
      indexId: text(row?.indexId).slice(0, 40),
      sharePercent: text(row?.sharePercent).slice(0, 20),
      included: row?.included !== false,
    })).filter((row) => row.text || row.rate)
    : [];
  const findings = Array.isArray(raw.findings)
    ? raw.findings.map((row) => text(row).slice(0, 240)).filter(Boolean).slice(0, 40)
    : [];
  return {
    ...emptyCoverFields(),
    standard: text(raw.standard).slice(0, 80),
    model: text(raw.model).slice(0, 40),
    indexId: text(raw.indexId).slice(0, 40),
    sharePercent: text(raw.sharePercent).slice(0, 20),
    vatPercent: text(raw.vatPercent).slice(0, 20),
    offerDate: isoDate(raw.offerDate) || text(raw.offerDate).slice(0, 20),
    tenderDeadline: isoDate(raw.tenderDeadline) || text(raw.tenderDeadline).slice(0, 20),
    contractDate: isoDate(raw.contractDate) || text(raw.contractDate).slice(0, 20),
    honorar: text(raw.honorar).slice(0, 160),
    place: text(raw.place).slice(0, 80),
    address: text(raw.address).slice(0, 160),
    description: text(raw.description).slice(0, 400),
    poNumber: text(raw.poNumber).slice(0, 80),
    orgnr: normalizeOrgnr(raw.orgnr) || text(raw.orgnr).slice(0, 20),
    supplierOrgnr: normalizeOrgnr(raw.supplierOrgnr),
    personnummer: normalizePersonnummer(raw.personnummer),
    contactName: text(raw.contactName).slice(0, 80),
    phone: text(raw.phone).slice(0, 40),
    email: text(raw.email).slice(0, 80),
    projectName: text(raw.projectName).slice(0, 160),
    reference: text(raw.reference).slice(0, 80),
    surchargePercent: text(raw.surchargePercent).slice(0, 20),
    engine: text(raw.engine).slice(0, 40),
    terms: raw.terms && typeof raw.terms === 'object' ? raw.terms : null,
    lines,
    findings,
  };
}

function emptyCoverFields() {
  return {
    standard: '',
    model: '',
    indexId: '',
    sharePercent: '',
    vatPercent: '',
    offerDate: '',
    tenderDeadline: '',
    contractDate: '',
    honorar: '',
    place: '',
    address: '',
    description: '',
    poNumber: '',
    orgnr: '',
    supplierOrgnr: '',
    personnummer: '',
    contactName: '',
    phone: '',
    email: '',
    projectName: '',
    reference: '',
    surchargePercent: '',
    engine: '',
    terms: null,
    lines: [],
    findings: [],
  };
}

function normalizeDocuments(input) {
  if (!Array.isArray(input)) return [];
  return input.map((row, index) => {
    const name = text(row?.name).slice(0, 180) || `Dokument ${index + 1}`;
    const body = text(row?.text).slice(0, 20000);
    const dataUrl = text(row?.dataUrl);
    const stored = dataUrl.startsWith('data:') && dataUrl.length <= 700000 ? dataUrl : '';
    return {
      id: text(row?.id) || `dok_${index + 1}`,
      name,
      text: body,
      role: row?.role === 'hoved' ? 'hoved' : 'vedlegg',
      mimeType: text(row?.mimeType).slice(0, 120),
      interpreted: row?.interpreted === true || !!body,
      dataUrl: stored,
      url: text(row?.url).slice(0, 2000),
      uri: text(row?.uri).slice(0, 2000),
      storagePath: text(row?.storagePath).slice(0, 500),
      size: Number(row?.size) || 0,
    };
  }).filter((row) => row.name).slice(0, 100);
}

function normalizeIndexDraft(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return raw;
}

function normalizeRegulations(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 40).map((row) => ({
    id: text(row?.id).slice(0, 80),
    savedAt: text(row?.savedAt).slice(0, 10),
    before: Number(row?.before) || 0,
    after: Number(row?.after) || 0,
    increase: Number(row?.increase) || 0,
    fromPeriod: text(row?.fromPeriod).slice(0, 20),
    fromIndex: Number(row?.fromIndex) || 0,
    toPeriod: text(row?.toPeriod).slice(0, 20),
    toIndex: Number(row?.toIndex) || 0,
    changePercent: Number(row?.changePercent) || 0,
    formula: text(row?.formula).slice(0, 200),
    query: text(row?.query).slice(0, 400),
    letterTitle: text(row?.letterTitle).slice(0, 160),
    letterPlain: text(row?.letterPlain).slice(0, 20000),
  })).filter((row) => row.id);
}

function normalizeContract(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = text(raw.id);
  const title = text(raw.title);
  if (!id || !title) return null;
  const bidId = text(raw.bidId);
  const value = Number(raw.value);
  const source = raw.source === 'direkte' || !bidId ? 'direkte' : 'tildeling';
  return {
    id,
    bidId,
    source,
    noticeId: text(raw.noticeId),
    title,
    buyer: text(raw.buyer),
    supplier: text(raw.supplier),
    projectName: text(raw.projectName),
    description: text(raw.description).slice(0, 400),
    address: text(raw.address).slice(0, 160),
    kind: normalizeKind(raw.kind),
    parentId: text(raw.parentId),
    customerId: text(raw.customerId),
    value: Number.isFinite(value) ? value : 0,
    currency: text(raw.currency) || 'NOK',
    start: isoDate(raw.start),
    end: isoDate(raw.end),
    status: raw.status === 'avsluttet' ? 'avsluttet' : 'aktiv',
    projectId: text(raw.projectId),
    milestones: normalizeMilestones(raw.milestones),
    deliveries: normalizeDeliveries(raw.deliveries),
    createdAt: text(raw.createdAt),
    fields: normalizeFields(raw.fields),
    documents: normalizeDocuments(raw.documents),
    indexDraft: normalizeIndexDraft(raw.indexDraft),
    regulations: normalizeRegulations(raw.regulations),
    indeksCaseId: text(raw.indeksCaseId),
    renewal: normalizeRenewal(raw.renewal),
    options: normalizeOptions(raw.options),
    systemId: normalizeNumberId(raw.systemId),
    oppdragId: normalizeNumberId(raw.oppdragId),
  };
}

export function normalizeContracts(input) {
  if (!Array.isArray(input)) return [];
  return assignContractNumbers(input.map(normalizeContract).filter(Boolean));
}

export function normalizeAudit(input) {
  if (!Array.isArray(input)) return [];
  return input.map((row) => {
    const action = text(row?.action);
    const at = text(row?.at);
    if (!action || !at) return null;
    return {
      id: text(row.id) || createId('log'),
      at,
      bidId: text(row.bidId),
      contractId: text(row.contractId),
      action,
      detail: text(row.detail),
    };
  }).filter(Boolean).slice(0, 200);
}

function bidById(state, id) {
  return (state?.bids || []).find((row) => row.id === id) || null;
}

function contractById(state, id) {
  return (state?.contracts || []).find((row) => row.id === id) || null;
}

function replaceBid(state, id, next) {
  return { ...state, bids: state.bids.map((row) => (row.id === id ? next : row)) };
}

function replaceContract(state, id, next) {
  return { ...state, contracts: state.contracts.map((row) => (row.id === id ? next : row)) };
}

function record(state, entry) {
  const audit = [{
    id: createId('log'),
    at: new Date().toISOString(),
    bidId: text(entry.bidId),
    contractId: text(entry.contractId),
    action: entry.action,
    detail: text(entry.detail),
  }, ...(state.audit || [])].slice(0, 200);
  return { ...state, audit };
}

export function regulatoryChecks(bid, now = new Date()) {
  const dossier = bid?.dossier || {};
  const today = todayIso(now);
  const submission = parseDeadline(dossier.submissionDeadline);
  const question = parseDeadline(dossier.questionDeadline);
  const hasDocuments = !!(dossier.portalFiles?.length || dossier.documents?.length || dossier.documentsUrl);
  const submissionPassed = !!(submission && dayNumber(submission) < dayNumber(today));
  const questionPassed = !!(question && dayNumber(question) < dayNumber(today));
  return [
    {
      id: 'frist',
      label: 'Tilbudsfrist',
      ok: !!text(dossier.submissionDeadline) && !submissionPassed,
      blocking: true,
      detail: submissionPassed
        ? 'Tilbudsfristen er passert'
        : (text(dossier.submissionDeadline) || 'Mangler i grunnlaget'),
    },
    {
      id: 'dokumenter',
      label: 'Konkurransedokumenter',
      ok: hasDocuments,
      blocking: true,
      detail: hasDocuments ? 'Tekst og vedlegg er hentet' : 'Merk konkurransen som aktuell for å hente grunnlaget',
    },
    {
      id: 'sporsmal',
      label: 'Frist for spørsmål',
      ok: !!question && !questionPassed,
      blocking: false,
      detail: questionPassed
        ? 'Fristen for spørsmål er passert'
        : (text(dossier.questionDeadline) || 'Ikke oppgitt i kunngjøringen'),
    },
    {
      id: 'prosedyre',
      label: 'Prosedyre',
      ok: !!text(dossier.procedure),
      blocking: false,
      detail: text(dossier.procedure) || 'Ikke oppgitt i kunngjøringen',
    },
    {
      id: 'espd',
      label: 'Egenerklæring (ESPD)',
      ok: dossier.espd === true,
      blocking: false,
      detail: dossier.espd === true ? 'Egenerklæring brukes i konkurransen' : 'Ikke oppgitt — avklar om ESPD kreves',
    },
    {
      id: 'innlevering',
      label: 'Innlevering',
      ok: !!text(dossier.electronicSubmission) || !!text(dossier.documentsUrl),
      blocking: false,
      detail: text(dossier.electronicSubmission) || (dossier.documentsUrl ? 'Dokumentene ligger på innleveringsportalen' : 'Ikke oppgitt'),
    },
  ];
}

export function executionBlockers(bid, now = new Date()) {
  const missing = [];
  const strategy = normalizeStrategy(bid?.strategy);
  for (const item of STRATEGY_ITEMS) {
    if (!strategy[item.id]) missing.push(item.label);
  }
  for (const check of regulatoryChecks(bid, now)) {
    if (check.blocking && !check.ok) missing.push(`${check.label}: ${check.detail}`);
  }
  return missing;
}

export function markSubmitted(state, bidId) {
  const bid = bidById(state, bidId);
  if (!bid) return fail(state, 'Tilbudsarbeidet finnes ikke.');
  if (bid.stage === 'levert') return fail(state, 'Tilbudet er allerede levert.');
  if (bid.stage === 'kontrakt' || bid.stage === 'tapt' || bid.stage === 'trukket') {
    return fail(state, 'Konkurransen er avsluttet og kan ikke markeres som levert.');
  }
  if (bid.stage !== 'planlegging' && bid.stage !== 'gjennomforing') {
    return fail(state, 'Bare pågående tilbudsarbeid kan markeres som levert.');
  }
  return ok(record(replaceBid(state, bidId, {
    ...bid,
    stage: 'levert',
    submittedAt: new Date().toISOString(),
  }), {
    bidId,
    action: 'tilbud-levert',
    detail: bid.title,
  }));
}

export function toggleStrategy(state, bidId, itemId) {
  const bid = bidById(state, bidId);
  if (!bid) return fail(state, 'Tilbudsarbeidet finnes ikke.');
  if (!STRATEGY_IDS.has(itemId)) return fail(state, 'Ukjent punkt i tilbudsstrategien.');
  if (bid.stage === 'levert' || bid.stage === 'kontrakt' || bid.stage === 'tapt' || bid.stage === 'trukket') {
    return fail(state, 'Strategien er låst fordi konkurransen er avsluttet.');
  }
  const strategy = { ...normalizeStrategy(bid.strategy), [itemId]: !normalizeStrategy(bid.strategy)[itemId] };
  const item = STRATEGY_ITEMS.find((row) => row.id === itemId);
  return ok(record(replaceBid(state, bidId, { ...bid, strategy }), {
    bidId,
    action: strategy[itemId] ? 'strategi-bekreftet' : 'strategi-opphevet',
    detail: item.label,
  }));
}

export function openExecution(state, bidId, now = new Date()) {
  const bid = bidById(state, bidId);
  if (!bid) return fail(state, 'Tilbudsarbeidet finnes ikke.');
  if (bid.stage === 'gjennomforing') return fail(state, 'Gjennomføringen er allerede startet.');
  if (bid.stage !== 'planlegging') return fail(state, 'Konkurransen er avsluttet og kan ikke åpnes på nytt.');
  const missing = executionBlockers(bid, now);
  if (missing.length) return fail(state, missing[0]);
  return ok(record(replaceBid(state, bidId, { ...bid, stage: 'gjennomforing' }), {
    bidId,
    action: 'gjennomforing-startet',
    detail: bid.title,
  }));
}

function buildMilestones(start, end, now = new Date()) {
  const span = start && end ? daysBetween(start, end) : null;
  const today = todayIso(now);
  const due = {
    signert: start || '',
    oppstart: start || '',
    delfaktura: span != null && span >= 0 ? addDays(start, Math.round(span / 2)) : '',
    overlevering: end || '',
    sluttfaktura: end || '',
  };
  return DEFAULT_MILESTONES.map((item) => {
    const when = due[item.key] || '';
    const historical = item.key === 'signert' || (item.key === 'oppstart' && when && when <= today);
    return {
      id: `ms_${item.key}`,
      key: item.key,
      title: item.title,
      due: when,
      status: historical && when && when <= today ? 'utfort' : 'planlagt',
      owner: '',
    };
  });
}

function parseAmount(value) {
  const raw = text(value).replace(/\s/g, '').replace(',', '.');
  if (!raw) return NaN;
  return Number(raw);
}

export function awardContract(state, bidId, input) {
  const bid = bidById(state, bidId);
  if (!bid) return fail(state, 'Tilbudsarbeidet finnes ikke.');
  if (bid.stage === 'tapt' || bid.stage === 'trukket') {
    return fail(state, 'Konkurransen er avsluttet uten kontrakt.');
  }
  if (bid.stage !== 'gjennomforing' && bid.stage !== 'levert') {
    return fail(state, 'Fullfør tilbudsstrategien og start gjennomføring før kontrakten registreres.');
  }
  if ((state.contracts || []).some((row) => row.bidId === bidId && row.status !== 'avsluttet')) {
    return fail(state, 'Kontrakten er allerede registrert.');
  }
  const value = parseAmount(input?.value);
  if (!(value > 0)) return fail(state, 'Kontraktssum må være større enn null.');
  const start = input?.start ? isoDate(input.start) : '';
  const end = input?.end ? isoDate(input.end) : '';
  if (text(input?.start) && !start) return fail(state, 'Startdato må være på formen ÅÅÅÅ-MM-DD.');
  if (text(input?.end) && !end) return fail(state, 'Sluttdato må være på formen ÅÅÅÅ-MM-DD.');
  if (start && end && dayNumber(end) < dayNumber(start)) {
    return fail(state, 'Sluttdato kan ikke være før oppstart.');
  }
  const claimed = claimContractNumbers(state.contracts, {
    systemId: input?.systemId,
    oppdragId: input?.oppdragId,
    customerId: input?.customerId,
    buyer: text(bid.buyer),
  });
  if (!claimed.ok) return fail(state, claimed.error);
  const contract = {
    id: createId('kon'),
    bidId,
    source: 'tildeling',
    noticeId: text(bid.noticeId),
    title: bid.title,
    buyer: text(bid.buyer),
    supplier: '',
    projectName: text(bid.title),
    description: '',
    address: '',
    kind: 'oppdrag',
    parentId: '',
    customerId: '',
    value,
    currency: 'NOK',
    start,
    end,
    status: 'aktiv',
    projectId: '',
    milestones: buildMilestones(start, end),
    deliveries: [],
    createdAt: new Date().toISOString(),
    fields: emptyCoverFields(),
    documents: [],
    indexDraft: null,
    indeksCaseId: '',
    renewal: normalizeRenewal(null),
    options: [],
    systemId: claimed.systemId,
    oppdragId: claimed.oppdragId,
  };
  const next = record(replaceBid(state, bidId, { ...bid, stage: 'kontrakt' }), {
    bidId,
    contractId: contract.id,
    action: 'kontrakt-registrert',
    detail: `${bid.title} · ${value} kr`,
  });
  return ok({ ...next, contracts: [contract, ...(next.contracts || [])] });
}

export function markOutcome(state, bidId, outcome) {
  const bid = bidById(state, bidId);
  if (!bid) return fail(state, 'Tilbudsarbeidet finnes ikke.');
  if (outcome !== 'tapt' && outcome !== 'trukket') return fail(state, 'Ugyldig avslutning.');
  if (bid.stage === 'kontrakt') return fail(state, 'Kontrakten må avsluttes før konkurransen kan trekkes.');
  if (bid.stage === 'tapt' || bid.stage === 'trukket') return fail(state, 'Konkurransen er allerede avsluttet.');
  return ok(record(replaceBid(state, bidId, { ...bid, stage: outcome }), {
    bidId,
    action: outcome === 'tapt' ? 'tilbud-tapt' : 'tilbud-trukket',
    detail: bid.title,
  }));
}

export function setMilestoneStatus(state, contractId, milestoneId, status) {
  const contract = contractById(state, contractId);
  if (!contract) return fail(state, 'Kontrakten finnes ikke.');
  if (contract.status === 'avsluttet') return fail(state, 'Kontrakten er avsluttet.');
  if (status !== 'planlagt' && status !== 'utfort') return fail(state, 'Ukjent milepælstatus.');
  const milestone = contract.milestones.find((row) => row.id === milestoneId);
  if (!milestone) return fail(state, 'Milepælen finnes ikke.');
  const milestones = contract.milestones.map((row) => (row.id === milestoneId ? { ...row, status } : row));
  return ok(record(replaceContract(state, contractId, { ...contract, milestones }), {
    bidId: contract.bidId,
    contractId,
    action: status === 'utfort' ? 'milepael-utfort' : 'milepael-apnet',
    detail: milestone.title,
  }));
}

export function setMilestoneDue(state, contractId, milestoneId, due) {
  const contract = contractById(state, contractId);
  if (!contract) return fail(state, 'Kontrakten finnes ikke.');
  if (contract.status === 'avsluttet') return fail(state, 'Kontrakten er avsluttet.');
  const milestone = contract.milestones.find((row) => row.id === milestoneId);
  if (!milestone) return fail(state, 'Milepælen finnes ikke.');
  const nextDue = text(due) ? isoDate(due) : '';
  if (text(due) && !nextDue) return fail(state, 'Dato må være på formen ÅÅÅÅ-MM-DD.');
  const milestones = contract.milestones.map((row) => (row.id === milestoneId ? { ...row, due: nextDue } : row));
  return ok(replaceContract(state, contractId, { ...contract, milestones }));
}

export function addDelivery(state, contractId, input) {
  const contract = contractById(state, contractId);
  if (!contract) return fail(state, 'Kontrakten finnes ikke.');
  if (contract.status === 'avsluttet') return fail(state, 'Kontrakten er avsluttet.');
  const title = text(input?.title);
  if (!title) return fail(state, 'Leveransen trenger en beskrivelse.');
  const due = text(input?.due) ? isoDate(input.due) : '';
  if (text(input?.due) && !due) return fail(state, 'Dato må være på formen ÅÅÅÅ-MM-DD.');
  const delivery = { id: createId('lev'), title, due, status: 'avtalt', note: text(input?.note) };
  return ok(record(replaceContract(state, contractId, {
    ...contract,
    deliveries: [...contract.deliveries, delivery],
  }), {
    bidId: contract.bidId,
    contractId,
    action: 'leveranse-avtalt',
    detail: title,
  }));
}

export function setDeliveryStatus(state, contractId, deliveryId, status) {
  const contract = contractById(state, contractId);
  if (!contract) return fail(state, 'Kontrakten finnes ikke.');
  if (contract.status === 'avsluttet') return fail(state, 'Kontrakten er avsluttet.');
  if (status !== 'avtalt' && status !== 'levert') return fail(state, 'Ukjent leveransestatus.');
  const delivery = contract.deliveries.find((row) => row.id === deliveryId);
  if (!delivery) return fail(state, 'Leveransen finnes ikke.');
  const deliveries = contract.deliveries.map((row) => (row.id === deliveryId ? { ...row, status } : row));
  return ok(record(replaceContract(state, contractId, { ...contract, deliveries }), {
    bidId: contract.bidId,
    contractId,
    action: status === 'levert' ? 'leveranse-levert' : 'leveranse-apnet',
    detail: delivery.title,
  }));
}

export function closeContract(state, contractId) {
  const contract = contractById(state, contractId);
  if (!contract) return fail(state, 'Kontrakten finnes ikke.');
  if (contract.status === 'avsluttet') return fail(state, 'Kontrakten er allerede avsluttet.');
  if (contract.milestones.some((row) => row.status !== 'utfort')) {
    return fail(state, 'Alle milepæler må være utført før kontrakten avsluttes.');
  }
  if (contract.deliveries.some((row) => row.status !== 'levert')) {
    return fail(state, 'Alle leveranser må være levert før kontrakten avsluttes.');
  }
  return ok(record(replaceContract(state, contractId, { ...contract, status: 'avsluttet' }), {
    bidId: contract.bidId,
    contractId,
    action: 'kontrakt-avsluttet',
    detail: contract.title,
  }));
}

export function registerDirectContract(state, input) {
  const title = text(input?.title);
  if (!title) return fail(state, 'Avtalen trenger en tittel.');
  const rawValue = input?.value == null || input?.value === '' ? 0 : parseAmount(input.value);
  if (!Number.isFinite(rawValue) || rawValue < 0) return fail(state, 'Kontraktssum må være et tall.');
  const start = input?.start ? isoDate(input.start) : '';
  const end = input?.end ? isoDate(input.end) : '';
  if (text(input?.start) && !start) return fail(state, 'Startdato må være på formen ÅÅÅÅ-MM-DD.');
  if (text(input?.end) && !end) return fail(state, 'Sluttdato må være på formen ÅÅÅÅ-MM-DD.');
  if (start && end && dayNumber(end) < dayNumber(start)) {
    return fail(state, 'Sluttdato kan ikke være før oppstart.');
  }
  const kind = normalizeKind(input?.kind);
  const parentId = text(input?.parentId);
  const parent = parentId ? contractById(state, parentId) : null;
  if (parentId && !parent) return fail(state, 'Tilknyttet avtale finnes ikke.');
  if ((kind === 'avrop' || kind === 'endring') && !parent) {
    return fail(state, 'Avrop og endringer må knyttes til en rammeavtale eller oppdragsavtale.');
  }
  const fields = normalizeFields({
    ...(input?.fields || {}),
    honorar: input?.honorar != null ? input.honorar : input?.fields?.honorar,
    place: input?.place != null ? input.place : input?.fields?.place,
    address: input?.address != null ? input.address : input?.fields?.address,
    description: input?.description != null ? input.description : input?.fields?.description,
    poNumber: input?.poNumber != null ? input.poNumber : input?.fields?.poNumber,
    orgnr: input?.orgnr != null ? input.orgnr : input?.fields?.orgnr,
    supplierOrgnr: input?.supplierOrgnr != null ? input.supplierOrgnr : input?.fields?.supplierOrgnr,
    personnummer: input?.personnummer != null ? input.personnummer : input?.fields?.personnummer,
    contactName: input?.contactName != null ? input.contactName : input?.fields?.contactName,
    phone: input?.phone != null ? input.phone : input?.fields?.phone,
    email: input?.email != null ? input.email : input?.fields?.email,
    reference: input?.reference != null ? input.reference : input?.fields?.reference,
    standard: input?.standard != null ? input.standard : input?.fields?.standard,
    indexId: input?.indexId != null ? input.indexId : input?.fields?.indexId,
    surchargePercent: input?.surchargePercent != null ? input.surchargePercent : input?.fields?.surchargePercent,
    contractDate: input?.contractDate != null ? input.contractDate : input?.fields?.contractDate,
    projectName: input?.projectName || input?.fields?.projectName,
  });
  const customerId = text(input?.customerId) || text(parent?.customerId);
  const buyer = text(input?.buyer) || text(parent?.buyer);
  const claimed = claimContractNumbers(state.contracts, {
    systemId: input?.systemId,
    oppdragId: input?.oppdragId,
    customerId,
    buyer,
  });
  if (!claimed.ok) return fail(state, claimed.error);
  if (!fields.reference) fields.reference = claimed.oppdragId;
  const contract = {
    id: createId('kon'),
    bidId: '',
    source: 'direkte',
    noticeId: '',
    title,
    buyer,
    supplier: text(input?.supplier) || text(fields.supplier) || text(parent?.supplier),
    projectName: text(input?.projectName) || title,
    description: text(input?.description) || fields.description,
    address: text(input?.address) || fields.address,
    kind,
    parentId: parent ? parent.id : '',
    customerId,
    value: rawValue,
    currency: text(input?.currency) || 'NOK',
    start: start || (kind === 'avrop' ? '' : text(parent?.start)),
    end: end || (kind === 'avrop' ? '' : text(parent?.end)),
    status: 'aktiv',
    projectId: text(input?.projectId),
    milestones: buildMilestones(start, end),
    deliveries: [],
    createdAt: new Date().toISOString(),
    fields,
    documents: normalizeDocuments(input?.documents),
    indexDraft: normalizeIndexDraft(input?.indexDraft),
    indeksCaseId: text(input?.indeksCaseId),
    renewal: normalizeRenewal(input?.renewal || {
      type: input?.renewalType,
      until: input?.renewalUntil,
      noticeDays: input?.renewalNoticeDays,
    }),
    options: normalizeOptions(input?.options),
    systemId: claimed.systemId,
    oppdragId: claimed.oppdragId,
  };
  const next = record(state, {
    bidId: '',
    contractId: contract.id,
    action: 'avtale-registrert',
    detail: `${title}${contract.buyer ? ` · ${contract.buyer}` : ''}`,
  });
  return ok({ ...next, contracts: [contract, ...(next.contracts || [])] });
}

export function updateContractDetails(state, contractId, input) {
  const contract = contractById(state, contractId);
  if (!contract) return fail(state, 'Kontrakten finnes ikke.');
  if (contract.status === 'avsluttet') return fail(state, 'Kontrakten er avsluttet.');
  const title = text(input?.title) || contract.title;
  const start = input?.start != null ? (text(input.start) ? isoDate(input.start) : '') : contract.start;
  const end = input?.end != null ? (text(input.end) ? isoDate(input.end) : '') : contract.end;
  if (input?.start && text(input.start) && !start) return fail(state, 'Startdato må være på formen ÅÅÅÅ-MM-DD.');
  if (input?.end && text(input.end) && !end) return fail(state, 'Sluttdato må være på formen ÅÅÅÅ-MM-DD.');
  const rawValue = input?.value == null || input?.value === '' ? contract.value : parseAmount(input.value);
  if (!Number.isFinite(rawValue) || rawValue < 0) return fail(state, 'Kontraktssum må være et tall.');
  const parentId = input?.parentId != null ? text(input.parentId) : contract.parentId;
  if (parentId && parentId !== contract.id && !contractById(state, parentId)) {
    return fail(state, 'Tilknyttet avtale finnes ikke.');
  }
  const next = {
    ...contract,
    title,
    buyer: input?.buyer != null ? text(input.buyer) : contract.buyer,
    supplier: input?.supplier != null ? text(input.supplier) : contract.supplier,
    projectName: input?.projectName != null ? text(input.projectName) : contract.projectName,
    description: input?.description != null ? text(input.description).slice(0, 400) : contract.description,
    address: input?.address != null ? text(input.address).slice(0, 160) : contract.address,
    kind: input?.kind != null ? normalizeKind(input.kind) : contract.kind,
    parentId: parentId === contract.id ? '' : parentId,
    customerId: input?.customerId != null ? text(input.customerId) : contract.customerId,
    value: rawValue,
    start,
    end,
    projectId: input?.projectId != null ? text(input.projectId) : contract.projectId,
    fields: input?.fields != null ? normalizeFields(input.fields) : contract.fields,
    documents: input?.documents != null ? normalizeDocuments(input.documents) : contract.documents,
    indexDraft: input?.indexDraft !== undefined ? normalizeIndexDraft(input.indexDraft) : contract.indexDraft,
    regulations: input?.regulations != null ? normalizeRegulations(input.regulations) : (contract.regulations || []),
    indeksCaseId: input?.indeksCaseId != null ? text(input.indeksCaseId) : contract.indeksCaseId,
    renewal: input?.renewal != null || input?.renewalType != null
      ? normalizeRenewal(input?.renewal || {
        type: input?.renewalType,
        until: input?.renewalUntil,
        noticeDays: input?.renewalNoticeDays,
      })
      : contract.renewal,
    options: input?.options != null ? normalizeOptions(input.options) : contract.options,
  };
  const claimed = claimContractNumbers(state.contracts, {
    systemId: input?.systemId != null ? input.systemId : next.systemId,
    oppdragId: input?.oppdragId != null ? input.oppdragId : next.oppdragId,
    customerId: next.customerId,
    buyer: next.buyer,
  }, contract.id);
  if (!claimed.ok) return fail(state, claimed.error);
  next.systemId = claimed.systemId;
  next.oppdragId = claimed.oppdragId;
  return ok(record(replaceContract(state, contractId, next), {
    bidId: contract.bidId,
    contractId,
    action: 'avtale-oppdatert',
    detail: title,
  }));
}

export function setContractOptions(state, contractId, options) {
  const contract = contractById(state, contractId);
  if (!contract) return fail(state, 'Kontrakten finnes ikke.');
  if (contract.status === 'avsluttet') return fail(state, 'Kontrakten er avsluttet.');
  return ok(replaceContract(state, contractId, { ...contract, options: normalizeOptions(options) }));
}

/** Knytter originalfil (PDF-URL) til et eksisterende avtaledokument, uten å slette OCR-tekst. */
export function attachContractDocumentFile(state, contractId, documentId, file) {
  const contract = contractById(state, contractId);
  if (!contract) return fail(state, 'Kontrakten finnes ikke.');
  const docs = Array.isArray(contract.documents) ? contract.documents : [];
  const current = docs.find((row) => row.id === documentId);
  if (!current) return fail(state, 'Dokumentet finnes ikke.');
  const url = text(file?.url);
  if (!url) return fail(state, 'Mangler fil-URL.');
  const nextDocs = docs.map((row) => (
    row.id === documentId
      ? {
        ...row,
        name: text(file?.name) || row.name,
        mimeType: text(file?.mimeType) || row.mimeType || 'application/pdf',
        url,
        storagePath: text(file?.storagePath) || row.storagePath || '',
        size: Number(file?.size) || row.size || 0,
        dataUrl: '',
        uri: '',
      }
      : row
  ));
  return ok(record(replaceContract(state, contractId, {
    ...contract,
    documents: normalizeDocuments(nextDocs),
  }), {
    bidId: contract.bidId,
    contractId,
    action: 'avtale-dokument-fil',
    detail: text(file?.name) || current.name,
  }));
}

/** Legger til én eller flere avtalefiler (vedlegg) på en eksisterende kontrakt. */
export function addContractDocuments(state, contractId, files) {
  const contract = contractById(state, contractId);
  if (!contract) return fail(state, 'Kontrakten finnes ikke.');
  const incoming = (Array.isArray(files) ? files : []).filter((file) => text(file?.url) || text(file?.dataUrl) || text(file?.text));
  if (!incoming.length) return fail(state, 'Ingen filer å legge til.');
  const existing = Array.isArray(contract.documents) ? contract.documents : [];
  const stamp = Date.now();
  const rows = incoming.map((file, index) => ({
    id: text(file?.id) || `dok-${stamp}-${index}`,
    name: text(file?.name) || `Dokument ${existing.length + index + 1}`,
    text: text(file?.text),
    role: existing.length || index ? 'vedlegg' : 'hoved',
    mimeType: text(file?.mimeType) || 'application/pdf',
    interpreted: !!text(file?.text),
    dataUrl: text(file?.dataUrl),
    url: text(file?.url),
    uri: text(file?.uri),
    storagePath: text(file?.storagePath),
    size: Number(file?.size) || 0,
  }));
  const names = rows.map((row) => row.name).filter(Boolean);
  return ok(record(replaceContract(state, contractId, {
    ...contract,
    documents: normalizeDocuments([...existing, ...rows]),
  }), {
    bidId: contract.bidId,
    contractId,
    action: 'avtale-dokumenter-lagt-til',
    detail: names.length === 1 ? names[0] : `${names.length} dokumenter`,
  }));
}

export function exerciseOption(state, contractId, optionId, exercised = true) {
  const contract = contractById(state, contractId);
  if (!contract) return fail(state, 'Kontrakten finnes ikke.');
  if (contract.status === 'avsluttet') return fail(state, 'Kontrakten er avsluttet.');
  const option = (contract.options || []).find((row) => row.id === optionId);
  if (!option) return fail(state, 'Opsjonen finnes ikke.');
  const options = contract.options.map((row) => (row.id === optionId ? { ...row, exercised: !!exercised } : row));
  return ok(record(replaceContract(state, contractId, { ...contract, options }), {
    bidId: contract.bidId,
    contractId,
    action: exercised ? 'opsjon-utlost' : 'opsjon-apnet',
    detail: option.title,
  }));
}

export function linkProject(state, contractId, projectId) {
  const contract = contractById(state, contractId);
  if (!contract) return fail(state, 'Kontrakten finnes ikke.');
  const id = text(projectId);
  if (!id) return fail(state, 'Prosjektet mangler.');
  return ok(record(replaceContract(state, contractId, { ...contract, projectId: id }), {
    bidId: contract.bidId,
    contractId,
    action: 'prosjekt-koblet',
    detail: contract.title,
  }));
}

export function contractAlerts(contracts, now = new Date()) {
  const today = dayNumber(todayIso(now));
  const rows = [];
  for (const contract of Array.isArray(contracts) ? contracts : []) {
    if (!contract || contract.status === 'avsluttet') continue;
    const items = [
      ...(contract.milestones || []).map((row) => ({ ...row, kind: 'milepæl' })),
      ...(contract.deliveries || []).map((row) => ({ ...row, kind: 'leveranse' })),
    ];
    for (const item of items) {
      const done = item.status === 'utfort' || item.status === 'levert';
      if (done || !item.due) continue;
      if (item.key === 'signert') continue;
      const due = dayNumber(item.due);
      const distance = due - today;
      if (distance < 0) {
        rows.push({ level: 'forfalt', kind: item.kind, contractId: contract.id, title: item.title, due: item.due, contractTitle: contract.title });
      } else if (distance <= 14) {
        rows.push({ level: 'snart', kind: item.kind, contractId: contract.id, title: item.title, due: item.due, contractTitle: contract.title });
      }
    }
  }
  rows.sort((a, b) => {
    if (a.level !== b.level) return a.level === 'forfalt' ? -1 : 1;
    return a.due.localeCompare(b.due);
  });
  return rows;
}
