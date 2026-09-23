/**
 * Shared page-hero copy and color tokens for module headings
 * (phone, tablet and desktop). Activation/help still use moduler.json;
 * this is the in-page overlay heading.
 */
import { pickIntroText } from '../utils/moduleIntros.js';
import { getModuleConfig, SHELL_SKIP_MODULE_IDS, ILLUSTRATION_FILES } from './moduleActivationRegistry.js';
import { localizeModuleFields } from '../i18n/moduleCatalog.js';

const t = (nb, en) => ({ nb, en });

const BLUE = { bg: '#E5F6FE', bg2: '#f7fbff', accent: '#1099F4' };
const LAVENDER = { bg: '#f1e9ff', bg2: '#faf7ff', accent: '#7c3aed' };
const MINT = { bg: '#e7f7ee', bg2: '#f5fcf8', accent: '#15803d' };
const ROSE = { bg: '#fde8f3', bg2: '#fff7fb', accent: '#db2777' };
const CYAN = { bg: '#e6f5fb', bg2: '#f4fbfe', accent: '#0284c7' };
const PEACH = { bg: '#fff1e6', bg2: '#fff8f2', accent: '#ea580c' };
const SAND = { bg: '#f4efe6', bg2: '#fbf8f2', accent: '#b45309' };
const DEFAULT_PALETTE = BLUE;

/** Explicit in-page hero copy (mockup). Missing modules fall back to catalog. */
export const MODULE_HERO = {
  stars: {
    ...BLUE,
    kicker: t('Oppgaver', 'Tasks'),
    title: t('Få oversikt og få ting gjort', 'See it all — and get it done'),
    pitch: t(
      'Samle familiens oppgaver, sett frister og jobb i lag – en enklere hverdag.',
      'Gather family tasks, set deadlines and work together for a calmer week.',
    ),
  },
  notes: {
    ...LAVENDER,
    kicker: t('Notat', 'Notes'),
    title: t('Skap, samle og del tanker', 'Capture, collect and share ideas'),
    pitch: t(
      'Notater, ideer og påminnelser – alltid tilgjengelig for hele familien.',
      'Notes, ideas and reminders — always available for the whole family.',
    ),
  },
  shop: {
    ...MINT,
    kicker: t('Handleliste', 'Shopping list'),
    title: t('Enklere handling, sunnere hverdag', 'Easier shopping, a healthier week'),
    pitch: t(
      'Lag lister, del med familien og få en smidigere handleopplevelse.',
      'Make lists, share with the family and make the shop trip smoother.',
    ),
  },
  books: {
    ...BLUE,
    kicker: t('Leseglede i familien', 'Reading together'),
    title: t('Små historier. Store opplevelser.', 'Small stories. Big moments.'),
    pitch: t(
      'Utforsk nye bøker, følg lesingen og skap gode lesevaner sammen.',
      'Discover new books, follow the reading and grow good habits together.',
    ),
  },
  games: {
    ...CYAN,
    kicker: t('Spill sammen', 'Play together'),
    title: t('Mer tid sammen. Flere gode øyeblikk.', 'More time together. More good moments.'),
    pitch: t(
      'Utforsk våre favorittspill, lag egne spillkvelder og gjør hverdagen litt morsommere.',
      'Browse favourite games, plan a games night and make the week a little more fun.',
    ),
  },
  matcoach: {
    ...CYAN,
    name: 'AI Matcoach',
    kicker: t('AI Matcoach', 'AI Food coach'),
    title: t('Ukeplanen lager seg selv', 'The weekly plan makes itself'),
    pitch: t(
      'Få personlige forslag med kunstig intelligens – basert på din hverdag, dine preferanser og det du har i hus.',
      'Get personal suggestions with AI — based on your week, your tastes and what you already have.',
    ),
  },
  meals: {
    ...BLUE,
    kicker: t('Måltidsplanlegger', 'Meal planner'),
    title: t('Planlegg gode måltider', 'Plan better meals'),
    pitch: t(
      'Lag en ukeplan som passer for hele familien – enkelt, oversiktlig og fleksibelt.',
      'Build a week of meals that fits the whole family — simple, clear and flexible.',
    ),
  },
  recipes: {
    ...CYAN,
    kicker: t('Oppskrift', 'Recipes'),
    title: t('Finn matglede hver dag', 'Find joy in food, every day'),
    pitch: t(
      'Oppdag nye oppskrifter, lag dine favoritter og få inspirasjon til sunn og god mat.',
      'Discover new recipes, keep your favourites and find inspiration for good food.',
    ),
  },
  pantry: {
    ...MINT,
    kicker: t('Lager', 'Pantry'),
    title: t('Få oversikt over det du har', 'See what you already have'),
    pitch: t(
      'Ta bilde av kjøleskap eller skap — AI lager listen. Mindre matsvinn og smartere handling.',
      'Snap the fridge or cupboard — AI builds the list. Less waste and smarter shopping.',
    ),
  },
  albums: {
    ...BLUE,
    kicker: t('Familiealbum', 'Family album'),
    title: t('Bevar øyeblikkene som betyr mest', 'Keep the moments that matter most'),
    pitch: t(
      'Samle bilder, videoer og album – og del minnene med familien.',
      'Collect photos, videos and albums — and share the memories with the family.',
    ),
  },
  wall: {
    ...LAVENDER,
    kicker: t('Familievegg', 'Family wall'),
    title: t('Del hverdagen, store og små øyeblikk', 'Share the everyday, big and small'),
    pitch: t(
      'En rolig vegg for bilder, beskjeder og glimt fra familiens dag.',
      'A calm wall for photos, notes and glimpses of the family day.',
    ),
  },
  childDrawings: {
    ...SAND,
    kicker: t('Barnetegninger', 'Kids’ drawings'),
    title: t('Heng mesterverkene over sofaen', 'Hang the masterpieces above the sofa'),
    pitch: t(
      'Auto-crop tegningen, velg ramme og plasser den i stua – med barn, alder, sted og dato.',
      'Auto-crop the drawing, pick a frame and place it in the living room — with child, age, place and date.',
    ),
  },
  familyTree: {
    ...MINT,
    kicker: t('Familietreet', 'Family tree'),
    title: t('Utforsk familiens historie, sammen', 'Explore your family story, together'),
    pitch: t(
      'Se hvordan dere henger sammen – navn, relasjoner og små historier.',
      'See how you connect — names, relations and small stories.',
    ),
  },
  scratchMap: {
    ...BLUE,
    kicker: t('Våre reiser', 'Our travels'),
    title: t('Utforsk verden, samle minner', 'Explore the world, keep the memories'),
    pitch: t(
      'Marker landene familien har besøkt, og ta vare på reiseøyeblikkene.',
      'Mark the countries the family has visited, and keep the travel moments.',
    ),
  },
  reiseplanlegger: {
    ...MINT,
    kicker: t('Reiseplanlegger', 'Trip planner'),
    title: t('Planlegg, drøm og skap nye eventyr', 'Plan, dream and make new adventures'),
    pitch: t(
      'Bygg ruten, samle reisefølge og hold oversikt før, under og etter turen.',
      'Build the route, gather travel companions and stay organised before, during and after.',
    ),
  },
  wishes: {
    ...ROSE,
    kicker: t('Gaveønsker', 'Wish lists'),
    title: t('Små og store ønsker, større glede sammen', 'Big and small wishes, more joy together'),
    pitch: t(
      'Samle, del og få inspirasjon til hele familien.',
      'Collect, share and find inspiration for the whole family.',
    ),
  },
  location: {
    ...CYAN,
    kicker: t('Familieposisjon', 'Family location'),
    title: t('Se hvor de du er glad i er', 'See where the people you love are'),
    pitch: t(
      'Trygghet i hverdagen, for hele familien.',
      'A little extra calm in the everyday, for the whole family.',
    ),
  },
  rememberDates: {
    ...LAVENDER,
    kicker: t('Husk dato', 'Remember the date'),
    title: t('Viktige dager, aldri glemt', 'Important days, never forgotten'),
    pitch: t(
      'Bursdager, jubileer og andre merkedager – vi holder på det.',
      'Birthdays, anniversaries and other dates — we keep them for you.',
    ),
  },
  activities: {
    ...MINT,
    kicker: t('Aktiviteter', 'Activities'),
    title: t('Mer aktivitet, mer mestring', 'More activity, more mastery'),
    pitch: t(
      'Planlegg, organiser og følg opp familiens aktiviteter.',
      'Plan, organise and follow the family’s activities.',
    ),
  },
  chores: {
    ...PEACH,
    kicker: t('Gjøremål', 'Chores'),
    title: t('Små steg. Gode vaner.', 'Small steps. Good habits.'),
    pitch: t(
      'Gi barna tydelige oppgaver, passende ansvar og oppmuntring til å fullføre.',
      'Give children clear tasks, the right amount of responsibility and encouragement to finish.',
    ),
  },
  chat: {
    ...BLUE,
    kicker: t('Chat', 'Chat'),
    title: t('Snakk sammen uten støy', 'Talk together without the noise'),
    pitch: t(
      'Hold familiepraten samlet med tydelige samtaler for familien, grupper og direkte meldinger.',
      'Keep family talk in one place — family chats, groups and direct messages.',
    ),
  },
  plan: {
    ...BLUE,
    kicker: t('Kalender', 'Calendar'),
    title: t('Hele familien, én plan', 'The whole family, one plan'),
    pitch: t(
      'Samle avtaler, aktiviteter og påminnelser, så alle vet hva som skjer – og når.',
      'Gather events, activities and reminders so everyone knows what happens — and when.',
    ),
  },
  mail: {
    ...BLUE,
    kicker: t('E-post', 'Mail'),
    title: t('Viktige meldinger, samlet', 'Important messages, together'),
    pitch: t(
      'Koble jobb- og privatkontoer og finn det som krever oppmerksomhet.',
      'Connect work and personal accounts and find what needs attention.',
    ),
  },
  progress: {
    ...MINT,
    kicker: t('Barnas progresjon', 'Kids’ progress'),
    title: t('Se hva barna faktisk får til', 'See what the kids actually get done'),
    pitch: t(
      'En rolig oversikt over gjøremål, oppgaver, fremgang og ukepenger.',
      'A calm overview of chores, tasks, progress and pocket money.',
    ),
  },
  skole: {
    ...SAND,
    kicker: t('Skole', 'School'),
    title: t('Lekser, klasse og ukeplan', 'Homework, class and the week'),
    pitch: t(
      'Samle skoleuka for barnet – lekser, klasse, leksehjelp og ukeplan på ett sted.',
      'Keep the school week together — homework, class, tutoring and the week plan.',
    ),
  },
  lekser: {
    ...SAND,
    kicker: t('Lekser', 'Homework'),
    title: t('Litt om gangen, så er du i mål', 'A little at a time, and you are done'),
    pitch: t(
      'Se ukas lekser, kryss av og få hjelp når det stopper opp.',
      'See this week’s homework, tick it off and get help when you get stuck.',
    ),
  },
  leksehjelp: {
    ...BLUE,
    kicker: t('Leksehjelpen', 'Homework help'),
    title: t('Vi finner løsningen sammen', 'We find the solution together'),
    pitch: t(
      'Din egen lekse — hint og spørsmål steg for steg. Ikke spill: ekte hjelp når det haster.',
      'Your real homework — hints and questions step by step. Not a game: help when it matters.',
    ),
  },
  mattehjelp: {
    ...CYAN,
    kicker: t('Lær skole', 'Learn school'),
    title: t('Øv, spill og mestre', 'Practice, play and master'),
    pitch: t(
      'Frivillig trening med spill og oppdrag — egen fra leksehjelp.',
      'Optional practice with games and missions — separate from homework help.',
    ),
  },
  'week-plan': {
    ...SAND,
    kicker: t('Ukeplan', 'Week plan'),
    title: t('Se hva som skjer – og møt dagen forberedt', 'See what is coming — and meet the day ready'),
    pitch: t(
      'Timeplan, aktiviteter og små påminnelser for skoleuka.',
      'Timetable, activities and small reminders for the school week.',
    ),
  },
  klassen: {
    ...MINT,
    kicker: t('Klassen', 'The class'),
    title: t('Klasseliste, lærere og møter', 'Class list, teachers and meetings'),
    pitch: t(
      'Skoleinfo, kontaktliste og foreldremøter — last opp klasselisten fra ark.',
      'School info, contacts and parent meetings — upload the class list from paper.',
    ),
  },
  holdings: { ...BLUE },
  documents: { ...BLUE },
  boligmappa: { ...SAND },
  hospitality: { ...CYAN },
};

/** In-shell Mer-hub pages that already draw their own heading. */
const SHELL_OWN_HERO = new Set([]);

const HERO_ALIAS = {};

export function resolveHeroModuleId(moduleId) {
  const id = String(moduleId || '');
  return HERO_ALIAS[id] || id;
}

export function canShowModuleHero(moduleId) {
  const id = resolveHeroModuleId(moduleId);
  if (!id || SHELL_SKIP_MODULE_IDS.has(id) || SHELL_SKIP_MODULE_IDS.has(moduleId)) return false;
  return !!(MODULE_HERO[id] || getModuleConfig(id) || ILLUSTRATION_FILES[id]);
}

/**
 * Compact heading for the shell.
 * Mer-hub modules (Husk dato, album, …) live as `tab === 'more'` + moreSubView —
 * never skip the whole Mer tab before reading the subview.
 */
export function shellHeroModuleId(tab, moreSubView = null) {
  if (!tab) return null;
  const raw = tab === 'more' ? moreSubView : tab;
  if (!raw || SHELL_SKIP_MODULE_IDS.has(raw) || SHELL_OWN_HERO.has(raw)) return null;
  const id = resolveHeroModuleId(raw);
  return canShowModuleHero(id) ? id : null;
}

/**
 * Phone chrome heading: the pastel band is the top heading under the logo bar.
 * Hides family name + large page title; add/help overlay the lower-right edge.
 * Tablet/web keep the heading in the content band (`null` here).
 */
export function phoneChromeHeroId(tab, moreSubView = null, isPhone = false) {
  if (!isPhone) return null;
  return shellHeroModuleId(tab, moreSubView);
}

export function resolveModuleHero(moduleId, lang = 'nb') {
  const id = resolveHeroModuleId(moduleId);
  const catalog = localizeModuleFields(getModuleConfig(id), lang);
  const custom = MODULE_HERO[id] || {};
  const palette = {
    bg: custom.bg || DEFAULT_PALETTE.bg,
    bg2: custom.bg2 || DEFAULT_PALETTE.bg2,
    accent: custom.accent || DEFAULT_PALETTE.accent,
  };
  return {
    moduleId: id || null,
    name: catalog?.name || custom.name || id,
    kicker: pickIntroText(custom.kicker, lang) || catalog?.name || '',
    title: pickIntroText(custom.title, lang) || catalog?.headline || catalog?.name || '',
    pitch: pickIntroText(custom.pitch, lang) || catalog?.pitch || '',
    ...palette,
  };
}

export function moduleHeroName(moduleId, lang = 'nb') {
  return resolveModuleHero(moduleId, lang).name;
}
