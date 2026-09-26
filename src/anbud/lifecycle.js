/** Tilbudsstrategi, kravsjekk, kontrakt og logg for en utførende bedrift. */

export const STAGES = ['planlegging', 'gjennomforing', 'kontrakt', 'tapt', 'trukket'];

export const STAGE_LABELS = {
  planlegging: 'Planlegging',
  gjennomforing: 'Gjennomføring',
  kontrakt: 'Kontrakt',
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
  { key: 'oppstart', title: 'Oppstart på byggeplass' },
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

function normalizeContract(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = text(raw.id);
  const bidId = text(raw.bidId);
  const title = text(raw.title);
  if (!id || !bidId || !title) return null;
  const value = Number(raw.value);
  return {
    id,
    bidId,
    noticeId: text(raw.noticeId),
    title,
    buyer: text(raw.buyer),
    value: Number.isFinite(value) ? value : 0,
    currency: text(raw.currency) || 'NOK',
    start: isoDate(raw.start),
    end: isoDate(raw.end),
    status: raw.status === 'avsluttet' ? 'avsluttet' : 'aktiv',
    projectId: text(raw.projectId),
    milestones: normalizeMilestones(raw.milestones),
    deliveries: normalizeDeliveries(raw.deliveries),
    createdAt: text(raw.createdAt),
  };
}

export function normalizeContracts(input) {
  if (!Array.isArray(input)) return [];
  return input.map(normalizeContract).filter(Boolean);
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
      detail: hasDocuments ? 'Grunnlaget er hentet inn' : 'Hent fillisten før gjennomføring starter',
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

export function toggleStrategy(state, bidId, itemId) {
  const bid = bidById(state, bidId);
  if (!bid) return fail(state, 'Tilbudsarbeidet finnes ikke.');
  if (!STRATEGY_IDS.has(itemId)) return fail(state, 'Ukjent punkt i tilbudsstrategien.');
  if (bid.stage === 'kontrakt' || bid.stage === 'tapt' || bid.stage === 'trukket') {
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

function buildMilestones(start, end) {
  const span = start && end ? daysBetween(start, end) : null;
  const due = {
    signert: start || '',
    oppstart: start || '',
    delfaktura: span != null && span >= 0 ? addDays(start, Math.round(span / 2)) : '',
    overlevering: end || '',
    sluttfaktura: end || '',
  };
  return DEFAULT_MILESTONES.map((item) => ({
    id: `ms_${item.key}`,
    key: item.key,
    title: item.title,
    due: due[item.key] || '',
    status: 'planlagt',
    owner: '',
  }));
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
  if (bid.stage !== 'gjennomforing') {
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
  const contract = {
    id: createId('kon'),
    bidId,
    noticeId: text(bid.noticeId),
    title: bid.title,
    buyer: text(bid.buyer),
    value,
    currency: 'NOK',
    start,
    end,
    status: 'aktiv',
    projectId: '',
    milestones: buildMilestones(start, end),
    deliveries: [],
    createdAt: new Date().toISOString(),
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
