import { DPA_VERSION, LEGAL_VERSION } from './langs.js';

/**
 * Vilkår, personvernerklæring og databehandleravtale for ProTop som tjeneste
 * for bedrifter i bygg og anlegg. Oppdatert 27. oktober 2026.
 * Ny tekst krever ny aksept: øk LEGAL_VERSION (vilkår og personvern) eller
 * DPA_VERSION (databehandleravtalen) i langs.js.
 */

/**
 * Hvem som står bak ProTop. Juridisk navn, org.nr. og adresse må fylles inn av eieren.
 * Tomme felt vises ikke i dokumentene.
 */
export const LEGAL_ENTITY = {
  /** Juridisk navn, f.eks. «ProTop AS». */
  name: '',
  /** Organisasjonsnummer, ni siffer. */
  orgnr: '',
  /** Forretningsadresse: gate, postnummer og sted. */
  address: '',
  /** Personvernombud, hvis dere har et (navn og e-post). */
  dpo: '',
  email: 'support@protop.no',
  web: 'https://protop.no',
};

export const LEGAL_UPDATED = { nb: '27. oktober 2026', en: '27 October 2026' };

/**
 * Abonnementsvilkår mangler (L-33). Prisvisningen er av (PRICING_VISIBLE i billingMethods.js),
 * men appen har abonnement og prøveperiode. Plassholderen står i vilkårene til en jurist har
 * skrevet teksten. Når teksten er på plass: bytt ut plassholderen og øk LEGAL_VERSION.
 */
export const SUBSCRIPTION_PLACEHOLDER = {
  nb: '[TIL JURIST – abonnementsvilkår må fylles ut før prisen vises i appen] Pris per bedrift eller per bruker, med og uten merverdiavgift · prøveperiode og hva som skjer når den er over (fornyes abonnementet automatisk?) · bindingstid · hvordan og når abonnementet sies opp, og når oppsigelsen får virkning · fakturering og betalingsfrist · angrerett og angreskjema hvis forbrukere kan kjøpe (angrerettloven).',
  en: '[FOR LEGAL REVIEW – subscription terms must be completed before prices are shown in the app] Price per company or per user, with and without VAT · trial period and what happens when it ends (does the subscription renew automatically?) · minimum term · how and when to cancel, and when cancellation takes effect · invoicing and payment terms · right of withdrawal and withdrawal form if consumers can buy.',
};

function formatOrgnr(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 9 ? `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}` : '';
}

/** Linjen om hvem ProTop er. Bare felt som er fylt ut, tas med. */
export function entityLine(entity = LEGAL_ENTITY, lang = 'nb') {
  const en = lang !== 'nb';
  const name = String(entity?.name || '').trim();
  const orgnr = formatOrgnr(entity?.orgnr);
  const address = String(entity?.address || '').trim();
  const parts = [name || 'ProTop'];
  if (orgnr) parts.push(en ? `org. no. ${orgnr}` : `org.nr. ${orgnr}`);
  if (address) parts.push(address);
  return parts.join(', ');
}

function contactLine(entity, lang) {
  const email = String(entity?.email || 'support@protop.no').trim();
  const dpo = String(entity?.dpo || '').trim();
  if (lang === 'nb') {
    return `Kontakt om personvern: ${email}.${dpo ? ` Personvernombud: ${dpo}.` : ''}`;
  }
  return `Privacy contact: ${email}.${dpo ? ` Data protection officer: ${dpo}.` : ''}`;
}

/** Underleverandørene, felles for personvernerklæringen og databehandleravtalen. */
const SUBPROCESSORS_NB = [
  '• Google Firebase og Google Cloud (innlogging, database, filer og serverfunksjoner). Data lagres i EU, region europe-west1 (Belgia).',
  '• Google Gemini (AI-funksjoner, se punkt 6).',
  '• Brevo, Resend eller SendGrid (utsending av e-post og SMS fra tjenesten).',
  '• Microsoft (bare når du kobler Outlook eller Microsoft 365).',
  '• PowerOffice (bare når bedriften kobler regnskapssystemet).',
  '• Peppol-aksesspunkt (bare når bedriften sender EHF-faktura).',
  '• Oppslag i offentlige registre: Brønnøysundregistrene, Statens vegvesen og Doffin.',
  '• Ressurser på nett: Google Fonts (skrift), unpkg (kartbibliotek) og OpenStreetMap/Nominatim (kart og adresseoppslag). Disse får IP-adressen din når siden henter ressursen.',
];

const SUBPROCESSORS_EN = [
  '• Google Firebase and Google Cloud (sign-in, database, files and server functions). Data is stored in the EU, region europe-west1 (Belgium).',
  '• Google Gemini (AI features, see section 6).',
  '• Brevo, Resend or SendGrid (email and SMS sent by the service).',
  '• Microsoft (only when you connect Outlook or Microsoft 365).',
  '• PowerOffice (only when the company connects its accounting system).',
  '• Peppol access point (only when the company sends EHF invoices).',
  '• Public registers: the Brønnøysund Register Centre, the Norwegian Public Roads Administration and Doffin.',
  '• Web resources: Google Fonts (typeface), unpkg (map library) and OpenStreetMap/Nominatim (maps and address lookup). They receive your IP address when the page loads the resource.',
];

function privacyNb(entity) {
  return [
    'PERSONVERNERKLÆRING FOR PROTOP',
    `Sist oppdatert: ${LEGAL_UPDATED.nb} · versjon ${LEGAL_VERSION}`,
    'Kort fortalt: ProTop er et arbeidsverktøy for bedrifter i bygg og anlegg. ProTop er behandlingsansvarlig for brukerkontoen din. For opplysninger en bedrift legger inn om ansatte, kunder og søkere, er bedriften behandlingsansvarlig og ProTop databehandler. Vi selger ikke personopplysninger og bruker ikke sporings- eller reklamecookies.',
    '1. Hvem vi er',
    `ProTop leveres av ${entityLine(entity, 'nb')}. ${contactLine(entity, 'nb')}`,
    '2. To roller',
    'ProTop som behandlingsansvarlig: brukerkonto, innlogging, språk og innstillinger, samtykker, support, sikkerhet og feilretting, meldinger om tjenesten, og markedsføring når du har sagt ja.',
    'ProTop som databehandler: det bedriften (arbeidsgiveren din eller kunden vår) registrerer i bedriftsmodulene, som ansattregister, HR, fravær, timer, utlegg, kjørebok, kunder, fakturaer, anbud, ISO, dokumenter og chat i bedriften. Bedriften bestemmer formålet og hvem som har tilgang. Vi behandler disse opplysningene etter databehandleravtalen med bedriften. Spør bedriften først om innsyn, retting og sletting. Vi hjelper bedriften med å svare.',
    '3. Opplysninger vi behandler',
    '• Konto og profil: navn, e-post, telefon, brukernavn, profilbilde, språk og fødselsdato hvis du oppgir den.',
    '• Innlogging: Google, Microsoft eller Apple, eller e-post og passord. Passordet lagres bare som kryptografisk hash hos Google Firebase.',
    '• Arbeid: prosjekter, timer med dato og klokkeslett, kjøring, utlegg og kvitteringer, oppgaver, kalender, notater og chat.',
    '• Ansatt og HR (lagt inn av bedriften): kontaktinformasjon, stilling, ansettelsesforhold, pårørende, arbeidsavtaler, lønn, oppfølging, kompetanse og CV, og personnummer (fødselsnummer) når bedriften trenger det til lønn, A-melding eller HMS-kort.',
    '• Fravær og helse: ferie, permisjon og sykefravær (egenmelding, sykemelding, sykt barn og legebesøk). At fraværet gjelder sykdom, er en helseopplysning. Ikke skriv diagnose eller andre helseopplysninger i fritekstfelt.',
    '• Kunder og leverandører: kontaktpersoner, adresser, avtaler og fakturaer. Personnummer for privatkunder bare når en avtale krever det.',
    '• Bruk og sikkerhet: brukslogg (se punkt 5), feillogger og tekniske data som nettleser og enhet.',
    '• AI: tekst, bilder og dokumenter du sender til en AI-funksjon (se punkt 6).',
    '• Koblinger: kobler du Outlook/Microsoft 365 eller Google Kalender, lagrer vi tilgangsnøkler og henter e-post og hendelser for å vise dem. Kobler bedriften PowerOffice, sendes faktura- og kundeopplysninger dit.',
    '4. Formål og rettslig grunnlag',
    '• Levere tjenesten etter avtalen med deg eller bedriften din (GDPR artikkel 6 nr. 1 bokstav b).',
    '• Oppfylle plikter i lov, for eksempel oppbevaring av regnskapsmateriale etter bokføringsloven (artikkel 6 nr. 1 bokstav c).',
    '• Sikkerhet, hindre misbruk, rette feil og forbedre tjenesten, helst med samlede tall uten navn (berettiget interesse, artikkel 6 nr. 1 bokstav f).',
    '• Markedsføring på e-post bare når du har samtykket (artikkel 6 nr. 1 bokstav a). Du kan trekke samtykket når som helst under Personvern og vilkår.',
    '• Når ProTop er databehandler, har bedriften det rettslige grunnlaget, for eksempel arbeidsavtalen, arbeidsmiljøloven og bokføringsloven. Sykefravær behandles for at arbeidsgiveren skal oppfylle plikter i arbeidsretten (artikkel 9 nr. 2 bokstav b).',
    '5. Brukslogg i bedriften',
    'Når du er inne i en bedrift, logger ProTop innlogging, aktivitet (omtrent hvert fjerde minutt mens appen er åpen) og hvilke sider du åpner, med tidspunkt, IP-adresse og nettleser. Endringer i timer og sendte invitasjoner logges også. Administratorer og de som har tilgang til ansatte i bedriften, kan se loggen. Formålet er sikkerhet, support og oversikt over hvem som har brukt kontoene. Loggen slettes etter 90 dager. Bedriften kan slå av logging av innlogging, aktivitet og sidevisninger under Selskapsinnstillinger. Arbeidsgiveren skal informere de ansatte om loggen før den brukes.',
    '6. AI-funksjoner (Google Gemini)',
    'Noen funksjoner bruker Google Gemini: tolking av importfiler, CV, arbeidsavtaler og kvitteringer, kontroll av timelister, anbud og avtaler, notater og hjelpeassistenten. Det du sender til en AI-funksjon, går til Google for behandling og kan behandles utenfor EØS. Svaret lagres i ProTop. Googles vilkår for tjenesten gjelder for Googles behandling. Bedriften kan slå av AI-funksjonene under Selskapsinnstillinger. Ikke send helseopplysninger eller personnummer til AI når det ikke trengs.',
    '7. Underleverandører',
    ...SUBPROCESSORS_NB,
    'Underleverandørene behandler opplysningene etter avtale med oss og bare for å levere tjenesten.',
    '8. Overføring utenfor EØS',
    'Noen underleverandører er amerikanske selskaper (blant annet Google, Microsoft og e-postleverandørene). Overføring skjer etter EU–US Data Privacy Framework når leverandøren er sertifisert, ellers etter EUs standardkontraktsklausuler (GDPR artikkel 46).',
    '9. Lagringstid',
    '• Brukerkonto: så lenge du har konto. Sletter du kontoen, sletter vi profilen, innloggingen, filer under profilen din, private chatter, koblinger, samtykkeloggen og bruksloggen din.',
    '• Brukslogg: 90 dager.',
    '• Opplysninger i en bedrift: så lenge bedriften bruker ProTop, og etter bedriftens instrukser. Regnskapsmateriale som fakturaer og bilag oppbevares i fem år etter regnskapsårets slutt (bokføringsloven § 13).',
    '• Søknader og personalmapper: bedriften velger lagringstiden under Selskapsinnstillinger → Personvern. Som standard slettes avslåtte søknader seks måneder etter avgjørelsen, personalmappen tre år etter sluttdato og lønnshistorikken fem år etter sluttdato.',
    '• AI: midlertidige filer slettes etter inntil 48 timer, utkast etter inntil 30 dager.',
    '10. Dine rettigheter',
    'Du har rett til innsyn, retting, sletting, begrensning, dataportabilitet og til å protestere, og du kan trekke et samtykke. Under Innstillinger → Personvern og vilkår kan du laste ned dine egne data, og under Innstillinger kan du slette kontoen. Gjelder det opplysninger bedriften har registrert, kontakter du bedriften. Vi svarer innen én måned.',
    'Du kan klage til Datatilsynet (www.datatilsynet.no, Postboks 458 Sentrum, 0105 Oslo).',
    '11. Informasjonskapsler og lokal lagring',
    'Vi bruker ingen sporings- eller reklamecookies. Nettleseren og appen lagrer bare det tjenesten trenger: innloggingen (Firebase), valgt språk og utseende, godkjente vilkår, innstillinger og et mellomlager av data så appen virker raskt og uten nett. En kortvarig informasjonskapsel (15 minutter) brukes når du kobler Outlook eller Google Kalender. Bruksloggen merker innloggingen i nettleserens økt (sessionStorage) til fanen lukkes. Slik nødvendig lagring krever ikke samtykke (ekomloven § 3-15). Logg ut på maskiner andre også bruker.',
    '12. Sikkerhet',
    'Vi bruker innlogging, tilgangsstyring per modul, kryptert overføring (HTTPS) og lagring hos Google i EU. Meld fra til support@protop.no hvis du mistenker misbruk.',
    '13. Endringer',
    'Ved vesentlige endringer ber vi deg godta den nye versjonen i appen. Versjon og tidspunkt for godkjenningen lagres.',
  ];
}

function privacyEn(entity) {
  return [
    'PROTOP PRIVACY POLICY',
    `Last updated: ${LEGAL_UPDATED.en} · version ${LEGAL_VERSION}`,
    'In short: ProTop is a work tool for construction companies. ProTop is the controller for your user account. For data a company enters about employees, customers and applicants, the company is the controller and ProTop is its processor. We do not sell personal data and we use no tracking or advertising cookies.',
    '1. Who we are',
    `ProTop is provided by ${entityLine(entity, 'en')}. ${contactLine(entity, 'en')}`,
    '2. Two roles',
    'ProTop as controller: user account, sign-in, language and settings, consents, support, security and bug fixing, service messages, and marketing when you have opted in.',
    'ProTop as processor: what the company (your employer or our customer) records in the company modules, such as the employee register, HR, absence, hours, expenses, mileage, customers, invoices, tenders, ISO, documents and company chat. The company decides the purpose and who has access. We process this data under the data processing agreement with the company. Ask the company first about access, correction and erasure. We help the company respond.',
    '3. Data we process',
    '• Account and profile: name, email, phone, username, photo, language and date of birth if you provide it.',
    '• Sign-in: Google, Microsoft or Apple, or email and password. The password is stored only as a cryptographic hash by Google Firebase.',
    '• Work: projects, hours with date and time, mileage, expenses and receipts, tasks, calendar, notes and chat.',
    '• Employee and HR (entered by the company): contact details, position, employment, next of kin, employment contracts, salary, follow-up, skills and CV, and national identity number when the company needs it for payroll, A-melding or HSE cards.',
    '• Absence and health: holiday, leave and sick leave (self-certified, doctor-certified, sick child and doctor visits). That an absence is due to illness is health data. Do not write diagnoses or other health information in free-text fields.',
    '• Customers and suppliers: contact persons, addresses, agreements and invoices. National identity numbers for private customers only when an agreement requires it.',
    '• Usage and security: usage log (see section 5), error logs and technical data such as browser and device.',
    '• AI: text, images and documents you send to an AI feature (see section 6).',
    '• Connections: if you connect Outlook/Microsoft 365 or Google Calendar, we store access tokens and fetch mail and events to show them. If the company connects PowerOffice, invoice and customer data is sent there.',
    '4. Purposes and legal bases',
    '• Providing the service under the agreement with you or your company (GDPR Article 6(1)(b)).',
    '• Legal obligations, such as retaining accounting records under the Norwegian Bookkeeping Act (Article 6(1)(c)).',
    '• Security, preventing abuse, fixing errors and improving the service, preferably with aggregated figures (legitimate interests, Article 6(1)(f)).',
    '• Email marketing only with your consent (Article 6(1)(a)). You can withdraw it at any time under Privacy and terms.',
    '• Where ProTop is a processor, the company has the legal basis, for example the employment contract, the Working Environment Act and the Bookkeeping Act. Sick leave is processed so the employer can meet obligations in employment law (Article 9(2)(b)).',
    '5. Usage log in the company',
    'When you are in a company, ProTop logs sign-ins, activity (about every four minutes while the app is open) and the pages you open, with time, IP address and browser. Changes to hours and sent invitations are also logged. Administrators and those with access to employees in the company can see the log. The purpose is security, support and an overview of who has used the accounts. The log is deleted after 90 days. The company can turn off logging of sign-ins, activity and page views under Company settings. The employer must inform employees about the log before it is used.',
    '6. AI features (Google Gemini)',
    'Some features use Google Gemini: reading import files, CVs, employment contracts and receipts, checking timesheets, tenders and agreements, notes and the help assistant. What you send to an AI feature goes to Google for processing and may be processed outside the EEA. The answer is stored in ProTop. Google’s terms for the service apply to Google’s processing. The company can turn off AI features under Company settings. Do not send health data or identity numbers to AI unless needed.',
    '7. Subprocessors',
    ...SUBPROCESSORS_EN,
    'Subprocessors process the data under agreement with us and only to provide the service.',
    '8. Transfers outside the EEA',
    'Some subprocessors are US companies (including Google, Microsoft and the email providers). Transfers rely on the EU–US Data Privacy Framework where the provider is certified, otherwise on the EU standard contractual clauses (GDPR Article 46).',
    '9. Retention',
    '• User account: as long as you have an account. When you delete it, we delete the profile, sign-in, files under your profile, private chats, connections, the consent log and your usage log.',
    '• Usage log: 90 days.',
    '• Company data: as long as the company uses ProTop and according to its instructions. Accounting records such as invoices and vouchers are kept for five years after the end of the financial year (Bookkeeping Act section 13).',
    '• Applications and personnel files: the company sets the retention period under Company settings → Privacy. By default, rejected applications are deleted six months after the decision, the personnel file three years after the end date and the salary history five years after the end date.',
    '• AI: temporary files are deleted within 48 hours, drafts within 30 days.',
    '10. Your rights',
    'You have the right of access, rectification, erasure, restriction, data portability and objection, and you can withdraw consent. Under Settings → Privacy and terms you can download your own data, and under Settings you can delete your account. For data the company has recorded, contact the company. We reply within one month.',
    'You can complain to the Norwegian Data Protection Authority (Datatilsynet, www.datatilsynet.no) or the authority where you live.',
    '11. Cookies and local storage',
    'We use no tracking or advertising cookies. The browser and app store only what the service needs: sign-in (Firebase), chosen language and appearance, accepted terms, settings and a data cache so the app is fast and works offline. A short-lived cookie (15 minutes) is used when you connect Outlook or Google Calendar. The usage log marks the sign-in in the browser session (sessionStorage) until the tab closes. Such necessary storage does not require consent. Sign out on shared computers.',
    '12. Security',
    'We use sign-in, per-module access control, encrypted transfer (HTTPS) and storage with Google in the EU. Report suspected misuse to support@protop.no.',
    '13. Changes',
    'For material changes we ask you to accept the new version in the app. The version and time of acceptance are stored.',
  ];
}

function termsNb(entity) {
  return [
    'BRUKSVILKÅR FOR PROTOP',
    `Sist oppdatert: ${LEGAL_UPDATED.nb} · versjon ${LEGAL_VERSION}`,
    '1. Avtalen',
    `Vilkårene gjelder bruk av ProTop (appen og protop.no), levert av ${entityLine(entity, 'nb')} («ProTop»). Når du oppretter en bedrift, inngår du avtalen på vegne av bedriften og bekrefter at du har fullmakt til det. Brukere som er invitert av en bedrift, bruker tjenesten på vegne av bedriften.`,
    '2. Tjenesten',
    'ProTop er et arbeidsverktøy for bedrifter i bygg og anlegg: prosjekter, timer, fravær, HR, økonomi og faktura, anbud, kunder, ISO, chat, kalender og e-post. Vi utvikler tjenesten løpende og kan legge til, endre eller fjerne funksjoner.',
    '3. Konto og tilgang',
    'Du er ansvarlig for innloggingen din og skal ikke dele passord. Bedriftens administratorer bestemmer hvem som har tilgang, og til hva. Når en ansatt slutter, skal bedriften fjerne tilgangen.',
    '4. Bedriftens ansvar',
    'Bedriften er behandlingsansvarlig for opplysninger den registrerer om ansatte, kunder og andre. Bedriften skal ha rettslig grunnlag, informere de ansatte (blant annet om brukslogg og AI-funksjoner) og bare registrere opplysninger som trengs. Databehandleravtalen er en del av disse vilkårene for bedrifter.',
    '5. Akseptabel bruk',
    'Du skal ikke bruke tjenesten til noe ulovlig, laste opp innhold du ikke har rett til, forsøke å omgå sikkerhet eller tilgangsstyring, eller registrere helseopplysninger eller personnummer i fritekst uten grunn. Ved brudd kan vi begrense eller stenge tilgangen og fjerne innholdet.',
    '6. Pris og betaling',
    'Priser og betalingsvilkår står i appen før kjøp eller i egen avtale. Vi varsler prisendringer minst 30 dager før de gjelder.',
    SUBSCRIPTION_PLACEHOLDER.nb,
    '7. Innhold og rettigheter',
    'Bedriften og brukerne eier innholdet sitt. ProTop får rett til å lagre, behandle og vise innholdet for å levere tjenesten. ProTop eier programvaren, designet og merkevaren.',
    '8. Tredjepartstjenester',
    'Koblinger til Microsoft, Google, PowerOffice, Peppol og offentlige registre følger også leverandørenes vilkår. Vi er ikke ansvarlige for feil eller nedetid hos dem.',
    '9. Drift og ansvar',
    'Vi arbeider for at tjenesten skal være tilgjengelig og sikker, men kan ikke love feilfri drift. Ansvar for indirekte tap er begrenset så langt loven tillater. Bedriften har selv plikt til å oppbevare regnskapsmateriale og kan hente ut sine data fra tjenesten.',
    '10. Endringer i vilkårene',
    'Vesentlige endringer varsles i appen, og du blir bedt om å godta den nye versjonen. Versjon og tidspunkt for godkjenningen lagres.',
    '11. Oppsigelse og sletting',
    'Du kan slette kontoen din under Innstillinger. Bedriften kan avslutte avtalen. Etter avslutning slettes bedriftens data etter databehandleravtalen, unntatt det loven krever at oppbevares.',
    '12. Personvern',
    'Behandlingen av personopplysninger står i personvernerklæringen og databehandleravtalen.',
    '13. Lovvalg og tvister',
    'Norsk rett gjelder. Tvister som ikke løses i minnelighet, avgjøres av norske domstoler.',
    '14. Kontakt',
    `${entityLine(entity, 'nb')} · ${String(entity?.email || 'support@protop.no')} · ${String(entity?.web || 'https://protop.no')}`,
  ];
}

function termsEn(entity) {
  return [
    'PROTOP TERMS OF USE',
    `Last updated: ${LEGAL_UPDATED.en} · version ${LEGAL_VERSION}`,
    '1. The agreement',
    `These terms govern use of ProTop (the app and protop.no), provided by ${entityLine(entity, 'en')} (“ProTop”). When you create a company, you enter into the agreement on behalf of the company and confirm that you are authorised to do so. Users invited by a company use the service on behalf of that company.`,
    '2. The service',
    'ProTop is a work tool for construction companies: projects, hours, absence, HR, finance and invoicing, tenders, customers, ISO, chat, calendar and email. We develop the service continuously and may add, change or remove features.',
    '3. Account and access',
    'You are responsible for your sign-in and must not share passwords. The company’s administrators decide who has access and to what. When an employee leaves, the company must remove the access.',
    '4. The company’s responsibility',
    'The company is the controller for the data it records about employees, customers and others. The company must have a legal basis, inform employees (including about the usage log and AI features) and only record data that is needed. The data processing agreement forms part of these terms for companies.',
    '5. Acceptable use',
    'Do not use the service for anything unlawful, upload content you lack rights to, try to bypass security or access control, or record health data or identity numbers in free text without reason. On breach we may restrict or close access and remove the content.',
    '6. Prices and payment',
    'Prices and payment terms are shown in the app before purchase or in a separate agreement. We give at least 30 days’ notice of price changes.',
    SUBSCRIPTION_PLACEHOLDER.en,
    '7. Content and rights',
    'The company and users own their content. ProTop may store, process and display it to provide the service. ProTop owns the software, design and brand.',
    '8. Third-party services',
    'Connections to Microsoft, Google, PowerOffice, Peppol and public registers are also subject to the providers’ terms. We are not responsible for their errors or downtime.',
    '9. Operation and liability',
    'We work to keep the service available and secure but cannot promise fault-free operation. Liability for indirect loss is limited as far as the law allows. The company is itself obliged to retain accounting records and can export its data from the service.',
    '10. Changes to the terms',
    'Material changes are announced in the app, and you will be asked to accept the new version. The version and time of acceptance are stored.',
    '11. Termination and deletion',
    'You can delete your account under Settings. The company can end the agreement. After termination the company’s data is deleted under the data processing agreement, except what the law requires to be kept.',
    '12. Privacy',
    'Processing of personal data is described in the privacy policy and the data processing agreement.',
    '13. Governing law',
    'Norwegian law applies. Disputes not resolved amicably are settled by the Norwegian courts.',
    '14. Contact',
    `${entityLine(entity, 'en')} · ${String(entity?.email || 'support@protop.no')} · ${String(entity?.web || 'https://protop.no')}`,
  ];
}

function dpaNb(entity) {
  return [
    'DATABEHANDLERAVTALE FOR PROTOP',
    `Sist oppdatert: ${LEGAL_UPDATED.nb} · versjon ${DPA_VERSION}`,
    'Avtalen oppfyller kravene i personvernforordningen (GDPR) artikkel 28. Den godtas i appen av en administrator på vegne av bedriften. Versjon, tidspunkt og hvem som godtok, lagres på bedriften.',
    '1. Parter og omfang',
    `Avtalen gjelder mellom bedriften som bruker ProTop (behandlingsansvarlig) og ${entityLine(entity, 'nb')} (databehandler). Den omfatter personopplysninger bedriften og brukerne i bedriften registrerer i ProTop.`,
    '2. Formål og instrukser',
    'ProTop behandler opplysningene bare for å levere tjenesten, etter bedriftens dokumenterte instrukser: vilkårene, denne avtalen og innstillingene bedriften velger i appen. Vi sier fra hvis vi mener en instruks er i strid med personvernregelverket.',
    '3. Registrerte og opplysninger',
    'Registrerte: ansatte, innleide og eksterne, jobbsøkere, kunder og kontaktpersoner, og leverandører.',
    'Opplysninger: kontakt og identitet (også personnummer når bedriften registrerer det), ansettelse, lønn og HR, fravær inkludert sykefravær (helseopplysninger, artikkel 9), timer, kjøring og utlegg, brukslogg med IP-adresse, dokumenter, bilder og meldinger.',
    '4. Taushetsplikt',
    'Alle som arbeider for ProTop og har tilgang til opplysningene, har taushetsplikt.',
    '5. Sikkerhet',
    'ProTop har tiltak etter artikkel 32: innlogging, tilgangsstyring per modul, kryptert overføring, lagring i EU (europe-west1), logging og rutiner for sikkerhetskopi og feilretting.',
    '6. Underdatabehandlere',
    'Bedriften godkjenner på forhånd disse underdatabehandlerne:',
    ...SUBPROCESSORS_NB,
    'Vi varsler endringer i listen minst 30 dager i forveien i appen eller på e-post. Bedriften kan protestere mot en ny underdatabehandler. Underdatabehandlerne får de samme pliktene som i denne avtalen.',
    '7. Overføring utenfor EØS',
    'Overføring skjer bare med gyldig grunnlag etter GDPR kapittel V, som EU–US Data Privacy Framework eller EUs standardkontraktsklausuler.',
    '8. Bistand',
    'ProTop hjelper bedriften med å oppfylle de registrertes rettigheter (innsyn, retting, sletting og eksport), med sikkerhet, avvik, vurdering av personvernkonsekvenser og forhåndsdrøftinger med Datatilsynet.',
    '9. Avvik',
    'ProTop varsler bedriften uten ugrunnet opphold etter å ha oppdaget et brudd på personopplysningssikkerheten, slik at bedriften kan melde fra til Datatilsynet innen 72 timer.',
    '10. Revisjon',
    'Bedriften kan be om opplysninger som viser at avtalen følges, og kan gjennomføre revisjon med rimelig varsel.',
    '11. Bedriftens plikter',
    'Bedriften skal ha rettslig grunnlag, informere de ansatte (brukslogg, AI-funksjoner og fravær) og ikke registrere flere opplysninger enn nødvendig. Bedriften bestemmer under Selskapsinnstillinger om brukslogg og AI-funksjoner skal være på.',
    '12. Varighet, sletting og tilbakelevering',
    'Avtalen gjelder så lenge bedriften bruker ProTop. Når avtalen opphører, kan bedriften hente ut sine data. ProTop sletter deretter bedriftens personopplysninger innen 90 dager, unntatt det loven krever at oppbevares, for eksempel regnskapsmateriale etter bokføringsloven.',
    '13. Kontakt',
    `${String(entity?.email || 'support@protop.no')}`,
  ];
}

function dpaEn(entity) {
  return [
    'PROTOP DATA PROCESSING AGREEMENT',
    `Last updated: ${LEGAL_UPDATED.en} · version ${DPA_VERSION}`,
    'This agreement meets the requirements of GDPR Article 28. An administrator accepts it in the app on behalf of the company. The version, time and who accepted are stored on the company.',
    '1. Parties and scope',
    `The agreement is between the company using ProTop (controller) and ${entityLine(entity, 'en')} (processor). It covers personal data the company and its users record in ProTop.`,
    '2. Purpose and instructions',
    'ProTop processes the data only to provide the service, on the company’s documented instructions: the terms, this agreement and the settings the company chooses in the app. We will tell the company if we believe an instruction infringes data protection law.',
    '3. Data subjects and data',
    'Data subjects: employees, hired and external staff, job applicants, customers and contact persons, and suppliers.',
    'Data: contact and identity (including national identity numbers when the company records them), employment, salary and HR, absence including sick leave (health data, Article 9), hours, mileage and expenses, usage log with IP address, documents, images and messages.',
    '4. Confidentiality',
    'Everyone working for ProTop with access to the data is bound by confidentiality.',
    '5. Security',
    'ProTop has measures under Article 32: sign-in, per-module access control, encrypted transfer, storage in the EU (europe-west1), logging and routines for backup and error correction.',
    '6. Subprocessors',
    'The company gives prior authorisation for these subprocessors:',
    ...SUBPROCESSORS_EN,
    'We give at least 30 days’ notice of changes to the list in the app or by email. The company may object to a new subprocessor. Subprocessors are bound by the same obligations as in this agreement.',
    '7. Transfers outside the EEA',
    'Transfers only take place with a valid basis under GDPR Chapter V, such as the EU–US Data Privacy Framework or the EU standard contractual clauses.',
    '8. Assistance',
    'ProTop assists the company with data subject rights (access, rectification, erasure and export), security, breaches, data protection impact assessments and prior consultation.',
    '9. Breaches',
    'ProTop notifies the company without undue delay after becoming aware of a personal data breach, so the company can notify the authority within 72 hours.',
    '10. Audit',
    'The company may request information demonstrating compliance and may carry out an audit with reasonable notice.',
    '11. The company’s obligations',
    'The company must have a legal basis, inform employees (usage log, AI features and absence) and not record more data than needed. Under Company settings the company decides whether the usage log and AI features are on.',
    '12. Term, deletion and return',
    'The agreement applies while the company uses ProTop. When it ends, the company can export its data. ProTop then deletes the company’s personal data within 90 days, except what the law requires to be kept, such as accounting records.',
    '13. Contact',
    `${String(entity?.email || 'support@protop.no')}`,
  ];
}

/** Kortversjon for andre språk: hovedpunktene, og at norsk og engelsk tekst gjelder. */
const SHORT = {
  da: {
    terms: [
      'PROTOP BRUGERVILKÅR',
      `Senest opdateret: ${LEGAL_UPDATED.en}`,
      'ProTop er et arbejdsværktøj for virksomheder i bygge- og anlægsbranchen. Opretter du en virksomhed, indgår du aftalen på virksomhedens vegne.',
      'Den fulde tekst findes på norsk og engelsk i appen og gælder ved uoverensstemmelse. Kontakt: support@protop.no. Norsk ret gælder.',
    ],
    privacy: [
      'PRIVATLIVSPOLITIK — PROTOP',
      'ProTop er dataansvarlig for din brugerkonto. For oplysninger en virksomhed registrerer om ansatte og kunder, er virksomheden dataansvarlig og ProTop databehandler.',
      'Data lagres hos Google i EU (europe-west1). AI-funktioner bruger Google Gemini. Vi sælger ikke personoplysninger og bruger ingen sporingscookies.',
      'Rettigheder: indsigt, rettelse, sletning og dataportabilitet via support@protop.no. Klage til Datatilsynet. Den fulde tekst findes på norsk og engelsk.',
    ],
  },
  sv: {
    terms: [
      'PROTOP ANVÄNDARVILLKOR',
      `Senast uppdaterad: ${LEGAL_UPDATED.en}`,
      'ProTop är ett arbetsverktyg för företag inom bygg och anläggning. Skapar du ett företag ingår du avtalet för företagets räkning.',
      'Den fullständiga texten finns på norska och engelska i appen och gäller vid avvikelse. Kontakt: support@protop.no. Norsk rätt gäller.',
    ],
    privacy: [
      'INTEGRITETSPOLICY — PROTOP',
      'ProTop är personuppgiftsansvarig för ditt användarkonto. För uppgifter ett företag registrerar om anställda och kunder är företaget personuppgiftsansvarigt och ProTop personuppgiftsbiträde.',
      'Data lagras hos Google i EU (europe-west1). AI-funktioner använder Google Gemini. Vi säljer inte personuppgifter och använder inga spårningscookies.',
      'Rättigheter: tillgång, rättelse, radering och dataportabilitet via support@protop.no. Klagomål till tillsynsmyndigheten. Fullständig text finns på norska och engelska.',
    ],
  },
  fi: {
    terms: [
      'PROTOPIN KÄYTTÖEHDOT',
      `Päivitetty: ${LEGAL_UPDATED.en}`,
      'ProTop on rakennusalan yritysten työkalu. Kun luot yrityksen, teet sopimuksen yrityksen puolesta.',
      'Koko teksti on norjaksi ja englanniksi sovelluksessa, ja se on ensisijainen. Yhteys: support@protop.no. Sovelletaan Norjan lakia.',
    ],
    privacy: [
      'TIETOSUOJASELOSTE — PROTOP',
      'ProTop on käyttäjätilisi rekisterinpitäjä. Yrityksen työntekijöistä ja asiakkaista tallentamien tietojen osalta yritys on rekisterinpitäjä ja ProTop henkilötietojen käsittelijä.',
      'Tiedot tallennetaan Googlelle EU:ssa (europe-west1). Tekoälytoiminnot käyttävät Google Geminiä. Emme myy henkilötietoja emmekä käytä seurantaevästeitä.',
      'Oikeudet: support@protop.no. Koko teksti on norjaksi ja englanniksi.',
    ],
  },
  pl: {
    terms: [
      'REGULAMIN PROTOP',
      `Aktualizacja: ${LEGAL_UPDATED.en}`,
      'ProTop to narzędzie pracy dla firm budowlanych. Tworząc firmę, zawierasz umowę w jej imieniu.',
      'Pełny tekst jest dostępny w aplikacji po norwesku i angielsku i ma pierwszeństwo. Kontakt: support@protop.no. Obowiązuje prawo norweskie.',
    ],
    privacy: [
      'POLITYKA PRYWATNOŚCI — PROTOP',
      'ProTop jest administratorem Twojego konta. Dla danych, które firma zapisuje o pracownikach i klientach, administratorem jest firma, a ProTop podmiotem przetwarzającym.',
      'Dane są przechowywane w Google w UE (europe-west1). Funkcje AI korzystają z Google Gemini. Nie sprzedajemy danych i nie używamy plików cookie do śledzenia.',
      'Prawa: support@protop.no. Pełny tekst po norwesku i angielsku.',
    ],
  },
  es: {
    terms: [
      'TÉRMINOS DE PROTOP',
      `Actualizado: ${LEGAL_UPDATED.en}`,
      'ProTop es una herramienta de trabajo para empresas de construcción. Al crear una empresa, aceptas el acuerdo en su nombre.',
      'El texto completo está en noruego e inglés en la app y prevalece. Contacto: support@protop.no. Se aplica la ley noruega.',
    ],
    privacy: [
      'POLÍTICA DE PRIVACIDAD — PROTOP',
      'ProTop es responsable de tu cuenta de usuario. Para los datos que una empresa registra sobre empleados y clientes, la empresa es responsable y ProTop encargado del tratamiento.',
      'Los datos se guardan en Google en la UE (europe-west1). Las funciones de IA usan Google Gemini. No vendemos datos ni usamos cookies de seguimiento.',
      'Derechos: support@protop.no. Texto completo en noruego e inglés.',
    ],
  },
  fr: {
    terms: [
      'CONDITIONS PROTOP',
      `Mis à jour : ${LEGAL_UPDATED.en}`,
      'ProTop est un outil de travail pour les entreprises du bâtiment. En créant une entreprise, tu acceptes l’accord en son nom.',
      'Le texte complet est en norvégien et en anglais dans l’app et prévaut. Contact : support@protop.no. Le droit norvégien s’applique.',
    ],
    privacy: [
      'POLITIQUE DE CONFIDENTIALITÉ — PROTOP',
      'ProTop est responsable de ton compte utilisateur. Pour les données qu’une entreprise enregistre sur ses salariés et clients, l’entreprise est responsable et ProTop sous-traitant.',
      'Les données sont stockées chez Google dans l’UE (europe-west1). Les fonctions d’IA utilisent Google Gemini. Nous ne vendons pas les données et n’utilisons pas de cookies de suivi.',
      'Droits : support@protop.no. Texte complet en norvégien et en anglais.',
    ],
  },
  de: {
    terms: [
      'PROTOP NUTZUNGSBEDINGUNGEN',
      `Stand: ${LEGAL_UPDATED.en}`,
      'ProTop ist ein Arbeitswerkzeug für Bauunternehmen. Wer ein Unternehmen anlegt, schließt die Vereinbarung in dessen Namen.',
      'Der vollständige Text liegt in der App auf Norwegisch und Englisch vor und ist maßgeblich. Kontakt: support@protop.no. Es gilt norwegisches Recht.',
    ],
    privacy: [
      'DATENSCHUTZERKLÄRUNG — PROTOP',
      'ProTop ist Verantwortlicher für dein Benutzerkonto. Für Daten, die ein Unternehmen über Beschäftigte und Kunden erfasst, ist das Unternehmen Verantwortlicher und ProTop Auftragsverarbeiter.',
      'Daten werden bei Google in der EU (europe-west1) gespeichert. KI-Funktionen nutzen Google Gemini. Wir verkaufen keine Daten und nutzen keine Tracking-Cookies.',
      'Rechte: support@protop.no. Vollständiger Text auf Norwegisch und Englisch.',
    ],
  },
};

function docsFor(lang, entity = LEGAL_ENTITY) {
  if (lang === 'nb') return { terms: termsNb(entity), privacy: privacyNb(entity), dpa: dpaNb(entity) };
  const en = { terms: termsEn(entity), privacy: privacyEn(entity), dpa: dpaEn(entity) };
  const short = SHORT[lang];
  if (!short) return en;
  // Kortversjonen først, deretter den engelske teksten som gjelder.
  return {
    terms: [...short.terms, ...en.terms],
    privacy: [...short.privacy, ...en.privacy],
    dpa: en.dpa,
  };
}

export function getTerms(lang, entity) {
  return docsFor(lang, entity).terms;
}

export function getPrivacy(lang, entity) {
  return docsFor(lang, entity).privacy;
}

/** Databehandleravtalen. Bare norsk og engelsk. */
export function getDpa(lang, entity) {
  return docsFor(lang, entity).dpa;
}

export function legalPages(lang) {
  const docs = docsFor(lang);
  return [
    { id: 'terms', key: 'legal.terms', paragraphs: docs.terms },
    { id: 'privacy', key: 'legal.privacy', paragraphs: docs.privacy },
  ].map((p) => ({ ...p, version: LEGAL_VERSION }));
}

/** All legal sections on one scrollable page (wizard / modal). */
export function legalDocument(lang) {
  return legalPages(lang);
}

/** Overskrift i dokumentene: tittel, dato, nummerert punkt eller kort linje i versaler. */
export function isLegalHeading(p, i) {
  return i < 2
    || /^\d+\.\s/.test(p)
    || (p === p.toUpperCase() && p.length < 80 && /[A-ZÆØÅ]/.test(p));
}

/** Third-party attributions shown on Licenses screen. */
export const APP_LICENSES = [
  { name: 'React', copyright: '© Meta Platforms, Inc. and affiliates' },
  { name: 'React Native', copyright: '© Meta Platforms, Inc. and affiliates' },
  { name: 'Expo', copyright: '© 650 Industries, Inc. (Expo)' },
  { name: 'Firebase', copyright: '© Google LLC' },
  { name: 'Google Gemini API', copyright: '© Google LLC (AI-funksjoner)' },
  { name: 'React Navigation', copyright: '© React Navigation contributors' },
  { name: 'Ionicons / Expo Vector Icons', copyright: '© Ionic / Expo contributors' },
  { name: 'react-native-gesture-handler', copyright: '© Software Mansion' },
  { name: 'react-native-screens', copyright: '© Software Mansion' },
  { name: 'react-native-safe-area-context', copyright: '© Th3rd Wave' },
  { name: 'AsyncStorage', copyright: '© React Native Community' },
  { name: 'Open Food Facts', copyright: '© Open Food Facts contributors (produktoppslag)' },
  { name: 'Leaflet', copyright: '© Volodymyr Agafonkin and contributors (kart)' },
  { name: 'OpenStreetMap / Nominatim', copyright: '© OpenStreetMap contributors (kart og adresseoppslag)' },
  { name: '@zxing/browser', copyright: '© ZXing authors (strekkodeskanning)' },
];
