/**
 * Help & Support catalog — searchable articles for every ProTop page,
 * workflow and common topic, device-aware. Built on src/help/protopPages.js,
 * so the help centre, the lightbulb and the assistant share one source.
 */

import { pickIntroText } from './moduleIntros.js';
import { HELP_SECTIONS, PROTOP_PAGES } from '../help/protopPages.js';
import { PROTOP_PROCESSES } from '../help/protopProcesses.js';
import { ASSISTANT_TOPICS } from '../help/assistantTopics.js';
import { searchKnowledge } from '../help/assistantEngine.js';

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

/** Kategoriene følger menygruppene, pluss arbeidsflyter og tips. */
const CATEGORIES = [
  {
    id: 'workflows',
    icon: 'git-merge-outline',
    title: T('Arbeidsflyter', 'Workflows'),
  },
  ...HELP_SECTIONS,
  {
    id: 'tips',
    icon: 'bulb-outline',
    title: T('Tips og vanlige spørsmål', 'Tips and common questions'),
  },
];

const DEVICE_DEFAULTS = {
  phone: T(
    'På mobil: menyen ligger bak ☰ øverst til venstre, og de mest brukte modulene i linjen nederst. Lyspæren under profilbildet gir hjelp for siden.',
    'On phone: the menu is behind ☰ at the top left, and the most used modules are in the bottom bar. The lightbulb under your profile photo gives help for the page.',
  ),
  tablet: T(
    'På nettbrett: menyen står til venstre, og lyspæren under profilbildet gir hjelp for siden.',
    'On tablet: the menu is on the left, and the lightbulb under your profile photo gives help for the page.',
  ),
  desktop: T(
    'På PC: alle moduler ligger i menyen til venstre. «Hjelp» øverst til høyre åpner veiledningen for siden.',
    'On desktop: every module is in the left menu. “Help” at the top right opens the guide for the page.',
  ),
};

/** Artikler som ikke er en egen side. */
const EXTRA_ARTICLES = [
  {
    id: 'help.lightbulb',
    moduleId: 'help-lightbulb',
    categoryId: 'tips',
    icon: 'bulb-outline',
    accent: '#d97706',
    soft: '#fef3c7',
    title: T('Lyspæren — hjelp der du er', 'The lightbulb — help where you are'),
    summary: T(
      'Lyspæren (på PC: «Hjelp» øverst) åpner hjelp for siden du står på. «Vis meg steg for steg» toner ned skjermen og lyser opp knappen du skal trykke på.',
      'The lightbulb (on desktop: “Help” at the top) opens help for the page you are on. “Show me step by step” dims the screen and lights up the button to tap.',
    ),
    keywords: ['lyspære', 'lightbulb', 'tour', 'guide', 'hjelp', 'help', 'rundtur', 'vis meg'],
    steps: [
      { title: T('Trykk lyspæren', 'Tap the lightbulb'), ...T('Mobil og nettbrett: under profilbildet. PC: «Hjelp» ved varslene.', 'Phone and tablet: under the profile photo. Desktop: “Help” next to notifications.') },
      { title: T('Les kortet', 'Read the card'), ...T('Kortet viser hva siden er til, hvor den ligger og stegene.', 'The card shows what the page is for, where it is and the steps.') },
      { title: T('Vis meg steg for steg', 'Show me step by step'), ...T('Skjermen tones ned og knappen lyser opp. Trykk «Neste», piltastene, eller det markerte feltet.', 'The screen dims and the button lights up. Tap “Next”, use the arrow keys, or tap the highlighted spot.') },
      { title: T('Hele arbeidsflyten', 'The whole workflow'), ...T('Hører siden til en arbeidsflyt, kan du starte hele flyten — ProTop åpner hver side for deg.', 'If the page belongs to a workflow, you can start the whole flow — ProTop opens every page for you.') },
    ],
  },
  {
    id: 'help.assistant',
    moduleId: 'chat',
    categoryId: 'tips',
    icon: 'sparkles-outline',
    accent: '#1099F4',
    soft: '#dbeafe',
    title: T('ProTop-assistenten', 'The ProTop assistant'),
    summary: T(
      'Assistenten i chatten svarer på alt om ProTop med steg, viser deg veien med «Vis meg», og kan lage en supportsak med samtalen.',
      'The assistant in the chat answers anything about ProTop with steps, shows you the way with “Show me”, and can create a support case with the conversation.',
    ),
    keywords: ['assistent', 'bot', 'chatbot', 'ai', 'spør', 'chat', 'hjelp'],
    steps: [
      { title: T('Åpne chatten', 'Open the chat'), ...T('Chat-boblen nede til høyre (eller Chat i menyen) → «ProTop-assistent».', 'The chat bubble at the bottom right (or Chat in the menu) → “ProTop assistant”.') },
      { title: T('Spør med egne ord', 'Ask in your own words'), ...T('For eksempel «hvordan fører jeg timer?» eller «hvor finner jeg kjøreboken?».', 'For example “how do I log hours?” or “where is the mileage log?”.') },
      { title: T('Vis meg', 'Show me'), ...T('Trykk «Vis meg steg for steg» under svaret, så åpnes siden med markering.', 'Tap “Show me step by step” under the answer, and the page opens with highlights.') },
      { title: T('Få et menneske', 'Get a person'), ...T('«Kontakt support» lager en sak med samtalen, så du slipper å gjenta deg.', '“Contact support” creates a case with the conversation, so you don’t repeat yourself.') },
    ],
  },
  {
    id: 'help.support-tickets',
    moduleId: 'support',
    categoryId: 'account',
    icon: 'mail-unread-outline',
    accent: '#0f766e',
    soft: '#ccfbf1',
    title: T('Kontakt support — saker og svar', 'Contact support — cases and replies'),
    summary: T(
      'Spør ProTop-assistenten først. Står du fast, send en sak med beskrivelse og gjerne skjermbilde — du får saksnummer.',
      'Ask the ProTop assistant first. If you are stuck, send a case with a description and ideally a screenshot — you get a case number.',
    ),
    keywords: ['support', 'sak', 'ticket', 'feil', 'bug', 'hvit skjerm', 'kontakt', 'saksnummer'],
    steps: [
      { title: T('Spør assistenten', 'Ask the assistant'), ...T('Hjelp & support → Spør ProTop-assistenten.', 'Help & support → Ask the ProTop assistant.') },
      { title: T('Send sak', 'Send a case'), ...T('«Kontakt support»: tittel, tekst og eventuelt bilde.', '“Contact support”: title, text and an optional image.') },
      { title: T('Følg saken', 'Follow the case'), ...T('Svar kommer under Mine henvendelser.', 'Replies arrive under My requests.') },
    ],
  },
  {
    id: 'help.whats-new',
    moduleId: 'news',
    categoryId: 'account',
    icon: 'newspaper-outline',
    accent: '#7c3aed',
    soft: '#ede9fe',
    title: T('Oppdateringer', 'Updates'),
    summary: T(
      'Versjonen hopper til 3.0, 4.0 osv. ved store oppdateringer. Mindre korreksjoner listes per dag uten varsel.',
      'The version jumps to 3.0, 4.0, etc. for major updates. Smaller fixes are listed per day without a notice.',
    ),
    keywords: ['nyheter', 'news', 'oppdatering', 'changelog', 'versjon', 'korreksjon'],
    steps: [
      { title: T('Les nytt', 'Read what’s new'), ...T('Innstillinger → Versjon, eller Hjelp & support → Oppdateringer.', 'Settings → Version, or Help & support → Updates.') },
    ],
  },
];

function stepText(step, lang) {
  return {
    title: step.title ? pickIntroText(step.title, lang) : '',
    text: pickIntroText(step, lang),
  };
}

function pageArticle(key, def) {
  return {
    id: `page.${key}`,
    moduleId: key,
    pageKey: key,
    categoryId: def.section || 'personal',
    icon: def.icon ? `${String(def.icon).replace(/-outline$/, '')}-outline` : 'help-circle-outline',
    accent: def.accent,
    soft: def.soft,
    title: def.title,
    label: def.label,
    kicker: def.kicker,
    summary: def.pitch,
    path: def.path,
    nav: def.nav,
    process: def.process || null,
    faq: def.faq || [],
    keywords: def.keywords || [],
    steps: def.steps || [],
  };
}

function processArticle(proc) {
  return {
    id: `process.${proc.id}`,
    moduleId: proc.id,
    processId: proc.id,
    categoryId: 'workflows',
    icon: `${proc.icon || 'git-merge'}-outline`,
    accent: proc.accent,
    soft: `${proc.accent}1A`,
    title: proc.title,
    label: proc.title,
    summary: proc.pitch,
    keywords: proc.keywords || [],
    steps: proc.steps.map((s) => ({ title: s.title, nb: s.nb, en: s.en })),
  };
}

function topicArticle(tp) {
  return {
    id: tp.id,
    moduleId: tp.id,
    categoryId: 'tips',
    icon: 'information-circle-outline',
    accent: '#1099F4',
    soft: '#e0f2fe',
    title: tp.title,
    label: tp.title,
    summary: tp.summary,
    nav: tp.nav || null,
    keywords: tp.keywords || [],
    steps: tp.steps || [],
  };
}

let _cache = null;

export function listHelpArticles() {
  if (_cache) return _cache;
  const articles = [
    ...Object.values(PROTOP_PROCESSES).map(processArticle),
    ...Object.entries(PROTOP_PAGES).filter(([, def]) => !def.hidden).map(([key, def]) => pageArticle(key, def)),
    ...EXTRA_ARTICLES,
    ...ASSISTANT_TOPICS.map(topicArticle),
  ];
  _cache = articles;
  return articles;
}

export function listHelpCategories(lang = 'nb') {
  const articles = listHelpArticles();
  return CATEGORIES
    .map((c) => ({
      id: c.id,
      icon: c.icon,
      title: pickIntroText(c.title, lang),
      count: articles.filter((a) => a.categoryId === c.id).length,
    }))
    .filter((c) => c.count > 0);
}

export function getHelpArticle(articleId) {
  return listHelpArticles().find((a) => a.id === articleId) || null;
}

export function localizeHelpArticle(article, {
  lang = 'nb',
  device = 'phone',
} = {}) {
  if (!article) return null;
  const stepItems = (article.steps || []).map((s) => stepText(s, lang)).filter((s) => s.text);
  return {
    id: article.id,
    moduleId: article.moduleId,
    pageKey: article.pageKey || null,
    processId: article.processId || null,
    categoryId: article.categoryId,
    icon: article.icon,
    accent: article.accent,
    soft: article.soft,
    title: pickIntroText(article.title, lang),
    label: pickIntroText(article.label || article.title, lang),
    summary: pickIntroText(article.summary, lang),
    kicker: pickIntroText(article.kicker, lang),
    path: pickIntroText(article.path, lang),
    nav: article.nav || null,
    process: article.process || null,
    steps: stepItems.map((s) => (s.title ? `${s.title}: ${s.text}` : s.text)),
    stepItems,
    faq: (article.faq || []).map((f) => ({ q: pickIntroText(f.q, lang), a: pickIntroText(f.a, lang) })),
    deviceTip: pickIntroText(DEVICE_DEFAULTS[device] || DEVICE_DEFAULTS.phone, lang),
    audienceTip: '',
  };
}

function normalizeQuery(q) {
  return String(q || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

const KNOWLEDGE_TO_ARTICLE = (item) => {
  if (item.kind === 'page') return `page.${item.pageKey}`;
  if (item.kind === 'process') return `process.${item.processId}`;
  return item.id;
};

export function searchHelpArticles(query, {
  lang = 'nb',
  device = 'phone',
  limit = 40,
} = {}) {
  const articles = listHelpArticles();
  const q = normalizeQuery(query);
  if (!q) {
    // «Ofte brukt»: kjerneløpet først.
    const popular = ['process.anbud-til-faktura', 'page.arbeid.timeliste', 'page.okonomi.faktura', 'page.ansatte', 'page.projects', 'page.iso.avvik', 'help.assistant', 'help.lightbulb'];
    const head = popular.map((id) => articles.find((a) => a.id === id)).filter(Boolean);
    const rest = articles.filter((a) => !popular.includes(a.id));
    return [...head, ...rest].slice(0, limit).map((a) => localizeHelpArticle(a, { lang, device }));
  }

  const out = [];
  const seen = new Set();
  // Samme rangering som assistenten (synonymer, bøyning, norsk/engelsk).
  for (const hit of searchKnowledge(query, { lang, limit: Math.min(limit, 20) })) {
    const id = KNOWLEDGE_TO_ARTICLE(hit.item);
    const art = articles.find((a) => a.id === id);
    if (art && !seen.has(id)) {
      seen.add(id);
      out.push(art);
    }
  }
  // Ren tekstsøk som reserve (f.eks. ekstraartikler og eksakte ord).
  for (const raw of articles) {
    if (seen.has(raw.id)) continue;
    const loc = localizeHelpArticle(raw, { lang, device });
    const hay = normalizeQuery([
      loc.title, loc.summary, loc.label, loc.path, ...(loc.steps || []), ...(raw.keywords || []), raw.moduleId,
    ].join(' '));
    if (q.split(/\s+/).filter(Boolean).every((part) => hay.includes(part))) {
      seen.add(raw.id);
      out.push(raw);
    }
  }
  return out.slice(0, limit).map((a) => localizeHelpArticle(a, { lang, device }));
}

export function articlesForCategory(categoryId, opts = {}) {
  const { lang = 'nb', device = 'phone' } = opts;
  return listHelpArticles()
    .filter((a) => a.categoryId === categoryId)
    .map((a) => localizeHelpArticle(a, { lang, device }));
}

/** Compact FAQ snippets for the support bot (local fallback + prompt context). */
export function buildHelpKnowledgeSnippets({ lang = 'nb', limit = 24 } = {}) {
  return listHelpArticles()
    .slice(0, limit)
    .map((a) => {
      const loc = localizeHelpArticle(a, { lang, device: 'phone' });
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
  const def = PROTOP_PAGES[moduleId];
  return def ? pickIntroText(def.label, lang) : String(moduleId || '');
}

/** Test helper — clear memo when intros change in unit tests. */
export function _resetHelpCatalogCache() {
  _cache = null;
}
