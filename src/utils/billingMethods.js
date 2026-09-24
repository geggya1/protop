/**
 * Digital subscriptions on iOS/Android must not offer web checkout (card, Vipps).
 * Those methods stay on the website. Store billing is the only native option.
 */
export function billingMethodIdsForPlatform(platform) {
  if (platform === 'ios') return ['appstore'];
  if (platform === 'android') return ['googleplay'];
  return ['card', 'vipps'];
}
