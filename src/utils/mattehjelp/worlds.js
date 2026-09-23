/**
 * Mattehjelpen — verdener, fag og aldersbånd.
 *
 * Pedagogisk forankring:
 * - LK20 (matematikk, norsk, engelsk) for skolealder
 * - Rammeplan for barnehagen (antall, rom, språk) for 3–5 år
 * - Scaffolding / ZPD (Vygotsky, Wood)
 * - Lekbasert læring (Albert Junior-inspirert struktur, ProTop-unik AI-los)
 * - House of Math Base–Build–Burn + Lekselos hint-først
 */

export const AGE_WORLDS = [
  {
    id: 'smaatroll',
    label: 'Småtroll',
    ageMin: 3,
    ageMax: 5,
    blurb: 'Telle, sortere og leke med tall og bokstaver.',
    tint: '#fef3c7',
    accent: '#d97706',
    icon: 'happy-outline',
  },
  {
    id: 'oppdagere',
    label: 'Oppdagere',
    ageMin: 6,
    ageMax: 9,
    blurb: 'Små oppdrag i matte, norsk og engelsk — med stjerner underveis.',
    tint: '#edf5ff',
    accent: '#245fef',
    icon: 'compass-outline',
  },
  {
    id: 'mestring',
    label: 'Mestring',
    ageMin: 10,
    ageMax: 13,
    blurb: 'Mengdetrening, strategier og AI-los som gir hint — ikke fasit først.',
    tint: '#edf7f3',
    accent: '#0f766e',
    icon: 'trophy-outline',
  },
  {
    id: 'utfordring',
    label: 'Utfordring',
    ageMin: 14,
    ageMax: 16,
    blurb: 'Dypere oppgaver, resonnering og forberedelse til prøver.',
    tint: '#f0edfc',
    accent: '#5b4bb7',
    icon: 'rocket-outline',
  },
];

export const SUBJECTS = [
  {
    id: 'matematikk',
    label: 'Matematikk',
    kicker: 'TALL & TENKNING',
    icon: 'calculator-outline',
    tint: '#edf5ff',
    accent: '#245fef',
  },
  {
    id: 'norsk',
    label: 'Norsk',
    kicker: 'ORD & SPRÅK',
    icon: 'book-outline',
    tint: '#edf7f3',
    accent: '#0f766e',
  },
  {
    id: 'engelsk',
    label: 'Engelsk',
    kicker: 'ENGLISH PLAY',
    icon: 'language-outline',
    tint: '#f0edfc',
    accent: '#5b4bb7',
  },
];

export const PLAY_MODES = [
  {
    id: 'lek',
    label: 'Lek & spill',
    blurb: 'Interaktive mini-spill — dra, trykk, match.',
    icon: 'game-controller-outline',
    worlds: ['smaatroll', 'oppdagere'],
  },
  {
    id: 'oppdrag',
    label: 'Dagens oppdrag',
    blurb: 'En tilpasset løype med stjerner og ros.',
    icon: 'flag-outline',
    worlds: ['smaatroll', 'oppdagere', 'mestring', 'utfordring'],
  },
  {
    id: 'ai-los',
    label: 'AI-losen',
    blurb: 'Hint først, blyanttavle og sokratiske spørsmål.',
    icon: 'sparkles-outline',
    worlds: ['oppdagere', 'mestring', 'utfordring'],
  },
];

export function worldForAge(age) {
  const n = Number(age);
  if (!Number.isFinite(n)) return AGE_WORLDS[1];
  return AGE_WORLDS.find((w) => n >= w.ageMin && n <= w.ageMax) || AGE_WORLDS[1];
}

export function modesForWorld(worldId) {
  return PLAY_MODES.filter((m) => m.worlds.includes(worldId));
}

export function subjectMeta(id) {
  return SUBJECTS.find((s) => s.id === id) || SUBJECTS[0];
}
