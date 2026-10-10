/**
 * Feltkatalog for ansattemodulen.
 * Nye opplysninger legges inn her. Skjema, sjekkliste og CV leser katalogen.
 *
 * owner:
 *   person  – følger personen på tvers av selskap, og fylles ut på ansattens side
 *   company – gjelder ansettelsen i dette selskapet
 * purpose:
 *   required    – må være på plass for å registrere eller fullføre ansatt-siden
 *   cv          – brukes når CV skal settes sammen
 *   operations  – drift, tilgang og arbeidsforhold
 * requiredFor:
 *   register – stanser lagring av ansettelsen
 *   person   – den ansatte skal fylle ut, men bedriften kan lagre uten
 *   cv       – mangler vises før CV er komplett
 */

export const EMPLOYEE_VERSION = 1;

/** Tre hovedkategorier for personell i selskapet. */
export const PERSONNEL_KIND_OPTIONS = [
  { value: 'staff', label: 'Eget personell' },
  { value: 'innleid', label: 'Innleid personell' },
  { value: 'external', label: 'Eksternt personell' },
];

/** Status innenfor hver personellkategori. */
export const STATUS_OPTIONS = [
  { value: 'active', label: 'Aktiv' },
  { value: 'inactive', label: 'Deaktivert' },
  { value: 'leave', label: 'Permisjon' },
  { value: 'deleted', label: 'Slettet (papirkurv)' },
];

export const GENDER_OPTIONS = ['Kvinne', 'Mann', 'Annet'];
export const LANGUAGE_OPTIONS = ['Norsk bokmål', 'Norsk nynorsk', 'Engelsk', 'Samisk'];
export const NATIONALITY_OPTIONS = ['Norsk', 'Svensk', 'Dansk', 'Finsk', 'Annen'];
export const MARITAL_OPTIONS = ['Ugift', 'Gift', 'Samboer', 'Skilt', 'Enke/enkemann'];
export const EMPLOYMENT_OPTIONS = ['Fast ansatt', 'Midlertidig', 'Vikar', 'Lærling', 'Innleid', 'Ekstern'];
export const COMPENSATION_OPTIONS = ['Fastlønn', 'Timelønn', 'Provisjon', 'Honorar'];
export const ACCESS_OPTIONS = [
  'Regnskap eksternt',
  'Innleie eksternt',
  'Ansatt',
  'Avdelingsleder',
  'Øverste leder',
  'Administrator',
];
export const PROJECT_ROLE_OPTIONS = [
  'Prosjektleder',
  'Prosjekteringsleder',
  'Byggeleder',
  'SHA-koordinator',
  'Anleggsleder',
];

export const OWNER_LABEL = {
  person: 'Ansatt fyller ut',
  company: 'Bedriften fyller ut',
};

export const PURPOSE_LABEL = {
  required: 'Påkrevd',
  cv: 'Til CV',
  operations: 'Drift',
};

export const FORM_SECTIONS = [
  {
    id: 'identity',
    title: 'Navn og kontakt',
    owner: 'person',
    purpose: 'required',
    scope: 'both',
    blurb: 'Navn, bilde og kontakt følger personen, også om hen bytter selskap.',
    fields: [
      { key: 'person.firstName', label: 'Fornavn', type: 'text', requiredFor: 'register' },
      { key: 'person.middleName', label: 'Mellomnavn', type: 'text' },
      { key: 'person.lastName', label: 'Etternavn', type: 'text', requiredFor: 'register' },
      { key: 'person.photoUrl', label: 'Bilde', type: 'photo' },
      { key: 'person.phone', label: 'Mobiltelefon', type: 'phone', requiredFor: 'contact' },
      { key: 'person.email', label: 'E-post', type: 'email', requiredFor: 'contact' },
      { key: 'person.username', label: 'Brukernavn', type: 'text' },
    ],
  },
  {
    id: 'employment',
    title: 'Ansettelse',
    owner: 'company',
    purpose: 'required',
    scope: 'employee',
    blurb: 'Avdeling, stilling og arbeidsforhold gjelder dette selskapet.',
    fields: [
      { key: 'company.personnelKind', label: 'Personell', type: 'choice', options: PERSONNEL_KIND_OPTIONS, requiredFor: 'register' },
      { key: 'company.status', label: 'Status', type: 'choice', options: STATUS_OPTIONS, requiredFor: 'register' },
      { key: 'company.canLogin', label: 'Kan logge inn', type: 'bool' },
      { key: 'company.hasLicense', label: 'Bruker en lisens', type: 'bool' },
      { key: 'company.departmentIds', label: 'Avdeling', type: 'departments' },
      { key: 'company.title', label: 'Tittel', type: 'text', requiredFor: 'cv', placeholder: 'Prosjekt- og byggeleder' },
      { key: 'company.employmentType', label: 'Type ansatt', type: 'suggest', options: EMPLOYMENT_OPTIONS },
      { key: 'company.compensationType', label: 'Type lønnskompensasjon', type: 'suggest', options: COMPENSATION_OPTIONS },
      { key: 'company.workPercent', label: 'Arbeidsprosent', type: 'percent', placeholder: '100' },
      { key: 'company.periodFrom', label: 'Ansatt fra', type: 'date', placeholder: 'dd.mm.åååå' },
      { key: 'company.periodTo', label: 'Ansatt til', type: 'date', placeholder: 'Tomt betyr nåværende' },
      { key: 'company.externalEmployeeNumber', label: 'Eksternt ansattnummer', type: 'text' },
      { key: 'company.email', label: 'E-post arbeid', type: 'email', requiredFor: 'contact' },
    ],
  },
  {
    id: 'access',
    title: 'Tilgang og rolle',
    owner: 'company',
    purpose: 'operations',
    scope: 'employee',
    blurb: 'Ett tilgangsnivå per ansatt. Nivået og eventuelle personavvik settes under Selskap → Tilgang. Det gjør ikke personen til administrator i ProTop.',
    fields: [
      { key: 'company.accessRole', label: 'Tilgangsnivå', type: 'choice', options: ACCESS_OPTIONS },
      { key: 'company.permissions', label: 'Rettigheter', type: 'tags' },
      { key: 'company.canHandleLegal', label: 'Kan behandle juridiske saker', type: 'bool' },
      { key: 'company.projectRole', label: 'Standard rolle på prosjekter', type: 'suggest', options: PROJECT_ROLE_OPTIONS },
    ],
  },
  {
    id: 'link',
    title: 'Knytt til person',
    owner: 'company',
    purpose: 'operations',
    scope: 'employee',
    blurb: 'Når personen knyttes, kan hen fylle ut sin side og gjenbruke CV-en i flere selskap.',
    fields: [
      { key: 'personUid', label: 'Person i ProTop', type: 'member' },
    ],
  },
  {
    id: 'personal',
    title: 'Personopplysninger',
    owner: 'person',
    purpose: 'required',
    scope: 'both',
    blurb: 'Den ansatte fyller ut dette på sin side. Bedriften kan legge inn et utkast først.',
    fields: [
      { key: 'person.birthDate', label: 'Fødselsdato', type: 'date', requiredFor: 'person', placeholder: 'dd.mm.åååå' },
      { key: 'person.gender', label: 'Kjønn', type: 'suggest', options: GENDER_OPTIONS },
      { key: 'person.nationalId', label: 'Personnummer', type: 'text', requiredFor: 'person', sensitive: true, placeholder: '11 siffer' },
      { key: 'person.language', label: 'Språk', type: 'suggest', options: LANGUAGE_OPTIONS },
      { key: 'person.nationality', label: 'Nasjonalitet', type: 'suggest', options: NATIONALITY_OPTIONS, requiredFor: 'cv' },
      { key: 'person.maritalStatus', label: 'Sivil status', type: 'suggest', options: MARITAL_OPTIONS, requiredFor: 'cv' },
      { key: 'person.examYear', label: 'Eksamensår', type: 'text', placeholder: '2012' },
      { key: 'person.educationLevel', label: 'Utdanningsnivå', type: 'text' },
      { key: 'person.competence', label: 'Kompetanse', type: 'textarea' },
    ],
  },
  {
    id: 'address',
    title: 'Adresse',
    owner: 'person',
    purpose: 'required',
    scope: 'both',
    blurb: 'Søk opp adressen, så fylles postnummer og sted.',
    fields: [
      { key: 'person.address1', label: 'Adresselinje 1', type: 'address', requiredFor: 'person' },
      { key: 'person.address2', label: 'Adresselinje 2', type: 'text' },
      { key: 'person.address3', label: 'Adresselinje 3', type: 'text' },
      { key: 'person.postalCode', label: 'Postnummer', type: 'text' },
      { key: 'person.place', label: 'Sted', type: 'text' },
    ],
  },
  {
    id: 'kin',
    title: 'Pårørende',
    owner: 'person',
    purpose: 'required',
    scope: 'both',
    blurb: 'Nærmeste pårørende. Vises bare for administrator og den ansatte.',
    fields: [
      { key: 'person.kinName', label: 'Pårørende', type: 'text', requiredFor: 'person', sensitive: true },
      { key: 'person.kinPhone', label: 'Telefon pårørende', type: 'phone', requiredFor: 'person', sensitive: true },
      { key: 'person.kinEmail', label: 'E-post', type: 'email', sensitive: true },
      { key: 'person.kinNote', label: 'Merknad', type: 'textarea', sensitive: true },
    ],
  },
  {
    id: 'comment',
    title: 'Kommentar',
    owner: 'company',
    purpose: 'operations',
    scope: 'employee',
    blurb: 'Internt notat for bedriften. Personnummer og datoer hører hjemme i feltene over.',
    fields: [
      { key: 'company.comment', label: 'Kommentar', type: 'textarea', sensitive: true },
    ],
  },
  {
    id: 'cvProfile',
    title: 'CV-profil',
    owner: 'person',
    purpose: 'cv',
    scope: 'both',
    blurb: 'Innledning på CV-en. Tittelen i selskapet brukes hvis overskriften står tom.',
    fields: [
      { key: 'cv.headline', label: 'Overskrift', type: 'text', placeholder: 'Partner og prosjekteringsleder' },
      { key: 'cv.summary', label: 'Oppsummering og nøkkelkvalifikasjoner', type: 'textarea', requiredFor: 'cv' },
    ],
  },
  {
    id: 'education',
    title: 'Utdanning',
    owner: 'person',
    purpose: 'cv',
    scope: 'both',
    repeatable: true,
    collection: 'cv.education',
    itemLabel: 'Utdanning',
    requiredFor: 'cv',
    fields: [
      { key: 'from', label: 'Fra', type: 'text', placeholder: '2020' },
      { key: 'to', label: 'Til', type: 'text', placeholder: '2022' },
      { key: 'school', label: 'Skole', type: 'text' },
      { key: 'program', label: 'Linje / grad', type: 'text' },
    ],
  },
  {
    id: 'certifications',
    title: 'Sertifiseringer',
    owner: 'person',
    purpose: 'cv',
    scope: 'both',
    repeatable: true,
    collection: 'cv.certifications',
    itemLabel: 'Sertifisering',
    fields: [
      { key: 'title', label: 'Sertifisering', type: 'text' },
    ],
  },
  {
    id: 'courses',
    title: 'Kurs',
    owner: 'person',
    purpose: 'cv',
    scope: 'both',
    repeatable: true,
    collection: 'cv.courses',
    itemLabel: 'Kurs',
    fields: [
      { key: 'date', label: 'Dato', type: 'text', placeholder: '05.2026' },
      { key: 'title', label: 'Kurs', type: 'text' },
    ],
  },
  {
    id: 'experience',
    title: 'Erfaring',
    owner: 'person',
    purpose: 'cv',
    scope: 'both',
    repeatable: true,
    collection: 'cv.experience',
    itemLabel: 'Erfaring',
    requiredFor: 'cv',
    fields: [
      { key: 'employer', label: 'Arbeidsgiver', type: 'text' },
      { key: 'place', label: 'Sted', type: 'text' },
      { key: 'from', label: 'Fra', type: 'text', placeholder: '2016' },
      { key: 'to', label: 'Til', type: 'text', placeholder: 'nåværende' },
      { key: 'current', label: 'Nåværende stilling', type: 'bool' },
      { key: 'title', label: 'Stilling', type: 'text' },
      { key: 'tasks', label: 'Arbeidsoppgaver', type: 'textarea', placeholder: 'En linje per oppgave' },
    ],
  },
  {
    id: 'projects',
    title: 'Prosjekter',
    owner: 'person',
    purpose: 'cv',
    scope: 'both',
    repeatable: true,
    collection: 'cv.projects',
    itemLabel: 'Prosjekt',
    blurb: 'Referanseprosjekter knyttet til personen. På CV-en åpner blyanten prosjektet, og PDF og Word lager referansearket.',
    fields: [
      { key: 'title', label: 'Prosjekt', type: 'text' },
      { key: 'images', label: 'Bilder', type: 'photos' },
      { key: 'address', label: 'Adresse', type: 'text' },
      { key: 'category', label: 'Kategori', type: 'text', placeholder: 'Offentlig næring' },
      { key: 'client', label: 'Kunde', type: 'text' },
      { key: 'object', label: 'Objekt', type: 'text' },
      { key: 'period', label: 'Periode', type: 'text' },
      { key: 'cost', label: 'Kostnad', type: 'text', placeholder: '190 MNOK eks mva' },
      { key: 'area', label: 'Areal', type: 'text', placeholder: '59 172 m2' },
      { key: 'buildingClass', label: 'Tiltaksklasse', type: 'text' },
      { key: 'description', label: 'Beskrivelse', type: 'textarea', placeholder: 'Teksten på referansearket' },
      { key: 'referenceName', label: 'Navn på referansearket', type: 'text' },
      { key: 'contact', label: 'Kontakt', type: 'text' },
      { key: 'contactCompany', label: 'Firma hos kontakt', type: 'text' },
      { key: 'phone', label: 'Telefon', type: 'text' },
      { key: 'email', label: 'E-post', type: 'email' },
      { key: 'employer', label: 'Arbeidsgiver i perioden', type: 'text' },
      { key: 'roles', label: 'Roller i prosjektet', type: 'textarea' },
      { key: 'responsibility', label: 'Ansvar i prosjektet', type: 'textarea' },
    ],
  },
];

export function sectionsFor(scope) {
  const want = scope === 'profile' ? 'profile' : 'employee';
  return FORM_SECTIONS.filter((section) => section.scope === 'both' || section.scope === want);
}

const CV_PROFILE_KEYS = ['person.language', 'person.nationality', 'person.maritalStatus'];

/** Feltene som skrives på CV-siden: profilinjer og CV-avsnittene. */
export function cvEditorSections(scope) {
  return sectionsFor(scope).flatMap((section) => {
    if (section.purpose === 'cv') return [section];
    if (section.id !== 'personal') return [];
    return [{
      ...section,
      title: 'Profil',
      purpose: 'cv',
      blurb: 'Bildet følger personen. Språk, nasjonalitet og sivil status vises øverst på CV-en.',
      fields: [
        { key: 'person.photoUrl', label: 'Bilde', type: 'photo' },
        ...section.fields.filter((field) => CV_PROFILE_KEYS.includes(field.key)),
      ],
    }];
  });
}

export function scalarFields() {
  return FORM_SECTIONS.filter((section) => !section.repeatable).flatMap((section) => (
    section.fields.map((field) => ({ ...field, sectionId: section.id, owner: section.owner, purpose: section.purpose }))
  ));
}

export function repeatableSections() {
  return FORM_SECTIONS.filter((section) => section.repeatable);
}
