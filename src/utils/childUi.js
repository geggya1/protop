/** Enkel / høy barnevennlighet for små barn (under 7 år). */

import { profileAge } from './age';

/** Under 7 år — samme terskel som foresatt-valg i Utseende. */
export const HIGH_CHILD_FRIENDLINESS_MAX_AGE = 7;

export function canEnableHighChildFriendliness(child) {
  const age = profileAge(child);
  // Uten fødselsdato: tillat valget (foresatt vet alder).
  if (age == null) return true;
  return age < HIGH_CHILD_FRIENDLINESS_MAX_AGE;
}

/** Aktiv for denne barneprofilen (lagret flagg + alderstillatelse). */
export function isHighChildFriendliness(child) {
  if (!child || child.highChildFriendliness !== true) return false;
  return canEnableHighChildFriendliness(child);
}
