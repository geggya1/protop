/** Leser en Doffin-kunngjøring til et sammendrag med dokumenter, ESPD og frister. */

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

function first(rows, pattern) {
  return rows.find((row) => pattern.test(row.label))?.value || '';
}

function all(rows, pattern) {
  return rows.filter((row) => pattern.test(row.label)).map((row) => row.value);
}

export function summarizeNotice(notice) {
  const rows = flattenNoticeFields(notice?.eform);
  const documentsUrl = notice?.competitionDocsUrl || first(rows, /anskaffelsesdokumentene/i);
  const submissionUrl = first(rows, /adresse for innlevering/i) || documentsUrl;
  const cpv = [...new Set([...(notice?.directCpvCodes || []), ...(notice?.allCpvCodes || [])])];
  const espd = all(rows, /espd|uteluk|exclusion/i);
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
    description: text(notice?.description),
    buyer: (notice?.buyer || []).map((row) => text(row?.name)).filter(Boolean).join(', '),
    places: notice?.placeOfPerformance || [],
    procedure: first(rows, /type prosedyre/i),
    estimatedValue: first(rows, /anslått verdi/i) || notice?.core?.estimatedValue?.fullLocalizedText || '',
    duration: first(rows, /^varighet/i),
    submissionDeadline: first(rows, /frist for mottak av tilbud/i),
    questionDeadline: first(rows, /tilleggsopplysninger/i),
    validity: first(rows, /må være gyldig/i),
    languages: first(rows, /språk der anskaffelsesdokumentene/i),
    electronicSubmission: first(rows, /elektronisk innlevering/i),
    documentsUrl,
    submissionUrl,
    contactName: first(rows, /^kontaktpunkt$/i),
    contactEmail: first(rows, /^e-post$/i),
    contactPhone: first(rows, /^telefon$/i),
    cpvCodes: cpv,
    espd: espd[0] || '',
    lots: lots.filter((lot) => lot.id),
    documents: documentsUrl ? [{ title: 'Anskaffelsesdokumenter', url: documentsUrl }] : [],
    qa: [],
    noticeUrl: notice?.id ? `https://www.doffin.no/notices/${notice.id}` : '',
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
