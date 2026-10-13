/** Rader til kartet på trinn 2 og 3. Samme nåleformat som anbudsvarslingen. */

import { geocodeQuery } from './noticePlace.js';

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function reviewMapRows({ notices = [], direct = [] } = {}) {
  const fromNotices = (Array.isArray(notices) ? notices : [])
    .filter((row) => row?.id)
    .map((row) => ({
      id: row.id,
      title: text(row.title) || 'Kunngjøring',
      buyer: text(row.buyer),
      places: Array.isArray(row.places) ? row.places : [],
      geo: row.geo || null,
      locationIds: row.locationIds,
      deadline: row.deadline || '',
      source: row.source || 'doffin',
      decision: 'aktuell',
    }));
  const fromDirect = (Array.isArray(direct) ? direct : [])
    .filter((row) => row?.id)
    .map((row) => ({
      id: row.id,
      title: text(row.title) || text(row.fromName) || 'Henvendelse',
      buyer: text(row.buyer) || text(row.fromName) || text(row.contactName),
      places: Array.isArray(row.places) ? row.places : [],
      geo: row.geo || null,
      deadline: row.deadline || '',
      source: row.source === 'protop' || row.queueKind === 'protop' ? 'protop' : 'manuell',
      decision: 'aktuell',
    }));
  return [...fromNotices, ...fromDirect];
}

export function bidMapRows(bids, notices) {
  const byId = new Map((Array.isArray(notices) ? notices : []).filter((row) => row?.id).map((row) => [row.id, row]));
  return (Array.isArray(bids) ? bids : []).filter((row) => row?.id).map((bid) => {
    const notice = byId.get(bid.noticeId) || null;
    return {
      id: bid.id,
      title: text(bid.title) || 'Tilbud',
      buyer: text(bid.buyer) || text(notice?.buyer),
      places: notice?.places?.length ? notice.places : (Array.isArray(bid.places) ? bid.places : []),
      geo: bid.geo || notice?.geo || null,
      locationIds: notice?.locationIds,
      deadline: bid.deadline || bid.dossier?.submissionDeadline || notice?.deadline || '',
      source: notice?.source || bid.source || 'doffin',
      decision: 'aktuell',
    };
  });
}

/** Sted å søke opp når kunngjøringen ikke allerede er plassert. */
export function workGeocodeQuery(row) {
  const fromPlaces = geocodeQuery(row);
  if (fromPlaces) return fromPlaces;
  const buyer = text(row?.buyer);
  if (buyer.length >= 3) return buyer;
  const title = text(row?.title);
  return title.length >= 3 ? title : '';
}

export function applyGeoHits(rows, hits) {
  const byId = new Map((Array.isArray(hits) ? hits : [])
    .filter((row) => row?.id && row.geo)
    .map((row) => [row.id, row.geo]));
  if (!byId.size) return { rows: Array.isArray(rows) ? rows : [], changed: false };
  let changed = false;
  const next = (Array.isArray(rows) ? rows : []).map((row) => {
    const geo = byId.get(row?.id);
    if (!geo || row?.geo) return row;
    changed = true;
    return { ...row, geo };
  });
  return { rows: next, changed };
}

/** Lagrer stedet på tilbudet, og på kunngjøringen når tilbudet peker dit. */
export function mergeWorkGeo(state, hits) {
  const bids = applyGeoHits(state?.bids, hits);
  const noticeHits = (Array.isArray(state?.bids) ? state.bids : []).flatMap((bid) => {
    const hit = (Array.isArray(hits) ? hits : []).find((row) => row?.id === bid?.id && row.geo);
    if (!hit || !bid?.noticeId) return [];
    return [{ id: bid.noticeId, geo: hit.geo }];
  });
  const notices = applyGeoHits(state?.notices, noticeHits);
  return {
    changed: bids.changed || notices.changed,
    bids: bids.rows,
    notices: notices.rows,
  };
}
