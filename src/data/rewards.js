/** Små belønninger (historisk / mal) — kan brukes som enkle stjernenivåer. */
export const DEFAULT_REWARDS = [
  { title: 'Is', cost: 15, emoji: '🍦' },
  { title: 'Film', cost: 40, emoji: '🎬' },
  { title: 'Spilletid', cost: 25, emoji: '🎮' },
  { title: 'Tur', cost: 35, emoji: '🏞️' },
  { title: 'Sein kveld', cost: 30, emoji: '🌙' },
  { title: 'Velge middag', cost: 20, emoji: '🍕' },
  { title: 'Lommepenger', cost: 50, emoji: '💰' },
  { title: 'Kompis', cost: 45, emoji: '🥳' },
];

/** Maler for langsiktige stjernemål med nivåer. */
export const STAR_GOAL_TEMPLATES = [
  {
    title: 'Stor opplevelse',
    emoji: '🎢',
    description: 'Saml stjerner over tid mot en skikkelig belønning.',
    shared: false,
    milestones: [
      { points: 500, title: 'Liten belønning', emoji: '🍦' },
      { points: 2000, title: 'Kino / aktivitet', emoji: '🎬' },
      { points: 5000, title: 'Dyreparken', emoji: '🦁' },
      { points: 10000, title: 'Stor tur', emoji: '✈️' },
    ],
  },
  {
    title: 'Familieprosjekt',
    emoji: '👨‍👩‍👧‍👦',
    description: 'Alle bidrar — stjernene telles sammen.',
    shared: true,
    milestones: [
      { points: 1000, title: 'Pizza-kveld', emoji: '🍕' },
      { points: 5000, title: 'Utflukt', emoji: '🚌' },
      { points: 10000, title: 'Stor familieopplevelse', emoji: '🎉' },
    ],
  },
];
