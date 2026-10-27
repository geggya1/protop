import { METHOD_NOTES, modelById, seriesById, standardById } from './catalog.js';
import { presentCompanyLogo } from '../project/companyLogo.js';
import { honorarPrice } from './priceText.js';

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

export function formatShortDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!match) return formatDate(iso);
  return `${match[3]}.${match[2]}.${match[1].slice(2)}`;
}

export function formatKrone(value) {
  const rounded = Math.round(Number(value) || 0);
  const sign = rounded < 0 ? '-' : '';
  const grouped = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `kr ${sign}${grouped},-`;
}

function formatPlain(value) {
  const number = Number(value) || 0;
  const [whole, fraction] = Math.abs(number).toFixed(2).split('.');
  const grouped = whole.length > 4 ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : whole;
  return `${number < 0 ? '-' : ''}${grouped},${fraction}`;
}

function formatRate(value) {
  const number = Number(value) || 0;
  const whole = Math.abs(number - Math.round(number)) < 0.001;
  if (!whole) return formatPlain(number);
  const digits = String(Math.round(Math.abs(number)));
  const grouped = digits.length > 4 ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : digits;
  return number < 0 ? `-${grouped}` : grouped;
}

function formatPercent1(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return `${number.toFixed(1).replace('.', ',')} %`;
}

function formatOrgnr(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 9) return String(value || '').trim();
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

function formatPhone(value) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 8) return `${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5)}`;
  return raw;
}

function otherThan(value, blocked) {
  const next = String(value || '').trim();
  const ban = String(blocked || '').trim().toLowerCase();
  if (!next || (ban && next.toLowerCase() === ban)) return '';
  return next;
}

function cell(text, span = 1, label = false) {
  return { text: text == null ? '' : String(text), span, label };
}

function isHourly(row) {
  return /time/i.test(`${row?.unit || ''} ${row?.text || ''}`);
}

function seriesCode(series) {
  return (series?.codes || []).find((code) => String(code).includes('.')) || '';
}

function termNotes(draft) {
  const terms = draft.terms || {};
  const notes = [];
  if (terms.baseRule === 'contract') notes.push('Basismåneden er kontraktsdatoen.');
  if (terms.baseRule === 'offer') notes.push('Basismåneden er tilbudsdatoen.');
  if (terms.thresholdPercent) notes.push(`Terskel: endring under ${terms.thresholdPercent} % reguleres ikke.`);
  if (terms.capPercent) notes.push(`Tak: endringen kan ikke overstige ${terms.capPercent} %.`);
  if (terms.frequency === 'quarter') notes.push('Avtalt intervall: kvartalsvis.');
  if (terms.frequency === 'year') notes.push('Avtalt intervall: årlig.');
  if (terms.frequency === 'once') notes.push('Avtalt intervall: engangsregulering.');
  if (terms.roundToKrone) notes.push('Beløpet er avrundet til nærmeste krone.');
  (terms.variables || []).forEach((row) => {
    if (row?.name && row?.value) notes.push(`${row.name}: ${row.value}`);
  });
  return notes;
}

export function buildLetter(draft, result, options = {}) {
  const todayIso = options.today || new Date().toISOString().slice(0, 10);
  const today = formatDate(todayIso);
  const supplier = draft.supplier || 'Avsender';
  const client = otherThan(draft.buyer, supplier);
  const clientEmail = otherThan(draft.email, draft.senderEmail);
  const clientPhone = otherThan(draft.phone, draft.senderPhone);
  const showLogo = options.includeLogo ?? !!draft.useCompanyLogo;
  const hourly = result.rows.length > 0 && result.rows.every(isHourly);
  const title = hourly ? 'Varsel om indeksregulering av timepriser' : 'Varsel om indeksregulering';
  const tableNo = result.series?.table || '';
  const code = seriesCode(result.series);
  const seriesTitle = [code, result.series?.name].filter(Boolean).join(' ');
  const model = result.model || modelById(draft.model);
  const shareText = result.share < 1 ? ` Regulert andel er ${formatPercent1(result.share * 100)}.` : '';
  const rule = (tableNo === '14335'
    ? `${hourly ? 'Timesats' : 'Pris'} reguleres etter SSB prisindeks for konsulentvirksomhet.`
    : `${hourly ? 'Timesats' : 'Pris'} reguleres etter ${result.series?.name || 'avtalt indeks'}.`) + shareText;
  const effective = formatShortDate(draft.effectiveDate || result.regulationDate || todayIso);
  const contractDate = formatDate(draft.contractDate || result.basisDate);
  const first = result.rows[0];
  const priced = honorarPrice(draft, first?.rate);
  const priceLabel = result.rows.length === 1 && priced.amount != null
    ? `${formatKrone(priced.amount)}${priced.phrase ? ` ${priced.phrase}` : ''}`
    : 'Se satsene under';

  const party = {
    heading: 'Om oppdragsgiver',
    columns: 4,
    widths: [132, 150, 118, 115],
    rows: [
      [cell('Oppdragsgiver', 1, true), cell(client), cell('Organisasjonsnr.', 1, true), cell(formatOrgnr(draft.orgnr))],
      [cell('Kontaktperson', 1, true), cell(draft.contactName || ''), cell('Telefonnr.', 1, true), cell(formatPhone(clientPhone))],
      [cell('E-post', 1, true), cell(clientEmail, 3)],
    ],
  };

  const agreement = {
    heading: 'Om avtalen',
    columns: 4,
    widths: [132, 150, 118, 115],
    rows: [
      [cell('Avtalenavn', 1, true), cell(draft.title || ''), cell('Prosjektnummer', 1, true), cell(draft.reference || '')],
      [cell('Eksternt PO-nr.', 1, true), cell(draft.poNumber || ''), cell('Kontraktsdato', 1, true), cell(contractDate)],
      [cell('Generelle bestemmelser', 1, true), cell(draft.standard || ''), cell(result.standard?.label || '', 2)],
      ...(draft.address || draft.place ? [[cell('Oppdragssted', 1, true), cell([draft.address, draft.place].filter(Boolean).join(', '), 3)]] : []),
      [cell('Oppdragstaker', 1, true), cell(supplier), cell('Organisasjonsnr.', 1, true), cell(formatOrgnr(draft.supplierOrgnr))],
      ...(priced.description ? [[cell('Avtalt honorar', 1, true), cell(priced.description, 3)]] : []),
      [cell('Avtalt pris', 1, true), cell(priceLabel, 3)],
    ],
  };

  const regulationRows = result.rows.map((row) => {
    const lineHourly = isHourly(row);
    const ny = lineHourly ? 'Ny timesats' : 'Nytt beløp';
    const rounded = `${formatKrone(row.newRate)} ${priced.phrase || 'eks mva'}`;
    return {
      heading: result.rows.length > 1 ? row.text : (lineHourly ? 'Indeksregulering av timepriser' : 'Indeksregulering'),
      lead: lineHourly
        ? 'Vi varsler herved om at timesatser vil reguleres.'
        : 'Vi varsler herved om at prisen vil reguleres.',
      columns: 6,
      widths: [92, 72, 112, 62, 88, 89],
      rows: [
        [cell('Regulering av pris', 1, true), cell(rule, 5)],
        [cell('Tabell', 1, true), cell(tableNo), cell(seriesTitle, 2), cell('Pris justert', 1, true), cell(formatPlain(row.addition))],
        [cell('Start indeks', 1, true), cell(row.basisPeriod || result.basisPoint.period), cell('Reguleringsdato', 1, true), cell(row.period || result.regulationPoint.period), cell(ny, 1, true), cell(formatPlain(row.newRate))],
        [cell('Indeks 1', 1, true), cell(formatIndex(row.basisValue ?? result.basisPoint.value)), cell('Indeks 2', 1, true), cell(formatIndex(row.index)), cell('', 2)],
        [cell('Sats', 1, true), cell(formatRate(row.rate)), cell('Indeksendring', 1, true), cell(formatIndex(row.index - (row.basisValue ?? result.basisPoint.value))), cell('Endring i %', 1, true), cell(formatPercent1(row.change * 100))],
        [cell(ny, 1, true), cell(rounded, 5)],
        [cell('Gjeldende fra', 1, true), cell(`${ny} er gjeldende fra ${effective}`, 5)],
      ],
    };
  });

  const notice = {
    brand: supplier,
    logo: showLogo ? presentCompanyLogo(options.logo) : null,
    title,
    intro: `Vi varsler herved om indeksregulering av priser i tråd med foreliggende avtale. Indeksreguleringen er basert på siste kjente prisindeks fra når tilbudet ble gitt iht. Statistisk sentralbyrå (SSB) tabell ${tableNo}, som er regulert frem til den siste kjente indeksen pr. dags dato.`,
    sections: [party, agreement, ...regulationRows],
    notes: [
      ...termNotes(draft),
      ...(model.id === 'engang' ? [] : [`${model.label}. ${model.formula}.`]),
      ...(draft.freeText ? [String(draft.freeText).trim()] : []),
      ...(result.warnings || []),
      draft.model === 'husleie'
        ? 'Dette er skriftlig varsel etter husleieloven § 4-2. Endringen kan ikke settes høyere enn KPI, og kan tidligst virke ett år etter siste leiefastsetting og én måned etter at varselet er kommet fram.'
        : '',
      result.vat
        ? `Merverdiavgift ${String(result.vatPercent).replace('.', ',')} % av tillegget utgjør ${formatMoney(result.vat)} kroner. Til sammen ${formatMoney(result.payable)} kroner.`
        : '',
    ].filter(Boolean),
    signoff: {
      place: draft.senderPlace || '',
      date: today,
      name: draft.senderContact || '',
      company: supplier,
    },
    footer: [supplier, hourly ? 'Indeksregulering av timesats' : 'Indeksregulering', draft.website ? `Internett: ${draft.website}` : ''].filter(Boolean),
  };

  return finishLetter({ title, filenameBase: fileBase(draft, result), today }, notice);
}

/** Avsnitt og ren tekst lages alltid fra brevets felter, også etter manuelle endringer. */
function finishLetter(meta, notice) {
  const paragraphs = [
    { heading: notice.brand, lines: [notice.title, '', notice.intro] },
    ...notice.sections.map((section) => ({
      heading: section.heading,
      lines: [
        section.lead,
        ...section.rows.map((row) => row.map((item) => item.text).filter(Boolean).join(' | ')),
      ].filter(Boolean),
    })),
    ...(notice.notes.length ? [{ heading: 'Merknader', lines: notice.notes }] : []),
    {
      heading: 'Med vennlig hilsen',
      lines: [
        notice.signoff.place ? `Sted: ${notice.signoff.place}` : '',
        `Dato: ${notice.signoff.date}`,
        'Underskrift',
        notice.signoff.name,
        notice.signoff.company,
      ].filter(Boolean),
    },
  ];

  return {
    title: notice.title || meta.title,
    filenameBase: meta.filenameBase,
    today: meta.today,
    paragraphs,
    notice,
    plain: paragraphs.map((part) => [part.heading, ...part.lines].filter(Boolean).join('\n')).join('\n\n'),
  };
}

/** Bygger samme brev som en ny beregning, ut fra en lagret sak eller eldre regulering. */
export function letterFromRecord(draft, record, options = {}) {
  if (!record) return null;
  const nextValue = Number(record.newIndex ?? record.toIndex);
  const newPrice = Number(record.newPrice ?? record.after);
  if (!Number.isFinite(nextValue) || !Number.isFinite(newPrice) || !newPrice) return null;
  const basisValue = Number(record.basisIndex ?? record.fromIndex ?? record.previousIndex);
  const basis = Number.isFinite(basisValue) ? basisValue : nextValue;
  const previousPrice = Number(record.previousPrice ?? record.before);
  const price = Number.isFinite(previousPrice) && previousPrice ? previousPrice : newPrice;
  const storedAddition = Number(record.addition ?? record.increase);
  const addition = Number.isFinite(storedAddition) ? storedAddition : Math.round((newPrice - price) * 100) / 100;
  const series = seriesById(draft?.indexId || record.indexId) || {};
  const model = modelById(draft?.model) || { id: draft?.model || '', label: '', formula: '' };
  const standard = standardById(draft?.standard) || { id: '', label: draft?.standard || '' };
  const basisPeriod = record.basisPeriod || record.fromPeriod || record.previousPeriod || '';
  const nextPeriod = record.newPeriod || record.toPeriod || '';
  const hourly = /time/i.test(`${draft?.lines?.[0]?.unit || ''} ${draft?.lines?.[0]?.text || ''} ${draft?.honorar || ''}`);
  const result = {
    ok: true,
    warnings: [],
    model,
    standard,
    regulationDate: record.effectiveFrom || record.savedAt || '',
    share: 1,
    vatPercent: 0,
    vat: 0,
    payable: addition,
    baseSum: price,
    addition,
    regulated: newPrice,
    series: {
      id: series.id || draft?.indexId || record.indexId || '',
      name: record.seriesName || series.name || '',
      table: record.table || series.table || '',
      codes: series.codes || [],
    },
    basisPoint: { period: basisPeriod, value: basis },
    regulationPoint: { period: nextPeriod, value: nextValue },
    rows: [{
      text: hourly ? 'Timepris' : 'Pris',
      unit: hourly ? 'time' : 'RS',
      rate: price,
      quantity: 1,
      period: nextPeriod,
      index: nextValue,
      basisValue: basis,
      basisPeriod,
      change: price ? addition / price : 0,
      addition,
      regulated: newPrice,
      newRate: newPrice,
    }],
  };
  const letter = buildLetter({
    ...draft,
    effectiveDate: record.effectiveFrom || draft?.effectiveDate || '',
    freeText: record.freeText || draft?.freeText || '',
  }, result, options);
  return { letter: applyLetterEdits(letter, record.letterEdits), result };
}

const EMPTY_LETTER_FIELDS = [
  'Avsender',
  'Tittel',
  'Innledning',
  'Oppdragsgiver',
  'Organisasjonsnr.',
  'Kontaktperson',
  'Telefonnr.',
  'E-post',
  'Avtalenavn',
  'Prosjektnummer',
  'Eksternt PO-nr.',
  'Kontraktsdato',
  'Generelle bestemmelser',
  'Oppdragssted',
  'Oppdragstaker',
  'Avtalt honorar',
  'Avtalt pris',
  'Regulering av pris',
  'Tabell',
  'Pris justert',
  'Start indeks',
  'Reguleringsdato',
  'Ny timesats',
  'Indeks 1',
  'Indeks 2',
  'Sats',
  'Indeksendring',
  'Endring i %',
  'Gjeldende fra',
  'Merknad',
  'Sted',
  'Dato',
  'Underskriver',
  'Selskap',
];

function fieldText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Går gjennom brevets felter i samme rekkefølge som PDF-en.
 * Hvert felt får en fast nøkkel («Merknad 2») og en funksjon som skriver ny tekst inn i en kopi av brevet.
 */
function noticeFields(notice) {
  const fields = [];
  const seen = new Map();
  function add(label, value, write) {
    const name = fieldText(label);
    if (!name) return;
    const count = (seen.get(name) || 0) + 1;
    seen.set(name, count);
    fields.push({ key: count === 1 ? name : `${name} ${count}`, value: fieldText(value), write });
  }
  add('Avsender', notice.brand, (next, value) => { next.brand = value; });
  add('Tittel', notice.title, (next, value) => { next.title = value; });
  add('Innledning', notice.intro, (next, value) => { next.intro = value; });
  (notice.sections || []).forEach((section, sectionIndex) => {
    if (section.lead) {
      add(section.heading || 'Tekst', section.lead, (next, value) => { next.sections[sectionIndex].lead = value; });
    }
    (section.rows || []).forEach((row, rowIndex) => {
      let label = '';
      let start = -1;
      const values = [];
      const flush = (end) => {
        if (!label) return;
        const from = start + 1;
        add(label, values.join(' '), (next, value) => {
          const cells = next.sections[sectionIndex].rows[rowIndex];
          const run = cells.slice(from, end);
          const span = run.reduce((sum, item) => sum + (item?.span || 1), 0) || 1;
          cells.splice(from, run.length, cell(value, span));
        });
      };
      row.forEach((item, index) => {
        if (item?.label) {
          flush(index);
          values.length = 0;
          label = item.text;
          start = index;
        } else if (item?.text) {
          values.push(item.text);
        }
      });
      flush(row.length);
    });
  });
  (notice.notes || []).forEach((line, index) => add('Merknad', line, (next, value) => { next.notes[index] = value; }));
  add('Sted', notice.signoff?.place || '', (next, value) => { next.signoff.place = value; });
  add('Dato', notice.signoff?.date || '', (next, value) => { next.signoff.date = value; });
  add('Underskriver', notice.signoff?.name || '', (next, value) => { next.signoff.name = value; });
  add('Selskap', notice.signoff?.company || '', (next, value) => { next.signoff.company = value; });
  return fields;
}

/** Lange brevfelter skal ha hele bredden. Korte felt deler raden. */
export function letterFieldWide(label, value) {
  const name = String(label || '').replace(/\s+\d+$/, '').trim();
  if (name === 'Innledning' || name === 'Regulering av pris' || name === 'Avtalt honorar' || name === 'Gjeldende fra' || name === 'Merknad') {
    return true;
  }
  return String(value || '').trim().length > 48;
}

/** Alle felt som brevet faktisk omtaler, i samme rekkefølge som PDF-en. */
export function letterFieldRows(letter, { filled = true } = {}) {
  const notice = letter?.notice;
  if (!notice) return EMPTY_LETTER_FIELDS.map((label) => [label, '']);
  const rows = noticeFields(notice).map((field) => [field.key, field.value]);
  if (filled) return rows;
  return rows.map(([label]) => [label, '']);
}

/** Bare tekstfelt med nøkkel og verdi tas vare på. */
export function cleanLetterEdits(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out = {};
  Object.keys(input).slice(0, 120).forEach((key) => {
    const name = fieldText(key).slice(0, 80);
    if (name && typeof input[key] === 'string') out[name] = fieldText(input[key]).slice(0, 2000);
  });
  return out;
}

/** Feltene som skiller seg fra det beregnede brevet. Like verdier lagres ikke. */
export function letterEditsFrom(letter, values) {
  const out = {};
  if (!letter?.notice || !values) return out;
  noticeFields(letter.notice).forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(values, field.key)) return;
    const value = fieldText(values[field.key]);
    if (value !== field.value) out[field.key] = value;
  });
  return out;
}

/**
 * Legger manuelle endringer inn i brevet. Nøklene er de samme som i letterFieldRows.
 * En tom merknad fjernes. Beregnet pris og indeks i saken endres ikke.
 */
export function applyLetterEdits(letter, edits) {
  const clean = cleanLetterEdits(edits);
  if (!letter?.notice || !Object.keys(clean).length) return letter;
  const notice = {
    ...letter.notice,
    sections: (letter.notice.sections || []).map((section) => ({
      ...section,
      rows: (section.rows || []).map((row) => row.map((item) => ({ ...item }))),
    })),
    notes: [...(letter.notice.notes || [])],
    signoff: { ...(letter.notice.signoff || {}) },
    footer: [...(letter.notice.footer || [])],
  };
  let changed = false;
  noticeFields(letter.notice).reverse().forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(clean, field.key)) return;
    if (clean[field.key] === field.value) return;
    field.write(notice, clean[field.key]);
    changed = true;
  });
  if (!changed) return letter;
  notice.notes = notice.notes.filter(Boolean);
  return finishLetter(letter, notice);
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
