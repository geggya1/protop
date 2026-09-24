/** Belønningsmodi for barnets gjøremål. */
export const REWARD_MODES = ['none', 'points', 'money'];

export function normalizeRewardMode(mode) {
  const m = String(mode || '').toLowerCase();
  if (m === 'none' || m === 'off' || m === 'checklist') return 'none';
  if (m === 'money' || m === 'cash' || m === 'kr') return 'money';
  if (m === 'points' || m === 'stars' || m === 'stjerner' || m === 'poeng') return 'points';
  return 'points';
}

export function isRewardMode(mode) {
  return REWARD_MODES.includes(normalizeRewardMode(mode));
}

/** Kort UI-etikett for modusvalg. */
export function rewardModeChipLabel(mode) {
  const m = normalizeRewardMode(mode);
  if (m === 'none') return '✅ Ingen';
  if (m === 'money') return '💰 Penger';
  return '⭐ Stjerner';
}

/** Lengre tittel i kort/banner. */
export function rewardModeTitle(mode) {
  const m = normalizeRewardMode(mode);
  if (m === 'none') return 'Kvitteringsliste';
  if (m === 'money') return 'Penger-modus';
  return 'Stjerne-modus';
}

/** Enhet for belønningstall (tom i none-modus). */
export function rewardUnitLabel(mode) {
  const m = normalizeRewardMode(mode);
  if (m === 'none') return '';
  if (m === 'money') return 'kr';
  return 'stjerner';
}

export function rewardModeEmoji(mode) {
  const m = normalizeRewardMode(mode);
  if (m === 'none') return '✅';
  if (m === 'money') return '💰';
  return '⭐';
}

export function rewardModeHint(mode) {
  const m = normalizeRewardMode(mode);
  if (m === 'none') {
    return 'Bare en sjekkliste: kryss av når det er gjort. Litt ros, ingen poeng eller penger.';
  }
  if (m === 'money') {
    return 'Gjøremål gir kroner mot ukebudsjettet (ukepenger / belønning).';
  }
  return 'Gjøremål gir stjerner. Sett verdi per oppgave, og lag opptjeningsmål med bilde, beskrivelse og lenke.';
}

/** Skal vi vise tallbelønning, sekk, budsjett og «+N»? */
export function showsNumericReward(mode) {
  return normalizeRewardMode(mode) !== 'none';
}

export function showsBudget(mode) {
  return normalizeRewardMode(mode) === 'money' || normalizeRewardMode(mode) === 'points';
}
