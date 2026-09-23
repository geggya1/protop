import { LEGAL_VERSION } from './langs';

/** Oppdatert: 20. august 2026 — familieapp + idrettslag. */

const TERMS_NB = [
  'WEEKPLAN BRUKERVILKÅR',
  'Sist oppdatert: 20. august 2026',
  '1. Aksept av vilkårene',
  'Disse vilkårene regulerer bruk av ProTop (appen og protop.no), heretter «tjenesten». Når du oppretter konto eller bruker tjenesten, inngår du avtale med ProTop (protop.no) på disse vilkårene.',
  'ProTop er en familie- og husholdsplanlegger: kalender, gjøremål, belønning, meldinger, notater, handleliste, bokhylle, aktiviteter og valgfri AI-hjelp. I tillegg kan du bruke idrettslag-/lagmodus for lag, arrangementer og lagkommunikasjon, med mulighet til å bytte mellom familie- og lagsvisning.',
  '2. Roller i familien',
  'En foresatt (forelder/verge) kan opprette eller administrere en familiegruppe, legge til barn og andre foresatte, og styre innstillinger. Barn kan ha egne innlogginger knyttet til familien. Du som foresatt er ansvarlig for at barn under den nasjonale digitalaldersgrensen (typisk 13 år i Norge, ellers etter land) har nødvendig samtykke, og for hvordan barnets profil brukes.',
  '3. Alder',
  'For å opprette og administrere en familiekonto må du være myndig der du bor, eller ha nødvendig foresattesamtykke. Barn under 15 år skal normalt kun bruke tjenesten via en foresatt som har registrert dem. Delvis funksjonalitet (f.eks. AI-chat for barn) kan ha egne aldersbegrensninger.',
  '4. Endringer',
  'Vi kan endre vilkårene. Vesentlige endringer varsles på egnet måte i tjenesten eller på e-post. Fortsatt bruk etter endring anses som aksept. Vi utvikler tjenesten løpende og kan legge til, endre eller fjerne funksjoner.',
  '5. Akseptabel bruk',
  'Du skal bruke ProTop i tråd med formålet: trygg planlegging og kommunikasjon i familien. Du skal blant annet ikke: bruke tjenesten til ulovlig aktivitet; publisere krenkende, trakasserende eller upassende innhold; laste opp materiale du ikke har rettigheter til; forsøke å omgå sikkerhet; dele passord; eller misbruke andres personopplysninger utenfor familiens legitime behov.',
  'Ved brudd kan vi stenge eller begrense kontoen. Vi kan fjerne innhold som bryter vilkårene.',
  '6. Tredjepartstjenester',
  'Deler av tjenesten bygger på underleverandører, blant annet Google Firebase (innlogging, database, filer), Google Gemini (valgfri AI for foresatte), kart-/stedsoppslag og produktoppslag (f.eks. Open Food Facts). Bruk kan også omfattes av deres vilkår. Vi er ikke ansvarlige for feil eller utilgjengelighet hos tredjepart utover det ufravikelig forbrukerrett krever.',
  '7. Drift og feil',
  'Tjenesten kan være midlertidig utilgjengelig pga. vedlikehold eller feil. Meld feil til https://protop.no. ProTop tilbys uten særskilt betaling for grunnfunksjoner; erstatningskrav for indirekte tap begrenses i den grad loven tillater det. Ufravikelig forbrukervern gjelder.',
  '8. Innhold og opphavsrett',
  'ProTop eier merkevare, design og eget innhold. Du beholder rettighetene til ditt innhold (tekst, bilder m.m.) og gir oss en begrenset lisens til å lagre og vise det for å levere tjenesten. Du er ansvarlig for det du publiserer.',
  '9. Oppsigelse',
  'Du kan avslutte ved å slutte å bruke tjenesten og slette profil/konto. Vi kan avslutte avtalen med rimelig varsel der det er praktisk mulig. Se personvernerklæringen for sletting av personopplysninger.',
  '10. Personvern',
  'Behandling av personopplysninger er beskrevet i personvernerklæringen.',
  '11. Tvister',
  'Norsk rett gjelder. Tvister som ikke løses i minnelighet, kan bringes inn for norske domstoler, med forbehold for ufravikelig forbrukerverneting.',
  '12. Kontakt',
  'ProTop · protop.no · https://protop.no · Personvern: https://protop.no',
];

const PRIVACY_NB = [
  'PERSONVERNERKLÆRING FOR WEEKPLAN',
  'Sist oppdatert: 20. august 2026',
  'Kort fortalt: ProTop (protop.no) er behandlingsansvarlig. Vi behandler opplysninger for å levere familieplanleggeren (kalender, gjøremål, belønning, chat, notater m.m.). Barn under den lovpålagte alderen krever foresattesamtykke. Vi selger ikke personopplysninger.',
  '1. Hvem vi er',
  'Behandlingsansvarlig: ProTop (protop.no). Kontakt: https://protop.no. Ved spørsmål om personvern, bruk samme adresse.',
  '2. Opplysninger vi behandler',
  'Profil: navn, brukernavn, e-post og/eller telefon, fødselsdato/alder, valgfritt kjønn, sted og profilbilde.',
  'Familieinnhold: gjøremål, belønning/poeng, kalenderhendelser, timeplan, notater, handleliste, bøker, aktiviteter, familiemeldinger og varsler.',
  'Barn: foresatte kan opprette barneprofiler. Opplysninger om barn behandles for å levere tjenesten i familien, under foresattes ansvar.',
  'Teknisk: innloggingsdata, enhets-/nettleserinfo, IP (i begrenset omfang via infrastruktur), feillogger og bruksstatistikk der det er nødvendig for drift.',
  'AI: foresatte kan bruke «Spør AI» (Google Gemini der nøkkel er konfigurert) og bildeimport av ukeplan. Barns AI-svar kjøres lokalt uten Gemini der systemet er satt opp slik. AI-chattråder for foresatte/bruker kan lagres i kontoen din slik at du kan åpne dem igjen. Bildeimport: bilde lagres midlertidig (inntil ca. 48 timer) til du godkjenner/avviser; utkast slettes automatisk etter inntil 30 dager. Gratisnivå har daglig kvote for AI-import.',
  'Kalenderintegrasjon: hvis du kobler ekstern kalender, behandles nødvendige OAuth-tokens og synkroniserte hendelser for å vise dem i ProTop.',
  '3. Formål og rettslig grunnlag',
  'Avtale: levere tjenesten du ber om (innlogging, familiegruppe, funksjoner).',
  'Samtykke: valgfrie opplysninger (f.eks. bilde, sted), markedsføringstips der du har sagt ja, og cookies der eKom-loven krever det.',
  'Berettiget interesse: sikkerhet, misbruksforebygging, forbedring av tjenesten (ofte aggregert/anonymisert).',
  'Rettslig plikt: der loven krever lagring eller utlevering.',
  '4. Deling og underleverandører',
  'Vi deler ikke familieinnhold med andre familier. Underleverandører behandler data for oss etter avtale, bl.a. Google Firebase (EU/EØS der mulig, europe-west1). AI-forespørsler fra foresatte kan behandles av Google Gemini. Internasjonale overføringer sikres med egnede mekanismer (f.eks. standardkontraktsklausuler) der det er relevant.',
  '5. Dine rettigheter',
  'Du har rett til innsyn, retting, sletting, begrensning, dataportabilitet og å protestere, samt å klage til Datatilsynet (eller tilsvarende i ditt land). Kontakt https://protop.no. Enkelte rettigheter kan begrenses av lov eller andres rettigheter.',
  '6. Lagringstid',
  'Vi lagrer så lenge kontoen/familien er aktiv og det er nødvendig for formålet, deretter slettes eller anonymiseres opplysninger med mindre loven krever lengre oppbevaring. Slettet barneprofil uten egen kontaktinfo fjernes typisk fra familien; profiler med e-post/telefon kan beholde egen konto uten familiens tilgang.',
  '7. Barn',
  'Barn under 13 år (Norge) / tilsvarende grense i andre land skal ha foresattesamtykke. Foresatte ser barnets aktivitet i felles familie. Vi tilpasser AI og funksjoner for barn; personlig markedsføring rettet mot barn under 18 unngås.',
  '8. Sikkerhet',
  'Vi bruker innlogging, rollebasert tilgang, HTTPS og sikret fillagring. Ingen system er risikofritt; varsle oss ved mistanke om misbruk.',
  '9. Markedsføring',
  'Vi kan sende tjenesterelaterte meldinger (f.eks. sikkerhet). Markedsføringstips/produktnyheter sendes bare der loven tillater det og/eller du har samtykket. Du kan når som helst trekke samtykke i Personvern og vilkår.',
  '10. Endringer',
  'Vi oppdaterer erklæringen ved behov. Vesentlige endringer varsles på egnet måte.',
];

const TERMS_EN = [
  'WEEKPLAN TERMS OF USE',
  'Last updated: 20 August 2026',
  '1. Acceptance',
  'These terms govern ProTop (the app and protop.no). By creating an account or using the service you agree with ProTop (protop.no).',
  'ProTop is a family and household planner: calendar, tasks, rewards, messaging, notes, shopping list, bookshelf, activities and optional AI help. You can also use sports-team mode for teams, events and team communication, with the ability to switch between family and team views.',
  '2. Family roles',
  'A parent/guardian may create or administer a family group, add children and other adults, and manage settings. Children may have logins linked to the family. Guardians are responsible for consent where required and for how a child’s profile is used.',
  '3. Age',
  'To create and administer a family account you must be of legal age where you live, or have required guardian consent. Children under 15 should normally use the service through a guardian who registered them.',
  '4. Changes',
  'We may change these terms. Material changes will be notified appropriately. Continued use means acceptance. We may add, change or remove features.',
  '5. Acceptable use',
  'Use ProTop for safe family planning and communication. Do not use it for illegal activity; post harmful content; upload material you lack rights to; bypass security; share passwords; or misuse others’ personal data.',
  'We may suspend accounts and remove content that breaches these terms.',
  '6. Third parties',
  'The service relies on providers such as Google Firebase, Google Gemini (optional parent AI), maps/geocoding and product lookup (e.g. Open Food Facts). Their terms may also apply.',
  '7. Availability',
  'The service may be unavailable for maintenance or faults. Report issues to https://protop.no. Mandatory consumer rights are not limited.',
  '8. Content',
  'ProTop owns its brand and software. You keep rights to your content and grant us a limited licence to store and display it to run the service.',
  '9. Termination',
  'You may stop using the service and delete your account. See the privacy policy for personal data deletion.',
  '10. Privacy',
  'Personal data is processed under the Privacy Policy.',
  '11. Disputes',
  'Norwegian law applies, subject to mandatory consumer protections.',
  '12. Contact',
  'ProTop · protop.no · https://protop.no',
];

const PRIVACY_EN = [
  'WEEKPLAN PRIVACY POLICY',
  'Last updated: 20 August 2026',
  'In short: ProTop (protop.no) is the controller. We process data to provide the family planner. Children under the applicable digital age need guardian consent. We do not sell personal data.',
  '1. Who we are',
  'Controller: ProTop (protop.no). Contact: https://protop.no.',
  '2. Data we process',
  'Profile: name, username, email and/or phone, date of birth/age, optional gender, location and photo.',
  'Family content: tasks, rewards, calendar, timetable, notes, shopping list, books, activities, family messages and notifications.',
  'Children: guardians may create child profiles for family use under guardian responsibility.',
  'Technical: auth data, device/browser info, limited IP via infrastructure, logs needed for operations.',
  'AI: parents may use Ask AI (Google Gemini when configured) and photo import of weekly plans. Child AI replies may run locally without Gemini. AI chat threads may be stored on your account so you can reopen them. Import photos are temporary (about 48 hours) until you approve/reject; drafts auto-delete within about 30 days. Free tier has a daily AI import quota.',
  'Calendar sync: if you connect an external calendar, we process tokens and events needed to display them.',
  '3. Purposes and legal bases',
  'Contract: delivering the service. Consent: optional data, marketing tips where opted in, cookies where required. Legitimate interests: security, abuse prevention, product improvement (often aggregated). Legal obligation where required.',
  '4. Sharing',
  'We do not share family content with other families. Processors (e.g. Google Firebase in the EU/EEA where possible) act under contract. Parent AI requests may be processed by Google Gemini. International transfers use appropriate safeguards where needed.',
  '5. Your rights',
  'Access, rectification, erasure, restriction, portability, objection, and complaint to your DPA. Contact https://protop.no.',
  '6. Retention',
  'We keep data while needed for the account/family, then delete or anonymise unless law requires longer retention.',
  '7. Children',
  'Under 13 in Norway (or local equivalent) requires guardian consent. Guardians can see child activity in shared family spaces. We avoid personalised marketing aimed at under-18s.',
  '8. Security',
  'Login, role-based access, HTTPS and secured file storage.',
  '9. Marketing',
  'Service messages may be sent as needed. Product tips require a lawful basis and/or consent; you can withdraw in Privacy and terms.',
  '10. Changes',
  'We update this policy as needed and notify of material changes.',
];

/** Kortversjon for øvrige språk — peker til samme prinsipper. */
function shortTerms(lines) {
  return lines;
}

const LEGAL = {
  nb: { terms: TERMS_NB, privacy: PRIVACY_NB },
  en: { terms: TERMS_EN, privacy: PRIVACY_EN },
  da: {
    terms: shortTerms([
      'WEEKPLAN BRUGERVILKÅR (familieapp)',
      'Senest opdateret: 20. august 2026',
      'ProTop er en familieplanlægger (kalender, opgaver, belønning, chat m.m.), ikke en idrætsklub-løsning.',
      'Ved brug accepterer du aftalen med ProTop (protop.no). Værge er ansvarlig for børneprofiler.',
      'Brug tjenesten lovligt og respektfuldt. Kontakt: https://protop.no. Norsk ret gælder med forbehold for ufravigelig forbrugerbeskyttelse.',
      'Fuld tekst er tilgængelig på norsk/engelsk i appen.',
    ]),
    privacy: shortTerms([
      'PERSONVERNERKLÆRING — WEEKPLAN',
      'ProTop (protop.no) er dataansvarlig. Vi behandler profil- og familieoplysninger for at levere tjenesten.',
      'Børn under den lovpligtige alder kræver værgesamtykke. Vi sælger ikke personoplysninger.',
      'Underleverandører bl.a. Google Firebase (EU/EØS hvor muligt). AI til voksne kan bruge Google Gemini; chattråde kan gemmes på din konto.',
      'Rettigheder: indsigt, rettelse, sletning m.m. via https://protop.no. Klage til dit tilsyn.',
    ]),
  },
  sv: {
    terms: shortTerms([
      'WEEKPLAN ANVÄNDARVILLKOR (familjeapp)',
      'Senast uppdaterad: 20 augusti 2026',
      'ProTop är en familjeplanerare, inte en idrottsklubbsplattform. Genom att använda tjänsten ingår du avtal med ProTop (protop.no).',
      'Vårdnadshavare ansvarar för barnprofiler. Använd tjänsten lagligt. Kontakt: https://protop.no.',
    ]),
    privacy: shortTerms([
      'INTEGRITETSPOLICY — WEEKPLAN',
      'ProTop är personuppgiftsansvarig. Vi behandlar profil- och familjedata för att leverera tjänsten. Vi säljer inte uppgifter.',
      'Barn under lagstadgad ålder kräver vårdnadshavares samtycke. Firebase i EU/EES där möjligt. Rättigheter via https://protop.no.',
    ]),
  },
  fi: {
    terms: shortTerms([
      'WEEKPLANIN KÄYTTÖEHDOT (perhesovellus)',
      'Päivitetty: 20. elokuuta 2026',
      'ProTop on perhesuunnittelusovellus. Käyttämällä hyväksyt sopimuksen ProTopin (protop.no) kanssa. Huoltaja vastaa lapsiprofiileista.',
      'Yhteys: https://protop.no.',
    ]),
    privacy: shortTerms([
      'TIETOSUOJASELOSTE — WEEKPLAN',
      'ProTop on rekisterinpitäjä. Käsittelemme profiili- ja perhetietoja palvelun tarjoamiseksi. Emme myy tietoja.',
      'Oikeudet: https://protop.no.',
    ]),
  },
  pl: {
    terms: shortTerms([
      'REGULAMIN WEEKPLAN (aplikacja rodzinna)',
      'Aktualizacja: 20 sierpnia 2026',
      'ProTop to planer rodzinny. Korzystanie oznacza umowę z ProTop (protop.no). Opiekun odpowiada za profile dzieci.',
      'Kontakt: https://protop.no.',
    ]),
    privacy: shortTerms([
      'POLITYKA PRYWATNOŚCI — WEEKPLAN',
      'ProTop jest administratorem. Przetwarzamy dane profilu i rodziny, aby świadczyć usługę. Nie sprzedajemy danych.',
      'Prawa: https://protop.no.',
    ]),
  },
  es: {
    terms: shortTerms([
      'TÉRMINOS DE WEEKPLAN (app familiar)',
      'Actualizado: 20 de agosto de 2026',
      'ProTop es un planificador familiar. Al usarlo aceptas el acuerdo con ProTop (protop.no). El tutor responde de perfiles infantiles.',
      'Contacto: https://protop.no.',
    ]),
    privacy: shortTerms([
      'POLÍTICA DE PRIVACIDAD — WEEKPLAN',
      'ProTop es el responsable. Tratamos datos de perfil y familia para prestar el servicio. No vendemos datos.',
      'Derechos: https://protop.no.',
    ]),
  },
  fr: {
    terms: shortTerms([
      'CONDITIONS WEEKPLAN (app familiale)',
      'Mis à jour : 20 août 2026',
      'ProTop est un planificateur familial. En l’utilisant, tu acceptes l’accord avec ProTop (protop.no). Le tuteur est responsable des profils enfants.',
      'Contact : https://protop.no.',
    ]),
    privacy: shortTerms([
      'POLITIQUE DE CONFIDENTIALITÉ — WEEKPLAN',
      'ProTop est le responsable du traitement. Nous traitons les données de profil et de famille pour fournir le service. Nous ne vendons pas les données.',
      'Droits : https://protop.no.',
    ]),
  },
  de: {
    terms: shortTerms([
      'WEEKPLAN NUTZUNGSBEDINGUNGEN (Familien-App)',
      'Stand: 20. August 2026',
      'ProTop ist ein Familienplaner. Mit der Nutzung akzeptierst du die Vereinbarung mit ProTop (protop.no). Erziehungsberechtigte verantworten Kinderprofile.',
      'Kontakt: https://protop.no.',
    ]),
    privacy: shortTerms([
      'DATENSCHUTZERKLÄRUNG — WEEKPLAN',
      'ProTop ist Verantwortlicher. Wir verarbeiten Profil- und Familiendaten zur Bereitstellung des Dienstes. Wir verkaufen keine Daten.',
      'Rechte: https://protop.no.',
    ]),
  },
};

/** Legacy wizard sections — mapped from full docs for consent UI. */
function packFor(lang) {
  return LEGAL[lang] || LEGAL.en;
}

export function getTerms(lang) {
  return packFor(lang).terms;
}

export function getPrivacy(lang) {
  return packFor(lang).privacy;
}

export function legalPages(lang) {
  const pack = packFor(lang);
  return [
    { id: 'terms', key: 'legal.terms', paragraphs: pack.terms },
    { id: 'privacy', key: 'legal.privacy', paragraphs: pack.privacy },
  ].map((p) => ({ ...p, version: LEGAL_VERSION }));
}

/** All legal sections on one scrollable page (wizard / modal). */
export function legalDocument(lang) {
  return legalPages(lang);
}

/** Third-party attributions shown on Licenses screen. */
export const APP_LICENSES = [
  { name: 'React', copyright: '© Meta Platforms, Inc. and affiliates' },
  { name: 'React Native', copyright: '© Meta Platforms, Inc. and affiliates' },
  { name: 'Expo', copyright: '© 650 Industries, Inc. (Expo)' },
  { name: 'Firebase', copyright: '© Google LLC' },
  { name: 'Google Gemini API', copyright: '© Google LLC (optional AI features)' },
  { name: 'React Navigation', copyright: '© React Navigation contributors' },
  { name: 'Ionicons / Expo Vector Icons', copyright: '© Ionic / Expo contributors' },
  { name: 'react-native-gesture-handler', copyright: '© Software Mansion' },
  { name: 'react-native-screens', copyright: '© Software Mansion' },
  { name: 'react-native-safe-area-context', copyright: '© Th3rd Wave' },
  { name: 'AsyncStorage', copyright: '© React Native Community' },
  { name: 'Open Food Facts', copyright: '© Open Food Facts contributors (product lookup)' },
  { name: 'OpenStreetMap / Nominatim', copyright: '© OpenStreetMap contributors (geocoding)' },
  { name: '@zxing/browser', copyright: '© ZXing authors (barcode scanning)' },
];
