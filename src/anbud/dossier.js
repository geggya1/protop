/** Leser en Doffin-kunngjøring til et sammendrag med dokumenter, ESPD og frister. */

import { normalizeCompetitionUrl } from './competitionUrl.js';

const NOTICE_URL = 'https://api.doffin.no/webclient/api/v2/notices-api/notices';

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function flattenNoticeFields(eform) {
  const rows = [];
  const walk = (nodes) => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      const label = text(node?.label);
      const value = node?.value;
      if (label && value != null && typeof value !== 'object') rows.push({ label, value: text(value) });
      walk(node?.sections);
    }
  };
  walk(eform);
  return rows;
}

function isProcurementLink(label, url) {
  if (/internett-adresse|nettside|hjemmeside/i.test(label)) return false;
  if (/dokument|innlevering|portal|konkurransegrunnlag|espd|mercell/i.test(label)) return true;
  return /mercell|eu-supply|tendsign|doffin|kgv|achilles/i.test(url);
}

function first(rows, pattern) {
  return rows.find((row) => pattern.test(row.label))?.value || '';
}

function all(rows, pattern) {
  return rows.filter((row) => pattern.test(row.label)).map((row) => row.value);
}

/** Bump når sammendraget får nye felt, så lagrede kunngjøringer hentes på nytt. */
export const DOSSIER_SUMMARY_VERSION = 2;

function sectionsMatching(nodes, pattern) {
  const found = [];
  const walk = (list) => {
    if (!Array.isArray(list)) return;
    for (const node of list) {
      if (pattern.test(text(node?.label))) found.push(node);
      walk(node?.sections);
    }
  };
  walk(nodes);
  return found;
}

function leavesUnder(node) {
  const rows = [];
  const walk = (list) => {
    if (!Array.isArray(list)) return;
    for (const child of list) {
      const label = text(child?.label);
      const value = child?.value;
      const sections = Array.isArray(child?.sections) ? child.sections : [];
      if (label && value != null && typeof value !== 'object' && text(value)) {
        rows.push({ label, value: text(value) });
      } else if (label && !sections.length) {
        rows.push({ label, value: '' });
      }
      walk(sections);
    }
  };
  walk(node?.sections);
  return rows;
}

function formatAmount(amount, currency) {
  const number = Number(amount);
  if (!Number.isFinite(number)) return '';
  const formatted = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(number);
  const code = text(currency).toUpperCase();
  return !code || code === 'NOK' || code === 'KR' ? `${formatted} kr` : `${formatted} ${code}`;
}

function parseLooseAmount(raw) {
  const value = text(raw);
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(value)) return Number(value.replace(/,/g, ''));
  const compact = value.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(compact)) return null;
  const number = Number(compact);
  return Number.isFinite(number) ? number : null;
}

function countPhrase(raw, one, many) {
  const number = Number(String(raw).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(number)) return text(raw);
  const shown = Number.isInteger(number) ? String(number) : String(number);
  return `${shown} ${number === 1 ? one : many}`;
}

function spanFromLabel(label, value) {
  if (/måned/i.test(label)) return countPhrase(value, 'måned', 'måneder');
  if (/år/i.test(label)) return countPhrase(value, 'år', 'år');
  if (/dag/i.test(label)) return countPhrase(value, 'dag', 'dager');
  return text(value);
}

function durationOf(eform) {
  for (const section of sectionsMatching(eform, /^anslått varighet$/i)) {
    const rows = leavesUnder(section);
    const counted = rows.find((row) => /^varighet,/i.test(row.label) && row.value);
    if (counted) return spanFromLabel(counted.label, counted.value);
    const other = rows.find((row) => /^annen varighet/i.test(row.label) && row.value);
    if (other) return other.value;
    const start = rows.find((row) => /^startdato/i.test(row.label))?.value || '';
    const end = rows.find((row) => /^sluttdato/i.test(row.label))?.value || '';
    if (start && end) return `${start}–${end}`;
    if (start) return `Fra ${start}`;
  }
  return '';
}

function techniqueOf(eform, pattern) {
  const parts = [];
  for (const section of sectionsMatching(eform, pattern)) {
    for (const child of Array.isArray(section.sections) ? section.sections : []) {
      const label = text(child?.label);
      const own = child?.value != null && typeof child.value !== 'object' ? text(child.value) : '';
      if (!label || /^(ingen|ingen\/nei|nei)$/i.test(label)) continue;
      parts.push(own ? `${label}: ${own}` : label);
      for (const row of leavesUnder(child)) {
        if (row.value) parts.push(`${row.label}: ${row.value}`);
      }
    }
  }
  return [...new Set(parts)].slice(0, 6).join(' · ');
}

const CRITERION_LABELS = {
  'financial ratio': 'Økonomisk nøkkeltall',
  'enrolment in a trade register': 'Registrert i foretaksregisteret',
  'other economic or financial requirements': 'Andre økonomiske krav',
  'measures for ensuring quality': 'Kvalitetssikring',
  'environmental management measures': 'Miljøledelse',
  'references on specified services': 'Referanser på tilsvarende tjenester',
  'relevant educational and professional qualifications': 'Faglige kvalifikasjoner',
};

function criterionTitle(name, description, type) {
  if (name) return name;
  if (description) return description;
  return CRITERION_LABELS[type.toLowerCase()] || type;
}

function criteriaUnder(eform, pattern) {
  const items = [];
  const seen = new Set();
  for (const section of sectionsMatching(eform, pattern)) {
    for (const node of Array.isArray(section.sections) ? section.sections : []) {
      if (!/^kriterium$/i.test(text(node?.label))) continue;
      const rows = leavesUnder(node);
      const type = rows.find((row) => row.label === 'Type')?.value || text(node?.value);
      const name = rows.find((row) => row.label === 'Navn')?.value || '';
      const described = splitDocumentation(rows.find((row) => row.label === 'Beskrivelse')?.value || '');
      const weight = rows.find((row) => /tallverdi/i.test(row.label))?.value || '';
      const title = text(criterionTitle(name, described.head, type));
      if (!title) continue;
      const key = `${title}|${weight}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        title: title.slice(0, 280),
        type: text(type).slice(0, 160),
        weight: text(weight).slice(0, 12),
        detail: described.docs.slice(0, 400),
      });
    }
  }
  return items;
}

function referenceOf(rows) {
  return all(rows, /^intern identifikator$/i)
    .find((value) => value.length <= 40 && !/^[a-z0-9]{20,}$/i.test(value)) || '';
}

function openingOf(eform) {
  for (const section of sectionsMatching(eform, /offentlig åpning/i)) {
    const when = leavesUnder(section).find((row) => /dato|klokkeslett/i.test(row.label) && row.value);
    if (when?.value) return when.value;
  }
  return '';
}

function espdOf(rows) {
  const hit = rows.find((row) => /espd/i.test(`${row.label} ${row.value}`));
  return hit ? 'Egenerklæring brukes' : '';
}

function splitDocumentation(value) {
  const [head, ...rest] = text(value).split(/\s*Documentation requirements:\s*/i);
  return { head: text(head), docs: text(rest.join(' ')) };
}

function moneyField(raw, currency = 'NOK') {
  const parsed = parseLooseAmount(raw);
  return parsed != null ? formatAmount(parsed, currency) : text(raw);
}

export function summarizeNotice(notice) {
  const rows = flattenNoticeFields(notice?.eform);
  // Bare ekte lenker. «Virksomhet som gir tilgang til anskaffelsesdokumentene» er et firmanavn.
  const documentsUrl = normalizeCompetitionUrl(notice?.competitionDocsUrl)
    || all(rows, /anskaffelsesdokumentene/i).map(normalizeCompetitionUrl).find(Boolean)
    || '';
  const submissionUrl = first(rows, /adresse for innlevering/i) || documentsUrl;
  const linkRows = rows.filter((row) => /^https?:\/\//i.test(row.value) && isProcurementLink(row.label, row.value));
  const documents = [];
  const seenDocs = new Set();
  for (const row of [{ title: 'Anskaffelsesdokumenter', value: documentsUrl }, ...linkRows.map((row) => ({ title: row.label, value: row.value }))]) {
    if (!row.value || seenDocs.has(row.value)) continue;
    seenDocs.add(row.value);
    documents.push({ title: row.title || 'Dokument', url: row.value });
  }
  const qa = [];
  let pendingQuestion = '';
  for (const row of rows) {
    if (/frist/i.test(row.label)) continue;
    if (/^spørsmål$/i.test(row.label)) {
      pendingQuestion = row.value;
      continue;
    }
    if (/^svar$/i.test(row.label) && pendingQuestion) {
      qa.push({ question: pendingQuestion, answer: row.value });
      pendingQuestion = '';
      continue;
    }
    if (/spørsmål og svar|svar fra oppdragsgiver/i.test(row.label)) {
      qa.push({ question: row.label, answer: row.value });
    }
  }
  if (pendingQuestion) qa.push({ question: pendingQuestion, answer: '' });
  const cpv = [...new Set([...(notice?.directCpvCodes || []), ...(notice?.allCpvCodes || [])])];
  const espd = espdOf(rows);
  const coreValue = notice?.core?.estimatedValue;
  const estimatedFromCore = formatAmount(coreValue?.amount, coreValue?.code);
  const validityRow = rows.find((row) => /må være gyldig/i.test(row.label));
  const buyerOrg = text(notice?.buyer?.find((row) => row?.id)?.id).replace(/\s/g, '');
  const tedId = text(notice?.tedId);
  const classifications = [...new Set(all(rows, /klassifisering/i))].slice(0, 8);
  const lots = [];
  let current = null;
  for (const row of rows) {
    if (/^delkontrakt$/i.test(row.label) && /^LOT-/i.test(row.value)) {
      current = { id: row.value, title: '' };
      lots.push(current);
    } else if (current && row.label === 'Tittel' && !current.title) {
      current.title = row.value;
    }
  }
  return {
    id: notice?.id || '',
    title: text(notice?.heading),
    description: text(notice?.description) || first(rows, /^beskrivelse$/i),
    procedureOutline: first(rows, /hovedtrekkene i prosedyren/i),
    additionalInfo: first(rows, /^tilleggsinformasjon$/i),
    buyer: (notice?.buyer || []).map((row) => text(row?.name)).filter(Boolean).join(', '),
    places: notice?.placeOfPerformance || [],
    procedure: first(rows, /type prosedyre/i),
    contractNature: first(rows, /^kontraktens art$/i),
    estimatedValue: estimatedFromCore || moneyField(first(rows, /^anslått verdi/i)) || '',
    frameworkCeiling: moneyField(first(rows, /rammeavtalens maksimale verdi/i)),
    duration: durationOf(notice?.eform),
    framework: techniqueOf(notice?.eform, /^rammeavtale$/i),
    dps: techniqueOf(notice?.eform, /dynamiske innkjøpsordning/i),
    awards: criteriaUnder(notice?.eform, /^tildelingskriterier$/i)
      .filter((row) => row.weight !== '0' || row.title.length < 80),
    selection: criteriaUnder(notice?.eform, /^utvelgelseskriterier$/i),
    submissionDeadline: first(rows, /frist for mottak av tilbud/i) || text(notice?.deadline),
    questionDeadline: first(rows, /tilleggsopplysninger/i) || text(notice?.qualificationDeadline),
    opening: openingOf(notice?.eform),
    validity: validityRow ? spanFromLabel(validityRow.label, validityRow.value) : '',
    languages: first(rows, /språk der anskaffelsesdokumentene/i),
    electronicSubmission: first(rows, /elektronisk innlevering/i),
    variants: first(rows, /^varianter$/i),
    eInvoice: first(rows, /^efaktura$/i),
    documentsUrl,
    submissionUrl,
    contactName: first(rows, /^kontaktpunkt$/i),
    contactEmail: first(rows, /^e-post$/i),
    contactPhone: first(rows, /^telefon$/i),
    buyerUrl: first(rows, /internett-adresse|nettside|hjemmeside/i),
    buyerOrg: /^\d{9}$/.test(buyerOrg) ? buyerOrg : '',
    reference: referenceOf(rows),
    reviewBody: first(rows, /virksomhet som gjennomfører klagebehandling/i).replace(/\s+-\s*$/, ''),
    published: text(notice?.publicationDate),
    classifications,
    tedUrl: /^\d+-\d{4}$/.test(tedId) ? `https://ted.europa.eu/no/notice/-/detail/${tedId}` : '',
    regulationUrl: /^https?:\/\//i.test(text(notice?.regulationUrl)) ? text(notice.regulationUrl) : '',
    cpvCodes: cpv,
    espd,
    lots: lots.filter((lot) => lot.id),
    documents,
    qa,
    noticeUrl: notice?.id ? `https://www.doffin.no/notices/${notice.id}` : '',
    summaryVersion: DOSSIER_SUMMARY_VERSION,
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchNoticeDossier(id) {
  const noticeId = text(id);
  if (!/^\d{4}-\d+$/.test(noticeId)) {
    const error = new Error('Ugyldig kunngjøringsnummer.');
    error.code = 'invalid-argument';
    throw error;
  }
  const res = await fetch(`${NOTICE_URL}/${noticeId}`, {
    signal: AbortSignal.timeout(20000),
    headers: { Accept: 'application/json', Origin: 'https://www.doffin.no' },
  });
  if (!res.ok) throw new Error(`Doffin svarte ${res.status}`);
  const notice = await res.json();
  return { ok: true, dossier: summarizeNotice(notice) };
}
