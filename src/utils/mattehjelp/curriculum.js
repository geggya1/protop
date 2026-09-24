/**
 * Curriculum-topics for Mattehjelpen — forankret i:
 * - Rammeplan for barnehagen (antall, rom og form; kommunikasjon/språk)
 * - LK20 kompetansemål (matematikk, norsk, engelsk) forenklet til spillbare skills
 * - Kikora-inspirert mengdetrening + House of Math mikrolæring
 */

/** @typedef {{ id: string, subject: string, worldIds: string[], title: string, skill: string, goal: string, gameTypes: string[] }} Topic */

/** @type {Topic[]} */
export const TOPICS = [
  // —— Småtroll (3–5) Matte ——
  {
    id: 'count-1-5',
    subject: 'matematikk',
    worldIds: ['smaatroll'],
    title: 'Telle til 5',
    skill: 'antall',
    goal: 'Barnet gjenkjenner antall 1–5 (en-til-en-korrespondanse).',
    gameTypes: ['countTap', 'matchQty'],
  },
  {
    id: 'count-1-10',
    subject: 'matematikk',
    worldIds: ['smaatroll', 'oppdagere'],
    title: 'Telle til 10',
    skill: 'antall',
    goal: 'Barnet teller og matcher mengder opp til 10.',
    gameTypes: ['countTap', 'matchQty'],
  },
  {
    id: 'more-less',
    subject: 'matematikk',
    worldIds: ['smaatroll', 'oppdagere'],
    title: 'Flere eller færre',
    skill: 'sammenligne',
    goal: 'Barnet sammenligner mengder uten å telle alltid.',
    gameTypes: ['moreLess'],
  },
  {
    id: 'shapes-basic',
    subject: 'matematikk',
    worldIds: ['smaatroll'],
    title: 'Former',
    skill: 'form',
    goal: 'Gjenkjenne sirkel, trekant, firkant.',
    gameTypes: ['matchPairs'],
  },
  // —— Oppdagere Matte ——
  {
    id: 'add-10',
    subject: 'matematikk',
    worldIds: ['oppdagere'],
    title: 'Pluss innenfor 10',
    skill: 'addisjon',
    goal: 'Addisjon med konkrete og symbolske tall innenfor 10 (LK20 2. trinn).',
    gameTypes: ['quiz', 'countTap'],
  },
  {
    id: 'sub-10',
    subject: 'matematikk',
    worldIds: ['oppdagere'],
    title: 'Minus innenfor 10',
    skill: 'subtraksjon',
    goal: 'Subtraksjon innenfor 10 med mengder.',
    gameTypes: ['quiz', 'moreLess'],
  },
  {
    id: 'double',
    subject: 'matematikk',
    worldIds: ['oppdagere', 'mestring'],
    title: 'Doblinger',
    skill: 'addisjon',
    goal: 'Kjenne doblinger som byggestein for hoderegning.',
    gameTypes: ['quiz'],
  },
  {
    id: 'times-table',
    subject: 'matematikk',
    worldIds: ['mestring', 'utfordring'],
    title: 'Gangetabell',
    skill: 'multiplikasjon',
    goal: 'Automatisere gangetabellen gjennom mengdetrening (Kikora-stil).',
    gameTypes: ['quiz', 'speedQuiz'],
  },
  {
    id: 'fractions-intro',
    subject: 'matematikk',
    worldIds: ['mestring', 'utfordring'],
    title: 'Brøk',
    skill: 'brøk',
    goal: 'Forstå deler av en helhet før prosedyreregning.',
    gameTypes: ['quiz', 'ai'],
  },
  {
    id: 'percent',
    subject: 'matematikk',
    worldIds: ['utfordring'],
    title: 'Prosent',
    skill: 'prosent',
    goal: 'Knytte prosent til brøk og dagligliv.',
    gameTypes: ['quiz', 'ai'],
  },
  {
    id: 'equations',
    subject: 'matematikk',
    worldIds: ['utfordring'],
    title: 'Likninger',
    skill: 'algebra',
    goal: 'Isolere ukjent med forklaring (resonnering, LK20).',
    gameTypes: ['ai', 'quiz'],
  },
  // —— Norsk ——
  {
    id: 'letters',
    subject: 'norsk',
    worldIds: ['smaatroll', 'oppdagere'],
    title: 'Bokstaver',
    skill: 'bokstav',
    goal: 'Gjenkjenne bokstaver og første lyd i ord.',
    gameTypes: ['matchPairs', 'quiz'],
  },
  {
    id: 'rhymes',
    subject: 'norsk',
    worldIds: ['smaatroll', 'oppdagere'],
    title: 'Rim',
    skill: 'fonologi',
    goal: 'Høre rim og leke med språket (rammeplan / tidlig literacy).',
    gameTypes: ['quiz', 'matchPairs'],
  },
  {
    id: 'verbs',
    subject: 'norsk',
    worldIds: ['oppdagere', 'mestring'],
    title: 'Verb i fortid',
    skill: 'grammatikk',
    goal: 'Bruke preteritum korrekt i enkle setninger.',
    gameTypes: ['quiz', 'ai'],
  },
  {
    id: 'comma',
    subject: 'norsk',
    worldIds: ['mestring', 'utfordring'],
    title: 'Komma',
    skill: 'rettskriving',
    goal: 'Plassere komma i leddsetninger.',
    gameTypes: ['quiz', 'ai'],
  },
  // —— Engelsk ——
  {
    id: 'en-colors',
    subject: 'engelsk',
    worldIds: ['smaatroll', 'oppdagere'],
    title: 'Colors',
    skill: 'vocab',
    goal: 'Lære fargeord gjennom lek.',
    gameTypes: ['matchPairs', 'quiz'],
  },
  {
    id: 'en-animals',
    subject: 'engelsk',
    worldIds: ['smaatroll', 'oppdagere'],
    title: 'Animals',
    skill: 'vocab',
    goal: 'Grunnleggende dyreord.',
    gameTypes: ['matchPairs', 'quiz'],
  },
  {
    id: 'en-past',
    subject: 'engelsk',
    worldIds: ['mestring', 'utfordring'],
    title: 'Past tense',
    skill: 'grammar',
    goal: 'Danne enkel past tense.',
    gameTypes: ['quiz', 'ai'],
  },
];

export function topicsFor({ worldId, subjectId } = {}) {
  return TOPICS.filter((t) => {
    if (worldId && !t.worldIds.includes(worldId)) return false;
    if (subjectId && t.subject !== subjectId) return false;
    return true;
  });
}

export function topicById(id) {
  return TOPICS.find((t) => t.id === id) || null;
}
