/**
 * First-visit intro ads for every ProTop module.
 * Copy is sales-first (why it matters), then a short “how to start” guide.
 * Norwegian is the source language; English is the fallback for other langs.
 */

import { buildTourSteps } from './helpLayout.js';
import { PROTOP_PAGES, resolvePageKey } from '../help/protopPages.js';

export const tx = (nb, en) => ({ nb, en });

function intro({
  icon, accent, soft, hero = null, title, kicker, pitch, steps,
}) {
  return { icon, accent, soft, hero, title, kicker, pitch, steps };
}

import { pickIntroText, introStorageKey, MODULE_INTRO_SEEN_PREFIX } from './moduleIntroKeys.js';

export { pickIntroText, introStorageKey, MODULE_INTRO_SEEN_PREFIX };

const BLUE = '#1099F4';
const BLUE_SOFT = '#dbeafe';
const TEAL = '#0f766e';
const TEAL_SOFT = '#ccfbf1';
const AMBER = '#d97706';
const AMBER_SOFT = '#fef3c7';
const VIOLET = '#7c3aed';
const VIOLET_SOFT = '#ede9fe';
const ORANGE = '#ea580c';
const ORANGE_SOFT = '#ffedd5';
const SKY = '#0284c7';
const SKY_SOFT = '#e0f2fe';
const SLATE = '#334155';
const SLATE_SOFT = '#e2e8f0';
const GREEN = '#15803d';
const GREEN_SOFT = '#dcfce7';

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
      `Ikke nok en app å sjekke. Direktemeldinger og felles beskjeder for ${whoNb} — samlet, trygt og uten støy fra resten av verden.`,
      `Not another app to check. Direct messages and shared notes for ${whoEn} — together, safe, and free of the rest of the world’s noise.`,
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
        nb: 'Trykk et kort — dagens plan, oppgaver eller notater — for å åpne appen',
        en: 'Tap a card — today’s plan, tasks or notes — to open the app',
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
  'family.chat': chatCopy('du', 'you'),
  'family.plan': intro({
    icon: 'calendar',
    accent: BLUE,
    soft: BLUE_SOFT,
    title: tx('Din uke, på ett sted', 'Your week, in one place'),
    kicker: tx('Din egen kalender.', 'Your own calendar.'),
    pitch: tx(
      'Avtaler, påminnelser og det du har koblet fra Outlook eller ICS — i din kalender. Ingen andres plan.',
      'Events, reminders and what you connect from Outlook or ICS — in your calendar. Nobody else’s plan.',
    ),
    steps: [
      {
        nb: 'Trykk Ny hendelse øverst til høyre',
        en: 'Tap New event at the top right',
        scene: 'hub',
      },
      {
        nb: 'Legg inn det som gjelder deg',
        en: 'Add what applies to you',
        scene: 'inner',
      },
      tx('Koble Outlook i innstillinger om du vil ha jobb og privat i samme uke', 'Connect Outlook in settings to mix work and personal in one week'),
    ],
  }),
  'family.mail': intro({
    icon: 'mail',
    accent: BLUE,
    soft: BLUE_SOFT,
    title: tx('E-post der du allerede planlegger', 'Mail where you already plan'),
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
      'Gi oppgaven et navn og en frist. Kryss av når den er gjort. Oversikten er din.',
      'Give the task a name and a deadline. Check it off when it’s done. The list is yours.',
    ),
    steps: [
      tx('Trykk + for å lage en oppgave', 'Tap + to create a task'),
      {
        nb: 'Sett frist og hva som skal gjøres',
        en: 'Set a deadline and what needs doing',
        scene: 'inner',
      },
      tx('Kryss av når det er gjort', 'Check it off when it’s done'),
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
      'Beskjeder, lister og stemme — samlet for deg. Mindre lapper som forsvinner, mer som du finner igjen.',
      'Messages, lists and voice — gathered for you. Fewer vanishing scraps, more you can find again.',
    ),
    steps: [
      tx('Åpne et notat, eller trykk + for et nytt', 'Open a note, or tap + for a new one'),
      tx('Skriv, eller ta opp med mikrofonen', 'Type, or record with the mic'),
      tx('Notatet ligger hos deg til du trenger det igjen', 'The note stays with you until you need it again'),
    ],
  }),
  'family.more': moreHubCopy('deg', 'you', 'Handleliste, måltider, spill, kart og mer', 'Shopping, meals, games, maps and more'),
  'family.settings': intro({
    icon: 'settings',
    accent: SLATE,
    soft: SLATE_SOFT,
    title: tx('Still inn kontoen slik du vil ha den', 'Set the account up the way you want it'),
    kicker: tx('Din konto. Dine valg.', 'Your account. Your choices.'),
    pitch: tx(
      'Språk, varsler og utseende. Små valg som gjør appen til din — ikke en ferdig mal.',
      'Language, alerts and appearance. Small choices that make the app yours — not a stock template.',
    ),
    steps: [
      tx('Bla og åpne det du vil endre', 'Scroll and open what you want to change'),
      tx('Lagre — endringen gjelder med en gang', 'Save — the change applies immediately'),
      tx('Apper og tilganger for barn finner du på barnets profil', 'Kids’ app access lives on the child’s profile'),
    ],
  }),
  'family.members': membersCopy('her', 'here'),
  'family.groupSettings': intro({
    icon: 'home',
    accent: SLATE,
    soft: SLATE_SOFT,
    title: tx('Kontoen bak kulissene', 'The account behind the curtain'),
    kicker: tx('Navn og roller.', 'Name and roles.'),
    pitch: tx(
      'Her bor kontoinnstillingene. Hold navn og roller i orden — så flyter resten av appen.',
      'This is where account settings live. Keep the name and roles tidy — and the rest of the app flows.',
    ),
    steps: [
      tx('Endre navn og detaljer øverst', 'Change the name and details at the top'),
      tx('Se medlemmer og roller i listen', 'See members and roles in the list'),
      tx('Lagre før du går videre', 'Save before you leave'),
    ],
  }),
  'family.documents': intro({
    icon: 'folder-open',
    accent: SKY,
    soft: SKY_SOFT,
    title: tx('Papirene som alltid er «et sted»', 'The papers that are always “somewhere”'),
    kicker: tx('Mapper. Filer. Ferdig søkt.', 'Folders. Files. Found.'),
    pitch: tx(
      'Pass, forsikring, brev. Samle det du trenger, i mapper du finner igjen — uten å grave i e-posten.',
      'Passports, insurance, letters. Gather what you need, in folders you can find — no digging through email.',
    ),
    steps: [
      tx('Åpne en mappe, eller lag en ny med +', 'Open a folder, or create one with +'),
      tx('Last opp fil eller ta bilde', 'Upload a file or take a photo'),
      tx('Alt ligger trygt på kontoen — ikke på én telefon', 'It lives on the account — not on one phone'),
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
      'Legg til venner, godta forespørsler og del album eller lister.',
      'Add friends, accept requests and share albums or lists.',
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
      'Skru på modulene du trenger — og skjul resten. Mindre støy. Mer av det som faktisk brukes.',
      'Turn on the modules you need — and hide the rest. Less noise. More of what you actually use.',
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
      'Kalender, oppgaver, mail og resten — uten sperrer. Prøv først. Fortsett om du merker forskjellen. Si opp når som helst.',
      'Calendar, tasks, mail and the rest — no brakes. Try first. Stay if you feel the difference. Cancel anytime.',
    ),
    steps: [
      tx('Se status og utløp øverst', 'See status and expiry at the top'),
      tx('Velg plan om dere vil fortsette', 'Pick a plan if you want to continue'),
      tx('Betaling skjer via butikk eller nett', 'Payment goes through the store or the web'),
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
  'family.home', 'family.chat', 'family.plan', 'family.mail', 'family.stars', 'family.notes',
  'family.more', 'family.settings', 'family.members', 'family.groupSettings', 'family.documents',
  'family.friends', 'family.legal', 'family.subscription', 'family.moduleAccess', 'family.help',
  'family.ai', 'team.home', 'team.wall', 'team.events', 'team.messages', 'team.alerts',
  'team.members', 'team.approvals', 'team.invite', 'team.groups', 'friends.home', 'friends.plans',
  'friends.groups', 'friends.messages', 'friends.more', 'friends.polls', 'friends.expenses',
  'friends.wall', 'friends.members', 'friends.invite', 'friends.approvals', 'group.home',
  'group.plans', 'group.groups', 'group.tasks', 'group.more', 'group.wall', 'group.messages',
  'group.members', 'group.invite', 'group.approvals',
];

const ALIASES = {
  'family.voiceNotes': 'family.notes',
  'family.addMember': 'family.members',
};

/**
 * First-login tour: a handful of highlights plus the rest as a compact grid.
 * Keeps new users from getting a popup on every module switch.
 */
export const WELCOME_TOUR = {
  /** ProTop i bedriften: kjerneløpet først, resten som snarveier. */
  protopCompany: {
    highlights: ['home', 'anbud.varsling', 'projects', 'arbeid.timeliste', 'okonomi.faktura'],
    apps: [
      'kunder', 'kontrakt', 'ansatte', 'hr.oversikt', 'arbeid.fravaer', 'arbeid.godkjenning',
      'iso.oversikt', 'utstyr', 'okonomi.kjorebok', 'plan', 'mail', 'chat',
    ],
  },
  /** ProTop privat: de personlige modulene. */
  protopPersonal: {
    highlights: ['home', 'plan', 'mail', 'stars', 'notes'],
    apps: ['chat', 'friends', 'timeliste', 'settings', 'help'],
  },
  team: {
    highlights: ['home', 'wall', 'events', 'messages', 'alerts'],
    apps: ['members', 'invite', 'approvals', 'groups'],
  },
  friends: {
    highlights: ['home', 'plans', 'messages', 'polls', 'expenses'],
    apps: ['wall', 'members', 'invite', 'groups'],
  },
  group: {
    highlights: ['home', 'plans', 'tasks', 'messages', 'wall'],
    apps: ['members', 'invite', 'groups'],
  },
};

export function getWelcomeTourModules(scope, { asChild = false, company = false } = {}) {
  // Barnekontoer finnes ikke i ProTop; asChild gir ingen omvisning.
  if (asChild && scope === 'family') return { highlights: [], apps: [] };
  const key = scope === 'family' ? (company ? 'protopCompany' : 'protopPersonal') : scope;
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

/**
 * ProTop-sidene (src/help/protopPages.js) vinner over de gamle familie-introene
 * for samme side-id. Familie-introene ligger igjen for moduler ProTop ikke viser.
 */
export function getProtopIntro(moduleId) {
  const key = resolvePageKey(moduleId);
  return key ? { pageKey: key, ...PROTOP_PAGES[key] } : null;
}

export function getModuleIntro(scope, moduleId) {
  if ((scope || 'family') === 'family') {
    const protop = getProtopIntro(moduleId);
    if (protop) return protop;
  }
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
    pageKey: entry.pageKey || null,
    label: entry.label ? pickIntroText(entry.label, lang) : '',
    path: entry.path ? pickIntroText(entry.path, lang) : '',
    nav: entry.nav || null,
    process: entry.process || null,
    faq: (entry.faq || []).map((f) => ({ q: pickIntroText(f.q, lang), a: pickIntroText(f.a, lang) })),
  };
}
