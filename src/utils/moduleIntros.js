/**
 * First-visit intro ads for every ProTop module.
 * Copy is sales-first (why it matters), then a short “how to start” guide.
 * Norwegian is the source language; English is the fallback for other langs.
 */

import { buildTourSteps } from './helpLayout.js';

export const tx = (nb, en) => ({ nb, en });

function intro({
  icon, accent, soft, hero = null, title, kicker, pitch, steps,
}) {
  return { icon, accent, soft, hero, title, kicker, pitch, steps };
}

export function pickIntroText(value, lang = 'nb') {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (value[lang]) return value[lang];
  if ((lang === 'da' || lang === 'sv') && value.nb) return value.nb;
  return value.en || value.nb || '';
}

export function introStorageKey(scope, moduleId) {
  return `${String(scope || 'family')}.${String(moduleId || '')}`;
}

export const MODULE_INTRO_SEEN_PREFIX = 'weekplan.moduleIntro.seen.v1';

const BLUE = '#2563eb';
const BLUE_SOFT = '#dbeafe';
const TEAL = '#0f766e';
const TEAL_SOFT = '#ccfbf1';
const AMBER = '#d97706';
const AMBER_SOFT = '#fef3c7';
const PINK = '#db2777';
const PINK_SOFT = '#fce7f3';
const VIOLET = '#7c3aed';
const VIOLET_SOFT = '#ede9fe';
const ORANGE = '#ea580c';
const ORANGE_SOFT = '#ffedd5';
const SKY = '#0284c7';
const SKY_SOFT = '#e0f2fe';
const ROSE = '#e11d48';
const ROSE_SOFT = '#ffe4e6';
const SLATE = '#334155';
const SLATE_SOFT = '#e2e8f0';
const GREEN = '#15803d';
const GREEN_SOFT = '#dcfce7';
const INDIGO = '#4f46e5';
const INDIGO_SOFT = '#e0e7ff';

function membersCopy(whoNb, whoEn) {
  return intro({
    icon: 'people',
    accent: BLUE,
    soft: BLUE_SOFT,
    title: tx(`Alle ${whoNb} synlig — uten rot i hodet`, `Every ${whoEn} in view — nothing lost in someone’s head`),
    kicker: tx('Folk først', 'People first'),
    pitch: tx(
      `Se hvem som er med, hvem som mangler og hvem som venter. Invitasjoner og godkjenninger på ett sted — mindre mas, mer oversikt.`,
      `See who’s in, who’s missing and who’s waiting. Invites and approvals in one place — less chasing, more overview.`,
    ),
    steps: [
      tx('Bla i listen for å se alle profiler', 'Scroll the list to see every profile'),
      tx('Trykk Inviter (øverst) for å sende kode eller e-post', 'Tap Invite (top) to send a code or email'),
      tx('Nye medlemmer dukker opp her når de godtas', 'New members appear here once they are accepted'),
    ],
  });
}

function inviteCopy(codeNb, codeEn, joinNb, joinEn) {
  return intro({
    icon: 'key',
    accent: AMBER,
    soft: AMBER_SOFT,
    title: tx(`${codeNb} som vokser gruppa på minutter`, `${codeEn} that grows the group in minutes`),
    kicker: tx('Inviter. Voks. Ferdig.', 'Invite. Grow. Done.'),
    pitch: tx(
      `Del koden — folk blir med uten app-kaos. Du styrer hvem som slipper inn. Det er den raskeste måten å få ${joinNb} i gang.`,
      `Share the code — people join without the chaos. You decide who gets in. The fastest way to get ${joinEn} moving.`,
    ),
    steps: [
      tx('Kopier koden og send den i SMS, chat eller e-post', 'Copy the code and send it by SMS, chat or email'),
      tx('Be dem åpne ProTop og taste koden', 'Ask them to open ProTop and enter the code'),
      tx('Godkjenn nye om du har slått på godkjenning', 'Approve newcomers if you turned approvals on'),
    ],
  });
}

function approvalsCopy(whoNb, whoEn) {
  return intro({
    icon: 'shield-checkmark',
    accent: GREEN,
    soft: GREEN_SOFT,
    title: tx('Du bestemmer hvem som kommer inn', 'You decide who gets in'),
    kicker: tx('Trygt. Tydelig. Ditt bord.', 'Safe. Clear. Your call.'),
    pitch: tx(
      `Ingen tilfeldige profiler i ${whoNb}. Godkjenn eller avslå med ett trykk — kontroll uten å bli en flaskehals.`,
      `No random profiles in ${whoEn}. Approve or decline in one tap — control without becoming the bottleneck.`,
    ),
    steps: [
      tx('Åpne en forespørsel i listen', 'Open a request in the list'),
      tx('Trykk Godkjenn eller Avslå', 'Tap Approve or Decline'),
      tx('Ferdig — personen får beskjed med en gang', 'Done — they get notified right away'),
    ],
  });
}

function moreHubCopy(placeNb, placeEn, examplesNb, examplesEn) {
  return intro({
    icon: 'grid',
    accent: BLUE,
    soft: BLUE_SOFT,
    title: tx(`Her bor superkreftene til ${placeNb}`, `This is where ${placeEn} superpowers live`),
    kicker: tx('Utforsk. Trykk. Bli nysgjerrig.', 'Explore. Tap. Get curious.'),
    pitch: tx(
      `${examplesNb} — alt samlet. Åpne én app, så viser vi deg hva den kan. Det tar 20 sekunder å bli hekta.`,
      `${examplesEn} — all in one place. Open any app and we’ll show you what it can do. Twenty seconds to get hooked.`,
    ),
    steps: [
      tx('Trykk på en app i listen', 'Tap an app in the list'),
      tx('Les den korte introen — så er du i gang', 'Read the short intro — then you’re off'),
      tx('Kom tilbake hit når du vil prøve neste', 'Come back here when you want to try the next one'),
    ],
  });
}

function groupsListCopy(kindNb, kindEn) {
  return intro({
    icon: 'grid',
    accent: SLATE,
    soft: SLATE_SOFT,
    title: tx(`Bytt ${kindNb} uten å miste tråden`, `Switch ${kindEn} without losing the thread`),
    kicker: tx('Flere rom. Én app.', 'More rooms. One app.'),
    pitch: tx(
      `Alt du er med i, samlet. Hopp mellom ${kindNb} på sekunder — samme innlogging, samme flyt.`,
      `Everything you belong to, in one list. Jump between ${kindEn} in seconds — same login, same flow.`,
    ),
    steps: [
      tx(`Trykk på en ${kindNb} for å åpne den`, `Tap a ${kindEn} to open it`),
      tx('Bruk menyen øverst om du vil opprette eller bli med', 'Use the top menu to create or join another'),
      tx('Aktivt rom vises i toppen neste gang', 'The active room shows at the top next time'),
    ],
  });
}

function wallCopy(audienceNb, audienceEn) {
  return intro({
    icon: 'newspaper',
    accent: GREEN,
    soft: GREEN_SOFT,
    title: tx('Nyheter som faktisk blir lest', 'News people actually read'),
    kicker: tx('Synlig. Delt. Levende.', 'Visible. Shared. Alive.'),
    pitch: tx(
      `Slutt å miste beskjeder i 17 chatter. Én vegg for ${audienceNb} — bilder, oppdateringer og det som skjer nå.`,
      `Stop losing notes across 17 chats. One wall for ${audienceEn} — photos, updates and what’s happening now.`,
    ),
    steps: [
      tx('Trykk + for å legge ut et innlegg', 'Tap + to post'),
      tx('Skriv kort — gjerne med bilde', 'Keep it short — a photo helps'),
      tx('Følg veggen for å se hva som er nytt', 'Check the wall to see what’s new'),
    ],
  });
}

function chatCopy(whoNb, whoEn) {
  return intro({
    icon: 'chatbubbles',
    accent: BLUE,
    soft: BLUE_SOFT,
    hero: 'chat',
    title: tx(`Prat der ${whoNb} allerede er`, `Chat where ${whoEn} already is`),
    kicker: tx('Meldinger som hører hjemme her', 'Messages that belong here'),
    pitch: tx(
      `Ikke nok en app å sjekke. Familieprat, direktemeldinger og felles beskjeder — samlet, trygt og uten støy fra resten av verden.`,
      `Not another app to check. Group chat, DMs and shared notes — together, safe, and free of the rest of the world’s noise.`,
    ),
    steps: [
      tx(`Trykk på ${whoNb} for felles prat, eller en person for DM`, `Tap ${whoEn} for shared chat, or a person for a DM`),
      tx('Skriv og send — alle i tråden ser det med en gang', 'Type and send — everyone in the thread sees it instantly'),
      tx('Uleste vises som merke på ikonet', 'Unread shows as a badge on the icon'),
    ],
  });
}

function calendarCopy(labelNb, labelEn, examplesNb, examplesEn) {
  return intro({
    icon: 'calendar',
    accent: BLUE,
    soft: BLUE_SOFT,
    title: tx(`Én ${labelNb}. Null «hva skjer i morgen?»`, `One ${labelEn}. Zero “what’s tomorrow?”`),
    kicker: tx('Tiden, samlet.', 'Time, gathered.'),
    pitch: tx(
      `${examplesNb} på én tidslinje alle ser. Mindre koordinering i hodet — mer overskudd når det gjelder.`,
      `${examplesEn} on one timeline everyone sees. Less coordinating in your head — more energy when it counts.`,
    ),
    steps: [
      tx('Trykk + øverst for å legge inn en hendelse', 'Tap + at the top to add an event'),
      tx('Velg hvem det gjelder — de ser det med en gang', 'Pick who it applies to — they see it immediately'),
      tx('Sveip uka for å se hva som kommer', 'Swipe the week to see what’s coming'),
    ],
  });
}

/** All first-visit intros, keyed as `scope.moduleId`. */
export const MODULE_INTROS = {
  /* ───────── Family ───────── */
  'family.home': intro({
    icon: 'home',
    accent: BLUE,
    soft: BLUE_SOFT,
    hero: 'home',
    title: tx('Hjemmet der uka blir oversiktlig', 'Home — where the week becomes clear'),
    kicker: tx('Start her. Hver dag.', 'Start here. Every day.'),
    pitch: tx(
      'Hilsen, vær, klokke og dagens plan på ett brett. Trykk et kort for å åpne appen. Bildet øverst bytter du med knappen på toppbildet.',
      'Greeting, weather, clock and today’s plan on one board. Tap a card to open the app. Change the heading image with the button on the banner.',
    ),
    steps: [
      {
        nb: 'Trykk et kort — dagens plan, oppgaver eller familie — for å åpne appen',
        en: 'Tap a card — today’s plan, tasks or family — to open the app',
        anchor: 'timeline',
        where: tx('Fremhevet: kortene på hjem', 'Highlighted: the home cards'),
        variants: [
          {
            when: { isDesktop: true },
            nb: 'Trykk en app i menyen til venstre — eller et kort på hjem',
            en: 'Tap an app in the left menu — or a card on home',
            anchor: 'rail',
            where: tx('Fremhevet: menyen til venstre', 'Highlighted: the left menu'),
          },
        ],
      },
      {
        nb: 'Trykk bildet øverst på toppbildet for å bytte heading-bilde',
        en: 'Tap the image button on the banner to change the heading photo',
        anchor: 'edit',
        where: tx('Fremhevet: knappen på toppbildet', 'Highlighted: the button on the banner'),
        variants: [
          {
            when: { asChild: true },
            nb: 'Foresatte styrer hvilke apper du får. Bildet øverst kan du bytte selv',
            en: 'Grown-ups control which apps you get. You can still change the heading photo',
            anchor: 'edit',
            where: tx('Fremhevet: knappen på toppbildet', 'Highlighted: the button on the banner'),
          },
        ],
      },
      {
        nb: 'Bytt fane nederst for apper du bruker ofte',
        en: 'Switch the bottom tab for apps you use often',
        anchor: 'tabs',
        where: tx('Fremhevet: bunnnavigasjonen', 'Highlighted: the bottom navigation'),
        variants: [
          {
            when: { isDesktop: true },
            nb: 'Alle apper ligger i menyen til venstre',
            en: 'All apps live in the left menu',
            anchor: 'rail',
            where: tx('Fremhevet: menyen til venstre', 'Highlighted: the left menu'),
          },
          {
            when: { asChild: true },
            nb: 'Oppgaver, skole og neste ligger som kort på hjem — trykk for å åpne',
            en: 'Tasks, school and next sit as cards on home — tap to open',
            anchor: 'timeline',
            where: tx('Fremhevet: kortene på hjem', 'Highlighted: the home cards'),
          },
          {
            when: { hasBottomNav: false },
            nb: 'Åpne Mer for alle apper som ikke ligger som kort på hjem',
            en: 'Open More for every app that is not already a card on home',
            anchor: 'content',
            where: tx('Fremhevet: hjem-kortene', 'Highlighted: the home cards'),
          },
        ],
      },
    ],
  }),
  'family.chat': chatCopy('familien', 'the family'),
  'family.plan': intro({
    icon: 'calendar',
    accent: BLUE,
    soft: BLUE_SOFT,
    title: tx('Uka alle faktisk følger', 'The week everyone actually follows'),
    kicker: tx('Kalender som selger ro.', 'A calendar that sells calm.'),
    pitch: tx(
      'Henting, trening, bursdager og middag — én tidslinje. Slutt å være familiens hemmelige kalender. La appen gjøre jobben.',
      'Pickups, practice, birthdays and dinner — one timeline. Stop being the family’s secret calendar. Let the app do the work.',
    ),
    steps: [
      tx('Trykk Ny hendelse øverst til høyre', 'Tap New event at the top right'),
      tx('Velg hvem det gjelder — resten ser det med en gang', 'Choose who it applies to — the rest see it instantly'),
      tx('Koble Outlook i innstillinger om du vil ha jobb og hjem i samme uke', 'Connect Outlook in settings to mix work and home in one week'),
    ],
  }),
  'family.mail': intro({
    icon: 'mail',
    accent: BLUE,
    soft: BLUE_SOFT,
    title: tx('E-post der familien allerede planlegger', 'Mail where the family already plans'),
    kicker: tx('Outlook, uten å forlate uka.', 'Outlook, without leaving the week.'),
    pitch: tx(
      'Skole, lag og fakturaer treffer innboksen — ikke et annet vindu. Koble Microsoft og svar der du allerede styrer hverdagen.',
      'School, clubs and invoices land in the inbox — not another window. Connect Microsoft and reply where you already run the week.',
    ),
    steps: [
      tx('Åpne en melding for å lese, svare eller videresende', 'Open a message to read, reply or forward'),
      tx('Bruk + øverst for å skrive ny e-post', 'Use + at the top to write a new email'),
      tx('Koble Outlook i Innstillinger første gang — tannhjulet ved mappene', 'Connect Outlook in Settings the first time — the cog by the folders'),
    ],
  }),
  'family.stars': intro({
    icon: 'checkbox',
    accent: BLUE,
    soft: BLUE_SOFT,
    hero: 'tasks',
    title: tx('Oppgaver som blir gjort — ikke glemt', 'Tasks that get done — not forgotten'),
    kicker: tx('Fra «husker du?» til ferdig.', 'From “did you remember?” to done.'),
    pitch: tx(
      'Gi jobben et navn, en frist og en stjerne. Barna krysser av. Dere ser fremgang. Hverdagen blir et lag, ikke et mas.',
      'Give the job a name, a deadline and a star. Kids check them off. You see progress. The week becomes a team, not a nag.',
    ),
    steps: [
      tx('Trykk + for å lage en oppgave', 'Tap + to create a task'),
      tx('Sett hvem, når og belønning', 'Set who, when and the reward'),
      tx('Kryss av når det er gjort — stjernene tickes inn', 'Check it off when it’s done — stars roll in'),
    ],
  }),
  'family.notes': intro({
    icon: 'document-text',
    accent: ORANGE,
    soft: ORANGE_SOFT,
    hero: 'notes',
    title: tx('Notater som overlever kjøleskapet', 'Notes that outlive the fridge door'),
    kicker: tx('Skriv. Ta opp. Del.', 'Write. Record. Share.'),
    pitch: tx(
      'Beskjeder, lister og stemme — samlet for familien. Mindre lapper som forsvinner, mer som faktisk blir lest.',
      'Messages, lists and voice — gathered for the family. Fewer vanishing scraps, more that actually gets read.',
    ),
    steps: [
      tx('Åpne et notat, eller trykk + for et nytt', 'Open a note, or tap + for a new one'),
      tx('Skriv, eller ta opp med mikrofonen', 'Type, or record with the mic'),
      tx('Del med familien så alle ser det samme', 'Share with the family so everyone sees the same thing'),
    ],
  }),
  'family.chores': intro({
    icon: 'star',
    accent: AMBER,
    soft: AMBER_SOFT,
    hero: 'chores',
    title: tx('Gjøremål barna faktisk vil krysse av', 'Chores kids actually want to check off'),
    kicker: tx('Stjerner. Mestring. Smil.', 'Stars. Mastery. Smiles.'),
    pitch: tx(
      'Rommet, oppvasken, hunden — gjort om til et spill de forstår. Dere slipper maset. De ser at innsats teller.',
      'The room, the dishes, the dog — turned into a game they get. You drop the nagging. They see that effort counts.',
    ),
    steps: [
      tx('Åpne et gjøremål for å se hva som skal gjøres', 'Open a chore to see what’s expected'),
      tx('Trykk avkrysningen når du er ferdig', 'Tap the checkbox when you’re done'),
      tx('Se stjernene samle seg mot et mål med bilde og lenke', 'Watch the stars add up toward a goal with a picture and a link'),
    ],
  }),
  'family.more': moreHubCopy('familien', 'the family', 'Handleliste, måltider, spill, kart og mer', 'Shopping, meals, games, maps and more'),
  'family.shop': intro({
    icon: 'cart',
    accent: BLUE,
    soft: BLUE_SOFT,
    hero: 'shop',
    title: tx('Handlelisten som tømmer hodet', 'The list that empties your head'),
    kicker: tx('Kjøp det dere trenger. Ingenting mer.', 'Buy what you need. Nothing extra.'),
    pitch: tx(
      'Melk, teip og bursdagspresang — skrevet der alle kan legge til. Butikken tar kortere tid. Dere glemmer færre ting. Det merkes på kvitteringen.',
      'Milk, tape and the birthday gift — written where everyone can add. The shop takes less time. You forget fewer things. It shows on the receipt.',
    ),
    steps: [
      tx('Åpne en liste, eller trykk + for en ny', 'Open a list, or tap + for a new one'),
      tx('Skriv varen og trykk Enter — andre ser den med en gang', 'Type the item and hit Enter — others see it instantly'),
      tx('Kryss av i butikken etter hvert som det går i posen', 'Check items off as they go in the bag'),
    ],
  }),
  'family.wishes': intro({
    icon: 'gift',
    accent: PINK,
    soft: PINK_SOFT,
    hero: 'family',
    title: tx('Ønskelister som treffer — hver gang', 'Wish lists that hit — every time'),
    kicker: tx('Gaver uten gjetting.', 'Gifts without guessing.'),
    pitch: tx(
      'Bursdag, jul, «jeg vil ha». Hele familien samler ønskene. Dere handler treffsikkert. Mindre retur, mer glede — og mer «du skjønte meg».',
      'Birthday, Christmas, “I want this”. The whole family collects the wishes. You shop with aim. Fewer returns, more joy — and more “you got me”.',
    ),
    steps: [
      {
        nb: 'Åpne en liste eller lag en ny med +',
        en: 'Open a list or create one with +',
        anchor: 'content',
        scene: 'hub',
        where: tx('Trykk en liste — eller + øverst for en ny', 'Tap a list — or + at the top for a new one'),
      },
      {
        nb: 'Legg inn ønske — gjerne med lenke eller bilde',
        en: 'Add a wish — a link or photo helps',
        anchor: 'input',
        scene: 'inner',
      },
      {
        nb: 'Del listen når du er ferdig. Eieren ser ikke hvem som reserverer eller kjøper',
        en: 'Share the list when it’s ready. The owner doesn’t see who reserved or bought',
        anchor: 'content',
        scene: 'inner',
      },
    ],
  }),
  'family.books': intro({
    icon: 'library',
    accent: VIOLET,
    soft: VIOLET_SOFT,
    title: tx('Bokhylla som gjør lesing synlig', 'A bookshelf that makes reading visible'),
    kicker: tx('Sider. Stjerner. Historier.', 'Pages. Stars. Stories.'),
    pitch: tx(
      'Hvilken bok, hvor langt, hvem leser. En liten hyllest til vanen som gjør skolen lettere — og kvelden roligere.',
      'Which book, how far, who’s reading. A small tribute to the habit that makes school easier — and evenings calmer.',
    ),
    steps: [
      tx('Åpne en bok, eller trykk + for en ny', 'Open a book, or tap + for a new one'),
      tx('Logg sider og gi terningkast', 'Log pages and rate it'),
      tx('Se hylla fylle seg — det smitter', 'Watch the shelf fill up — it’s contagious'),
    ],
  }),
  'family.lekser': intro({
    icon: 'book',
    accent: INDIGO,
    soft: INDIGO_SOFT,
    title: tx('Lekser uten søndagsstress', 'Homework without Sunday panic'),
    kicker: tx('Uka, ikke krisen.', 'The week, not the crisis.'),
    pitch: tx(
      'Se hva som skal gjøres, kryss av og bli ferdig før kvelden koker. Foresatte ser fremgang. Barna slipper «har du husket».',
      'See what’s due, check it off and finish before the evening boils over. Grown-ups see progress. Kids skip the “did you remember”.',
    ),
    steps: [
      tx('Se ukas lekser i listen', 'See this week’s homework in the list'),
      tx('Trykk en lekse for detaljer, eller kryss av når den er gjort', 'Tap a task for details, or check it off when done'),
      tx('Foresatte kan legge inn mer fra Oppgaver', 'Grown-ups can add more from Tasks'),
    ],
  }),
  'family.leksehjelp': intro({
    icon: 'school',
    accent: INDIGO,
    soft: INDIGO_SOFT,
    title: tx('Hjelp til ekte lekser — ikke spill', 'Help for real homework — not a game'),
    kicker: tx('Steg for steg. Hint først.', 'Step by step. Hints first.'),
    pitch: tx(
      'Sitt fast i leksen? Ta bilde eller skriv oppgaven. Assistenten gir hint og spørsmål — ikke fasit først. Vil du øve med spill, bruk Lær skole.',
      'Stuck on homework? Snap or type the task. The assistant hints and asks — not the answer first. Want game practice? Open Learn school.',
    ),
    steps: [
      tx('Sveip fag-sideslides, eller lim inn oppgaven direkte', 'Swipe subject slides, or paste the task directly'),
      tx('Ta bilde av leksen hvis du vil', 'Snap the homework if you like'),
      tx('Følg hintene — kryss av når du skjønner', 'Follow the hints — check off as it clicks'),
    ],
  }),
  'family.mattehjelp': intro({
    icon: 'rocket',
    accent: INDIGO,
    soft: INDIGO_SOFT,
    title: tx('Lær skole — øv med spill og stjerner', 'Learn school — practice with games and stars'),
    kicker: tx('Frivillig trening. Egen fra leksehjelp.', 'Optional practice. Separate from homework help.'),
    pitch: tx(
      'Velg verden etter alder, spill mini-spill eller ta dagens oppdrag. AI-losen gir hint først. Dette er øving — Leksehjelpen er for ekte lekser.',
      'Pick an age world, play mini-games or take today’s mission. The AI guide hints first. This is practice — Homework help is for real homework.',
    ),
    steps: [
      tx('Velg Småtroll, Oppdagere, Mestring eller Utfordring', 'Pick Småtroll, Explorers, Mastery or Challenge'),
      tx('Start Lek & spill, Dagens oppdrag eller AI-losen', 'Start Play, Daily mission or AI guide'),
      tx('Samle stjerner — og prøv selv før du ber om fasit', 'Collect stars — and try yourself before asking for answers'),
    ],
  }),
  'family.klassen': intro({
    icon: 'people',
    accent: INDIGO,
    soft: INDIGO_SOFT,
    title: tx('Klassen samlet på ett sted', 'The class, all in one place'),
    kicker: tx('Skole, liste, møter, meldinger.', 'School, roster, meetings, messages.'),
    pitch: tx(
      'Opprett klassen med skole på kartet. Last opp klasselisten fra ark — AI tolker elever, foresatte og lærere. Foreldremøter og chat følger med.',
      'Create the class with the school on the map. Upload the paper class list — AI reads pupils, guardians and teachers. Meetings and chat included.',
    ),
    steps: [
      tx('Opprett klasse med skolenavn og sted', 'Create a class with school name and place'),
      tx('Last opp klasseliste (bilde/fil) under Klasseliste', 'Upload the class list (photo/file) under Class list'),
      tx('Last opp møtereferat eller åpne meldinger', 'Upload meeting notes or open messages'),
    ],
  }),
  'family.settings': intro({
    icon: 'settings',
    accent: SLATE,
    soft: SLATE_SOFT,
    title: tx('Still inn familien slik dere vil ha den', 'Set the family up the way you want it'),
    kicker: tx('Ditt hus. Dine regler.', 'Your house. Your rules.'),
    pitch: tx(
      'Språk, varsler, profiler og hva barna får se. Små valg som gjør appen til deres — ikke en ferdig mal.',
      'Language, alerts, profiles and what kids can see. Small choices that make the app yours — not a stock template.',
    ),
    steps: [
      tx('Bla og åpne det du vil endre', 'Scroll and open what you want to change'),
      tx('Lagre — endringen gjelder med en gang', 'Save — the change applies immediately'),
      tx('Apper og tilganger for barn finner du på barnets profil', 'Kids’ app access lives on the child’s profile'),
    ],
  }),
  'family.childApps': intro({
    icon: 'apps',
    accent: BLUE,
    soft: BLUE_SOFT,
    title: tx('Du styrer hva barna ser', 'You control what kids see'),
    kicker: tx('Frihet med rammer.', 'Freedom with a fence.'),
    pitch: tx(
      'Slå av spill, slå på lekser. Én bryter per app. Barna får en enklere flate — dere beholder roen.',
      'Turn games off, homework on. One switch per app. Kids get a simpler home — you keep the calm.',
    ),
    steps: [
      tx('Finn appen i listen', 'Find the app in the list'),
      tx('Slå bryteren av eller på', 'Flip the switch off or on'),
      tx('Barnets hjem oppdateres med en gang', 'The child’s home updates immediately'),
    ],
  }),
  'family.activities': intro({
    icon: 'fitness',
    accent: ROSE,
    soft: ROSE_SOFT,
    title: tx('Trening og tur — loggført uten Strava-støy', 'Training and trails — logged without the noise'),
    kicker: tx('Bevegelse som blir sett.', 'Movement that gets seen.'),
    pitch: tx(
      'Løpetur, styrke, familiens søndagstur. Samle aktivitetene, koble Strava om du vil, og la innsatsen synes — også for de hjemme.',
      'Runs, strength, the Sunday walk. Gather the activities, connect Strava if you like, and let the effort show — also for those at home.',
    ),
    steps: [
      tx('Trykk + for å logge en økt, eller koble Strava', 'Tap + to log a session, or connect Strava'),
      tx('Se familiens aktiviteter i listen', 'See the family’s activities in the list'),
      tx('Åpne en økt for kart, tid og detaljer', 'Open a session for map, time and details'),
    ],
  }),
  'family.members': membersCopy('i familien', 'in the family'),
  'family.groupSettings': intro({
    icon: 'home',
    accent: SLATE,
    soft: SLATE_SOFT,
    title: tx('Familien bak kulissene', 'The family behind the curtain'),
    kicker: tx('Navn, roller, abonnement.', 'Name, roles, plan.'),
    pitch: tx(
      'Her bor familiens innstillinger. Hold navn, medlemmer og abonnement i orden — så flyter resten av appen.',
      'This is where family settings live. Keep the name, members and plan tidy — and the rest of the app flows.',
    ),
    steps: [
      tx('Endre navn og detaljer øverst', 'Change the name and details at the top'),
      tx('Se medlemmer og roller i listen', 'See members and roles in the list'),
      tx('Lagre før du går videre', 'Save before you leave'),
    ],
  }),
  'family.location': intro({
    icon: 'navigate',
    accent: SKY,
    soft: SKY_SOFT,
    title: tx('Hvor er gjengen — uten å mase', 'Where’s the gang — without the nag'),
    kicker: tx('Trygghet som føles lett.', 'Safety that feels light.'),
    pitch: tx(
      'Se hvem som er på vei, hvem som er hjemme. Foresatte kan slå på deling — sist kjent sted vises også når appen ikke er åpen.',
      'See who’s on the way and who’s home. Shared location on the family’s terms — last known stays visible even when the app is closed.',
    ),
    steps: [
      tx('Slå på deling for deg selv eller barna', 'Turn on sharing for yourself or the kids'),
      tx('Se familiens posisjoner på kartet', 'See family positions on the map'),
      tx('Trykk en person for siste oppdatering', 'Tap a person for the last update'),
    ],
  }),
  'family.documents': intro({
    icon: 'folder-open',
    accent: SKY,
    soft: SKY_SOFT,
    title: tx('Papirene som alltid er «et sted»', 'The papers that are always “somewhere”'),
    kicker: tx('Mapper. Filer. Ferdig søkt.', 'Folders. Files. Found.'),
    pitch: tx(
      'Pass, forsikring, skolebrev. Samle det familien trenger, i mapper alle voksne finner — uten å grave i e-posten.',
      'Passports, insurance, school letters. Gather what the family needs, in folders every adult can find — no digging through email.',
    ),
    steps: [
      tx('Åpne en mappe, eller lag en ny med +', 'Open a folder, or create one with +'),
      tx('Last opp fil eller ta bilde', 'Upload a file or take a photo'),
      tx('Alt ligger trygt i familien — ikke på én telefon', 'It lives with the family — not on one phone'),
    ],
  }),
  'family.meals': intro({
    icon: 'restaurant',
    accent: SKY,
    soft: SKY_SOFT,
    hero: 'family',
    title: tx('Middag uten klokka fem-krisen', 'Dinner without the 5 p.m. panic'),
    kicker: tx('Uka smaker bedre ferdigplanlagt.', 'The week tastes better pre-planned.'),
    pitch: tx(
      'Hva spiser vi? Endelig et svar. Norske oppskrifter, ukeplan og handleliste i samme flyt. Mindre takeaway. Mer «det var godt».',
      'What’s for dinner? Finally an answer. Norwegian recipes, a week plan and the shopping list in one flow. Less takeaway. More “that was good”.',
    ),
    steps: [
      {
        nb: 'Trykk en tom rute i ukeplanen',
        en: 'Tap an empty slot in the week plan',
        anchor: 'content',
        scene: 'hub',
        where: tx('Se den markerte uken — trykk en ledig dag', 'See the highlighted week — tap an empty day'),
      },
      {
        nb: 'Velg en oppskrift — eller lag din egen',
        en: 'Pick a recipe — or create your own',
        anchor: 'content',
        scene: 'inner',
      },
      {
        nb: 'Send ingrediensene til handlelisten med ett trykk',
        en: 'Send ingredients to the shopping list in one tap',
        anchor: 'content',
        scene: 'inner',
      },
    ],
  }),
  'family.matcoach': intro({
    icon: 'nutrition',
    accent: SKY,
    soft: SKY_SOFT,
    hero: 'family',
    title: tx('Ukeplanen lager seg selv', 'The weekly plan makes itself'),
    kicker: tx('AI Matcoach for hele familien.', 'AI food coach for the whole family.'),
    pitch: tx(
      'Få en familietilpasset middagsuke med forklaring, matpakker og handleliste. Allergier, tid og budsjett styrer forslagene. Oppdater lageret med AI-skanner under Lager.',
      'Get a family-fit dinner week with reasons, lunchboxes and shopping list. Allergies, time and budget steer the suggestions. Update stock with the AI scanner under Pantry.',
    ),
    steps: [
      {
        nb: 'Trykk Familie-fanen for å sette preferanser',
        en: 'Tap the Family tab to set preferences',
        anchor: 'prefs',
        scene: 'hub',
        where: tx(
          'Se den markerte fanen — trykk der for å fortsette',
          'See the highlighted tab — tap there to continue',
        ),
      },
      {
        nb: 'Sett antall, allergier og budsjett — lagre',
        en: 'Set adults, allergies and budget — then save',
        anchor: 'content',
        scene: 'inner',
        where: tx(
          'Fyll inn det som passer familien din',
          'Fill in what fits your family',
        ),
      },
      {
        nb: 'Trykk + Ny ukeplan',
        en: 'Tap + New week plan',
        anchor: 'add',
        scene: 'hub',
        where: tx(
          'Se den markerte knappen — trykk der for å lage planen',
          'See the highlighted button — tap there to build the plan',
        ),
      },
      {
        nb: 'Bytt retter, lagre planen og åpne handlelisten',
        en: 'Swap dishes, save the plan and open the shopping list',
        anchor: 'content',
        scene: 'hub',
        where: tx(
          'Her ligger uka — bytt en rett eller registrer alt',
          'Here is the week — swap a dish or register everything',
        ),
      },
    ],
  }),
  'family.recipes': intro({
    icon: 'book',
    accent: SKY,
    soft: SKY_SOFT,
    hero: 'family',
    title: tx('Oppskriftene familien faktisk lager', 'The recipes your family actually cooks'),
    kicker: tx('Bilde. Ingredienser. Fremgangsmåte.', 'Photo. Ingredients. Method.'),
    pitch: tx(
      'Samle matretter med bilde, fremgangsmåte og lenke. Importer fra bilde eller nettside med AI, og gi favorittene stjerner så de dukker opp først i måltidsplanen.',
      'Collect dishes with photo, method and link. Import from a photo or website with AI, and star your favorites so they rise in the meal planner.',
    ),
    steps: [
      {
        nb: 'Trykk + Ny oppskrift — eller lim inn en lenke',
        en: 'Tap + New recipe — or paste a link',
        anchor: 'add',
        scene: 'hub',
        where: tx('Se den markerte knappen øverst', 'See the highlighted button at the top'),
      },
      {
        nb: 'La AI fylle ut, eller skriv selv',
        en: 'Let AI fill it in, or write it yourself',
        anchor: 'content',
        scene: 'inner',
      },
      {
        nb: 'Vurder med stjerner når retten smakte',
        en: 'Rate with stars when it tasted good',
        anchor: 'content',
        scene: 'hub',
      },
    ],
  }),
  'family.pantry': intro({
    icon: 'cube',
    accent: SKY,
    soft: SKY_SOFT,
    title: tx('Hva har vi hjemme — uten å åpne skapet', 'What’s at home — without opening the cupboard'),
    kicker: tx('Kjøl. Fryser. Tørrvare.', 'Fridge. Freezer. Pantry.'),
    pitch: tx(
      'Melk, brød og det som står i fryseren. Ta bilde — AI lager innholdslisten — eller registrer manuelt. Trekkes fra når middagen går til handlelisten. Mindre dobbeltkjøp. Mindre matsvinn.',
      'Milk, bread and what’s in the freezer. Snap a photo — AI builds the stock list — or log manually. It subtracts when dinner goes to the shopping list. Fewer double buys. Less waste.',
    ),
    steps: [
      {
        nb: 'Trykk + for AI-skanner eller én vare',
        en: 'Tap + for the AI scanner or one item',
        anchor: 'add',
        scene: 'hub',
        where: tx('Se den markerte knappen øverst', 'See the highlighted button at the top'),
      },
      {
        nb: 'Bekreft listen og velg kjøleskap, fryser eller tørrvare',
        en: 'Confirm the list and pick fridge, freezer or pantry',
        anchor: 'content',
        scene: 'inner',
      },
      {
        nb: 'Planlegg middag — lageret trekkes fra handlelisten',
        en: 'Plan dinner — stock is subtracted from the list',
        anchor: 'content',
        scene: 'hub',
      },
    ],
  }),
  'family.progress': intro({
    icon: 'stats-chart',
    accent: GREEN,
    soft: GREEN_SOFT,
    title: tx('Se at barna faktisk går fremover', 'See that the kids are actually moving'),
    kicker: tx('Fremgang som motiverer.', 'Progress that motivates.'),
    pitch: tx(
      'Stjerner, oppgaver, uke etter uke. En ærlig oversikt som feirer innsats — og viser hvor det trengs et lite dytt.',
      'Stars, tasks, week after week. An honest view that celebrates effort — and shows where a little nudge would help.',
    ),
    steps: [
      tx('Velg barn i toppen om dere er flere', 'Pick a child at the top if you have more than one'),
      tx('Se uka og stjernene i oversikten', 'See the week and stars in the overview'),
      tx('Trykk inn på en uke for detaljene', 'Tap a week for the details'),
    ],
  }),
  'family.games': intro({
    icon: 'game-controller',
    accent: INDIGO,
    soft: INDIGO_SOFT,
    hero: 'family',
    title: tx('Fem minutter som limer familien', 'Five minutes that glue the family'),
    kicker: tx('Spill. Sammen. Nå.', 'Play. Together. Now.'),
    pitch: tx(
      'Quiz, tre på rad, gjett tallet. Skjermtid som faktisk er sammen — ikke hver for seg i hver sin sofa.',
      'Quiz, noughts and crosses, guess the number. Screen time that’s actually together — not each on a sofa.',
    ),
    steps: [
      tx('Trykk et spill — les «Slik går du frem»', 'Tap a game — read “How to play”'),
      tx('Inviter familiemedlemmer — de godtar før start', 'Invite family members — they accept before start'),
      tx('Spill på telefon, nettbrett eller PC — feiring når noen vinner!', 'Play on phone, tablet or PC — celebration when someone wins!'),
    ],
  }),
  'family.quiz': intro({
    icon: 'flash',
    accent: INDIGO,
    soft: INDIGO_SOFT,
    title: tx('Familiequiz som tar stua', 'A family quiz that takes the living room'),
    kicker: tx('Inviter. Poeng. Applaus.', 'Invite. Points. Applause.'),
    pitch: tx(
      'Live spørsmål, fargerike svar, tabell som oppdateres. Vertskap på 30 sekunder. Kvelden er reddet.',
      'Live questions, colourful answers, a table that updates. Host in 30 seconds. Evening: saved.',
    ),
    steps: [
      tx('Velg en quiz og inviter familien', 'Pick a quiz and invite the family'),
      tx('De andre godtar invitasjonen og blir med', 'The others accept the invite and join'),
      tx('Kjør spørsmålene — poengene tikker inn live', 'Run the questions — points tick in live'),
    ],
  }),
  'family.scratchMap': intro({
    icon: 'earth',
    accent: SKY,
    soft: SKY_SOFT,
    title: tx('Verden dere har sett — og den dere drømmer om', 'The world you’ve seen — and the one you dream of'),
    kicker: tx('Reis. Merk. Fortell.', 'Travel. Mark. Tell.'),
    pitch: tx(
      'Marker land dere har besøkt. Planlegg neste tur. Et kart som samler familiens reiser.',
      'Mark the countries you’ve visited. Plan the next trip. A map that gathers your family’s travels.',
    ),
    steps: [
      tx('Trykk et land for å markere det', 'Tap a country to mark it'),
      tx('Klyp for å zoome, dra for å flytte kartet', 'Pinch to zoom, drag to move the map'),
      tx('Se hvor familien har vært — og hvor dere vil', 'See where you’ve been — and where you want to go'),
    ],
  }),
  'family.reiseplanlegger': intro({
    icon: 'airplane',
    accent: TEAL,
    soft: TEAL_SOFT,
    title: tx('Ferien som en tydelig rute', 'The holiday as a clear route'),
    kicker: tx('A til B. Billetter. Minner.', 'A to B. Tickets. Memories.'),
    pitch: tx(
      'Planlegg destinasjoner, inviter reisefølge og samle aktiviteter. Når reisen er i gang, tones passerte dager ned — mens neste stopp lyser frem.',
      'Plan destinations, invite companions and gather activities. Once you’re traveling, past days fade — and the next stop lights up.',
    ),
    steps: [
      tx('Opprett en reise og legg til destinasjoner', 'Create a trip and add destinations'),
      tx('Inviter familiemedlemmer som planlegger eller leser', 'Invite family as planners or readers'),
      tx('Sjekk inn underveis og lagre minner', 'Check in along the way and save memories'),
    ],
  }),
  'family.childDrawings': intro({
    icon: 'color-palette',
    accent: AMBER,
    soft: AMBER_SOFT,
    title: tx('Barnas tegninger, trygt på veggen', 'Kids’ drawings, safely on the wall'),
    kicker: tx('Tegninger. Rammer. Minner.', 'Drawings. Frames. Memories.'),
    pitch: tx(
      'Ta bilde av tegningen. Vi cropper, skalerer og henger den i en ramme over sofaen — med barn, alder, sted og dato du kan endre.',
      'Photograph the drawing. We crop, scale and hang it in a frame above the sofa — with child, age, place and date you can edit.',
    ),
    steps: [
      {
        nb: 'Trykk + for å ta bilde eller laste opp en tegning',
        en: 'Tap + to photograph or upload a drawing',
        anchor: 'add',
        scene: 'hub',
      },
      {
        nb: 'Velg ramme, farge og plassering i stua',
        en: 'Pick frame, colour and living-room placement',
        anchor: 'content',
        scene: 'inner',
      },
      {
        nb: 'Lagre barn, alder, sted og dato',
        en: 'Save child, age, place and date',
        anchor: 'content',
        scene: 'inner',
      },
    ],
  }),
  'family.albums': intro({
    icon: 'images',
    accent: SKY,
    soft: SKY_SOFT,
    hero: 'family',
    title: tx('Bevar øyeblikkene som betyr mest', 'Preserve the moments that matter most'),
    kicker: tx('Bilder. Video. Delt med familien.', 'Photos. Video. Shared with family.'),
    pitch: tx(
      'Samle bilder, videoer og album — og del minnene med familien. Private øyeblikk utenfor chat.',
      'Collect photos, videos and albums — and share memories with the family. Private moments outside chat.',
    ),
    steps: [
      {
        nb: 'Trykk + Nytt album',
        en: 'Tap + New album',
        anchor: 'add',
        scene: 'hub',
        where: tx(
          'Se den markerte knappen — trykk der for å fortsette',
          'See the highlighted button — tap there to continue',
        ),
      },
      {
        nb: 'Gi albumet et navn og velg hvem som skal se det',
        en: 'Name the album and pick who can see it',
        anchor: 'input',
        scene: 'inner',
      },
      {
        nb: 'Åpne et album for å legge til bilder og video',
        en: 'Open an album to add photos and video',
        anchor: 'content',
        scene: 'hub',
        where: tx(
          'Trykk et album i listen',
          'Tap an album in the list',
        ),
      },
    ],
  }),
  'family.wall': intro({
    icon: 'newspaper',
    accent: GREEN,
    soft: GREEN_SOFT,
    hero: 'family',
    title: tx('Familiens egen vegg', 'The family’s own wall'),
    kicker: tx('Nyheter. Bilder. Oppdateringer.', 'News. Photos. Updates.'),
    pitch: tx(
      'Del små øyeblikk og store nyheter med dem som bor under samme tak — uten støy fra sosiale medier.',
      'Share small moments and big news with those under the same roof — without social-media noise.',
    ),
    steps: [
      {
        nb: 'Bla i veggen for å se familiens innlegg',
        en: 'Scroll the wall to see the family’s posts',
        anchor: 'content',
        scene: 'hub',
      },
      {
        nb: 'Trykk + for å dele et bilde eller en oppdatering',
        en: 'Tap + to share a photo or an update',
        anchor: 'add',
        scene: 'hub',
      },
      {
        nb: 'Kommenter eller lik — alle i familien ser det',
        en: 'Comment or like — everyone in the family sees it',
        anchor: 'content',
        scene: 'hub',
      },
    ],
  }),
  'family.friends': intro({
    icon: 'people-circle',
    accent: BLUE,
    soft: BLUE_SOFT,
    hero: 'family',
    title: tx('Venner utenfor huset', 'Friends beyond the house'),
    kicker: tx('Koble. Del. Hold kontakten.', 'Connect. Share. Stay in touch.'),
    pitch: tx(
      'Legg til venner, godta forespørsler og del album eller lister — uten å blande dem inn i familien.',
      'Add friends, accept requests and share albums or lists — without mixing them into the family.',
    ),
    steps: [
      {
        nb: 'Trykk + for å legge til en venn',
        en: 'Tap + to add a friend',
        anchor: 'friends-add',
        scene: 'hub',
        where: tx(
          'Se den markerte knappen — trykk der for å fortsette',
          'See the highlighted button — tap there to continue',
        ),
        variants: [
          {
            when: { asChild: true },
            nb: 'Be en voksen om å sende venneforespørsel for deg',
            en: 'Ask a grown-up to send a friend request for you',
            anchor: 'content',
          },
        ],
      },
      {
        nb: 'Godta eller avslå forespørsler i listen',
        en: 'Accept or decline requests in the list',
        anchor: 'content',
        scene: 'hub',
      },
      {
        nb: 'Åpne en venn for å se delinger og detaljer',
        en: 'Open a friend to see shares and details',
        anchor: 'content',
        scene: 'hub',
      },
    ],
  }),
  'family.moduleAccess': intro({
    icon: 'apps',
    accent: SLATE,
    soft: SLATE_SOFT,
    title: tx('Velg hvilke apper som er på', 'Choose which apps are on'),
    kicker: tx('Aktiver. Skjul. Hold det enkelt.', 'Enable. Hide. Keep it simple.'),
    pitch: tx(
      'Skru på modulene familien trenger — og skjul resten. Mindre støy. Mer av det som faktisk brukes.',
      'Turn on the modules the family needs — and hide the rest. Less noise. More of what you actually use.',
    ),
    steps: [
      {
        nb: 'Bla i listen over tilgjengelige moduler',
        en: 'Browse the list of available modules',
        anchor: 'content',
        scene: 'hub',
      },
      {
        nb: 'Aktiver en modul for å åpne den i Mer-menyen',
        en: 'Enable a module to open it from More',
        anchor: 'content',
        scene: 'hub',
      },
      {
        nb: 'Gå tilbake til Mer for å åpne den nye appen',
        en: 'Go back to More to open the new app',
        anchor: 'tabs',
        scene: 'hub',
        variants: [
          {
            when: { isDesktop: true, hasRail: true },
            nb: 'Finn den nye appen i menyen til venstre',
            en: 'Find the new app in the left menu',
            anchor: 'rail',
          },
        ],
      },
    ],
  }),
  'family.help': intro({
    icon: 'help-buoy',
    accent: BLUE,
    soft: BLUE_SOFT,
    title: tx('Hjelp når du lurer', 'Help when you’re unsure'),
    kicker: tx('Søk. Les. Spør.', 'Search. Read. Ask.'),
    pitch: tx(
      'Artikler, nyheter og veiledning for hver modul — laget så både 12-åringen og besteforeldrene finner frem.',
      'Articles, news and guides for every module — made so both a 12-year-old and grandparents can find their way.',
    ),
    steps: [
      {
        nb: 'Søk etter det du lurer på',
        en: 'Search for what you’re wondering about',
        anchor: 'input',
        scene: 'hub',
      },
      {
        nb: 'Åpne en artikkel eller nyhet',
        en: 'Open an article or news item',
        anchor: 'content',
        scene: 'hub',
      },
      {
        nb: 'Lyspæren på hver side starter en kort veiledning',
        en: 'The lightbulb on every page starts a short guide',
        anchor: 'helpBtn',
        scene: 'hub',
      },
    ],
  }),
  'family.familyTree': intro({
    icon: 'git-network',
    accent: GREEN,
    soft: GREEN_SOFT,
    hero: 'family',
    title: tx('Slekta, tegnet så barna skjønner den', 'Kin, drawn so the kids get it'),
    kicker: tx('Røtter. Navn. Historier.', 'Roots. Names. Stories.'),
    pitch: tx(
      'Besteforeldre, søskenbarn, «hvem er det?». Bygg treet sammen. En gave til nysgjerrigheten — og til minnene som ellers blir borte.',
      'Grandparents, cousins, “who’s that?”. Build the tree together. A gift to curiosity — and to memories that otherwise fade.',
    ),
    steps: [
      tx('Trykk en person for å åpne kortet', 'Tap a person to open their card'),
      tx('Legg til foreldre, partner eller barn', 'Add parents, partner or children'),
      tx('Dra i lerretet for å se hele slekta', 'Drag the canvas to see the whole family'),
    ],
  }),
  'family.rememberDates': intro({
    icon: 'alarm',
    accent: PINK,
    soft: PINK_SOFT,
    title: tx('Aldri glem en bursdag eller merkedag', 'Never miss a birthday or special day'),
    kicker: tx('Bursdag. Jul. Nedtelling.', 'Birthday. Christmas. Countdown.'),
    pitch: tx(
      'Se bursdagene i familien og lag egne nedtellinger til jul, ferie og andre store dager. Alt samlet på ett sted.',
      'See family birthdays and add countdowns to Christmas, holidays and other big days — all in one place.',
    ),
    steps: [
      tx('Se hvem som har bursdag snart', 'See whose birthday is coming up'),
      tx('Legg til jul og andre merkedager', 'Add Christmas and other holidays'),
      tx('Lag egne nedtellinger til det som nærmer seg', 'Make your own countdowns for what’s next'),
    ],
  }),
  'family.boligmappa': intro({
    icon: 'home-outline',
    accent: SKY,
    soft: SKY_SOFT,
    title: tx('Ikke glem vedlikehold og garanti', 'Don\'t forget maintenance and warranties'),
    kicker: tx('Vedlikehold. Garanti. Papirer.', 'Maintenance. Warranty. Papers.'),
    pitch: tx(
      'Få påminnelse før garanti og service går ut, kryss av vedlikehold, og samle papirer og håndverkere på boligen.',
      'Get a reminder before warranties and service expire, check off maintenance, and keep papers and tradespeople on the home.',
    ),
    steps: [
      tx('Trykk Registrer øverst for å legge inn hjemmet med adresse', 'Tap Register at the top to add the home with its address'),
      tx('Legg inn startpakken for vedlikehold', 'Add the starter set of maintenance tasks'),
      tx('Last opp bilag — vi varsler før garantien går ut', 'Upload papers — we remind you before a warranty ends'),
    ],
  }),
  'family.holdings': intro({
    icon: 'car',
    accent: TEAL,
    soft: TEAL_SOFT,
    title: tx('Kjøretøyene — tilpasset type', 'Vehicles — tailored by type'),
    kicker: tx('Bil. Sykkel. Båt. Dokumenter.', 'Car. Bike. Boat. Documents.'),
    pitch: tx(
      'Velg type først — da får du riktige felt: drivstoff og EU for bil, rammenummer for sykkel, motortimer for båt. Last opp kvittering og kjøpsbevis.',
      'Pick the type first — then you get the right fields: fuel and EU for cars, frame number for bikes, engine hours for boats. Upload receipts and proof of purchase.',
    ),
    steps: [
      tx('Trykk Registrer kjøretøy og velg type', 'Tap Register vehicle and choose the type'),
      tx('Fyll feltene som vises for den typen', 'Fill the fields shown for that type'),
      tx('Last opp kvittering og lagre', 'Upload a receipt and save'),
    ],
  }),
  'family.hospitality': intro({
    icon: 'key',
    accent: AMBER,
    soft: AMBER_SOFT,
    title: tx('Utleie som føles som et lite hotell', 'Rentals that feel like a tiny hotel'),
    kicker: tx('Bookinger. Låser. Anmeldelser.', 'Bookings. Locks. Reviews.'),
    pitch: tx(
      'Airbnb, låskoder og automeldinger — samlet. Mindre manuell kundeservice, mer profesjonelt inntrykk, bedre drift.',
      'Airbnb, lock codes and auto-messages — in one place. Less manual guest-care, a sharper impression, smoother ops.',
    ),
    steps: [
      tx('Legg inn boligen under Boliger', 'Add the property under Properties'),
      tx('Koble kanal og Nuki under Tilkoblinger', 'Connect channel and Nuki under Connections'),
      tx('Se bookinger og automeldinger i fanene', 'See bookings and auto-messages in the tabs'),
    ],
  }),
  'family.legal': intro({
    icon: 'shield-checkmark',
    accent: SLATE,
    soft: SLATE_SOFT,
    title: tx('Åpent om data — fordi tillit selger', 'Open about data — because trust sells'),
    kicker: tx('Personvern uten fin skrift-fellen.', 'Privacy without the fine-print trap.'),
    pitch: tx(
      'Les hvordan ProTop behandler opplysninger. Kort, konkret, tilgjengelig. Dere skal vite hva dere sier ja til.',
      'Read how ProTop handles data. Short, concrete, available. You should know what you’re saying yes to.',
    ),
    steps: [
      tx('Åpne et dokument i listen', 'Open a document in the list'),
      tx('Les gjennom — det tar et par minutter', 'Read through — it takes a couple of minutes'),
      tx('Kom tilbake hit når du lurer', 'Come back here whenever you wonder'),
    ],
  }),
  'family.subscription': intro({
    icon: 'card',
    accent: BLUE,
    soft: BLUE_SOFT,
    title: tx('Full ProTop — når prøven smaker', 'Full ProTop — when the trial clicks'),
    kicker: tx('14 dager. Så 49 kr. Ingen binding.', '14 days. Then NOK 49. No lock-in.'),
    pitch: tx(
      'Kalender, oppgaver, mail og resten — uten sperrer. Prøv først. Fortsett om familien merker forskjellen. Si opp når som helst.',
      'Calendar, tasks, mail and the rest — no brakes. Try first. Stay if the family feels the difference. Cancel anytime.',
    ),
    steps: [
      tx('Se status og utløp øverst', 'See status and expiry at the top'),
      tx('Velg plan om dere vil fortsette', 'Pick a plan if you want to continue'),
      tx('Betaling skjer via butikk eller nett', 'Payment goes through the store or the web'),
    ],
  }),
  'family.week-plan': intro({
    icon: 'today',
    accent: INDIGO,
    soft: INDIGO_SOFT,
    title: tx('Timeplanen som henger i sekken', 'The timetable that lives in the bag'),
    kicker: tx('Mandag til fredag. Klart.', 'Monday to Friday. Clear.'),
    pitch: tx(
      'Hvilken time, hvilket rom, når det er fri. Last opp skoleruta som bilde, PDF eller dokument — så vet alle hva som skjer i uka.',
      'Which lesson, which room, when it’s free. Upload the school sheet as photo, PDF or document — then everyone knows the week.',
    ),
    steps: [
      tx('Åpne Ukeplan fra Skole-mappa', 'Open Week plan from the School folder'),
      tx('Importer med AI, eller fyll inn manuelt', 'Import with AI, or fill in by hand'),
      tx('Se uken med fra- og til-tid — uten at det havner i kalenderen', 'See the week with from–to times — not in the calendar'),
    ],
  }),
  'family.skole': intro({
    icon: 'school',
    accent: INDIGO,
    soft: INDIGO_SOFT,
    title: tx('Skolen, samlet for eleven', 'School, gathered for the pupil'),
    kicker: tx('Lekser. Hjelp. Timeplan.', 'Homework. Help. Timetable.'),
    pitch: tx(
      'Alt som har med skolen å gjøre — uten å lete. Åpne en app og kom i gang. Nysgjerrighet er lov.',
      'Everything school-related — no hunting. Open an app and get going. Curiosity is allowed.',
    ),
    steps: [
      tx('Trykk Lekser, Leksehjelp eller Ukeplan', 'Tap Homework, Homework help or Timetable'),
      tx('Hver app har en kort startguide første gang', 'Each app has a short start guide the first time'),
      tx('Tilbake-pilen tar deg hjem igjen', 'The back arrow takes you home again'),
    ],
  }),
  'family.ai': intro({
    icon: 'sparkles',
    accent: VIOLET,
    soft: VIOLET_SOFT,
    title: tx('Et ekstra hode — når uka knyter seg', 'An extra brain — when the week knots up'),
    kicker: tx('Spør. Få forslag. Bestem selv.', 'Ask. Get ideas. You decide.'),
    pitch: tx(
      'Middagsidéer, oppgavehjelp, «hva gjør vi i helgen?». Assistenten foreslår. Dere velger. Alltid med en voksen i ryggen.',
      'Dinner ideas, task help, “what shall we do this weekend?”. The assistant suggests. You choose. Always with a grown-up in the loop.',
    ),
    steps: [
      {
        nb: 'Skriv i feltet og trykk Send',
        en: 'Type in the field and tap Send',
        anchor: 'input',
      },
      tx('Prøv et av forslagene om du lurer på hvor du starter', 'Try a suggestion if you’re not sure where to start'),
      {
        nb: 'Ny chat-knappen øverst til høyre starter en ny samtale',
        en: 'The new-chat button at the top right starts a fresh conversation',
        anchor: 'add',
      },
    ],
  }),

  /* ───────── Team ───────── */
  'team.home': intro({
    icon: 'home',
    accent: TEAL,
    soft: TEAL_SOFT,
    hero: 'family',
    title: tx('Laget på ett brett', 'The team on one board'),
    kicker: tx('Kamp. Trening. Folk.', 'Match. Training. People.'),
    pitch: tx(
      'Se hva som skjer, hvem som er med og hva som må sies. Mindre Facebook-gruppe. Mer lag som faktisk møter opp.',
      'See what’s on, who’s in and what needs saying. Less Facebook group. More of a team that actually shows up.',
    ),
    steps: [
      {
        nb: 'Trykk en snarvei for kalender, vegg eller meldinger',
        en: 'Tap a shortcut for calendar, wall or messages',
        anchor: 'shortcuts',
        where: tx('Fremhevet: snarveiene', 'Highlighted: the shortcuts'),
        variants: [
          {
            when: { isDesktop: true },
            nb: 'Trykk kalender, vegg eller meldinger i menyen til venstre',
            en: 'Tap calendar, wall or messages in the left menu',
            anchor: 'rail',
          },
        ],
      },
      tx('Bruk + for å legge inn trening eller kamp', 'Use + to add training or a match'),
      tx('Inviter spillere fra Medlemmer', 'Invite players from Members'),
    ],
  }),
  'team.wall': wallCopy('laget', 'the team'),
  'team.events': calendarCopy('lagkalender', 'team calendar', 'Trening, kamp og dugnad', 'Training, matches and work days'),
  'team.messages': chatCopy('laget', 'the team'),
  'team.alerts': intro({
    icon: 'notifications',
    accent: AMBER,
    soft: AMBER_SOFT,
    title: tx('Varsler som treffer de som skal møte', 'Alerts that hit the people who should show up'),
    kicker: tx('Kort. Tydelig. Nå.', 'Short. Clear. Now.'),
    pitch: tx(
      'Banen er isete. Oppmøte flyttes. Si det her — ikke i tre chatter og en e-post ingen leser.',
      'The pitch is icy. Kick-off moved. Say it here — not in three chats and an email nobody reads.',
    ),
    steps: [
      tx('Se siste varsler i listen', 'See the latest alerts in the list'),
      tx('Trykk et varsel for detaljene', 'Tap an alert for the details'),
      tx('Trenere legger ut nye fra + der det er tilgjengelig', 'Coaches post new ones from + where it’s available'),
    ],
  }),
  'team.members': membersCopy('på laget', 'on the team'),
  'team.approvals': approvalsCopy('laget', 'the team'),
  'team.invite': inviteCopy('Lagkode', 'Team code', 'spillerne', 'the players'),
  'team.groups': groupsListCopy('lag', 'team'),

  /* ───────── Classroom ───────── */
  'classroom.home': intro({
    icon: 'home',
    accent: BLUE,
    soft: BLUE_SOFT,
    title: tx('Klassen på ett øyeblikk', 'The class in one glance'),
    kicker: tx('Skole, uten støy.', 'School, without the noise.'),
    pitch: tx(
      'Strøm, arbeid og timeplan samlet. Læreren styrer. Elevene finner frem. Foresatte slipper å gjette.',
      'Stream, work and timetable together. The teacher steers. Pupils find their way. Grown-ups stop guessing.',
    ),
    steps: [
      {
        nb: 'Trykk en snarvei for strøm, arbeid eller timeplan',
        en: 'Tap a shortcut for stream, work or timetable',
        anchor: 'shortcuts',
        where: tx('Fremhevet: snarveiene', 'Highlighted: the shortcuts'),
        variants: [
          {
            when: { isDesktop: true },
            nb: 'Trykk strøm, arbeid eller timeplan i menyen til venstre',
            en: 'Tap stream, work or timetable in the left menu',
            anchor: 'rail',
          },
        ],
      },
      {
        nb: 'Bytt fane nederst for resten av klasseromsappene',
        en: 'Switch the bottom tab for the rest of the classroom apps',
        anchor: 'tabs',
        variants: [
          {
            when: { isDesktop: true },
            nb: 'Bruk menyen til venstre for resten av appen',
            en: 'Use the left menu for the rest of the apps',
            anchor: 'rail',
          },
        ],
      },
      tx('Klassekode ligger under Inviter', 'The class code lives under Invite'),
    ],
  }),
  'classroom.stream': intro({
    icon: 'chatbubbles',
    accent: BLUE,
    soft: BLUE_SOFT,
    hero: 'chat',
    title: tx('Kunngjøringer som kommer frem', 'Announcements that actually land'),
    kicker: tx('Strømmen klassen følger.', 'The stream the class follows.'),
    pitch: tx(
      'Prøve neste uke, husk gymtøy, velkommen tilbake. Én strøm — ikke 30 meldinger i ulike apper.',
      'Test next week, bring PE kit, welcome back. One stream — not 30 messages in different apps.',
    ),
    steps: [
      tx('Les siste innlegg i strømmen', 'Read the latest posts in the stream'),
      tx('Lærere trykker + for ny kunngjøring', 'Teachers tap + for a new announcement'),
      tx('Svar og reaksjoner ligger på innlegget', 'Replies and reactions sit on the post'),
    ],
  }),
  'classroom.classwork': intro({
    icon: 'documents',
    accent: INDIGO,
    soft: INDIGO_SOFT,
    title: tx('Arbeid som er lett å følge', 'Work that’s easy to follow'),
    kicker: tx('Oppgave inn. Innlevering ut.', 'Assignment in. Hand-in out.'),
    pitch: tx(
      'Alt klassen skal gjøre, samlet. Frister synlige. Ingen «lå i en annen fane». Mer læring, mindre leting.',
      'Everything the class should do, gathered. Deadlines visible. Nothing “in another tab”. More learning, less hunting.',
    ),
    steps: [
      tx('Bla i oppgavene for uka', 'Browse this week’s assignments'),
      tx('Åpne en for å lese og levere', 'Open one to read and hand in'),
      tx('Lærere trykker + for ny oppgave', 'Teachers tap + for a new assignment'),
    ],
  }),
  'classroom.todo': intro({
    icon: 'checkbox',
    accent: BLUE,
    soft: BLUE_SOFT,
    hero: 'tasks',
    title: tx('Å gjøre — for eleven, ikke for rotet', 'To-do — for the pupil, not the mess'),
    kicker: tx('Mitt arbeid. Min liste.', 'My work. My list.'),
    pitch: tx(
      'Det som gjenstår, samlet. Kryss av, bli ferdig, se at det letter. En liste som selger mestring.',
      'What’s left, gathered. Check it off, finish, watch it ease. A list that sells mastery.',
    ),
    steps: [
      tx('Se åpne oppgaver i listen', 'See open work in the list'),
      tx('Trykk en for å åpne og levere', 'Tap one to open and hand in'),
      tx('Ferdig-merkede forsvinner fra «å gjøre»', 'Done items leave the to-do list'),
    ],
  }),
  'classroom.grades': intro({
    icon: 'school',
    accent: VIOLET,
    soft: VIOLET_SOFT,
    title: tx('Karakterer uten mystikk', 'Grades without the mystery'),
    kicker: tx('Tydelig. Rettferdig. Synlig.', 'Clear. Fair. Visible.'),
    pitch: tx(
      'Se vurderingene der arbeidet bor. Færre overraskelser på slutten av terminen — mer tid til å justere kursen.',
      'See assessments where the work lives. Fewer surprises at the end of term — more time to steer.',
    ),
    steps: [
      tx('Bla i fag og vurderinger', 'Browse subjects and assessments'),
      tx('Åpne en rad for detaljer', 'Open a row for details'),
      tx('Lærere registrerer karakterer her', 'Teachers enter grades here'),
    ],
  }),
  'classroom.timetable': intro({
    icon: 'calendar',
    accent: BLUE,
    soft: BLUE_SOFT,
    title: tx('Timeplanen klassen faktisk bruker', 'The timetable the class actually uses'),
    kicker: tx('Rom. Fag. Tid.', 'Room. Subject. Time.'),
    pitch: tx(
      'Mandag 10:00 — hvor da? Svaret ligger her. Mindre vandring, mer undervisning.',
      'Monday 10:00 — where? The answer lives here. Less wandering, more teaching.',
    ),
    steps: [
      tx('Se uka rute for rute', 'See the week slot by slot'),
      tx('Trykk en rute for å redigere (lærer)', 'Tap a slot to edit (teacher)'),
      tx('Elever leser — foresatte kan følge med', 'Pupils read — grown-ups can follow along'),
    ],
  }),
  'classroom.lessonPlans': intro({
    icon: 'clipboard',
    accent: INDIGO,
    soft: INDIGO_SOFT,
    title: tx('Undervisning med rød tråd', 'Teaching with a through-line'),
    kicker: tx('Plan. Mål. Gjennomføring.', 'Plan. Aim. Delivery.'),
    pitch: tx(
      'Hva skal klassen lære denne uka? Skriv det her. Kollegaer ser det. Vikarer takker deg.',
      'What should the class learn this week? Write it here. Colleagues see it. Supply teachers will thank you.',
    ),
    steps: [
      tx('Åpne en uke eller lag en ny plan', 'Open a week or create a new plan'),
      tx('Fyll inn mål og innhold', 'Fill in aims and content'),
      tx('Lagre — planen ligger klart til timen', 'Save — the plan is ready for the lesson'),
    ],
  }),
  'classroom.subjects': intro({
    icon: 'book',
    accent: VIOLET,
    soft: VIOLET_SOFT,
    title: tx('Fagene, ryddet for klassen', 'Subjects, tidied for the class'),
    kicker: tx('Norsk. Matte. Alt imellom.', 'Language. Maths. Everything between.'),
    pitch: tx(
      'Hold fagkortene i orden. Timeplan, bøker og arbeid peker hit. Mindre dobbeltarbeid.',
      'Keep subject cards in order. Timetable, books and work point here. Less double work.',
    ),
    steps: [
      tx('Bla i faglisten', 'Browse the subject list'),
      tx('Trykk + for å legge til et fag', 'Tap + to add a subject'),
      tx('Åpne et fag for detaljer', 'Open a subject for details'),
    ],
  }),
  'classroom.groups': intro({
    icon: 'people',
    accent: SKY,
    soft: SKY_SOFT,
    title: tx('Grupper som gjør samarbeid lett', 'Groups that make teamwork easy'),
    kicker: tx('Prosjekt. Stasjoner. Lag.', 'Project. Stations. Teams.'),
    pitch: tx(
      'Del klassen uten Excel. Alle vet hvem de jobber med. Du styrer sammensetningen på sekunder.',
      'Split the class without Excel. Everyone knows who they’re with. You set the mix in seconds.',
    ),
    steps: [
      tx('Se eksisterende grupper', 'See existing groups'),
      tx('Trykk + for å lage en ny', 'Tap + to create a new one'),
      tx('Legg til elever i gruppa', 'Add pupils to the group'),
    ],
  }),
  'classroom.seating': intro({
    icon: 'grid',
    accent: SKY,
    soft: SKY_SOFT,
    title: tx('Sitteplan som tar uroligheten', 'A seating plan that takes the restlessness'),
    kicker: tx('Hvem sitter hvor. Ferdig diskutert.', 'Who sits where. Discussion over.'),
    pitch: tx(
      'Tegn rommet, plasser elevene, bytt med ett trykk. roligere start på timen — mer tid til faget.',
      'Draw the room, place the pupils, swap with one tap. A calmer start — more time for the subject.',
    ),
    steps: [
      tx('Åpne sitteplanen for klassen', 'Open the class seating plan'),
      tx('Trykk en plass for å sette eller bytte elev', 'Tap a seat to place or swap a pupil'),
      tx('Lagre når det sitter som du vil', 'Save when it sits how you want'),
    ],
  }),
  'classroom.offers': intro({
    icon: 'school',
    accent: GREEN,
    soft: GREEN_SOFT,
    title: tx('Tilbud klassen kan strekke seg etter', 'Offers the class can reach for'),
    kicker: tx('Valgfag. Kurs. Muligheter.', 'Electives. Courses. Openings.'),
    pitch: tx(
      'Vis hva skolen byr på. Påmelding og oversikt uten løse lapper. Elever ser muligheten — dere holder kontroll.',
      'Show what the school offers. Sign-up and overview without loose slips. Pupils see the chance — you keep control.',
    ),
    steps: [
      tx('Bla i tilbudene', 'Browse the offers'),
      tx('Trykk + for å legge inn et nytt', 'Tap + to add a new one'),
      tx('Åpne et tilbud for detaljer og påmeldte', 'Open an offer for details and sign-ups'),
    ],
  }),
  'classroom.books': intro({
    icon: 'library',
    accent: VIOLET,
    soft: VIOLET_SOFT,
    title: tx('Pensum alle finner', 'Set texts everyone can find'),
    kicker: tx('Bøker. Kapittel. Klar.', 'Books. Chapters. Ready.'),
    pitch: tx(
      'Hvilken bok, hvilket opplag. Elever og foresatte slutter å gjette. Du slutter å svare på samme spørsmål.',
      'Which book, which edition. Pupils and grown-ups stop guessing. You stop answering the same question.',
    ),
    steps: [
      tx('Se pensumlisten for klassen', 'See the class reading list'),
      tx('Trykk + for å legge til en tittel', 'Tap + to add a title'),
      tx('Åpne en bok for detaljer', 'Open a book for details'),
    ],
  }),
  'classroom.maps': intro({
    icon: 'folder',
    accent: SLATE,
    soft: SLATE_SOFT,
    title: tx('Elevmapper med respekt for privatliv', 'Pupil files with respect for privacy'),
    kicker: tx('Sensitive. Nødvendige. Låst til stab.', 'Sensitive. Needed. Staff only.'),
    pitch: tx(
      'Det som må ligge trygt, ligger her. Ikke i e-post. Ikke på minnepinne. Tilgang til de som skal ha den.',
      'What must sit safely, sits here. Not in email. Not on a stick. Access for those who should have it.',
    ),
    steps: [
      tx('Velg en elev i listen', 'Pick a pupil in the list'),
      tx('Åpne mappa for notater og filer', 'Open the file for notes and documents'),
      tx('Bare ansatte med tilgang ser innholdet', 'Only staff with access see the contents'),
    ],
  }),
  'classroom.members': membersCopy('i klassen', 'in the class'),
  'classroom.approvals': approvalsCopy('klassen', 'the class'),
  'classroom.invite': inviteCopy('Klassekode', 'Class code', 'elevene', 'the pupils'),
  'classroom.classrooms': groupsListCopy('klasse', 'class'),

  /* ───────── Friends ───────── */
  'friends.home': intro({
    icon: 'home',
    accent: SKY,
    soft: SKY_SOFT,
    hero: 'home',
    title: tx('Gjengen, uten 47 tråder', 'The gang, without 47 threads'),
    kicker: tx('Treff. Tur. Prat.', 'Hangouts. Trips. Chat.'),
    pitch: tx(
      'Planlegg kvelden, del utgifter, stem over pizza. Venner fortjener bedre enn en evig gruppechat som ingen eier.',
      'Plan the night, split costs, vote on pizza. Friends deserve better than a group chat nobody owns.',
    ),
    steps: [
      {
        nb: 'Trykk Planer, Stem eller Utgifter for å starte',
        en: 'Tap Plans, Vote or Expenses to start',
        anchor: 'shortcuts',
        variants: [
          {
            when: { isDesktop: true },
            nb: 'Åpne Planer, Stem eller Utgifter fra menyen til venstre',
            en: 'Open Plans, Vote or Expenses from the left menu',
            anchor: 'rail',
          },
        ],
      },
      {
        nb: 'Inviter med gjengkode under Mer',
        en: 'Invite with the gang code under More',
        anchor: 'tabs',
        variants: [
          { when: { isDesktop: true }, nb: 'Inviter med gjengkode fra Inviter i menyen', en: 'Invite with the gang code from Invite in the menu', anchor: 'rail' },
        ],
      },
      tx('Veggen viser hva som rører seg', 'The wall shows what’s moving'),
    ],
  }),
  'friends.plans': calendarCopy('plan', 'plan', 'Turer, kvelder og felles datoer', 'Trips, nights and shared dates'),
  'friends.groups': groupsListCopy('gjeng', 'gang'),
  'friends.messages': chatCopy('gjengen', 'the gang'),
  'friends.more': moreHubCopy('gjengen', 'the gang', 'Avstemning, utgifter, vegg og invitasjon', 'Polls, expenses, wall and invite'),
  'friends.polls': intro({
    icon: 'stats-chart',
    accent: BLUE,
    soft: BLUE_SOFT,
    title: tx('Stem — og slutt å diskutere i det uendelige', 'Vote — and stop the endless debate'),
    kicker: tx('Fredag. Pizza. Flertall.', 'Friday. Pizza. Majority.'),
    pitch: tx(
      'Ett spørsmål, tydelige valg, ferdig. Demokratiet tar 20 sekunder. Kvelden blir bedre av det.',
      'One question, clear options, done. Democracy takes 20 seconds. The night gets better for it.',
    ),
    steps: [
      tx('Åpne en avstemning i listen', 'Open a poll in the list'),
      tx('Trykk det du vil stemme på', 'Tap what you want to vote for'),
      tx('Opprett ny med + når noe må avgjøres', 'Create a new one with + when something needs deciding'),
    ],
  }),
  'friends.expenses': intro({
    icon: 'wallet',
    accent: AMBER,
    soft: AMBER_SOFT,
    title: tx('Utgifter uten dårlig stemning', 'Expenses without the awkward bit'),
    kicker: tx('Hvem la ut. Hvem skylder.', 'Who paid. Who owes.'),
    pitch: tx(
      'Taxi, hytte, konsert. Splitt rettferdig, se saldo, gjør opp. Vennskap tåler tall — når tallene er synlige.',
      'Taxi, cabin, concert. Split fairly, see the balance, settle up. Friendship handles numbers — when the numbers are visible.',
    ),
    steps: [
      tx('Trykk + for å legge inn et utlegg', 'Tap + to add an expense'),
      tx('Velg hvem som betalte og hvem som deler', 'Pick who paid and who splits'),
      tx('Se saldoen — gjør opp når det passer', 'See the balance — settle when it suits'),
    ],
  }),
  'friends.wall': wallCopy('gjengen', 'the gang'),
  'friends.members': membersCopy('i gjengen', 'in the gang'),
  'friends.invite': inviteCopy('Gjengkode', 'Gang code', 'vennene', 'friends'),
  'friends.approvals': approvalsCopy('gjengen', 'the gang'),

  /* ───────── Congregation ───────── */
  'congregation.home': intro({
    icon: 'home',
    accent: TEAL,
    soft: TEAL_SOFT,
    title: tx('Menigheten, samlet og varm', 'The congregation, gathered and warm'),
    kicker: tx('Samling. Tjeneste. Folk.', 'Gathering. Service. People.'),
    pitch: tx(
      'Kalender, grupper og strøm på ett sted. Mindre «det sto i en annen kanal». Mer fellesskap som faktisk møtes.',
      'Calendar, groups and stream in one place. Less “it was in another channel”. More community that actually meets.',
    ),
    steps: [
      {
        nb: 'Trykk Kalender eller Strøm for å se hva som skjer',
        en: 'Tap Calendar or Stream to see what’s on',
        anchor: 'shortcuts',
        variants: [
          {
            when: { isDesktop: true },
            nb: 'Åpne Kalender eller Strøm fra menyen til venstre',
            en: 'Open Calendar or Stream from the left menu',
            anchor: 'rail',
          },
        ],
      },
      {
        nb: 'Grupper og tjeneste finner du under Mer',
        en: 'Groups and volunteering live under More',
        anchor: 'tabs',
        variants: [
          { when: { isDesktop: true }, nb: 'Grupper og tjeneste finner du i menyen til venstre', en: 'Groups and volunteering live in the left menu', anchor: 'rail' },
        ],
      },
      tx('Inviter med menighetskode', 'Invite with the congregation code'),
    ],
  }),
  'congregation.calendar': calendarCopy('kalender', 'calendar', 'Samlinger, grupper og praktisk info', 'Gatherings, groups and practical info'),
  'congregation.groups': groupsListCopy('menighet', 'congregation'),
  'congregation.stream': intro({
    icon: 'chatbubbles',
    accent: TEAL,
    soft: TEAL_SOFT,
    hero: 'chat',
    title: tx('Strømmen menigheten følger', 'The stream the congregation follows'),
    kicker: tx('Nytt. Delt. Nært.', 'New. Shared. Close.'),
    pitch: tx(
      'Kunngjøringer, bilder og det som rører seg. Én strøm i stedet for oppslagstavle, e-post og tre Facebook-grupper.',
      'Announcements, photos and what’s moving. One stream instead of a noticeboard, email and three Facebook groups.',
    ),
    steps: [
      tx('Les siste i strømmen', 'Read the latest in the stream'),
      tx('Trykk + for å legge ut (om du har tilgang)', 'Tap + to post (if you have access)'),
      tx('Følg med — det viktigste lander her', 'Keep an eye out — the important stuff lands here'),
    ],
  }),
  'congregation.more': moreHubCopy('menigheten', 'the congregation', 'Grupper, tjeneste, meldinger og invitasjon', 'Groups, volunteering, messages and invite'),
  'congregation.ministry': intro({
    icon: 'people',
    accent: TEAL,
    soft: TEAL_SOFT,
    title: tx('Grupper som holder fellesskapet varmt', 'Groups that keep community warm'),
    kicker: tx('Små lag. Stor kirke.', 'Small teams. Big church.'),
    pitch: tx(
      'Kor, bibelgrupper, ungdom. Finn din flokk, se neste samling, bli med uten å spørre tre personer.',
      'Choir, bible groups, youth. Find your flock, see the next gathering, join without asking three people.',
    ),
    steps: [
      tx('Bla i menighetsgruppene', 'Browse the ministry groups'),
      tx('Åpne en gruppe for å se medlemmer og info', 'Open a group to see members and info'),
      tx('Ledere legger til nye grupper med +', 'Leaders add new groups with +'),
    ],
  }),
  'congregation.volunteer': intro({
    icon: 'hand-left',
    accent: AMBER,
    soft: AMBER_SOFT,
    title: tx('Tjeneste som er lett å si ja til', 'Service that’s easy to say yes to'),
    kicker: tx('Hender. Skift. Takk.', 'Hands. Shifts. Thanks.'),
    pitch: tx(
      'Kaffe, velkomst, teknikk. Se hva som trengs, meld deg, møt opp. Frivillighet uten mas — og uten at de samme ti alltid står igjen.',
      'Coffee, welcome, tech. See what’s needed, sign up, show up. Volunteering without nagging — and without the same ten always left standing.',
    ),
    steps: [
      tx('Se åpne vakter og oppgaver', 'See open shifts and tasks'),
      tx('Trykk for å melde deg', 'Tap to sign up'),
      tx('Ledere legger inn behov med +', 'Leaders add needs with +'),
    ],
  }),
  'congregation.messages': chatCopy('menigheten', 'the congregation'),
  'congregation.members': membersCopy('i menigheten', 'in the congregation'),
  'congregation.invite': inviteCopy('Menighetskode', 'Congregation code', 'medlemmene', 'members'),
  'congregation.approvals': approvalsCopy('menigheten', 'the congregation'),

  /* ───────── Daycare ───────── */
  'daycare.home': intro({
    icon: 'home',
    accent: ROSE,
    soft: ROSE_SOFT,
    hero: 'home',
    title: tx('Barnehagen, uten å miste beskjeden', 'Daycare, without losing the note'),
    kicker: tx('Dag. Henting. Info.', 'Day. Pickup. Info.'),
    pitch: tx(
      'Dagsrytme, fravær og henteplan på ett sted. Foresatte slipper å gjette. Personalet slipper å gjenta.',
      'Daily rhythm, absence and pickup in one place. Grown-ups stop guessing. Staff stop repeating.',
    ),
    steps: [
      {
        nb: 'Trykk Dagsrytme, Fravær eller Henting',
        en: 'Tap Rhythm, Absence or Pickup',
        anchor: 'shortcuts',
        variants: [
          {
            when: { isDesktop: true },
            nb: 'Åpne Dagsrytme, Fravær eller Henting fra menyen til venstre',
            en: 'Open Rhythm, Absence or Pickup from the left menu',
            anchor: 'rail',
          },
        ],
      },
      tx('Beskjeder ligger under Info', 'Notices live under Info'),
      tx('Inviter foresatte med barnehagekode', 'Invite grown-ups with the daycare code'),
    ],
  }),
  'daycare.rhythm': intro({
    icon: 'time',
    accent: ROSE,
    soft: ROSE_SOFT,
    title: tx('Dagen barna kjenner igjen', 'The day the children recognise'),
    kicker: tx('Samling. Mat. Ute.', 'Circle. Food. Outdoors.'),
    pitch: tx(
      'Rytmen som gjør dagen trygg. Foresatte ser hva som skjer. Personalet har en felles plan — ikke fem versjoner.',
      'The rhythm that makes the day safe. Grown-ups see what’s on. Staff share one plan — not five versions.',
    ),
    steps: [
      tx('Se dagens rytme i oversikten', 'See today’s rhythm in the overview'),
      tx('Personalet redigerer punktene etter behov', 'Staff edit the points as needed'),
      tx('Foresatte leser — barna kjenner dagen igjen', 'Grown-ups read — children recognise the day'),
    ],
  }),
  'daycare.groups': groupsListCopy('avdeling', 'department'),
  'daycare.messages': chatCopy('barnehagen', 'daycare'),
  'daycare.more': moreHubCopy('barnehagen', 'daycare', 'Fravær, henting, beskjeder og invitasjon', 'Absence, pickup, notices and invite'),
  'daycare.absence': intro({
    icon: 'medical',
    accent: AMBER,
    soft: AMBER_SOFT,
    title: tx('Fravær meldt — uten telefonkø', 'Absence reported — no phone queue'),
    kicker: tx('Syk. Fri. Beskjed sendt.', 'Sick. Off. Message sent.'),
    pitch: tx(
      'Meld i appen. Personalet ser det. Ingen «vi visste ikke». En liten handling som sparer alle for mas.',
      'Report in the app. Staff see it. No “we didn’t know”. A small action that saves everyone the fuss.',
    ),
    steps: [
      tx('Trykk for å melde fravær', 'Tap to report absence'),
      tx('Velg barn, dag og grunn', 'Pick child, day and reason'),
      tx('Send — avdelingen ser det med en gang', 'Send — the department sees it immediately'),
    ],
  }),
  'daycare.pickup': intro({
    icon: 'car',
    accent: SKY,
    soft: SKY_SOFT,
    title: tx('Hvem henter — avklart før klokka tre', 'Who’s picking up — settled before 3 p.m.'),
    kicker: tx('Trygt. Tydelig. Avtalt.', 'Safe. Clear. Agreed.'),
    pitch: tx(
      'Besteforeldre, delt bosted, en venninne. Skriv det her. Personalet vet hvem som skal ut døra. Dere slipper siste-liten-sms.',
      'Grandparents, shared custody, a friend. Write it here. Staff know who’s walking out. You skip the last-minute text.',
    ),
    steps: [
      tx('Se henteplanen for dagen', 'See today’s pickup plan'),
      tx('Oppgi hvem som henter, og når', 'Say who is picking up, and when'),
      tx('Endre når planen skifter — avdelingen oppdateres', 'Change it when plans shift — the department updates'),
    ],
  }),
  'daycare.announcements': intro({
    icon: 'megaphone',
    accent: GREEN,
    soft: GREEN_SOFT,
    title: tx('Beskjeder som når alle foresatte', 'Notices that reach every grown-up'),
    kicker: tx('Info uten at noen blir glemt.', 'Info without anyone left out.'),
    pitch: tx(
      'Turdag, lus, dugnad. Én beskjed, alle ser den. Ikke avhengig av at «noen skulle si ifra».',
      'Outing, nits, work day. One notice, everyone sees it. Not dependent on “someone was meant to say”.',
    ),
    steps: [
      tx('Les siste beskjeder i listen', 'Read the latest notices in the list'),
      tx('Personalet trykker + for ny info', 'Staff tap + for new info'),
      tx('Åpne en beskjed for hele teksten', 'Open a notice for the full text'),
    ],
  }),
  'daycare.members': membersCopy('i barnehagen', 'in daycare'),
  'daycare.invite': inviteCopy('Barnehagekode', 'Daycare code', 'foresatte', 'grown-ups'),
  'daycare.approvals': approvalsCopy('barnehagen', 'daycare'),

  /* ───────── Flex group ───────── */
  'group.home': intro({
    icon: 'home',
    accent: SLATE,
    soft: SLATE_SOFT,
    title: tx('Gruppa deres — form den som dere vil', 'Your group — shape it how you like'),
    kicker: tx('Fleksibelt. Tydelig. Deres.', 'Flexible. Clear. Yours.'),
    pitch: tx(
      'Planer, oppgaver og prat i ett rom. Bruk det til styret, dugnaden eller det som passer — uten å bygge enda et verktøy.',
      'Plans, tasks and chat in one room. Use it for the board, the work day or whatever fits — without building yet another tool.',
    ),
    steps: [
      {
        nb: 'Trykk Planer eller Oppgaver for å starte',
        en: 'Tap Plans or Tasks to start',
        anchor: 'shortcuts',
        variants: [
          {
            when: { isDesktop: true },
            nb: 'Åpne Planer eller Oppgaver fra menyen til venstre',
            en: 'Open Plans or Tasks from the left menu',
            anchor: 'rail',
          },
        ],
      },
      {
        nb: 'Vegg og meldinger ligger under Mer',
        en: 'Wall and messages live under More',
        anchor: 'tabs',
        variants: [
          { when: { isDesktop: true }, nb: 'Vegg og meldinger ligger i menyen til venstre', en: 'Wall and messages live in the left menu', anchor: 'rail' },
        ],
      },
      tx('Inviter med gruppekode', 'Invite with the group code'),
    ],
  }),
  'group.plans': calendarCopy('plan', 'plan', 'Møter, frister og felles datoer', 'Meetings, deadlines and shared dates'),
  'group.groups': groupsListCopy('gruppe', 'group'),
  'group.tasks': intro({
    icon: 'checkbox',
    accent: BLUE,
    soft: BLUE_SOFT,
    hero: 'tasks',
    title: tx('Oppgaver gruppa faktisk fullfører', 'Tasks the group actually finishes'),
    kicker: tx('Ansvar. Frist. Ferdig.', 'Owner. Deadline. Done.'),
    pitch: tx(
      'Hvem gjør hva, innen når. Synlig for alle. Mindre «jeg trodde du tok det» — mer som blir krysset av.',
      'Who does what, by when. Visible to all. Less “I thought you had it” — more that gets checked off.',
    ),
    steps: [
      tx('Se åpne oppgaver i listen', 'See open tasks in the list'),
      tx('Trykk + for å lage en ny', 'Tap + to create a new one'),
      tx('Kryss av når det er gjort', 'Check it off when it’s done'),
    ],
  }),
  'group.more': moreHubCopy('gruppa', 'the group', 'Vegg, meldinger, medlemmer og invitasjon', 'Wall, messages, members and invite'),
  'group.wall': wallCopy('gruppa', 'the group'),
  'group.messages': chatCopy('gruppa', 'the group'),
  'group.members': membersCopy('i gruppa', 'in the group'),
  'group.invite': inviteCopy('Gruppekode', 'Group code', 'medlemmene', 'members'),
  'group.approvals': approvalsCopy('gruppa', 'the group'),
};

/** Module ids each shell can open — used to keep intros complete. */
export const EXPECTED_INTRO_KEYS = [
  'family.home', 'family.chat', 'family.plan', 'family.mail', 'family.stars',
  'family.notes', 'family.chores', 'family.more', 'family.shop', 'family.wishes',
  'family.books', 'family.lekser', 'family.mattehjelp', 'family.leksehjelp', 'family.klassen', 'family.settings',
  'family.childApps', 'family.activities', 'family.members', 'family.groupSettings',
  'family.location', 'family.documents', 'family.meals', 'family.matcoach', 'family.recipes', 'family.pantry', 'family.progress',
  'family.games', 'family.quiz', 'family.scratchMap', 'family.reiseplanlegger', 'family.childDrawings', 'family.albums', 'family.wall',
  'family.friends', 'family.familyTree', 'family.rememberDates',
  'family.boligmappa', 'family.holdings', 'family.hospitality', 'family.legal', 'family.subscription', 'family.moduleAccess', 'family.help',
  'family.week-plan',
  'family.skole', 'family.ai',
  'team.home', 'team.wall', 'team.events', 'team.messages', 'team.alerts',
  'team.members', 'team.approvals', 'team.invite', 'team.groups',
  'classroom.home', 'classroom.stream', 'classroom.classwork', 'classroom.todo',
  'classroom.grades', 'classroom.timetable', 'classroom.lessonPlans',
  'classroom.subjects', 'classroom.groups', 'classroom.seating', 'classroom.offers',
  'classroom.books', 'classroom.maps', 'classroom.members', 'classroom.approvals',
  'classroom.invite', 'classroom.classrooms',
  'friends.home', 'friends.plans', 'friends.groups', 'friends.messages',
  'friends.more', 'friends.polls', 'friends.expenses', 'friends.wall',
  'friends.members', 'friends.invite', 'friends.approvals',
  'congregation.home', 'congregation.calendar', 'congregation.groups',
  'congregation.stream', 'congregation.more', 'congregation.ministry',
  'congregation.volunteer', 'congregation.messages', 'congregation.members',
  'congregation.invite', 'congregation.approvals',
  'daycare.home', 'daycare.rhythm', 'daycare.groups', 'daycare.messages',
  'daycare.more', 'daycare.absence', 'daycare.pickup', 'daycare.announcements',
  'daycare.members', 'daycare.invite', 'daycare.approvals',
  'group.home', 'group.plans', 'group.groups', 'group.tasks', 'group.more',
  'group.wall', 'group.messages', 'group.members', 'group.invite', 'group.approvals',
];

const ALIASES = {
  'classroom.messages': 'classroom.stream',
  'family.voiceNotes': 'family.notes',
  'family.addMember': 'family.members',
};

/**
 * First-login tour: a handful of highlights plus the rest as a compact grid.
 * Keeps new users from getting a popup on every module switch.
 */
export const WELCOME_TOUR = {
  family: {
    highlights: ['home', 'plan', 'chat', 'stars', 'notes'],
    apps: ['mail', 'shop', 'wishes', 'meals', 'books', 'chores', 'games', 'documents', 'location', 'activities', 'ai'],
  },
  familyChild: {
    highlights: ['home', 'plan', 'chat', 'stars', 'chores'],
    apps: ['notes', 'wishes', 'books', 'games', 'lekser', 'week-plan', 'albums'],
  },
  team: {
    highlights: ['home', 'wall', 'events', 'messages', 'alerts'],
    apps: ['members', 'invite', 'approvals', 'groups'],
  },
  classroom: {
    highlights: ['home', 'stream', 'classwork', 'todo', 'grades'],
    apps: ['timetable', 'lessonPlans', 'subjects', 'members', 'invite'],
  },
  friends: {
    highlights: ['home', 'plans', 'messages', 'polls', 'expenses'],
    apps: ['wall', 'members', 'invite', 'groups'],
  },
  congregation: {
    highlights: ['home', 'calendar', 'stream', 'ministry', 'volunteer'],
    apps: ['members', 'invite', 'messages', 'groups'],
  },
  daycare: {
    highlights: ['home', 'rhythm', 'messages', 'absence', 'pickup'],
    apps: ['announcements', 'members', 'invite', 'groups'],
  },
  group: {
    highlights: ['home', 'plans', 'tasks', 'messages', 'wall'],
    apps: ['members', 'invite', 'groups'],
  },
};

export function getWelcomeTourModules(scope, { asChild = false } = {}) {
  const key = (asChild && scope === 'family') ? 'familyChild' : scope;
  const spec = WELCOME_TOUR[key] || WELCOME_TOUR[scope];
  if (!spec) return { highlights: [], apps: [] };
  const resolve = (id) => {
    const entry = getModuleIntro(scope, id);
    return entry ? { id, ...entry } : null;
  };
  return {
    highlights: spec.highlights.map(resolve).filter(Boolean),
    apps: spec.apps.map(resolve).filter(Boolean),
  };
}

export function getModuleIntro(scope, moduleId) {
  const raw = introStorageKey(scope, moduleId);
  const key = ALIASES[raw] || raw;
  return MODULE_INTROS[key] || null;
}

export function localizeIntro(entry, lang = 'nb', layout = {}) {
  if (!entry) return null;
  const tour = buildTourSteps(entry.steps, lang, pickIntroText, layout);
  return {
    icon: entry.icon,
    accent: entry.accent,
    soft: entry.soft,
    hero: entry.hero,
    title: pickIntroText(entry.title, lang),
    kicker: pickIntroText(entry.kicker, lang),
    pitch: pickIntroText(entry.pitch, lang),
    steps: tour.map((s) => s.text),
    tour,
    rawSteps: entry.steps,
  };
}
