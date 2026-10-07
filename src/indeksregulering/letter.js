import { METHOD_NOTES, modelById } from './catalog.js';
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
    title,
    filenameBase: fileBase(draft, result),
    today,
    paragraphs,
    notice,
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
