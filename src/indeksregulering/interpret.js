import { INDEX_SERIES, STANDARDS } from './catalog.js';
import { emptyDraft, emptyLine, parseAmount, parseIsoDate } from './engine.js';

const STANDARD_ORDER = [
  ['NS 8417', /NS\s*8417/i],
  ['NS 8416', /NS\s*8416/i],
  ['NS 8415', /NS\s*8415/i],
  ['NS 8407', /NS\s*8407/i],
  ['NS 8406', /NS\s*8406/i],
  ['NS 8405', /NS\s*8405/i],
  ['bustadoppføringslova', /bustadoppføringslov[ae]|buofl\b/i],
  ['håndverkertjenesteloven', /håndverkertjenesteloven|handverkartenestelova/i],
  ['husleieloven', /husleieloven|husleie|leiekontrakt|leietaker/i],
];

const INDEX_HINTS = [
  ['bki-veg-tunnel', /fjelltunnel/i],
  ['bki-veg-bru', /betongbru/i],
  ['bki-veg', /veganlegg|anleggsindeks/i],
  ['bki-ror', /rørleggerindeks|rorleggjar|rørleggerarbeid i kontor/i],
  ['bki-enebolig', /enebolig|einebustad|småhus/i],
  ['bki-boligblokk', /boligblokk|bustadblokk/i],
  ['bki-bustader-arbeid', /arbeidskraftindeks|indeks for arbeidskraft/i],
  ['bki-bustader-materialer', /materialindeks|indeks for materialer/i],
  ['kpi', /konsumprisindeks|\bKPI\b/i],
  ['bki-bustader', /byggekostnadsindeks for boliger|bustader i alt|boliger i alt/i],
];

export function interpretContract(text) {
  const source = String(text || '').replace(/\u00a0/g, ' ').trim();
  const findings = [];
  const draft = emptyDraft({ lines: [], findings, engine: 'lokal' });
  if (source.length < 20) {
    findings.push('Teksten er for kort til å lese en avtale. Feltene kan fylles ut for hånd.');
    draft.findings = findings;
    draft.lines = [emptyLine({ text: 'Kontraktssum' })];
    return draft;
  }

  const standardId = STANDARD_ORDER.find(([, pattern]) => pattern.test(source))?.[0] || '';
  if (standardId) {
    draft.standard = standardId;
    draft.model = STANDARDS[standardId].model;
    draft.indexId = STANDARDS[standardId].indexId;
    findings.push(`Kjenner igjen ${STANDARDS[standardId].label}.`);
  } else {
    findings.push('Fant ingen navngitt standard. Modellen er satt til avtalt engangsregulering, og kan endres.');
    draft.standard = 'avtalt';
  }

  const excluded = /ikke\s+skal\s+indeksreguler|uten\s+indeksregulering|ingen\s+indeksregulering|prisene\s+er\s+faste|fastpris\s+uten|indeksregulering\s*[:\-]?\s*nei/i.test(source);
  const included = /skal\s+indeksreguler|indeksreguleres|lønns-\s*og\s*prisstigning|\bLPS\b|NS\s*3405/i.test(source);
  draft.regulationExcluded = excluded && !included;
  if (draft.regulationExcluded) findings.push('Avtalen sier at prisen ikke skal indeksreguleres.');
  else if (included) findings.push('Avtalen sier at prisen skal indeksreguleres.');
  else if (standardId.startsWith('NS 84')) findings.push('NS-kontrakten sier ikke at regulering er valgt bort. Da gjelder indeksregulering etter standarden.');

  const hinted = INDEX_HINTS.find(([, pattern]) => pattern.test(source));
  if (hinted) {
    draft.indexId = hinted[0];
    const series = INDEX_SERIES.find((row) => row.id === hinted[0]);
    findings.push(`Indeks i avtalen: ${series?.name || hinted[0]}.`);
  } else if (standardId) {
    const series = INDEX_SERIES.find((row) => row.id === draft.indexId);
    findings.push(`Ingen serie er navngitt. Forslag etter standarden: ${series?.name}.`);
  }

  const share = readShare(source);
  if (share != null) {
    draft.sharePercent = String(share);
    findings.push(`Regulert andel er lest som ${share} %.`);
  }

  draft.tenderDeadline = labeledDate(source, ['tilbudsfrist', 'frist for tilbud', 'tilbudsfristens utløp']);
  draft.offerDate = labeledDate(source, ['tilbudsdato', 'dato for tilbud', 'tilbudet er datert', 'tilbud av']);
  const contractDate = labeledDate(source, ['kontraktsdato', 'avtale dato', 'signert', 'leien er fastsatt', 'leiefastsetting']);
  if (!draft.offerDate && contractDate) draft.offerDate = contractDate;
  if (draft.tenderDeadline) findings.push(`Tilbudsfrist ${showDate(draft.tenderDeadline)}.`);
  if (draft.offerDate) findings.push(`Tilbudsdato eller siste prisfastsetting ${showDate(draft.offerDate)}.`);

  draft.buyer = labeledParty(source, ['byggherre', 'oppdragsgiver', 'bestiller', 'utleier']);
  draft.supplier = labeledParty(source, ['entreprenør', 'entreprenor', 'leverandør', 'leverandor', 'leietaker']);
  draft.title = labeledParty(source, ['prosjekt', 'arbeid', 'eiendom', 'leieobjekt']) || firstLine(source);
  draft.reference = labeledParty(source, ['kontraktsnummer', 'kontraktsnr', 'kontrakt nr', 'referanse', 'deres ref']);

  if (/inkl(?:usive|\.)?\s*mva|inkludert merverdiavgift/i.test(source) && !/eks(?:kl|\.)/i.test(source)) {
    draft.vatPercent = '0';
    findings.push('Beløpene ser ut til å være inklusive merverdiavgift. Avgiften legges ikke på en gang til.');
  } else if (draft.model === 'husleie') {
    draft.vatPercent = '0';
  }

  const lines = readLines(source);
  const lump = readLump(source, draft.model === 'husleie');
  if (lines.length) {
    draft.lines = lump == null ? lines : [
      emptyLine({
        text: draft.model === 'husleie' ? 'Gjeldende husleie' : 'Kontraktssum',
        quantity: '1',
        unit: draft.model === 'husleie' ? 'mnd' : 'RS',
        rate: String(lump),
        included: false,
      }),
      ...lines,
    ];
    findings.push(`Leste ${lines.length} sats${lines.length === 1 ? '' : 'er'} fra avtalen.`);
    if (lump != null) {
      findings.push(`Kontraktssummen ${lump} kroner er tatt med som egen linje, men er ikke med i kravet samtidig med satsene. Kryss på den linjen som skal reguleres.`);
    }
  } else if (lump != null) {
    draft.lines = [emptyLine({
      text: draft.model === 'husleie' ? 'Gjeldende husleie' : 'Kontraktssum',
      quantity: '1',
      unit: draft.model === 'husleie' ? 'mnd' : 'RS',
      rate: String(lump),
    })];
    findings.push(draft.model === 'husleie'
      ? `Gjeldende leie er lest som ${lump} kroner.`
      : `Kontraktssum er lest som ${lump} kroner.`);
  } else {
    draft.lines = [emptyLine({ text: draft.model === 'husleie' ? 'Gjeldende husleie' : 'Kontraktssum' })];
    findings.push('Fant ikke et beløp eller en sats. Legg det inn før beregningen.');
  }

  draft.findings = findings;
  return draft;
}

export function mergeInterpretation(local, ai) {
  const base = local || interpretContract('');
  const extra = ai && typeof ai === 'object' ? ai : {};
  const next = {
    ...base,
    findings: [...(base.findings || [])],
  };
  const textFields = ['title', 'reference', 'buyer', 'supplier', 'standard', 'model', 'indexId', 'offerDate', 'tenderDeadline'];
  textFields.forEach((key) => {
    const value = clean(extra[key]);
    if (!value) return;
    if (key === 'offerDate' || key === 'tenderDeadline') {
      const iso = parseIsoDate(value);
      if (iso) next[key] = iso;
      return;
    }
    if (key === 'standard' && !STANDARDS[value]) return;
    if (key === 'model' && !['ns3405', 'engang', 'husleie', 'vektet'].includes(value)) return;
    if (key === 'indexId' && !INDEX_SERIES.some((row) => row.id === value)) return;
    next[key] = value;
  });
  if (extra.sharePercent != null && extra.sharePercent !== '') {
    const share = parseAmount(extra.sharePercent);
    if (share != null) next.sharePercent = String(Math.min(100, Math.max(0, share)));
  }
  if (extra.vatPercent != null && extra.vatPercent !== '') {
    const vat = parseAmount(extra.vatPercent);
    if (vat != null) next.vatPercent = String(vat);
  }
  if (extra.regulationExcluded === true) next.regulationExcluded = true;
  if (extra.regulationExcluded === false) next.regulationExcluded = false;
  if (Array.isArray(extra.lines) && extra.lines.some((line) => parseAmount(line?.rate) != null)) {
    next.lines = extra.lines.slice(0, 40).map((line) => emptyLine({
      text: clean(line.text).slice(0, 120),
      quantity: line.quantity == null || line.quantity === '' ? '1' : String(line.quantity),
      unit: clean(line.unit) || 'RS',
      rate: line.rate == null ? '' : String(line.rate),
    }));
  }
  next.engine = extra.engine || 'gemini';
  next.findings.push('AI leste avtalen og fylte ut feltene som var tydelige. Kontroller før brevet sendes.');
  return next;
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function labeledDate(text, labels) {
  const pattern = new RegExp(`(?:${labels.join('|')})[^\\n\\d]{0,40}(\\d{1,2}\\.\\d{1,2}\\.\\d{4}|\\d{4}-\\d{2}-\\d{2})`, 'i');
  const match = text.match(pattern);
  return match ? parseIsoDate(match[1]) : '';
}

function labeledParty(text, labels) {
  const pattern = new RegExp(`(?:${labels.join('|')})\\s*[:\\-]\\s*([^\\n]{2,80})`, 'i');
  const match = text.match(pattern);
  if (!match) return '';
  return match[1].replace(/\s{2,}/g, ' ').replace(/[,;].*$/, '').trim();
}

function firstLine(text) {
  const line = text.split('\n').map((row) => row.trim()).find((row) => row.length > 8 && row.length < 100);
  return line || '';
}

function showDate(iso) {
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
}

function readShare(text) {
  const fixed = text.match(/fast\s+andel\s*(?:på|er|av|:)?\s*(\d{1,3}(?:[.,]\d+)?)\s*%/i);
  if (fixed) {
    const number = parseAmount(fixed[1]);
    if (number != null) return Math.min(100, Math.max(0, Math.round(100 - number)));
  }
  const direct = text.match(/(?:regulert\s+andel|reguleres\s+med|andel\s+som\s+reguleres)\s*(?:på|er|av|:)?\s*(\d{1,3}(?:[.,]\d+)?)\s*%/i)
    || text.match(/(\d{1,3}(?:[.,]\d+)?)\s*%\s*(?:av\s+(?:kontraktssummen|vederlaget)\s+)?reguleres/i);
  if (direct) {
    const number = parseAmount(direct[1]);
    if (number != null) return Math.min(100, Math.max(0, Math.round(number)));
  }
  return null;
}

function readLump(text, rent) {
  const labels = rent
    ? ['månedsleie', 'husleie', 'leie per måned', 'leien er', 'gjeldende leie']
    : ['kontraktssum', 'entreprisesum', 'vederlag', 'kontraktssummen er', 'sum eks'];
  const pattern = new RegExp(`(?:${labels.join('|')})[^\\n\\d]{0,24}(\\d[\\d\\s.]*(?:,\\d{1,2})?)`, 'i');
  const match = text.match(pattern);
  if (!match) return null;
  const number = parseAmount(match[1]);
  if (number == null || number <= 0) return null;
  return number;
}

function readLines(text) {
  const found = [];
  const pattern = /(timepris|enhetspris|sats)\s+(.{2,60}?)\s+(\d[\d\s.]*(?:,\d{1,2})?)\s*(?:kr|nok)?/gi;
  let match = pattern.exec(text);
  while (match && found.length < 30) {
    const rate = parseAmount(match[3]);
    if (rate != null && rate > 0) {
      found.push(emptyLine({
        text: `${match[1]} ${match[2]}`.replace(/\s+/g, ' ').trim(),
        quantity: '1',
        unit: /time/i.test(match[1]) ? 'time' : 'enhet',
        rate: String(rate),
      }));
    }
    match = pattern.exec(text);
  }
  return found;
}
