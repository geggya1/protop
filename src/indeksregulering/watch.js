/** Sammenligner SSB-tall og sier fra når en avtalt serie har fått et nytt punkt. */

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

/** Saker der avtalt intervall har fått en ny indeks siden forrige regulering. */
export function dueRegulations(cases, series) {
  return (cases || []).flatMap((row) => {
    const draft = row?.draft || {};
    const frequency = draft.terms?.frequency || 'month';
    if (frequency === 'once') return [];
    const indexId = draft.indexId;
    const latest = series?.[indexId]?.latest;
    const used = row.regulatedPeriod;
    if (!latest?.period || !used) return [];
    if (periodBucket(latest.period, frequency) <= periodBucket(used, frequency)) return [];
    return [{
      caseId: row.id,
      title: row.title || draft.title || 'Avtale',
      indexId,
      name: series[indexId]?.name || indexId,
      period: latest.period,
      value: latest.value,
      previousPeriod: used,
    }];
  });
}
