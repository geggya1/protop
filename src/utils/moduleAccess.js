/**
 * Household-level module access.
 * Activation is free today. entitlement is stored for later subscriptions.
 *
 * Missing moduleAccessInitialized / empty moduleAccess / boolean `true`
 * without a timestamp is NOT treated as activated. Existing families must
 * press Aktiver on each gated module. That flag is only a schema marker —
 * it must never mean “all modules unlocked”.
 *
 * Activation writes an audit record (date, time, place) for billing.
 * Deactivate only flips access + log; module content is never cleared.
 */

export const MODULE_ACCESS_FIELD = 'moduleAccess';

export const ACTIVATION_SOURCES = Object.freeze({
  welcome: 'welcome',
  settings: 'settings',
});

export const ENTITLEMENTS = Object.freeze({
  included: 'included',
  trial: 'trial',
  paid: 'paid',
  unavailable: 'unavailable',
});

export function hasActivationTimestamp(value) {
  if (value == null || value === '' || value === 'legacy') return false;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  if (typeof value !== 'string') return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

export function detectActivationTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export function detectActivationLocale() {
  try {
    if (typeof navigator !== 'undefined' && navigator.language) {
      return String(navigator.language);
    }
    return Intl.DateTimeFormat().resolvedOptions().locale || null;
  } catch {
    return null;
  }
}

export function normalizeActivationPlatform(platform) {
  const raw = String(platform || '').toLowerCase();
  if (raw === 'ios' || raw === 'android' || raw === 'web') return raw;
  return 'web';
}

export function normalizeActivationRole(role) {
  return role === 'child' ? 'child' : 'adult';
}

export function normalizeActivationSource(source) {
  return source === ACTIVATION_SOURCES.settings
    ? ACTIVATION_SOURCES.settings
    : ACTIVATION_SOURCES.welcome;
}

function looksLikeEmail(value) {
  return typeof value === 'string' && value.includes('@');
}

function trimPlaceText(value, max = 120) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || looksLikeEmail(text)) return null;
  return text.slice(0, max);
}

/**
 * Best-effort jurisdiction / home hint. Never requests GPS.
 * Uses timezone + locale, plus family/profile location already on file.
 */
export function buildActivationPlace({
  timezone = null,
  locale = null,
  family = null,
  profileLocation = null,
} = {}) {
  const place = {
    timezone: timezone || null,
    locale: locale || null,
  };
  if (family?.language) {
    const language = trimPlaceText(String(family.language), 16);
    if (language) place.language = language;
  }
  const loc = profileLocation;
  if (loc && typeof loc === 'object') {
    const label = trimPlaceText(loc.label || loc.name || loc.city || '');
    if (label) place.label = label;
    const city = trimPlaceText(loc.city);
    if (city) place.city = city;
    const country = trimPlaceText(loc.country || loc.countryCode);
    if (country) place.country = country;
    const lat = Number(loc.lat);
    const lng = Number(loc.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      place.lat = lat;
      place.lng = lng;
    }
  } else if (typeof loc === 'string') {
    const label = trimPlaceText(loc);
    if (label) place.label = label;
  }
  return place;
}

export function captureActivationContext({
  platform,
  role,
  locale,
  timezone,
  family,
  profileLocation,
} = {}) {
  const tz = timezone || detectActivationTimezone();
  const loc = locale || detectActivationLocale();
  return {
    timezone: tz,
    locale: loc,
    platform: normalizeActivationPlatform(platform),
    role: normalizeActivationRole(role),
    place: buildActivationPlace({
      timezone: tz,
      locale: loc,
      family,
      profileLocation,
    }),
  };
}

function cloneHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row) => row && typeof row === 'object').map((row) => ({ ...row }));
}

export function emptyModuleAccess(moduleId, extra = {}) {
  const ent = ENTITLEMENTS[extra.entitlement] || ENTITLEMENTS.included;
  const activatedAt = extra.activatedAt ?? extra.current?.activatedAt ?? null;
  const activatedAtMs = extra.activatedAtMs ?? extra.current?.activatedAtMs ?? (
    hasActivationTimestamp(activatedAt) ? Date.parse(activatedAt) : null
  );
  const activated = extra.activated === true
    || (extra.activated !== false && hasActivationTimestamp(activatedAt));
  return {
    moduleId: String(moduleId || ''),
    activated,
    activatedAt: hasActivationTimestamp(activatedAt) ? activatedAt : null,
    activatedAtMs: Number.isFinite(activatedAtMs) ? activatedAtMs : null,
    entitlement: ent,
    entitlementExpiresAt: extra.entitlementExpiresAt ?? null,
    current: extra.current && typeof extra.current === 'object' ? { ...extra.current } : null,
    history: cloneHistory(extra.history),
  };
}

export function normalizeModuleAccess(moduleId, raw) {
  // Boolean true / non-objects are not billed activations.
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptyModuleAccess(moduleId);
  }
  const current = raw.current && typeof raw.current === 'object' ? { ...raw.current } : null;
  const activatedAt = current?.activatedAt || raw.activatedAt || null;
  return emptyModuleAccess(moduleId, {
    activated: raw.activated,
    activatedAt,
    activatedAtMs: current?.activatedAtMs || raw.activatedAtMs,
    entitlement: raw.entitlement,
    entitlementExpiresAt: raw.entitlementExpiresAt || null,
    current,
    history: raw.history,
  });
}

/** Schema marker only — does not grant access. */
export function isLegacyModuleAccess(family) {
  if (!family) return false;
  return family.moduleAccessInitialized !== true;
}

export function readModuleAccessMap(family) {
  const raw = family?.[MODULE_ACCESS_FIELD];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const map = {};
  for (const [id, value] of Object.entries(raw)) {
    map[id] = normalizeModuleAccess(id, value);
  }
  return map;
}

export function getModuleAccess(map, moduleId) {
  if (!moduleId) return emptyModuleAccess('');
  return map?.[moduleId] || emptyModuleAccess(moduleId);
}

export function isModuleActivated(access) {
  if (!access || typeof access !== 'object') return false;
  const ts = access.current?.activatedAt || access.activatedAt;
  if (!hasActivationTimestamp(ts)) return false;
  if (access.activated === false) return false;
  return access.activated === true || access.activated == null;
}

export function isEntitlementActive(access, nowMs = Date.now()) {
  const ent = access?.entitlement || ENTITLEMENTS.included;
  if (ent === ENTITLEMENTS.unavailable) return false;
  if (ent === ENTITLEMENTS.trial || ent === ENTITLEMENTS.paid) {
    if (access?.entitlementExpiresAt) {
      const exp = Date.parse(access.entitlementExpiresAt);
      if (Number.isFinite(exp) && exp < nowMs) return false;
    }
  }
  return ent === ENTITLEMENTS.included
    || ent === ENTITLEMENTS.trial
    || ent === ENTITLEMENTS.paid;
}

export function canUseModule(map, moduleId, nowMs = Date.now()) {
  const access = getModuleAccess(map, moduleId);
  return isModuleActivated(access) && isEntitlementActive(access, nowMs);
}

export function shouldShowWelcome(map, moduleId) {
  if (!moduleId) return false;
  const access = getModuleAccess(map, moduleId);
  if (access.entitlement === ENTITLEMENTS.unavailable) return false;
  return !isModuleActivated(access);
}

export function resolveFamilyModuleAccess(family, moduleId) {
  if (!moduleId) return emptyModuleAccess('');
  return getModuleAccess(readModuleAccessMap(family), moduleId);
}

export function shouldShowModuleWelcome(family, moduleId) {
  if (!moduleId || !family) return false;
  const access = resolveFamilyModuleAccess(family, moduleId);
  if (access.entitlement === ENTITLEMENTS.unavailable) return false;
  return !isModuleActivated(access);
}

function buildPeriod(moduleId, {
  nowIso,
  nowMs,
  timezone = null,
  locale = null,
  platform = null,
  role = 'adult',
  place = null,
  source = ACTIVATION_SOURCES.welcome,
} = {}) {
  const activatedAt = nowIso || new Date().toISOString();
  const activatedAtMs = Number.isFinite(nowMs) ? nowMs : Date.parse(activatedAt);
  return {
    moduleId: String(moduleId || ''),
    activatedAt,
    activatedAtMs: Number.isFinite(activatedAtMs) ? activatedAtMs : Date.now(),
    timezone: timezone || null,
    locale: locale || null,
    platform: normalizeActivationPlatform(platform),
    role: normalizeActivationRole(role),
    place: place && typeof place === 'object'
      ? place
      : buildActivationPlace({ timezone, locale }),
    source: normalizeActivationSource(source),
  };
}

export function activateModuleAccess(map, moduleId, opts = {}) {
  const current = getModuleAccess(map, moduleId);
  const period = buildPeriod(moduleId, opts);
  return {
    ...(map || {}),
    [moduleId]: emptyModuleAccess(moduleId, {
      activated: true,
      activatedAt: period.activatedAt,
      activatedAtMs: period.activatedAtMs,
      entitlement: opts.entitlement || current.entitlement,
      entitlementExpiresAt: current.entitlementExpiresAt,
      current: period,
      history: current.history,
    }),
  };
}

export function deactivateModuleAccess(map, moduleId, {
  nowIso = new Date().toISOString(),
  nowMs,
} = {}) {
  const current = getModuleAccess(map, moduleId);
  const deactivatedAt = nowIso;
  const deactivatedAtMs = Number.isFinite(nowMs) ? nowMs : Date.parse(deactivatedAt);
  const history = cloneHistory(current.history);
  const openPeriod = current.current && hasActivationTimestamp(current.current.activatedAt)
    ? current.current
    : (hasActivationTimestamp(current.activatedAt)
      ? {
        moduleId: String(moduleId || ''),
        activatedAt: current.activatedAt,
        activatedAtMs: current.activatedAtMs,
      }
      : null);
  if (openPeriod && !openPeriod.deactivatedAt) {
    history.push({
      ...openPeriod,
      deactivatedAt,
      deactivatedAtMs: Number.isFinite(deactivatedAtMs) ? deactivatedAtMs : Date.now(),
    });
  }
  return {
    ...(map || {}),
    [moduleId]: emptyModuleAccess(moduleId, {
      activated: false,
      activatedAt: null,
      activatedAtMs: null,
      entitlement: current.entitlement,
      entitlementExpiresAt: current.entitlementExpiresAt,
      current: null,
      history,
    }),
  };
}

export function moduleAccessPatch(moduleId, access) {
  return {
    [`${MODULE_ACCESS_FIELD}.${moduleId}`]: normalizeModuleAccess(moduleId, access),
  };
}

export function buildModuleAccessWrite(family, moduleId, nextAccess) {
  const access = normalizeModuleAccess(moduleId, nextAccess);
  return {
    moduleAccessInitialized: true,
    [`moduleAccess.${moduleId}`]: access,
  };
}

export function applyModuleAccessPatch(family, patch) {
  if (!family || !patch) return family;
  const next = { ...family, moduleAccessInitialized: true };
  if (patch.moduleAccess && typeof patch.moduleAccess === 'object' && !Array.isArray(patch.moduleAccess)) {
    next.moduleAccess = patch.moduleAccess;
    return next;
  }
  const map = { ...(family.moduleAccess || {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (key.startsWith('moduleAccess.')) {
      map[key.slice('moduleAccess.'.length)] = value;
    }
  }
  next.moduleAccess = map;
  return next;
}

export function canManageModuleAccess({
  isParent = false, isChild = false, isActingAsChild = false, isAdmin = false,
  isGrandparent = false,
} = {}) {
  if (isChild || isActingAsChild || isGrandparent) return false;
  return !!isParent || !!isAdmin;
}

export function canDeactivateModule(opts) {
  return canManageModuleAccess(opts);
}

export function canActivateModule(access, { isChild = false } = {}) {
  if (access?.entitlement === ENTITLEMENTS.unavailable) return false;
  if (access?.entitlement === ENTITLEMENTS.paid && isChild) return false;
  return isEntitlementActive(access);
}
