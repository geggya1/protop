/** Tekst, frist og offisiell kunngjøringsadresse for anbudstreff. */
import { noticeDeadlineExpired } from './model.js';

function text(value) {
  return String(value || '').trim();
}

/** Gjør sammenhengende OCR-/API-tekst lesbar med avsnitt og mellomrom. */
export function formatNoticeText(raw) {
  let value = String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  if (!value) return '';

  // Mellomrom etter punktum/utrop/spørsmål når neste ord starter med stor bokstav.
  value = value.replace(/([.!?])([A-ZÆØÅÄÖÜ])/g, '$1 $2');
  // Mellomrom etter komma/semikolon når det mangler.
  value = value.replace(/([,;:])([^\s\d])/g, '$1 $2');
  // Nye avsnitt etter setningsslut når neste setning er lang nok.
  value = value.replace(/([.!?])\s+(?=[A-ZÆØÅÄÖÜ][^.!?]{40,})/g, '$1\n\n');
  // Kjente overskrifter i kunngjøringer.
  value = value.replace(
    /\s+(Beskrivelse|Tilleggsinformasjon|Prosedyre|Frist|Oppdragsgiver|CPV|Delkontrakter)\s*:/gi,
    '\n\n$1:',
  );
  return value.replace(/\n{3,}/g, '\n\n').trim();
}

export function isCompetitorPortal(url) {
  try {
    const host = new URL(String(url || '')).hostname.replace(/^www\./, '').toLowerCase();
    return /(^|\.)(mercell\.com|hyyr\.(no|com)|eu-supply\.com|tendsign\.(no|com)|achilles\.com)$/.test(host);
  } catch {
    return false;
  }
}

export function isOfficialNoticeHost(url) {
  try {
    const host = new URL(String(url || '')).hostname.replace(/^www\./, '').toLowerCase();
    return /(^|\.)doffin\.no$|(^|\.)ted\.europa\.eu$/.test(host);
  } catch {
    return false;
  }
}

/** Foretrekker Doffin/TED. Unngår Hyyr/Mercell når kunngjøringen skal åpnes. */
export function officialNoticeUrl(noticeOrDossier) {
  const row = noticeOrDossier || {};
  const dossier = row.dossier || row;
  const candidates = [
    row.url,
    dossier.noticeUrl,
    row.source === 'ted' && row.id ? `https://ted.europa.eu/no/notice/-/detail/${row.id}` : '',
    /^\d{4}-\d+$/.test(String(row.id || dossier.id || ''))
      ? `https://www.doffin.no/notices/${row.id || dossier.id}`
      : '',
  ].map(text).filter(Boolean);
  const official = candidates.find((url) => isOfficialNoticeHost(url));
  if (official) return official;
  return candidates.find((url) => !isCompetitorPortal(url)) || '';
}

export function sourceLabel(notice) {
  return notice?.source === 'ted' ? 'TED' : 'Doffin';
}

/** Parser tilbudsfrist med dato og klokkeslett (ISO eller norsk format). */
export function parseDeadline(value) {
  const raw = text(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
  if (iso) {
    return new Date(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3]),
      Number(iso[4] || 0),
      Number(iso[5] || 0),
    );
  }
  const nb = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (nb) {
    return new Date(
      Number(nb[3]),
      Number(nb[2]) - 1,
      Number(nb[1]),
      Number(nb[4] || 0),
      Number(nb[5] || 0),
    );
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** True når fristdato/-klokkeslett er passert. */
export function deadlinePassedAt(value, now = new Date()) {
  const date = parseDeadline(value);
  if (!date) return false;
  return date.getTime() < (now instanceof Date ? now : new Date(now)).getTime();
}

/** Pedagogisk fristoversikt for tilbudsarbeid og treff. */
export function deadlineInfo(value, now = new Date()) {
  const date = parseDeadline(value);
  if (!date) {
    return {
      ok: false,
      label: text(value) || 'Frist ikke oppgitt',
      tone: 'muted',
      daysLeft: null,
      headline: 'Tilbudsfrist mangler',
      detail: 'Sett eller hent fristen fra kunngjøringen.',
    };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysLeft = Math.round((end - start) / 86400000);
  const clock = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
  const time = date.getHours() || date.getMinutes()
    ? ` kl. ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    : '';
  if (daysLeft < 0) {
    return {
      ok: true,
      label: clock + time,
      tone: 'danger',
      daysLeft,
      headline: 'Fristen er utløpt',
      detail: `Fristen var ${clock}${time}.`,
    };
  }
  if (daysLeft === 0) {
    return {
      ok: true,
      label: clock + time,
      tone: 'danger',
      daysLeft: 0,
      headline: 'Frist i dag',
      detail: `Tilbudsfrist ${clock}${time}.`,
    };
  }
  if (daysLeft === 1) {
    return {
      ok: true,
      label: clock + time,
      tone: 'warn',
      daysLeft: 1,
      headline: '1 dag igjen',
      detail: `Tilbudsfrist ${clock}${time}.`,
    };
  }
  if (daysLeft <= 7) {
    return {
      ok: true,
      label: clock + time,
      tone: 'warn',
      daysLeft,
      headline: `${daysLeft} dager igjen`,
      detail: `Tilbudsfrist ${clock}${time}. Fristen nærmer seg.`,
    };
  }
  if (daysLeft <= 14) {
    return {
      ok: true,
      label: clock + time,
      tone: 'brand',
      daysLeft,
      headline: `${daysLeft} dager igjen`,
      detail: `Tilbudsfrist ${clock}${time}.`,
    };
  }
  return {
    ok: true,
    label: clock + time,
    tone: 'ink',
    daysLeft,
    headline: `${daysLeft} dager igjen`,
    detail: `Tilbudsfrist ${clock}${time}.`,
  };
}

export function noticeIsRejected(notice) {
  const decision = notice?.decision || 'ubestemt';
  return decision === 'forkastet' || decision === 'arkiv' || decision === 'ikke';
}

export function noticeIsCurrent(notice) {
  const decision = notice?.decision || 'ubestemt';
  return decision === 'aktuell' || decision === 'tilbud';
}

export function noticeNeedsReview(notice) {
  const decision = notice?.decision || 'ubestemt';
  return decision === 'ubestemt';
}

/** Filteret der treffet ligger i listen. Tom streng når det ikke skal vises. */
export function noticeListFilter(notice) {
  if ((notice?.decision || 'ubestemt') === 'tilbud') return '';
  if (noticeIsRejected(notice)) return 'uaktuelle';
  if (noticeDeadlineExpired(notice) && noticeNeedsReview(notice)) return 'utlopt';
  if (noticeIsCurrent(notice)) return 'aktuelle';
  if (noticeNeedsReview(notice)) return 'nye';
  return 'alle';
}

export function noticeMatchesListFilter(notice, filter) {
  const bucket = noticeListFilter(notice);
  if (!bucket) return false;
  if (filter === 'alle') return bucket === 'nye' || bucket === 'aktuelle';
  return bucket === filter;
}

/** Neste rad når den valgte tas ut av listen. Tom streng når listen blir tom. */
export function nextRowAfterRemoval(rows, id) {
  const list = Array.isArray(rows) ? rows : [];
  const index = list.findIndex((row) => row?.id === id);
  if (index < 0) return '';
  const next = list[index + 1] || list[index - 1];
  return next && next.id !== id ? next.id : '';
}
