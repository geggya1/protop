/** Price, trial and payment stay out of the app until billing launches. Flip to true then. */
export const PRICING_VISIBLE = false;

/**
 * Digital subscriptions on iOS/Android must not offer web checkout (card, Vipps).
 * Those methods stay on the website. Store billing is the only native option.
 */
export function billingMethodIdsForPlatform(platform) {
  if (platform === 'ios') return ['appstore'];
  if (platform === 'android') return ['googleplay'];
  return ['card', 'vipps'];
}

export const TRIAL_DAYS = 14;

/** Days left in the implicit trial. Missing or invalid createdAt counts as a full trial. */
export function trialDaysLeft(createdAt, now = Date.now()) {
  if (!createdAt) return TRIAL_DAYS;
  const start = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
  if (Number.isNaN(start.getTime())) return TRIAL_DAYS;
  const end = start.getTime() + TRIAL_DAYS * 86400000;
  return Math.max(0, Math.ceil((end - now) / 86400000));
}
