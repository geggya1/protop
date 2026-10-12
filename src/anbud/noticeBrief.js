/** Offentlig oppdragsinformasjon til vurderingen, med lenker ut av ProTop. */

import { cpvByCode } from './catalog.js';
import { DOSSIER_SUMMARY_VERSION } from './dossier.js';
import { unboundPlace } from './noticePlace.js';
import { deadlineInfo, formatNoticeText, officialNoticeUrl, sourceLabel } from './noticeText.js';

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function asList(value) {
  if (Array.isArray(value)) return value.map((item) => text(typeof item === 'string' ? item : item?.name || item?.label || item?.code)).filter(Boolean);
  if (value == null || value === '') return [];
  return [text(value)].filter(Boolean);
}

function money(amount, currency) {
  const number = Number(amount);
  if (!Number.isFinite(number)) return '';
  const formatted = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(number);
  return currency && currency !== 'NOK' ? `${formatted} ${currency}` : `${formatted} kr`;
}

function pushLink(links, seen, label, url) {
  const href = text(url);
  if (!/^(https?:\/\/|mailto:|tel:)/i.test(href)) return;
  const key = href.replace(/\/$/, '').toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  links.push({ label: text(label) || 'Lenke', url: href });
}

function cpvLabel(codes) {
  return asList(codes).map((code) => {
    const known = cpvByCode(code);
    return known ? `${known.code} ${known.label}` : code;
  }).join(', ');
}

function placeLabel(notice, dossier) {
  const places = asList(dossier?.places).length ? asList(dossier.places) : asList(notice?.places);
  if (unboundPlace({ places })) return 'Hele Norge · ikke stedbunden';
  return places.join(', ');
}

function fact(id, label, value, tone = '') {
  const shown = text(value);
  if (!shown) return null;
  return { id, label, value: shown, tone };
}

function nbDate(value) {
  const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : text(value);
}

function clockLabel(value) {
  const info = deadlineInfo(value);
  return info.ok ? info.label : text(value);
}

/** Doffin-kunngjøringen er bare skissen fra trefflista, ikke den leste kunngjøringen. */
export function noticeNeedsDossier(notice) {
  if (!/^\d{4}-\d+$/.test(String(notice?.id || ''))) return false;
  return notice?.dossier?.summaryVersion !== DOSSIER_SUMMARY_VERSION;
}

export function noticeBrief(notice) {
  const dossier = notice?.dossier && typeof notice.dossier === 'object' ? notice.dossier : {};
  const source = sourceLabel(notice);
  const noticeUrl = officialNoticeUrl(notice);
  const deadlineValue = dossier.submissionDeadline || notice?.deadline || '';
  const deadline = deadlineInfo(deadlineValue);
  const seen = new Set();
  if (noticeUrl) seen.add(noticeUrl.replace(/\/$/, '').toLowerCase());
  const links = [];
  pushLink(links, seen, 'Anskaffelsesdokumenter', dossier.documentsUrl);
  pushLink(links, seen, 'Adresse for innlevering', dossier.submissionUrl);
  pushLink(links, seen, 'Oppdragsgivers side', dossier.buyerUrl);
  for (const doc of Array.isArray(dossier.documents) ? dossier.documents : []) {
    pushLink(links, seen, doc.title || doc.name || 'Dokument', doc.url);
  }
  for (const file of Array.isArray(dossier.portalFiles) ? dossier.portalFiles : []) {
    pushLink(links, seen, file.name || 'Dokument i portalen', file.url);
  }
  if (dossier.contactEmail) pushLink(links, seen, `E-post ${dossier.contactEmail}`, `mailto:${dossier.contactEmail}`);
  pushLink(links, seen, 'Åpne på TED', dossier.tedUrl);
  pushLink(links, seen, 'Anskaffelsesforskriften', dossier.regulationUrl);
  const description = formatNoticeText(dossier.description || notice?.description || '');
  const lots = (Array.isArray(dossier.lots) ? dossier.lots : [])
    .map((lot) => text([lot?.id, lot?.title].filter(Boolean).join(' · ')))
    .filter(Boolean);
  const qa = (Array.isArray(dossier.qa) ? dossier.qa : [])
    .map((row) => ({ question: text(row?.question), answer: text(row?.answer) }))
    .filter((row) => row.question);
  return {
    source,
    noticeUrl,
    headline: deadline.ok ? deadline.headline : '',
    deadlineTone: deadline.tone || '',
    description,
    outline: formatNoticeText(dossier.procedureOutline || ''),
    extra: formatNoticeText(dossier.additionalInfo || ''),
    lots,
    qa,
    awards: (Array.isArray(dossier.awards) ? dossier.awards : [])
      .map((row) => ({
        title: text(row?.title),
        weight: text(row?.weight),
        type: text(row?.type),
      }))
      .filter((row) => row.title),
    selection: (Array.isArray(dossier.selection) ? dossier.selection : [])
      .map((row) => ({ title: text(row?.title), detail: text(row?.detail) }))
      .filter((row) => row.title),
    links,
    facts: [
      fact('deadline', 'Tilbudsfrist', deadline.ok ? `${deadline.label} · ${deadline.headline}` : deadlineValue, deadline.tone),
      fact('value', 'Anslått verdi', dossier.estimatedValue || money(notice?.amount, notice?.currency)),
      fact('place', 'Sted', placeLabel(notice, dossier)),
      fact('procedure', 'Prosedyre', dossier.procedure),
      fact('nature', 'Kontrakt', dossier.contractNature),
      fact('framework', 'Rammeavtale', dossier.framework),
      fact('dps', 'Dynamisk innkjøpsordning', dossier.dps),
      fact('duration', 'Varighet', dossier.duration),
      fact('ceiling', 'Rammeavtalens tak', dossier.frameworkCeiling),
      fact('delivery', 'Leveranse', asList(dossier.classifications).slice(0, 4).join(', ')),
      fact('buyer', 'Oppdragsgiver', dossier.buyer || notice?.buyer),
      fact('org', 'Organisasjonsnummer', dossier.buyerOrg),
      fact('reference', 'Referanse', dossier.reference),
      fact('published', 'Kunngjort', nbDate(dossier.published)),
      fact('type', 'Kunngjøring', notice?.noticeType),
      fact('questions', 'Frist for spørsmål', clockLabel(dossier.questionDeadline)),
      fact('opening', 'Åpning av tilbud', clockLabel(dossier.opening)),
      fact('validity', 'Tilbudet må være gyldig', dossier.validity),
      fact('language', 'Språk', dossier.languages),
      fact('submit', 'Innlevering', dossier.electronicSubmission),
      fact('variants', 'Varianter', dossier.variants),
      fact('invoice', 'eFaktura', dossier.eInvoice),
      fact('espd', 'ESPD', dossier.espd === true ? 'Egenerklæring brukes' : dossier.espd),
      fact('cpv', 'CPV', asList(dossier.classifications).length
        ? ''
        : cpvLabel(asList(dossier.cpvCodes?.length ? dossier.cpvCodes : notice?.cpvCodes).slice(0, 4))),
      fact('contact', 'Kontakt', [dossier.contactName, dossier.contactPhone].filter(Boolean).join(' · ')),
      fact('review', 'Klagebehandling', dossier.reviewBody),
    ].filter(Boolean),
  };
}

export function inquiryBrief(item) {
  const links = [];
  const seen = new Set();
  if (item?.email) pushLink(links, seen, item.email, `mailto:${item.email}`);
  if (item?.phone) {
    const digits = String(item.phone).replace(/[^\d+]/g, '');
    if (digits) pushLink(links, seen, item.phone, `tel:${digits}`);
  }
  const files = (Array.isArray(item?.attachments) ? item.attachments : []).map((file) => text(file?.name)).filter(Boolean);
  return {
    source: item?.queueKind === 'protop' || item?.source === 'protop' ? 'ProTop' : 'Registrert selv',
    noticeUrl: '',
    headline: '',
    deadlineTone: '',
    description: formatNoticeText(item?.description || ''),
    outline: '',
    extra: '',
    lots: [],
    qa: [],
    links,
    files,
    facts: [
      fact('buyer', 'Avsender', item?.buyer || item?.fromName),
      fact('contact', 'Kontakt', [item?.contactName, item?.phone].filter(Boolean).join(' · ')),
      fact('email', 'E-post', item?.email),
      fact('deadline', 'Frist', item?.deadline),
      fact('reference', 'Referanse', item?.reference),
      fact('value', 'Beløp', money(item?.amount, 'NOK')),
      fact('files', 'Vedlegg', files.join(', ')),
    ].filter(Boolean),
  };
}
