/**
 * Forklaring bak (i) på Lese, Begrenset redigering og Admin i tilgangsmatrisen.
 * Kort om hva trinnet gir i akkurat den modulen eller undersiden, slik appen faktisk virker.
 * Høyere trinn tar med det som står under. Nøklene er ressurs-id-ene i ACCESS_MENU.
 * see = Lese, read = Begrenset redigering, write = Admin.
 */

const GENERIC = {
  see: 'Åpner siden og ser innholdet.',
  read: 'Som Lese, og kan opprette og endre innhold.',
  write: 'Som Begrenset redigering, og har innstillinger, import, sletting og full styring i modulen.',
};

const SAME_AS_READ = 'Gir ikke mer enn Lese her.';
const SAME_AS_EDIT = 'Gir ikke mer enn Begrenset redigering her.';

export const ACCESS_HELP = {
  companyPublic: {
    see: 'Ser selskapssiden med offentlig informasjon og nyheter.',
    read: 'Som Lese, og kan publisere nyheter og endre eller slette egne innlegg.',
    write: 'Som Begrenset redigering, og kan endre siden, bannerbildet og profilteksten, og endre eller slette andres innlegg.',
  },
  units: {
    see: 'Ser underenheter og avdelinger.',
    read: SAME_AS_READ,
    write: 'Kan opprette, endre og knytte underenheter og avdelinger.',
  },
  companyProfile: {
    see: 'Åpner Selskapsinnstillinger og ser oppsettet.',
    read: SAME_AS_READ,
    write: 'Kan endre bedriftsprofil, logo, kontakt, kjøreadresse og konsernstruktur, og hente på nytt fra Brønnøysund.',
  },
  moduleSettings: {
    see: 'Ser hvilke moduler bedriften har slått på.',
    read: SAME_AS_READ,
    write: 'Kan slå moduler av og på for hele bedriften.',
  },
  accessControl: {
    see: 'Ser nivåene, personene og rettighetsmatrisen, uten å endre.',
    read: 'Kan endre hvilke nivå medlemmene har. Ikke sitt eget, og aldri mer enn en selv har.',
    write: 'Kan også endre selve nivåene i rettighetsmatrisen.',
  },
  employees: {
    see: 'Ser ansattlisten. På andre ansatte bare Hovedside, uten personlige data, arbeidsforhold, mangler og tagger. Bare prosjekter en selv er med i vises.',
    read: 'Som Lese, og ser også Oversikt, Timer og Fravær på andre (bare visning). Kan redigere hovedsiden og registrere medarbeidere, men ikke avslutte eller aktivere en ansettelse.',
    write: 'Alle faner på alle ansatte, også Filer, Prosjektutlegg, Innstillinger og CV. Kan invitere, avslutte og aktivere ansettelser (status og sluttdato), importere liste og slette.',
  },
  ownProfile: {
    see: 'Ser Hovedside på egen profil, uten å endre.',
    read: 'Holder egen profil oppdatert: hovedside, timer, fravær, filer, prosjektutlegg og CV.',
    write: 'Som Begrenset redigering, og også Innstillinger på egen profil.',
  },
  hr: {
    see: 'Ser HR-oversikten og personalhåndboken. Vanlige ansatte ser delte poster på Min side uten denne.',
    read: 'Som Lese, og kan registrere og endre i HR-oversikten og personalhåndboken.',
    write: SAME_AS_EDIT,
  },
  hrPeople: {
    see: 'Ser personellmappen og HR-skjema.',
    read: 'Som Lese, og kan registrere og endre på personene, også pårørende-oppgaver.',
    write: SAME_AS_EDIT,
  },
  hrAgreements: {
    see: 'Ser arbeidsavtalene.',
    read: 'Som Lese, og kan registrere og laste opp avtaler.',
    write: SAME_AS_EDIT,
  },
  hrPayroll: {
    see: 'Ser lønnsopplysningene i HR.',
    read: 'Som Lese, og kan registrere og endre lønn.',
    write: SAME_AS_EDIT,
  },
  hrFollowup: {
    see: 'Ser oppfølging og medarbeidersamtaler.',
    read: 'Som Lese, og kan registrere og endre oppfølging.',
    write: SAME_AS_EDIT,
  },
  hrCompliance: {
    see: 'Ser Lovpålagt (kompetanse og HMS-opplæring), også i ISO.',
    read: 'Som Lese, og kan registrere og endre.',
    write: SAME_AS_EDIT,
  },
  hrRecruitment: {
    see: 'Ser rekruttering og søknadskøen.',
    read: 'Som Lese, og kan registrere og endre stillinger og søkere.',
    write: SAME_AS_EDIT,
  },
  absence: {
    see: 'Ser eget fravær og kan registrere det. Andres fravær krever Begrenset redigering på Andres timer.',
    read: SAME_AS_READ,
    write: SAME_AS_READ,
  },
  absenceReport: {
    see: 'Ser fraværsrapporten for seg selv. Andres tall krever Andres timer.',
    read: SAME_AS_READ,
    write: 'Som Lese, og kan importere fraværslister.',
  },
  absencePlanned: {
    see: 'Ser planlagt fravær og ferieplanen.',
    read: SAME_AS_READ,
    write: SAME_AS_READ,
  },
  absenceSettings: {
    see: 'Gir ikke tilgang alene. Innstillingene krever Admin.',
    read: 'Gir ikke tilgang alene. Innstillingene krever Admin.',
    write: 'Kan endre fraværstyper, helligdager, egne fridager og ferieplan.',
  },
  hours: {
    see: 'Ser egne timer i timelisten, uten å endre.',
    read: 'Fører og endrer egne timer.',
    write: SAME_AS_EDIT,
  },
  hoursOthers: {
    see: 'Ser andres timer, fravær og produktivitet, uten å endre.',
    read: 'Velger person og fører, endrer og godkjenner andres timer og fravær.',
    write: SAME_AS_EDIT,
  },
  hoursReport: {
    see: 'Åpner føringer i timerapporten uten å endre. Uten Andres timer bare egne.',
    read: 'Som Lese, og kan endre føringer, men ikke slette.',
    write: 'Alt i timerapporten: ser alle, sletter og importerer.',
  },
  hoursBalance: {
    see: 'Ser timesaldoen, uten å justere.',
    read: 'Som Lese, og kan justere saldoen.',
    write: 'Som Begrenset redigering, og kan fjerne justeringer og åpne alle medarbeidere.',
  },
  hoursApproval: {
    see: 'Ser godkjenning og lås på egne timelister. Å godkjenne andre krever Begrenset redigering på Andres timer.',
    read: SAME_AS_READ,
    write: SAME_AS_READ,
  },
  iso: {
    see: 'Ser publiserte prosesser og dokumenter, melder avvik og fyller ut skjema. Ser bare egne prosjekter.',
    read: 'Behandler saker, registre og utkast. Med ledende ISO-rolle også godkjenne, publisere og lukke. Ser alle prosjekter i ISO.',
    write: 'Som Begrenset redigering, og ISO-innstillingene: omfang, roller og risikometode.',
  },
  productivity: {
    see: 'Ser kapasitet og produktivitet for seg selv (andre krever Andres timer). Bare egne prosjekter, også i Prosjektfremdrift.',
    read: 'Som Lese, og kan planlegge kapasitet.',
    write: SAME_AS_EDIT,
  },
  economyEarnings: {
    see: 'Ser inntjeningen, også fanen Inntjening på ansatte og prosjekt.',
    read: 'Som Lese, og kan endre i inntjeningen.',
    write: 'Full styring av inntjeningen.',
  },
  economyCustomers: {
    see: 'Ser kundesummene.',
    read: SAME_AS_READ,
    write: SAME_AS_READ,
  },
  economyContracts: {
    see: 'Ser avtalesummene.',
    read: SAME_AS_READ,
    write: SAME_AS_READ,
  },
  economyInvoices: {
    see: GENERIC.see,
    read: GENERIC.read,
    write: 'Som Begrenset redigering, og kan importere fakturalister.',
  },
  economyProjectExpenses: {
    see: 'Ser prosjektutlegg.',
    read: GENERIC.read,
    write: 'Som Begrenset redigering, og kan importere utleggslister.',
  },
  economySettings: {
    see: 'Gir ikke tilgang alene. Innstillingene krever Admin.',
    read: 'Gir ikke tilgang alene. Innstillingene krever Admin.',
    write: 'Kan endre økonomiinnstillingene, også kjøresatsen.',
  },
  productSales: {
    see: 'Ser produktsalget.',
    read: GENERIC.read,
    write: 'Som Begrenset redigering, og kan importere salgslister.',
  },
  products: {
    see: 'Ser produktkatalogen og produktsidene.',
    read: 'Som Lese, og kan opprette, endre, godkjenne og arkivere produkter.',
    write: 'Som Begrenset redigering, og kan slette produkter for godt.',
  },
  equipment: {
    see: 'Ser bare firmautstyr og kjøretøy en har rettighet på (Tilgang på utstyret), også i Kalender og kjørebok.',
    read: 'Som Lese, og kan registrere, endre og reservere utstyr og registrere firmabil.',
    write: 'Ser alt utstyr og alle kjøretøy, sletter og bestemmer hvem som kan bruke hvert utstyr.',
  },
  meetings: {
    see: 'Ser møter som er åpne for alle i bedriften, og møter en selv er med i. Laster ned referat.',
    read: 'Som Lese, og kan opprette møter og styre møter der en er møteleder eller referent.',
    write: 'Styrer alle møter som er åpne for bedriften, og møtemalene. Møter som bare er for deltakerne, ser bare deltakerne og bedriftens administratorer.',
  },
  mileage: {
    see: 'Åpner kjøreboken og ser kjøreturene.',
    read: GENERIC.read,
    write: 'Som Begrenset redigering, og kan endre kjøresatsen.',
  },
  tenderSettings: {
    see: 'Gir ikke tilgang alene. Innstillingene krever Admin.',
    read: 'Gir ikke tilgang alene. Innstillingene krever Admin.',
    write: 'Kan endre anbudsinnstillingene og innloggingsportalen.',
  },
  customers: {
    see: GENERIC.see,
    read: GENERIC.read,
    write: 'Som Begrenset redigering, og kan importere kundelister.',
  },
  projects: {
    see: 'Ser bare prosjekter en er med i (deltaker, prosjektleder eller har ført timer): hovedside, egne utlegg, eget salg og egne timer.',
    read: 'Som Lese, og kan endre prosjektbilde, periode og adresse på prosjektene en er med i.',
    write: 'Ser og endrer alle prosjekter: opprette, importere, team, økonomi, fakturering og sletting.',
  },
  assignedProjects: {
    see: 'Ser prosjektene en er tildelt. Uten Lese på Prosjekt føres timer bare på tildelte prosjekt.',
    read: 'Som Lese, og kan endre prosjektbilde, periode og adresse på tildelte prosjekt.',
    write: SAME_AS_EDIT,
  },
  forms: {
    see: 'Åpner Skjema og sjekklister og fyller dem ut.',
    read: GENERIC.read,
    write: GENERIC.write,
  },
  viewAs: {
    see: 'Kan se som en annen bruker, men bare bedriftsinnstillingene.',
    read: 'Kan se alle moduler og apper slik den valgte brukeren ser dem. Aldri mer enn en har selv.',
    write: SAME_AS_EDIT,
  },
};

/** Teksten bak (i) for et område og et trinn (see, read, write). */
export function accessHelp(resourceId, action) {
  const row = ACCESS_HELP[resourceId];
  return (row && row[action]) || GENERIC[action] || '';
}
