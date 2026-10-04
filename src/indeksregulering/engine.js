import { modelById, seriesById, standardById } from './catalog.js';

export function roundMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

export function parseAmount(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let text = String(raw ?? '').trim();
  if (!text) return null;
  text = text.replace(/\s/g, '').replace(/kr\.?$/i, '').replace(/nok$/i, '');
  if (text.includes(',') && text.includes('.')) text = text.replace(/\./g, '').replace(',', '.');
  else if (text.includes(',')) text = text.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, '');
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function parseIsoDate(raw) {
  const text = String(raw ?? '').trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return validIso(match[1], match[2], match[3]);
  match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (match) return validIso(match[3], match[2].padStart(2, '0'), match[1].padStart(2, '0'));
  return '';
}

function validIso(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (y < 1970 || m < 1 || m > 12 || d < 1 || d > 31) return '';
  return `${year}-${month}-${day}`;
}

export function todayIso(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addMonths(iso, months) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + months, Number(match[3])));
  return date.toISOString().slice(0, 10);
}

export function dateToPeriod(iso, frequency) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!match) return '';
  const year = match[1];
  const month = Number(match[2]);
  if (frequency === 'quarter') return `${year}K${Math.floor((month - 1) / 3) + 1}`;
  return `${year}M${String(month).padStart(2, '0')}`;
}

export function periodLabel(period) {
  const month = /^(\d{4})M(\d{2})$/.exec(period || '');
  if (month) {
    const names = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
    return `${names[Number(month[2]) - 1]} ${month[1]}`;
  }
  const quarter = /^(\d{4})K([1-4])$/.exec(period || '');
  if (quarter) return `${quarter[2]}. kvartal ${quarter[1]}`;
  return period || '';
}

export function lookupIndex(points, period) {
  if (!points?.length || !period) return null;
  const exact = points.find((point) => point.period === period);
  if (exact) return { ...exact, exact: true };
  const earlier = points.filter((point) => point.period < period);
  if (!earlier.length) return null;
  return { ...earlier[earlier.length - 1], exact: false };
}

export function emptyLine(partial = {}) {
  return {
    id: partial.id || `linje-${Math.random().toString(36).slice(2, 8)}`,
    text: partial.text || '',
    quantity: partial.quantity ?? '1',
    unit: partial.unit || 'RS',
    rate: partial.rate ?? '',
    included: partial.included !== false,
    indexId: partial.indexId || '',
    sharePercent: partial.sharePercent ?? '',
  };
}

export function emptyDraft(partial = {}) {
  return {
    title: '',
    reference: '',
    buyer: '',
    supplier: '',
    standard: 'NS 8407',
    model: 'ns3405',
    indexId: 'bki-boligblokk',
    sharePercent: '100',
    vatPercent: '25',
    offerDate: '',
    tenderDeadline: '',
    regulationDate: '',
    noticeDate: '',
    regulationExcluded: false,
    overrideExclusion: false,
    lines: [emptyLine({ text: 'Kontraktssum', quantity: '1', unit: 'RS' })],
    periods: [],
    weights: [
      { indexId: 'bki-bustader-arbeid', weight: '50' },
      { indexId: 'bki-bustader-materialer', weight: '50' },
    ],
    findings: [],
    engine: '',
    documents: [],
    terms: emptyTerms(),
    orgnr: '',
    contactName: '',
    phone: '',
    email: '',
    website: '',
    place: '',
    poNumber: '',
    contractDate: '',
    honorar: '',
    effectiveDate: '',
    firstRegulationDate: '',
    ...partial,
  };
}

export function emptyTerms(partial = {}) {
  return {
    baseRule: partial.baseRule || 'auto',
    frequency: partial.frequency || 'month',
    thresholdPercent: partial.thresholdPercent ?? '',
    capPercent: partial.capPercent ?? '',
    roundToKrone: partial.roundToKrone === true,
    variables: Array.isArray(partial.variables) ? partial.variables : [],
  };
}

function lineAmount(line) {
  const quantity = parseAmount(line.quantity);
  const rate = parseAmount(line.rate);
  if (quantity == null || rate == null) return null;
  return roundMoney(quantity * rate);
}

function shareOf(draft) {
  const share = parseAmount(draft.sharePercent);
  if (share == null) return null;
  return Math.min(100, Math.max(0, share)) / 100;
}

function combinedPoints(weights, indices) {
  const parts = weights.map((weight) => {
    const series = indices?.[weight.indexId];
    const map = Object.fromEntries((series?.points || []).map((point) => [point.period, point.value]));
    return { weight: weight.share, map, name: series?.name || weight.indexId };
  });
  const periods = [...new Set(parts.flatMap((part) => Object.keys(part.map)))].sort();
  const points = [];
  periods.forEach((period) => {
    let weighted = 0;
    let sum = 0;
    for (const part of parts) {
      if (part.map[period] == null) return;
      weighted += part.weight * part.map[period];
      sum += part.weight;
    }
    if (sum > 0) points.push({ period, value: weighted / sum });
  });
  return points;
}

function regulate(base, share, current, basis, terms = {}) {
  let change = (current - basis) / basis;
  const threshold = parseAmount(terms.thresholdPercent);
  if (threshold != null && threshold > 0 && Math.abs(change) * 100 < threshold) {
    return { change, addition: 0, regulated: roundMoney(base), suppressed: 'terskel' };
  }
  const cap = parseAmount(terms.capPercent);
  let capped = false;
  if (cap != null && cap > 0 && Math.abs(change) * 100 > cap) {
    change = Math.sign(change) * (cap / 100);
    capped = true;
  }
  let addition = roundMoney(base * share * change);
  if (terms.roundToKrone) addition = Math.round(addition);
  return {
    change,
    addition,
    regulated: roundMoney(base + addition),
    suppressed: '',
    capped,
  };
}

export function contractBasis(draft) {
  return resolveBasis(draft || {});
}

function resolveBasis(draft) {
  const rule = draft.terms?.baseRule || 'auto';
  const tender = parseIsoDate(draft.tenderDeadline);
  const offer = parseIsoDate(draft.offerDate);
  const contract = parseIsoDate(draft.contractDate);
  if (rule === 'tender') return { date: tender, kind: 'tilbudsfrist' };
  if (rule === 'offer') return { date: offer, kind: 'tilbudsdato' };
  if (rule === 'contract') return { date: contract, kind: 'kontraktsdato' };
  if (tender) return { date: tender, kind: 'tilbudsfrist' };
  if (offer) return { date: offer, kind: 'tilbudsdato' };
  if (contract) return { date: contract, kind: 'kontraktsdato' };
  return { date: '', kind: '' };
}

function lineShare(line, share) {
  const own = parseAmount(line?.sharePercent);
  if (own == null) return share;
  return Math.min(100, Math.max(0, own)) / 100;
}

function linePoint(indexId, indices, iso) {
  if (!indexId) return null;
  const series = indices?.[indexId];
  const points = series?.points;
  if (!points?.length) return null;
  const frequency = series.frequency || seriesById(indexId)?.frequency || 'month';
  const point = lookupIndex(points, dateToPeriod(iso, frequency));
  if (!point) return null;
  return { point, name: series.name || seriesById(indexId)?.name || indexId };
}

/**
 * Regulerer satser og grunnlag mot en SSB-serie.
 * indices er resultatet fra fetchAllIndices().series, eller en delmengde.
 */
export function calculate(draft, indices, now = new Date()) {
  const warnings = [];
  const model = modelById(draft.model);
  const standard = standardById(draft.standard);
  const share = shareOf(draft);
  const vatPercent = draft.model === 'husleie' ? 0 : (parseAmount(draft.vatPercent) ?? 0);
  if (share == null) return fail('Regulert andel må være et tall mellom 0 og 100.');
  if (draft.regulationExcluded && !draft.overrideExclusion) {
    return fail('Avtalen ser ut til å holde prisen fast. Kryss av for å beregne likevel hvis det er avtalt.');
  }

  const basis = resolveBasis(draft);
  const basisDate = basis.date;
  if (!basisDate) return fail('Sett tilbudsfrist, tilbudsdato eller kontraktsdato. Den måneden er basismåneden etter NS 3405.');
  const basisKind = basis.kind;
  const terms = emptyTerms(draft.terms);
  const regulationDate = parseIsoDate(draft.regulationDate) || todayIso(now);
  const noticeDate = parseIsoDate(draft.noticeDate) || todayIso(now);

  let frequency = 'month';
  let seriesMeta = seriesById(draft.indexId);
  let points = indices?.[draft.indexId]?.points || [];
  const weightRows = [];

  if (draft.model === 'vektet') {
    const weights = (draft.weights || []).map((row) => ({
      indexId: row.indexId,
      share: parseAmount(row.weight) ?? 0,
    })).filter((row) => row.share > 0);
    if (weights.length < 2) return fail('En vektet modell trenger minst to delindekser.');
    const missing = weights.filter((row) => !indices?.[row.indexId]?.points?.length);
    if (missing.length) return fail('Hent indeksene fra SSB før den vektede modellen kan regnes.');
    points = combinedPoints(weights, indices);
    frequency = indices[weights[0].indexId]?.frequency || seriesById(weights[0].indexId)?.frequency || 'month';
    const weightSum = weights.reduce((sum, row) => sum + row.share, 0);
    weights.forEach((row) => {
      weightRows.push({
        indexId: row.indexId,
        name: indices[row.indexId]?.name || seriesById(row.indexId)?.name || row.indexId,
        weight: row.share,
        percent: weightSum ? (row.share / weightSum) * 100 : 0,
      });
    });
    if (Math.abs(weightSum - 100) > 0.05) {
      warnings.push(`Vektene summerer til ${roundMoney(weightSum)} %. De er fordelt på nytt slik at de utgjør 100 %.`);
    }
    seriesMeta = {
      id: 'vektet',
      name: 'Vektet delindeks',
      table: weightRows.map((row) => seriesById(row.indexId)?.table).filter(Boolean).join(', '),
      basis: 'vektet av publiserte serier',
      source: 'SSB Statistikkbanken',
      frequency,
      url: 'https://www.ssb.no/priser-og-prisindekser/kontraktsjustering-indekser',
    };
  } else {
    seriesMeta = indices?.[draft.indexId] || seriesMeta;
    frequency = seriesMeta?.frequency || 'month';
    if (!points.length) return fail('Hent indeksene fra SSB. Serien som er valgt, er ikke lastet ned ennå.');
  }

  const wantedBasis = dateToPeriod(basisDate, frequency);
  const wantedRegulation = dateToPeriod(regulationDate, frequency);
  const basisPoint = lookupIndex(points, wantedBasis);
  const regulationPoint = lookupIndex(points, wantedRegulation);
  if (!basisPoint) return fail(`SSB-serien har ikke tall for basismåneden ${periodLabel(wantedBasis) || basisDate}.`);
  if (!regulationPoint) return fail('SSB-serien har ikke tall for reguleringsmåneden.');
  if (!(basisPoint.value > 0) || !(regulationPoint.value > 0)) return fail('Indekstallet må være større enn null.');
  if (!basisPoint.exact) warnings.push(`Indeks for ${periodLabel(wantedBasis)} er ikke publisert. Nærmeste tidligere tall er ${periodLabel(basisPoint.period)}.`);
  if (!regulationPoint.exact) {
    warnings.push(`Indeks for ${periodLabel(wantedRegulation)} er ikke publisert ennå. Gjeldende tall er ${periodLabel(regulationPoint.period)} (${regulationPoint.value}).`);
  }
  if (regulationPoint.period < basisPoint.period) {
    return fail('Reguleringsmåneden ligger før basismåneden.');
  }

  const usePeriods = draft.model === 'ns3405' && Array.isArray(draft.periods) && draft.periods.some((row) => parseAmount(row.amount) != null);
  const rows = [];
  if (usePeriods) {
    draft.periods.forEach((periodRow, index) => {
      const amount = parseAmount(periodRow.amount);
      if (amount == null) return;
      const month = String(periodRow.month || '');
      const periodDate = parseIsoDate(periodRow.date)
        || parseIsoDate(month.length === 7 ? `${month}-01` : month)
        || '';
      const wanted = dateToPeriod(periodDate, frequency) || wantedRegulation;
      const point = lookupIndex(points, wanted);
      if (!point) {
        warnings.push(`Mangler indeks for avregningsperiode ${index + 1}.`);
        return;
      }
      const math = regulate(amount, share, point.value, basisPoint.value, terms);
      rows.push({
        kind: 'periode',
        text: periodRow.text || `Produksjon ${periodLabel(point.period)}`,
        quantity: 1,
        unit: 'periode',
        rate: amount,
        base: amount,
        period: point.period,
        index: point.value,
        basisValue: basisPoint.value,
        basisPeriod: basisPoint.period,
        ...math,
        newRate: terms.roundToKrone ? Math.round(math.regulated) : math.regulated,
      });
    });
  } else {
    (draft.lines || []).forEach((line) => {
      if (line.included === false) return;
      const base = lineAmount(line);
      if (base == null) return;
      const ownBasis = linePoint(line.indexId, indices, basisDate);
      const ownNow = linePoint(line.indexId, indices, regulationDate);
      const usedBasis = ownBasis?.point || basisPoint;
      const usedNow = ownNow?.point || regulationPoint;
      if (line.indexId && (!ownBasis || !ownNow)) {
        warnings.push(`Serien på «${line.text || 'linjen'}» er ikke lastet. Hovedindeksen er brukt.`);
      }
      const math = regulate(base, lineShare(line, share), usedNow.value, usedBasis.value, terms);
      const quantity = parseAmount(line.quantity) || 1;
      const regulated = terms.roundToKrone ? Math.round(math.regulated) : math.regulated;
      rows.push({
        kind: 'sats',
        text: line.text || 'Grunnlag',
        quantity,
        unit: line.unit || '',
        rate: parseAmount(line.rate) || 0,
        base,
        period: usedNow.period,
        index: usedNow.value,
        basisValue: usedBasis.value,
        basisPeriod: usedBasis.period,
        indexName: ownNow?.name || '',
        ...math,
        newRate: quantity ? (terms.roundToKrone ? Math.round(regulated / quantity) : roundMoney(regulated / quantity)) : regulated,
      });
    });
  }
  if (!rows.length) return fail('Legg inn minst én sats eller et grunnlag som skal reguleres.');
  if (rows.some((row) => row.suppressed === 'terskel')) {
    warnings.push(`Endringen er under terskelen på ${terms.thresholdPercent} %. NS 3405-tillegget blir ikke krevd for de linjene.`);
  }
  if (rows.some((row) => row.capped)) {
    warnings.push(`Endringen er begrenset til taket på ${terms.capPercent} %, slik avtalen sier.`);
  }
  if (terms.frequency === 'quarter') warnings.push('Avtalen reguleres kvartalsvis.');
  else if (terms.frequency === 'year') warnings.push('Avtalen reguleres årlig.');
  else if (terms.frequency === 'once') warnings.push('Avtalen beskriver en engangsregulering.');

  const baseSum = roundMoney(rows.reduce((sum, row) => sum + row.base, 0));
  const addition = roundMoney(rows.reduce((sum, row) => sum + row.addition, 0));
  const regulated = roundMoney(baseSum + addition);
  const vat = roundMoney(addition * (Number(vatPercent) || 0) / 100);
  const payable = roundMoney(addition + vat);

  if (draft.model === 'husleie') {
    const earliest = [addMonths(basisDate, 12), addMonths(noticeDate, 1)].sort().at(-1);
    if (regulationDate < earliest) {
      warnings.push(`Husleieloven § 4-2: endringen kan tidligst virke ${earliest}. Det er ett år etter siste leiefastsetting og én måned etter varselet.`);
    }
    if (share < 1) warnings.push('Andelen er lavere enn hele KPI-endringen. Det er innenfor taket i husleieloven § 4-2.');
  }
  if (draft.standard === 'bustadoppføringslova' || draft.standard === 'håndverkertjenesteloven') {
    warnings.push(`${standard.label}: regulering må være avtalt. Uten klausul i avtalen gir ikke loven krav på SSB-justering.`);
  }
  if (addition < 0) warnings.push('Indeksen har falt. Reguleringen er en reduksjon, ikke et tillegg.');

  const latest = points[points.length - 1] || null;

  return {
    ok: true,
    error: '',
    warnings,
    model,
    standard,
    basisKind,
    basisDate,
    regulationDate,
    noticeDate,
    share,
    vatPercent: Number(vatPercent) || 0,
    series: {
      id: seriesMeta?.id || draft.indexId,
      name: seriesMeta?.name || draft.indexId,
      table: seriesMeta?.table || '',
      codes: seriesMeta?.codes || [],
      basis: seriesMeta?.basis || '',
      source: seriesMeta?.source || 'SSB Statistikkbanken',
      url: seriesMeta?.url || '',
      frequency,
    },
    basisPoint,
    regulationPoint,
    latest,
    weights: weightRows,
    rows,
    baseSum,
    addition,
    regulated,
    vat,
    payable,
    changePercent: basisPoint.value ? ((regulationPoint.value - basisPoint.value) / basisPoint.value) * 100 : 0,
  };
}

function fail(error) {
  return {
    ok: false,
    error,
    warnings: [],
    rows: [],
    baseSum: 0,
    addition: 0,
    regulated: 0,
    vat: 0,
    payable: 0,
  };
}
