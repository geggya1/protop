/**
 * Hjelpesenteret: kunnskapsbase og søk.
 *
 * To kilder:
 *  1. SUPPORT_ARTICLES under — de vanligste supportsakene (feilsøking, innlogging,
 *     e-post, tilgang, faktura …), skrevet for folk uten teknisk bakgrunn.
 *  2. Sideveiledningene i src/help/protopPages.js og temaene i assistantTopics.js,
 *     som lyspæren og ProTop-assistenten også bruker. De blir egne artikler her,
 *     så alt kan søkes fra ett sted.
 *
 * Målet er at artiklene og assistenten løser de fleste henvendelser før de blir
 * en sak. Søket er lokalt (ingen nettverkskall) og tåler skrivefeil og bøyning.
 * Ren JS uten React Native.
 */

import { PROTOP_PAGES, HELP_SECTIONS } from '../help/protopPages.js';
import { ASSISTANT_TOPICS } from '../help/assistantTopics.js';
import { pickText } from './model.js';

const tx = (nb, en) => ({ nb, en: en || nb });
const st = (title, body) => ({ title, body });

/** Grupper i hjelpesenteret (kortene på forsiden). */
export const ARTICLE_GROUPS = [
  { id: 'start', icon: 'rocket-outline', color: '#0b6bcb', title: tx('Kom i gang', 'Getting started') },
  { id: 'troubleshoot', icon: 'construct-outline', color: '#dc2626', title: tx('Feilsøking', 'Troubleshooting') },
  { id: 'account', icon: 'person-circle-outline', color: '#7c3aed', title: tx('Innlogging og konto', 'Sign-in and account') },
  { id: 'people', icon: 'people-outline', color: '#0891b2', title: tx('Ansatte og tilgang', 'Employees and access') },
  { id: 'time', icon: 'time-outline', color: '#ea580c', title: tx('Timer og fravær', 'Hours and absence') },
  { id: 'finance', icon: 'wallet-outline', color: '#16a34a', title: tx('Økonomi og faktura', 'Finance and invoicing') },
  { id: 'tenders', icon: 'megaphone-outline', color: '#db2777', title: tx('Anbud og kunder', 'Tenders and customers') },
  { id: 'quality', icon: 'shield-checkmark-outline', color: '#0f766e', title: tx('ISO, HMS og HR', 'ISO, HSE and HR') },
  { id: 'mobile', icon: 'phone-portrait-outline', color: '#475569', title: tx('Mobil og varsler', 'Mobile and notifications') },
  { id: 'privacy', icon: 'lock-closed-outline', color: '#1e293b', title: tx('Personvern og data', 'Privacy and data') },
];

export const SUPPORT_ARTICLES = [
  {
    id: 'blank-screen',
    group: 'troubleshoot',
    module: 'general',
    icon: 'alert-circle-outline',
    title: 'Siden er hvit, henger eller laster ikke',
    summary: 'De fleste slike feil løses ved å laste siden helt på nytt, slik at du får nyeste versjon av ProTop.',
    steps: [
      st('Last siden helt på nytt', 'PC: trykk Ctrl + Shift + R (Windows) eller Cmd + Shift + R (Mac). Mobil: lukk fanen eller appen helt og åpne protop.no igjen.'),
      st('Sjekk nettet', 'Åpne en annen nettside. Virker ikke den heller, er det nettforbindelsen. Bytt mellom wifi og mobildata.'),
      st('Prøv en annen nettleser', 'ProTop virker best i oppdatert Chrome, Edge eller Safari. Prøv et privat vindu. Virker det der, er det ofte en utvidelse (annonseblokker) som stopper siden.'),
      st('Logg ut og inn', 'Trykk profilbildet → Logg ut, og logg inn igjen.'),
      st('Står det fortsatt fast?', 'Opprett en sak med «Noe virker ikke». Vi får automatisk med feilmeldingene fra siden, så du trenger ikke forklare det tekniske.'),
    ],
    keywords: ['hvit skjerm', 'blank', 'tom side', 'henger', 'laster ikke', 'frosset', 'fryser', 'spinner', 'evig lasting', 'krasj', 'feil', 'error', 'virker ikke', 'fungerer ikke'],
    related: ['update-app', 'browser-support', 'screenshot'],
    popular: 1,
  },
  {
    id: 'cant-login',
    group: 'account',
    module: 'login',
    icon: 'log-in-outline',
    title: 'Jeg kommer ikke inn / får ikke logget inn',
    summary: 'Sjekk at du bruker samme innloggingsmåte som da kontoen ble laget (Google, Microsoft eller e-post og passord).',
    steps: [
      st('Samme metode som sist', 'Laget du kontoen med Google eller Microsoft, må du bruke den knappen. Et passord fungerer ikke for slike kontoer.'),
      st('Glemt passord', 'Trykk «Glemt passord» på innloggingssiden, skriv e-posten din og følg lenken du får. Sjekk søppelpost hvis den ikke kommer.'),
      st('Riktig e-post', 'Mange har både jobb- og privat e-post. Prøv den bedriften inviterte deg med.'),
      st('Invitert av bedriften?', 'Bruk lenken i velkomst-e-posten første gang. Den setter passordet ditt.'),
      st('«For mange forsøk»', 'Vent 10–15 minutter og prøv igjen, eller bruk «Glemt passord».'),
    ],
    keywords: ['logge inn', 'innlogging', 'passord', 'glemt passord', 'login', 'kommer ikke inn', 'feil passord', 'låst ute', 'google', 'microsoft', 'konto'],
    related: ['reset-password', 'no-email', 'verify-email'],
    popular: 2,
  },
  {
    id: 'reset-password',
    group: 'account',
    module: 'login',
    icon: 'key-outline',
    title: 'Bytte eller tilbakestille passord',
    summary: 'Har du glemt passordet, bruker du «Glemt passord». Er du innlogget, bytter du det under Innstillinger.',
    steps: [
      st('Glemt passord', 'Gå til protop.no/login → «Glemt passord» → skriv e-posten → åpne lenken i e-posten og velg nytt passord.'),
      st('Bytte passord når du er innlogget', 'Profilbildet → Innstillinger → Rediger profil → Passord.'),
      st('Lenken virker ikke', 'Lenken gjelder en stund og bare én gang. Be om en ny, og bruk den siste e-posten du fikk.'),
    ],
    keywords: ['passord', 'bytte passord', 'nytt passord', 'glemt', 'tilbakestill', 'reset'],
    related: ['cant-login', 'no-email'],
  },
  {
    id: 'no-email',
    group: 'account',
    module: 'login',
    icon: 'mail-unread-outline',
    title: 'Jeg har ikke fått e-posten (invitasjon, passord, bekreftelse)',
    summary: 'E-poster fra ProTop kommer fra noreply@protop.no. De havner ofte i søppelpost eller blir stoppet av jobbens e-postfilter.',
    steps: [
      st('Sjekk søppelpost', 'Se i Søppelpost / Spam / Uønsket e-post og «Andre» i Outlook. Søk etter «ProTop».'),
      st('Vent noen minutter', 'Det kan ta opptil 5 minutter. Ikke be om ny e-post mange ganger, da blir den forrige lenken ugyldig.'),
      st('Riktig adresse', 'Sjekk at adressen er skrevet riktig. For invitasjoner: be den som inviterte deg sjekke adressen under Ansatte.'),
      st('Jobb-e-post', 'Be IT-ansvarlig godkjenne avsenderen noreply@protop.no.'),
      st('Fortsatt ingenting?', 'Opprett en sak. Vi kan se om e-posten ble sendt og sende den på nytt.'),
    ],
    keywords: ['e-post', 'epost', 'mail', 'ikke fått', 'kommer ikke', 'invitasjon', 'spam', 'søppelpost', 'bekreftelse', 'lenke'],
    related: ['invite-employee', 'verify-email', 'cant-login'],
    popular: 4,
  },
  {
    id: 'verify-email',
    group: 'account',
    module: 'login',
    icon: 'checkmark-circle-outline',
    title: 'Bekrefte e-postadressen',
    summary: 'Noen funksjoner krever bekreftet e-post. Du får en lenke på e-post når du registrerer deg.',
    steps: [
      st('Åpne lenken', 'Trykk lenken i e-posten «Bekreft e-postadressen din». Siden sier fra når det er gjort.'),
      st('Send på nytt', 'Er lenken utløpt, logger du inn og trykker «Send på nytt» på bekreftelsessiden.'),
      st('Google og Microsoft', 'Logger du inn med Google, er e-posten allerede bekreftet.'),
    ],
    keywords: ['bekrefte', 'bekreft e-post', 'verifisere', 'verify', 'e-postbekreftelse'],
    related: ['no-email'],
  },
  {
    id: 'change-email-name',
    group: 'account',
    module: 'login',
    icon: 'create-outline',
    title: 'Endre navn, bilde, e-post eller telefon',
    summary: 'Profilen din endrer du selv under Innstillinger → Rediger profil.',
    steps: [
      st('Åpne profilen', 'Trykk profilbildet øverst → Innstillinger → Rediger profil.'),
      st('Endre og lagre', 'Endre navn, bilde eller telefon og trykk Lagre.'),
      st('Ny e-postadresse', 'Bytte av innloggings-e-post krever at du bekrefter den nye adressen. Bruker du Google eller Microsoft, følger e-posten den kontoen.'),
      st('Bedriften ser feil navn?', 'Ansattkortet under Ansatte kan ha egne felt. Be en med tilgang til Ansatte rette det der.'),
    ],
    keywords: ['endre navn', 'profilbilde', 'bytte e-post', 'telefonnummer', 'profil', 'rediger profil'],
    related: ['reset-password'],
  },
  {
    id: 'invite-employee',
    group: 'people',
    module: 'ansatte',
    icon: 'person-add-outline',
    title: 'Invitere ansatte – og når invitasjonen ikke kommer frem',
    summary: 'Ansatte legges til under Ansatte. De får en e-post med lenke for å sette passord.',
    steps: [
      st('Legg til', 'Bedrift → Ansatte → «Ny ansatt». Fyll inn navn og e-post og velg nivå.'),
      st('Send invitasjonen', 'Huk av «Send velkomstmal». For mange: «Inviter brukere».'),
      st('Ikke kommet frem?', 'Sjekk at e-posten er riktig stavet, be personen se i søppelpost, og send på nytt fra personen under Ansatte.'),
      st('Allerede ProTop-bruker', 'Har personen konto fra før, logger hen inn med den samme e-posten. Bedriften dukker da opp under Bedrift.'),
    ],
    keywords: ['invitere', 'invitasjon', 'ny ansatt', 'legge til ansatt', 'velkomstmal', 'bli med', 'ansatte'],
    related: ['missing-module', 'no-email', 'switch-company'],
    popular: 5,
  },
  {
    id: 'missing-module',
    group: 'people',
    module: 'ansatte',
    icon: 'lock-closed-outline',
    title: 'Jeg ser ikke en modul, eller den er låst',
    summary: 'Det betyr nesten alltid at modulen er slått av for bedriften, eller at nivået ditt i Tilgangsstyring ikke gir tilgang.',
    steps: [
      st('Er du i riktig område?', 'Bedriftsmoduler vises bare når «Bedrift» er valgt øverst. Har du flere bedrifter, sjekk at riktig bedrift er valgt.'),
      st('Slått av for bedriften', 'Administrator: Bedriftsinnstillinger → Modulinnstillinger → slå på modulen og lagre.'),
      st('Mangler tilgang', 'Administrator: Bedriftsinnstillinger → Tilgangsstyring → flytt personen til riktig nivå. «Vis som» viser appen slik personen ser den.'),
      st('Vet ikke hvem som er administrator?', 'Opprett en sak, så hjelper vi deg å finne ut av det.'),
    ],
    keywords: ['ser ikke', 'mangler', 'låst', 'tilgang', 'modul', 'meny', 'borte', 'forsvunnet', 'rettigheter', 'nivå'],
    related: ['switch-company', 'invite-employee'],
    popular: 3,
  },
  {
    id: 'switch-company',
    group: 'start',
    module: 'home',
    icon: 'swap-horizontal-outline',
    title: 'Bytte mellom Privat, Bedrift og flere bedrifter',
    summary: 'Bryteren øverst på siden bytter mellom ditt private område og bedriften. Er du med i flere bedrifter, velger du bedrift under «Bedrift».',
    steps: [
      st('Finn bryteren', 'Øverst på alle sider står Privat | Bedrift.'),
      st('Velg bedrift', 'Er du med i flere bedrifter, får «Bedrift» en pil. Trykk den og velg bedriften.'),
      st('Ser du feil data?', 'Sjekk navnet på bedriften øverst. Data følger bedriften som er valgt.'),
    ],
    keywords: ['privat', 'bedrift', 'bytte bedrift', 'flere bedrifter', 'feil bedrift', 'arbeidsområde', 'firma'],
    related: ['missing-module'],
  },
  {
    id: 'first-steps-company',
    group: 'start',
    module: 'home',
    icon: 'flag-outline',
    title: 'Første steg for en ny bedrift',
    summary: 'Sett opp selskapet, slå på modulene dere trenger, inviter ansatte og gi dem riktig tilgang.',
    steps: [
      st('Selskapet', 'Bedrift → Selskap: sjekk navn, org.nr., adresse og logo.'),
      st('Moduler', 'Bedriftsinnstillinger → Modulinnstillinger: slå på det dere skal bruke (Timer, Faktura, Anbud, ISO …).'),
      st('Ansatte', 'Ansatte → «Ny ansatt» eller «Importer liste».'),
      st('Tilgang', 'Bedriftsinnstillinger → Tilgangsstyring: plasser hver person på riktig nivå.'),
      st('Lyspæren', 'På hver side viser lyspæren hvordan siden brukes, steg for steg.'),
    ],
    keywords: ['komme i gang', 'ny bedrift', 'oppsett', 'starte', 'første gang', 'sette opp'],
    related: ['invite-employee', 'missing-module', 'switch-company'],
    popular: 9,
  },
  {
    id: 'timesheet-lock',
    group: 'time',
    module: 'arbeid',
    icon: 'calendar-outline',
    title: 'Timelisten: føre, låse og få godkjent',
    summary: 'Du fører timer i Timeliste, låser perioden når den er ferdig, og leder godkjenner under Godkjenninger.',
    steps: [
      st('Før timer', 'Bedrift → Timer → Timeliste. Velg dag, prosjekt og antall timer.'),
      st('Lås perioden', 'Når uken eller måneden er ferdig, trykk «Lås». Låste timer kan ikke endres av deg.'),
      st('Feil i låst periode', 'Be lederen åpne perioden igjen under Godkjenninger, eller rette timene der.'),
      st('Godkjenning (leder)', 'Timer → Godkjenninger → «Kontroller» → «Godkjenn». Da er timene klare for fakturering.'),
    ],
    keywords: ['timeliste', 'timer', 'føre timer', 'låse', 'godkjenne', 'godkjenning', 'timeføring', 'overtid', 'feil timer'],
    related: ['invoice-not-sent'],
    popular: 6,
  },
  {
    id: 'absence-holiday',
    group: 'time',
    module: 'fravaer',
    icon: 'sunny-outline',
    title: 'Registrere ferie, sykdom og annet fravær',
    summary: 'Fravær registreres under Fravær. Leder godkjenner, og saldoen oppdateres.',
    steps: [
      st('Nytt fravær', 'Bedrift → Fravær → «Nytt fravær». Velg type (ferie, egenmelding, sykemelding …) og datoer.'),
      st('Godkjenning', 'Leder får varsel og godkjenner. Du ser status på fraværet ditt.'),
      st('Feil saldo?', 'Saldoen følger fraværstypene under Bedriftsinnstillinger. Be administrator sjekke dem.'),
    ],
    keywords: ['ferie', 'fravær', 'syk', 'egenmelding', 'sykemelding', 'permisjon', 'avspasering', 'feriedager'],
    related: ['timesheet-lock'],
  },
  {
    id: 'invoice-not-sent',
    group: 'finance',
    module: 'okonomi',
    icon: 'document-text-outline',
    title: 'Fakturaen ble ikke sendt eller kom ikke frem',
    summary: 'Sjekk status på fakturaen, mottakerens e-post eller EHF-adresse, og om den ble overført til regnskapssystemet.',
    steps: [
      st('Se status', 'Økonomi → Faktura → åpne fakturaen. Status og logg viser om den er sendt, og hvordan (EHF eller e-post).'),
      st('EHF', 'Kunden må være registrert i ELMA (Peppol) med org.nr. Er de ikke det, send på e-post.'),
      st('E-post', 'Sjekk e-postadressen på kunden. Be kunden se i søppelpost.'),
      st('Send på nytt', 'Trykk «Send på nytt» på fakturaen.'),
      st('Feil på fakturaen?', 'En ferdigstilt faktura kan ikke endres. Lag kreditnota og en ny faktura.'),
    ],
    keywords: ['faktura', 'ikke sendt', 'ehf', 'peppol', 'kreditnota', 'send på nytt', 'kunden fikk ikke', 'fakturere'],
    related: ['poweroffice', 'timesheet-lock'],
    popular: 7,
  },
  {
    id: 'poweroffice',
    group: 'finance',
    module: 'poweroffice',
    icon: 'sync-outline',
    title: 'PowerOffice: koble til og når overføringen feiler',
    summary: 'ProTop sender fakturaer til PowerOffice Go. Feil skyldes oftest manglende kunde, konto eller utløpt tilkobling.',
    steps: [
      st('Koble til', 'Økonomi → Innstillinger → PowerOffice. Følg stegene og godkjenn tilgangen i PowerOffice Go.'),
      st('Se feilen', 'Fakturaen viser resultat og feil fra overføringen. Teksten sier hvilket steg som stoppet.'),
      st('Vanlige årsaker', 'Kunden mangler org.nr. eller e-post, kontoen finnes ikke i kontoplanen, eller tilkoblingen er utløpt.'),
      st('Prøv igjen', 'Rett det som mangler og trykk «Overfør til PowerOffice» på nytt.'),
    ],
    keywords: ['poweroffice', 'power office', 'regnskap', 'overføring', 'synk', 'integrasjon', 'go'],
    related: ['invoice-not-sent'],
  },
  {
    id: 'tender-alerts',
    group: 'tenders',
    module: 'anbud',
    icon: 'megaphone-outline',
    title: 'Anbudsvarsler: får ingen eller feil treff',
    summary: 'Treffene styres av CPV-koder, søkeord og områder under Anbud → Innstillinger.',
    steps: [
      st('Sjekk søket', 'Anbud → Innstillinger → Varsling. Se at CPV-koder og søkeord passer det dere leverer.'),
      st('For mange treff', 'Fjern brede CPV-koder og legg til ord som skal utelukkes.'),
      st('Ingen e-post', 'Sjekk mottakerne under Varsling og søppelposten. Push krever at varsler er slått på.'),
    ],
    keywords: ['anbud', 'anbudsvarsel', 'doffin', 'cpv', 'treff', 'varsling', 'konkurranse'],
    related: ['push-notifications'],
  },
  {
    id: 'push-notifications',
    group: 'mobile',
    module: 'mobile',
    icon: 'notifications-outline',
    title: 'Varsler kommer ikke',
    summary: 'Push må være slått på både i ProTop og i nettleseren eller telefonen.',
    steps: [
      st('Slå på i ProTop', 'Profilbildet → Innstillinger → Varslinger → slå på push.'),
      st('Tillat i nettleseren', 'Står det «blokkert», trykk hengelåsen ved adressefeltet → Varsler → Tillat.'),
      st('iPhone', 'Push på iPhone krever at ProTop er lagt på hjemskjermen (Del → Legg til på Hjem-skjerm) og åpnet derfra.'),
      st('Ikke forstyrr', 'Sjekk at telefonen ikke står på «Ikke forstyrr» eller fokusmodus.'),
    ],
    keywords: ['varsler', 'push', 'notifikasjon', 'varsling', 'får ikke varsel', 'bjelle'],
    related: ['install-app'],
    popular: 8,
  },
  {
    id: 'install-app',
    group: 'mobile',
    module: 'mobile',
    icon: 'download-outline',
    title: 'ProTop på mobilen (legg til på hjemskjermen)',
    summary: 'ProTop kjører i nettleseren og kan legges på hjemskjermen som en app. Alt synkes mellom mobil og PC.',
    steps: [
      st('iPhone', 'Åpne protop.no i Safari → Del-knappen → «Legg til på Hjem-skjerm».'),
      st('Android', 'Åpne protop.no i Chrome → meny ⋮ → «Installer app» eller «Legg til på startsiden».'),
      st('PC', 'I Chrome eller Edge: ikonet for installering i adressefeltet.'),
    ],
    keywords: ['app', 'mobil', 'installere', 'hjemskjerm', 'iphone', 'android', 'last ned app', 'app store'],
    related: ['push-notifications', 'update-app'],
  },
  {
    id: 'update-app',
    group: 'troubleshoot',
    module: 'general',
    icon: 'refresh-outline',
    title: 'Få nyeste versjon av ProTop',
    summary: 'ProTop oppdateres ofte. Ser du gamle knapper eller feil som er rettet, har du en eldre versjon i minnet.',
    steps: [
      st('PC', 'Trykk Ctrl + Shift + R (Windows) eller Cmd + Shift + R (Mac).'),
      st('Mobil og hjemskjerm-app', 'Lukk appen helt (sveip den bort) og åpne den igjen.'),
      st('Versjon', 'Versjonen står nederst i Innstillinger. Oppgi den gjerne i en sak.'),
    ],
    keywords: ['oppdatere', 'ny versjon', 'gammel versjon', 'cache', 'tømme', 'refresh', 'oppdatering'],
    related: ['blank-screen'],
  },
  {
    id: 'browser-support',
    group: 'troubleshoot',
    module: 'general',
    icon: 'globe-outline',
    title: 'Hvilke nettlesere virker best?',
    summary: 'Bruk oppdatert Chrome, Edge, Safari eller Firefox. Internet Explorer støttes ikke.',
    steps: [
      st('Oppdater nettleseren', 'Gamle versjoner kan gi feil. Oppdater fra nettleserens meny.'),
      st('Utvidelser', 'Annonseblokkere og personvernutvidelser kan stoppe innlogging og opplasting. Prøv et privat vindu.'),
      st('Bedrifts-PC', 'Strenge brannmurer kan stoppe Google-tjenester som ProTop bruker. Be IT åpne for *.googleapis.com og protop.no.'),
    ],
    keywords: ['nettleser', 'chrome', 'edge', 'safari', 'firefox', 'explorer', 'brannmur', 'utvidelse', 'adblock'],
    related: ['blank-screen'],
  },
  {
    id: 'upload-fails',
    group: 'troubleshoot',
    module: 'general',
    icon: 'cloud-upload-outline',
    title: 'Opplasting av fil eller bilde feiler',
    summary: 'Sjekk filtype og størrelse. Store bilder og PDF-er over 20 MB kan stoppe.',
    steps: [
      st('Filtype', 'Bilder: JPG eller PNG. Dokumenter: PDF, Word eller Excel. iPhone-bilder (HEIC) kan lagres som JPG først.'),
      st('Størrelse', 'Gjør filen mindre, eller del den opp.'),
      st('Nettet', 'Dårlig dekning stopper opplasting. Prøv på wifi.'),
      st('Fortsatt feil', 'Opprett en sak og si hvilken fil og hvilken side det gjelder.'),
    ],
    keywords: ['laste opp', 'opplasting', 'fil', 'bilde', 'vedlegg', 'pdf', 'heic', 'for stor'],
    related: ['blank-screen'],
  },
  {
    id: 'screenshot',
    group: 'troubleshoot',
    module: 'general',
    icon: 'camera-outline',
    title: 'Slik tar du et skjermbilde',
    summary: 'Et skjermbilde viser oss nøyaktig det du ser. Legg det ved saken.',
    steps: [
      st('Windows', 'Trykk Windows + Shift + S og dra over området. Bildet lagres, og du kan lime det inn rett i saken med Ctrl + V.'),
      st('Mac', 'Trykk Cmd + Shift + 4 og dra over området. Bildet havner på skrivebordet.'),
      st('iPhone', 'Trykk sideknappen og volum opp samtidig.'),
      st('Android', 'Trykk av/på og volum ned samtidig.'),
    ],
    keywords: ['skjermbilde', 'screenshot', 'skjermdump', 'bilde av skjermen', 'print screen'],
    related: ['contact-support'],
  },
  {
    id: 'export-my-data',
    group: 'privacy',
    module: 'general',
    icon: 'download-outline',
    title: 'Last ned dataene mine eller slett kontoen',
    summary: 'Du kan laste ned det ProTop har om deg, og slette kontoen din selv.',
    steps: [
      st('Last ned', 'Konto → Personvern → «Last ned mine data».'),
      st('Slette kontoen', 'Konto → Innstillinger → «Slett konto». Det kan ikke angres.'),
      st('Bedriftsdata', 'Data du har registrert i en bedrift (timer, fakturaer …) eies av bedriften. Spør administrator der.'),
    ],
    keywords: ['personvern', 'gdpr', 'mine data', 'last ned data', 'slette konto', 'slett meg', 'innsyn'],
    related: ['privacy-ai'],
  },
  {
    id: 'privacy-ai',
    group: 'privacy',
    module: 'general',
    icon: 'sparkles-outline',
    title: 'AI i ProTop – og hvis AI er slått av',
    summary: 'Noen funksjoner bruker AI (Google Gemini) til å lese filer og foreslå tekst. Bedriften kan slå AI av.',
    steps: [
      st('Hva AI brukes til', 'Lese import- og kvitteringsfiler, foreslå tekst i timer og anbud, og svare i assistenten.'),
      st('«AI er slått av»', 'Bedriften har slått det av under Bedriftsinnstillinger. Administrator kan slå det på.'),
      st('Personopplysninger', 'Ikke send helseopplysninger eller fødselsnummer til AI med mindre det trengs.'),
    ],
    keywords: ['ai', 'kunstig intelligens', 'gemini', 'slått av', 'assistent', 'personvern ai'],
    related: ['export-my-data'],
  },
  {
    id: 'import-duplicates',
    group: 'privacy',
    module: 'general',
    icon: 'copy-outline',
    title: 'Import fra Excel: dubletter eller feil tall',
    summary: 'Importen viser en forhåndsvisning før noe lagres. Dubletter hoppes over når nummer eller org.nr. er likt.',
    steps: [
      st('Se forhåndsvisningen', 'Kontroller kolonnene før du lagrer. Rader med feil er merket.'),
      st('Dubletter', 'Importerte du to ganger, slett de doble radene eller be oss om hjelp i en sak.'),
      st('Feil tall', 'Sjekk desimaltegn (komma) og datoformat i Excel-filen.'),
    ],
    keywords: ['import', 'excel', 'dublett', 'duplikat', 'feil tall', 'feil sum', 'csv'],
    related: ['upload-fails'],
  },
  {
    id: 'contact-support',
    group: 'start',
    module: 'general',
    icon: 'chatbubbles-outline',
    title: 'Slik fungerer support og saken din',
    summary: 'Du får et saksnummer, en kvittering på e-post og svar både i ProTop og på e-post.',
    steps: [
      st('Opprett sak', 'Hjelp og support → «Kontakt support». Beskriv hva du prøvde å gjøre og hva som skjedde. Legg gjerne ved et skjermbilde.'),
      st('Saksnummer', 'Du får et saksnummer (PT-…) og en kvittering på e-post.'),
      st('Svar', 'Vi svarer i «Mine saker» og på e-post. Ber vi om mer info, står saken som «Venter på deg».'),
      st('Løst', 'Når saken er løst, får du beskjed. Er det ikke løst, svarer du innen 7 dager, så åpner vi den igjen.'),
      st('Svartid', 'Hverdager svarer vi normalt innen én arbeidsdag. Haster det, velg «Jeg kommer ikke videre».'),
    ],
    keywords: ['support', 'kontakt', 'sak', 'saksnummer', 'kundeservice', 'brukerstøtte', 'svartid', 'menneske'],
    related: ['screenshot'],
    popular: 10,
  },
];

/* ─────────── Sideveiledninger og temaer som artikler ─────────── */

const SECTION_TO_GROUP = {
  personal: 'start',
  'company-org': 'people',
  'company-people': 'time',
  'company-quality': 'quality',
  'company-productivity': 'time',
  'company-finance': 'finance',
  'company-resources': 'finance',
  'company-tenders': 'tenders',
  'company-customers': 'tenders',
  'company-meetings': 'start',
  account: 'account',
};

const TOPIC_TO_GROUP = {
  'topic.switch': 'start',
  'topic.menu': 'start',
  'topic.lightbulb': 'start',
  'topic.notifications': 'mobile',
  'topic.login': 'account',
  'topic.install': 'mobile',
  'topic.import': 'privacy',
  'topic.export': 'privacy',
  'topic.viewas': 'people',
  'topic.locked': 'people',
  'topic.security': 'privacy',
  'topic.support': 'start',
};

function pageModule(key, page) {
  const tab = page?.nav?.tab || String(key).split('.')[0];
  if (tab === 'okonomi' && /kjorebok/.test(key)) return 'kjorebok';
  return tab;
}

function pageArticle(key, page, lang) {
  return {
    id: `side-${key}`,
    kind: 'page',
    pageKey: key,
    group: SECTION_TO_GROUP[page.section] || 'start',
    module: pageModule(key, page),
    icon: page.icon ? `${String(page.icon).replace(/-outline$/, '')}-outline` : 'document-text-outline',
    title: pickText(page.title, lang) || pickText(page.label, lang),
    summary: pickText(page.pitch, lang),
    path: pickText(page.path, lang),
    nav: page.nav || null,
    steps: (page.steps || []).map((s) => st(pickText(s.title, lang), pickText(s, lang) || s[lang] || s.nb || '')),
    faq: (page.faq || []).map((f) => ({ q: pickText(f.q || f.question, lang), a: pickText(f.a || f.answer, lang) })).filter((f) => f.q),
    keywords: [...(page.keywords || []), pickText(page.label, lang)],
    related: [],
  };
}

function topicArticle(topic, lang) {
  return {
    id: `tema-${String(topic.id).replace(/^topic\./, '')}`,
    kind: 'topic',
    group: TOPIC_TO_GROUP[topic.id] || 'start',
    module: 'general',
    icon: 'information-circle-outline',
    title: pickText(topic.title, lang),
    summary: pickText(topic.summary, lang),
    nav: topic.nav || null,
    requires: topic.requires || null,
    steps: (topic.steps || []).map((s) => st(pickText(s.title, lang), s[lang] || s.nb || '')),
    keywords: topic.keywords || [],
    related: [],
  };
}

const cache = new Map();

/** Alle artikler, med støtteartiklene først. */
export function listArticles(lang = 'nb') {
  if (cache.has(lang)) return cache.get(lang);
  const support = SUPPORT_ARTICLES.map((a) => ({ kind: 'support', ...a }));
  const pages = Object.entries(PROTOP_PAGES || {})
    .filter(([, page]) => page && !page.hidden && page.title)
    .map(([key, page]) => pageArticle(key, page, lang));
  const topics = (ASSISTANT_TOPICS || []).map((t) => topicArticle(t, lang));
  const all = [...support, ...topics, ...pages];
  const index = all.map((a) => ({ article: a, fields: indexFields(a) }));
  const out = { all, byId: new Map(all.map((a) => [a.id, a])), index };
  cache.set(lang, out);
  return out;
}

export function getArticle(id, lang = 'nb') {
  return listArticles(lang).byId.get(id) || null;
}

export function articlesInGroup(groupId, lang = 'nb') {
  return listArticles(lang).all.filter((a) => a.group === groupId);
}

export function groupCounts(lang = 'nb') {
  const out = {};
  for (const a of listArticles(lang).all) out[a.group] = (out[a.group] || 0) + 1;
  return out;
}

/** «Mest stilte spørsmål»: kuraterte, eventuelt justert med visninger fra serveren. */
export function popularArticles(lang = 'nb', { limit = 10, views = null } = {}) {
  const rows = SUPPORT_ARTICLES.filter((a) => a.popular).map((a) => getArticle(a.id, lang));
  const score = (a) => {
    const base = 100 - (SUPPORT_ARTICLES.find((s) => s.id === a.id)?.popular || 50);
    return base + (views && views[a.id] ? Math.log2(1 + views[a.id]) * 4 : 0);
  };
  return rows.sort((a, b) => score(b) - score(a)).slice(0, limit);
}

export function relatedArticles(article, lang = 'nb', limit = 4) {
  if (!article) return [];
  const { byId } = listArticles(lang);
  const out = (article.related || []).map((id) => byId.get(id)).filter(Boolean);
  if (out.length < limit) {
    const more = searchArticles(`${article.title} ${(article.keywords || []).slice(0, 3).join(' ')}`, { lang, limit: limit + 3 })
      .map((r) => r.article)
      .filter((a) => a.id !== article.id && !out.some((o) => o.id === a.id));
    out.push(...more);
  }
  return out.slice(0, limit);
}

/* ─────────── Søk ─────────── */

const STOP = new Set(('og i på til av for med som er det en et den at jeg du vi de har kan ikke å seg om men så fra ble blir hva hvor hvordan '
  + 'min mitt mine din ditt dine når skal vil får få meg deg oss noe noen alle eller da nå the a an to of in on is how do i my '
  // Ord uten innhold i en supportsak («Test», «Hei», «Problem»).
  + 'test teste testing testsak hei hallo problem problemer sak saken spørsmål lurer').split(' '));

/** Små ord som betyr det samme i supportsammenheng. */
const SYNONYMS = {
  logge: ['innlogging', 'login', 'passord'],
  login: ['innlogging', 'logge'],
  passord: ['innlogging', 'login'],
  epost: ['e-post', 'mail'],
  mail: ['e-post', 'epost'],
  hvit: ['blank', 'laster'],
  blank: ['hvit', 'laster'],
  henger: ['laster', 'fryser'],
  krasj: ['feil', 'henger'],
  error: ['feil', 'feilmelding'],
  bug: ['feil'],
  feil: ['error', 'virker'],
  funker: ['virker', 'fungerer'],
  fungerer: ['virker'],
  ansatt: ['ansatte', 'invitere'],
  invitere: ['invitasjon', 'ansatt'],
  timer: ['timeliste', 'timeføring'],
  ferie: ['fravær'],
  syk: ['fravær', 'sykemelding', 'egenmelding'],
  faktura: ['fakturaen', 'fakturere'],
  varsel: ['varsler', 'push', 'varsling'],
  varsler: ['push', 'varsling'],
  app: ['mobil', 'installere'],
  mobil: ['app', 'telefon'],
  slette: ['slett', 'sletting'],
  tilgang: ['låst', 'rettigheter', 'nivå'],
};

export function foldText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[æ]/g, 'ae')
    .replace(/[ø]/g, 'o')
    .replace(/[å]/g, 'a')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Grov norsk stamme: fjerner vanlige bøyningsendelser. */
export function stem(word) {
  let w = word;
  for (const suffix of ['ene', 'ane', 'ende', 'ing', 'ene', 'ens', 'ets', 'er', 'en', 'et', 'ar', 'te', 'de', 'a', 'e', 's']) {
    if (w.length - suffix.length >= 4 && w.endsWith(suffix)) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  return w;
}

export function queryTerms(query) {
  const words = foldText(query).split(/[\s-]+/).filter((w) => w && !STOP.has(w));
  const terms = [];
  for (const w of words) {
    terms.push({ word: w, stem: stem(w), weight: 1 });
    for (const syn of SYNONYMS[w] || []) {
      const f = foldText(syn);
      terms.push({ word: f, stem: stem(f), weight: 0.45 });
    }
  }
  return terms;
}

function indexFields(article) {
  const steps = (article.steps || []).map((s) => `${s.title} ${s.body}`).join(' ');
  const faq = (article.faq || []).map((f) => `${f.q} ${f.a}`).join(' ');
  const toks = (t) => foldText(t).split(/[\s-]+/).filter(Boolean);
  return {
    title: toks(article.title),
    keywords: toks((article.keywords || []).join(' ')),
    keywordPhrases: (article.keywords || []).map((k) => foldText(k)),
    summary: toks(`${article.summary || ''} ${article.path || ''}`),
    body: toks(`${steps} ${faq}`),
  };
}

/** Tåler én skrivefeil i ord på 5+ bokstaver. */
function nearlyEqual(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || a.length < 5) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else { i += 1; j += 1; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function fieldScore(tokens, term, { prefix }) {
  let best = 0;
  for (const tok of tokens) {
    if (tok === term.word) return 1;
    const ts = stem(tok);
    if (ts === term.stem) best = Math.max(best, 0.9);
    else if (prefix && term.word.length >= 3 && tok.startsWith(term.word)) best = Math.max(best, 0.75);
    else if (term.word.length >= 5 && tok.length >= 5 && (tok.includes(term.stem) || term.word.includes(ts))) best = Math.max(best, 0.55);
    else if (nearlyEqual(tok, term.word)) best = Math.max(best, 0.6);
  }
  return best;
}

/**
 * Søk i alle artikler. Returnerer [{ article, score }] sortert.
 * Siste ord regnes som påbegynt (søk mens du skriver).
 */
export function searchArticles(query, { lang = 'nb', limit = 12, group = '' } = {}) {
  const terms = queryTerms(query);
  if (!terms.length) return [];
  const folded = foldText(query);
  const lastWord = folded.split(' ').pop();
  const { index } = listArticles(lang);
  const results = [];
  const primary = terms.filter((t) => t.weight === 1).length || 1;
  for (const { article, fields } of index) {
    if (group && article.group !== group) continue;
    let score = 0;
    let matchedPrimary = 0;
    for (const term of terms) {
      const prefix = term.word === lastWord;
      const s = Math.max(
        fieldScore(fields.title, term, { prefix }) * 6,
        fieldScore(fields.keywords, term, { prefix }) * 5,
        fieldScore(fields.summary, term, { prefix }) * 2.5,
        fieldScore(fields.body, term, { prefix }) * 1.2,
      );
      if (s > 0 && term.weight === 1) matchedPrimary += 1;
      score += s * term.weight;
    }
    if (!score) continue;
    for (const phrase of fields.keywordPhrases) {
      if (phrase.includes(' ') && folded.includes(phrase)) score += 6;
    }
    score *= 0.5 + 0.5 * (matchedPrimary / primary);
    if (article.kind === 'support') score *= 1.25;
    if (article.kind === 'topic') score *= 1.1;
    results.push({ article, score: Math.round(score * 10) / 10 });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Forslag mens brukeren skriver en sak (ticket deflection). */
export function suggestForTicket({ subject = '', body = '', lang = 'nb', limit = 3 } = {}) {
  const text = `${subject} ${subject} ${String(body).slice(0, 400)}`;
  return searchArticles(text, { lang, limit: limit + 2 })
    .filter((r) => r.score >= 8)
    .slice(0, limit)
    .map((r) => r.article);
}

/** Kunnskap til AI (server): kort tekst for de mest relevante artiklene. */
export function knowledgeSnippets(query, { lang = 'nb', limit = 5 } = {}) {
  return searchArticles(query, { lang, limit }).map(({ article }) => ({
    id: article.id,
    title: article.title,
    text: [
      article.summary,
      ...(article.steps || []).map((s, i) => `${i + 1}. ${s.title}: ${s.body}`),
    ].join('\n').slice(0, 1200),
  }));
}

export function articleGroupTitle(groupId, lang = 'nb') {
  const g = ARTICLE_GROUPS.find((row) => row.id === groupId);
  return g ? pickText(g.title, lang) : '';
}

export { HELP_SECTIONS };
