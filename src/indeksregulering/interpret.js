import { INDEX_SERIES, STANDARDS } from './catalog.js';
import { emptyDraft, emptyLine, emptyTerms, parseAmount, parseIsoDate } from './engine.js';

const STANDARD_ORDER = [
  ['NS 8403', /NS\s*8403/i],
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
  ['ppi-byggeteknisk', /byggeteknisk konsulent|tabell\s*14335|71\.121|konsulentvirksomhet/i],
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
  draft.firstRegulationDate = labeledDate(source, ['første reguleringsdato', 'forste reguleringsdato', 'første regulering', 'reguleres første gang', 'reguleres forste gang']);
  const contractDate = labeledDate(source, ['kontraktsdato', 'avtale dato', 'signert', 'leien er fastsatt', 'leiefastsetting', 'oppdrag gitt pr dato'])
    || trailingDate(source);
  if (contractDate) draft.contractDate = contractDate;
  if (!draft.offerDate && contractDate) draft.offerDate = contractDate;
  draft.startDate = labeledDate(source, ['oppstart', 'engasjementsperioden', 'start dato']);
  draft.endDate = labeledDate(source, ['sluttdato', 'avsluttes', 'slutt dato']);
  if (draft.tenderDeadline) findings.push(`Tilbudsfrist ${showDate(draft.tenderDeadline)}.`);
  if (draft.offerDate) findings.push(`Tilbudsdato eller siste prisfastsetting ${showDate(draft.offerDate)}.`);
  if (draft.startDate) findings.push(`Oppstart ${showDate(draft.startDate)}.`);
  if (draft.endDate) findings.push(`Sluttdato ${showDate(draft.endDate)}.`);

  draft.buyer = labeledParty(source, ['byggherre', 'oppdragsgiver', 'bestiller', 'utleier']);
  draft.supplier = labeledParty(source, ['entreprenør', 'entreprenor', 'leverandør', 'leverandor', 'leietaker', 'oppdragstaker']);
  draft.title = assignmentTitle(source) || labeledParty(source, ['prosjekt', 'arbeid', 'eiendom', 'leieobjekt']) || firstLine(source);
  draft.reference = labeledParty(source, ['kontraktsnummer', 'kontraktsnr', 'kontrakt nr', 'referanse', 'deres ref']);
  draft.contactName = labeledParty(source, ['kontakt person', 'kontaktperson']);
  draft.orgnr = partyOrgnr(source, 'oppdragsgiver') || partyOrgnr(source, 'byggherre');
  draft.place = assignmentPlace(source);
  draft.honorar = honorarText(source);
  const startIndex = source.match(/start\s*indeks\s*[:\-]?\s*K([1-4])\s*(\d{4})/i);
  if (startIndex && !draft.firstRegulationDate) {
    const month = ['01', '04', '07', '10'][Number(startIndex[1]) - 1];
    draft.firstRegulationDate = `${startIndex[2]}-${month}-01`;
    findings.push(`Startindeks K${startIndex[1]} ${startIndex[2]}.`);
  }

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

  readTerms(source, draft, findings);
  draft.documents = [];
  draft.extracted = {
    share: share != null,
    index: Boolean(hinted),
    terms: draft.terms.baseRule !== 'auto' || draft.terms.frequency !== 'month' || draft.terms.thresholdPercent !== '' || draft.terms.capPercent !== '' || draft.terms.roundToKrone || draft.terms.variables.length > 0,
  };
  draft.findings = findings;
  return draft;
}

/** Leser alle avtaledokumentene i rekkefølge. Et senere dokument kan endre vilkårene. */
export function interpretDocuments(docs) {
  const list = (docs || []).filter((doc) => String(doc?.text || '').trim().length >= 20);
  if (!list.length) return interpretContract('');
  let draft = interpretContract(list[0].text);
  for (let index = 1; index < list.length; index += 1) {
    draft = applyLaterDocument(draft, interpretContract(list[index].text), list[index].name || `Dokument ${index + 1}`);
  }
  draft.documents = list.map((doc, index) => ({
    id: doc.id || `dok-${index + 1}`,
    name: doc.name || `Dokument ${index + 1}`,
  }));
  draft.findings = [`Leste ${list.length} avtaledokument${list.length === 1 ? '' : 'er'}.`, ...draft.findings];
  return draft;
}

function applyLaterDocument(base, next, name) {
  const draft = { ...base, findings: [...(base.findings || [])], terms: emptyTerms(base.terms) };
  if (next.extracted?.share) draft.sharePercent = next.sharePercent;
  if (next.extracted?.index) draft.indexId = next.indexId;
  if (next.standard && next.standard !== 'avtalt') draft.standard = next.standard;
  if (next.model) draft.model = next.model;
  ['offerDate', 'tenderDeadline', 'contractDate', 'buyer', 'supplier', 'title', 'reference', 'startDate', 'endDate', 'contactName', 'orgnr', 'place', 'honorar'].forEach((key) => {
    if (next[key]) draft[key] = next[key];
  });
  if (next.extracted?.terms) draft.terms = emptyTerms(next.terms);
  if (next.regulationExcluded) draft.regulationExcluded = true;
  const extraLines = (next.lines || []).filter((line) => parseAmount(line.rate) != null);
  if (extraLines.length) {
    const seen = new Set((draft.lines || []).map((line) => `${line.text}|${line.rate}`));
    extraLines.forEach((line) => {
      const key = `${line.text}|${line.rate}`;
      if (!seen.has(key)) draft.lines = [...(draft.lines || []), line];
    });
  }
  draft.findings.push(`${name} er lest inn etter de andre dokumentene.`);
  draft.extracted = {
    share: base.extracted?.share || next.extracted?.share,
    index: base.extracted?.index || next.extracted?.index,
    terms: base.extracted?.terms || next.extracted?.terms,
  };
  return draft;
}

export function mergeInterpretation(local, ai, sourceText = '') {
  const base = local || interpretContract('');
  const extra = {
    ...(ai && typeof ai === 'object' ? ai : {}),
    sourceText: sourceText || ai?.sourceText || '',
  };
  const next = {
    ...base,
    findings: [...(base.findings || [])],
  };
  const textFields = ['title', 'reference', 'buyer', 'supplier', 'standard', 'model', 'indexId', 'offerDate', 'tenderDeadline', 'contractDate', 'startDate', 'endDate', 'honorar', 'place', 'poNumber', 'orgnr', 'contactName', 'phone', 'email'];
  textFields.forEach((key) => {
    const value = clean(extra[key]);
    if (!value) return;
    if (['offerDate', 'tenderDeadline', 'contractDate', 'startDate', 'endDate'].includes(key)) {
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
  if (extra.terms && typeof extra.terms === 'object') {
    const terms = emptyTerms(next.terms);
    const rule = clean(extra.terms.baseRule);
    if (['auto', 'tender', 'offer', 'contract'].includes(rule)) terms.baseRule = rule;
    const frequency = clean(extra.terms.frequency);
    if (['month', 'quarter', 'year', 'once'].includes(frequency)) terms.frequency = frequency;
    const threshold = parseAmount(extra.terms.thresholdPercent);
    if (threshold != null) terms.thresholdPercent = String(threshold);
    const cap = parseAmount(extra.terms.capPercent);
    if (cap != null) terms.capPercent = String(cap);
    if (extra.terms.roundToKrone === true) terms.roundToKrone = true;
    if (Array.isArray(extra.terms.variables)) {
      terms.variables = extra.terms.variables.slice(0, 20).map((row) => ({
        name: clean(row?.name).slice(0, 80),
        value: clean(row?.value).slice(0, 40),
      })).filter((row) => row.name && row.value);
    }
    next.terms = terms;
  }
  if (Array.isArray(extra.lines) && extra.lines.some((line) => parseAmount(line?.rate) != null)) {
    const source = String(extra.sourceText || '');
    const candidates = extra.lines.slice(0, 40).filter((line) => (
      !source || numberAppears(source, line?.rate)
    ));
    if (!candidates.length && source) {
      next.findings.push('AI oppga satser som ikke står i avtaleteksten. De lokale satsene er beholdt.');
    } else if (candidates.length) {
      next.lines = candidates.map((line) => emptyLine({
        text: clean(line.text).slice(0, 120),
        quantity: line.quantity == null || line.quantity === '' ? '1' : String(line.quantity),
        unit: clean(line.unit) || 'RS',
        rate: line.rate == null ? '' : String(line.rate),
        indexId: INDEX_SERIES.some((row) => row.id === line.indexId) ? line.indexId : '',
        sharePercent: line.sharePercent == null ? '' : String(line.sharePercent),
        included: line.included !== false,
      }));
    }
  }
  if (sourceHasShare(extra) && extra.sourceText && !numberAppears(extra.sourceText, next.sharePercent)) {
    next.sharePercent = base.sharePercent;
    next.findings.push('Andelen fra AI står ikke i teksten. Den lokale andelen er beholdt.');
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
  const colon = new RegExp(`(?:${labels.join('|')})\\s*[:\\-]\\s*([^\\n]{2,80})`, 'i');
  let match = text.match(colon);
  if (match) return cleanParty(match[1]);
  const space = new RegExp(`(?:^|\\n)\\s*(?:${labels.join('|')})\\s+([A-ZÆØÅ][^\\n]{2,80})`, 'i');
  match = text.match(space);
  if (!match) return '';
  return cleanParty(match[1]);
}

function cleanParty(raw) {
  return String(raw || '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+(Organisasjons\s*nr|Org\.?nr|Kontakt|Epost|Telefon|Adresse|Att|Post nr|Gnr).*$/i, '')
    .replace(/[,;].*$/, '')
    .trim();
}

function assignmentTitle(text) {
  const oppdrag = text.match(/\bOppdrag\s+([A-ZÆØÅa-zæøå0-9][^\n]{1,70}?)(?:\s+Eksternt|\s+PO\.|\s+Oppdrags\s*nummer|\s+Oppdragssted|$)/i);
  const beskrivelse = text.match(/Beskrivelse av oppdraget\s+([^\n]{2,80})/i);
  const name = oppdrag ? cleanParty(oppdrag[1]) : '';
  const role = beskrivelse ? cleanParty(beskrivelse[1]) : '';
  if (name && role) return `${name} · ${role}`;
  return name || role;
}

function trailingDate(text) {
  const matches = [...String(text || '').matchAll(/\bDato:\s*(\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})/gi)];
  if (!matches.length) return '';
  return parseIsoDate(matches[matches.length - 1][1]);
}

function partyOrgnr(text, label) {
  const pattern = new RegExp(`${label}[^\\n]{0,80}Organisasjons\\s*nr[:\\s]*(\\d[\\d\\s]{6,12})`, 'i');
  const match = String(text || '').match(pattern);
  if (!match) return '';
  return match[1].replace(/\s/g, '').slice(0, 9);
}

function assignmentPlace(text) {
  const signature = String(text || '').match(/Sted:\s*([A-ZÆØÅa-zæøå][^\n]{1,40}?)\s+Dato:/i);
  if (signature) return cleanParty(signature[1]);
  return labeledParty(text, ['oppdragssted']);
}

function honorarText(text) {
  const match = String(text || '').match(/(?:avtalt\s+honorar(?:\s+pris)?|honoreres etter[^\n]{0,40})[^\n]{0,40}?(\d[\d\s.]*(?:,\d{1,2})?\s*-?)/i);
  if (!match) return '';
  const amount = parseAmount(match[1]);
  if (amount == null) return match[0].replace(/\s+/g, ' ').trim().slice(0, 80);
  return `${amount} kr eks. mva`;
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
    : ['kontraktssum', 'entreprisesum', 'vederlag', 'kontraktssummen er', 'sum eks', 'avtalt honorar pris'];
  const pattern = new RegExp(`(?:${labels.join('|')})[^\\n\\d]{0,24}(\\d[\\d\\s.]*(?:,\\d{1,2})?)`, 'i');
  const match = text.match(pattern);
  if (!match) return null;
  const number = parseAmount(match[1]);
  if (number == null || number <= 0) return null;
  return number;
}

function readTerms(source, draft, findings) {
  const terms = emptyTerms();
  if (/basismåned[^.\n]{0,60}kontraktsdato|fra kontraktsdato/i.test(source)) {
    terms.baseRule = 'contract';
    findings.push('Basismåneden er kontraktsdatoen, slik avtalen sier.');
  } else if (/basismåned[^.\n]{0,60}tilbudsdato/i.test(source)) {
    terms.baseRule = 'offer';
    findings.push('Basismåneden er tilbudsdatoen, slik avtalen sier.');
  } else if (/NS\s*3405/i.test(source)) {
    findings.push('Metoden er NS 3405: basismåned ved tilbudsfrist, deretter tilbudsdato, og e = A × s × (t − t0) / t0.');
  }
  if (/kvartalsvis|hvert kvartal|per kvartal/i.test(source)) {
    terms.frequency = 'quarter';
    findings.push('Reguleringen skjer kvartalsvis.');
  } else if (/årlig regulering|en gang i året|reguleres årlig/i.test(source)) {
    terms.frequency = 'year';
    findings.push('Reguleringen skjer årlig.');
  } else if (/engangsregulering|reguleres én gang|reguleres en gang/i.test(source)) {
    terms.frequency = 'once';
    findings.push('Reguleringen er en engangsjustering.');
  }
  const threshold = source.match(/(?:terskel(?:verdi)?|reguleres bare når[^%\n]{0,50}|endringen overstiger)\s*(\d{1,2}(?:[.,]\d+)?)\s*%/i);
  if (threshold) {
    const number = parseAmount(threshold[1]);
    if (number != null) {
      terms.thresholdPercent = String(number);
      findings.push(`Terskel for regulering er ${number} %.`);
    }
  }
  const cap = source.match(/(?:maks(?:imal(?:t|e)?)?(?:\s+regulering)?|tak(?:et)?(?:\s+(?:på|for regulering))?)\s*(?:på|er|:)?\s*(\d{1,2}(?:[.,]\d+)?)\s*%/i);
  if (cap) {
    const number = parseAmount(cap[1]);
    if (number != null) {
      terms.capPercent = String(number);
      findings.push(`Tak på reguleringen er ${number} %.`);
    }
  }
  if (/nærmeste krone|avrund(?:es|et) til (?:hele )?kroner?/i.test(source)) {
    terms.roundToKrone = true;
    findings.push('Beløpet avrundes til nærmeste krone.');
  }
  terms.variables = readVariables(source);
  if (terms.variables.length) {
    findings.push(`Andre avtalte størrelser: ${terms.variables.map((row) => `${row.name} ${row.value}`).join(', ')}.`);
  }
  draft.terms = terms;
}

function readVariables(source) {
  const skip = /kontraktssum|tilbudsfrist|tilbudsdato|kontraktsdato|første regulering|forste regulering|reguleringsdato|gjeldende fra|regulert andel|fast andel|merverdi|mva|timepris|enhetspris|organisasjon|telefon|epost|e-post/i;
  const found = [];
  const pattern = /^\s*([A-Za-zÆØÅæøå][^:\n]{2,40}):\s*(\d[\d\s.]*(?:,\d+)?\s*%?)/gm;
  let match = pattern.exec(source);
  while (match && found.length < 12) {
    const name = match[1].replace(/\s+/g, ' ').trim();
    const value = match[2].replace(/\s+/g, ' ').trim();
    if (!skip.test(name)) found.push({ name, value });
    match = pattern.exec(source);
  }
  return found;
}

export function numberAppears(source, value) {
  const number = parseAmount(value);
  if (number == null) return false;
  const digits = String(Math.round(Math.abs(number)));
  if (!digits || digits === '0') return false;
  const folded = String(source || '').replace(/\s/g, '').replace(/(\d)\.(?=\d{3}(?:\D|$))/g, '$1');
  return folded.includes(digits);
}

function sourceHasShare(extra) {
  return extra?.sharePercent != null && extra.sharePercent !== '';
}

function readLines(text) {
  const found = [];
  const pattern = /\b(timepris|enhetspris|timesats|honorar(?:\s+pris)?)\s+(.{0,40}?)(\d[\d\s.]*(?:,\d{1,2})?)\s*(?:kr|nok|-)?/gi;
  let match = pattern.exec(text);
  while (match && found.length < 30) {
    const rate = parseAmount(match[3]);
    if (rate != null && rate > 20) {
      const kind = match[1];
      found.push(emptyLine({
        text: `${kind} ${match[2]}`.replace(/\s+/g, ' ').trim(),
        quantity: '1',
        unit: /time|honorar/i.test(kind) ? 'time' : 'enhet',
        rate: String(rate),
      }));
    }
    match = pattern.exec(text);
  }
  return found;
}
