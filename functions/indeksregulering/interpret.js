import { INDEX_SERIES, STANDARDS } from './catalog.js';
import { emptyDraft, emptyLine, emptyTerms, parseAmount, parseIsoDate } from './engine.js';

const STANDARD_ORDER = [
  // OCR leser ofte «NS» som «N5» (N58403).
  ['NS 8403', /N[S5]\s*8403|\bNS\s*8403\b/i],
  ['NS 8417', /N[S5]\s*8417|\bNS\s*8417\b/i],
  ['NS 8416', /N[S5]\s*8416|\bNS\s*8416\b/i],
  ['NS 8415', /N[S5]\s*8415|\bNS\s*8415\b/i],
  ['NS 8407', /N[S5]\s*8407|\bNS\s*8407\b/i],
  ['NS 8406', /N[S5]\s*8406|\bNS\s*8406\b/i],
  ['NS 8405', /N[S5]\s*8405|\bNS\s*8405\b/i],
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
  ['ppi-byggeteknisk', /byggeteknisk konsulent|tabell[:\s]*14335|71\.121|konsulentvirksomhet/i],
  ['kpi', /konsumprisindeks|\bKPI\b/i],
  ['bki-bustader', /byggekostnadsindeks for boliger|bustader i alt|boliger i alt/i],
];

/** Rensk OCR-støy før feltuttrekk (tankestreker, NS→N5, sammenslåtte etiketter). */
export function normalizeAgreementText(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[—–―]/g, '-')
    .replace(/\bN[S5]\s*840([3-7])\b/gi, 'NS 840$1')
    .replace(/\bN[S5]\s*841([5-7])\b/gi, 'NS 841$1')
    .replace(/\bAvtalthonorar\b/gi, 'Avtalt honorar')
    .replace(/\bOppdraestaker\b/gi, 'Oppdragstaker')
    .replace(/\bBeskrivelse av (?:pedal|oppdratt|oppdrag)\b/gi, 'Beskrivelse av oppdraget')
    .replace(/\bKontakt persen\b/gi, 'Kontakt person')
    .replace(/\bAll AS\b/g, 'Allfug AS')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function interpretContract(text) {
  const source = normalizeAgreementText(text);
  const findings = [];
  const draft = emptyDraft({
    lines: [],
    findings,
    engine: 'lokal',
    standard: '',
    model: '',
    indexId: '',
    sharePercent: '',
    vatPercent: '',
  });
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
    draft.sharePercent = '100';
    draft.vatPercent = STANDARDS[standardId].model === 'husleie' ? '0' : '25';
    findings.push(`Kjenner igjen ${STANDARDS[standardId].label}.`);
  } else {
    findings.push('Fant ingen navngitt standard. Feltet er tomt og kan fylles ut for hånd.');
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
  draft.endDate = labeledDate(source, ['sluttdato', 'avsluttes', 'slutt dato', 'skttdate', 'avtidste']);
  if (!draft.firstRegulationDate) {
    const locked = readLockInDate(source, {
      startDate: draft.startDate,
      contractDate: draft.contractDate || contractDate,
      offerDate: draft.offerDate,
    });
    if (locked) {
      draft.firstRegulationDate = locked.date;
      findings.push(locked.finding);
    }
  }
  if (draft.tenderDeadline) findings.push(`Tilbudsfrist ${showDate(draft.tenderDeadline)}.`);
  if (draft.offerDate) findings.push(`Tilbudsdato eller siste prisfastsetting ${showDate(draft.offerDate)}.`);
  if (draft.startDate) findings.push(`Oppstart ${showDate(draft.startDate)}.`);
  if (draft.endDate) findings.push(`Sluttdato ${showDate(draft.endDate)}.`);

  draft.buyer = plausible(labeledParty(source, ['byggherre', 'oppdragsgiver', 'bestiller', 'utleier']));
  draft.supplier = plausible(labeledParty(source, ['entreprenør', 'entreprenor', 'leverandør', 'leverandor', 'leietaker', 'oppdragstaker']));
  draft.title = plausible(assignmentTitle(source) || labeledParty(source, ['prosjekt', 'arbeid', 'eiendom', 'leieobjekt']) || firstLine(source));
  draft.reference = plausible(labeledParty(source, ['oppdrags nummer', 'oppdragsnummer', 'kontraktsnummer', 'kontraktsnr', 'kontrakt nr', 'referanse', 'deres ref']));
  draft.contactName = plausible(labeledParty(source, ['kontakt person', 'kontaktperson']));
  draft.orgnr = partyOrgnr(source, 'oppdragsgiver') || partyOrgnr(source, 'byggherre');
  draft.supplierOrgnr = partyOrgnr(source, 'oppdragstaker') || partyOrgnr(source, 'entreprenør') || partyOrgnr(source, 'leverandør');
  draft.place = plausible(assignmentPlace(source));
  const street = tidyStreetAddress(plausible(labeledParty(source, ['adresse'])));
  draft.address = street.address && street.address !== '-' ? street.address : '';
  draft.postalCode = readPostalCode(source) || street.postalCode;
  draft.invoiceMethod = invoiceMethodFromSource(source);
  draft.leaderName = plausible(labeledParty(source, ['oppdragsleder', 'oppdrags leder']));
  draft.gnrBnr = readGnrBnr(source);
  draft.description = plausible(labeledParty(source, ['beskrivelse av oppdraget'])) || scanDescription(source);
  draft.poNumber = plausible(labeledParty(source, ['eksternt po\\. nr', 'po\\. nr', 'po-nr', 'po nummer']));
  draft.honorar = honorarText(source) || honorarForm(source);
  draft.phone = labeledPhone(source);
  draft.email = labeledEmail(source, { buyer: draft.buyer, supplier: draft.supplier });
  draft.personnummer = labeledPersonnummer(source);
  draft.surchargePercent = labeledPercent(source, ['påslagsprosent', 'paslagsprosent']);
  draft.kind = agreementKindFromSource(source);
  enrichFromScan(source, draft);
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
  ['offerDate', 'tenderDeadline', 'contractDate', 'buyer', 'supplier', 'title', 'reference', 'startDate', 'endDate', 'contactName', 'orgnr', 'supplierOrgnr', 'place', 'address', 'description', 'honorar', 'poNumber', 'phone', 'email', 'personnummer', 'surchargePercent', 'kind', 'postalCode', 'invoiceMethod', 'leaderName', 'gnrBnr'].forEach((key) => {
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
  const textFields = ['title', 'reference', 'buyer', 'supplier', 'standard', 'model', 'indexId', 'offerDate', 'tenderDeadline', 'contractDate', 'startDate', 'endDate', 'honorar', 'place', 'address', 'description', 'poNumber', 'orgnr', 'supplierOrgnr', 'personnummer', 'contactName', 'phone', 'email', 'surchargePercent', 'kind', 'postalCode', 'invoiceMethod', 'leaderName', 'gnrBnr'];
  textFields.forEach((key) => {
    const value = clean(extra[key]);
    if (!value) return;
    if (key === 'postalCode') {
      const code = value.replace(/\D/g, '').slice(0, 4);
      if (code.length === 4) next.postalCode = code;
      return;
    }
    if (key === 'invoiceMethod') {
      const method = normalizeInvoiceMethod(value);
      if (method) next.invoiceMethod = method;
      return;
    }
    if (key === 'gnrBnr') {
      const gnr = value.replace(/\s/g, '');
      if (/^\d{1,5}\/\d{1,5}$/.test(gnr)) next.gnrBnr = gnr;
      return;
    }
    if (key === 'leaderName') {
      const ok = plausible(value);
      if (ok) next.leaderName = ok;
      return;
    }
    if (['buyer', 'supplier', 'title', 'contactName', 'place', 'address', 'description', 'honorar'].includes(key)) {
      const ok = plausible(value);
      if (!ok) return;
      next[key] = ok;
      return;
    }
    if (['offerDate', 'tenderDeadline', 'contractDate', 'startDate', 'endDate'].includes(key)) {
      const iso = parseIsoDate(value);
      if (iso) next[key] = iso;
      return;
    }
    if (key === 'standard' && !STANDARDS[value]) return;
    if (key === 'model' && !['ns3405', 'engang', 'husleie', 'vektet'].includes(value)) return;
    if (key === 'indexId' && !INDEX_SERIES.some((row) => row.id === value)) return;
    if (key === 'kind' && !['oppdrag', 'rammeavtale', 'avrop', 'endring', 'annet'].includes(value)) return;
    next[key] = value;
  });
  if (next.address) {
    const street = tidyStreetAddress(next.address);
    next.address = street.address;
    if (!next.postalCode && street.postalCode) next.postalCode = street.postalCode;
  }
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

function plausible(value) {
  const text = clean(value);
  if (!text) return '';
  if (text === '-' || text === '—') return '';
  if (/^(oppdrags\s*nummer|oppdragssted|adresse|sted|oppstart|sluttdato|kontakt|organisasjons|eksternt|po\.?\s*nr|generelle|beskrivelse|om oppdragsgiver|ny avtale)$/i.test(text)) return '';
  if (/[%{}<>\\]/.test(text)) return '';
  const letters = (text.match(/[A-Za-zÆØÅæøå]/g) || []).length;
  const junk = (text.match(/[^A-Za-zÆØÅæøå0-9 .,&/\-()@+]/g) || []).length;
  if (letters >= 3 && junk >= 3) return '';
  if (/[A-Za-z0-9]{8,}/.test(text) && /[0-9]/.test(text) && /[A-Za-z]/.test(text) && junk) return '';
  return text;
}

function honorarForm(text) {
  const match = String(text || '').match(/avtalte honorar\s+([^\n]{4,120})/i);
  if (!match) return '';
  const value = plausible(match[1]
    .replace(/avtalt honorar pris.*$/i, '')
    .replace(/[jl]if\.?\s*N[S5]?\s*\d+.*/i, '')
    .replace(/N[S5]\s*\d+.*/i, '')
    .trim());
  return value;
}

function labeledPhone(text) {
  const near = String(text || '').match(/(?:kontakt\s*person|telefon(?:\s*nr)?|tlf)[^0-9]{0,48}([\d\s+]{8,16})/i);
  return near ? near[1].replace(/\s/g, '') : '';
}

function companyToken(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\b(as|asa|ans|da|sa|nuf|ba)\b/g, '')
    .replace(/[^a-z0-9æøå]+/gi, ' ')
    .trim()
    .split(/\s+/)[0] || '';
}

function labeledEmail(text, parties = {}) {
  const source = String(text || '');
  const labeled = source.match(/e-?post\s*[:\-]?\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
  if (labeled) return labeled[1].toLowerCase();
  const found = [...source.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((row) => row[0].toLowerCase());
  if (!found.length) return '';
  const buyer = companyToken(parties.buyer);
  const supplier = companyToken(parties.supplier);
  const ranked = found.map((email) => {
    const domain = (email.split('@')[1] || '').replace(/^www\./, '');
    let score = 0;
    if (buyer && domain.includes(buyer)) score += 4;
    if (supplier && domain.includes(supplier)) score -= 4;
    return { email, score };
  });
  ranked.sort((a, b) => b.score - a.score);
  if (ranked[0].score > 0) return ranked[0].email;
  if (ranked[0].score < 0) return '';
  return ranked[0].email;
}

function labeledPersonnummer(text) {
  const match = String(text || '').match(/(?:f[øo]dselsnummer|personnummer|fnr)\s*[:\-]?\s*(\d{6}\s?\d{5}|\d{11})/i);
  return match ? match[1].replace(/\s/g, '') : '';
}

function labeledPercent(text, labels) {
  const pattern = new RegExp(`(?:${labels.join('|')})\\s*[:\\-]?\\s*(\\d{1,3}(?:[.,]\\d+)?)\\s*%`, 'i');
  const match = String(text || '').match(pattern);
  return match ? match[1].replace(',', '.') : '';
}

function agreementKindFromSource(text) {
  if (/\brammeavtale/i.test(text)) return 'rammeavtale';
  if (/\bavrop\b|avropsavtale/i.test(text)) return 'avrop';
  if (/endringsavtale|endringsordre|tilleggsavtale/i.test(text)) return 'endring';
  if (/oppdragsavtale|oppdragsbekreftelse/i.test(text)) return 'oppdrag';
  return '';
}

function addMonthsIso(iso, months) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + Number(months), Number(match[3])));
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/**
 * Bindingstid / første år uten regulering → firstRegulationDate.
 * Basis er oppstart, ellers kontraktsdato / tilbudsdato.
 */
function readLockInDate(source, dates = {}) {
  const basis = parseIsoDate(dates.startDate) || parseIsoDate(dates.contractDate) || parseIsoDate(dates.offerDate) || '';
  if (!basis) return null;
  const year = source.match(/(?:første|forste)\s+(?:året|aar(?:et)?)\s+(?:uten|utan)\s+(?:indeks)?regulering|(?:bindingstid|bundet|fast)\s+(?:i\s+)?(?:ett|et|1)\s+(?:år|aar)|reguleres\s+ikke\s+(?:før|for)\s+(?:etter\s+)?(?:ett|et|1)\s+(?:år|aar)|ikke\s+reguler(?:es|ing)\s+(?:før|for)\s+(?:ett|et|1)\s+(?:år|aar)\s+(?:er\s+)?(?:gått|passert)/i);
  if (year) {
    return {
      date: addMonthsIso(basis, 12),
      finding: `Avtalen er bundet første året. Første regulering tidligst ${showDate(addMonthsIso(basis, 12))}.`,
    };
  }
  const months = source.match(/(?:bindingstid|bundet|reguleres\s+ikke\s+(?:før|for)|ikke\s+reguler(?:es|ing)\s+(?:før|for))\s+(?:etter\s+)?(\d{1,2})\s+(?:måneder|maneder|mnd)/i);
  if (months) {
    const n = Number(months[1]);
    if (n > 0 && n <= 60) {
      const date = addMonthsIso(basis, n);
      return {
        date,
        finding: `Avtalen er bundet i ${n} måneder. Første regulering tidligst ${showDate(date)}.`,
      };
    }
  }
  const years = source.match(/(?:bindingstid|bundet|reguleres\s+ikke\s+(?:før|for)|ikke\s+reguler(?:es|ing)\s+(?:før|for))\s+(?:etter\s+)?(\d)\s+(?:år|aar)/i);
  if (years) {
    const n = Number(years[1]);
    if (n > 0 && n <= 5) {
      const date = addMonthsIso(basis, n * 12);
      return {
        date,
        finding: `Avtalen er bundet i ${n} år. Første regulering tidligst ${showDate(date)}.`,
      };
    }
  }
  return null;
}

function labeledDate(text, labels) {
  const pattern = new RegExp(`(?:${labels.join('|')})[^\\n\\d]{0,40}(\\d{1,2}\\.\\d{1,2}\\.\\d{4}|\\d{4}-\\d{2}-\\d{2})`, 'i');
  const match = text.match(pattern);
  return match ? parseIsoDate(match[1]) : '';
}

function labeledParty(text, labels) {
  const joined = labels.join('|');
  const colon = new RegExp(`\\b(?:${joined})\\b\\s*[:\\-]\\s*([^\\n]{2,80})`, 'i');
  let match = text.match(colon);
  let value = match ? cleanParty(match[1]) : '';
  if (!value) {
    const space = new RegExp(`\\b(?:${joined})\\b\\s+([A-ZÆØÅ][^\\n]{2,80})`, 'i');
    match = text.match(space);
    value = match ? cleanParty(match[1]) : '';
  }
  value = value.replace(new RegExp(`^(?:${joined})\\s+`, 'i'), '');
  return cleanParty(value);
}

function cleanParty(raw) {
  return String(raw || '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+(Om\s+oppdragsgiver|Oppdragsgiver|Oppdragstaker|Organisasjons\s*nr|Org\.?nr|Kontakt|E-?post|Telefon|Adresse|Att|Post\s*n(?:ummer|r)\.?|Sted|Gnr|NS\s*\d{4}|Avtalt|Tabell|Oppstart|Sluttdato|Honoreres|Generelle bestemmelser|Eksternt|Faktura).*$/i, '')
    .replace(/[,;].*$/, '')
    .trim();
}

function assignmentTitle(text) {
  const oppdrag = text.match(
    /\bOppdrag\s+([A-ZÆØÅa-zæøå0-9][^\n]{1,90}?)(?:\s*[-]?\s*Eksternt|\s+PO\.|\s+Oppdrags\s*nummer|\s+Oppdragssted|$)/im,
  );
  const beskrivelse = text.match(/Beskrivelse av oppdraget\s*[-:]?\s*([A-ZÆØÅa-zæøå0-9][^\n]{3,80})/i);
  const name = oppdrag ? cleanParty(oppdrag[1]).replace(/\s*-\s*$/, '').trim() : '';
  let role = beskrivelse ? cleanParty(beskrivelse[1]) : '';
  // Lange setninger (Consult1) → kort tittel; hele setningen i description.
  if (role && role.length > 40) role = '';
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

export function normalizeInvoiceMethod(value) {
  const raw = clean(value);
  const text = raw.toUpperCase();
  if (!text) return '';
  if (/\bEHF\b|PEPPOL|ELEKTRONISK HANDELSFORMAT/.test(text)) return 'EHF';
  const hasMail = /E-?POST|EPOST|\bMAIL\b|@/.test(text);
  const hasPaper = /\bPOST\b(?!\s*@)|PAPIRFAKTURA|PER BREV/.test(text.replace(/E-?POST/g, 'MAIL'));
  if (hasMail && !hasPaper) return 'EPOST';
  if (hasPaper && !hasMail) return 'POST';
  if (hasMail) return 'EPOST';
  return '';
}

export function tidyStreetAddress(value) {
  let address = clean(value);
  if (!address) return { address: '', postalCode: '' };
  const inline = address.match(/^(.*?)(?:,|\s)+(\d{4})$/);
  if (inline && /[A-Za-zÆØÅæøå]/.test(inline[1])) {
    return { address: inline[1].trim(), postalCode: inline[2] };
  }
  const junkId = address.match(/^(.*\D)\s+(\d{5,})$/);
  if (junkId) return { address: junkId[1].trim(), postalCode: '' };
  return { address, postalCode: '' };
}

function readPostalCode(text) {
  const source = String(text || '');
  const labeled = source.match(/\bpost\s*(?:nr|nummer)\.?\s*[:\-]?\s*(\d{4})\b/i);
  if (labeled) return labeled[1];
  const beside = source.match(/\badresse:\s*[^:\n]{0,90}?(\d{4})\b/i);
  return beside ? beside[1] : '';
}

function invoiceMethodFromSource(text) {
  const source = String(text || '');
  const window = source.match(/faktura(?:\s*mottak|\s*adresse|\s*sendes)?[^.\n]{0,100}/i)?.[0] || '';
  if (!window) return '';
  const upper = window.toUpperCase();
  const ehf = /\bEHF\b|PEPPOL/.test(upper);
  const mail = /E-?POST|EPOST|@/.test(upper);
  const paper = /\bPOST\b(?!\s*@)|PAPIRFAKTURA|PER BREV/.test(upper.replace(/E-?POST/g, ''));
  const hits = [ehf && 'EHF', mail && 'EPOST', paper && 'POST'].filter(Boolean);
  if (hits.length !== 1) return '';
  return hits[0];
}

function readGnrBnr(text) {
  const match = String(text || '').match(/\bgnr\.?\s*\/?\s*bnr\.?\s*[:\-]?\s*(\d{1,5})\s*\/\s*(\d{1,5})\b/i);
  if (!match) return '';
  return `${match[1]}/${match[2]}`;
}

function assignmentPlace(text) {
  const site = String(text || '').match(/Oppdragssted[^\n]{0,90}Sted:\s*([A-ZÆØÅa-zæøå][^\n,]{1,40})/i);
  if (site) return cleanParty(site[1]);
  const labeled = labeledParty(text, ['sted']);
  if (labeled) return labeled;
  const signature = String(text || '').match(/Sted:\s*([A-ZÆØÅa-zæøå][^\n]{1,40}?)\s+Dato:/i);
  if (signature) return cleanParty(signature[1]);
  return labeledParty(text, ['oppdragssted']);
}

function isNsStandardAmount(amount) {
  const number = Number(amount);
  if (!Number.isFinite(number)) return false;
  if (number >= 8400 && number <= 8499) return true;
  // OCR «NS 8403» → 58403 o.l.
  return [58403, 58405, 58406, 58407, 58415, 58416, 58417].includes(number);
}

function honorarText(text) {
  const match = String(text || '').match(/avtalt\s*honorar(?:\s*pris|\s*ps)?\s*[:\-]?\s*(\d[\d\s.]{2,12})/i);
  if (!match) return '';
  const amount = parseAmount(match[1]);
  if (amount == null || amount < 50 || isNsStandardAmount(amount)) return '';
  return `${amount} kr eks. mva`;
}

function scanDescription(text) {
  const match = String(text || '').match(
    /Beskrivelse av oppdraget\s*[-:]?\s*([A-ZÆØÅa-zæøå0-9][^\n]{8,180})/i,
  );
  if (!match) return '';
  return cleanParty(match[1]).replace(/\s+(Om|Oppdragsgiver|Oppdragstaker|Kontakt).*$/i, '').trim();
}

function enrichFromScan(source, draft) {
  if (!draft.buyer) {
    const buyer = source.match(/\b(Allfug\s+AS)\b/i)
      || source.match(/Underskrift\s+([A-ZÆØÅ][A-Za-zÆØÅæøå0-9 .&-]{2,40}?)\s+Underskrift/i);
    if (buyer && !/consult/i.test(buyer[1])) draft.buyer = cleanParty(buyer[1]);
  }
  if (!draft.supplier) {
    const supplier = source.match(/\b(Consult\s*1\s+AS)\b/i)
      || source.match(/Underskrift\s+[^\n]+Underskrift\s+(Consult\s*1)\b/i);
    if (supplier) draft.supplier = /AS/i.test(supplier[1]) ? cleanParty(supplier[1]) : 'Consult1 AS';
  }
  if (!draft.contactName) {
    const contact = source.match(/Kontakt person\s+([A-ZÆØÅ][A-Za-zÆØÅæøå-]{1,30}(?:\s+[A-ZÆØÅ][A-Za-zÆØÅæøå-]{1,30}){0,2})/i)
      || source.match(/Allfug\s+AS\s+([A-ZÆØÅ][A-Za-zÆØÅæøå-]{1,30}(?:\s+[A-ZÆØÅ][A-Za-zÆØÅæøå-]{1,30}){0,2})/i);
    if (contact) draft.contactName = cleanParty(contact[1]);
  }
  if (!draft.orgnr || !draft.supplierOrgnr) {
    const numbers = [...String(source).matchAll(/\b(\d{3}\s?\d{3}\s?\d{3})\b/g)]
      .map((row) => row[1].replace(/\s/g, ''))
      .filter((value, index, all) => value.length === 9 && all.indexOf(value) === index);
    if (!draft.orgnr && numbers[0]) draft.orgnr = numbers[0];
    if (!draft.supplierOrgnr) {
      const consult = source.match(/Consult\s*1[^0-9]{0,60}(\d{3}\s?\d{3}\s?\d{3})/i);
      draft.supplierOrgnr = consult
        ? consult[1].replace(/\s/g, '')
        : (numbers.find((value) => value !== draft.orgnr) || '');
    }
  }
  if (!draft.address || draft.address === '-') {
    const street = source.match(/\b([A-ZÆØÅa-zæøå][A-Za-zÆØÅæøå]+(?:veien|vegen|gate|gata)\s+\d+[A-Za-z]?)\b/);
    if (street) draft.address = street[1];
  }
  if (!draft.postalCode) {
    const postal = source.match(/\b(\d{4})\s*,?\s*([A-ZÆØÅa-zæøå][A-Za-zÆØÅæøå-]{2,30})\b/);
    if (postal && /Ålgård|Fornebu|Sandnes|Stavanger|Oslo|Bergen/i.test(postal[2])) {
      draft.postalCode = postal[1];
      if (!draft.place && !/Fornebu/i.test(draft.place || '')) {
        // Oppdragssted (Fornebu) prioriteres foran fakturaadresse (Ålgård).
      }
    }
  }
  if (!draft.invoiceMethod && /foretrukket mottak|velg\s+\w+\s+mottak/i.test(source)) {
    draft.invoiceMethod = invoiceMethodFromSource(source)
      || (/EHF/i.test(source) ? 'EHF' : (/E-?POST/i.test(source) ? 'EPOST' : ''));
  }
  if (!draft.endDate) {
    const end = source.match(/(?:sluttdato|skttdate|avtidste)\s*[:\-]?\s*(\d{1,2}[.,]\d{1,2}[.,]\d{4})/i);
    if (end) draft.endDate = parseIsoDate(end[1].replace(/,/g, '.')) || '';
  }
  if (!draft.contractDate) {
    const dates = [...source.matchAll(/\b(\d{2}\.\d{2}\.\d{4})\b/g)].map((row) => parseIsoDate(row[1])).filter(Boolean);
    if (dates.length) draft.contractDate = dates[dates.length - 1];
  }
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
    : ['kontraktssum', 'entreprisesum', 'vederlag', 'kontraktssummen er', 'sum eks', 'avtalt honorar pris', 'avtalt honorar'];
  const pattern = new RegExp(`(?:${labels.join('|')})[^\\n\\d]{0,24}(\\d[\\d\\s.]*(?:,\\d{1,2})?)`, 'i');
  const match = text.match(pattern);
  if (!match) return null;
  const number = parseAmount(match[1]);
  if (number == null || number <= 0 || isNsStandardAmount(number)) return null;
  // Unngå «Honoreres etter medgått tid … N58403»
  if (/honoreres|medgått tid|jf\.|lif\./i.test(match[0]) && isNsStandardAmount(number)) return null;
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
    const kind = match[1];
    const rest = match[2] || '';
    const skip = /N[S5]\s*\d|jf\.|lif\.|kl\.|pkt\./i.test(`${kind} ${rest}`)
      || (rate != null && isNsStandardAmount(rate));
    if (!skip && rate != null && rate > 50) {
      found.push(emptyLine({
        text: `${kind} ${rest}`.replace(/\s+/g, ' ').trim(),
        quantity: '1',
        unit: /time|honorar/i.test(kind) ? 'time' : 'enhet',
        rate: String(rate),
      }));
    }
    match = pattern.exec(text);
  }
  return found;
}
