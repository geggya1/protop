/**
 * Aktivitets- og øvelseskatalog for familie-trening.
 *
 * Prinsipper (inspirert av TeamSnap Practice Plans, SoccerSkills, ungdomssvømming):
 * - Øvelser er knyttet til aktivitetstype — ikke én felles gym-liste for alt.
 * - Økt bygges i faser: oppvarming → teknikk/drill → hoveddel → nedtrapping.
 * - Styrke bruker muskelgrupper; idrett/kondisjon bruker øktfaser.
 * - Forslag er aldersegnede, korte og trygge — ikke eliteprogrammer.
 */

export const ACTIVITY_TYPES = [
  {
    id: 'tur',
    label: 'Tur / gåtur',
    icon: 'trail-sign-outline',
    color: '#0d9488',
    mode: 'outdoor',
    blurb: 'Enkelt for hele familien — tid, distanse eller stopp.',
    featured: true,
  },
  {
    id: 'hiking',
    label: 'Hiking / fjelltur',
    icon: 'walk-outline',
    color: '#65a30d',
    mode: 'outdoor',
    blurb: 'Tur med fokus på tempo, terreng og pause.',
    featured: true,
  },
  {
    id: 'loping',
    label: 'Løping',
    icon: 'speedometer-outline',
    color: '#7c3aed',
    mode: 'sport',
    blurb: 'Oppvarming, teknikk, intervall/tempo og nedjogging.',
    featured: true,
  },
  {
    id: 'sykling',
    label: 'Sykling',
    icon: 'bicycle-outline',
    color: '#d97706',
    mode: 'sport',
    blurb: 'Rolig start, teknikk/kadens, intervaller og nedtrapping.',
    featured: true,
  },
  {
    id: 'styrketrening',
    label: 'Styrketrening',
    icon: 'barbell-outline',
    color: '#0b74d1',
    mode: 'strength',
    blurb: 'Sett, reps og pause — tilpasset hjem / treningssenter.',
    featured: true,
  },
  {
    id: 'fotball',
    label: 'Fotball',
    icon: 'football-outline',
    color: '#15803d',
    mode: 'sport',
    blurb: 'Teknikk, ballkontroll, spillmoment og skadeforebygging.',
    featured: true,
  },
  {
    id: 'svomming',
    label: 'Svømming',
    icon: 'water-outline',
    color: '#0284c7',
    mode: 'sport',
    blurb: 'Oppvarming, teknikk-drill, kort sett og rolig avslutning.',
    featured: true,
  },
  {
    id: 'trening',
    label: 'Generell trening',
    icon: 'fitness-outline',
    color: '#059669',
    mode: 'mixed',
    blurb: 'Blanding av styrke, mobilitet og kondisjon.',
    featured: true,
  },
  {
    id: 'friplan',
    label: 'Fri plan',
    icon: 'create-outline',
    color: '#6366f1',
    mode: 'mixed',
    blurb: 'Tom struktur — fyll inn økter og øvelser selv.',
    featured: true,
  },
  {
    id: 'handball',
    label: 'Håndball',
    icon: 'basketball-outline',
    color: '#c2410c',
    mode: 'sport',
    blurb: 'Oppvarming, kast/mottak, spilløvelser og nedtrapping.',
  },
  {
    id: 'golf',
    label: 'Golf',
    icon: 'golf-outline',
    color: '#16a34a',
    mode: 'sport',
    blurb: 'Oppvarming, slagøvelser og kort spilløkt.',
  },
  {
    id: 'idrett',
    label: 'Annen idrett',
    icon: 'trophy-outline',
    color: '#dc2626',
    mode: 'sport',
    blurb: 'Generelle idrettsøvelser når sporten ikke står i listen.',
  },
  {
    id: 'annet',
    label: 'Annet',
    icon: 'ellipse-outline',
    color: '#64748b',
    mode: 'mixed',
    blurb: 'Fri struktur — du bestemmer innholdet selv.',
  },
];

/** Førstevalg på hub (gå/turer først). */
export const FEATURED_ACTIVITY_TYPES = ACTIVITY_TYPES.filter((t) => t.featured);

/** Øvrige typer — vises som hurtigvalg under hovedrutenettet på desktop. */
export const MORE_ACTIVITY_TYPES = ACTIVITY_TYPES.filter((t) => !t.featured);

/**
 * Underkategorier per aktivitet — åpnes før programforslag.
 * Inspirert av AllTrails / Nike Run Club / TeamSnap practice plans.
 */
export const ACTIVITY_SUBCATEGORIES = {
  tur: [
    { id: 'family', label: 'Familietur', blurb: 'Rolige turer alle kan være med på.' },
    { id: 'daily', label: 'Daglig gåtur', blurb: 'Korte vaneøkter i nabolaget.' },
    { id: 'city', label: 'Bytur', blurb: 'Gågater, parker og stopp underveis.' },
    { id: 'nature', label: 'Natursti', blurb: 'Skogsstier og lett terreng.' },
  ],
  hiking: [
    { id: 'easy', label: 'Lett tur', blurb: 'Kort stigning, god sti.' },
    { id: 'family', label: 'Familietur', blurb: 'Pauser, utsikt og drikkestopp.' },
    { id: 'terrain', label: 'Terreng', blurb: 'Bakker og mer krevende underlag.' },
    { id: 'day', label: 'Dags tur', blurb: 'Lengre tur med matpause.' },
  ],
  loping: [
    { id: 'beginner', label: 'Nybegynner', blurb: 'Gå/jogg-blanding.' },
    { id: 'easy', label: 'Rolig løping', blurb: 'Jevnt tempo, snakkefart.' },
    { id: 'intervals', label: 'Intervaller', blurb: 'Korte drag med pause.' },
    { id: 'long', label: 'Langkjøring', blurb: 'Lengre, rolig tur.' },
  ],
  sykling: [
    { id: 'easy', label: 'Rolig sykkeltur', blurb: 'Flat / lett rute.' },
    { id: 'cadence', label: 'Kadens', blurb: 'Teknikk og tråkkfrekvens.' },
    { id: 'intervals', label: 'Intervaller', blurb: 'Korte harde drag.' },
    { id: 'family', label: 'Familiesykling', blurb: 'Felles tur i rolig tempo.' },
  ],
  styrketrening: [
    { id: 'full', label: 'Helkropp', blurb: 'Balansert økt hjemme eller på senter.' },
    { id: 'upper', label: 'Overkropp', blurb: 'Bryst, rygg, skuldre, armer.' },
    { id: 'lower', label: 'Bein og kjerne', blurb: 'Knebøy, utfall, planke.' },
    { id: 'mobility', label: 'Mobilitet', blurb: 'Lett restitusjon og strekk.' },
  ],
  fotball: [
    { id: 'tech', label: 'Teknikk', blurb: 'Første touch og ballkontroll.' },
    { id: 'passing', label: 'Pasning', blurb: 'Pasning og mottak.' },
    { id: 'game', label: 'Spill', blurb: 'Småspill og spillmoment.' },
    { id: 'prevention', label: 'Skadeforebygging', blurb: 'FIFA 11+ / balanse.' },
  ],
  svomming: [
    { id: 'tech', label: 'Teknikk', blurb: 'Crawl, kick og streamline.' },
    { id: 'endurance', label: 'Utholdenhet', blurb: 'Lengre sett i rolig tempo.' },
    { id: 'sprint', label: 'Korte sett', blurb: '25-ere med fokus på kvalitet.' },
    { id: 'fun', label: 'Lek / vane', blurb: 'Lavterskel i bassenget.' },
  ],
  trening: [
    { id: 'home', label: 'Hjemmeøkt', blurb: 'Minimal utstyr.' },
    { id: 'mobility', label: 'Mobilitet + styrke', blurb: 'Kombinasjonsøkt.' },
    { id: 'cardio', label: 'Kondisjon', blurb: 'Kort og effektiv.' },
  ],
  handball: [
    { id: 'throw', label: 'Kast/mottak', blurb: 'Grunnleggende teknikk.' },
    { id: 'footwork', label: 'Fotarbeid', blurb: 'Bevegelse og balanse.' },
    { id: 'game', label: 'Spilløvelser', blurb: 'Småspill.' },
  ],
  golf: [
    { id: 'short', label: 'Short game', blurb: 'Putting og chipping.' },
    { id: 'range', label: 'Range', blurb: 'Jernslag og oppvarming.' },
    { id: 'play', label: 'Spill', blurb: 'Kort spilløkt.' },
  ],
  idrett: [
    { id: 'tech', label: 'Teknikk', blurb: 'Grunnleggende ferdigheter.' },
    { id: 'game', label: 'Spill / øvelse', blurb: 'Praksis i aktivitet.' },
    { id: 'fitness', label: 'Kondisjon', blurb: 'Generell form.' },
  ],
  annet: [
    { id: 'free', label: 'Fri struktur', blurb: 'Du bestemmer selv.' },
  ],
  friplan: [
    { id: 'free', label: 'Fri struktur', blurb: 'Du bestemmer selv.' },
  ],
};

/**
 * Ferdige programforslag (uker-uke) — velges på undersiden.
 * Økter bygges videre i ActivityDetail via «Foreslå økt».
 */
export const PROGRAM_SUGGESTIONS = {
  tur: [
    {
      id: 'tur-vane',
      title: 'Gåtur-vane (2 uker)',
      subcategory: 'daily',
      weeks: 2,
      sessionsPerWeek: 4,
      blurb: 'Korte 20–30 min turer — bygg vane uten press.',
      focusRotation: ['Gåtur 20–40 min', 'Bytur med stopp', 'Gåtur 20–40 min'],
    },
    {
      id: 'tur-familie',
      title: 'Familietur-program',
      subcategory: 'family',
      weeks: 3,
      sessionsPerWeek: 2,
      blurb: 'Helgeturer med pauser alle kan følge.',
      focusRotation: ['Gåtur 20–40 min', 'Bytur med stopp'],
    },
    {
      id: 'tur-natur',
      title: 'Natursti-intro',
      subcategory: 'nature',
      weeks: 2,
      sessionsPerWeek: 2,
      blurb: 'Lett skogssti, fokus på tempo og pause.',
      focusRotation: ['Gåtur 20–40 min'],
    },
  ],
  hiking: [
    {
      id: 'hike-start',
      title: 'Kom i gang med hiking',
      subcategory: 'easy',
      weeks: 3,
      sessionsPerWeek: 2,
      blurb: 'Korte stier, jevnt tempo og god drikkerytme.',
      focusRotation: ['Rolig tur', 'Terreng med pauser', 'Familietur'],
    },
    {
      id: 'hike-familie',
      title: 'Familiehiking',
      subcategory: 'family',
      weeks: 4,
      sessionsPerWeek: 1,
      blurb: 'Én tur i uken med utsikt og drikkestopp.',
      focusRotation: ['Familietur', 'Rolig tur'],
    },
    {
      id: 'hike-terreng',
      title: 'Terrengprogresjon',
      subcategory: 'terrain',
      weeks: 3,
      sessionsPerWeek: 2,
      blurb: 'Gradvis mer bakke — med pauser.',
      focusRotation: ['Terreng med pauser', 'Rolig tur'],
    },
  ],
  loping: [
    {
      id: 'run-start',
      title: 'Start å løpe',
      subcategory: 'beginner',
      weeks: 4,
      sessionsPerWeek: 3,
      blurb: 'Gå/jogg-blanding inspirert av nybegynnerprogrammer.',
      focusRotation: ['Løpsteknikk', 'Rolig langkjøring', 'Intervaller'],
    },
    {
      id: 'run-easy',
      title: 'Rolig løpeform',
      subcategory: 'easy',
      weeks: 3,
      sessionsPerWeek: 3,
      blurb: 'Snakkefart og jevn progresjon.',
      focusRotation: ['Rolig langkjøring', 'Løpsteknikk'],
    },
  ],
  sykling: [
    {
      id: 'bike-familie',
      title: 'Familiesykling',
      subcategory: 'family',
      weeks: 3,
      sessionsPerWeek: 2,
      blurb: 'Rolige turer sammen — fokus på glede.',
      focusRotation: ['Kadens og sittestilling', 'Rolig utholdenhet'],
    },
    {
      id: 'bike-kadens',
      title: 'Kadens og form',
      subcategory: 'cadence',
      weeks: 3,
      sessionsPerWeek: 3,
      blurb: 'Teknikk først, deretter korte intervaller.',
      focusRotation: ['Kadens og sittestilling', 'Korte intervaller', 'Rolig utholdenhet'],
    },
  ],
  styrketrening: [
    {
      id: 'strength-full',
      title: 'Helkropp 3×/uke',
      subcategory: 'full',
      weeks: 4,
      sessionsPerWeek: 3,
      blurb: 'Balansert program for hjem eller senter.',
      focusRotation: ['Helkropp', 'Overkropp', 'Bein og kjerne'],
    },
    {
      id: 'strength-mobility',
      title: 'Styrke + mobilitet',
      subcategory: 'mobility',
      weeks: 3,
      sessionsPerWeek: 3,
      blurb: 'Lett restitusjon mellom tyngre dager.',
      focusRotation: ['Helkropp', 'Lett restitusjon', 'Bein og kjerne'],
    },
  ],
  fotball: [
    {
      id: 'football-tech',
      title: 'Teknikkuke',
      subcategory: 'tech',
      weeks: 3,
      sessionsPerWeek: 2,
      blurb: 'Første touch, pasning og skadeforebygging.',
      focusRotation: ['Første touch', 'Pasning og mottak', 'FIFA 11+ / skadeforebygging'],
    },
    {
      id: 'football-game',
      title: 'Spillfokus',
      subcategory: 'game',
      weeks: 3,
      sessionsPerWeek: 2,
      blurb: 'Småspill med teknikk før.',
      focusRotation: ['Pasning og mottak', 'Avslutning', 'Første touch'],
    },
  ],
  svomming: [
    {
      id: 'swim-tech',
      title: 'Teknikk i basseng',
      subcategory: 'tech',
      weeks: 3,
      sessionsPerWeek: 2,
      blurb: 'Kick, streamline og korte kvalitetsett.',
      focusRotation: ['Crawl-teknikk', 'Kick og streamline', 'Kort sett 25-ere'],
    },
  ],
  trening: [
    {
      id: 'mixed-home',
      title: 'Hjemmeform',
      subcategory: 'home',
      weeks: 3,
      sessionsPerWeek: 3,
      blurb: 'Korte økter uten mye utstyr.',
      focusRotation: ['Mobilitet + styrke', 'Kondisjon hjemme', 'Kort helkroppsøkt'],
    },
  ],
  handball: [
    {
      id: 'handball-base',
      title: 'Grunnlag håndball',
      subcategory: 'throw',
      weeks: 3,
      sessionsPerWeek: 2,
      blurb: 'Kast, fotarbeid og småspill.',
      focusRotation: ['Kast og mottak', 'Fotarbeid', 'Småspill'],
    },
  ],
  golf: [
    {
      id: 'golf-short',
      title: 'Short game-fokus',
      subcategory: 'short',
      weeks: 3,
      sessionsPerWeek: 2,
      blurb: 'Putting og chipping før lengre slag.',
      focusRotation: ['Oppvarming + short game', 'Putting'],
    },
  ],
  idrett: [
    {
      id: 'sport-general',
      title: 'Generelt idrettsprogram',
      subcategory: 'tech',
      weeks: 3,
      sessionsPerWeek: 2,
      blurb: 'Teknikk, spill og kondisjon.',
      focusRotation: ['Teknikk', 'Spill / øvelse', 'Kondisjon'],
    },
  ],
  annet: [
    {
      id: 'free-plan',
      title: 'Fri plan',
      subcategory: 'free',
      weeks: 1,
      sessionsPerWeek: 3,
      blurb: 'Tom struktur — fyll inn selv.',
      focusRotation: ['Fri økt'],
    },
  ],
  friplan: [
    {
      id: 'free-plan',
      title: 'Fri plan',
      subcategory: 'free',
      weeks: 1,
      sessionsPerWeek: 3,
      blurb: 'Tom struktur — fyll inn selv.',
      focusRotation: ['Fri økt'],
    },
  ],
};

export function getSubcategories(typeId) {
  return ACTIVITY_SUBCATEGORIES[typeId] || ACTIVITY_SUBCATEGORIES.annet;
}

export function getProgramsForType(typeId, subcategoryId = null) {
  const list = PROGRAM_SUGGESTIONS[typeId] || PROGRAM_SUGGESTIONS.annet || [];
  if (!subcategoryId) return list;
  const filtered = list.filter((p) => p.subcategory === subcategoryId);
  return filtered.length ? filtered : list;
}

export function getProgramById(typeId, programId) {
  return (PROGRAM_SUGGESTIONS[typeId] || []).find((p) => p.id === programId) || null;
}

export const WEEKDAYS = [
  { id: 'mon', label: 'Mandag', short: 'Man' },
  { id: 'tue', label: 'Tirsdag', short: 'Tir' },
  { id: 'wed', label: 'Onsdag', short: 'Ons' },
  { id: 'thu', label: 'Torsdag', short: 'Tor' },
  { id: 'fri', label: 'Fredag', short: 'Fre' },
  { id: 'sat', label: 'Lørdag', short: 'Lør' },
  { id: 'sun', label: 'Søndag', short: 'Søn' },
];

/** Filtre for styrke-modus */
export const MUSCLE_GROUPS = [
  { id: 'chest', label: 'Bryst' },
  { id: 'back', label: 'Rygg' },
  { id: 'shoulders', label: 'Skuldre' },
  { id: 'arms', label: 'Armer' },
  { id: 'legs', label: 'Bein' },
  { id: 'core', label: 'Mage' },
  { id: 'cardio', label: 'Kondisjon' },
  { id: 'full', label: 'Helkropp' },
  { id: 'mobility', label: 'Mobilitet' },
];

/**
 * Filtre for idrett/kondisjon — speiler vanlig øktstruktur
 * (TeamSnap practice plans / ungdomssvømming: warm-up → drill → main → cool-down).
 */
export const SESSION_PHASES = [
  { id: 'warmup', label: 'Oppvarming' },
  { id: 'technique', label: 'Teknikk' },
  { id: 'main', label: 'Hoveddel' },
  { id: 'cooldown', label: 'Nedtrapping' },
  { id: 'prevention', label: 'Skadeforebygging' },
];

export const FOCUS_SUGGESTIONS = {
  styrketrening: ['Helkropp', 'Overkropp', 'Bein og kjerne', 'Lett restitusjon'],
  trening: ['Mobilitet + styrke', 'Kondisjon hjemme', 'Kort helkroppsøkt'],
  svomming: ['Crawl-teknikk', 'Kick og streamline', 'Kort sett 25-ere', 'Rolig vaneøkt'],
  sykling: ['Kadens og sittestilling', 'Korte intervaller', 'Rolig utholdenhet'],
  loping: ['Løpsteknikk', 'Intervaller', 'Rolig langkjøring'],
  fotball: ['Første touch', 'Pasning og mottak', 'Avslutning', 'FIFA 11+ / skadeforebygging'],
  handball: ['Kast og mottak', 'Fotarbeid', 'Småspill', 'Skuldre og kjerne'],
  hiking: ['Rolig tur', 'Terreng med pauser', 'Familietur'],
  tur: ['Gåtur 20–40 min', 'Bytur med stopp'],
  golf: ['Oppvarming + short game', 'Jernslag på range', 'Putting'],
  idrett: ['Teknikk', 'Spill / øvelse', 'Kondisjon'],
  annet: ['Fri økt'],
  friplan: ['Fri økt'],
};

function p(partial) {
  return {
    defaultSets: 3,
    defaultReps: null,
    defaultDurationSec: null,
    defaultRestSec: 60,
    defaultIntervalWorkSec: null,
    defaultIntervalRestSec: null,
    defaultNotes: '',
    phase: 'main',
    muscleGroup: 'full',
    activityTypes: ['annet'],
    ...partial,
  };
}

/** Styrke / gym — kun for styrketrening + generell trening */
const STRENGTH_PRESETS = [
  p({ name: 'Benkpress', muscleGroup: 'chest', activityTypes: ['styrketrening'], defaultSets: 4, defaultReps: 8, defaultRestSec: 90 }),
  p({ name: 'Skråbenk', muscleGroup: 'chest', activityTypes: ['styrketrening'], defaultSets: 3, defaultReps: 10, defaultRestSec: 90 }),
  p({ name: 'Armhevninger', muscleGroup: 'chest', activityTypes: ['styrketrening', 'trening'], defaultSets: 3, defaultReps: 12, defaultRestSec: 60, defaultNotes: 'Knelende variant for yngre / nybegynnere.' }),
  p({ name: 'Flyes', muscleGroup: 'chest', activityTypes: ['styrketrening'], defaultSets: 3, defaultReps: 12, defaultRestSec: 60 }),
  p({ name: 'Nedtrekk', muscleGroup: 'back', activityTypes: ['styrketrening'], defaultSets: 4, defaultReps: 10, defaultRestSec: 90 }),
  p({ name: 'Roing', muscleGroup: 'back', activityTypes: ['styrketrening', 'trening'], defaultSets: 3, defaultReps: 10, defaultRestSec: 90 }),
  p({ name: 'Markløft', muscleGroup: 'back', activityTypes: ['styrketrening'], defaultSets: 3, defaultReps: 6, defaultRestSec: 120, defaultNotes: 'Kun med god teknikk og tilsyn for ungdom.' }),
  p({ name: 'Pull-ups / heng', muscleGroup: 'back', activityTypes: ['styrketrening', 'trening'], defaultSets: 3, defaultReps: 6, defaultRestSec: 90 }),
  p({ name: 'Militærpress', muscleGroup: 'shoulders', activityTypes: ['styrketrening'], defaultSets: 3, defaultReps: 8, defaultRestSec: 90 }),
  p({ name: 'Sidehev', muscleGroup: 'shoulders', activityTypes: ['styrketrening'], defaultSets: 3, defaultReps: 12, defaultRestSec: 60 }),
  p({ name: 'Face pulls', muscleGroup: 'shoulders', activityTypes: ['styrketrening', 'trening'], defaultSets: 3, defaultReps: 15, defaultRestSec: 45, phase: 'prevention' }),
  p({ name: 'Biceps curls', muscleGroup: 'arms', activityTypes: ['styrketrening'], defaultSets: 3, defaultReps: 12, defaultRestSec: 60 }),
  p({ name: 'Triceps pushdown', muscleGroup: 'arms', activityTypes: ['styrketrening'], defaultSets: 3, defaultReps: 12, defaultRestSec: 60 }),
  p({ name: 'Knebøy', muscleGroup: 'legs', activityTypes: ['styrketrening', 'trening'], defaultSets: 4, defaultReps: 8, defaultRestSec: 120 }),
  p({ name: 'Utfall', muscleGroup: 'legs', activityTypes: ['styrketrening', 'trening', 'fotball', 'handball'], defaultSets: 3, defaultReps: 10, defaultRestSec: 90, phase: 'main' }),
  p({ name: 'Leg press', muscleGroup: 'legs', activityTypes: ['styrketrening'], defaultSets: 3, defaultReps: 12, defaultRestSec: 90 }),
  p({ name: 'Calf raises', muscleGroup: 'legs', activityTypes: ['styrketrening', 'loping'], defaultSets: 3, defaultReps: 15, defaultRestSec: 45 }),
  p({ name: 'Planke', muscleGroup: 'core', activityTypes: ['styrketrening', 'trening', 'fotball', 'handball', 'idrett'], defaultSets: 3, defaultDurationSec: 30, defaultRestSec: 45, defaultNotes: 'Start med 20–30 sek for barn.' }),
  p({ name: 'Sit-ups', muscleGroup: 'core', activityTypes: ['styrketrening', 'trening'], defaultSets: 3, defaultReps: 15, defaultRestSec: 45 }),
  p({ name: 'Dead bug', muscleGroup: 'core', activityTypes: ['trening', 'fotball', 'handball'], defaultSets: 3, defaultReps: 10, defaultRestSec: 45, phase: 'prevention', defaultNotes: 'Skånsom kjerneøvelse for ungdom.' }),
  p({ name: 'Burpees', muscleGroup: 'cardio', activityTypes: ['trening'], defaultSets: 3, defaultReps: 8, defaultRestSec: 60 }),
  p({ name: 'Kettlebell swing', muscleGroup: 'full', activityTypes: ['styrketrening'], defaultSets: 4, defaultReps: 12, defaultRestSec: 60 }),
  p({ name: 'Verdens beste strekk (hofteåpner)', muscleGroup: 'mobility', activityTypes: ['trening', 'loping', 'fotball', 'handball'], defaultSets: 2, defaultDurationSec: 40, defaultRestSec: 20, phase: 'warmup' }),
  p({ name: 'Hofte-/ankelmobilitet', muscleGroup: 'mobility', activityTypes: ['trening', 'loping', 'sykling'], defaultSets: 2, defaultDurationSec: 60, defaultRestSec: 15, phase: 'warmup' }),
];

/** Svømming — kort økt 30–45 min for ungdom/familie */
const SWIM_PRESETS = [
  p({ name: 'Rolig oppvarming (25-ere fri/rygg)', activityTypes: ['svomming'], phase: 'warmup', muscleGroup: 'cardio', defaultSets: 4, defaultDurationSec: 45, defaultRestSec: 20, defaultNotes: 'Samme start hver økt skaper trygghet for barn.' }),
  p({ name: 'Kick på vegg / kickboard', activityTypes: ['svomming'], phase: 'technique', muscleGroup: 'legs', defaultSets: 6, defaultDurationSec: 30, defaultRestSec: 25, defaultNotes: 'Én teknikk om gangen.' }),
  p({ name: 'Streamline spark etter vegg', activityTypes: ['svomming'], phase: 'technique', muscleGroup: 'full', defaultSets: 6, defaultReps: 1, defaultRestSec: 30 }),
  p({ name: 'Crawl: armføring stående / med brett', activityTypes: ['svomming'], phase: 'technique', muscleGroup: 'arms', defaultSets: 8, defaultDurationSec: 25, defaultRestSec: 20 }),
  p({ name: 'Sidekick + rotasjon', activityTypes: ['svomming'], phase: 'technique', muscleGroup: 'core', defaultSets: 6, defaultDurationSec: 30, defaultRestSec: 25 }),
  p({ name: 'Teknikksett 8–12 × 25', activityTypes: ['svomming'], phase: 'main', muscleGroup: 'cardio', defaultSets: 10, defaultDurationSec: 40, defaultRestSec: 30, defaultNotes: 'Generøs pause. Bland drill + rolig svøm.' }),
  p({ name: 'Kort hovedsett (valgfri svøm)', activityTypes: ['svomming'], phase: 'main', muscleGroup: 'cardio', defaultSets: 6, defaultDurationSec: 45, defaultRestSec: 30 }),
  p({ name: 'Rolig nedtrapping / lek', activityTypes: ['svomming'], phase: 'cooldown', muscleGroup: 'cardio', defaultSets: 2, defaultDurationSec: 60, defaultRestSec: 0, defaultNotes: 'Avslutt positivt.' }),
];

const CYCLE_PRESETS = [
  p({ name: 'Lett spinning / rolig tråkk', activityTypes: ['sykling'], phase: 'warmup', muscleGroup: 'cardio', defaultSets: 1, defaultDurationSec: 480, defaultRestSec: 0, defaultNotes: '5–10 min lav intensitet.' }),
  p({ name: 'Kadensøvelse (jevn tråkkfrekvens)', activityTypes: ['sykling'], phase: 'technique', muscleGroup: 'legs', defaultSets: 4, defaultDurationSec: 90, defaultRestSec: 60 }),
  p({ name: 'Sittestilling / kjerne på sykkel', activityTypes: ['sykling'], phase: 'technique', muscleGroup: 'core', defaultSets: 3, defaultDurationSec: 60, defaultRestSec: 30 }),
  p({ name: 'Sykkelintervaller', activityTypes: ['sykling'], phase: 'main', muscleGroup: 'cardio', defaultSets: 6, defaultDurationSec: 90, defaultIntervalWorkSec: 90, defaultIntervalRestSec: 60, defaultRestSec: 0, defaultNotes: 'Tilpass lengde til alder og form.' }),
  p({ name: 'Rolig utholdenhet', activityTypes: ['sykling'], phase: 'main', muscleGroup: 'cardio', defaultSets: 1, defaultDurationSec: 1200, defaultRestSec: 0 }),
  p({ name: 'Lett nedtrapping', activityTypes: ['sykling'], phase: 'cooldown', muscleGroup: 'cardio', defaultSets: 1, defaultDurationSec: 300, defaultRestSec: 0 }),
];

const RUN_PRESETS = [
  p({ name: 'Rolig jogg oppvarming', activityTypes: ['loping'], phase: 'warmup', muscleGroup: 'cardio', defaultSets: 1, defaultDurationSec: 480, defaultRestSec: 0 }),
  p({ name: 'A-skip / høye kneløft', activityTypes: ['loping'], phase: 'technique', muscleGroup: 'legs', defaultSets: 3, defaultDurationSec: 30, defaultRestSec: 30 }),
  p({ name: 'Korte stigningsløp', activityTypes: ['loping'], phase: 'technique', muscleGroup: 'cardio', defaultSets: 4, defaultDurationSec: 20, defaultRestSec: 40 }),
  p({ name: 'Intervalløping', activityTypes: ['loping'], phase: 'main', muscleGroup: 'cardio', defaultSets: 6, defaultDurationSec: 60, defaultIntervalWorkSec: 60, defaultIntervalRestSec: 60, defaultRestSec: 0 }),
  p({ name: 'Rolig langkjøring', activityTypes: ['loping'], phase: 'main', muscleGroup: 'cardio', defaultSets: 1, defaultDurationSec: 1500, defaultRestSec: 0 }),
  p({ name: 'Nedjogging + strekk', activityTypes: ['loping'], phase: 'cooldown', muscleGroup: 'mobility', defaultSets: 1, defaultDurationSec: 300, defaultRestSec: 0 }),
];

const FOOTBALL_PRESETS = [
  p({ name: 'Lett jogg + dynamisk oppvarming', activityTypes: ['fotball'], phase: 'warmup', muscleGroup: 'cardio', defaultSets: 1, defaultDurationSec: 420, defaultRestSec: 0 }),
  p({ name: 'FIFA 11+ / balanse (enkelt)', activityTypes: ['fotball'], phase: 'prevention', muscleGroup: 'full', defaultSets: 2, defaultDurationSec: 180, defaultRestSec: 30, defaultNotes: 'Skadeforebygging før spill.' }),
  p({ name: 'Toe-taps / ballmestring', activityTypes: ['fotball'], phase: 'technique', muscleGroup: 'full', defaultSets: 3, defaultDurationSec: 45, defaultRestSec: 30 }),
  p({ name: 'Veggpasning — svak fot', activityTypes: ['fotball'], phase: 'technique', muscleGroup: 'legs', defaultSets: 3, defaultDurationSec: 60, defaultRestSec: 30 }),
  p({ name: 'Cone weave (innside/utside)', activityTypes: ['fotball'], phase: 'technique', muscleGroup: 'legs', defaultSets: 4, defaultDurationSec: 40, defaultRestSec: 40 }),
  p({ name: '1v1 / avslutning (kort)', activityTypes: ['fotball'], phase: 'main', muscleGroup: 'full', defaultSets: 6, defaultReps: 1, defaultRestSec: 45 }),
  p({ name: 'Småspill 3v3 / 4v4', activityTypes: ['fotball'], phase: 'main', muscleGroup: 'cardio', defaultSets: 3, defaultDurationSec: 240, defaultRestSec: 90 }),
  p({ name: 'Rolig avslutning + strekk', activityTypes: ['fotball'], phase: 'cooldown', muscleGroup: 'mobility', defaultSets: 1, defaultDurationSec: 300, defaultRestSec: 0 }),
];

const HANDBALL_PRESETS = [
  p({ name: 'Jogg + arm/skulder-sirkler', activityTypes: ['handball'], phase: 'warmup', muscleGroup: 'shoulders', defaultSets: 1, defaultDurationSec: 420, defaultRestSec: 0 }),
  p({ name: 'Skulderaktivering (strikk/lett)', activityTypes: ['handball'], phase: 'prevention', muscleGroup: 'shoulders', defaultSets: 2, defaultReps: 12, defaultRestSec: 45 }),
  p({ name: 'Kast og mottak i par', activityTypes: ['handball'], phase: 'technique', muscleGroup: 'arms', defaultSets: 4, defaultDurationSec: 60, defaultRestSec: 30 }),
  p({ name: 'Fotarbeid / sidesteg', activityTypes: ['handball'], phase: 'technique', muscleGroup: 'legs', defaultSets: 4, defaultDurationSec: 40, defaultRestSec: 40 }),
  p({ name: 'Skudd mot mål (teknikk først)', activityTypes: ['handball'], phase: 'main', muscleGroup: 'full', defaultSets: 8, defaultReps: 1, defaultRestSec: 30 }),
  p({ name: 'Småspill / spilløvelse', activityTypes: ['handball'], phase: 'main', muscleGroup: 'cardio', defaultSets: 3, defaultDurationSec: 240, defaultRestSec: 90 }),
  p({ name: 'Nedtrapping + skulderstrekk', activityTypes: ['handball'], phase: 'cooldown', muscleGroup: 'mobility', defaultSets: 1, defaultDurationSec: 300, defaultRestSec: 0 }),
];

const OUTDOOR_PRESETS = [
  p({ name: 'Lett oppvarmingsgange', activityTypes: ['hiking', 'tur'], phase: 'warmup', muscleGroup: 'cardio', defaultSets: 1, defaultDurationSec: 300, defaultRestSec: 0 }),
  p({ name: 'Hoveddel — jevnt tempo', activityTypes: ['hiking', 'tur'], phase: 'main', muscleGroup: 'cardio', defaultSets: 1, defaultDurationSec: 1800, defaultRestSec: 0, defaultNotes: 'Juster tid etter familie og terreng.' }),
  p({ name: 'Terrengparti / bakke', activityTypes: ['hiking'], phase: 'main', muscleGroup: 'legs', defaultSets: 3, defaultDurationSec: 180, defaultRestSec: 120 }),
  p({ name: 'Pause / utsikt / drikkestopp', activityTypes: ['hiking', 'tur'], phase: 'technique', muscleGroup: 'full', defaultSets: 2, defaultDurationSec: 180, defaultRestSec: 0 }),
  p({ name: 'Rolig avslutning hjem', activityTypes: ['hiking', 'tur'], phase: 'cooldown', muscleGroup: 'cardio', defaultSets: 1, defaultDurationSec: 300, defaultRestSec: 0 }),
];

const GOLF_PRESETS = [
  p({ name: 'Dynamisk oppvarming (skulder/hofte)', activityTypes: ['golf'], phase: 'warmup', muscleGroup: 'mobility', defaultSets: 1, defaultDurationSec: 300, defaultRestSec: 0 }),
  p({ name: 'Putting — korte putter', activityTypes: ['golf'], phase: 'technique', muscleGroup: 'full', defaultSets: 3, defaultReps: 10, defaultRestSec: 30 }),
  p({ name: 'Chipping rundt green', activityTypes: ['golf'], phase: 'technique', muscleGroup: 'full', defaultSets: 3, defaultReps: 8, defaultRestSec: 45 }),
  p({ name: 'Jernslag på range', activityTypes: ['golf'], phase: 'main', muscleGroup: 'full', defaultSets: 4, defaultReps: 8, defaultRestSec: 60, defaultNotes: 'Kvalitet foran kvantitet.' }),
  p({ name: 'Kort spilløkt / 3 hull', activityTypes: ['golf'], phase: 'main', muscleGroup: 'cardio', defaultSets: 1, defaultDurationSec: 2700, defaultRestSec: 0 }),
  p({ name: 'Lett nedtrapping / strekk', activityTypes: ['golf'], phase: 'cooldown', muscleGroup: 'mobility', defaultSets: 1, defaultDurationSec: 240, defaultRestSec: 0 }),
];

const GENERIC_SPORT_PRESETS = [
  p({ name: 'Generell oppvarming', activityTypes: ['idrett', 'annet'], phase: 'warmup', muscleGroup: 'cardio', defaultSets: 1, defaultDurationSec: 420, defaultRestSec: 0 }),
  p({ name: 'Teknikkøvelse', activityTypes: ['idrett', 'annet'], phase: 'technique', muscleGroup: 'full', defaultSets: 4, defaultDurationSec: 60, defaultRestSec: 45 }),
  p({ name: 'Hovedøvelse / spill', activityTypes: ['idrett', 'annet'], phase: 'main', muscleGroup: 'cardio', defaultSets: 3, defaultDurationSec: 300, defaultRestSec: 90 }),
  p({ name: 'Nedtrapping', activityTypes: ['idrett', 'annet'], phase: 'cooldown', muscleGroup: 'mobility', defaultSets: 1, defaultDurationSec: 300, defaultRestSec: 0 }),
];

export const EXERCISE_PRESETS = [
  ...STRENGTH_PRESETS,
  ...SWIM_PRESETS,
  ...CYCLE_PRESETS,
  ...RUN_PRESETS,
  ...FOOTBALL_PRESETS,
  ...HANDBALL_PRESETS,
  ...OUTDOOR_PRESETS,
  ...GOLF_PRESETS,
  ...GENERIC_SPORT_PRESETS,
];

/** Ferdige mini-økter per type (TeamSnap-/SoccerSkills-stil: kort, i rekkefølge). */
export const SESSION_TEMPLATES = {
  svomming: [
    'Rolig oppvarming (25-ere fri/rygg)',
    'Kick på vegg / kickboard',
    'Teknikksett 8–12 × 25',
    'Rolig nedtrapping / lek',
  ],
  sykling: [
    'Lett spinning / rolig tråkk',
    'Kadensøvelse (jevn tråkkfrekvens)',
    'Sykkelintervaller',
    'Lett nedtrapping',
  ],
  loping: [
    'Rolig jogg oppvarming',
    'A-skip / høye kneløft',
    'Intervalløping',
    'Nedjogging + strekk',
  ],
  fotball: [
    'Lett jogg + dynamisk oppvarming',
    'FIFA 11+ / balanse (enkelt)',
    'Veggpasning — svak fot',
    'Småspill 3v3 / 4v4',
    'Rolig avslutning + strekk',
  ],
  handball: [
    'Jogg + arm/skulder-sirkler',
    'Skulderaktivering (strikk/lett)',
    'Kast og mottak i par',
    'Småspill / spilløvelse',
    'Nedtrapping + skulderstrekk',
  ],
  styrketrening: [
    'Armhevninger',
    'Roing',
    'Knebøy',
    'Planke',
  ],
  trening: [
    'Hofte-/ankelmobilitet',
    'Armhevninger',
    'Utfall',
    'Planke',
  ],
  hiking: [
    'Lett oppvarmingsgange',
    'Hoveddel — jevnt tempo',
    'Rolig avslutning hjem',
  ],
  tur: [
    'Lett oppvarmingsgange',
    'Hoveddel — jevnt tempo',
    'Rolig avslutning hjem',
  ],
  golf: [
    'Dynamisk oppvarming (skulder/hofte)',
    'Putting — korte putter',
    'Jernslag på range',
    'Lett nedtrapping / strekk',
  ],
  idrett: [
    'Generell oppvarming',
    'Teknikkøvelse',
    'Hovedøvelse / spill',
    'Nedtrapping',
  ],
};

export function getActivityType(typeId) {
  return ACTIVITY_TYPES.find((t) => t.id === typeId) || ACTIVITY_TYPES[ACTIVITY_TYPES.length - 1];
}

export function getMuscleGroupLabel(id) {
  return (
    MUSCLE_GROUPS.find((g) => g.id === id)?.label
    || SESSION_PHASES.find((g) => g.id === id)?.label
    || id
    || ''
  );
}

export function getPhaseLabel(id) {
  return SESSION_PHASES.find((g) => g.id === id)?.label || id || '';
}

export function activityUsesPhases(typeId) {
  const mode = getActivityType(typeId).mode;
  return mode === 'sport' || mode === 'outdoor';
}

/** Filtre som skal vises i øvelsesvelgeren for denne aktivitetstypen. */
export function getPresetFilters(typeId) {
  if (activityUsesPhases(typeId)) return SESSION_PHASES;
  return MUSCLE_GROUPS;
}

export function defaultPresetFilter(typeId) {
  if (activityUsesPhases(typeId)) return 'warmup';
  return 'chest';
}

export function defaultExerciseGroup(typeId) {
  if (activityUsesPhases(typeId)) return 'warmup';
  return 'full';
}

function matchesActivity(preset, typeId) {
  const types = preset.activityTypes || [];
  if (!types.length) return true;
  if (types.includes(typeId)) return true;
  // Generell trening kan hente styrke + mobilitet
  if (typeId === 'trening') {
    return types.includes('trening') || types.includes('styrketrening');
  }
  return false;
}

/** @deprecated Bruk presetsForActivity — beholdt for bakoverkompatibilitet */
export function presetsForGroup(groupId) {
  if (!groupId) return EXERCISE_PRESETS.filter((p) => (p.activityTypes || []).includes('styrketrening'));
  return EXERCISE_PRESETS.filter(
    (p) => p.muscleGroup === groupId && (p.activityTypes || []).includes('styrketrening'),
  );
}

export function presetsForActivity(typeId, filterId) {
  const type = typeId || 'annet';
  const usePhases = activityUsesPhases(type);
  const list = EXERCISE_PRESETS.filter((p) => matchesActivity(p, type));
  if (!filterId) return list;
  if (usePhases) return list.filter((p) => p.phase === filterId);
  return list.filter((p) => p.muscleGroup === filterId);
}

export function emptyExercise(overrides = {}) {
  return {
    id: overrides.id || null,
    name: '',
    muscleGroup: 'full',
    phase: null,
    sets: 3,
    reps: 10,
    durationSec: null,
    restSec: 60,
    weightKg: null,
    intervalWorkSec: null,
    intervalRestSec: null,
    notes: '',
    order: 0,
    ...overrides,
  };
}

export function emptyExerciseForActivity(typeId, overrides = {}) {
  const usePhases = activityUsesPhases(typeId);
  return emptyExercise({
    muscleGroup: usePhases ? 'full' : 'full',
    phase: usePhases ? 'warmup' : null,
    sets: usePhases ? 1 : 3,
    reps: usePhases ? null : 10,
    durationSec: usePhases ? 60 : null,
    restSec: usePhases ? 30 : 60,
    ...overrides,
  });
}

export function exerciseFromPreset(preset, order = 0) {
  return emptyExercise({
    name: preset.name,
    muscleGroup: preset.muscleGroup || 'full',
    phase: preset.phase || null,
    sets: preset.defaultSets ?? 3,
    reps: preset.defaultReps ?? null,
    durationSec: preset.defaultDurationSec ?? null,
    restSec: preset.defaultRestSec ?? 60,
    intervalWorkSec: preset.defaultIntervalWorkSec ?? null,
    intervalRestSec: preset.defaultIntervalRestSec ?? null,
    notes: preset.defaultNotes || '',
    order,
  });
}

/** Bygg ferdig forslagsliste for en dag basert på aktivitetstype. */
export function buildSessionFromTemplate(typeId) {
  const names = SESSION_TEMPLATES[typeId] || SESSION_TEMPLATES.idrett || [];
  const byName = new Map(EXERCISE_PRESETS.map((p) => [p.name, p]));
  return names
    .map((name, idx) => {
      const preset = byName.get(name);
      if (!preset) return null;
      return { ...exerciseFromPreset(preset, idx), id: null };
    })
    .filter(Boolean);
}

export function formatExerciseSummary(ex) {
  if (!ex) return '';
  const parts = [];
  if (ex.sets != null && ex.reps != null) parts.push(`${ex.sets}×${ex.reps}`);
  else if (ex.sets != null && ex.durationSec != null) parts.push(`${ex.sets}×${ex.durationSec}s`);
  else if (ex.durationSec != null) parts.push(`${ex.durationSec}s`);
  if (ex.weightKg != null && ex.weightKg !== '') parts.push(`${ex.weightKg} kg`);
  if (ex.intervalWorkSec != null && ex.intervalRestSec != null) {
    parts.push(`int. ${ex.intervalWorkSec}/${ex.intervalRestSec}s`);
  } else if (ex.restSec != null && ex.restSec > 0) {
    parts.push(`${ex.restSec}s pause`);
  }
  return parts.join(' · ');
}

export function formatExerciseMeta(ex) {
  const phase = ex?.phase ? getPhaseLabel(ex.phase) : '';
  const group = getMuscleGroupLabel(ex?.muscleGroup);
  if (phase && group && phase !== group) return `${phase} · ${group}`;
  return phase || group || '';
}
