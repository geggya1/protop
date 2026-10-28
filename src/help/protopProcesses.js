/**
 * Arbeidsflyter på tvers av sider. Hvert steg peker på en side i
 * PROTOP_PAGES; rundturen åpner siden og markerer knappen (find) før
 * forklaringen vises. Ren data, så node-testene og assistenten kan lese den.
 */

import { PROTOP_PAGES } from './protopPages.js';

const tx = (nb, en) => ({ nb, en });

function flowStep(page, title, nb, en, extra = {}) {
  return {
    page,
    title: typeof title === 'string' ? tx(title, title) : title,
    nb,
    en,
    ...extra,
  };
}

export const PROTOP_PROCESSES = {
  'anbud-til-faktura': {
    id: 'anbud-til-faktura',
    icon: 'git-merge',
    accent: '#e11d48',
    title: tx('Fra anbud til faktura', 'From tender to invoice'),
    pitch: tx(
      'Hele løpet i ProTop: finn konkurransen, gi tilbud, registrer avtalen, opprett prosjektet, før og godkjenn timer, og send fakturaen.',
      'The whole flow in ProTop: find the competition, bid, register the agreement, create the project, log and approve hours, and send the invoice.',
    ),
    keywords: ['anbud', 'tilbud', 'kontrakt', 'prosjekt', 'timer', 'faktura', 'prosess', 'arbeidsflyt', 'hele løpet'],
    steps: [
      flowStep('anbud.innstillinger', tx('Lær ProTop hva dere leverer', 'Teach ProTop what you deliver'),
        'Under Anbud → Innstillinger lar du AI tolke bedriften, eller legger inn CPV-koder og søkeord. Lagre kriteriene.',
        'Under Tenders → Settings let AI interpret the company, or add CPV codes and keywords. Save the criteria.',
        { find: ['La AI tolke bedriften', 'Legg til CPV'] }),
      flowStep('anbud.varsling', tx('Finn konkurranser', 'Find competitions'),
        '«Oppdater nå» henter nye treff. «Vurder treff med AI» peker ut de beste. Merk de interessante som Aktuell.',
        '“Update now” fetches new hits. “Assess hits with AI” points out the best. Mark the interesting ones as Relevant.',
        { find: ['Oppdater nå'] }),
      flowStep('anbud.foresporsel', tx('Direkte forespørsler', 'Direct requests'),
        'Får dere forespørsel på e-post, slipper du filen her. AI fyller ut, og du trykker «Registrer forespørsel».',
        'If you get a request by email, drop the file here. AI fills it in, and you tap “Register request”.',
        { find: ['Velg filer'] }),
      flowStep('anbud.vurdering', tx('Bestem dere', 'Decide'),
        'Velg avdeling og ansvarlig, og trykk «Gi tilbud» eller «Ikke gi tilbud».',
        'Pick department and owner, and tap “Bid” or “Don’t bid”.',
        { find: ['Gi tilbud'] }),
      flowStep('anbud.tilbud', tx('Lag tilbudet', 'Build the bid'),
        'Åpne tilbudet, hent konkurransegrunnlaget, fordel ansvar og lever. Sett status Vunnet når dere får oppdraget.',
        'Open the bid, fetch the documents, assign owners and submit. Set status Won when you get the job.',
        { find: ['Ny', 'Kontrakter og avtaler'] }),
      flowStep('kontrakt', tx('Registrer avtalen', 'Register the agreement'),
        '«Ny avtale»: velg type, kunde og mal, og huk av «Opprett også prosjekt».',
        '“New agreement”: pick type, customer and template, and tick “Also create project”.',
        { find: ['Ny avtale'] }),
      flowStep('projects', tx('Sett opp prosjektet', 'Set up the project'),
        'Sjekk prismodell og prosjektleder, og legg teamet til under Team, så prosjektet dukker opp i timelistene.',
        'Check pricing model and project manager, and add the team under Team so the project appears in the timesheets.',
        { find: ['Nytt prosjekt'] }),
      flowStep('arbeid.timeliste', tx('Før timer', 'Log hours'),
        'De ansatte fører timer på prosjektet og låser dagene når de er riktige.',
        'Employees log hours on the project and lock the days when they are right.',
        { find: ['Legg til prosjekt', '#timesheet-pick-*'] }),
      flowStep('arbeid.godkjenning', tx('Godkjenn timene', 'Approve the hours'),
        'Leder trykker «Kontroller» og «Godkjenn». Da er timene klare for fakturering.',
        'The manager taps “Review” and “Approve”. Then the hours are ready to invoice.',
        { find: ['Godkjenn', '#kontroller-*', '#godkjenning-laste', '#godkjenning-visning'] }),
      flowStep('okonomi.fakturagrunnlag', tx('Lag fakturautkast', 'Create the draft'),
        '«Opprett utkast» samler godkjente timer, utlegg og salg per kunde og prosjekt.',
        '“Create draft” gathers approved hours, expenses and sales per customer and project.',
        { find: ['Opprett utkast', 'Kun godkjente'] }),
      flowStep('okonomi.faktura', tx('Send og følg opp', 'Send and follow up'),
        '«Send faktura» med EHF eller e-post, og registrer betalingen når pengene kommer.',
        '“Send invoice” by EHF or email, and record the payment when the money arrives.',
        { find: ['Send faktura'], via: ['#invoice-row-*'],
          pending: tx('«Send faktura» ligger inne i fakturaen — utkastet fra fakturagrunnlaget ligger øverst i listen.', '“Send invoice” is inside the invoice — the draft from the invoice basis is at the top of the list.') }),
    ],
  },
  'kunde-prosjekt': {
    id: 'kunde-prosjekt',
    icon: 'briefcase',
    accent: '#1099F4',
    title: tx('Ny kunde og nytt prosjekt', 'New customer and new project'),
    pitch: tx(
      'Registrer kunden fra Brønnøysund, legg inn avtalen og start prosjektet — så kan de ansatte føre timer med en gang.',
      'Register the customer from Brønnøysund, add the agreement and start the project — so staff can log hours right away.',
    ),
    keywords: ['kunde', 'prosjekt', 'avtale', 'oppstart', 'nytt oppdrag'],
    steps: [
      flowStep('kunder', tx('Registrer kunden', 'Register the customer'),
        '«Ny kunde», skriv org.nr eller navn — feltene fylles fra Brønnøysund. Velg ansvarlig og lagre.',
        '“New customer”, type the org. number or name — fields fill from Brønnøysund. Pick owner and save.',
        { find: ['Ny kunde'] }),
      flowStep('kontrakt', tx('Registrer avtalen', 'Register the agreement'),
        '«Ny avtale» på kunden. Huk av «Opprett også prosjekt» om prosjektet skal lages samtidig.',
        '“New agreement” for the customer. Tick “Also create project” to create the project at the same time.',
        { find: ['Ny avtale'] }),
      flowStep('projects', tx('Opprett prosjektet', 'Create the project'),
        'Har du ikke laget prosjektet fra avtalen: «Nytt prosjekt», velg kunden og prismodellen.',
        'If you did not create it from the agreement: “New project”, pick the customer and pricing model.',
        { find: ['Nytt prosjekt'] }),
      flowStep('arbeid.timeliste', tx('Klar for timer', 'Ready for hours'),
        'Prosjektet kan nå legges til i timelisten med «Legg til prosjekt».',
        'The project can now be added to the timesheet with “Add project”.',
        { find: ['Legg til prosjekt'], via: ['#timesheet-pick-*'] }),
    ],
  },
  'ny-ansatt': {
    id: 'ny-ansatt',
    icon: 'person-add',
    accent: '#4f46e5',
    title: tx('Ta imot en ny ansatt', 'Onboard a new employee'),
    pitch: tx(
      'Fra søknad til første timeliste: registrer, inviter, gi riktig tilgang og legg inn arbeidsavtalen.',
      'From application to first timesheet: register, invite, give the right access and add the employment agreement.',
    ),
    keywords: ['ny ansatt', 'onboarding', 'invitere', 'tilgang', 'arbeidsavtale', 'rekruttering'],
    steps: [
      flowStep('hr.rekruttering', tx('Ansett søkeren', 'Hire the applicant'),
        'Kommer personen fra rekruttering, trykk «Ansett (vunnet)» på søknaden.',
        'If the person comes from recruitment, tap “Hire (won)” on the application.',
        { find: ['Ansett (vunnet)', 'Publiser annonse'] }),
      flowStep('ansatte', tx('Registrer og inviter', 'Register and invite'),
        '«Ny ansatt»: navn, e-post, avdeling og nivå. Huk av «Send velkomstmal» for invitasjon.',
        '“New employee”: name, email, department and level. Tick “Send welcome template” to invite.',
        { find: ['Ny ansatt'] }),
      flowStep('selskap.tilgang', tx('Riktig tilgang', 'The right access'),
        'Sjekk at personen står i riktig nivå under Personer. «Vis som» viser hva personen ser.',
        'Check the person is in the right level under People. “View as” shows what they see.',
        { find: ['Personer'] }),
      flowStep('hr.avtaler', tx('Arbeidsavtalen', 'The employment agreement'),
        'Last opp eller skann arbeidsavtalen og lagre den på personen.',
        'Upload or scan the agreement and save it on the person.',
        { find: ['Last opp avtale', 'Registrer avtale'], via: ['#hr-row-*'] }),
      flowStep('projects', tx('Legg til i prosjekt', 'Add to a project'),
        'Åpne prosjektet → Team → «+ Legg til medlem», så kan den nye føre timer.',
        'Open the project → Team → “+ Add member”, so the new person can log hours.',
        { find: ['Legg til medlem'], via: ['#project-tab-team', '#project-open-*'],
          pending: tx('Prosjektene vises i listen når de er opprettet.', 'Projects show in the list once created.') }),
    ],
  },
  ferie: {
    id: 'ferie',
    icon: 'sunny',
    accent: '#d97706',
    title: tx('Ferie og fravær', 'Holiday and absence'),
    pitch: tx(
      'Sett opp fraværstypene, la de ansatte søke ferie, godkjenn og følg med på hvem som er borte.',
      'Set up absence types, let staff request holiday, approve and keep track of who is away.',
    ),
    keywords: ['ferie', 'fravær', 'sykdom', 'permisjon', 'godkjenne ferie'],
    steps: [
      flowStep('selskap.fravaerstyper', tx('Sett opp', 'Set up'),
        'Fraværstyper, fridager og ferieplan med inngående feriedager.',
        'Absence types, days off and the holiday plan with opening balances.',
        { find: ['Fraværstyper', 'Ferieplan'] }),
      flowStep('arbeid.planlagt', tx('Søk ferie', 'Request holiday'),
        '«Registrer ferie» og «Send til godkjenning».',
        '“Register holiday” and “Send for approval”.',
        { find: ['Registrer ferie', 'Filtrer og sorter'] }),
      flowStep('arbeid.fravaer', tx('Følg med', 'Keep track'),
        'Fraværsoversikten viser hvem som er borte og hvor mange feriedager som gjenstår.',
        'The absence overview shows who is away and how many holiday days remain.',
        { find: ['Tabell', 'Måned'] }),
      flowStep('arbeid.fravaersrapport', tx('Rapport', 'Report'),
        'Fraværsrapporten viser utviklingen over tid — grunnlag for HMS og ISO.',
        'The absence report shows the trend over time — input for HSE and ISO.',
        { find: ['Filtrer og sorter'] }),
    ],
  },
  avvik: {
    id: 'avvik',
    icon: 'alert-circle',
    accent: '#15803d',
    title: tx('Melde og lukke avvik', 'Report and close a deviation'),
    pitch: tx(
      'Fra hendelse til læring: meld avviket, vurder det, finn årsak, sett tiltak og lukk med effektkontroll.',
      'From incident to learning: report the deviation, assess it, find the cause, set actions and close with an effectiveness check.',
    ),
    keywords: ['avvik', 'hendelse', 'hms', 'tiltak', 'iso', 'nestenulykke'],
    steps: [
      flowStep('iso.oversikt', tx('Sett opp én gang', 'Set up once'),
        'Første gang: «Sett opp ledelsessystemet». Etterpå ligger «Meld avvik» øverst på Oversikt i ISO.',
        'First time: “Set up the management system”. After that “Report deviation” is at the top of Overview in ISO.',
        { find: ['Sett opp ledelsessystemet', 'Meld avvik'] }),
      flowStep('iso.avvik', tx('Meld og vurder', 'Report and assess'),
        '«Meld avvik» med fakta, dato og prosjekt. Ansvarlig setter alvorlighet og meldeplikt.',
        '“Report deviation” with facts, date and project. The owner sets severity and reporting duty.',
        { find: ['Meld avvik'] }),
      flowStep('stars', tx('Utfør tiltakene', 'Carry out the actions'),
        'Tiltak blir oppgaver hos den ansvarlige. Meld dem utført i saken.',
        'Actions become tasks for the owner. Report them done in the case.',
        { find: ['Ny oppgave'] }),
      flowStep('iso.avvik', tx('Lukk med læring', 'Close with learning'),
        'Kontroller effekten, trykk «Lukk saken» og «Godkjenn lukking». Læringen blir med i ledelsens gjennomgang.',
        'Check the effect, tap “Close case” and “Approve closure”. The learning goes into the management review.',
        { find: ['Meld avvik'] }),
    ],
  },
  ledelsessystem: {
    id: 'ledelsessystem',
    icon: 'shield-checkmark',
    accent: '#15803d',
    title: tx('Ledelsessystemet i ProTop', 'The management system in ProTop'),
    pitch: tx(
      'Kvalitet, miljø og arbeidsmiljø (ISO 9001, 14001 og 45001) i ett system: sett opp eller importer, godkjenn dokumentene, fordel rollene, følg årshjulet, meld avvik og avslutt året med ledelsens gjennomgang.',
      'Quality, environment and health & safety (ISO 9001, 14001 and 45001) in one system: set up or import, approve the documents, assign roles, follow the annual cycle, report deviations and close the year with the management review.',
    ),
    keywords: ['iso', 'ledelsessystem', 'kvalitetssystem', 'k-hms', 'hmsk', 'internkontroll', 'kom i gang', 'årshjul'],
    steps: [
      flowStep('iso.innstillinger', tx('Sett opp eller importer', 'Set up or import'),
        'I Innstillinger: velg standarder, omfang og ISO-roller, eller «Importer ledelsessystem» fra en pakke. Enkeltfiler går også: «Importer fra Word» i Dokumenter, «Importer fra Visio» i Prosesser og «Excel» på hvert register. Alt legges inn som utkast til godkjenning.',
        'In Settings: choose standards, scope and ISO roles, or “Import management system” from a package. Single files work too: “Import from Word” in Documents, “Import from Visio” in Processes and “Excel” on each register. Everything goes in as drafts for approval.',
        { find: ['Importer ledelsessystem', 'Sett opp ledelsessystemet'] }),
      flowStep('iso.dokumenter', tx('Godkjenn dokumentene', 'Approve the documents'),
        'Les policyer og prosedyrer, rett det som må rettes, og «Godkjenn og publiser». Krev lesebekreftelse der de ansatte må bekrefte.',
        'Read policies and procedures, correct what needs correcting, and “Approve and publish”. Require read confirmation where staff must confirm.',
        { find: ['Nytt dokument'] }),
      flowStep('iso.organisasjon', tx('Roller og ansvar', 'Roles and responsibilities'),
        'Velg hvem som har rollene blant de ansatte. Organisasjonskartet og myndighetsmatrisen følger dataene.',
        'Pick the role holders among the employees. The organisation chart and the authority matrix follow the data.',
        { find: ['Organisasjonskart og roller'] }),
      flowStep('iso.prosesser', tx('Prosesskartene', 'The process maps'),
        'Kontroller kartene og publiser dem. Visio-filer kan importeres direkte.',
        'Check the maps and publish them. Visio files can be imported directly.',
        { find: ['Importer fra Visio', 'Ny prosess'] }),
      flowStep('iso.arshjul', tx('Følg årshjulet', 'Follow the annual cycle'),
        'Aktivitetene for måneden står øverst og blir oppgaver når måneden starter.',
        'The activities for the month are at the top and become tasks when the month starts.',
        { find: ['Denne måneden'] }),
      flowStep('iso.avvik', tx('Meld avvik og forbedringer', 'Report deviations and improvements'),
        'Alle melder avvik, RUH og forbedringsforslag i ISO / K-HMS. Gjelder det et prosjekt, velger du prosjektet i meldingen.',
        'Everyone reports deviations, near misses and improvement proposals in ISO / QHSE. If it concerns a project, pick the project in the report.',
        { find: ['Meld avvik'] }),
      flowStep('iso.ledelse', tx('Ledelsens gjennomgang', 'Management review'),
        '«Hent grunnlag» samler avvik, mål, risiko, revisjoner og hendelser. Beslutningene blir oppgaver.',
        '“Fetch input” collects deviations, objectives, risks, audits and incidents. The decisions become tasks.',
        { find: ['Hent grunnlag'] }),
    ],
  },
  oppstart: {
    id: 'oppstart',
    icon: 'rocket',
    accent: '#07274C',
    title: tx('Kom i gang med bedriften', 'Get the company started'),
    pitch: tx(
      'Grunnoppsettet for en ny bedrift i ProTop: profil, moduler, ansatte, tilgang, kunder og første prosjekt.',
      'The basic setup for a new company in ProTop: profile, modules, employees, access, customers and the first project.',
    ),
    keywords: ['kom i gang', 'oppstart', 'oppsett', 'ny bedrift', 'start'],
    steps: [
      flowStep('selskap.innstillinger', tx('Profil og logo', 'Profile and logo'),
        'Last opp logo, sjekk kontaktinfo og kjøreadresse, og lagre.',
        'Upload the logo, check contact details and driving address, and save.',
        { find: ['Last opp logo'] }),
      flowStep('selskap.moduler', tx('Velg moduler', 'Choose modules'),
        'Slå av modulene dere ikke bruker, så menyen blir enkel.',
        'Turn off the modules you don’t use, so the menu stays simple.',
        { find: ['Lagre moduler'] }),
      flowStep('ansatte', tx('Legg inn de ansatte', 'Add the employees'),
        '«Ny ansatt» for hver, eller «Importer liste» fra Excel.',
        '“New employee” for each, or “Import list” from Excel.',
        { find: ['Ny ansatt'] }),
      flowStep('selskap.tilgang', tx('Gi tilgang', 'Grant access'),
        'Plasser de ansatte i riktige nivåer.',
        'Place the employees in the right levels.',
        { find: ['Personer', 'Nivåer'] }),
      flowStep('kunder', tx('Kundene', 'The customers'),
        '«Ny kunde» eller «Importer fil».',
        '“New customer” or “Import file”.',
        { find: ['Ny kunde'] }),
      flowStep('projects', tx('Første prosjekt', 'The first project'),
        '«Nytt prosjekt» — så kan timeføringen starte.',
        '“New project” — then time logging can start.',
        { find: ['Nytt prosjekt'] }),
    ],
  },
};

export function getProcess(id) {
  return PROTOP_PROCESSES[id] || null;
}

export function listProcesses() {
  return Object.values(PROTOP_PROCESSES);
}

/** Prosesser som går gjennom en side, så hjelpekortet kan tilby hele flyten. */
export function processesForPage(pageKey) {
  if (!pageKey) return [];
  return listProcesses().filter((proc) => proc.steps.some((s) => s.page === pageKey));
}

/** Steg med side-navigasjon (tab/subView) og sidens ikon/farge. */
export function processTour(processId) {
  const proc = getProcess(processId);
  if (!proc) return [];
  return proc.steps.map((s, index) => {
    const page = PROTOP_PAGES[s.page] || null;
    return {
      ...s,
      index,
      go: page?.nav || null,
      pageLabel: page?.label || null,
      anchor: s.anchor || 'content',
      scene: 'hub',
      advance: false,
    };
  });
}
