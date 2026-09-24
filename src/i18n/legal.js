import { LEGAL_VERSION } from './langs';

/** Oppdatert: 24. september 2026 — ProTop, ikke Weekplan. */

const TERMS_NB = [
  'PROTOP BRUKERVILKÅR',
  'Sist oppdatert: 24. september 2026',
  '1. Aksept av vilkårene',
  'Disse vilkårene regulerer bruk av ProTop (appen og protop.no), heretter «tjenesten». Når du oppretter konto eller bruker tjenesten, inngår du avtale med ProTop (protop.no) på disse vilkårene.',
  'ProTop er digitale løsninger for bygg og anlegg. Tjenesten er samhandling: hjem, venner, kalender, e-post, oppgaver og notat, med innstillinger, varslinger og hjelp. Skallet er det samme på mobil, nettbrett og web.',
  '2. Konto',
  'Du må kunne inngå avtale der du bor. Du er ansvarlig for kontoen din, for påloggingen, og for innhold du legger inn om deg selv og andre.',
  '3. Grupper',
  'Du kan opprette eller bli med i grupper for samhandling. Den som administrerer en gruppe styrer medlemmer og innstillinger for gruppen. Du skal bare legge til personer som skal ha tilgang.',
  '4. Endringer',
  'Vi kan endre vilkårene. Vesentlige endringer varsles på egnet måte i tjenesten eller på e-post. Fortsatt bruk etter endring anses som aksept. Vi utvikler tjenesten løpende og kan legge til, endre eller fjerne funksjoner.',
  '5. Akseptabel bruk',
  'Du skal bruke ProTop til samhandling i tråd med formålet. Du skal blant annet ikke: bruke tjenesten til ulovlig aktivitet; publisere krenkende, trakasserende eller upassende innhold; laste opp materiale du ikke har rettigheter til; forsøke å omgå sikkerhet; dele passord; eller misbruke andres personopplysninger.',
  'Ved brudd kan vi stenge eller begrense kontoen. Vi kan fjerne innhold som bryter vilkårene.',
  '6. Tredjepartstjenester',
  'Deler av tjenesten bygger på underleverandører, blant annet Google (innlogging), Google Firebase (database og filer), Google Gemini (valgfri AI) og kart-/stedsoppslag. Bruk kan også omfattes av deres vilkår. Vi er ikke ansvarlige for feil eller utilgjengelighet hos tredjepart utover det ufravikelig forbrukerrett krever.',
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
  'PERSONVERNERKLÆRING FOR PROTOP',
  'Sist oppdatert: 24. september 2026',
  'Kort fortalt: ProTop (protop.no) er behandlingsansvarlig. Vi behandler opplysninger for å levere samhandling for bygg og anlegg (hjem, venner, kalender, e-post, oppgaver, notat, innstillinger, varslinger og hjelp). Vi selger ikke personopplysninger.',
  '1. Hvem vi er',
  'Behandlingsansvarlig: ProTop (protop.no). Kontakt: https://protop.no. Ved spørsmål om personvern, bruk samme adresse.',
  '2. Opplysninger vi behandler',
  'Profil: navn, brukernavn, e-post og/eller telefon, valgfritt kjønn og profilbilde. Profilbilde kan hentes fra Google-kontoen når du logger inn med Google.',
  'Innhold: det du og gruppen legger inn, som kalender, e-post, oppgaver, notater, meldinger og varsler.',
  'Teknisk: innloggingsdata, enhets-/nettleserinfo, IP (i begrenset omfang via infrastruktur), feillogger og bruksstatistikk der det er nødvendig for drift.',
  'AI: hvis du bruker AI i tjenesten, kan forespørselen behandles av Google Gemini der det er satt opp. Slike tråder kan lagres på kontoen din slik at du kan åpne dem igjen.',
  'Kalenderintegrasjon: hvis du kobler ekstern kalender, behandles nødvendige OAuth-tokens og synkroniserte hendelser for å vise dem i ProTop.',
  '3. Formål og rettslig grunnlag',
  'Avtale: levere tjenesten du ber om (innlogging, grupper og funksjoner).',
  'Samtykke: valgfrie opplysninger (f.eks. bilde), markedsføringstips der du har sagt ja, og cookies der eKom-loven krever det.',
  'Berettiget interesse: sikkerhet, misbruksforebygging, forbedring av tjenesten (ofte aggregert/anonymisert).',
  'Rettslig plikt: der loven krever lagring eller utlevering.',
  '4. Deling og underleverandører',
  'Vi deler ikke innholdet ditt med andre enn dem du selv har gitt tilgang i en gruppe. Underleverandører behandler data for oss etter avtale, bl.a. Google Firebase (EU/EØS der mulig, europe-west1). AI-forespørsler kan behandles av Google Gemini. Internasjonale overføringer sikres med egnede mekanismer (f.eks. standardkontraktsklausuler) der det er relevant.',
  '5. Dine rettigheter',
  'Du har rett til innsyn, retting, sletting, begrensning, dataportabilitet og å protestere, samt å klage til Datatilsynet (eller tilsvarende i ditt land). Kontakt https://protop.no. Enkelte rettigheter kan begrenses av lov eller andres rettigheter.',
  '6. Lagringstid',
  'Vi lagrer så lenge kontoen er aktiv og det er nødvendig for formålet, deretter slettes eller anonymiseres opplysninger med mindre loven krever lengre oppbevaring.',
  '7. Alder',
  'Tjenesten er for brukere som kan inngå avtale. Vi retter ikke markedsføring mot barn.',
  '8. Sikkerhet',
  'Vi bruker innlogging, rollebasert tilgang, HTTPS og sikret fillagring. Ingen system er risikofritt; varsle oss ved mistanke om misbruk.',
  '9. Markedsføring',
  'Vi kan sende tjenesterelaterte meldinger (f.eks. sikkerhet). Markedsføringstips/produktnyheter sendes bare der loven tillater det og/eller du har samtykket. Du kan når som helst trekke samtykke i Personvern og vilkår.',
  '10. Endringer',
  'Vi oppdaterer erklæringen ved behov. Vesentlige endringer varsles på egnet måte.',
];

const TERMS_EN = [
  'PROTOP TERMS OF USE',
  'Last updated: 24 September 2026',
  '1. Acceptance',
  'These terms govern ProTop (the app and protop.no). By creating an account or using the service you agree with ProTop (protop.no).',
  'ProTop is digital tooling for construction. The service is collaboration: home, friends, calendar, email, tasks and notes, with settings, notifications and help. The same shell runs on phone, tablet and web.',
  '2. Account',
  'You must be able to enter a contract where you live. You are responsible for your account, your sign-in, and content you add about yourself and others.',
  '3. Groups',
  'You may create or join groups for collaboration. A group admin manages members and group settings. Only add people who should have access.',
  '4. Changes',
  'We may change these terms. Material changes will be notified appropriately. Continued use means acceptance. We may add, change or remove features.',
  '5. Acceptable use',
  'Use ProTop for collaboration in line with its purpose. Do not use it for illegal activity; post harmful content; upload material you lack rights to; bypass security; share passwords; or misuse others’ personal data.',
  'We may suspend accounts and remove content that breaches these terms.',
  '6. Third parties',
  'The service relies on providers such as Google sign-in, Google Firebase, Google Gemini (optional AI) and maps/geocoding. Their terms may also apply.',
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
  'PROTOP PRIVACY POLICY',
  'Last updated: 24 September 2026',
  'In short: ProTop (protop.no) is the controller. We process data to provide collaboration for construction. We do not sell personal data.',
  '1. Who we are',
  'Controller: ProTop (protop.no). Contact: https://protop.no.',
  '2. Data we process',
  'Profile: name, username, email and/or phone, optional gender and photo. A photo may come from your Google account when you sign in with Google.',
  'Content: what you and your group add, such as calendar, email, tasks, notes, messages and notifications.',
  'Technical: auth data, device/browser info, limited IP via infrastructure, logs needed for operations.',
  'AI: if you use AI in the service, the request may be processed by Google Gemini when configured. Those threads may be stored on your account so you can reopen them.',
  'Calendar sync: if you connect an external calendar, we process tokens and events needed to display them.',
  '3. Purposes and legal bases',
  'Contract: delivering the service (sign-in, groups and features). Consent: optional data, marketing tips where opted in, cookies where required. Legitimate interests: security, abuse prevention, product improvement (often aggregated). Legal obligation where required.',
  '4. Sharing',
  'We do not share your content beyond people you have given access in a group. Processors (e.g. Google Firebase in the EU/EEA where possible) act under contract. AI requests may be processed by Google Gemini. International transfers use appropriate safeguards where needed.',
  '5. Your rights',
  'Access, rectification, erasure, restriction, portability, objection, and complaint to your DPA. Contact https://protop.no.',
  '6. Retention',
  'We keep data while the account is active and needed for the purpose, then delete or anonymise unless law requires longer retention.',
  '7. Age',
  'The service is for users who can enter a contract. We do not aim marketing at children.',
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
      'PROTOP BRUGERVILKÅR',
      'Senest opdateret: 24. september 2026',
      'ProTop er digitale løsninger til byggeri og anlæg: samarbejde med hjem, venner, kalender, e-mail, opgaver og noter.',
      'Ved brug accepterer du aftalen med ProTop (protop.no). Du er ansvarlig for din konto og det indhold, du lægger ind.',
      'Brug tjenesten lovligt. Kontakt: https://protop.no. Norsk ret gælder med forbehold for ufravigelig forbrugerbeskyttelse.',
    ]),
    privacy: shortTerms([
      'PERSONVERNERKLÆRING — PROTOP',
      'ProTop (protop.no) er dataansvarlig. Vi behandler profil og det indhold, du lægger i grupper, for at levere tjenesten. Vi sælger ikke personoplysninger.',
      'Underleverandører bl.a. Google Firebase (EU/EØS hvor muligt). AI kan bruge Google Gemini; tråde kan gemmes på din konto.',
      'Rettigheder: indsigt, rettelse, sletning m.m. via https://protop.no.',
    ]),
  },
  sv: {
    terms: shortTerms([
      'PROTOP ANVÄNDARVILLKOR',
      'Senast uppdaterad: 24 september 2026',
      'ProTop är digitala verktyg för bygg och anläggning: samarbete med hem, vänner, kalender, e-post, uppgifter och anteckningar.',
      'Genom att använda tjänsten ingår du avtal med ProTop (protop.no). Du ansvarar för kontot och innehållet du lägger in.',
      'Använd tjänsten lagligt. Kontakt: https://protop.no.',
    ]),
    privacy: shortTerms([
      'INTEGRITETSPOLICY — PROTOP',
      'ProTop är personuppgiftsansvarig. Vi behandlar profil och innehåll i grupper för att leverera tjänsten. Vi säljer inte uppgifter.',
      'Firebase i EU/EES där möjligt. Rättigheter via https://protop.no.',
    ]),
  },
  fi: {
    terms: shortTerms([
      'PROTOPIN KÄYTTÖEHDOT',
      'Päivitetty: 24. syyskuuta 2026',
      'ProTop on digitaalisia ratkaisuja rakentamiseen: yhteistyö kodin, ystävien, kalenterin, sähköpostin, tehtävien ja muistiinpanojen kanssa.',
      'Käyttämällä hyväksyt sopimuksen ProTopin (protop.no) kanssa. Vastaat tilistäsi ja lisäämästäsi sisällöstä.',
      'Yhteys: https://protop.no.',
    ]),
    privacy: shortTerms([
      'TIETOSUOJASELOSTE — PROTOP',
      'ProTop on rekisterinpitäjä. Käsittelemme profiilia ja ryhmien sisältöä palvelun tarjoamiseksi. Emme myy tietoja.',
      'Oikeudet: https://protop.no.',
    ]),
  },
  pl: {
    terms: shortTerms([
      'REGULAMIN PROTOP',
      'Aktualizacja: 24 września 2026',
      'ProTop to narzędzia cyfrowe dla budownictwa: współpraca — dom, znajomi, kalendarz, e-mail, zadania i notatki.',
      'Korzystanie oznacza umowę z ProTop (protop.no). Odpowiadasz za konto i treści, które dodajesz.',
      'Kontakt: https://protop.no.',
    ]),
    privacy: shortTerms([
      'POLITYKA PRYWATNOŚCI — PROTOP',
      'ProTop jest administratorem. Przetwarzamy profil i treści w grupach, aby świadczyć usługę. Nie sprzedajemy danych.',
      'Prawa: https://protop.no.',
    ]),
  },
  es: {
    terms: shortTerms([
      'TÉRMINOS DE PROTOP',
      'Actualizado: 24 de septiembre de 2026',
      'ProTop son soluciones digitales para la construcción: colaboración con inicio, amigos, calendario, correo, tareas y notas.',
      'Al usarlo aceptas el acuerdo con ProTop (protop.no). Tú respondes de tu cuenta y del contenido que añades.',
      'Contacto: https://protop.no.',
    ]),
    privacy: shortTerms([
      'POLÍTICA DE PRIVACIDAD — PROTOP',
      'ProTop es el responsable. Tratamos el perfil y el contenido de los grupos para prestar el servicio. No vendemos datos.',
      'Derechos: https://protop.no.',
    ]),
  },
  fr: {
    terms: shortTerms([
      'CONDITIONS PROTOP',
      'Mis à jour : 24 septembre 2026',
      'ProTop est un outil numérique pour le bâtiment : collaboration (accueil, amis, calendrier, e-mail, tâches et notes).',
      'En l’utilisant, tu acceptes l’accord avec ProTop (protop.no). Tu es responsable du compte et du contenu que tu ajoutes.',
      'Contact : https://protop.no.',
    ]),
    privacy: shortTerms([
      'POLITIQUE DE CONFIDENTIALITÉ — PROTOP',
      'ProTop est le responsable du traitement. Nous traitons le profil et le contenu des groupes pour fournir le service. Nous ne vendons pas les données.',
      'Droits : https://protop.no.',
    ]),
  },
  de: {
    terms: shortTerms([
      'PROTOP NUTZUNGSBEDINGUNGEN',
      'Stand: 24. September 2026',
      'ProTop sind digitale Lösungen für Bau und Anlagen: Zusammenarbeit mit Start, Freunden, Kalender, E-Mail, Aufgaben und Notizen.',
      'Mit der Nutzung akzeptierst du die Vereinbarung mit ProTop (protop.no). Du bist für das Konto und deine Inhalte verantwortlich.',
      'Kontakt: https://protop.no.',
    ]),
    privacy: shortTerms([
      'DATENSCHUTZERKLÄRUNG — PROTOP',
      'ProTop ist Verantwortlicher. Wir verarbeiten Profil und Gruppeninhalte, um den Dienst bereitzustellen. Wir verkaufen keine Daten.',
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
