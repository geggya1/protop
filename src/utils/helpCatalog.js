/**
 * Help & Support catalog — searchable module articles, age- and device-aware.
 * Built on MODULE_INTROS so new modules stay discoverable as intros evolve.
 */

import {
  EXPECTED_INTRO_KEYS,
  MODULE_INTROS,
  getModuleIntro,
  pickIntroText,
} from './moduleIntros.js';
import { isProtopShellModule } from '../navigation/protopShell.js';

const T = (nb, en) => ({ nb, en });

/** Audience bands used to tailor copy (maps from ageBand + parent role). */
export const HELP_AUDIENCES = ['child', 'teen', 'youth', 'adult', 'parent'];

export function resolveHelpAudience({ isChild, isParent, ageBand: band } = {}) {
  if (isParent && !isChild) return 'parent';
  if (band === 'preschool' || band === 'child') return 'child';
  if (band === 'teen') return 'teen';
  if (band === 'youth') return 'youth';
  return 'adult';
}

export function resolveHelpDevice(layout = {}) {
  if (layout.isDesktop) return 'desktop';
  if (layout.isTablet) return 'tablet';
  return 'phone';
}

const CATEGORIES = [
  {
    id: 'getting-started',
    icon: 'rocket-outline',
    title: T('Kom i gang', 'Getting started'),
    moduleIds: ['home', 'settings', 'members', 'childApps', 'moduleAccess'],
  },
  {
    id: 'plan',
    icon: 'calendar-outline',
    title: T('Plan og kalender', 'Plan & calendar'),
    moduleIds: ['plan', 'week-plan', 'activities', 'rememberDates', 'skole'],
  },
  {
    id: 'tasks',
    icon: 'checkbox-outline',
    title: T('Gjøremål og progresjon', 'Tasks & progress'),
    moduleIds: ['stars', 'chores', 'progress'],
  },
  {
    id: 'school',
    icon: 'school-outline',
    title: T('Skole og lekser', 'School & homework'),
    moduleIds: ['lekser', 'leksehjelp', 'klassen', 'books'],
  },
  {
    id: 'food',
    icon: 'restaurant-outline',
    title: T('Mat og handel', 'Food & shopping'),
    moduleIds: ['meals', 'recipes', 'pantry', 'matcoach', 'shop'],
  },
  {
    id: 'communicate',
    icon: 'chatbubbles-outline',
    title: T('Chat, mail og AI', 'Chat, mail & AI'),
    moduleIds: ['chat', 'mail', 'ai', 'notes'],
  },
  {
    id: 'family-life',
    icon: 'home-outline',
    title: T('Familieliv', 'Family life'),
    moduleIds: ['albums', 'wall', 'wishes', 'games', 'quiz', 'familyTree', 'location', 'documents'],
  },
  {
    id: 'travel-home',
    icon: 'airplane-outline',
    title: T('Reise, bolig og utleie', 'Travel, home & rental'),
    moduleIds: ['scratchMap', 'reiseplanlegger', 'boligmappa', 'holdings', 'hospitality'],
  },
  {
    id: 'project',
    icon: 'business-outline',
    title: T('Prosjekt', 'Project'),
    moduleIds: ['projects'],
  },
  {
    id: 'account',
    icon: 'shield-checkmark-outline',
    title: T('Konto og personvern', 'Account & privacy'),
    moduleIds: ['legal', 'subscription', 'groupSettings'],
  },
];

/** Extra settings/how-to articles beyond module intros. */
const EXTRA_ARTICLES = [
  {
    id: 'help.projects',
    moduleId: 'projects',
    categoryId: 'project',
    icon: 'business-outline',
    accent: '#1099F4',
    soft: '#E5F6FE',
    title: T('Prosjektplattformen', 'The project platform'),
    summary: T(
      'Portefølje, fremdrift, HMS, kvalitet, dokumenter, møter, prosjektregnskap og ISO.',
      'Portfolio, progress, HSE, quality, documents, meetings, project accounting and ISO.',
    ),
    keywords: ['prosjekt', 'hms', 'regnskap', 'iso', 'avvik', 'project'],
    steps: {
      parent: [
        T('Åpne Prosjekt og opprett prosjekt med nummer', 'Open Projects and create a project with a number'),
        T('Før timer og kostnader på konto og prosjektkode', 'Post hours and costs on an account and cost code'),
        T('Lukk avvik først når årsak og tiltak er fylt ut', 'Close a deviation only after cause and action are filled in'),
      ],
      child: [],
      teen: [],
    },
  },
  {
    id: 'help.lightbulb',
    moduleId: 'help-lightbulb',
    categoryId: 'getting-started',
    icon: 'bulb-outline',
    accent: '#d97706',
    soft: '#fef3c7',
    title: T('Lyspæren — hjelp der du er', 'The lightbulb — help where you are'),
    summary: T(
      'Trykk lyspæren ved profilbildet for en kort guide på siden du står på.',
      'Tap the lightbulb by your profile for a short guide on the page you are on.',
    ),
    keywords: ['lyspære', 'lightbulb', 'tour', 'guide', 'hjelp', 'help'],
    steps: {
      parent: [
        T('Finn lyspæren øverst ved profilbildet', 'Find the lightbulb at the top by your profile'),
        T('Les kortet om modulen, eller start rundturen', 'Read the module card, or start the walkthrough'),
        T('Følg den markerte pilen steg for steg', 'Follow the highlighted arrow step by step'),
      ],
      child: [
        T('Trykk på den lille lyspæren oppe', 'Tap the little lightbulb at the top'),
        T('Les hva siden gjør', 'Read what the page does'),
        T('Følg pilen — den viser hvor du skal trykke', 'Follow the arrow — it shows where to tap'),
      ],
      teen: [
        T('Lyspæren åpner en kort guide for siden', 'The lightbulb opens a short guide for the page'),
        T('Velg «Vis meg hvordan» for steg-for-steg', 'Choose “Show me how” for step-by-step'),
      ],
    },
    deviceTips: {
      phone: T(
        'På mobil ligger lyspæren øverst til høyre — på Hjem ved siden av blyanten, ellers under profil.',
        'On phone the lightbulb is at the top right — on Home next to the pencil, otherwise under your profile.',
      ),
      tablet: T(
        'På nettbrett finner du lyspæren i toppfeltet ved profil.',
        'On tablet the lightbulb is in the top bar by your profile.',
      ),
      desktop: T(
        'På web ligger hjelp i toppfeltet — samme sted som varsler og profil.',
        'On web, help lives in the top bar — same place as notifications and profile.',
      ),
    },
    audienceTips: {
      parent: T(
        'Bruk lyspæren når et barn spør «hvor trykker jeg?» — så får dere samme guide.',
        'Use the lightbulb when a child asks “where do I tap?” — you get the same guide.',
      ),
      child: T('Hvis du står fast: trykk lyspæren. Den forklarer siden.', 'If you get stuck: tap the lightbulb. It explains the page.'),
    },
  },
  {
    id: 'help.settings-overview',
    moduleId: 'settings',
    categoryId: 'getting-started',
    icon: 'settings-outline',
    accent: '#1099F4',
    soft: '#dbeafe',
    title: T('Innstillinger — hva du finner hvor', 'Settings — what lives where'),
    summary: T(
      'Profil, språk, varsler, barnas apper, personvern og denne hjelpen.',
      'Profile, language, notifications, kids’ apps, privacy and this help centre.',
    ),
    keywords: ['innstillinger', 'settings', 'språk', 'varsler', 'profil'],
    steps: {
      parent: [
        T('Åpne Mer → Innstillinger (eller profilmenyen)', 'Open More → Settings (or the profile menu)'),
        T('Rediger profil ligger rett under profilbildet', 'Edit profile sits right under the profile photo'),
        T('Hjem og utseende samler tilpass hjem, hilsen, utseende og vær', 'Home and appearance groups customize home, greeting, look and weather'),
        T('Under Familie: barnas innlogging og apper (sammenklappet), medlemmer og moduler', 'Under Family: kids’ login and apps (collapsed), members and modules'),
        T('Under Om: personvern og Hjelp & support', 'Under About: privacy and Help & support'),
      ],
      child: [
        T('Profilbilde og endre profil står øverst', 'Profile photo and edit profile are at the top'),
        T('Del innlogging / QR-kode ligger rett under profilen', 'Share login / QR code sits right under the profile'),
        T('Brukernavn og passord ligger i en egen meny — ikke på forsiden', 'Username and password live in their own menu — not on the front page'),
        T('Be en voksen hvis du skal endre apper eller passord', 'Ask a grown-up if you need to change apps or password'),
      ],
    },
    deviceTips: {
      phone: T('Scroll ned i innstillinger — Hjelp & support ligger under Om, før logg ut.', 'Scroll down in Settings — Help & support is under About, before log out.'),
      tablet: T('Innstillinger bruker samme liste som mobil, med litt mer plass.', 'Settings uses the same list as phone, with a bit more space.'),
      desktop: T('På desktop er innstillinger i Mer-huben — smal kolonne, samme rekkefølge.', 'On desktop, settings live in the More hub — narrow column, same order.'),
    },
  },
  {
    id: 'help.support-tickets',
    moduleId: 'support',
    categoryId: 'account',
    icon: 'mail-unread-outline',
    accent: '#0f766e',
    soft: '#ccfbf1',
    title: T('Kontakt support — saker og svar', 'Contact support — tickets and replies'),
    summary: T(
      'Still spørsmål til Skjetten-boten først. Etter noen spørsmål kan du sende en sak med bilde.',
      'Ask Skjetten the bot first. After a few questions you can send a ticket with a photo.',
    ),
    keywords: ['support', 'sak', 'ticket', 'feil', 'bug', 'hvit skjerm', 'kontakt'],
    steps: {
      parent: [
        T('Åpne Hjelp & support → Spør Skjetten', 'Open Help & support → Ask Skjetten'),
        T('Beskriv problemet — få stegvise tips', 'Describe the problem — get step-by-step tips'),
        T('Etter 4–5 spørsmål foreslår boten «Kontakt support»', 'After 4–5 questions the bot suggests “Contact support”'),
        T('Fyll tittel, tekst og eventuelt bilde — du får saksnummer', 'Fill title, text and optional photo — you get a ticket number'),
        T('Følg saken under Mine henvendelser (intern postkasse)', 'Track it under My requests (in-app mailbox)'),
      ],
      child: [
        T('Spør Skjetten først — den hjelper deg hyggelig', 'Ask Skjetten first — it helps you kindly'),
        T('Hvis du trenger en voksen: si ifra, eller fyll inn e-post når vi spør', 'If you need a grown-up: tell them, or enter an email when we ask'),
        T('Du får et saksnummer så du kan se svar senere', 'You get a ticket number so you can see replies later'),
      ],
    },
    audienceTips: {
      child: T(
        'Har du ikke e-post? Vi spør om en voksen sitt kontaktpunkt, eller du bruker den interne postkassen i appen.',
        'No email? We ask for a grown-up’s contact, or you use the in-app mailbox.',
      ),
      parent: T(
        'Feil, hvit skjerm eller error: legg ved bilde. Boten analyserer og sender forslag til utvikler — uten å endre noe selv.',
        'Bugs, white screen or errors: attach a photo. The bot analyses and sends a suggestion to the developer — it never deploys itself.',
      ),
    },
  },
  {
    id: 'help.whats-new',
    moduleId: 'news',
    categoryId: 'getting-started',
    icon: 'newspaper-outline',
    accent: '#7c3aed',
    soft: '#ede9fe',
    title: T('Oppdateringer', 'Updates'),
    summary: T(
      'Versjonen hopper til 3.0, 4.0 osv. ved store oppdateringer. Mindre korreksjoner listes per dag uten varsel.',
      'The version jumps to 3.0, 4.0, etc. for major updates. Smaller fixes are listed per day without a notice.',
    ),
    keywords: ['nyheter', 'news', 'deploy', 'oppdatering', 'changelog', 'versjon', 'korreksjon'],
    steps: {
      parent: [
        T('Åpne Innstillinger → Versjon, eller Hjelp → Oppdateringer', 'Open Settings → Version, or Help → Updates'),
        T('Les dagens korreksjoner (uten klokkeslett). Store oppdateringer varsles én gang.', 'Read the day’s fixes (no clock times). Major updates notify once.'),
      ],
    },
  },
];

const MODULE_LABELS = {
  home: T('Hjem', 'Home'),
  chat: T('Chat', 'Chat'),
  plan: T('Kalender', 'Calendar'),
  mail: T('E-post', 'Mail'),
  stars: T('Gjøremål', 'Tasks'),
  notes: T('Notater', 'Notes'),
  chores: T('Husarbeid', 'Chores'),
  more: T('Mer', 'More'),
  shop: T('Handlelister', 'Shopping'),
  wishes: T('Gaveønsker', 'Wishlists'),
  books: T('Bokhylla', 'Bookshelf'),
  lekser: T('Lekser', 'Homework'),
  leksehjelp: T('Leksehjelpen', 'Homework help'),
  klassen: T('Klassen', 'Classroom'),
  settings: T('Innstillinger', 'Settings'),
  childApps: T('Barnas apper', 'Kids’ apps'),
  activities: T('Aktiviteter', 'Activities'),
  members: T('Medlemmer', 'Members'),
  groupSettings: T('Familieinnstillinger', 'Family settings'),
  location: T('Familieposisjon', 'Family location'),
  documents: T('Dokumenter', 'Documents'),
  meals: T('Måltidsplanlegger', 'Meal planner'),
  matcoach: T('AI Matcoach', 'AI Food coach'),
  recipes: T('Oppskrifter', 'Recipes'),
  pantry: T('Lager', 'Pantry'),
  progress: T('Progresjon', 'Progress'),
  games: T('Familiespill', 'Family games'),
  quiz: T('Familiequiz', 'Family quiz'),
  scratchMap: T('Våre reiser', 'Our travels'),
  reiseplanlegger: T('Reiseplanlegger', 'Trip planner'),
  familyTree: T('Familietreet', 'Family tree'),
  rememberDates: T('Husk dato', 'Remember dates'),
  boligmappa: T('Boligen', 'Home folder'),
  holdings: T('Kjøretøy', 'Vehicles'),
  hospitality: T('Utleie', 'Hospitality'),
  legal: T('Personvern', 'Privacy'),
  subscription: T('Abonnement', 'Subscription'),
  'week-plan': T('Ukeplan', 'Week plan'),
  skole: T('Skole', 'School'),
  ai: T('Spør AI', 'Ask AI'),
  albums: T('Familiealbum', 'Family albums'),
  wall: T('Familievegg', 'Family wall'),
  moduleAccess: T('Aktiverte moduler', 'Enabled modules'),
  support: T('Support', 'Support'),
  news: T('Nyheter', 'News'),
  'help-lightbulb': T('Lyspære-hjelp', 'Lightbulb help'),
};

const DEVICE_DEFAULTS = {
  phone: T(
    'På mobil: bruk menyen nederst og Mer for flere apper. Lyspæren er øverst.',
    'On phone: use the bottom tabs and More for more apps. The lightbulb is at the top.',
  ),
  tablet: T(
    'På nettbrett: samme flyt som mobil, med mer plass til lister og kalender.',
    'On tablet: same flow as phone, with more room for lists and calendar.',
  ),
  desktop: T(
    'På web/PC: venstremeny (rail) og Mer-hub. Innstillinger og hjelp ligger under Konto.',
    'On web/PC: left rail and More hub. Settings and help live under Account.',
  ),
};

function audienceKey(audience) {
  if (audience === 'parent') return 'parent';
  if (audience === 'child') return 'child';
  if (audience === 'teen' || audience === 'youth') return 'teen';
  return 'parent';
}

function articleFromIntro(scope, moduleId) {
  const intro = getModuleIntro(scope, moduleId);
  if (!intro) return null;
  const label = MODULE_LABELS[moduleId] || T(moduleId, moduleId);
  const cat = CATEGORIES.find((c) => c.moduleIds.includes(moduleId)) || CATEGORIES[0];
  return {
    id: `${scope}.${moduleId}`,
    scope,
    moduleId,
    categoryId: cat.id,
    icon: intro.icon || 'help-circle-outline',
    accent: intro.accent || '#1099F4',
    soft: intro.soft || '#dbeafe',
    hero: intro.hero || null,
    title: intro.title || label,
    summary: intro.pitch || intro.kicker || label,
    kicker: intro.kicker || null,
    keywords: [
      moduleId,
      pickIntroText(label, 'nb'),
      pickIntroText(label, 'en'),
      pickIntroText(intro.kicker, 'nb'),
      pickIntroText(intro.pitch, 'nb'),
    ].filter(Boolean),
    steps: {
      parent: intro.steps || [],
      child: intro.steps || [],
      teen: intro.steps || [],
    },
    deviceTips: DEVICE_DEFAULTS,
    fromIntro: true,
  };
}

function familyModuleIds() {
  const ids = new Set();
  for (const key of EXPECTED_INTRO_KEYS) {
    if (!key.startsWith('family.')) continue;
    ids.add(key.slice('family.'.length));
  }
  Object.keys(MODULE_INTROS)
    .filter((k) => k.startsWith('family.'))
    .forEach((k) => ids.add(k.slice('family.'.length)));
  return [...ids];
}

let _cache = null;

export function listHelpArticles({ scope = 'family' } = {}) {
  if (_cache && _cache.scope === scope) return _cache.articles;
  const articles = [];
  const seen = new Set();

  for (const extra of EXTRA_ARTICLES) {
    if (!isProtopShellModule(extra.moduleId) && !String(extra.moduleId || '').startsWith('help')) continue;
    articles.push({ ...extra, scope });
    seen.add(extra.id);
  }

  const moduleIds = scope === 'family' ? familyModuleIds() : [];
  for (const moduleId of moduleIds) {
    if (!isProtopShellModule(moduleId)) continue;
    const art = articleFromIntro(scope, moduleId);
    if (!art || seen.has(art.id)) continue;
    // Prefer richer EXTRA article for settings/support if present
    if (EXTRA_ARTICLES.some((e) => e.moduleId === moduleId && e.id !== art.id)) {
      // keep both: module intro + extra how-to
    }
    articles.push(art);
    seen.add(art.id);
  }

  _cache = { scope, articles };
  return articles;
}

export function listHelpCategories(lang = 'nb') {
  return CATEGORIES.map((c) => ({
    id: c.id,
    icon: c.icon,
    title: pickIntroText(c.title, lang),
    moduleIds: c.moduleIds.filter((id) => isProtopShellModule(id) || String(id).startsWith('help')),
  })).filter((c) => c.moduleIds.length > 0);
}

export function getHelpArticle(articleId, { scope = 'family' } = {}) {
  return listHelpArticles({ scope }).find((a) => a.id === articleId) || null;
}

export function localizeHelpArticle(article, {
  lang = 'nb',
  audience = 'parent',
  device = 'phone',
} = {}) {
  if (!article) return null;
  const aud = audienceKey(audience);
  const stepSrc = article.steps?.[aud] || article.steps?.parent || article.steps?.child || [];
  const steps = (Array.isArray(stepSrc) ? stepSrc : []).map((s) => pickIntroText(s, lang));
  const deviceTip = pickIntroText(article.deviceTips?.[device] || DEVICE_DEFAULTS[device], lang);
  const audienceTip = pickIntroText(article.audienceTips?.[aud] || article.audienceTips?.parent, lang);
  return {
    id: article.id,
    moduleId: article.moduleId,
    categoryId: article.categoryId,
    icon: article.icon,
    accent: article.accent,
    soft: article.soft,
    hero: article.hero,
    title: pickIntroText(article.title, lang),
    summary: pickIntroText(article.summary, lang),
    kicker: pickIntroText(article.kicker, lang),
    steps,
    deviceTip,
    audienceTip,
    label: pickIntroText(MODULE_LABELS[article.moduleId] || article.title, lang),
  };
}

function normalizeQuery(q) {
  return String(q || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function searchHelpArticles(query, {
  scope = 'family',
  lang = 'nb',
  audience = 'parent',
  device = 'phone',
  limit = 40,
} = {}) {
  const q = normalizeQuery(query);
  const articles = listHelpArticles({ scope });
  if (!q) {
    return articles
      .slice(0, limit)
      .map((a) => localizeHelpArticle(a, { lang, audience, device }));
  }

  const scored = [];
  for (const raw of articles) {
    const loc = localizeHelpArticle(raw, { lang, audience, device });
    const hay = normalizeQuery([
      loc.title,
      loc.summary,
      loc.kicker,
      loc.label,
      ...(loc.steps || []),
      ...(raw.keywords || []),
      raw.moduleId,
      raw.categoryId,
    ].join(' '));
    let score = 0;
    if (hay.includes(q)) score += 10;
    for (const part of q.split(/\s+/).filter(Boolean)) {
      if (hay.includes(part)) score += 3;
      if (normalizeQuery(loc.title).includes(part)) score += 5;
      if (normalizeQuery(raw.moduleId).includes(part)) score += 4;
    }
    if (score > 0) scored.push({ score, loc });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.loc);
}

export function articlesForCategory(categoryId, opts = {}) {
  const { scope = 'family', lang = 'nb', audience = 'parent', device = 'phone' } = opts;
  return listHelpArticles({ scope })
    .filter((a) => a.categoryId === categoryId)
    .map((a) => localizeHelpArticle(a, { lang, audience, device }));
}

/** Compact FAQ snippets for the support bot (local fallback + prompt context). */
export function buildHelpKnowledgeSnippets({ lang = 'nb', limit = 24 } = {}) {
  return listHelpArticles({ scope: 'family' })
    .slice(0, limit)
    .map((a) => {
      const loc = localizeHelpArticle(a, { lang, audience: 'parent', device: 'phone' });
      return {
        id: loc.id,
        moduleId: a.moduleId,
        title: loc.title,
        summary: loc.summary,
        steps: loc.steps.slice(0, 4),
      };
    });
}

export function moduleLabel(moduleId, lang = 'nb') {
  return pickIntroText(MODULE_LABELS[moduleId] || T(moduleId, moduleId), lang);
}

/** Test helper — clear memo when intros change in unit tests. */
export function _resetHelpCatalogCache() {
  _cache = null;
}
