import { contractBasis, dateToPeriod, lookupIndex, parseAmount, parseIsoDate, periodLabel } from './engine.js';
import { formatDate, formatIndex, formatMoney, formatPercent } from './letter.js';
import { modelById, seriesById, standardById } from './catalog.js';

const FREQUENCY = {
  month: 'Hver måned',
  quarter: 'Hvert kvartal',
  year: 'Årlig',
  once: 'Én gang',
};

const BASIS = {
  auto: 'Tilbudsfrist, ellers tilbudsdato',
  tender: 'Tilbudsfrist',
  offer: 'Tilbudsdato',
  contract: 'Kontraktsdato',
};

function blank(value) {
  const text = String(value ?? '').trim();
  return text || 'Ikke oppgitt';
}

function money(value) {
  const number = parseAmount(value);
  if (number == null) return 'Ikke oppgitt';
  return `${formatMoney(number)} kr`;
}

/** Første dag regulering kan virke etter basismåneden, med mindre avtalen navngir datoen. */
export function firstRegulationDate(draft) {
  const named = parseIsoDate(draft?.firstRegulationDate);
  if (named) return named;
  const basis = contractBasis(draft).date;
  if (!basis) return '';
  const frequency = draft?.terms?.frequency || 'month';
  if (frequency === 'once') return parseIsoDate(draft.regulationDate) || basis;
  return nextPeriodStart(basis, frequency);
}

function nextPeriodStart(iso, frequency) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (frequency === 'year') return `${year + 1}-${match[2]}-01`;
  if (frequency === 'quarter') {
    const nextMonth = Math.floor((month - 1) / 3) * 3 + 4;
    if (nextMonth > 12) return `${year + 1}-01-01`;
    return `${year}-${String(nextMonth).padStart(2, '0')}-01`;
  }
  const next = new Date(Date.UTC(year, month, 1));
  return next.toISOString().slice(0, 10);
}

function includedSum(draft) {
  let sum = 0;
  let any = false;
  (draft?.lines || []).forEach((line) => {
    if (line.included === false) return;
    const quantity = parseAmount(line.quantity);
    const rate = parseAmount(line.rate);
    if (quantity == null || rate == null) return;
    sum += quantity * rate;
    any = true;
  });
  return any ? Math.round(sum * 100) / 100 : null;
}

function rateCount(draft) {
  const lines = (draft?.lines || []).filter((line) => parseAmount(line.rate) != null);
  if (!lines.length) return '';
  const included = lines.filter((line) => line.included !== false).length;
  return `${included} av ${lines.length}`;
}

function priceRule(draft) {
  if (draft?.regulationExcluded && draft?.overrideExclusion) return 'Fastpris i teksten, reguleres likevel';
  if (draft?.regulationExcluded) return 'Prisen holdes fast';
  return 'Avtalt indeksregulering';
}

function firstList(...lists) {
  for (const list of lists) {
    if (Array.isArray(list) && list.length) return list;
  }
  return [];
}

/**
 * Standardfeltene på avtalens fremside.
 * result kan mangle. Da leses indeksen da fra seriens historikk.
 */
export function agreementSheet(draft, result, series) {
  const basis = contractBasis(draft || {});
  const frequency = series?.frequency || result?.series?.frequency || 'month';
  const basisPeriod = result?.ok
    ? result.basisPoint.period
    : (basis.date ? dateToPeriod(basis.date, frequency) : '');
  const thenPoint = result?.ok
    ? result.basisPoint
    : lookupIndex(series?.points, basisPeriod);
  const nowPoint = series?.latest || null;
  const first = firstRegulationDate(draft);
  const share = parseAmount(draft?.sharePercent);
  const standard = standardById(draft?.standard);
  const model = modelById(draft?.model);
  const catalogSeries = seriesById(draft?.indexId);
  const documents = (draft?.documents || []).map((doc) => doc.name).filter(Boolean);
  const codes = firstList(series?.codes, result?.series?.codes, catalogSeries?.codes);
  const table = series?.table || result?.series?.table || catalogSeries?.table || '';
  const basisYear = series?.basis || result?.series?.basis || catalogSeries?.basis || '';
  const source = series?.source || result?.series?.source || catalogSeries?.source || '';
  const sum = result?.ok ? result.baseSum : includedSum(draft);
  const change = result?.ok
    ? formatPercent(result.changePercent)
    : (thenPoint && nowPoint && thenPoint.value
      ? formatPercent(((nowPoint.value - thenPoint.value) / thenPoint.value) * 100)
      : '');

  const indexThen = thenPoint
    ? `${formatIndex(thenPoint.value)} · ${periodLabel(thenPoint.period)}`
    : '';
  const indexNow = nowPoint
    ? `${formatIndex(nowPoint.value)} · ${periodLabel(nowPoint.period)}`
    : '';

  return {
    title: draft?.title || 'Avtale uten navn',
    reference: draft?.reference || '',
    groups: [
      {
        title: 'Regulering',
        rows: [
          { label: 'Første reguleringsdato', value: formatDate(first) },
          { label: 'SSB-indeks', value: series?.name || result?.series?.name || catalogSeries?.name || '' },
          { label: 'SSB-kode', value: codes.join(', ') },
          { label: 'Tilbudsdato', value: formatDate(parseIsoDate(draft?.offerDate)) },
          { label: 'Indeksdato', value: basisPeriod ? periodLabel(basisPeriod) : '' },
          { label: 'Gjeldende indeks da', value: indexThen },
          { label: 'Gjeldende indeks nå', value: indexNow },
          { label: 'Endring siden indeksen da', value: change },
          { label: 'Regulert andel', value: share == null ? '' : formatPercent(share) },
          { label: 'Modell', value: model?.short || '' },
          { label: 'Avregningsperiode', value: result?.ok ? periodLabel(result.regulationPoint.period) : '' },
          { label: 'Beregnet tillegg', value: result?.ok ? `${formatMoney(result.addition)} kr` : '' },
        ],
      },
      {
        title: 'Avtalen',
        rows: [
          { label: 'Avtale', value: draft?.title || '' },
          { label: 'Referanse', value: draft?.reference || '' },
          { label: 'Standard', value: standard?.label || draft?.standard || '' },
          { label: 'Motpart', value: draft?.buyer || '' },
          { label: 'Avsender', value: draft?.supplier || '' },
          { label: 'Organisasjonsnummer', value: draft?.orgnr || '' },
          { label: 'Kontakt', value: [draft?.contactName, draft?.phone, draft?.email].filter(Boolean).join(' · ') },
          { label: 'Honorar', value: draft?.honorar || '' },
          { label: 'Grunnlag', value: sum == null ? '' : money(sum) },
          { label: 'Satser', value: rateCount(draft) },
          { label: 'Prisregulering', value: priceRule(draft) },
          { label: 'Nettsted', value: draft?.website || '' },
          { label: 'Dokumenter', value: documents.length ? documents.join(', ') : '' },
        ],
      },
      {
        title: 'Datoer',
        rows: [
          { label: 'Tilbudsfrist', value: formatDate(parseIsoDate(draft?.tenderDeadline)) },
          { label: 'Kontraktsdato', value: formatDate(parseIsoDate(draft?.contractDate)) },
          { label: 'Basismåned fra', value: basis.kind ? `${basis.kind} ${formatDate(basis.date)}` : '' },
          { label: 'Gjeldende fra', value: formatDate(parseIsoDate(draft?.effectiveDate)) },
          { label: 'Denne reguleringen', value: formatDate(parseIsoDate(draft?.regulationDate) || result?.regulationDate) },
          { label: 'Sted', value: draft?.place || '' },
          { label: 'PO-nummer', value: draft?.poNumber || '' },
        ],
      },
      {
        title: 'Vilkår',
        rows: [
          { label: 'Intervall', value: FREQUENCY[draft?.terms?.frequency] || FREQUENCY.month },
          { label: 'Basismåned', value: BASIS[draft?.terms?.baseRule] || BASIS.auto },
          { label: 'Terskel', value: draft?.terms?.thresholdPercent ? `${draft.terms.thresholdPercent} %` : '' },
          { label: 'Tak', value: draft?.terms?.capPercent ? `${draft.terms.capPercent} %` : '' },
          { label: 'Avrunding', value: draft?.terms?.roundToKrone ? 'Nærmeste krone' : '' },
          { label: 'Merverdiavgift', value: draft?.vatPercent != null && draft.vatPercent !== '' ? `${draft.vatPercent} %` : '' },
          ...(draft?.terms?.variables || []).map((row) => ({ label: row.name, value: row.value })),
          { label: 'Tabell', value: table ? `${table}${basisYear ? ` · ${basisYear}` : ''}` : '' },
          { label: 'Kilde', value: source },
        ],
      },
    ].map((group) => ({
      ...group,
      rows: group.rows.map((row) => ({ ...row, value: blank(row.value) })),
    })),
  };
}
