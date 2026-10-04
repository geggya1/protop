import { METHOD_NOTES, modelById } from './catalog.js';
import { periodLabel } from './engine.js';

export function formatMoney(value) {
  const number = Number(value) || 0;
  const sign = number < 0 ? '-' : '';
  const [whole, fraction] = Math.abs(number).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${grouped},${fraction}`;
}

export function formatIndex(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return number.toFixed(1).replace('.', ',');
}

export function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return `${number.toFixed(2).replace('.', ',')} %`;
}

export function formatDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!match) return '';
  return `${match[3]}.${match[2]}.${match[1]}`;
}

export function buildLetter(draft, result, options = {}) {
  const today = formatDate(options.today || new Date().toISOString().slice(0, 10));
  const model = result.model || modelById(draft.model);
  const supplier = draft.supplier || 'Entreprenør';
  const buyer = draft.buyer || 'Byggherre';
  const additionWord = result.addition < 0 ? 'reduksjon' : 'tillegg';
  const paragraphs = [];

  paragraphs.push({
    heading: '',
    lines: [
      supplier,
      today,
      '',
      buyer,
      draft.reference ? `Deres referanse: ${draft.reference}` : '',
      '',
      `Indeksregulering – ${draft.title || 'avtale'}`,
    ].filter((line, index, all) => line !== '' || all[index - 1] !== ''),
  });

  paragraphs.push({
    heading: '1. Kravet',
    lines: [
      `${supplier} krever ${additionWord} på ${formatMoney(result.addition)} kroner eksklusive merverdiavgift for ${draft.title || 'avtalen'}.`,
      result.vat
        ? `Merverdiavgift ${String(result.vatPercent).replace('.', ',')} % utgjør ${formatMoney(result.vat)} kroner. Til sammen ${formatMoney(result.payable)} kroner.`
        : 'Det er ikke lagt merverdiavgift på beløpet.',
      `Regulert grunnlag etter justeringen er ${formatMoney(result.regulated)} kroner.`,
    ],
  });

  paragraphs.push({
    heading: '2. Avtale og regel',
    lines: [
      result.standard?.summary || '',
      `Valgt modell: ${model.label}.`,
      `Formel: ${model.formula}.`,
      `A er grunnlaget i kontraktens priser. s er regulert andel, her ${formatPercent(result.share * 100)}. t0 er indeksen i basismåneden. t er indeksen i avregningsmåneden.`,
    ],
  });

  paragraphs.push({
    heading: '3. Indeks',
    lines: [
      `Serie: ${result.series.name}.`,
      `Kilde: ${result.series.source}. Basis: ${result.series.basis}.`,
      result.series.url ? `Tabell: ${result.series.url}` : '',
      `Basismåned fra ${result.basisKind} ${formatDate(result.basisDate)}: ${periodLabel(result.basisPoint.period)}, t0 = ${formatIndex(result.basisPoint.value)}.`,
      `Avregningsmåned ${formatDate(result.regulationDate)}: ${periodLabel(result.regulationPoint.period)}, t = ${formatIndex(result.regulationPoint.value)}.`,
      `Endring i indeksen: ${formatPercent(result.changePercent)}.`,
      result.latest ? `Siste publiserte tall i serien er ${periodLabel(result.latest.period)} = ${formatIndex(result.latest.value)}.` : '',
    ].filter(Boolean),
  });

  if (result.weights?.length) {
    paragraphs.push({
      heading: 'Vekter',
      lines: result.weights.map((row) => `${row.name}: ${formatPercent(row.percent)}`),
    });
  }

  paragraphs.push({
    heading: '4. Slik er beløpet regnet',
    lines: [
      'Hver linje er grunnlag ganget med regulert andel og indeksendringen.',
      ...result.rows.map((row) => (
        `${row.text}: ${formatMoney(row.base)} kr × ${formatPercent(result.share * 100)} × (${formatIndex(row.index)} − ${formatIndex(result.basisPoint.value)}) / ${formatIndex(result.basisPoint.value)} = ${formatMoney(row.addition)} kr. `
        + `Ny sats ${formatMoney(row.newRate)} kr${row.unit ? ` per ${row.unit}` : ''}.`
      )),
      `Sum grunnlag ${formatMoney(result.baseSum)} kroner. ${additionWord[0].toUpperCase()}${additionWord.slice(1)} ${formatMoney(result.addition)} kroner.`,
    ],
  });

  paragraphs.push({
    heading: '5. Det som ligger til grunn for modellen',
    lines: METHOD_NOTES,
  });

  if (draft.model === 'husleie') {
    paragraphs.push({
      heading: '6. Varsel etter husleieloven',
      lines: [
        `Dette brevet er skriftlig varsel etter husleieloven § 4-2. Varselet er datert ${today}.`,
        'Endringen kan ikke settes høyere enn KPI-endringen, og kan tidligst virke ett år etter siste leiefastsetting og én måned etter at varselet er kommet fram.',
        'For leie av bolig kan avtalen ikke gi en større økning. For leie av lokaler kan partene ha avtalt en annen regulering.',
      ],
    });
  }

  const warningLines = result.warnings?.length
    ? result.warnings
    : ['Ingen merknader til frister eller publiserte tall.'];
  paragraphs.push({
    heading: 'Merknader',
    lines: warningLines,
  });

  paragraphs.push({
    heading: 'Kilde og ansvar',
    lines: [
      'Tallene er hentet fra Statistisk sentralbyrås Statistikkbank da brevet ble laget. SSB har ikke ansvar for valg av indeks eller for selve prisjusteringen. Publiserte tall kan bli revidert.',
      'ProTop har regnet ut kravet fra opplysningene i avtalen og de publiserte indeksene. Kontroller mot den signerte avtalen før kravet sendes.',
      '',
      'Vennlig hilsen',
      supplier,
    ],
  });

  const filenameBase = fileBase(draft, result);
  return {
    title: `Indeksregulering – ${draft.title || 'avtale'}`,
    filenameBase,
    today,
    paragraphs,
    plain: paragraphs.map((part) => [part.heading, ...part.lines].filter(Boolean).join('\n')).join('\n\n'),
  };
}

function fileBase(draft, result) {
  const name = `${draft.reference || draft.title || 'avtale'}-${result.regulationPoint?.period || 'indeks'}`
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `indeksregulering-${name || 'avtale'}`;
}

export function workbookSheets(draft, result, letter, catalog = []) {
  const brev = [['Indeksregulering'], [letter.today], [draft.supplier || ''], [draft.buyer || '']];
  letter.paragraphs.forEach((part) => {
    if (part.heading) brev.push([part.heading]);
    part.lines.forEach((line) => brev.push([line]));
    brev.push(['']);
  });

  const beregning = [[
    'Post', 'Grunnlag', 'Enhet', 'Mengde', 'Sats', 'Indeks', 'Endring', 'Tillegg', 'Nytt beløp', 'Ny sats',
  ]];
  result.rows.forEach((row) => {
    beregning.push([
      row.text,
      row.base,
      row.unit,
      row.quantity,
      row.rate,
      row.index,
      row.change,
      row.addition,
      row.regulated,
      row.newRate,
    ]);
  });
  beregning.push([]);
  beregning.push(['Sum grunnlag', result.baseSum]);
  beregning.push(['Indeksregulering', result.addition]);
  beregning.push(['Merverdiavgift', result.vat]);
  beregning.push(['Å betale i tillegg', result.payable]);
  beregning.push(['Regulert grunnlag', result.regulated]);

  const indeks = [['Periode', 'Indeks', 'Serie', result.series?.name || '']];
  const points = catalog.find((row) => row.id === draft.indexId)?.points
    || catalog.find((row) => row.id === result.series?.id)?.points
    || [];
  points.forEach((point) => indeks.push([point.period, point.value]));

  const alle = [['Serie', 'Tabell', 'Basis', 'Siste periode', 'Siste indeks', 'Kilde']];
  catalog.forEach((row) => {
    alle.push([
      row.name,
      row.table,
      row.basis,
      row.latest?.period || '',
      row.latest?.value ?? '',
      row.url || '',
    ]);
  });

  const modell = [
    ['Modell', modelById(draft.model).label],
    ['Formel', modelById(draft.model).formula],
    ['Standard', result.standard?.label || draft.standard],
    ['Basismåned', result.basisPoint ? `${result.basisPoint.period} = ${result.basisPoint.value}` : ''],
    ['Avregningsmåned', result.regulationPoint ? `${result.regulationPoint.period} = ${result.regulationPoint.value}` : ''],
    ['Regulert andel', result.share],
    ['Merverdiavgift', result.vatPercent],
    [],
    ['Regel'],
    [result.standard?.summary || ''],
    [],
    ['Metode'],
    ...METHOD_NOTES.map((note) => [note]),
  ];

  return [
    { name: 'Brev', rows: brev },
    { name: 'Beregning', rows: beregning },
    { name: 'Indeks', rows: indeks },
    { name: 'Alle indekser', rows: alle },
    { name: 'Modell', rows: modell },
  ];
}
