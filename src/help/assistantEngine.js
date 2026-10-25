/**
 * ProTop-assistenten: forstår spørsmålet, finner riktig side, arbeidsflyt
 * eller tema i hjelpebiblioteket, og bygger et svar med steg, kilde og
 * handlinger («Vis meg», «Åpne siden», «Start arbeidsflyten», «Kontakt support»).
 *
 * Svarene kommer alltid fra ProTop sitt eget innhold. AI-svar fra serveren
 * (aiSupportChat) får de samme kildene og handlingene lagt ved av klienten.
 * Ren JS uten React Native, så node-testene kan kjøre den.
 */

import { PROTOP_PAGES, getProtopPage, resolvePageKey } from './protopPages.js';
import { PROTOP_PROCESSES } from './protopProcesses.js';
import { ASSISTANT_TOPICS, COMPETITOR_NAMES, OFF_TOPIC_PATTERNS } from './assistantTopics.js';

export const ASSISTANT_CHAT_ID = 'protop-assistant';
export const ASSISTANT_ESCALATE_AFTER = 2;

function pick(value, lang = 'nb') {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (value[lang]) return value[lang];
  if ((lang === 'da' || lang === 'sv') && value.nb) return value.nb;
  return value.en || value.nb || '';
}

/* ───────────── Tekstbehandling ───────────── */

const STOPWORDS = new Set([
  // norsk
  'jeg', 'du', 'vi', 'dere', 'de', 'han', 'hun', 'den', 'det', 'denne', 'dette', 'disse', 'en', 'et', 'ei',
  'og', 'eller', 'men', 'i', 'på', 'pa', 'til', 'fra', 'for', 'med', 'av', 'om', 'som', 'at', 'å', 'a',
  'er', 'var', 'blir', 'bli', 'har', 'hadde', 'kan', 'kunne', 'skal', 'skulle', 'vil', 'ville', 'må', 'ma',
  'meg', 'deg', 'oss', 'seg', 'min', 'mitt', 'mine', 'din', 'ditt', 'dine', 'vår', 'var', 'sin', 'sitt',
  'hva', 'hvem', 'hvor', 'hvordan', 'hvorfor', 'når', 'nar', 'hvilken', 'hvilke', 'hvilket', 'noe', 'noen',
  'ikke', 'ja', 'nei', 'så', 'sa', 'da', 'nå', 'na', 'her', 'der', 'inn', 'ut', 'opp', 'ned', 'over', 'under',
  'man', 'gjør', 'gjor', 'gjøre', 'gjore', 'få', 'fa', 'får', 'far', 'finne', 'finner', 'bruke', 'bruker',
  'lage', 'lager', 'legge', 'tips', 'hjelp', 'hjelpe', 'trenger', 'lurer', 'vet', 'mer', 'mest', 'alle',
  'kanskje', 'litt', 'bare', 'også', 'ogsa', 'sånn', 'slik', 'helt', 'protop', 'appen', 'app', 'systemet',
  // engelsk
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'to', 'from', 'for', 'with', 'of', 'about', 'as', 'at',
  'is', 'are', 'was', 'be', 'have', 'has', 'can', 'could', 'should', 'will', 'would', 'must', 'do', 'does',
  'i', 'you', 'we', 'they', 'it', 'my', 'your', 'our', 'me', 'what', 'who', 'where', 'how', 'why', 'when',
  'which', 'this', 'that', 'these', 'there', 'here', 'please', 'help', 'need', 'want', 'get', 'use', 'make',
]);

/** Synonymer → felles begrep, så «føre timer» og «timeføring» treffer det samme. */
const CONCEPTS = [
  ['timer', ['time', 'timer', 'timen', 'timene', 'timeliste', 'timelisten', 'timeføring', 'timeforing', 'føre', 'fore', 'føring', 'foring', 'hours', 'hour', 'timesheet', 'timeark']],
  ['faktura', ['faktura', 'fakturaen', 'fakturaer', 'fakturere', 'fakturerer', 'fakturert', 'fakturering', 'regning', 'invoice', 'invoices', 'invoicing', 'bill', 'billing', 'ehf', 'kreditnota']],
  ['anbud', ['anbud', 'anbudet', 'anbudene', 'tender', 'tenders', 'konkurranse', 'konkurranser', 'doffin', 'kunngjøring', 'kunngjoring', 'utlysning', 'anskaffelse']],
  ['tilbud', ['tilbud', 'tilbudet', 'tilbudsarbeid', 'bid', 'bids', 'innlevering', 'tilbudsfrist']],
  ['ansatt', ['ansatt', 'ansatte', 'medarbeider', 'medarbeidere', 'arbeider', 'kollega', 'kolleger', 'employee', 'employees', 'staff', 'personell', 'bruker', 'brukere']],
  ['fravaer', ['fravær', 'fravaer', 'ferie', 'ferien', 'feriedager', 'syk', 'sykdom', 'sykemelding', 'sykemeldt', 'permisjon', 'avspasering', 'fri', 'fridag', 'absence', 'holiday', 'vacation', 'leave', 'sick']],
  ['kunde', ['kunde', 'kunden', 'kunder', 'oppdragsgiver', 'klient', 'customer', 'customers', 'client']],
  ['avtale', ['avtale', 'avtalen', 'avtaler', 'kontrakt', 'kontrakten', 'rammeavtale', 'oppdragsavtale', 'avrop', 'agreement', 'contract']],
  ['prosjekt', ['prosjekt', 'prosjektet', 'prosjekter', 'project', 'projects', 'oppdrag', 'jobb']],
  ['avvik', ['avvik', 'avviket', 'hendelse', 'nestenulykke', 'uønsket', 'uonsket', 'deviation', 'incident', 'rua']],
  ['tilgang', ['tilgang', 'tilganger', 'rettighet', 'rettigheter', 'rolle', 'roller', 'nivå', 'niva', 'admin', 'administrator', 'access', 'permission', 'permissions']],
  ['kjorebok', ['kjørebok', 'kjorebok', 'kjøretur', 'kjoretur', 'kjøring', 'kjoring', 'kilometer', 'km', 'bilgodtgjørelse', 'bilgodtgjorelse', 'bompenger', 'bom', 'mileage']],
  ['utstyr', ['utstyr', 'utstyret', 'maskin', 'maskiner', 'verktøy', 'verktoy', 'reservere', 'reservasjon', 'booke', 'equipment']],
  ['godkjenne', ['godkjenn', 'godkjenne', 'godkjenning', 'godkjenninger', 'attestere', 'approve', 'approval', 'approvals']],
  ['iso', ['iso', 'k-hms', 'khms', 'kvalitet', 'kvalitetssystem', 'ledelsessystem', 'internkontroll', '9001', '14001', '45001']],
  ['hms', ['hms', 'sja', 'vernerunde', 'sikkerhet', 'hse', 'ulykke']],
  ['lonn', ['lønn', 'lonn', 'årslønn', 'arslonn', 'lønnsjustering', 'salary']],
  ['rekruttering', ['rekruttering', 'søknad', 'soknad', 'søker', 'soker', 'annonse', 'stilling', 'recruitment', 'applicant']],
  ['skjema', ['skjema', 'skjemaer', 'skjemabygger', 'sjekkliste', 'sjekklister', 'mal', 'maler', 'form', 'forms']],
  ['import', ['import', 'importere', 'importer', 'excel', 'csv', 'opplasting']],
  ['eksport', ['eksport', 'eksportere', 'eksporter', 'pdf', 'utskrift', 'skrive', 'export']],
  ['utlegg', ['utlegg', 'kvittering', 'kvitteringer', 'refusjon', 'expense', 'expenses']],
  ['indeks', ['indeks', 'indeksregulering', 'regulering', 'ssb', 'prisjustering', 'kpi']],
  ['inntjening', ['inntjening', 'fortjeneste', 'margin', 'lønnsomhet', 'lonnsomhet', 'faktureringsgrad', 'earnings', 'profit']],
  ['kapasitet', ['produktivitet', 'kapasitet', 'belegg', 'bemanning', 'ledig', 'capacity']],
  ['cv', ['cv', 'cv-en', 'referanse', 'referanser', 'referanseprosjekt']],
  ['varsel', ['varsel', 'varsler', 'varsling', 'push', 'notifikasjon', 'bjelle', 'notification']],
  ['innlogging', ['logge', 'innlogging', 'passord', 'password', 'login', 'konto']],
  ['modul', ['modul', 'moduler', 'modulen', 'module', 'modules']],
  ['invitere', ['invitere', 'invitasjon', 'inviter', 'invite', 'velkomstmal']],
  ['logo', ['logo', 'logoen']],
  ['produkt', ['produkt', 'produkter', 'vare', 'varer', 'varesalg', 'produktsalg', 'katalog', 'product']],
  ['kalender', ['kalender', 'kalenderen', 'avtaler', 'møte', 'mote', 'hendelse', 'calendar', 'event']],
  ['epost', ['e-post', 'epost', 'mail', 'outlook', 'innboks', 'email']],
  ['oppgave', ['oppgave', 'oppgaver', 'gjøremål', 'gjoremal', 'todo', 'task', 'tasks']],
  ['notat', ['notat', 'notater', 'note', 'notes']],
  ['chat', ['chat', 'melding', 'meldinger', 'dm', 'samtale', 'message']],
  ['lås', ['lås', 'las', 'låse', 'lase', 'låst', 'last', 'låser', 'lock', 'locked']],
  ['ny', ['ny', 'nytt', 'nye', 'opprette', 'opprett', 'registrere', 'registrer', 'legge', 'lage', 'new', 'create', 'add']],
];

const CONCEPT_OF = new Map();
for (const [concept, words] of CONCEPTS) {
  for (const w of words) CONCEPT_OF.set(fold(w), concept);
}

export function fold(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function stem(word) {
  let w = word;
  if (w.length > 6) w = w.replace(/(ene|ane|ers|ets|ens|ingen|inger|ing)$/, '');
  if (w.length > 5) w = w.replace(/(er|en|et|es|ar|or)$/, '');
  if (w.length > 4) w = w.replace(/[aes]$/, '');
  return w;
}

/** Ord → begreper og stammer (for vekting). */
export function tokenize(text) {
  const words = fold(text).split(/[^a-z0-9-]+/).filter(Boolean);
  const out = [];
  for (const raw of words) {
    const w = raw.replace(/^-+|-+$/g, '');
    if (!w || STOPWORDS.has(w) || w.length < 2) continue;
    const concept = CONCEPT_OF.get(w);
    if (concept) out.push(`#${concept}`);
    out.push(stem(w));
  }
  return out;
}

/* ───────────── Kunnskapsbase ───────────── */

function stepsOf(def, lang) {
  return (def.steps || []).map((s) => ({
    title: pick(s.title, lang),
    text: pick(s, lang),
    ...(s.access ? { access: s.access } : {}),
  })).filter((s) => s.text);
}

let kbCache = null;

/** Alle sider, arbeidsflyter og tema som ett søkbart register. */
export function buildKnowledge(lang = 'nb') {
  if (kbCache && kbCache.lang === lang) return kbCache.items;
  const items = [];
  for (const [key, def] of Object.entries(PROTOP_PAGES)) {
    items.push({
      id: `page:${key}`,
      kind: 'page',
      pageKey: key,
      title: pick(def.title, lang),
      label: pick(def.label, lang),
      path: pick(def.path, lang),
      summary: pick(def.pitch, lang),
      steps: stepsOf(def, lang),
      faq: (def.faq || []).map((f) => ({ q: pick(f.q, lang), a: pick(f.a, lang) })),
      keywords: def.keywords || [],
      nav: def.nav || null,
      process: def.process || null,
      icon: def.icon,
      accent: def.accent,
    });
  }
  for (const proc of Object.values(PROTOP_PROCESSES)) {
    items.push({
      id: `process:${proc.id}`,
      kind: 'process',
      processId: proc.id,
      title: pick(proc.title, lang),
      label: pick(proc.title, lang),
      path: '',
      summary: pick(proc.pitch, lang),
      steps: proc.steps.map((s) => ({
        title: pick(s.title, lang),
        text: pick(s, lang),
        pageKey: s.page,
      })),
      faq: [],
      keywords: proc.keywords || [],
      nav: null,
      icon: proc.icon,
      accent: proc.accent,
    });
  }
  for (const tp of ASSISTANT_TOPICS) {
    items.push({
      id: tp.id,
      kind: 'topic',
      title: pick(tp.title, lang),
      label: pick(tp.title, lang),
      path: '',
      summary: pick(tp.summary, lang),
      steps: stepsOf(tp, lang),
      faq: [],
      keywords: tp.keywords || [],
      nav: tp.nav || null,
      // Siden «Åpne siden» går til (tilgangen sjekkes før knappen vises).
      openPage: tp.page || null,
    });
  }
  for (const it of items) {
    const weights = new Map();
    const add = (text, w) => {
      for (const tok of tokenize(text)) weights.set(tok, Math.max(weights.get(tok) || 0, w));
    };
    add(it.steps.map((s) => `${s.title} ${s.text}`).join(' '), 1);
    add(it.summary, 1.5);
    add(it.faq.map((f) => f.q).join(' '), 3);
    add(it.keywords.join(' '), 3);
    add(it.label, 4);
    add(it.title, 3.5);
    it.index = weights;
  }
  kbCache = { lang, items };
  return items;
}

export function _resetAssistantCache() {
  kbCache = null;
}

/**
 * Rangerer kunnskapen mot spørsmålet. `pageKey` gir et lite løft til siden
 * brukeren står på, så «hvordan gjør jeg det her?» treffer riktig.
 */
export function searchKnowledge(question, { lang = 'nb', pageKey = null, limit = 5 } = {}) {
  const tokens = tokenize(question);
  const items = buildKnowledge(lang);
  if (!tokens.length) return [];
  const unique = [...new Set(tokens)];
  const wantsWorkflow = /\b(hele|prosess(en)?|flyt(en)?|arbeidsflyt(en)?|fra .+ til|workflow|whole|end to end)\b/.test(fold(question));
  const scored = [];
  for (const it of items) {
    let score = 0;
    let hits = 0;
    for (const tok of unique) {
      let w = it.index.get(tok) || 0;
      if (!w && tok.length >= 5 && !tok.startsWith('#')) {
        for (const [k, v] of it.index) {
          if (!k.startsWith('#') && k.length >= 5 && (k.startsWith(tok) || tok.startsWith(k))) {
            w = Math.max(w, v * 0.6);
          }
        }
      }
      if (w) {
        hits += 1;
        // Begrepstreff teller litt mindre enn eksakte ord, så «ny kunde» slår «kunde».
        score += tok.startsWith('#') ? w * 0.8 : w;
      }
    }
    if (!score) continue;
    const coverage = hits / unique.length;
    score *= 0.6 + coverage;
    // Kuraterte spørsmål (FAQ) som nesten er likt spørsmålet, vinner.
    if (it.faq.some((f) => searchFaqMatch(question, f.q))) score += 3;
    if (pageKey && it.pageKey === pageKey) score += 1.2;
    if (it.kind === 'process') {
      // Arbeidsflyter dekker mange ord; de vinner bare når brukeren spør etter hele løpet.
      if (wantsWorkflow) score += 3;
      else score *= 0.45;
    }
    scored.push({ item: it, score, coverage });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/* ───────────── Intensjon ───────────── */

const RX = {
  greeting: /^(hei|hallo|heisann|hey|hi|hello|god (morgen|dag|kveld)|yo)\b[\s!.,]*$/,
  thanks: /\b(takk|tusen takk|takker|thanks|thank you|flott|supert|perfekt)\b/,
  human: /\b(menneske|person|support|kundeservice|kundestøtte|kundestotte|brukerstøtte|brukerstotte|snakke med|ringe|kontakt(e)? (dere|support)|human|agent|saksnummer)\b/,
  bug: /\b(feil|bug|error|krasj|krasjer|kræsj|fungerer ikke|virker ikke|henger|hvit skjerm|blank|laster ikke|får ikke|far ikke|kommer ikke|forsvant|borte|exception|404|500)\b/,
  where: /\b(hvor (finner|er|ligger|kan)|where (is|can|do)|finne frem|finner ikke)\b/,
  howto: /\b(hvordan|how( do| can| to)?|steg for steg|fremgangsmåte|framgangsmate|kan jeg|kan man|slik)\b/,
  whatis: /\b(hva er|hva betyr|what is|what does|forklar|explain)\b/,
  thisPage: /\b(denne siden|siden her|her på siden|på denne siden|this page|current page|her)\b/,
  workflow: /\b(hele (løpet|prosessen|flyten)|arbeidsflyt|prosessen|fra anbud til faktura|workflow|from .+ to)\b/,
  compare: /\b(bedre|best|sammenlign|vs\.?|versus|bytte til|alternativ(er)?|anbefal|konkurrent|i stedet for|better|compare|recommend|instead of)\b/,
};

export function detectIntent(question) {
  const raw = String(question || '').trim();
  const q = fold(raw);
  const competitor = COMPETITOR_NAMES.find((name) => q.includes(fold(name))) || null;
  const offTopic = OFF_TOPIC_PATTERNS.some((rx) => rx.test(raw));
  return {
    greeting: RX.greeting.test(q),
    thanks: RX.thanks.test(q) && q.split(/\s+/).length <= 6,
    human: RX.human.test(q),
    bug: RX.bug.test(q),
    where: RX.where.test(q),
    howto: RX.howto.test(q),
    whatis: RX.whatis.test(q),
    thisPage: RX.thisPage.test(q),
    workflow: RX.workflow.test(q),
    compare: RX.compare.test(q),
    competitor,
    offTopic,
  };
}

/* ───────────── Svar ───────────── */

const T = {
  greet: {
    nb: 'Hei! Jeg er ProTop-assistenten. Spør meg om hva som helst i ProTop — jeg svarer med steg, og kan vise deg veien i appen.',
    en: 'Hi! I’m the ProTop assistant. Ask me anything about ProTop — I answer with steps and can show you the way in the app.',
  },
  greetPage: {
    nb: 'Du står på «{page}». Vil du ha hjelp med denne siden, eller lurer du på noe annet?',
    en: 'You are on “{page}”. Want help with this page, or something else?',
  },
  thanks: {
    nb: 'Bare hyggelig! Si fra hvis du lurer på noe mer i ProTop.',
    en: 'You’re welcome! Let me know if you need anything else in ProTop.',
  },
  howIntro: { nb: 'Slik gjør du det i ProTop:', en: 'Here’s how to do it in ProTop:' },
  whereIntro: { nb: 'Du finner det her: {path}.', en: 'You’ll find it here: {path}.' },
  processIntro: {
    nb: '«{title}» går over flere sider. Jeg kan ta deg gjennom hele flyten med markering på hver side.',
    en: '“{title}” spans several pages. I can take you through the whole flow with highlights on every page.',
  },
  bug: {
    nb: 'Det høres ut som noe ikke virker som det skal. Prøv dette først:',
    en: 'That sounds like something isn’t working right. Try this first:',
  },
  bugAbout: {
    nb: 'Gjelder det «{label}», ligger siden her: {path}.',
    en: 'If it is about “{label}”, the page is here: {path}.',
  },
  bugSteps: {
    nb: [
      ['Last siden på nytt', 'Oppdater nettleseren (eller lukk og åpne appen). ProTop henter da siste versjon.'],
      ['Sjekk tilgang', 'Ser du en lås, mangler modulen eller tilgangen — be administrator sjekke Modulinnstillinger og Tilgangsstyring.'],
      ['Sjekk nettet', 'Får du «Kunne ikke lagre», er forbindelsen ofte borte. Prøv igjen når du er på nett.'],
      ['Fortsatt feil?', 'Trykk «Kontakt support» under, så lager jeg en sak med samtalen. Legg gjerne ved et skjermbilde.'],
    ],
    en: [
      ['Reload the page', 'Refresh the browser (or close and reopen the app). ProTop then fetches the latest version.'],
      ['Check access', 'If you see a lock, the module or your access is missing — ask an administrator to check Module settings and Access control.'],
      ['Check the connection', '“Could not save” often means you are offline. Try again when you’re back online.'],
      ['Still broken?', 'Tap “Contact support” below and I’ll create a case with this conversation. Attach a screenshot if you can.'],
    ],
  },
  human: {
    nb: 'Selvfølgelig. Jeg kan lage en supportsak med samtalen vår, så svarer et menneske i Hjelp & support → Mine henvendelser.',
    en: 'Of course. I can create a support case with our conversation, and a person will reply in Help & support → My requests.',
  },
  offTopic: {
    nb: 'Det kan jeg dessverre ikke hjelpe med — jeg er ProTop-assistenten og svarer bare om ProTop. Spør meg gjerne om anbud, prosjekter, timer, faktura, HR, ISO eller noe annet i appen.',
    en: 'I’m afraid I can’t help with that — I’m the ProTop assistant and only answer about ProTop. Ask me about tenders, projects, hours, invoicing, HR, ISO or anything else in the app.',
  },
  competitor: {
    nb: 'Jeg kan ikke vurdere andre systemer, men jeg kan vise deg hvordan du gjør dette i ProTop — alt ligger samlet her, og data fra Excel eller andre systemer kan importeres.',
    en: 'I can’t assess other systems, but I can show you how to do this in ProTop — everything is in one place here, and data from Excel or other systems can be imported.',
  },
  unsure: {
    nb: 'Jeg er ikke helt sikker på hva du mener. Kan du si litt mer — for eksempel hvilken side du står på, eller hva du prøver å få til?',
    en: 'I’m not quite sure what you mean. Could you tell me a bit more — for example which page you are on, or what you are trying to do?',
  },
  unsureEscalate: {
    nb: 'Jeg finner ikke et godt svar på dette. Vil du at jeg lager en supportsak, så ser et menneske på det?',
    en: 'I can’t find a good answer to this. Shall I create a support case so a person can look at it?',
  },
  related: { nb: 'Dette kan også være nyttig:', en: 'This may also help:' },
  lockedPage: {
    nb: 'Du har ikke tilgang til denne siden med ditt nåværende nivå, så jeg viser deg ikke veien dit.',
    en: 'You don’t have access to this page with your current level, so I won’t take you there.',
  },
  lockedSome: {
    nb: 'Noen av stegene krever mer tilgang enn du har — de er merket med en lås.',
    en: 'Some of the steps need more access than you have — they are marked with a lock.',
  },
};

function tr(key, lang, vars = {}) {
  const v = T[key];
  let out = pick(v, lang);
  for (const [k, val] of Object.entries(vars)) out = out.replace(`{${k}}`, val);
  return out;
}

function actionsFor(item, lang) {
  if (!item) return [];
  const out = [];
  if (item.kind === 'process') {
    out.push({ type: 'process', processId: item.processId, label: pick({ nb: 'Start arbeidsflyten', en: 'Start the workflow' }, lang) });
    return out;
  }
  if (item.kind === 'page') {
    out.push({ type: 'tour', pageKey: item.pageKey, nav: item.nav, label: pick({ nb: 'Vis meg steg for steg', en: 'Show me step by step' }, lang) });
    out.push({ type: 'open', pageKey: item.pageKey, nav: item.nav, label: pick({ nb: 'Åpne siden', en: 'Open the page' }, lang) });
    if (item.process && PROTOP_PROCESSES[item.process]) {
      out.push({
        type: 'process',
        processId: item.process,
        label: `${pick({ nb: 'Hele flyten', en: 'Whole flow' }, lang)}: ${pick(PROTOP_PROCESSES[item.process].title, lang)}`,
      });
    }
    return out;
  }
  if (item.nav) {
    out.push({
      type: 'open',
      nav: item.nav,
      ...(item.openPage ? { pageKey: item.openPage } : {}),
      label: pick({ nb: 'Åpne siden', en: 'Open the page' }, lang),
    });
  }
  return out;
}

function sourceFor(item) {
  if (!item) return null;
  return {
    id: item.id,
    kind: item.kind,
    label: item.label,
    path: item.path || '',
    pageKey: item.pageKey || null,
    processId: item.processId || null,
  };
}

/** Oppfølgingsspørsmål: FAQ fra siden, ellers naboer i samme arbeidsflyt. */
function followUpsFor(item, lang, others = []) {
  const out = [];
  if (item?.faq?.length) out.push(...item.faq.map((f) => f.q));
  if (item?.kind === 'page' && item.process && PROTOP_PROCESSES[item.process]) {
    const proc = PROTOP_PROCESSES[item.process];
    const idx = proc.steps.findIndex((s) => s.page === item.pageKey);
    const next = idx >= 0 ? proc.steps[idx + 1] : null;
    const nextPage = next ? PROTOP_PAGES[next.page] : null;
    if (nextPage) {
      out.push(pick({ nb: `Hva gjør jeg etterpå på ${pick(nextPage.label, 'nb')}?`, en: `What do I do next on ${pick(nextPage.label, 'en')}?` }, lang));
    }
  }
  for (const o of others) {
    if (out.length >= 3) break;
    if (o?.label) out.push(pick({ nb: `Hvordan bruker jeg ${o.label}?`, en: `How do I use ${o.label}?` }, lang));
  }
  return [...new Set(out)].slice(0, 3);
}

/** Forslag i starten av samtalen, tilpasset siden brukeren står på. */
export function starterSuggestions({ lang = 'nb', pageKey = null, company = true, access = null } = {}) {
  const out = [];
  const page = pageKey ? getProtopPage(pageKey) : null;
  if (page) {
    out.push(pick({ nb: `Hvordan bruker jeg ${pick(page.label, 'nb')}?`, en: `How do I use ${pick(page.label, 'en')}?` }, lang));
    if (page.faq?.[0]) out.push(pick(page.faq[0].q, lang));
  }
  // Bare forslag brukeren har tilgang til å gjøre noe med.
  const general = company
    ? [
      { nb: 'Hvordan fører jeg timer?', en: 'How do I log hours?', page: 'arbeid.timeliste' },
      { nb: 'Vis meg hele flyten fra anbud til faktura', en: 'Show me the whole flow from tender to invoice', page: 'anbud.varsling' },
      { nb: 'Hvordan legger jeg til en ny ansatt?', en: 'How do I add a new employee?', page: 'ansatte' },
      { nb: 'Hvordan lager jeg en faktura?', en: 'How do I create an invoice?', page: 'okonomi.faktura' },
      { nb: 'Hvordan melder jeg et avvik?', en: 'How do I report a deviation?', page: 'iso.avvik' },
      { nb: 'Hvordan legger jeg inn en avtale i kalenderen?', en: 'How do I add an event to the calendar?', page: 'plan' },
    ].filter((g) => pageOpen(access, g.page))
    : [
      { nb: 'Hvordan legger jeg inn en avtale i kalenderen?', en: 'How do I add an event to the calendar?' },
      { nb: 'Hvordan kobler jeg Outlook?', en: 'How do I connect Outlook?' },
      { nb: 'Hvordan bytter jeg til Bedrift?', en: 'How do I switch to Company?' },
    ];
  for (const g of general) {
    if (out.length >= 4) break;
    out.push(pick(g, lang));
  }
  return [...new Set(out)].slice(0, 4);
}

export function greeting({ lang = 'nb', pageKey = null, company = true, access = null } = {}) {
  const page = pageKey ? getProtopPage(pageKey) : null;
  const text = page
    ? `${tr('greet', lang)}\n\n${tr('greetPage', lang, { page: pick(page.label, lang) })}`
    : tr('greet', lang);
  return {
    role: 'assistant',
    intent: 'greeting',
    text,
    steps: [],
    sources: [],
    actions: page ? actionsFor(buildKnowledge(lang).find((k) => k.pageKey === resolvePageKey(pageKey)), lang).slice(0, 1) : [],
    followUps: starterSuggestions({ lang, pageKey, company, access }),
  };
}

/* ───────────── Tilgang ───────────── */

/**
 * `access` (valgfri): { check(pageKey, stepIndex), checkProcessStep(processId, index, pageKey) }
 * fra useHelpAccess. Hver gir { ok, page, text }. Uten `access` er alt åpent.
 */
function gateOf(access, item, index = null) {
  if (!access || !item) return null;
  if (item.kind === 'page') return access.check?.(item.pageKey, index) || null;
  if (item.kind === 'process' && index != null) {
    return access.checkProcessStep?.(item.processId, index, item.steps[index]?.pageKey) || null;
  }
  // Tema-steg som peker på et steg på en side (f.eks. import av kunder).
  const ref = index != null ? item.steps?.[index]?.access : null;
  if (ref?.need) return access.checkNeed?.(ref.need) || null;
  if (ref?.page) return access.check?.(ref.page, ref.index) || null;
  return null;
}

/** Stegene med låsetekst der brukeren mangler tilgang. */
function stepsWithAccess(item, access) {
  return (item.steps || []).map((s, i) => {
    const g = gateOf(access, item, i);
    const step = { title: s.title, text: s.text };
    return g && !g.ok ? { ...step, locked: g.text } : step;
  });
}

/** Steget spørsmålet handler om (f.eks. «importere» → Importer-steget). */
function focusStep(question, steps) {
  const q = tokenize(question).filter((t) => !t.startsWith('#'));
  if (!q.length) return -1;
  let best = -1;
  let bestScore = 0;
  steps.forEach((s, i) => {
    const title = new Set(tokenize(s.title || ''));
    const all = new Set(tokenize(`${s.title || ''} ${s.text}`));
    const score = q.reduce((n, t) => n + (title.has(t) ? 2 : 0) + (all.has(t) ? 1 : 0), 0);
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return bestScore >= 3 ? best : -1;
}

/** Siden er åpen for brukeren (eller ingen sperre kjent). */
function pageOpen(access, pageKey) {
  if (!access || !pageKey) return true;
  const g = access.check?.(pageKey, null);
  return !g || g.ok;
}

/**
 * Lokalt svar — alltid tilgjengelig, også uten nett mot AI.
 * `unresolved` = antall svar på rad uten godt treff (styrer forslag om support).
 */
export function answerQuestion(question, {
  lang = 'nb',
  pageKey = null,
  company = true,
  unresolved = 0,
  access = null,
} = {}) {
  const q = String(question || '').trim();
  const intent = detectIntent(q);
  const base = {
    role: 'assistant',
    question: q,
    text: '',
    steps: [],
    sources: [],
    actions: [],
    followUps: [],
    confidence: 0,
  };

  if (!q) return { ...base, intent: 'empty', text: tr('unsure', lang) };

  if (intent.greeting) {
    return { ...greeting({ lang, pageKey, company, access }), question: q, confidence: 1 };
  }
  if (intent.thanks) {
    return { ...base, intent: 'thanks', text: tr('thanks', lang), confidence: 1, followUps: starterSuggestions({ lang, pageKey, company, access }).slice(0, 2) };
  }

  const vaguePage = intent.thisPage && pageKey;
  let ranked = searchKnowledge(q, { lang, pageKey, limit: 5 });
  if (vaguePage && (!ranked.length || ranked[0].score < 3)) {
    const own = buildKnowledge(lang).find((k) => k.pageKey === resolvePageKey(pageKey));
    if (own) ranked = [{ item: own, score: 5, coverage: 1 }, ...ranked.filter((r) => r.item !== own)];
  }
  const top = ranked[0] || null;
  const strong = !!top && top.score >= 3 && top.coverage >= 0.34;

  if (intent.offTopic && !strong) {
    return {
      ...base,
      intent: 'offTopic',
      text: tr('offTopic', lang),
      confidence: 1,
      followUps: starterSuggestions({ lang, pageKey, company, access }).slice(0, 3),
    };
  }

  if (intent.human) {
    return {
      ...base,
      intent: 'human',
      text: tr('human', lang),
      confidence: 1,
      actions: [{ type: 'support', label: pick({ nb: 'Kontakt support', en: 'Contact support' }, lang) }],
    };
  }

  if (intent.bug) {
    // Feil går alltid til feilsøking + support. Gjelder det en bestemt side, pekes den ut.
    const rows = T.bugSteps[lang === 'en' ? 'en' : 'nb'];
    const about = strong && top.item.kind === 'page' ? top.item : null;
    return {
      ...base,
      intent: 'bug',
      text: about
        ? `${tr('bug', lang)}\n\n${tr('bugAbout', lang, { label: about.label, path: about.path })}`
        : tr('bug', lang),
      steps: rows.map(([title, text]) => ({ title, text })),
      sources: about ? [sourceFor(about)] : [],
      confidence: 0.8,
      actions: [
        ...(about && pageOpen(access, about.pageKey) ? actionsFor(about, lang).filter((a) => a.type === 'open') : []),
        { type: 'support', label: pick({ nb: 'Kontakt support', en: 'Contact support' }, lang) },
      ],
    };
  }

  if (!top || top.score < 1.6) {
    const escalate = unresolved + 1 >= ASSISTANT_ESCALATE_AFTER;
    return {
      ...base,
      intent: intent.competitor ? 'competitor' : 'unknown',
      text: intent.competitor ? tr('competitor', lang) : tr(escalate ? 'unsureEscalate' : 'unsure', lang),
      confidence: 0,
      actions: escalate ? [{ type: 'support', label: pick({ nb: 'Kontakt support', en: 'Contact support' }, lang) }] : [],
      followUps: starterSuggestions({ lang, pageKey, company, access }).slice(0, 3),
    };
  }

  const item = top.item;
  const others = ranked.slice(1, 3).map((r) => r.item).filter((o) => o.kind !== 'page' || pageOpen(access, o.pageKey));
  const preface = intent.competitor && intent.compare ? `${tr('competitor', lang)}\n\n` : '';

  // Siden er stengt for brukeren: si hva som kreves og hvem som kan hjelpe — ingen steg eller «Vis meg».
  const pageGate = gateOf(access, item);
  if (item.kind === 'page' && pageGate && !pageGate.ok) {
    return {
      ...base,
      intent: 'locked',
      text: `${preface}**${item.label}** — ${item.summary}\n\n${tr('lockedPage', lang)}\n\n🔒 ${pageGate.text}`.trim(),
      steps: [],
      sources: [sourceFor(item)],
      actions: [],
      followUps: starterSuggestions({ lang, pageKey, company, access }).slice(0, 3),
      confidence: Math.min(1, top.score / 8),
      matchId: item.id,
      locked: true,
    };
  }
  let text;
  if (item.kind === 'process') {
    text = `${tr('processIntro', lang, { title: item.title })}\n\n${item.summary}`;
  } else if (intent.where && !intent.howto && item.path) {
    text = `${tr('whereIntro', lang, { path: item.path })}\n\n${item.summary}`;
  } else if (intent.whatis && !intent.howto) {
    text = `**${item.label}** — ${item.summary}${item.path ? `\n\n${tr('whereIntro', lang, { path: item.path })}` : ''}`;
  } else {
    const faq = item.faq.find((f) => searchFaqMatch(q, f.q));
    text = faq
      ? `${faq.a}`
      : `**${item.label}** — ${item.summary}${item.path ? `\n\n${tr('whereIntro', lang, { path: item.path })}` : ''}\n\n${tr('howIntro', lang)}`;
  }

  const steps = stepsWithAccess(item, access);
  // Spør brukeren om noe de ikke har tilgang til (f.eks. import), sies det rett ut først.
  const focus = focusStep(q, steps);
  const focusLocked = focus >= 0 && !!steps[focus].locked;
  if (focusLocked) {
    text = `🔒 **${steps[focus].title || item.label}:** ${steps[focus].locked}\n\n${text}`;
  } else if (steps.some((st) => st.locked)) {
    text = `${text}\n\n${tr('lockedSome', lang)}`;
  }

  let actions = actionsFor(item, lang);
  // Tema-steg som peker på en side (f.eks. import av kunder): «Vis meg» rett til det steget.
  const ref = focus >= 0 ? item.steps?.[focus]?.access : null;
  if (item.kind === 'topic' && ref && pageOpen(access, ref.page)) {
    const target = buildKnowledge(lang).find((k) => k.pageKey === ref.page);
    actions = [
      ...actionsFor(target, lang).filter((a) => a.type === 'tour').map((a) => ({ ...a, step: ref.index })),
      ...actions,
    ];
  }

  // Ingen «Åpne siden» / «Vis meg» til sider brukeren ikke har tilgang til.
  actions = actions.filter((a) => (a.type !== 'open' && a.type !== 'tour') || pageOpen(access, a.pageKey));

  return {
    ...base,
    intent: item.kind === 'process' ? 'workflow' : intent.where ? 'where' : 'howto',
    text: `${preface}${text}`.trim(),
    steps,
    sources: [sourceFor(item), ...others.slice(0, 1).map(sourceFor)].filter(Boolean),
    actions,
    followUps: followUpsFor(item, lang, others),
    confidence: Math.min(1, top.score / 8),
    matchId: item.id,
    ...(focusLocked ? { locked: true } : {}),
  };
}

/** FAQ-svaret brukes bare når spørsmålet nesten er det samme (egne ord, ikke begreper). */
function searchFaqMatch(question, faqQuestion) {
  const words = (text) => [...new Set(tokenize(text).filter((t) => !t.startsWith('#')))];
  const a = new Set(words(question));
  const b = words(faqQuestion);
  if (!b.length) return false;
  const hits = b.filter((t) => a.has(t)).length;
  return hits / b.length >= 0.66 && (hits >= 2 || b.length === 1);
}

/** De mest relevante kunnskapsbitene sendt med til AI-motoren på serveren. */
export function knowledgeForServer(question, { lang = 'nb', pageKey = null, limit = 6, access = null } = {}) {
  const ranked = searchKnowledge(question, { lang, pageKey, limit });
  const own = pageKey ? buildKnowledge(lang).find((k) => k.pageKey === resolvePageKey(pageKey)) : null;
  const items = ranked.map((r) => r.item);
  if (own && !items.includes(own)) items.push(own);
  return items.slice(0, limit + 1).map((it) => {
    const where = it.path ? `${it.summary} (Hvor: ${it.path})` : it.summary;
    const pageGate = gateOf(access, it);
    // AI-motoren får vite hva brukeren ikke har tilgang til, så den ikke gir steg for det.
    if (it.kind === 'page' && pageGate && !pageGate.ok) {
      return {
        id: it.id,
        moduleId: it.pageKey,
        title: `${it.label} — ${it.title}`,
        summary: `${where} [LÅST FOR BRUKEREN: ${pageGate.text}]`,
        steps: [],
        locked: true,
      };
    }
    return {
      id: it.id,
      moduleId: it.pageKey || it.processId || it.id,
      title: it.label ? `${it.label} — ${it.title}` : it.title,
      summary: where,
      steps: stepsWithAccess(it, access).slice(0, 6).map((s) => {
        const line = s.title ? `${s.title}: ${s.text}` : s.text;
        return s.locked ? `${line} [LÅST FOR BRUKEREN: ${s.locked}]` : line;
      }),
    };
  });
}

/** Ren tekst til supportsak og kopiering. */
/** Grensene i createSupportTicket (functions/aiSupport.js). */
export const SUPPORT_TITLE_MAX = 120;
export const SUPPORT_BODY_MAX = 5000;

/**
 * Brødteksten i en supportsak: brukerens egen beskrivelse først, deretter
 * samtalen. Blir den for lang, beholdes slutten av samtalen (det nyeste).
 */
export function supportTicketBody({ note = '', transcript = '', lang = 'nb', max = SUPPORT_BODY_MAX - 200 } = {}) {
  const own = String(note || '').trim().slice(0, Math.floor(max / 2));
  const talk = String(transcript || '').trim();
  if (!talk) return own;
  const head = `${lang === 'en' ? 'Conversation with the assistant' : 'Samtale med assistenten'}:\n`;
  const room = max - own.length - head.length - (own ? 2 : 0);
  if (room <= 40) return own;
  let tail = talk;
  if (tail.length > room) {
    const cut = lang === 'en' ? '… (earlier in the conversation shortened)\n' : '… (tidligere i samtalen er kortet ned)\n';
    tail = cut + talk.slice(talk.length - (room - cut.length));
  }
  return [own, head + tail].filter(Boolean).join('\n\n');
}

export function transcriptText(messages = [], { lang = 'nb' } = {}) {
  const you = lang === 'en' ? 'You' : 'Du';
  const bot = lang === 'en' ? 'Assistant' : 'Assistent';
  return (messages || [])
    .filter((m) => m && (m.text || (m.steps || []).length))
    .map((m) => {
      const who = m.role === 'user' ? you : bot;
      const steps = (m.steps || []).map((s, i) => `  ${i + 1}. ${s.title ? `${s.title}: ` : ''}${s.text}`).join('\n');
      return `${who}: ${m.text || ''}${steps ? `\n${steps}` : ''}`;
    })
    .join('\n\n');
}
