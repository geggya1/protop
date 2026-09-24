import { valueForTask } from './todoStatus.js';

const TITLE_MAX = 80;
const DESC_MAX = 600;
const LEVEL_DESC_MAX = 400;
const IMAGE_URL_MAX = 800000;

/**
 * http(s)-lenke til noe barnet kan se frem til.
 * Tom streng er gyldig. Andre protokoller (javascript:, data:) avvises.
 */
export function parseRewardLink(raw) {
  const text = String(raw || '').trim();
  if (!text) return { ok: true, url: '' };
  let candidate = text;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  let url;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, url: '', error: 'Lenken må være en gyldig nettadresse.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, url: '', error: 'Lenken må være en vanlig nettside (http eller https).' };
  }
  const host = url.hostname || '';
  if (!host || (host !== 'localhost' && !host.includes('.'))) {
    return { ok: false, url: '', error: 'Lenken må være en gyldig nettadresse.' };
  }
  return { ok: true, url: url.toString() };
}

export function rewardLinkHost(url) {
  const parsed = parseRewardLink(url);
  if (!parsed.ok || !parsed.url) return '';
  try {
    return new URL(parsed.url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function acceptRewardImageUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return { ok: true, imageUrl: '' };
  if (s.startsWith('data:image/')) {
    if (s.length > IMAGE_URL_MAX) {
      return { ok: false, imageUrl: '', error: 'Bildet er for stort. Velg et mindre bilde.' };
    }
    return { ok: true, imageUrl: s };
  }
  if (s.startsWith('https://') || s.startsWith('http://')) {
    return { ok: true, imageUrl: s };
  }
  return { ok: false, imageUrl: '', error: 'Bildet kunne ikke lagres. Prøv igjen.' };
}

function clip(value, max) {
  return String(value || '').trim().slice(0, max);
}

function cleanImagePath(value) {
  const s = String(value || '').trim().slice(0, 500);
  if (!s || s.includes('..') || s.startsWith('/') || s.includes('://')) return '';
  return s;
}

export function formatStarCount(n) {
  const v = Math.max(0, Math.round(Number(n) || 0));
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
}

export function mapMilestone(raw, index = 0) {
  const link = parseRewardLink(raw?.linkUrl || raw?.link || '');
  const image = acceptRewardImageUrl(raw?.imageUrl);
  return {
    id: raw?.id || `m${index}`,
    points: Math.max(0, Math.round(Number(raw?.points) || 0)),
    title: clip(raw?.title, TITLE_MAX) || `Nivå ${index + 1}`,
    emoji: clip(raw?.emoji, 8) || '🎯',
    description: clip(raw?.description, LEVEL_DESC_MAX),
    imageUrl: image.ok ? image.imageUrl : '',
    imagePath: cleanImagePath(raw?.imagePath),
    linkUrl: link.ok ? link.url : '',
    claimedAt: raw?.claimedAt || null,
    claimedBy: raw?.claimedBy || null,
    claimedForChildId: raw?.claimedForChildId || null,
    claims: raw?.claims && typeof raw.claims === 'object' ? raw.claims : {},
  };
}

export function mapRewardGoalData(id, data = {}) {
  const link = parseRewardLink(data.linkUrl || data.link || '');
  const image = acceptRewardImageUrl(data.imageUrl);
  const milestones = Array.isArray(data.milestones)
    ? data.milestones
      .map(mapMilestone)
      .filter((m) => m.points > 0)
      .sort((a, b) => a.points - b.points)
    : [];
  return {
    id,
    title: clip(data.title, TITLE_MAX) || 'Stjernemål',
    emoji: clip(data.emoji, 8) || '⭐',
    description: clip(data.description, DESC_MAX),
    imageUrl: image.ok ? image.imageUrl : '',
    imagePath: cleanImagePath(data.imagePath),
    linkUrl: link.ok ? link.url : '',
    childIds: Array.isArray(data.childIds) ? data.childIds.filter(Boolean) : [],
    shared: data.shared !== false,
    milestones,
    status: data.status === 'archived' ? 'archived' : 'active',
    createdBy: data.createdBy || null,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

export function isMilestoneClaimed(milestone, { shared, childId } = {}) {
  if (!milestone) return false;
  if (shared) return !!milestone.claimedAt;
  if (!childId) return !!milestone.claimedAt;
  return !!(milestone.claims && milestone.claims[childId]);
}

export function goalsForChild(goals, childId) {
  if (!childId) return [];
  return (goals || []).filter((g) => (g.childIds || []).includes(childId));
}

/**
 * Fremdrift mot neste uinnløste nivå.
 * Individuelle mål bruker claims[childId], ikke bare claimedAt.
 */
export function goalProgress(goal, starsByChildId, childId = null) {
  const ids = goal?.childIds || [];
  const byChild = starsByChildId || {};
  let earned = 0;
  if (goal?.shared) {
    earned = ids.reduce((sum, id) => sum + (Number(byChild[id]) || 0), 0);
  } else {
    const id = childId || ids[0];
    earned = Number(byChild[id]) || 0;
  }
  earned = Math.max(0, Math.round(earned));
  const claimCtx = { shared: !!goal?.shared, childId: childId || ids[0] || null };
  const milestones = goal?.milestones || [];
  const open = milestones.filter((m) => !isMilestoneClaimed(m, claimCtx));
  const next = open.find((m) => earned < m.points) || open[0] || null;
  const reached = milestones.filter((m) => earned >= m.points);
  const target = next?.points || milestones[milestones.length - 1]?.points || 0;
  return {
    earned,
    target,
    next,
    reached,
    milestones,
    pct: target > 0 ? Math.min(100, Math.round((earned / target) * 100)) : 0,
    allClaimed: milestones.length > 0 && open.length === 0,
  };
}

export function starsRemaining(progress) {
  if (!progress?.next) return 0;
  return Math.max(0, Math.round(progress.next.points - (progress.earned || 0)));
}

/**
 * Hva barnet skal se.
 * Klar belønning (nådd, ikke innløst) vinner bilde og lenke.
 * Neste uoppnådde nivå styrer «igjen til».
 */
export function motivationFor(goal, progress, { childId = null } = {}) {
  const claimCtx = {
    shared: !!goal?.shared,
    childId: childId || goal?.childIds?.[0] || null,
  };
  const earned = Math.max(0, Math.round(progress?.earned || 0));
  const milestones = goal?.milestones || [];
  const ready = milestones.find((m) => earned >= m.points && !isMilestoneClaimed(m, claimCtx)) || null;
  const upcoming = milestones.find((m) => !isMilestoneClaimed(m, claimCtx) && earned < m.points) || null;
  const focus = ready || upcoming || null;
  const imageUrl = String(focus?.imageUrl || goal?.imageUrl || '').trim();
  const emoji = focus?.emoji || goal?.emoji || '⭐';
  const texts = [];
  const goalDesc = String(goal?.description || '').trim();
  const focusDesc = String(focus?.description || '').trim();
  if (goalDesc) texts.push(goalDesc);
  if (focusDesc && focusDesc !== goalDesc) texts.push(focusDesc);
  const linkUrl = String(focus?.linkUrl || goal?.linkUrl || '').trim();
  const remaining = upcoming ? Math.max(0, upcoming.points - earned) : 0;
  return {
    next: upcoming,
    ready,
    focus,
    imageUrl,
    emoji,
    texts,
    linkUrl,
    remaining,
  };
}

/**
 * Lifetime stjerner fra fullførte gjøremål.
 * Teller kun oppgaver med rewardType points (eller uten money).
 */
export function lifetimeStarsFromTodos(todos) {
  let total = 0;
  (todos || []).forEach((t) => {
    if (t?.rewardType === 'money' || t?.rewardType === 'none') return;
    const v = valueForTask({ ...t, rewardType: 'points' });
    if (v <= 0) return;
    const completed = Array.isArray(t.completedDates) ? t.completedDates : [];
    total += completed.length * v;
  });
  return Math.max(0, Math.round(total));
}

function milestoneDraftRow(raw, index) {
  const points = Math.max(0, Math.round(Number(String(raw?.points ?? '').replace(/\s/g, '')) || 0));
  const title = String(raw?.title || '').trim();
  const description = String(raw?.description || '').trim();
  const linkRaw = String(raw?.linkUrl || raw?.link || '').trim();
  const link = parseRewardLink(linkRaw);
  const image = acceptRewardImageUrl(raw?.imageUrl);
  const touched = points > 0
    || !!title
    || !!description
    || !!String(raw?.imageUrl || '').trim()
    || !!linkRaw;
  return {
    raw,
    index,
    points,
    title,
    description,
    link,
    image,
    touched,
  };
}

/**
 * Validerer et mål før lagring.
 * @returns {{ ok: boolean, errors: {field: string, message: string}[], value?: object }}
 */
export function validateGoalDraft(payload) {
  const errors = [];
  const title = clip(payload?.title, TITLE_MAX);
  if (!title) errors.push({ field: 'title', message: 'Gi målet et navn.' });

  const childIds = Array.isArray(payload?.childIds) ? payload.childIds.filter(Boolean) : [];
  if (!childIds.length) {
    errors.push({ field: 'childIds', message: 'Målet må gjelde minst ett barn.' });
  }

  const goalLink = parseRewardLink(payload?.linkUrl || payload?.link || '');
  if (!goalLink.ok) errors.push({ field: 'linkUrl', message: goalLink.error });

  const goalImage = acceptRewardImageUrl(payload?.imageUrl);
  if (!goalImage.ok) errors.push({ field: 'imageUrl', message: goalImage.error });

  const rows = (payload?.milestones || []).map(milestoneDraftRow);
  rows.forEach((row) => {
    if (!row.touched) return;
    if (!row.link.ok) {
      errors.push({ field: `milestone-${row.index}-link`, message: row.link.error });
    }
    if (!row.image.ok) {
      errors.push({ field: `milestone-${row.index}-image`, message: row.image.error });
    }
    if (row.points <= 0) {
      errors.push({
        field: `milestone-${row.index}-points`,
        message: 'Hvert nivå må ha hvor mange stjerner som kreves.',
      });
    }
    if (!row.title) {
      errors.push({
        field: `milestone-${row.index}-title`,
        message: 'Gi belønningen et navn, for eksempel «Kino» eller «Dyreparken».',
      });
    }
  });

  const usable = rows.filter((row) => row.touched && row.points > 0 && row.title && row.link.ok && row.image.ok);
  if (!usable.length) {
    errors.push({
      field: 'milestones',
      message: 'Legg til minst ett nivå med stjerner og navn på belønningen.',
    });
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    value: {
      title,
      emoji: clip(payload?.emoji, 8) || '⭐',
      description: clip(payload?.description, DESC_MAX),
      imageUrl: goalImage.imageUrl,
      imagePath: cleanImagePath(payload?.imagePath),
      linkUrl: goalLink.url,
      childIds,
      shared: payload?.shared !== false,
      milestones: usable.map((row, i) => ({
        id: row.raw?.id || `m${i}`,
        points: row.points,
        title: clip(row.title, TITLE_MAX),
        emoji: clip(row.raw?.emoji, 8) || '🎯',
        description: clip(row.description, LEVEL_DESC_MAX),
        imageUrl: row.image.imageUrl,
        imagePath: cleanImagePath(row.raw?.imagePath),
        linkUrl: row.link.url,
        claimedAt: row.raw?.claimedAt || null,
        claimedBy: row.raw?.claimedBy || null,
        claimedForChildId: row.raw?.claimedForChildId || null,
        claims: row.raw?.claims && typeof row.raw.claims === 'object' ? row.raw.claims : {},
      })).sort((a, b) => a.points - b.points),
    },
  };
}
