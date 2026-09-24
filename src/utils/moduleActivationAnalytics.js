/**
 * Optional analytics for module activation.
 * No vendor required: uses gtag/dataLayer when present, else a test hook.
 * Payloads never include module content, PII, or child info.
 */

export const MODULE_ACTIVATION_EVENTS = {
  viewed: 'module_welcome_viewed',
  clicked: 'module_activation_clicked',
  completed: 'module_activation_completed',
  back: 'module_activation_back_clicked',
  deactivated: 'module_deactivated',
};

const ALLOWED_EVENTS = new Set(Object.values(MODULE_ACTIVATION_EVENTS));

function detectPlatform() {
  try {
    if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
      return 'native';
    }
  } catch { /* ignore */ }
  if (typeof window !== 'undefined' && typeof window.innerWidth === 'number') {
    const w = window.innerWidth;
    if (w < 768) return 'mobile-web';
    if (w < 1024) return 'tablet-web';
    return 'desktop-web';
  }
  if (typeof document !== 'undefined') return 'web';
  return 'unknown';
}

function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export function buildModuleActivationPayload({
  moduleId,
  platform,
  userRole,
  role,
  timestamp,
  occurredAt,
  timezone,
  subscriptionType,
} = {}) {
  const resolvedRole = role === 'child' || userRole === 'child' ? 'child' : 'adult';
  const payload = {
    moduleId: moduleId == null ? null : String(moduleId),
    platform: platform || detectPlatform(),
    userRole: resolvedRole === 'child' ? 'child' : 'parent',
    role: resolvedRole,
    timestamp: timestamp || occurredAt || new Date().toISOString(),
    timezone: timezone || detectTimezone(),
  };
  if (subscriptionType) payload.subscriptionType = String(subscriptionType);
  return payload;
}

export function trackModuleActivationEvent(eventName, input = {}) {
  if (!ALLOWED_EVENTS.has(eventName)) return null;
  const payload = buildModuleActivationPayload(input);
  try {
    const track = globalThis.__weekplanTrack;
    if (typeof track === 'function') track(eventName, payload);
  } catch { /* never block */ }
  try {
    if (typeof window !== 'undefined') {
      if (typeof window.gtag === 'function') {
        window.gtag('event', eventName, payload);
      } else if (Array.isArray(window.dataLayer)) {
        window.dataLayer.push({ event: eventName, ...payload });
      }
    }
  } catch { /* analyse skal aldri blokkere appen */ }
  return payload;
}
