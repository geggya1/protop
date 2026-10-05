/** Sammenligner SSB-tall og sier fra når en avtalt serie har fått et nytt punkt. */

import { contractBasis, parseIsoDate } from './engine.js';

export function osloDate(now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Oslo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function shouldCheckToday(checkedOn, now = new Date()) {
  return String(checkedOn || '') !== osloDate(now);
}

export function latestMap(series) {
  const out = {};
  Object.entries(series || {}).forEach(([id, row]) => {
    if (!row?.latest?.period) return;
    out[id] = {
      name: row.name || id,
      table: row.table || '',
      period: row.latest.period,
      value: row.latest.value,
    };
  });
  return out;
}

export function indexNews(previous, next) {
  const news = [];
  Object.entries(next || {}).forEach(([id, row]) => {
    const before = previous?.[id];
    if (!before?.period || !row?.period) return;
    if (row.period > before.period) {
      news.push({
        id,
        name: row.name || id,
        period: row.period,
        value: row.value,
        previousPeriod: before.period,
        previousValue: before.value,
      });
    }
  });
  return news.sort((a, b) => (a.name < b.name ? -1 : 1));
}

export function periodBucket(period, frequency) {
  const month = /^(\d{4})M(\d{2})$/.exec(period || '');
  if (month) {
    if (frequency === 'year') return month[1];
    if (frequency === 'quarter') return `${month[1]}K${Math.ceil(Number(month[2]) / 3)}`;
    return period;
  }
  const quarter = /^(\d{4})K([1-4])$/.exec(period || '');
  if (quarter) return frequency === 'year' ? quarter[1] : period;
  return period || '';
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

/** Første dag regulering kan virke, med mindre avtalen navngir datoen. */
export function earliestRegulationDate(draft) {
  const named = parseIsoDate(draft?.firstRegulationDate);
  if (named) return named;
  const basis = contractBasis(draft || {}).date;
  if (!basis) return '';
  const frequency = draft?.terms?.frequency || 'month';
  if (frequency === 'once') return parseIsoDate(draft.regulationDate) || basis;
  return nextPeriodStart(basis, frequency);
}

/**
 * Er avtalen klar for indeksregulering?
 * Utgangspunkt: aldri regulert = trenger regulering når siste kjente indeks finnes
 * og avtalen tillater det (ikke unntatt, og bindingstid / første reguleringsdato er passert).
 */
export function regulationStatus({
  draft = {},
  regulatedPeriod = '',
  series = null,
  today = '',
} = {}) {
  const day = parseIsoDate(today) || osloDate();
  const frequency = draft?.terms?.frequency || 'month';
  const indexId = draft?.indexId || '';
  const latest = series?.[indexId]?.latest || null;
  const first = earliestRegulationDate(draft);
  const excluded = !!draft?.regulationExcluded && !draft?.overrideExclusion;

  if (excluded) {
    return {
      due: false,
      allowed: false,
      reason: 'Avtalen holder prisen fast.',
      indexId,
      period: latest?.period || '',
      firstRegulationDate: first,
      regulatedPeriod: regulatedPeriod || '',
    };
  }

  if (first && day < first) {
    return {
      due: false,
      allowed: false,
      reason: `Regulering er bundet til ${first}.`,
      indexId,
      period: latest?.period || '',
      firstRegulationDate: first,
      regulatedPeriod: regulatedPeriod || '',
    };
  }

  if (!indexId) {
    return {
      due: false,
      allowed: true,
      reason: 'Mangler indeks i avtalen.',
      indexId: '',
      period: '',
      firstRegulationDate: first,
      regulatedPeriod: regulatedPeriod || '',
    };
  }

  if (!latest?.period) {
    return {
      due: false,
      allowed: true,
      reason: 'Ingen SSB-indeks er hentet ennå.',
      indexId,
      period: '',
      firstRegulationDate: first,
      regulatedPeriod: regulatedPeriod || '',
    };
  }

  const used = String(regulatedPeriod || '').trim();
  if (!used) {
    return {
      due: true,
      allowed: true,
      reason: 'Avtalen er ikke indeksregulert ennå.',
      indexId,
      period: latest.period,
      value: latest.value,
      firstRegulationDate: first,
      regulatedPeriod: '',
      previousPeriod: '',
    };
  }

  if (frequency === 'once') {
    return {
      due: false,
      allowed: true,
      reason: 'Engangsregulering er allerede gjort.',
      indexId,
      period: latest.period,
      value: latest.value,
      firstRegulationDate: first,
      regulatedPeriod: used,
      previousPeriod: used,
    };
  }

  if (periodBucket(latest.period, frequency) <= periodBucket(used, frequency)) {
    return {
      due: false,
      allowed: true,
      reason: 'Siste kjente indeks er allerede brukt.',
      indexId,
      period: latest.period,
      value: latest.value,
      firstRegulationDate: first,
      regulatedPeriod: used,
      previousPeriod: used,
    };
  }

  return {
    due: true,
    allowed: true,
    reason: 'Ny indeks er publisert siden forrige regulering.',
    indexId,
    period: latest.period,
    value: latest.value,
    firstRegulationDate: first,
    regulatedPeriod: used,
    previousPeriod: used,
  };
}

/** Saker som trenger regulering: aldri gjort, eller ny SSB-periode siden sist. */
export function dueRegulations(cases, series, today = '') {
  return (cases || []).flatMap((row) => {
    const draft = row?.draft || {};
    const status = regulationStatus({
      draft,
      regulatedPeriod: row?.regulatedPeriod || '',
      series,
      today,
    });
    if (!status.due) return [];
    return [{
      caseId: row.id,
      contractId: row.contractId || '',
      title: row.title || draft.title || 'Avtale',
      indexId: status.indexId,
      name: series?.[status.indexId]?.name || status.indexId,
      period: status.period,
      value: status.value,
      previousPeriod: status.previousPeriod || '',
      reason: status.reason,
    }];
  });
}

/** Status per avtale, med lagret sak når den finnes. */
export function dueByContractId(contracts, cases, series, today = '') {
  const byCase = new Map();
  (cases || []).forEach((row) => {
    if (row?.id) byCase.set(row.id, row);
    if (row?.contractId) byCase.set(`contract:${row.contractId}`, row);
  });
  const out = {};
  (contracts || []).forEach((contract) => {
    const caseId = contract?.indeksCaseId || (contract?.id ? `ir-${contract.id}` : '');
    const stored = byCase.get(caseId) || byCase.get(`contract:${contract.id}`) || null;
    const draft = stored?.draft || contract?.indexDraft || {};
    const status = regulationStatus({
      draft: {
        ...draft,
        title: draft.title || contract.title,
        startDate: draft.startDate || contract.start,
        endDate: draft.endDate || contract.end,
        regulationExcluded: draft.regulationExcluded,
      },
      regulatedPeriod: stored?.regulatedPeriod || '',
      series,
      today,
    });
    out[contract.id] = {
      ...status,
      caseId,
      title: contract.title || draft.title || 'Avtale',
    };
  });
  return out;
}
