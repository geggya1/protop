/**
 * Generelle tema for ProTop-assistenten — spørsmål som ikke hører til én side
 * (innlogging, varsler, privat/bedrift, installering, eksport …).
 * Svarene skal bare peke på funksjoner som finnes i ProTop.
 */

const tx = (nb, en) => ({ nb, en });

function topic(def) {
  return { kind: 'topic', steps: [], keywords: [], ...def };
}

const s = (title, nb, en, extra = {}) => ({ title: tx(title.nb || title, title.en || title), nb, en, ...extra });
/** Steget følger tilgangen til steg nr. `index` på ProTop-siden `page` (src/help/helpAccess.js). */
const gate = (page, index) => ({ access: { page, index } });
/** Steget krever et trinn på et område uten egen side (f.eks. «Se som bruker»). */
const need = (resource, action) => ({ access: { need: { resource, action } } });

export const ASSISTANT_TOPICS = [
  topic({
    id: 'topic.switch',
    title: tx('Bytte mellom Privat og Bedrift', 'Switch between Personal and Company'),
    summary: tx(
      'ProTop har et privat område og ett eller flere bedriftsområder. Bryteren Privat / Bedrift øverst bytter mellom dem.',
      'ProTop has a personal space and one or more company spaces. The Personal / Company switch at the top moves between them.',
    ),
    steps: [
      s({ nb: 'Finn bryteren', en: 'Find the switch' }, 'Øverst på alle sider står Privat / Bedrift.', 'At the top of every page is Personal / Company.'),
      s({ nb: 'Velg Bedrift', en: 'Choose Company' }, 'Trykk Bedrift for å se bedriftsmodulene i menyen.', 'Tap Company to see the company modules in the menu.'),
      s({ nb: 'Flere bedrifter', en: 'Several companies' }, 'Er du med i flere bedrifter, velger du bedrift fra profilbildet → bytt arbeidsområde.', 'If you belong to several companies, pick one from your profile photo → switch workspace.'),
    ],
    nav: { tab: 'home' },
    keywords: ['privat', 'bedrift', 'bytte', 'bryter', 'arbeidsområde', 'firma', 'switch', 'workspace'],
  }),
  topic({
    id: 'topic.menu',
    title: tx('Finne frem i menyen', 'Finding your way in the menu'),
    summary: tx(
      'Alle moduler ligger i menyen: til venstre på PC, bak ☰ på mobil. Bedriftsmodulene er gruppert (Ansatte og arbeidstid, Økonomi og fakturering, Anbud, Kunder og oppdrag …).',
      'Every module is in the menu: on the left on desktop, behind ☰ on mobile. Company modules are grouped (Employees and working hours, Finance and invoicing, Tenders, Customers and assignments …).',
    ),
    steps: [
      s({ nb: 'Åpne menyen', en: 'Open the menu' }, 'PC: menyen står alltid til venstre. Mobil: trykk ☰ øverst til venstre.', 'Desktop: the menu is always on the left. Mobile: tap ☰ at the top left.'),
      s({ nb: 'Åpne en gruppe', en: 'Open a group' }, 'Trykk en gruppe, f.eks. «Økonomi og fakturering», for å se sidene under.', 'Tap a group, e.g. “Finance and invoicing”, to see its pages.'),
      s({ nb: 'Søk', en: 'Search' }, 'På PC kan du søke i feltet øverst i menyen.', 'On desktop you can search in the field at the top of the menu.'),
    ],
    nav: { tab: 'home' },
    keywords: ['meny', 'menyen', 'finne', 'navigere', 'hvor', 'modul', 'side', 'hamburger'],
  }),
  topic({
    id: 'topic.lightbulb',
    title: tx('Lyspæren — hjelp på hver side', 'The lightbulb — help on every page'),
    summary: tx(
      'Lyspæren (på PC: «Hjelp» øverst) åpner hjelp for siden du står på. «Vis meg steg for steg» toner ned skjermen og lyser opp knappen du skal trykke på.',
      'The lightbulb (on desktop: “Help” at the top) opens help for the page you are on. “Show me step by step” dims the screen and lights up the button to tap.',
    ),
    steps: [
      s({ nb: 'Trykk lyspæren', en: 'Tap the lightbulb' }, 'Mobil: under profilbildet. PC: «Hjelp» ved varslene.', 'Mobile: under your profile photo. Desktop: “Help” next to notifications.'),
      s({ nb: 'Les kortet', en: 'Read the card' }, 'Kortet forklarer siden og viser stegene.', 'The card explains the page and shows the steps.'),
      s({ nb: 'Vis meg', en: 'Show me' }, '«Vis meg steg for steg» markerer knappene én for én. Piltastene blar, Esc lukker.', '“Show me step by step” highlights the buttons one by one. Arrow keys step, Esc closes.'),
    ],
    keywords: ['lyspære', 'hjelp', 'guide', 'rundtur', 'veiledning', 'lightbulb', 'tour', 'vis meg'],
  }),
  topic({
    id: 'topic.notifications',
    title: tx('Varsler og push', 'Notifications and push'),
    summary: tx(
      'Bjellen øverst viser varslene dine. Slå på push for å få beskjed om meldinger, godkjenninger og nye anbudstreff.',
      'The bell at the top shows your notifications. Turn on push to hear about messages, approvals and new tender hits.',
    ),
    steps: [
      s({ nb: 'Se varslene', en: 'See notifications' }, 'Trykk bjellen øverst til høyre.', 'Tap the bell at the top right.'),
      s({ nb: 'Slå på push', en: 'Turn on push' }, 'Innstillinger → Varslinger. Sier nettleseren «blokkert», tillat varsler for protop.no i nettleserinnstillingene.', 'Settings → Notifications. If the browser says “blocked”, allow notifications for protop.no in the browser settings.'),
      s({ nb: 'Anbudsvarsler', en: 'Tender alerts' }, 'E-post og push for anbud styres under Anbud → Innstillinger → Varsling.', 'Email and push for tenders are set under Tenders → Settings → Notifications.'),
    ],
    nav: { tab: 'more', subView: 'settings' },
    keywords: ['varsel', 'varsler', 'push', 'notifikasjon', 'bjelle', 'blokkert', 'notification'],
  }),
  topic({
    id: 'topic.login',
    title: tx('Innlogging og passord', 'Sign-in and password'),
    summary: tx(
      'Logg inn med Google, Microsoft eller e-post. Har du glemt passordet, bruk «Glemt passord» på innloggingssiden.',
      'Sign in with Google, Microsoft or email. If you forgot your password, use “Forgot password” on the sign-in page.',
    ),
    steps: [
      s({ nb: 'Glemt passord', en: 'Forgot password' }, 'Trykk «Glemt passord» på innloggingssiden og følg lenken du får på e-post.', 'Tap “Forgot password” on the sign-in page and follow the link in the email.'),
      s({ nb: 'Invitert av bedriften', en: 'Invited by the company' }, 'Bruk lenken i velkomst-e-posten for å sette passord første gang.', 'Use the link in the welcome email to set your password the first time.'),
      s({ nb: 'Bytt passord', en: 'Change password' }, 'Innstillinger → Rediger profil.', 'Settings → Edit profile.'),
    ],
    keywords: ['logge inn', 'innlogging', 'passord', 'glemt', 'login', 'password', 'microsoft', 'google', 'konto'],
  }),
  topic({
    id: 'topic.install',
    title: tx('ProTop på mobil og som app', 'ProTop on mobile and as an app'),
    summary: tx(
      'ProTop fungerer i nettleseren på protop.no og kan legges på hjemskjermen som en app. Data synkes mellom mobil, nettbrett og PC.',
      'ProTop works in the browser at protop.no and can be added to the home screen as an app. Data syncs between phone, tablet and desktop.',
    ),
    steps: [
      s({ nb: 'iPhone', en: 'iPhone' }, 'Åpne protop.no i Safari → Del → «Legg til på Hjem-skjerm».', 'Open protop.no in Safari → Share → “Add to Home Screen”.'),
      s({ nb: 'Android', en: 'Android' }, 'Åpne protop.no i Chrome → meny ⋮ → «Installer app».', 'Open protop.no in Chrome → menu ⋮ → “Install app”.'),
      s({ nb: 'Samme konto', en: 'Same account' }, 'Logg inn med samme konto overalt, så ser du de samme dataene.', 'Sign in with the same account everywhere to see the same data.'),
    ],
    keywords: ['app', 'mobil', 'installere', 'hjemskjerm', 'iphone', 'android', 'nettbrett', 'synkronisere'],
  }),
  topic({
    id: 'topic.import',
    title: tx('Flytte data inn i ProTop', 'Moving data into ProTop'),
    summary: tx(
      'Kommer dere fra Excel eller et annet system, kan dere importere kunder, prosjekter, ansatte, timer, fakturaer, utlegg og produktsalg fra fil. Du kontrollerer radene før noe lagres. Import krever Admin på området i Tilgangsstyring.',
      'Coming from Excel or another system, you can import customers, projects, employees, hours, invoices, expenses and product sales from a file. You check the rows before anything is saved. Importing requires Admin on the area in Access control.',
    ),
    steps: [
      s({ nb: 'Kunder', en: 'Customers' }, 'Kunder → «Ny kunde» → «Importer fil».', 'Customers → “New customer” → “Import file”.', gate('kunder', 3)),
      s({ nb: 'Prosjekter', en: 'Projects' }, 'Prosjekt → «Nytt prosjekt» → «Importer liste».', 'Projects → “New project” → “Import list”.', gate('projects', 4)),
      s({ nb: 'Ansatte', en: 'Employees' }, 'Ansatte → «Ny ansatt» → «Importer liste».', 'Employees → “New employee” → “Import list”.', gate('ansatte', 2)),
      s({ nb: 'Timer', en: 'Hours' }, 'Timer / arbeid per ansatt → Timerapport → «Importer timer».', 'Hours / work per employee → Hour report → “Import hours”.', gate('arbeid.timerapport', 1)),
      s({ nb: 'Fakturaer', en: 'Invoices' }, 'Økonomi → Faktura → «Importer Excel».', 'Finance → Invoices → “Import Excel”.', gate('okonomi.faktura', 4)),
      s({ nb: 'Utlegg og produktsalg', en: 'Expenses and product sales' }, 'Økonomi → Utlegg → «Importer fra fil». Produktsalg → «Importer».', 'Finance → Expenses → “Import from file”. Product sales → “Import”.', gate('okonomi.utlegg', 4)),
      s({ nb: 'Kontroller', en: 'Check' }, 'Se over forhåndsvisningen. Duplikater hoppes over.', 'Review the preview. Duplicates are skipped.'),
    ],
    keywords: ['import', 'importere', 'excel', 'csv', 'flytte', 'migrere', 'overføre', 'fil'],
  }),
  topic({
    id: 'topic.export',
    title: tx('Eksport og utskrift', 'Export and printing'),
    summary: tx(
      'De fleste lister kan eksporteres: timer (CSV), kjørebok, produktkatalog, CV (PDF/Word), skjema (PDF) og fakturaer (EHF).',
      'Most lists can be exported: hours (CSV), mileage log, product catalogue, CVs (PDF/Word), forms (PDF) and invoices (EHF).',
    ),
    steps: [
      s({ nb: 'Timer', en: 'Hours' }, 'Timer / arbeid per ansatt → Timeliste → «Eksporter CSV» eller «Skriv ut utvalg».', 'Hours / work per employee → Timesheet → “Export CSV” or “Print selection”.', need('hours', 'see')),
      s({ nb: 'Kjørebok', en: 'Mileage' }, 'Kjørebok → «Eksporter kjørebok».', 'Mileage log → “Export mileage log”.', gate('okonomi.kjorebok', 3)),
      s({ nb: 'Faktura', en: 'Invoice' }, 'Faktura → «Last ned EHF (Peppol BIS 3.0)».', 'Invoices → “Download EHF (Peppol BIS 3.0)”.', gate('okonomi.faktura', 2)),
    ],
    keywords: ['eksport', 'eksportere', 'csv', 'pdf', 'skrive ut', 'utskrift', 'ehf', 'last ned'],
  }),
  topic({
    id: 'topic.viewas',
    title: tx('Se appen som en annen bruker', 'See the app as another user'),
    summary: tx(
      '«Vis som» øverst viser moduler og rettigheter slik en valgt ansatt ser dem — nyttig når du setter opp tilgang.',
      '“View as” at the top shows modules and permissions as a chosen employee sees them — useful when setting up access.',
    ),
    steps: [
      s({ nb: 'Vis som', en: 'View as' }, 'Trykk øyet («Vis som») øverst og velg en ansatt.', 'Tap the eye (“View as”) at the top and pick an employee.', need('viewAs', 'see')),
      s({ nb: 'Tilbake', en: 'Back' }, '«Tilbakestill visning» går tilbake til deg selv.', '“Reset view” goes back to yourself.'),
    ],
    nav: { tab: 'selskap', subView: 'tilgang' },
    page: 'selskap.tilgang',
    keywords: ['vis som', 'se som', 'view as', 'tilgang', 'rettigheter', 'teste'],
  }),
  topic({
    id: 'topic.locked',
    title: tx('En modul er låst eller mangler', 'A module is locked or missing'),
    summary: tx(
      'Ser du en lås, er modulen slått av for bedriften eller du mangler tilgang. Administrator åpner den i Modulinnstillinger eller Tilgangsstyring.',
      'If you see a lock, the module is turned off for the company or you lack access. An administrator opens it in Module settings or Access control.',
    ),
    steps: [
      s({ nb: 'Slått av for bedriften', en: 'Turned off for the company' }, 'Administrator: Bedriftsinnstillinger → Modulinnstillinger → slå på og lagre.', 'Admin: Company settings → Module settings → turn on and save.', need('moduleSettings', 'write')),
      s({ nb: 'Mangler tilgang', en: 'No access' }, 'Administrator: Bedriftsinnstillinger → Tilgangsstyring → flytt deg til riktig nivå.', 'Admin: Company settings → Access control → move you to the right level.', need('accessControl', 'write')),
      s({ nb: 'Personlige moduler', en: 'Personal modules' }, 'Kalender, E-post, Oppgaver og Notat aktiverer du selv første gang du åpner dem.', 'Calendar, Mail, Tasks and Notes you enable yourself the first time you open them.'),
    ],
    nav: { tab: 'selskap', subView: 'moduler' },
    page: 'selskap.moduler',
    keywords: ['låst', 'lås', 'mangler', 'ser ikke', 'finner ikke', 'tilgang', 'deaktivert', 'borte'],
  }),
  topic({
    id: 'topic.security',
    title: tx('Sikkerhet og personvern', 'Security and privacy'),
    summary: tx(
      'ProTop bygger på Google Firebase, og skyfunksjonene kjører i EU (europe-west1). Hver bedrift ser bare sine egne data, og tilgang styres per ansatt.',
      'ProTop runs on Google Firebase, and the cloud functions run in the EU (europe-west1). Each company only sees its own data, and access is controlled per employee.',
    ),
    steps: [
      s({ nb: 'Personvern', en: 'Privacy' }, 'Konto → Personvern har personvernerklæringen og vilkårene.', 'Account → Privacy has the privacy policy and terms.'),
      s({ nb: 'Tilgang', en: 'Access' }, 'Bedriften styrer hvem som ser hva under Tilgangsstyring.', 'The company controls who sees what under Access control.'),
    ],
    nav: { tab: 'more', subView: 'legal' },
    keywords: ['sikkerhet', 'personvern', 'gdpr', 'data', 'trygt', 'lagret', 'security', 'privacy'],
  }),
  topic({
    id: 'topic.support',
    title: tx('Få hjelp fra et menneske', 'Get help from a person'),
    summary: tx(
      'Assistenten kan lage en supportsak med samtalen din. Du får saksnummer og svar i Hjelp & support → Mine henvendelser.',
      'The assistant can create a support case with your conversation. You get a case number and replies in Help & support → My requests.',
    ),
    steps: [
      s({ nb: 'Be om support', en: 'Ask for support' }, 'Trykk «Kontakt support» i chatten eller i Hjelp & support.', 'Tap “Contact support” in the chat or in Help & support.'),
      s({ nb: 'Beskriv', en: 'Describe' }, 'Skriv hva du prøvde og hva som skjedde. Legg gjerne ved skjermbilde.', 'Write what you tried and what happened. Attach a screenshot if you can.'),
      s({ nb: 'Følg saken', en: 'Follow the case' }, 'Svar kommer under Mine henvendelser.', 'Replies arrive under My requests.'),
    ],
    nav: { tab: 'more', subView: 'help' },
    keywords: ['support', 'menneske', 'kundeservice', 'kontakt', 'sak', 'hjelp', 'ringe', 'e-post support', 'brukerstøtte'],
  }),
];

/** Konkurrenter assistenten aldri anbefaler — den viser heller hvordan det gjøres i ProTop. */
export const COMPETITOR_NAMES = [
  'tripletex', 'fiken', 'visma', 'poweroffice', 'uni economy', 'xledger', 'conta',
  'smartdok', 'procore', 'fieldwire', 'cordel', 'boligmappa pro', 'ditio', 'kvalitetskontroll.no',
  'landax', 'kuba', 'monday', 'asana',
  'trello', 'jira', 'clickup', 'notion', 'planday', 'quinyx', 'tamigo', 'simployer', 'sympa',
  'workday', 'hr manager', 'congrid', 'dalux', 'bimsync', 'catenda', 'microsoft project',
];

/** Tema assistenten ikke svarer på (ikke ProTop). */
export const OFF_TOPIC_PATTERNS = [
  /\b(vær(et|meldingen)?|weather|regn i morgen)\b/i,
  /\b(oppskrift|recipe|middag i dag|kake)\b/i,
  /\b(fotball|football|sport|kamp(en)? i (kveld|dag))\b/i,
  /\b(aksje(r|kurs)?|stock|krypto|bitcoin)\b/i,
  /\b(vits|joke|dikt|poem|sang|song|eventyr)\b/i,
  /\b(politikk|valget|politics|religion)\b/i,
  /\b(lekser|homework|matteoppgave)\b/i,
  /\b(diagnose|medisin|symptom|lege sier)\b/i,
  /\b(skriv (en|et) (stil|essay|søknad|kode)|write (an? )?(essay|code|poem))\b/i,
  /\b(hvem (er|var) (presidenten|statsministeren)|capital of)\b/i,
];
