/**
 * Oppgavebaserte øvinger for Leksehjelpen — fargede sideslides per fag.
 * AI tolker faget uansett; slides er pedagogisk inngang + øvingsoppgaver.
 */

export const SUBJECT_THEMES = [
  {
    id: 'matematikk',
    label: 'Matematikk',
    kicker: 'LEKSE · MATTE',
    ageLabel: '6–16 år',
    blurb: 'Regnesteg, potenser og tallforståelse — ett hint om gangen.',
    tint: '#edf5ff',
    accent: '#245fef',
    artKey: 'heroLeksehjelp',
  },
  {
    id: 'norsk',
    label: 'Norsk',
    kicker: 'LEKSE · NORSK',
    ageLabel: '6–16 år',
    blurb: 'Lesing, skriving og ord — med spørsmål som hjelper deg videre.',
    tint: '#edf7f3',
    accent: '#0f766e',
    artKey: 'heroSchool',
  },
  {
    id: 'engelsk',
    label: 'Engelsk',
    kicker: 'LEKSE · ENGLISH',
    ageLabel: '8–16 år',
    blurb: 'Ord, setninger og forståelse — øv selv før fasit.',
    tint: '#f0edfc',
    accent: '#5b4bb7',
    artKey: 'heroLeksehjelp',
  },
  {
    id: 'naturfag',
    label: 'Naturfag',
    kicker: 'LEKSE · NATUR',
    ageLabel: '8–16 år',
    blurb: 'Eksperimenter, kropp og miljø — forstå før du svarer.',
    tint: '#eef9f0',
    accent: '#15803d',
    artKey: 'heroSchool',
  },
  {
    id: 'samfunnsfag',
    label: 'Samfunnsfag',
    kicker: 'LEKSE · SAMFUNN',
    ageLabel: '9–16 år',
    blurb: 'Histor, historie og demokrati — ett spørsmål om gangen.',
    tint: '#fff7ed',
    accent: '#c2410c',
    artKey: 'heroSchool',
  },
  {
    id: 'rle',
    label: 'KRLE',
    kicker: 'LEKSE · KRLE',
    ageLabel: '8–16 år',
    blurb: 'Religion, livssyn og etikk — tenk selv, med støtte.',
    tint: '#fdf4ff',
    accent: '#a21caf',
    artKey: 'heroLeksehjelp',
  },
  {
    id: 'kroppsoving',
    label: 'Kroppsøving',
    kicker: 'LEKSE · GYM',
    ageLabel: '6–16 år',
    blurb: 'Bevegelse, helse og fair play — forklar med egne ord.',
    tint: '#ecfeff',
    accent: '#0e7490',
    artKey: 'heroSchool',
  },
  {
    id: 'kunst',
    label: 'Kunst og håndverk',
    kicker: 'LEKSE · KUNST',
    ageLabel: '6–16 år',
    blurb: 'Form, farge og teknikker — beskriv hva du ser og gjør.',
    tint: '#fff1f2',
    accent: '#be123c',
    artKey: 'heroSchool',
  },
  {
    id: 'musikk',
    label: 'Musikk',
    kicker: 'LEKSE · MUSIKK',
    ageLabel: '6–16 år',
    blurb: 'Noter, rytme og lytting — finn mønsteret selv.',
    tint: '#f5f3ff',
    accent: '#6d28d9',
    artKey: 'heroLeksehjelp',
  },
  {
    id: 'annet',
    label: 'Annet fag',
    kicker: 'LEKSE · ANNET',
    ageLabel: '6–16 år',
    blurb: 'Lim inn oppgaven — AI skjønner faget og guider deg.',
    tint: '#f8fafc',
    accent: '#475569',
    artKey: 'heroSchool',
  },
];

/** @typedef {{ id: string, subject: string, title: string, prompt: string, ageMin?: number, ageMax?: number, difficulty?: string }} PracticeMission */

/** @type {PracticeMission[]} */
export const PRACTICE_MISSIONS = [
  // Matematikk
  {
    id: 'matte-gange-enkel',
    subject: 'matematikk',
    title: 'Gange med tier',
    prompt: 'Regn ut 324 × 9. Vis hvordan du tenker — gjerne med hundre, tiere og enere.',
    ageMin: 8,
    ageMax: 12,
    difficulty: 'middels',
  },
  {
    id: 'matte-potens',
    subject: 'matematikk',
    title: 'Potenser',
    prompt: 'Hva er 5²? Forklar hva potensen betyr før du regner.',
    ageMin: 10,
    ageMax: 14,
    difficulty: 'lett',
  },
  {
    id: 'matte-brøk',
    subject: 'matematikk',
    title: 'Brøk av et tall',
    prompt: 'Hva er 3/4 av 48? Vis stegene dine.',
    ageMin: 10,
    ageMax: 14,
    difficulty: 'middels',
  },
  {
    id: 'matte-prosent',
    subject: 'matematikk',
    title: 'Prosent',
    prompt: 'En genser koster 400 kr. Den er 25 % på salg. Hva betaler du?',
    ageMin: 11,
    ageMax: 16,
    difficulty: 'middels',
  },
  {
    id: 'matte-likning',
    subject: 'matematikk',
    title: 'Enkel likning',
    prompt: 'Finn x: 3x + 7 = 22. Vis hvordan du isolerer x.',
    ageMin: 12,
    ageMax: 16,
    difficulty: 'vanskelig',
  },
  {
    id: 'matte-addisjon',
    subject: 'matematikk',
    title: 'Addisjon',
    prompt: 'Regn ut 47 + 28. Kan du forklare hvordan du deler opp tallene?',
    ageMin: 6,
    ageMax: 9,
    difficulty: 'lett',
  },
  // Norsk
  {
    id: 'norsk-verb',
    subject: 'norsk',
    title: 'Verb i fortid',
    prompt: 'Sett verbet i preteritum: «Jeg (løpe) til skolen.» Forklar hva preteritum er.',
    ageMin: 8,
    ageMax: 12,
    difficulty: 'lett',
  },
  {
    id: 'norsk-komma',
    subject: 'norsk',
    title: 'Kommaregler',
    prompt: 'Hvor skal kommaet stå? «Når jeg kommer hjem lager jeg middag.» Forklar hvorfor.',
    ageMin: 10,
    ageMax: 15,
    difficulty: 'middels',
  },
  {
    id: 'norsk-sammenlign',
    subject: 'norsk',
    title: 'Sammenligning',
    prompt: 'Skriv to setninger som sammenligner sommer og vinter. Bruk «mer … enn» eller «like … som».',
    ageMin: 9,
    ageMax: 13,
    difficulty: 'middels',
  },
  // Engelsk
  {
    id: 'eng-past',
    subject: 'engelsk',
    title: 'Past tense',
    prompt: 'Change to past tense: «I go to school every day.» Explain the rule you used.',
    ageMin: 9,
    ageMax: 13,
    difficulty: 'lett',
  },
  {
    id: 'eng-vocab',
    subject: 'engelsk',
    title: 'Ordforråd',
    prompt: 'What does «curious» mean in Norwegian? Write a short English sentence using the word.',
    ageMin: 10,
    ageMax: 15,
    difficulty: 'middels',
  },
  {
    id: 'eng-question',
    subject: 'engelsk',
    title: 'Spørsmål',
    prompt: 'Make a correct question: «Where / you / live?» Then answer it in one sentence.',
    ageMin: 8,
    ageMax: 12,
    difficulty: 'lett',
  },
  // Naturfag
  {
    id: 'natur-vann',
    subject: 'naturfag',
    title: 'Vannets kretsløp',
    prompt: 'Forklar kort vannets kretsløp med egne ord: fordamping, skyer og nedbør.',
    ageMin: 9,
    ageMax: 14,
    difficulty: 'middels',
  },
  {
    id: 'natur-kraft',
    subject: 'naturfag',
    title: 'Krefter',
    prompt: 'Hva er forskjellen på tyngdekraft og friksjon? Gi ett eksempel fra hverdagen.',
    ageMin: 11,
    ageMax: 16,
    difficulty: 'middels',
  },
  // Samfunn
  {
    id: 'samfunn-demokrati',
    subject: 'samfunnsfag',
    title: 'Demokrati',
    prompt: 'Hva betyr demokrati? Nevn én måte barn eller voksne kan påvirke i Norge.',
    ageMin: 10,
    ageMax: 16,
    difficulty: 'lett',
  },
  // KRLE
  {
    id: 'rle-respekt',
    subject: 'rle',
    title: 'Respekt',
    prompt: 'Hvorfor er det viktig å vise respekt for ulike religioner og livssyn? Gi ett eksempel.',
    ageMin: 9,
    ageMax: 14,
    difficulty: 'lett',
  },
  // Annet
  {
    id: 'annet-forklar',
    subject: 'annet',
    title: 'Forklar oppgaven',
    prompt: 'Lim inn leksen din under, eller skriv hva du lurer på. Vi tar det steg for steg.',
    ageMin: 6,
    ageMax: 16,
    difficulty: 'lett',
  },
];

/**
 * @param {string|null|undefined} subjectId
 * @param {number|null|undefined} childAge
 * @param {number} [limit]
 */
export function missionsForSubject(subjectId, childAge, limit = 4) {
  const sid = String(subjectId || '').trim();
  if (!sid) return [];
  const age = Number.isFinite(childAge) ? Number(childAge) : null;
  const list = PRACTICE_MISSIONS.filter((m) => m.subject === sid).filter((m) => {
    if (age == null) return true;
    if (m.ageMin != null && age < m.ageMin) return false;
    if (m.ageMax != null && age > m.ageMax) return false;
    return true;
  });
  const fallback = PRACTICE_MISSIONS.filter((m) => m.subject === sid);
  return (list.length ? list : fallback).slice(0, limit);
}

export function themeForSubject(subjectId) {
  return SUBJECT_THEMES.find((t) => t.id === subjectId) || null;
}
