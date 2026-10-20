/**
 * Reguleringssaker, kø og prisversjoner.
 * En sak er et eget objekt. Godkjente og sendte saker endres ikke uten ny versjon.
 */

import { modelById, seriesById, standardById } from './catalog.js';
import { draftFromRegisteredContract } from '../economy/fromContract.js';
import {
  calculate,
  contractBasis,
  dateToPeriod,
  lookupIndex,
  parseAmount,
  parseIsoDate,
  periodLabel,
  roundMoney,
} from './engine.js';
import { formatMoney } from './letter.js';
import { honorarPrice } from './priceText.js';
import { effectiveRegulation, frequencyLabel } from './settings.js';
import { earliestRegulationDate, osloDate } from './watch.js';

export const QUEUE_BANDS = [
  { id: 'ma_vurderes', label: 'Må vurderes', tone: 'danger' },
  { id: 'kan_reguleres', label: 'Kan reguleres', tone: 'warn' },
  { id: 'venter_indeks', label: 'Venter på indeks', tone: 'muted' },
  { id: 'kommende', label: 'Kommende', tone: 'brand' },
  { id: 'regulert', label: 'Regulert', tone: 'success' },
  { id: 'alle', label: 'Alle avtaler', tone: 'ink' },
];

export const DESK_FILTERS = [
  { id: 'kan_reguleres', label: 'Kan reguleres', tone: 'warn' },
  { id: 'venter_indeks', label: 'Venter på ny indeks', tone: 'muted' },
  { id: 'oppmerksomhet', label: 'Krever oppmerksomhet', tone: 'danger' },
  { id: 'regulert', label: 'Regulert', tone: 'success' },
];

const FILTER_BANDS = {
  kan_reguleres: ['kan_reguleres', 'ma_vurderes'],
  venter_indeks: ['venter_indeks', 'kommende'],
  regulert: ['regulert'],
};

export function filterIdForBand(band) {
  return Object.keys(FILTER_BANDS).find((id) => FILTER_BANDS[id].includes(band)) || '';
}

export function projectDeactivated(project) {
  const status = text(project?.status).toLowerCase();
  return status === 'arkivert' || status === 'deaktivert' || project?.active === false;
}

export function projectsWithoutAgreement(projects = [], contracts = []) {
  const linked = new Set();
  (contracts || []).forEach((contract) => {
    if (!contract?.id || contract.deletedAt || !contract.projectId) return;
    linked.add(contract.projectId);
  });
  return (projects || [])
    .filter((project) => project?.id && !project.deletedAt && !linked.has(project.id))
    .map((project) => ({
      project,
      group: projectDeactivated(project) ? 'deaktivert' : 'aktiv',
    }))
    .sort((a, b) => text(a.project.number || a.project.name).localeCompare(text(b.project.number || b.project.name), 'nb'));
}

export const CASE_STATUS_LABEL = {
  utkast: 'Utkast',
  klar_til_kontroll: 'Klar til kontroll',
  godkjent: 'Godkjent',
  klar_til_utsending: 'Klar til utsendelse',
  sending: 'Sending pågår',
  sendt: 'Sendt',
  sendefeil: 'Sendefeil',
  trukket: 'Trukket tilbake',
};

const LOCKED = new Set(['godkjent', 'klar_til_utsending', 'sending', 'sendt', 'sendefeil']);
const OPEN = new Set(['utkast', 'klar_til_kontroll', 'godkjent', 'klar_til_utsending', 'sending', 'sendefeil']);
const APPLIED = new Set(['godkjent', 'klar_til_utsending', 'sending', 'sendt', 'sendefeil']);

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function osloStamp(now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Oslo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const get = (type) => parts.find((part) => part.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
  } catch {
    return now.toISOString().slice(0, 19);
  }
}

function actorName(actor) {
  return text(actor?.name || actor?.email || '');
}

function pushAudit(entry, action, actor, now, detail = '') {
  const audit = Array.isArray(entry.audit) ? entry.audit.slice() : [];
  audit.push({
    at: osloStamp(now),
    action,
    by: actorName(actor),
    uid: text(actor?.uid),
    detail: text(detail).slice(0, 400),
  });
  return audit.slice(-80);
}

export function caseIsLocked(entry) {
  return LOCKED.has(entry?.status);
}

export function basisMode(draft) {
  const explicit = text(draft?.terms?.basisMode);
  if (explicit === 'opprinnelig' || explicit === 'forrige') return explicit;
  if (draft?.model === 'ns3405' || draft?.model === 'vektet') return 'opprinnelig';
  return 'forrige';
}

function seriesFrequency(indexId, series) {
  return series?.[indexId]?.frequency || seriesById(indexId)?.frequency || 'quarter';
}

function pointsFor(indexId, series) {
  const rows = series?.[indexId]?.points;
  return Array.isArray(rows) ? rows : [];
}

function agreedPrice(draft) {
  const lines = Array.isArray(draft?.lines) ? draft.lines : [];
  const hourly = lines.find((line) => /time/i.test(`${line?.unit || ''} ${line?.text || ''}`) && parseAmount(line?.rate) != null);
  if (hourly) return parseAmount(hourly.rate);
  const priced = honorarPrice(draft);
  if (priced.amount != null) return priced.amount;
  const first = lines.find((line) => line?.included !== false && parseAmount(line?.rate) != null);
  return first ? parseAmount(first.rate) : null;
}

function nextSlot(iso, frequency) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (frequency === 'year') return `${year + 1}-${match[2]}-01`;
  if (frequency === 'half') {
    if (month <= 6) return `${year}-07-01`;
    return `${year + 1}-01-01`;
  }
  if (frequency === 'quarter') {
    const nextMonth = Math.floor((month - 1) / 3) * 3 + 4;
    if (nextMonth > 12) return `${year + 1}-01-01`;
    return `${year}-${String(nextMonth).padStart(2, '0')}-01`;
  }
  const next = new Date(Date.UTC(year, month, 1));
  return next.toISOString().slice(0, 10);
}

function appliedCases(cases) {
  return (Array.isArray(cases) ? cases : [])
    .filter((row) => row?.id && APPLIED.has(row.status))
    .slice()
    .sort((a, b) => text(a.effectiveFrom).localeCompare(text(b.effectiveFrom)) || text(a.number).localeCompare(text(b.number)));
}

function pointOf(period, value, exact = true) {
  if (!period || !(Number(value) > 0)) return null;
  return { period, value: Number(value), exact: exact !== false, label: periodLabel(period) };
}

export function buildIndexChain({
  draft = {},
  series = null,
  cases = [],
  regulations = [],
} = {}) {
  const indexId = text(draft.indexId);
  const frequency = seriesFrequency(indexId, series);
  const meta = series?.[indexId] || seriesById(indexId) || null;
  const basis = contractBasis(draft);
  const points = pointsFor(indexId, series);
  const wanted = dateToPeriod(basis.date, frequency);
  const found = wanted ? lookupIndex(points, wanted) : null;
  const original = found && found.exact
    ? pointOf(found.period, found.value, true)
    : (found ? pointOf(found.period, found.value, false) : null);
  const price = agreedPrice(draft);
  const applied = appliedCases(cases);
  const lastCase = applied[applied.length - 1] || null;
  const lastReg = [...(Array.isArray(regulations) ? regulations : [])]
    .reverse()
    .find((row) => Number(row?.toIndex) > 0 && text(row.toPeriod));
  const previous = lastCase
    ? pointOf(lastCase.newPeriod || lastCase.toPeriod, lastCase.newIndex ?? lastCase.toIndex, true)
    : (lastReg ? pointOf(lastReg.toPeriod, lastReg.toIndex, true) : original);
  const previousPrice = lastCase
    ? Number(lastCase.newPrice)
    : (lastReg ? Number(lastReg.after) : price);
  const latest = points.length ? points[points.length - 1] : null;
  const previousPeriod = previous?.period || '';
  const nextRaw = latest && (!previousPeriod || latest.period > previousPeriod) ? latest : null;
  const changedSeries = !!(lastCase?.indexId && indexId && lastCase.indexId !== indexId);
  return {
    indexId,
    frequency,
    table: meta?.table || '',
    name: meta?.name || '',
    source: meta?.source || '',
    url: meta?.url || '',
    basisDate: basis.date || '',
    basisKind: basis.kind || '',
    original,
    originalPrice: price,
    previous,
    previousPrice: Number.isFinite(previousPrice) ? previousPrice : null,
    next: nextRaw ? pointOf(nextRaw.period, nextRaw.value, true) : null,
    latest: latest ? pointOf(latest.period, latest.value, true) : null,
    mode: basisMode(draft),
    changedSeries,
    published: !!latest,
    regulatedBefore: !!(lastCase || lastReg),
  };
}

function lastEffectiveFrom(cases, regulations) {
  const applied = appliedCases(cases);
  const last = applied[applied.length - 1];
  if (last?.effectiveFrom) return last.effectiveFrom;
  return '';
}

export function allowedFrom({ draft, cases, regulations, chain }) {
  const frequency = draft?.terms?.frequency || chain?.frequency || 'quarter';
  const done = lastEffectiveFrom(cases, regulations);
  if (done && frequency !== 'once') return nextSlot(done, frequency);
  return earliestRegulationDate(draft) || '';
}

function shareOf(draft) {
  const raw = parseAmount(draft?.sharePercent);
  if (raw == null) return 1;
  return Math.min(100, Math.max(0, raw)) / 100;
}

function moneyMath(price, fromIndex, toIndex, terms, share) {
  if (!(price > 0)) return { ok: false, error: 'Mangler pris som skal reguleres.' };
  if (!(fromIndex > 0) || !(toIndex > 0)) return { ok: false, error: 'Indekstallet må være større enn null.' };
  let ratio = (toIndex - fromIndex) / fromIndex;
  const threshold = parseAmount(terms?.thresholdPercent);
  if (threshold != null && threshold > 0 && Math.abs(ratio) * 100 < threshold) {
    return {
      ok: true,
      ratio,
      addition: 0,
      newPrice: roundMoney(price),
      suppressed: 'terskel',
      capped: false,
    };
  }
  let capped = false;
  const cap = parseAmount(terms?.capPercent);
  if (cap != null && cap > 0 && Math.abs(ratio) * 100 > cap) {
    ratio = Math.sign(ratio) * (cap / 100);
    capped = true;
  }
  let addition = roundMoney(price * share * ratio);
  if (terms?.roundToKrone) addition = Math.round(addition);
  return {
    ok: true,
    ratio,
    addition,
    newPrice: roundMoney(price + addition),
    suppressed: '',
    capped,
  };
}

function regulationResult(draft, chain, math, basisPoint, nextPoint, warnings) {
  const model = modelById(draft.model) || { id: draft.model || '', label: draft.model || '', formula: '' };
  const standard = standardById(draft.standard) || { id: draft.standard || '', label: draft.standard || '' };
  const share = shareOf(draft);
  const hourly = /time/i.test(`${draft.lines?.[0]?.unit || ''} ${draft.lines?.[0]?.text || ''} ${draft.honorar || ''}`)
    || (draft.lines || []).some((line) => /time/i.test(`${line.unit || ''} ${line.text || ''}`));
  return {
    ok: true,
    provisional: nextPoint?.exact === false,
    error: '',
    warnings,
    model,
    standard,
    basisKind: chain.basisKind,
    basisDate: chain.basisDate,
    regulationDate: parseIsoDate(draft.regulationDate) || osloDate(),
    noticeDate: parseIsoDate(draft.noticeDate) || osloDate(),
    share,
    vatPercent: 0,
    series: {
      id: chain.indexId,
      name: chain.name,
      table: chain.table,
      codes: seriesById(chain.indexId)?.codes || [],
      basis: seriesById(chain.indexId)?.basis || '',
      source: chain.source || 'SSB Statistikkbanken',
      url: chain.url || '',
      frequency: chain.frequency,
    },
    basisPoint,
    regulationPoint: nextPoint,
    rows: [{
      kind: 'sats',
      text: hourly ? 'Timepris' : 'Pris',
      quantity: 1,
      unit: hourly ? 'time' : 'RS',
      rate: math.price,
      base: math.price,
      period: nextPoint.period,
      index: nextPoint.value,
      basisValue: basisPoint.value,
      basisPeriod: basisPoint.period,
      change: math.ratio,
      addition: math.addition,
      regulated: math.newPrice,
      newRate: math.newPrice,
    }],
    baseSum: math.price,
    addition: math.addition,
    regulated: math.newPrice,
    vat: 0,
    payable: math.addition,
    changePercent: math.ratio * 100,
    mode: chain.mode,
    original: chain.original,
    previous: chain.previous,
    hourly,
  };
}

/**
 * Beregner neste regulering. Gjetter aldri en indeksverdi.
 * Opprinnelig indeks, forrige beregningsindeks og ny indeks holdes fra hverandre.
 */
export function computeRegulation({
  draft = {},
  series = null,
  cases = [],
  regulations = [],
  period = '',
} = {}) {
  const chain = buildIndexChain({ draft, series, cases, regulations });
  if (draft.model === 'vektet') {
    const live = calculate(draft, series || {});
    if (!live.ok) return { ...live, provisional: false, chain, mode: 'opprinnelig' };
    return {
      ...live,
      provisional: live.regulationPoint?.exact === false,
      chain,
      mode: 'opprinnelig',
      warnings: [
        ...(live.warnings || []),
        'Vektet modell bruker delindeksene i avtalen, ikke en annen SSB-tabell.',
      ],
    };
  }
  const warnings = [];
  if (draft.regulationExcluded && !draft.overrideExclusion) {
    return { ok: false, provisional: false, error: 'Avtalen har ikke indeksregulering.', warnings, chain };
  }
  if (chain.changedSeries && !draft.seriesConfirmed) {
    return {
      ok: false,
      provisional: false,
      error: 'Avtalt indeksserie er endret siden forrige regulering. Det krever en dokumentert avklaring før ny beregning.',
      warnings,
      chain,
    };
  }
  if (!chain.indexId) {
    return { ok: false, provisional: false, error: 'Avtalen mangler indeksserie.', warnings, chain };
  }
  if (!pointsFor(chain.indexId, series).length) {
    return { ok: false, provisional: false, error: 'Indeksserien er ikke hentet fra SSB.', warnings, chain };
  }
  const mode = chain.mode;
  const basisPoint = mode === 'opprinnelig' ? chain.original : chain.previous;
  const price = mode === 'opprinnelig' ? chain.originalPrice : chain.previousPrice;
  if (!basisPoint) {
    return { ok: false, provisional: false, error: 'Mangler beregningsindeks. Opprinnelig indeks og forrige indeks er ikke det samme grunnlaget.', warnings, chain };
  }
  if (basisPoint.exact === false) {
    warnings.push(`Indeks for avtalt periode er ikke publisert. Nærmeste tidligere tall er ${basisPoint.label}. Beregningen er foreløpig.`);
  }
  const points = pointsFor(chain.indexId, series);
  let nextPoint = chain.next;
  if (period) {
    const exact = points.find((row) => row.period === period);
    if (!exact) {
      return {
        ok: false,
        provisional: true,
        error: `Indeks for ${periodLabel(period) || period} er ikke publisert.`,
        warnings,
        chain,
      };
    }
    nextPoint = pointOf(exact.period, exact.value, true);
  }
  if (!nextPoint) {
    return {
      ok: false,
      provisional: true,
      error: 'Ny indeks for neste regulering er ikke publisert.',
      warnings,
      chain,
    };
  }
  if (chain.previous?.period && nextPoint.period <= chain.previous.period && mode === 'forrige') {
    return { ok: false, provisional: false, error: 'Perioden er allerede brukt i en tidligere regulering.', warnings, chain };
  }
  const surcharge = parseAmount(draft.surchargePercent);
  if (surcharge && !draft.terms?.includeSurcharge) {
    warnings.push(`Påslag på ${surcharge} % inngår ikke i reguleringsgrunnlaget.`);
  }
  const math = moneyMath(price, basisPoint.value, nextPoint.value, draft.terms || {}, shareOf(draft));
  if (!math.ok) return { ...math, provisional: false, warnings, chain };
  if (math.suppressed === 'terskel') warnings.push(`Endringen er under terskelen på ${draft.terms.thresholdPercent} %.`);
  if (math.capped) warnings.push(`Endringen er begrenset til taket på ${draft.terms.capPercent} %.`);
  if (math.addition < 0) warnings.push('Indeksen har falt. Reguleringen er en reduksjon.');
  if (math.addition === 0 && !math.suppressed) warnings.push('Indeksen er uendret.');
  if (mode === 'opprinnelig' && chain.previous && chain.original && chain.previous.period !== chain.original.period) {
    warnings.push(`Beregningen følger avtalens opprinnelige indeks ${chain.original.label} (${formatIndexValue(chain.original.value)}), ikke siste reguleringsindeks.`);
  }
  if (mode === 'forrige' && chain.original && chain.previous && chain.previous.period !== chain.original.period) {
    warnings.push(`Beregningen bruker forrige reguleringsindeks ${chain.previous.label}, ikke den opprinnelige avtaleindeksen ${chain.original.label}.`);
  }
  warnings.push('Beløpene er eks. mva.');
  return {
    ...regulationResult(draft, chain, { ...math, price }, basisPoint, nextPoint, warnings),
    chain,
  };
}

function formatIndexValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return number.toFixed(1).replace('.', ',');
}

export function missingTerms(draft, chain) {
  const missing = [];
  if (draft?.regulationExcluded && !draft?.overrideExclusion) return missing;
  if (!draft?.indexId) missing.push('Avtalt indeksserie');
  if (!chain?.basisDate) missing.push('Avtaledato, tilbudsdato eller tilbudsfrist');
  if (!(chain?.originalPrice > 0)) missing.push('Avtalt pris eks. mva');
  if (draft?.indexId && chain?.published && !chain?.original) missing.push('Opprinnelig indeks for avtaleperioden');
  if (!draft?.model) missing.push('Reguleringsmodell');
  return missing;
}

export function classifyContract({
  contract,
  contracts = [],
  series = null,
  today = '',
} = {}) {
  const day = parseIsoDate(today) || osloDate();
  const draft = draftFromRegisteredContract(contract || {}, { contracts });
  const settings = effectiveRegulation(contract, contracts);
  const cases = Array.isArray(contract?.indexCases) ? contract.indexCases : [];
  const regulations = Array.isArray(contract?.regulations) ? contract.regulations : [];
  const chain = buildIndexChain({ draft, series, cases, regulations });
  const allowed = allowedFrom({ draft, cases, regulations, chain });
  const missing = missingTerms(draft, chain);
  const failed = cases.find((row) => row.status === 'sendefeil');
  const control = cases.find((row) => row.status === 'klar_til_kontroll');
  const draftCase = cases.find((row) => row.status === 'utkast');
  let band = 'regulert';
  let label = 'Regulert';
  let reason = 'Siste periode er behandlet.';
  let attention = false;

  const registered = !!(
    draft.indexId
    || draft.regulationExcluded
    || (contract?.regulations || []).length
    || (contract?.indexCases || []).length
    || contract?.fields?.regulationFrequency
    || contract?.fields?.firstRegulationDate
    || contract?.indexDraft?.indexId
  );
  if (!settings.regulatesHere || (draft.regulationExcluded && !draft.overrideExclusion) || !registered) {
    band = 'ikke_aktuell';
    label = 'Ikke aktuell';
    reason = draft.regulationExcluded
      ? 'Avtalen har ikke indeksregulering.'
      : (!settings.regulatesHere
        ? (contract?.kind === 'rammeavtale'
          ? 'Reguleringen skjer på avropene.'
          : 'Reguleringen skjer på rammeavtalen.')
        : 'Indeksregulering er ikke registrert på avtalen.');
  } else if (missing.length) {
    band = 'ma_vurderes';
    label = 'Må vurderes';
    reason = `Mangler ${missing.join(', ')}.`;
    attention = true;
  } else if (draft?.terms?.frequency === 'once' && chain.regulatedBefore) {
    band = 'regulert';
    label = 'Regulert';
    reason = 'Engangsregulering er allerede gjennomført.';
  } else if (chain.changedSeries) {
    band = 'ma_vurderes';
    label = 'Må vurderes';
    reason = 'Indeksserien er endret og krever dokumentert avklaring.';
    attention = true;
  } else if (failed) {
    band = 'ma_vurderes';
    label = 'Sendefeil';
    reason = failed.mail?.error || 'Utsending feilet.';
    attention = true;
  } else if (control) {
    band = 'ma_vurderes';
    label = 'Krever kontroll';
    reason = 'En sak ligger til kontroll.';
    attention = true;
  } else if (allowed && day < allowed) {
    band = 'kommende';
    label = 'Kommende';
    reason = `Neste regulering ${allowed}.`;
  } else if (!chain.next) {
    if (!chain.regulatedBefore) {
      band = 'venter_indeks';
      label = 'Venter på indeks';
      reason = chain.latest
        ? 'Indeks nyere enn avtaleindeksen er ikke publisert.'
        : 'Relevant indeks er ikke hentet fra SSB.';
    } else {
      band = 'regulert';
      label = 'Regulert';
      reason = 'Ingen ny indeks er publisert etter siste regulering.';
    }
  } else if (allowed && allowed < day) {
    band = 'ma_vurderes';
    label = 'Må vurderes';
    reason = `Regulering kunne virke fra ${allowed}, og ny indeks er publisert.`;
    attention = true;
  } else {
    band = 'kan_reguleres';
    label = 'Kan reguleres';
    reason = 'Avtalen kan reguleres mot publisert indeks.';
    attention = true;
  }
  if (draftCase && band === 'regulert') {
    band = 'kan_reguleres';
    label = 'Utkast';
    reason = 'Et utkast er ikke avsluttet.';
    attention = true;
  }
  return {
    band,
    label,
    reason,
    attention,
    allowed,
    missing,
    draft,
    settings,
    chain,
    cases,
    frequencyLabel: frequencyLabel(draft?.terms?.frequency),
  };
}

export function queueContracts({
  contracts = [],
  projects = [],
  customers = [],
  series = null,
  today = '',
  query = '',
  band = 'alle',
} = {}) {
  const q = text(query).toLowerCase();
  const projectsById = new Map((projects || []).map((row) => [row.id, row]));
  const rows = [];
  (contracts || []).forEach((contract) => {
    if (!contract?.id || contract.deletedAt) return;
    const status = classifyContract({ contract, contracts, series, today });
    if (band !== 'alle' && status.band !== band) return;
    const project = projectsById.get(contract.projectId) || null;
    const customer = (customers || []).find((row) => row.id === contract.customerId) || null;
    const hay = [
      contract.title,
      contract.buyer,
      contract.oppdragId,
      contract.systemId,
      project?.number,
      project?.name,
      customer?.name,
      status.draft?.standard,
      status.draft?.contactName,
    ].join(' ').toLowerCase();
    if (q && !hay.includes(q)) return;
    rows.push({
      contract,
      project,
      customer,
      status,
    });
  });
  const order = { ma_vurderes: 0, kan_reguleres: 1, venter_indeks: 2, kommende: 3, regulert: 4, ikke_aktuell: 5 };
  rows.sort((a, b) => (order[a.status.band] ?? 9) - (order[b.status.band] ?? 9)
    || text(a.contract.title).localeCompare(text(b.contract.title), 'nb'));
  return rows;
}

export function queueCounts(contracts, series, today) {
  const counts = { ma_vurderes: 0, kan_reguleres: 0, venter_indeks: 0, kommende: 0, regulert: 0, alle: 0 };
  (contracts || []).forEach((contract) => {
    if (!contract?.id || contract.deletedAt) return;
    counts.alle += 1;
    const status = classifyContract({ contract, contracts, series, today });
    if (counts[status.band] != null) counts[status.band] += 1;
  });
  return counts;
}

export function deskCounts(contracts, series, today, projects) {
  const base = queueCounts(contracts, series, today);
  const loose = projectsWithoutAgreement(projects, contracts);
  return {
    kan_reguleres: base.kan_reguleres + base.ma_vurderes,
    venter_indeks: base.venter_indeks + base.kommende,
    oppmerksomhet: loose.length,
    regulert: base.regulert,
    aktiv: loose.filter((row) => row.group === 'aktiv').length,
    deaktivert: loose.filter((row) => row.group === 'deaktivert').length,
  };
}

export function nextCaseNumber(cases) {
  const nums = (Array.isArray(cases) ? cases : [])
    .map((row) => Number(String(row?.number || '').replace(/\D/g, '')))
    .filter((value) => value > 0);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `IR-${String(next).padStart(3, '0')}`;
}

function rangesOverlap(left, right) {
  if (!left?.effectiveFrom || !right?.effectiveFrom) return false;
  const aEnd = left.effectiveTo || '9999-12-31';
  const bEnd = right.effectiveTo || '9999-12-31';
  return left.effectiveFrom <= bEnd && right.effectiveFrom <= aEnd;
}

export function findOverlap(cases, candidate) {
  return (Array.isArray(cases) ? cases : []).find((row) => {
    if (!row?.id || row.id === candidate?.id || row.status === 'trukket') return false;
    if (candidate?.newPeriod && row.newPeriod && candidate.newPeriod === row.newPeriod && APPLIED.has(row.status)) return true;
    return rangesOverlap(row, candidate);
  }) || null;
}

export function validateCase(entry, cases, { forApproval = false } = {}) {
  const errors = [];
  if (!entry?.contractId) errors.push('Mangler avtale.');
  if (!entry?.indexId) errors.push('Mangler indeksserie.');
  if (!(Number(entry?.originalIndex) > 0)) errors.push('Mangler opprinnelig indeks.');
  if (!(Number(entry?.basisIndex) > 0)) errors.push('Mangler beregningsindeks.');
  if (!(Number(entry?.newIndex) > 0)) errors.push('Mangler ny indeks.');
  if (!(Number(entry?.previousPrice) > 0) || !(Number(entry?.newPrice) >= 0)) errors.push('Mangler prisgrunnlag.');
  if (!entry?.effectiveFrom) errors.push('Mangler virkningsdato.');
  if (entry?.provisional) errors.push('Indeksen er ikke publisert. Saken kan lagres som utkast, men ikke godkjennes.');
  if (entry?.allowedFrom && entry.effectiveFrom && entry.effectiveFrom < entry.allowedFrom) {
    errors.push(`Virkningsdato er før avtalt tidligste dato ${entry.allowedFrom}.`);
  }
  const days = Number(entry?.noticeDays) || 0;
  if (days > 0 && entry.noticeDate && entry.effectiveFrom) {
    const notice = new Date(`${entry.noticeDate}T00:00:00Z`);
    const effect = new Date(`${entry.effectiveFrom}T00:00:00Z`);
    const diff = (effect - notice) / 86400000;
    if (diff < days) errors.push(`Varselet er kortere enn avtalt frist på ${days} dager.`);
  }
  const clash = findOverlap(cases, entry);
  if (clash) errors.push(`Perioden overlapper ${clash.number || 'en annen sak'}.`);
  if (!forApproval) return errors.filter((line) => !/ikke godkjennes|ikke publisert/.test(line));
  return errors;
}

function blankId() {
  return `ir_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function caseFromCalculation({
  contract,
  draft,
  result,
  cases = [],
  actor = null,
  now = new Date(),
  dates = {},
  previousId = '',
} = {}) {
  const chain = result?.chain || buildIndexChain({ draft, cases });
  const basis = result?.basisPoint || null;
  const next = result?.regulationPoint || null;
  const number = nextCaseNumber(cases);
  const stamp = osloStamp(now);
  const entry = {
    id: blankId(),
    number,
    revision: 0,
    contractId: contract?.id || '',
    projectId: contract?.projectId || '',
    customerId: contract?.customerId || '',
    previousCaseId: previousId || '',
    status: 'utkast',
    mailStatus: 'ikke_sendt',
    indexId: chain.indexId || draft?.indexId || '',
    table: result?.series?.table || chain.table || '',
    seriesName: result?.series?.name || chain.name || '',
    mode: result?.mode || chain.mode || basisMode(draft),
    originalPeriod: chain.original?.period || '',
    originalIndex: chain.original?.value || 0,
    originalPrice: chain.originalPrice || 0,
    previousPeriod: chain.previous?.period || '',
    previousIndex: chain.previous?.value || 0,
    basisPeriod: basis?.period || '',
    basisIndex: basis?.value || 0,
    newPeriod: next?.period || '',
    newIndex: next?.value || 0,
    previousPrice: result?.baseSum || 0,
    addition: result?.addition || 0,
    changePercent: result?.changePercent || 0,
    newPrice: result?.regulated || 0,
    provisional: !!result?.provisional,
    referenceFrom: dates.referenceFrom || chain.previous?.period || '',
    referenceTo: dates.referenceTo || next?.period || '',
    allowedFrom: dates.allowedFrom || '',
    regulationDate: parseIsoDate(dates.regulationDate) || result?.regulationDate || '',
    noticeDate: parseIsoDate(dates.noticeDate) || result?.noticeDate || '',
    effectiveFrom: parseIsoDate(dates.effectiveFrom) || '',
    effectiveTo: parseIsoDate(dates.effectiveTo) || '',
    noticeDays: Number(dates.noticeDays) || 0,
    freeText: text(dates.freeText).slice(0, 2000),
    letterPlain: '',
    documentVersion: 0,
    documents: [],
    mail: {
      status: 'ikke_sendt',
      to: '',
      cc: [],
      subject: '',
      body: '',
      documentVersion: 0,
      sentAt: '',
      sentBy: '',
      providerId: '',
      error: '',
    },
    createdAt: stamp,
    createdBy: actorName(actor),
    createdByUid: text(actor?.uid),
    updatedAt: stamp,
    updatedBy: actorName(actor),
    approvedAt: '',
    approvedBy: '',
    audit: [],
    snapshot: null,
  };
  entry.audit = pushAudit(entry, previousId ? 'korrigering' : 'opprettet', actor, now, number);
  return entry;
}

function contentChanged(current, next) {
  const keys = ['newPrice', 'newIndex', 'basisIndex', 'originalIndex', 'previousPrice', 'effectiveFrom', 'effectiveTo', 'indexId', 'newPeriod', 'freeText', 'letterPlain'];
  return keys.some((key) => String(current?.[key] ?? '') !== String(next?.[key] ?? ''));
}

export function upsertCase(list, next, expectedRevision = null) {
  const rows = Array.isArray(list) ? list.slice() : [];
  const index = rows.findIndex((row) => row?.id === next?.id);
  if (!next?.id) return { ok: false, error: 'Saken mangler id.', cases: rows };
  if (index === -1) {
    return { ok: true, cases: [next, ...rows], case: next };
  }
  const current = rows[index];
  const revision = Number(current.revision) || 0;
  if (expectedRevision != null && Number(expectedRevision) !== revision) {
    return { ok: false, error: 'Saken er endret av en annen bruker. Last inn på nytt.', cases: rows };
  }
  if (current.status === 'sendt' && contentChanged(current, next)) {
    return { ok: false, error: 'Sendt regulering kan ikke endres. Opprett en korrigering.', cases: rows };
  }
  if (caseIsLocked(current) && contentChanged(current, next) && next.status !== 'trukket') {
    return { ok: false, error: 'Godkjent sak kan ikke endres direkte. Opprett en korrigering.', cases: rows };
  }
  const stored = { ...current, ...next, revision: revision + 1, audit: next.audit || current.audit };
  rows[index] = stored;
  return { ok: true, cases: rows, case: stored };
}

export function attachLetter(entry, letter, result, actor, now = new Date()) {
  if (!entry) return { ok: false, error: 'Mangler sak.' };
  if (entry.status === 'sendt' || caseIsLocked(entry)) {
    return { ok: false, error: 'Brevet er låst. Opprett en korrigering for å endre teksten.' };
  }
  const version = (Number(entry.documentVersion) || 0) + 1;
  const doc = {
    id: `doc_${entry.id}_v${version}`,
    version,
    title: letter?.title || 'Varsel om indeksregulering',
    plain: letter?.plain || '',
    createdAt: osloStamp(now),
    createdBy: actorName(actor),
  };
  const documents = [...(entry.documents || []), doc];
  return {
    ok: true,
    case: {
      ...entry,
      documents,
      documentVersion: version,
      letterPlain: doc.plain,
      freeText: entry.freeText || '',
      snapshot: {
        draft: result?.draft || null,
        result: (() => {
          if (!result) return null;
          const copy = { ...result };
          delete copy.chain;
          return copy;
        })(),
      },
      updatedAt: osloStamp(now),
      updatedBy: actorName(actor),
      audit: pushAudit(entry, 'dokument', actor, now, `versjon ${version}`),
    },
  };
}

export function saveDraft(entry, patch, cases, actor, now = new Date()) {
  if (caseIsLocked(entry)) return { ok: false, error: 'Saken er låst.' };
  const next = {
    ...entry,
    ...patch,
    status: 'utkast',
    mailStatus: entry.mailStatus === 'sendt' ? entry.mailStatus : 'ikke_sendt',
    updatedAt: osloStamp(now),
    updatedBy: actorName(actor),
    audit: pushAudit(entry, 'utkast', actor, now),
  };
  const errors = validateCase(next, cases, { forApproval: false });
  return { ok: true, case: next, errors };
}

export function markReady(entry, cases, actor, now = new Date()) {
  const errors = validateCase(entry, cases, { forApproval: true });
  if (errors.length) return { ok: false, error: errors[0], errors };
  return {
    ok: true,
    case: {
      ...entry,
      status: 'klar_til_kontroll',
      updatedAt: osloStamp(now),
      updatedBy: actorName(actor),
      audit: pushAudit(entry, 'kontroll', actor, now),
    },
  };
}

export function approveCase(entry, cases, actor, now = new Date()) {
  const errors = validateCase({ ...entry, status: 'godkjent' }, cases, { forApproval: true });
  if (errors.length) return { ok: false, error: errors[0], errors };
  if (!entry.letterPlain) return { ok: false, error: 'Generer brevet før saken godkjennes.' };
  const stamp = osloStamp(now);
  return {
    ok: true,
    case: {
      ...entry,
      status: 'godkjent',
      mailStatus: 'ikke_sendt',
      approvedAt: stamp,
      approvedBy: actorName(actor),
      updatedAt: stamp,
      updatedBy: actorName(actor),
      audit: pushAudit(entry, 'godkjent', actor, now),
    },
  };
}

export function priceVersionFromCase(entry) {
  if (!entry?.id || !(Number(entry.newPrice) >= 0) || !entry.effectiveFrom) return null;
  return {
    id: `pv_${entry.id}`,
    caseId: entry.id,
    caseNumber: entry.number || '',
    validFrom: entry.effectiveFrom,
    validTo: '',
    rateExVat: Number(entry.newPrice),
    previousRateExVat: Number(entry.previousPrice) || 0,
    indexPeriod: entry.newPeriod || '',
    indexValue: Number(entry.newIndex) || 0,
  };
}

function dayBefore(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function applyPriceVersion(versions, next) {
  if (!next?.id) return Array.isArray(versions) ? versions : [];
  const rows = (Array.isArray(versions) ? versions : []).filter((row) => row?.id && row.id !== next.id && row.caseId !== next.caseId);
  const closed = rows.map((row) => {
    if (row.validTo) return row;
    if (!row.validFrom || row.validFrom >= next.validFrom) return row;
    const end = dayBefore(next.validFrom);
    if (!end || end < row.validFrom) return row;
    return { ...row, validTo: end };
  });
  return [...closed, next].sort((a, b) => text(a.validFrom).localeCompare(text(b.validFrom)));
}

export function rateOnDate(versions, iso) {
  const day = parseIsoDate(iso);
  if (!day) return null;
  const hits = (Array.isArray(versions) ? versions : []).filter((row) => {
    if (!row?.validFrom || !(Number(row.rateExVat) >= 0)) return false;
    if (row.validFrom > day) return false;
    if (row.validTo && row.validTo < day) return false;
    return true;
  });
  if (!hits.length) return null;
  hits.sort((a, b) => text(b.validFrom).localeCompare(text(a.validFrom)));
  return Number(hits[0].rateExVat);
}

export function beginSend(entry, message, actor, now = new Date()) {
  if (!entry) return { ok: false, error: 'Mangler sak.' };
  if (entry.status === 'sending' || entry.mailStatus === 'sending') {
    return { ok: false, error: 'Utsending pågår allerede.' };
  }
  if (!['godkjent', 'klar_til_utsending', 'sendefeil'].includes(entry.status)) {
    return { ok: false, error: 'Saken må være godkjent før den sendes.' };
  }
  if (!message?.to) return { ok: false, error: 'Mangler mottaker.' };
  const stamp = osloStamp(now);
  return {
    ok: true,
    case: {
      ...entry,
      status: 'sending',
      mailStatus: 'sending',
      mail: {
        ...(entry.mail || {}),
        status: 'sending',
        to: message.to,
        cc: Array.isArray(message.cc) ? message.cc : [],
        subject: message.subject || '',
        body: message.text || message.body || '',
        documentVersion: entry.documentVersion || 0,
        error: '',
      },
      updatedAt: stamp,
      updatedBy: actorName(actor),
      audit: pushAudit(entry, 'sending', actor, now, message.to),
    },
  };
}

export function finishSend(entry, outcome, actor, now = new Date()) {
  const stamp = osloStamp(now);
  if (!outcome?.ok) {
    const error = text(outcome?.error || 'E-postleverandøren avviste sendingen.');
    return {
      ok: true,
      case: {
        ...entry,
        status: 'sendefeil',
        mailStatus: 'sendefeil',
        mail: {
          ...(entry.mail || {}),
          status: 'sendefeil',
          error,
          sentAt: '',
        },
        updatedAt: stamp,
        updatedBy: actorName(actor),
        audit: pushAudit(entry, 'sendefeil', actor, now, error),
      },
    };
  }
  return {
    ok: true,
    case: {
      ...entry,
      status: 'sendt',
      mailStatus: 'sendt',
      mail: {
        ...(entry.mail || {}),
        status: 'sendt',
        error: '',
        sentAt: stamp,
        sentBy: actorName(actor),
        providerId: text(outcome.providerId || outcome.messageId),
      },
      updatedAt: stamp,
      updatedBy: actorName(actor),
      audit: pushAudit(entry, 'sendt', actor, now, entry.mail?.to || ''),
    },
  };
}

export function withdrawCase(entry, actor, now = new Date()) {
  if (!entry) return { ok: false, error: 'Mangler sak.' };
  if (entry.status === 'sendt') return { ok: false, error: 'Sendt sak kan ikke trekkes. Opprett en korrigering.' };
  return {
    ok: true,
    case: {
      ...entry,
      status: 'trukket',
      updatedAt: osloStamp(now),
      updatedBy: actorName(actor),
      audit: pushAudit(entry, 'trukket', actor, now),
    },
  };
}

export function regulationFromCase(entry) {
  if (!entry?.id) return null;
  return {
    id: entry.id,
    savedAt: text(entry.approvedAt || entry.createdAt).slice(0, 10),
    before: Number(entry.previousPrice) || 0,
    after: Number(entry.newPrice) || 0,
    increase: Number(entry.addition) || 0,
    fromPeriod: entry.basisPeriod || entry.previousPeriod || '',
    fromIndex: Number(entry.basisIndex) || 0,
    toPeriod: entry.newPeriod || '',
    toIndex: Number(entry.newIndex) || 0,
    changePercent: Number(entry.changePercent) || 0,
    formula: entry.mode === 'opprinnelig'
      ? 'Ny pris = opprinnelig pris × ny indeks / opprinnelig indeks'
      : 'Ny pris = gjeldende pris × ny indeks / forrige beregningsindeks',
    query: [
      entry.table ? `tabell ${entry.table}` : '',
      entry.indexId ? `serie ${entry.indexId}` : '',
      entry.number || '',
    ].filter(Boolean).join(' · '),
    letterTitle: 'Varsel om indeksregulering',
    letterPlain: entry.letterPlain || '',
    projectId: entry.projectId || '',
    customerId: entry.customerId || '',
    indexId: entry.indexId || '',
    contractTitle: '',
    sentAt: text(entry.mail?.sentAt).slice(0, 10),
    sentTo: entry.mail?.to || '',
  };
}

export function mergeRegulationList(existing, entry) {
  const row = regulationFromCase(entry);
  if (!row) return Array.isArray(existing) ? existing : [];
  const rows = Array.isArray(existing) ? existing.filter((item) => item?.id && item.id !== row.id) : [];
  return [row, ...rows];
}

export function workspaceHref(currentHref, contractId, caseId = '', view = '') {
  const url = new URL(currentHref || 'https://protop.no/', 'https://protop.no');
  url.searchParams.set('indeksAvtale', contractId);
  if (caseId) url.searchParams.set('indeksSak', caseId);
  else url.searchParams.delete('indeksSak');
  if (view) url.searchParams.set('indeksVis', view);
  else url.searchParams.delete('indeksVis');
  return url.toString();
}

export function readWorkspaceQuery(search) {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  return {
    contractId: params.get('indeksAvtale') || '',
    caseId: params.get('indeksSak') || '',
    view: params.get('indeksVis') || '',
  };
}

export function formatKr(value) {
  if (value == null || !Number.isFinite(Number(value))) return '–';
  return `${formatMoney(value)} kr`;
}

export function formatPercentExact(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '–';
  return `${number.toFixed(4).replace('.', ',')} %`;
}
