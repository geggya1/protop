/** Vurder hvor godt et anbudstreff passer bedriftens profil. */

import { normalizeKeywords, normalizeWatchProfile, noticeMatch } from './model.js';

function fold(value) {
  return String(value || '')
    .toLocaleLowerCase('nb-NO')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function watchSearchTerms(watch) {
  const profile = normalizeWatchProfile(watch?.profile);
  const seen = new Set();
  const words = [];
  for (const word of [...normalizeKeywords(watch?.keywords), ...profile.keywords]) {
    const key = fold(word);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    words.push(word);
  }
  return words;
}

function profileTerms(watch) {
  const profile = normalizeWatchProfile(watch?.profile);
  return fold([profile.description, profile.summary].join(' '))
    .split(/[^a-zæøå0-9]+/i)
    .filter((word) => word.length >= 5)
    .slice(0, 40);
}

export function scoreNoticeFit(notice, watch) {
  const terms = watchSearchTerms(watch);
  const found = noticeMatch(notice, { ...watch, keywords: terms });
  const hay = fold([
    notice?.title,
    notice?.description,
    notice?.buyer,
    notice?.noticeType,
  ].join(' '));
  const profileHits = profileTerms(watch).filter((word) => hay.includes(word));
  const aiScore = Number(notice?.aiFit?.score);
  let score = found.cpv.length * 2 + found.keywords.length * 3 + Math.min(profileHits.length, 4);
  if (Number.isFinite(aiScore) && aiScore > 0) score = Math.max(score, aiScore);
  const strong = score >= 6 || found.keywords.length >= 2 || (found.cpv.length >= 1 && found.keywords.length >= 1);
  const reason = String(notice?.aiFit?.reason || '').trim()
    || (strong
      ? [found.keywords.slice(0, 3).join(', '), found.cpv.slice(0, 2).join(', ')].filter(Boolean).join(' · ')
      : '');
  return {
    score,
    strong,
    reason,
    keywords: found.keywords,
    cpv: found.cpv,
  };
}

export function mergeAiFit(notices, ranked) {
  const byId = new Map((Array.isArray(ranked) ? ranked : []).map((row) => [String(row?.id || '').trim(), row]));
  return (Array.isArray(notices) ? notices : []).map((notice) => {
    const hit = byId.get(notice?.id);
    if (!hit) return notice;
    const score = Math.max(0, Math.min(10, Number(hit.score) || 0));
    return {
      ...notice,
      aiFit: {
        score,
        reason: String(hit.reason || '').trim().slice(0, 220),
        at: new Date().toISOString(),
      },
    };
  });
}
