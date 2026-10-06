import { periodLabel } from './engine.js';
import { formatIndex, formatMoney, formatPercent } from './letter.js';

export function regulationEntry(draft, result, letter) {
  const row = result?.rows?.[0] || {};
  const fromPeriod = result?.basisPoint?.period || '';
  const toPeriod = result?.regulationPoint?.period || '';
  const before = Number(row.rate) || 0;
  return {
    id: `${fromPeriod}-${toPeriod}-${before}`,
    savedAt: new Date().toISOString().slice(0, 10),
    before,
    after: Number(row.newRate) || 0,
    increase: Number(row.addition) || Number(result?.addition) || 0,
    fromPeriod,
    fromIndex: Number(result?.basisPoint?.value) || 0,
    toPeriod,
    toIndex: Number(result?.regulationPoint?.value) || 0,
    changePercent: Number(result?.changePercent) || 0,
    formula: result?.model?.formula || '',
    query: [
      result?.model?.formula || '',
      `t0 ${periodLabel(fromPeriod)} = ${formatIndex(result?.basisPoint?.value)}`,
      `t ${periodLabel(toPeriod)} = ${formatIndex(result?.regulationPoint?.value)}`,
      draft?.indexId ? `serie ${draft.indexId}` : '',
      result?.series?.table ? `tabell ${result.series.table}` : '',
    ].filter(Boolean).join(' · '),
    letterTitle: letter?.title || 'Varsel om indeksregulering',
    letterPlain: letter?.plain || '',
  };
}

export function rememberRegulation(list, entry) {
  const rows = Array.isArray(list) ? list.filter((row) => row && row.id && row.id !== entry.id) : [];
  return [entry, ...rows].slice(0, 40);
}

export function regulationCells(entry) {
  return [
    { label: 'Lagret', value: entry.savedAt || '' },
    { label: 'Før', value: `${formatMoney(entry.before)} kr` },
    { label: 'Etter', value: `${formatMoney(entry.after)} kr` },
    { label: 'Økning', value: `${formatMoney(entry.increase)} kr` },
    { label: 'Fra', value: `${periodLabel(entry.fromPeriod)} · ${formatIndex(entry.fromIndex)}` },
    { label: 'Til', value: `${periodLabel(entry.toPeriod)} · ${formatIndex(entry.toIndex)}` },
    { label: 'Endring', value: formatPercent(entry.changePercent) },
    { label: 'Brev', value: entry.letterTitle || '' },
    { label: 'Spørring', value: entry.query || entry.formula || '' },
  ];
}
