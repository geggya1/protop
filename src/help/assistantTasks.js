/**
 * Oppgaver for ProTop-assistenten: det brukerne faktisk spør om
 * («Hvordan fører jeg fravær?», «Hvordan søker jeg ferie?»), med et direkte
 * svar og eksakte klikk slik knappene heter i appen.
 *
 *   q        spørsmålet slik det vises som forslag
 *   ask      formuleringer som treffer oppgaven (alle ordene må finnes i spørsmålet)
 *   intro    ett direkte svar før stegene
 *   steps    eksakte klikk; `gate(side, steg)` følger tilgangen til steget på siden,
 *            `go: true` = bare «gå til siden» (hoppes over når brukeren står der)
 *   after    tips under stegene
 *   show     «Vis meg»: rundturen på siden fra steget (siden brukeren står på velges først)
 *   related  oppgaver som foreslås etterpå
 *
 * Ren data — ingen React Native-import, så node-testene kan lese den.
 */

const tx = (nb, en) => ({ nb, en });
const s = (title, nb, en, extra = {}) => ({ title, nb, en, ...extra });
/** Steget følger tilgangen til steg nr. `index` på ProTop-siden `page` (src/help/helpAccess.js). */
const gate = (page, index) => ({ access: { page, index } });
const at = (page, step) => ({ page, step });

function task(def) {
  return { kind: 'task', steps: [], ask: tx([], []), keywords: [], show: [], related: [], ...def };
}

const TIMELISTE = [at('timeliste', 0), at('arbeid.timeliste', 1)];

export const ASSISTANT_TASKS = [
  /* ───────────── Timer og fravær ───────────── */
  task({
    id: 'task.fravaer',
    q: tx('Hvordan fører jeg fravær?', 'How do I log absence?'),
    title: tx('Føre fravær (sykdom, egenmelding, avspasering …)', 'Log absence (sickness, self-certified, time off …)'),
    ask: tx(
      ['føre fravær', 'registrere fravær', 'legge inn fravær', 'fravær', 'syk', 'sykdom', 'sykemelding', 'sykemeldt', 'egenmelding',
        'sykt barn', 'barnet er sykt', 'barnet mitt er sykt', 'syk i dag', 'avspasering', 'legebesøk', 'lege', 'legen', 'tannlege',
        'permisjon', 'fri', 'fridag', 'seminar', 'permittert', 'borte fra jobb'],
      ['log absence', 'register absence', 'absence', 'sick', 'sickness', 'sick leave', 'sick child', 'time off', 'doctor', 'leave'],
    ),
    // «Hvem er syk?» er oversikten, ikke føring.
    avoid: tx(['hvem', 'oversikt', 'fraværstype', 'fraværstyper'], ['who', 'overview', 'type']),
    intro: tx(
      'Fravær føres i timelisten, på dagen det gjelder. Du velger fraværstypen én gang, så ligger den som en egen rad.',
      'Absence is logged in the timesheet, on the day it applies. You pick the absence type once, and it stays as its own row.',
    ),
    steps: [
      s(tx('Åpne timelisten', 'Open the timesheet'),
        'Gå til Menyen → Timeliste (eller Timer / arbeid per ansatt → Timeliste og velg deg selv).',
        'Go to Menu → Timesheet (or Hours / work per employee → Timesheet and pick yourself).', { go: true }),
      s(tx('Legg til fravær / ferie', 'Add absence / holiday'),
        'Trykk «Legg til fravær / ferie» nederst i timelisten.',
        'Tap “Add absence / holiday” at the bottom of the timesheet.', gate('timeliste', 2)),
      s(tx('Velg type', 'Pick the type'),
        'Huk av typen — f.eks. «Sykdom med egenmelding», «Sykdom med sykemelding», «Sykt barn», «Avspasering» eller «Legebesøk med lønn» — og trykk «Legg til fravær / ferie». Typen blir en egen rad i timelisten.',
        'Tick the type — e.g. “Sickness with self-certification”, “Sickness with sick note”, “Sick child”, “Time off” or “Doctor’s visit with pay” — and tap “Add absence / holiday”. The type becomes its own row.'),
      s(tx('Før timene på dagen', 'Enter the hours for the day'),
        'Trykk dagen på fraværsraden. Kontroller datoen, skriv timer (7:30 er en hel dag) og eventuelt en merknad. Trykk «Lagre».',
        'Tap the day on the absence row. Check the date, enter the hours (7:30 is a full day) and an optional note. Tap “Save”.'),
      s(tx('Lås når uka er ferdig', 'Lock when the week is done'),
        'Trykk låsen over dagen. Da går timene og fraværet til godkjenning hos leder.',
        'Tap the lock above the day. The hours and absence then go to your manager for approval.'),
    ],
    after: tx(
      'Ferie for en hel periode registrerer du heller under Fravær → Planlagt fravær («+ Registrer ferie»).',
      'Holiday for a whole period is better registered under Absence → Planned absence (“+ Register holiday”).',
    ),
    show: [at('timeliste', 2), at('arbeid.timeliste', 3)],
    related: ['task.ferie', 'task.timesaldo', 'task.las'],
  }),
  task({
    id: 'task.ferie',
    q: tx('Hvordan søker jeg ferie?', 'How do I request holiday?'),
    title: tx('Søke ferie', 'Request holiday'),
    ask: tx(
      ['søke ferie', 'søker ferie', 'søknad ferie', 'feriesøknad', 'registrere ferie', 'legge inn ferie', 'planlegge ferie', 'ferieplan', 'ta ferie', 'ta ut ferie', 'ferie'],
      ['request holiday', 'holiday request', 'register holiday', 'plan holiday', 'vacation', 'holiday'],
    ),
    intro: tx(
      'Ferie for en periode registrerer du under Planlagt fravær. Den sendes til godkjenning, og godkjent ferie havner i timelisten.',
      'Holiday for a period is registered under Planned absence. It goes for approval, and approved holiday lands in the timesheet.',
    ),
    steps: [
      s(tx('Åpne Planlagt fravær', 'Open Planned absence'),
        'Gå til Fravær → Planlagt fravær.',
        'Go to Absence → Planned absence.', { ...gate('arbeid.planlagt', 0), go: true }),
      s(tx('Registrer ferie', 'Register holiday'),
        'Trykk «+ Registrer ferie» (står det «Send ferie til godkjenning», trykker du den).',
        'Tap “+ Register holiday” (if it says “Send holiday for approval”, tap that).', gate('arbeid.planlagt', 0)),
      s(tx('Velg periode', 'Pick the period'),
        'Velg «Fra» og «Til». ProTop teller virkedagene, og skriv gjerne en merknad.',
        'Pick “From” and “To”. ProTop counts the working days; add a note if you like.'),
      s(tx('Send', 'Send'),
        'Trykk «Lagre» (eller «Send til godkjenning»). Perioden står som Åpen til den er godkjent.',
        'Tap “Save” (or “Send for approval”). The period shows as Open until it is approved.', gate('arbeid.planlagt', 1)),
    ],
    after: tx(
      '«Ferieplan» på samme side viser «Igjen å planlegge» og «Tatt ut». Enkeltdager kan også føres i timelisten med «Legg til fravær / ferie».',
      '“Holiday plan” on the same page shows “Left to plan” and “Taken”. Single days can also be logged in the timesheet with “Add absence / holiday”.',
    ),
    show: [at('arbeid.planlagt', 0)],
    related: ['task.feriesaldo', 'task.godkjennFerie', 'task.fravaer'],
  }),
  task({
    id: 'task.feriesaldo',
    q: tx('Hvor mange feriedager har jeg igjen?', 'How many holiday days do I have left?'),
    title: tx('Se feriedager igjen', 'See holiday days left'),
    ask: tx(
      ['ferie igjen', 'feriedager igjen', 'dager igjen', 'feriesaldo', 'feriedager', 'gjenstående ferie', 'brukt ferie', 'ferie tatt ut'],
      ['holiday left', 'days left', 'holiday balance', 'remaining holiday', 'vacation days'],
    ),
    intro: tx(
      'Feriedagene dine står i «Ferieplan» under Fravær → Planlagt fravær.',
      'Your holiday days are in “Holiday plan” under Absence → Planned absence.',
    ),
    steps: [
      s(tx('Åpne Planlagt fravær', 'Open Planned absence'), 'Gå til Fravær → Planlagt fravær.', 'Go to Absence → Planned absence.', { ...gate('arbeid.planlagt', 0), go: true }),
      s(tx('Les Ferieplan', 'Read the holiday plan'),
        '«Ferieplan» viser «Sum til planlegging», «Planlagt frem i tid», «Tatt ut» og «Igjen å planlegge».',
        '“Holiday plan” shows “Total to plan”, “Planned ahead”, “Taken” and “Left to plan”.'),
    ],
    after: tx(
      'Ledere ser brukte og gjenstående feriedager for alle under Fravær → Fraværsoversikt («Tabell»).',
      'Managers see used and remaining holiday for everyone under Absence → Absence overview (“Table”).',
    ),
    show: [at('arbeid.planlagt', 0)],
    related: ['task.ferie', 'task.timesaldo'],
  }),
  task({
    id: 'task.godkjennFerie',
    q: tx('Hvordan godkjenner jeg ferie?', 'How do I approve holiday?'),
    title: tx('Godkjenne ferie', 'Approve holiday'),
    ask: tx(['godkjenne ferie', 'godkjenn ferie', 'ferie godkjenning', 'feriesøknad godkjenne'], ['approve holiday', 'approve vacation']),
    intro: tx('Ferie som er sendt til godkjenning, ligger under Fravær → Planlagt fravær.', 'Holiday sent for approval is under Absence → Planned absence.'),
    steps: [
      s(tx('Åpne Planlagt fravær', 'Open Planned absence'), 'Gå til Fravær → Planlagt fravær. «Skal godkjennes» viser periodene som venter.', 'Go to Absence → Planned absence. “To approve” lists the periods waiting.', gate('arbeid.planlagt', 2)),
      s(tx('Godkjenn', 'Approve'), 'Åpne perioden og trykk «Godkjenn» — eller sett den tilbake til behandling.', 'Open the period and tap “Approve” — or send it back for processing.', gate('arbeid.planlagt', 2)),
    ],
    show: [at('arbeid.planlagt', 2)],
    related: ['task.godkjennTimer'],
  }),
  task({
    id: 'task.timer',
    q: tx('Hvordan fører jeg timer?', 'How do I log hours?'),
    title: tx('Føre timer', 'Log hours'),
    ask: tx(
      ['føre timer', 'registrere timer', 'legge inn timer', 'skrive timer', 'timeføring', 'føre time', 'timer på prosjekt'],
      ['log hours', 'enter hours', 'register hours', 'time entry', 'timesheet'],
    ),
    avoid: tx(['flytte', 'flytter', 'slette', 'sletter', 'notat'], ['move', 'delete', 'note']),
    intro: tx('Timer føres per prosjekt og dag i timelisten.', 'Hours are logged per project and day in the timesheet.'),
    steps: [
      s(tx('Åpne timelisten', 'Open the timesheet'), 'Gå til Menyen → Timeliste (eller Timer / arbeid per ansatt → Timeliste og velg deg selv).', 'Go to Menu → Timesheet (or Hours / work per employee → Timesheet and pick yourself).', { go: true }),
      s(tx('Legg til prosjekt', 'Add the project'), 'Første gang: trykk «Legg til prosjekt» og velg prosjektet. Det blir en linje i timelisten.', 'First time: tap “Add project” and pick the project. It becomes a row in the timesheet.', gate('timeliste', 0)),
      s(tx('Trykk dagen', 'Tap the day'), 'Trykk ruten for dagen på prosjektlinjen.', 'Tap the day’s cell on the project row.', gate('timeliste', 1)),
      s(tx('Skriv timene', 'Enter the hours'),
        'Skriv timer (f.eks. 7:30) og «Beskrivelse av utført arbeid» — teksten er synlig for kunden. Velg aktivitet om prosjektet har flere. Trykk «Lagre».',
        'Enter the hours (e.g. 7:30) and “Description of work done” — the text is visible to the customer. Pick an activity if the project has several. Tap “Save”.'),
      s(tx('Lås når uka er ferdig', 'Lock when the week is done'), 'Trykk låsen over dagen. Da går timene til godkjenning hos leder.', 'Tap the lock above the day. The hours then go to your manager for approval.'),
    ],
    after: tx(
      'Tannhjulet «Flere valg» i timevinduet har «Timeart» (overtid), «Legg til utlegg», «Legg til produktsalg» og «Legg til bilgodtgjørelse».',
      'The “More options” gear in the hours window has “Hour type” (overtime), “Add expense”, “Add product sale” and “Add mileage”.',
    ),
    show: [at('timeliste', 1), at('arbeid.timeliste', 2)],
    related: ['task.overtid', 'task.las', 'task.prosjektITimeliste'],
  }),
  task({
    id: 'task.overtid',
    q: tx('Hvordan fører jeg overtid?', 'How do I log overtime?'),
    title: tx('Føre overtid', 'Log overtime'),
    ask: tx(['overtid', 'overtidstimer', 'timeart', 'reisetid', 'intern tid', '50 %', '100 %'], ['overtime', 'hour type', 'travel time']),
    intro: tx('Overtid føres som vanlige timer, med timeart «Overtid 50 %» eller «Overtid 100 %».', 'Overtime is logged as normal hours, with the hour type “Overtime 50 %” or “Overtime 100 %”.'),
    steps: [
      s(tx('Trykk dagen', 'Tap the day'), 'I timelisten trykker du ruten for dagen på prosjektlinjen.', 'In the timesheet, tap the day’s cell on the project row.', gate('timeliste', 1)),
      s(tx('Skriv timene', 'Enter the hours'), 'Skriv overtidstimene og beskrivelsen av arbeidet.', 'Enter the overtime hours and the description of the work.'),
      s(tx('Velg timeart', 'Pick the hour type'),
        'Trykk tannhjulet «Flere valg» → «Timeart», og velg «Overtid 50 %» eller «Overtid 100 %». Har du både vanlige timer og overtid samme dag, trykk «+ Legg til flere timer på prosjektet» for en ekstra linje.',
        'Tap the “More options” gear → “Hour type”, and pick “Overtime 50 %” or “Overtime 100 %”. With both normal hours and overtime the same day, tap “+ Add more hours to the project” for an extra line.'),
      s(tx('Lagre', 'Save'), 'Trykk «Lagre».', 'Tap “Save”.'),
    ],
    after: tx('Mertid og saldo per måned ser du under Timer / arbeid per ansatt → Timesaldo.', 'Extra time and balance per month are under Hours / work per employee → Hour balance.'),
    show: [at('timeliste', 1), at('arbeid.timeliste', 2)],
    related: ['task.timesaldo', 'task.timer'],
  }),
  task({
    id: 'task.las',
    q: tx('Hvordan sender jeg timene til godkjenning?', 'How do I send my hours for approval?'),
    title: tx('Låse timelisten (sende til godkjenning)', 'Lock the timesheet (send for approval)'),
    ask: tx(
      ['låse timer', 'låse timene', 'låse timelisten', 'låse uka', 'låse dagen', 'sende timer', 'sende timene', 'levere timer', 'levere timene', 'timer til godkjenning', 'timene til godkjenning'],
      ['lock hours', 'lock the timesheet', 'submit hours', 'send hours for approval'],
    ),
    // «låse opp» er en annen oppgave.
    avoid: tx(['opp'], ['unlock']),
    intro: tx('Du sender timene til godkjenning ved å låse timelisten frem til en dag.', 'You send your hours for approval by locking the timesheet up to a day.'),
    steps: [
      s(tx('Sjekk timene', 'Check the hours'), 'Se over at timer og fravær stemmer for perioden.', 'Check that hours and absence are right for the period.'),
      s(tx('Trykk låsen', 'Tap the lock'),
        'Trykk låsen over den siste dagen som er ferdig («Lås timer til …»). Alt frem til og med den dagen låses.',
        'Tap the lock above the last finished day (“Lock hours until …”). Everything up to and including that day is locked.', gate('timeliste', 3)),
      s(tx('Til godkjenning', 'For approval'), 'Låste timer kan ikke endres, og vises for leder under Timer / arbeid per ansatt → Godkjenninger.', 'Locked hours cannot be changed, and appear for the manager under Hours / work per employee → Approvals.'),
    ],
    show: [at('timeliste', 3), at('arbeid.timeliste', 4)],
    related: ['task.lasOpp', 'task.godkjennTimer'],
  }),
  task({
    id: 'task.lasOpp',
    q: tx('Hvordan endrer jeg timer som er låst?', 'How do I change locked hours?'),
    title: tx('Endre låste timer (låse opp)', 'Change locked hours (unlock)'),
    ask: tx(
      ['låse opp', 'låst opp', 'låse opp timelisten', 'låse opp timene', 'låse opp timer', 'endre låste', 'endre timene', 'endre timer', 'rette timer', 'rette timene', 'får ikke endret', 'kan ikke endre', 'dagen er låst', 'låst timeliste', 'feil timer'],
      ['unlock', 'change locked', 'edit hours', 'fix hours', 'cannot change', 'day is locked'],
    ),
    intro: tx(
      'Står det «Dagen er låst» eller «Låst — klar for fakturering», må timelisten låses opp før du kan endre.',
      'If it says “The day is locked” or “Locked — ready for invoicing”, the timesheet must be unlocked before you can change it.',
    ),
    steps: [
      s(tx('Trykk låsen igjen', 'Tap the lock again'),
        'Trykk låsen på dagen det er låst til («Lås opp timeliste»). Da kan dagene endres igjen.',
        'Tap the lock on the day it is locked to (“Unlock timesheet”). The days can then be changed again.', gate('timeliste', 3)),
      s(tx('Rett og lås på nytt', 'Fix and lock again'), 'Rett timene, trykk «Lagre» og lås dagen igjen.', 'Fix the hours, tap “Save” and lock the day again.'),
      s(tx('Leder låser opp for andre', 'Managers unlock for others'),
        'Leder går til Timer / arbeid per ansatt → Timeliste, velger personen og trykker låsen på dagen.',
        'A manager goes to Hours / work per employee → Timesheet, picks the person and taps the lock on the day.', gate('arbeid.timeliste', 4)),
    ],
    after: tx('Er timene allerede godkjent eller fakturert, be lederen din om å rette dem.', 'If the hours are already approved or invoiced, ask your manager to fix them.'),
    show: [at('timeliste', 3), at('arbeid.timeliste', 4)],
    related: ['task.las', 'task.godkjennTimer'],
  }),
  task({
    id: 'task.godkjennTimer',
    q: tx('Hvordan godkjenner jeg timer?', 'How do I approve hours?'),
    title: tx('Godkjenne timer', 'Approve hours'),
    ask: tx(['godkjenne timer', 'godkjenne timene', 'godkjenn timer', 'attestere timer', 'kontrollere timer', 'godkjenning timer'], ['approve hours', 'approve timesheet', 'review hours']),
    intro: tx('Låste timelister kontrolleres og godkjennes under Timer / arbeid per ansatt → Godkjenninger.', 'Locked timesheets are reviewed and approved under Hours / work per employee → Approvals.'),
    steps: [
      s(tx('Åpne Godkjenninger', 'Open Approvals'), 'Gå til Timer / arbeid per ansatt → Godkjenninger. «Låst til kontroll» viser hvem som har låst timelisten.', 'Go to Hours / work per employee → Approvals. “Locked for review” shows who has locked their timesheet.', gate('arbeid.godkjenning', 0)),
      s(tx('Kontroller', 'Review'), 'Trykk «Kontroller» på personen. Rett teksten om nødvendig — «Bruk forslag» tar AI-forslaget, «Lagre tekst» lagrer.', 'Tap “Review” on the person. Fix the text if needed — “Use suggestion” takes the AI suggestion, “Save text” stores it.', gate('arbeid.godkjenning', 1)),
      s(tx('Godkjenn', 'Approve'), 'Trykk «Godkjenn». Timene er da klare under Økonomi → Til fakturering.', 'Tap “Approve”. The hours are then ready under Finance → To invoice.', gate('arbeid.godkjenning', 2)),
    ],
    show: [at('arbeid.godkjenning', 1)],
    related: ['task.faktura', 'task.lasOpp'],
  }),
  task({
    id: 'task.prosjektITimeliste',
    q: tx('Hvorfor finner jeg ikke prosjektet i timelisten?', 'Why can’t I find the project in my timesheet?'),
    title: tx('Legge til prosjekt i timelisten', 'Add a project to the timesheet'),
    ask: tx(
      ['finner ikke prosjektet', 'finner ikke prosjekt', 'mangler prosjekt', 'prosjektet mangler', 'prosjekt i timelisten', 'legge til prosjekt', 'prosjektet vises ikke', 'ser ikke prosjektet'],
      ['can’t find the project', 'missing project', 'add project to timesheet', 'project not showing'],
    ),
    intro: tx(
      '«Legg til prosjekt» viser bare prosjekter du er med i. Mangler prosjektet, må en leder legge deg inn i prosjektets team.',
      '“Add project” only lists projects you are part of. If the project is missing, a manager must add you to the project team.',
    ),
    steps: [
      s(tx('Legg til prosjekt', 'Add project'), 'Trykk «Legg til prosjekt» nederst i timelisten og trykk prosjektet i listen.', 'Tap “Add project” at the bottom of the timesheet and tap the project in the list.', gate('timeliste', 0)),
      s(tx('Står det ikke der?', 'Not in the list?'),
        'Be prosjektleder eller leder legge deg inn: Prosjekt → åpne prosjektet → «Team» → «+ Legg til medlem».',
        'Ask the project manager or a manager to add you: Projects → open the project → “Team” → “+ Add member”.', gate('projects', 3)),
    ],
    show: [at('timeliste', 0), at('arbeid.timeliste', 1)],
    related: ['task.teamProsjekt', 'task.timer'],
  }),
  task({
    id: 'task.utlegg',
    q: tx('Hvordan registrerer jeg et utlegg?', 'How do I register an expense?'),
    title: tx('Registrere utlegg', 'Register an expense'),
    ask: tx(['utlegg', 'kvittering', 'refusjon', 'reiseregning', 'parkering', 'bompenger', 'materiell kjøpt'], ['expense', 'receipt', 'refund', 'reimbursement']),
    intro: tx('Utlegg på et prosjekt fører du rett fra timelisten, på dagen og prosjektet det gjelder.', 'Expenses on a project are logged straight from the timesheet, on the day and project they belong to.'),
    steps: [
      s(tx('Trykk dagen', 'Tap the day'), 'I timelisten trykker du ruten for dagen på prosjektlinjen.', 'In the timesheet, tap the day’s cell on the project row.', gate('timeliste', 1)),
      s(tx('Legg til utlegg', 'Add expense'), 'Trykk tannhjulet «Flere valg» → «Legg til utlegg».', 'Tap the “More options” gear → “Add expense”.'),
      s(tx('Fyll ut', 'Fill in'), 'Skriv beskrivelse og «Beløp inkl. mva», og velg kategori (f.eks. Materiell / innsats eller Verktøy / utstyr). Trykk «Lagre».', 'Enter a description and “Amount incl. VAT”, and pick a category (e.g. Materials or Tools / equipment). Tap “Save”.'),
    ],
    after: tx(
      'Med kvittering og påslag registreres utlegg under Økonomi → Utlegg («Nytt utlegg» → «Lagre utlegg»).',
      'With receipt and markup, expenses are registered under Finance → Expenses (“New expense” → “Save expense”).',
    ),
    show: [at('timeliste', 1), at('arbeid.timeliste', 2)],
    related: ['task.kjoring', 'task.produktsalg'],
  }),
  task({
    id: 'task.kjoring',
    q: tx('Hvordan registrerer jeg kjøring?', 'How do I log a trip?'),
    title: tx('Registrere kjøring', 'Log a trip'),
    ask: tx(['kjøring', 'kjøretur', 'kjørebok', 'kilometer', 'km', 'bilgodtgjørelse', 'kjøregodtgjørelse', 'kjørt', 'egen bil', 'firmabil'], ['trip', 'mileage', 'kilometres', 'car allowance', 'driving']),
    // Kilometerstand på firmabilen hører til Utstyr.
    avoid: tx(['kilometerstand', 'tell'], ['odometer']),
    intro: tx('Kjøreturer registreres i Kjørebok, som finner rute, kilometer og bompasseringer for deg.', 'Trips are logged in the Mileage log, which finds the route, kilometres and tolls for you.'),
    steps: [
      s(tx('Åpne Kjørebok', 'Open the mileage log'), 'Gå til Produkter og driftsressurser → Kjørebok.', 'Go to Products and resources → Mileage log.', { ...gate('okonomi.kjorebok', 0), go: true }),
      s(tx('Registrer kjøretur', 'Register trip'), 'Trykk «Registrer kjøretur» og velg kjøretøy — firmabil eller egen bil.', 'Tap “Register trip” and pick the vehicle — company car or your own.', gate('okonomi.kjorebok', 0)),
      s(tx('Rute og prosjekt', 'Route and project'),
        'Velg prosjekt — «Til» blir prosjektadressen. «Bruk firmaadressen» eller «Bruk hvor jeg er nå» setter «Fra». Kilometer og bom fylles ut.',
        'Pick the project — “To” becomes the project address. “Use company address” or “Use where I am” sets “From”. Kilometres and tolls fill in.', gate('okonomi.kjorebok', 1)),
      s(tx('Kostnader og lagre', 'Costs and save'), 'På steget «Rute»: «Legg til kostnad» for ferje eller parkering, «Legg ved bilag» for kvittering. Gå videre og lagre turen.', 'On the “Route” step: “Add cost” for ferries or parking, “Attach receipt” for the receipt. Continue and save the trip.', gate('okonomi.kjorebok', 2)),
    ],
    after: tx(
      'Kort tur rett i timelisten: trykk dagen på prosjektet → tannhjulet «Flere valg» → «Legg til bilgodtgjørelse» (Fra, Til, Kilometer).',
      'Short trip straight in the timesheet: tap the day on the project → the “More options” gear → “Add mileage” (From, To, Kilometres).',
    ),
    show: [at('okonomi.kjorebok', 0)],
    related: ['task.utlegg'],
  }),
  task({
    id: 'task.produktsalg',
    q: tx('Hvordan registrerer jeg produktsalg?', 'How do I register a product sale?'),
    title: tx('Registrere produktsalg', 'Register a product sale'),
    ask: tx(['produktsalg', 'selge produkt', 'solgt produkt', 'varesalg', 'registrere salg', 'salg av vare'], ['product sale', 'sell product', 'register sale']),
    intro: tx('Produktsalg på et prosjekt fører du fra timelisten, så det kommer med under Til fakturering.', 'Product sales on a project are logged from the timesheet, so they are included under To invoice.'),
    steps: [
      s(tx('Trykk dagen', 'Tap the day'), 'I timelisten trykker du ruten for dagen på prosjektlinjen.', 'In the timesheet, tap the day’s cell on the project row.', gate('timeliste', 1)),
      s(tx('Legg til produktsalg', 'Add product sale'), 'Trykk tannhjulet «Flere valg» → «Legg til produktsalg».', 'Tap the “More options” gear → “Add product sale”.'),
      s(tx('Fyll ut', 'Fill in'), 'Skriv produkt og «Pris eks. mva», og trykk «Lagre».', 'Enter the product and “Price excl. VAT”, and tap “Save”.'),
    ],
    after: tx('Alt salg ligger under Produkt → Produktsalg, med filter på Utkast, Klar og Fakturert.', 'All sales are under Product → Product sales, filtered on Draft, Ready and Invoiced.'),
    show: [at('timeliste', 1), at('arbeid.timeliste', 2)],
    related: ['task.utlegg', 'task.faktura'],
  }),
  task({
    id: 'task.timesaldo',
    q: tx('Hvor ser jeg timesaldoen min?', 'Where do I see my hour balance?'),
    title: tx('Se timesaldo og avspasering', 'See hour balance and time off'),
    ask: tx(['timesaldo', 'timebank', 'saldo', 'mertid', 'fleksitid', 'fleks', 'avspasering igjen', 'timer til gode', 'plusstimer'], ['hour balance', 'hour bank', 'flexitime', 'extra time', 'balance']),
    intro: tx('Saldoen står under Timer / arbeid per ansatt → Timesaldo: avtalt mot faktisk tid, mertid og saldo per måned.', 'The balance is under Hours / work per employee → Hour balance: agreed versus actual time, extra time and balance per month.'),
    steps: [
      s(tx('Åpne Timesaldo', 'Open Hour balance'), 'Gå til Timer / arbeid per ansatt → Timesaldo og trykk personen.', 'Go to Hours / work per employee → Hour balance and tap the person.', gate('arbeid.timesaldo', 0)),
      s(tx('Les saldoen', 'Read the balance'), 'Fleks-kolonnen viser mertid, og siste kolonne viser saldoen i timebanken. «Sluttdato» styrer hvor langt den regnes.', 'The flex column shows extra time, and the last column the hour bank balance. “End date” sets how far it is counted.', gate('arbeid.timesaldo', 1)),
    ],
    after: tx('Avspasering tar du ut ved å føre fraværstypen «Avspasering» i timelisten.', 'Take time off by logging the absence type “Time off” in the timesheet.'),
    show: [at('arbeid.timesaldo', 0)],
    related: ['task.fravaer', 'task.overtid'],
  }),
  task({
    id: 'task.eksportTimer',
    q: tx('Hvordan eksporterer jeg timer til lønn?', 'How do I export hours for payroll?'),
    title: tx('Eksportere timer', 'Export hours'),
    ask: tx(['eksportere timer', 'eksporter timer', 'timer til lønn', 'timer til regnskap', 'skrive ut timer', 'timeliste csv', 'lønnsgrunnlag'], ['export hours', 'hours to payroll', 'print hours']),
    intro: tx('Timene eksporteres fra timelisten under Timer / arbeid per ansatt.', 'Hours are exported from the timesheet under Hours / work per employee.'),
    steps: [
      s(tx('Åpne timelisten', 'Open the timesheet'), 'Gå til Timer / arbeid per ansatt → Timeliste og velg medarbeider og måned.', 'Go to Hours / work per employee → Timesheet and pick the employee and month.', gate('arbeid.timeliste', 0)),
      s(tx('Rapport og eksport', 'Report and export'), 'Trykk tannhjulet «Rapport og eksport». «Eksporter CSV» gir fil til lønn, «Skriv ut utvalg» gir utskrift.', 'Tap the “Report and export” gear. “Export CSV” gives a file for payroll, “Print selection” a printout.', gate('arbeid.timeliste', 5)),
    ],
    after: tx('Alle timer for en periode, på tvers av ansatte, finner du under Timer / arbeid per ansatt → Timerapport.', 'All hours for a period, across employees, are under Hours / work per employee → Hour report.'),
    show: [at('arbeid.timeliste', 5)],
    related: ['task.godkjennTimer'],
  }),

  task({
    id: 'task.flyttTimer',
    q: tx('Hvordan flytter jeg timer til en annen dag eller et annet prosjekt?', 'How do I move hours to another day or project?'),
    title: tx('Flytte timer', 'Move hours'),
    ask: tx(['flytte timer', 'flytte timene', 'flytter timer', 'flytte til annen dag', 'feil dag', 'feil prosjekt', 'timer på feil'], ['move hours', 'wrong day', 'wrong project']),
    intro: tx('Timer på feil dag eller prosjekt flyttes fra timevinduet.', 'Hours on the wrong day or project are moved from the hours window.'),
    steps: [
      s(tx('Åpne føringen', 'Open the entry'), 'I timelisten trykker du dagen med timene som skal flyttes.', 'In the timesheet, tap the day with the hours to move.', gate('timeliste', 1)),
      s(tx('Flytt', 'Move'), 'Trykk tannhjulet «Flere valg» → «Flytt til annen dag/prosjekt».', 'Tap the “More options” gear → “Move to another day/project”.'),
      s(tx('Velg nytt sted', 'Pick the new place'), 'Skriv ny dato (ÅÅÅÅ-MM-DD) og trykk prosjektet. Trykk «Flytt».', 'Enter the new date (YYYY-MM-DD) and tap the project. Tap “Move”.'),
    ],
    after: tx('Låste dager kan ikke endres — lås opp først.', 'Locked days can’t be changed — unlock first.'),
    show: [at('timeliste', 1), at('arbeid.timeliste', 2)],
    related: ['task.lasOpp', 'task.slettTimer'],
  }),
  task({
    id: 'task.slettTimer',
    q: tx('Hvordan sletter jeg timer?', 'How do I delete hours?'),
    title: tx('Slette timer', 'Delete hours'),
    ask: tx(['slette timer', 'slette timene', 'sletter timer', 'slette føring', 'fjerne timer', 'slette time'], ['delete hours', 'remove hours', 'delete entry']),
    intro: tx('Timer slettes fra timevinduet på dagen.', 'Hours are deleted from the hours window on the day.'),
    steps: [
      s(tx('Åpne føringen', 'Open the entry'), 'I timelisten trykker du dagen med timene.', 'In the timesheet, tap the day with the hours.', gate('timeliste', 1)),
      s(tx('Slett', 'Delete'), 'Trykk «Slett» øverst i vinduet.', 'Tap “Delete” at the top of the window.'),
    ],
    after: tx('Er dagen låst, må den låses opp først. Fravær fjerner du ved å sette timene til 0 og trykke «Lagre».', 'If the day is locked, unlock it first. Remove absence by setting the hours to 0 and tapping “Save”.'),
    show: [at('timeliste', 1), at('arbeid.timeliste', 2)],
    related: ['task.lasOpp', 'task.flyttTimer'],
  }),
  task({
    id: 'task.internNotat',
    q: tx('Hvordan skriver jeg et internt notat på timene?', 'How do I add an internal note to hours?'),
    title: tx('Internt notat på timene', 'Internal note on hours'),
    ask: tx(['internt notat', 'intern kommentar', 'notat på timene', 'notat på timer', 'kommentar på timene', 'skjult for kunde', 'ikke synlig for kunde'], ['internal note', 'hidden from customer']),
    intro: tx('«Beskrivelse av utført arbeid» er synlig for kunden. Det interne notatet ser bare dere.', '“Description of work done” is visible to the customer. The internal note is only visible to you.'),
    steps: [
      s(tx('Åpne føringen', 'Open the entry'), 'I timelisten trykker du dagen på prosjektlinjen.', 'In the timesheet, tap the day on the project row.', gate('timeliste', 1)),
      s(tx('Vis internt notat', 'Show internal note'), 'Trykk tannhjulet «Flere valg» → «Vis internt notat».', 'Tap the “More options” gear → “Show internal note”.'),
      s(tx('Skriv og lagre', 'Write and save'), 'Skriv i feltet «Internt notat — kun synlig internt» og trykk «Lagre».', 'Write in the “Internal note — only visible internally” field and tap “Save”.'),
    ],
    show: [at('timeliste', 1), at('arbeid.timeliste', 2)],
    related: ['task.timer'],
  }),

  /* ───────────── Prosjekt, kunde og avtale ───────────── */
  task({
    id: 'task.timepris',
    q: tx('Hvordan setter jeg timepris på et prosjekt?', 'How do I set the hourly rate on a project?'),
    title: tx('Sette timepris og prismodell', 'Set the hourly rate and pricing'),
    ask: tx(['timepris', 'timeprisen', 'prismodell', 'fastpris', 'faktureringsvalg', 'pris per time', 'mangler timepris'], ['hourly rate', 'pricing model', 'fixed price', 'billing options']),
    intro: tx('Timepris og prismodell settes på prosjektet, under «Faktureringsvalg».', 'Hourly rate and pricing are set on the project, under “Billing options”.'),
    steps: [
      s(tx('Åpne prosjektet', 'Open the project'), 'Gå til Prosjekt og trykk prosjektet.', 'Go to Projects and tap the project.', gate('projects', 2)),
      s(tx('Faktureringsvalg', 'Billing options'), 'Trykk fanen «Faktureringsvalg». Velg prismodell (timepris, fastpris …) og sett timeprisen. Lagre.', 'Tap the “Billing options” tab. Pick the pricing (hourly, fixed …) and set the rate. Save.', gate('projects', 1)),
    ],
    after: tx('Selskapets standardsatser og påslag ligger under Økonomi → Innstillinger, og prosjektet arver dem.', 'The company’s default rates and markups are under Finance → Settings, and the project inherits them.'),
    show: [at('projects', 2)],
    related: ['task.faktura'],
  }),
  task({
    id: 'task.nyttProsjekt',
    q: tx('Hvordan oppretter jeg et nytt prosjekt?', 'How do I create a new project?'),
    title: tx('Opprette prosjekt', 'Create a project'),
    ask: tx(['nytt prosjekt', 'opprette prosjekt', 'lage prosjekt', 'starte prosjekt', 'registrere prosjekt'], ['new project', 'create project', 'add project']),
    intro: tx('Prosjekter opprettes under Kunder og oppdrag → Prosjekt.', 'Projects are created under Customers and assignments → Projects.'),
    steps: [
      s(tx('Nytt prosjekt', 'New project'), 'Trykk «Nytt prosjekt».', 'Tap “New project”.', gate('projects', 0)),
      s(tx('Fyll ut', 'Fill in'), 'Fyll inn prosjektnummer, navn, kunde, prismodell (timepris, fastpris …) og prosjektleder. Velg rammeavtale eller last opp avtaledokument om det finnes.', 'Fill in project number, name, customer, pricing (hourly, fixed …) and project manager. Pick a framework agreement or upload the agreement if there is one.', gate('projects', 1)),
      s(tx('Opprett', 'Create'), 'Trykk «Opprett prosjekt».', 'Tap “Create project”.', gate('projects', 0)),
      s(tx('Legg til teamet', 'Add the team'), 'Åpne prosjektet → «Team» → «+ Legg til medlem», så kan de føre timer på det.', 'Open the project → “Team” → “+ Add member”, so they can log hours on it.', gate('projects', 3)),
    ],
    show: [at('projects', 0)],
    related: ['task.teamProsjekt', 'task.nyAvtale'],
  }),
  task({
    id: 'task.teamProsjekt',
    q: tx('Hvordan legger jeg til en ansatt på prosjektet?', 'How do I add an employee to a project?'),
    title: tx('Legge ansatte til på prosjekt', 'Add employees to a project'),
    ask: tx(['ansatt på prosjekt', 'ansatte på prosjekt', 'legge til medlem', 'team prosjekt', 'prosjekt team', 'medlem prosjekt', 'deltaker prosjekt', 'legge inn på prosjekt'], ['add member', 'project team', 'add employee to project']),
    intro: tx('Den som er med i prosjektets team, kan føre timer på det.', 'Everyone in the project team can log hours on it.'),
    steps: [
      s(tx('Åpne prosjektet', 'Open the project'), 'Gå til Prosjekt og trykk prosjektet.', 'Go to Projects and tap the project.', gate('projects', 2)),
      s(tx('Team', 'Team'), 'Trykk fanen «Team» og «+ Legg til medlem». Velg personen og lagre.', 'Tap the “Team” tab and “+ Add member”. Pick the person and save.', gate('projects', 3)),
    ],
    after: tx('Personen finner da prosjektet under «Legg til prosjekt» i timelisten.', 'The person then finds the project under “Add project” in the timesheet.'),
    show: [at('projects', 3)],
    related: ['task.prosjektITimeliste'],
  }),
  task({
    id: 'task.nyKunde',
    q: tx('Hvordan legger jeg til en ny kunde?', 'How do I add a new customer?'),
    title: tx('Registrere kunde', 'Register a customer'),
    ask: tx(['ny kunde', 'registrere kunde', 'legge til kunde', 'opprette kunde', 'lage kunde', 'privatkunde'], ['new customer', 'add customer', 'create customer']),
    intro: tx('Kunder registreres under Kunder og oppdrag → Kunder. Bedrifter hentes fra Brønnøysund.', 'Customers are registered under Customers and assignments → Customers. Businesses are fetched from the Brønnøysund register.'),
    steps: [
      s(tx('Ny kunde', 'New customer'), 'Trykk «Ny kunde» → «Registrer kunde».', 'Tap “New customer” → “Register customer”.', gate('kunder', 0)),
      s(tx('Virksomhet eller privat', 'Business or private'), 'Velg Virksomhet og skriv org.nr (ni siffer) eller navn — feltene fylles fra Brønnøysund. Velg Privatkunde for personer.', 'Choose Business and enter the org. no. (nine digits) or name — the fields fill from Brønnøysund. Choose Private customer for people.', gate('kunder', 0)),
      s(tx('Lagre', 'Save'), 'Velg «Ansvarlig for kunden» og trykk «Lagre kunde».', 'Pick “Responsible for the customer” and tap “Save customer”.', gate('kunder', 1)),
    ],
    after: tx('Står kunden med «Må rettes før fakturering», mangler noe for faktura — åpne kunden og fyll ut.', 'If the customer says “Must be fixed before invoicing”, something is missing for invoicing — open the customer and fill it in.'),
    show: [at('kunder', 0)],
    related: ['task.nyAvtale', 'task.nyttProsjekt'],
  }),
  task({
    id: 'task.nyAvtale',
    q: tx('Hvordan registrerer jeg en avtale med kunden?', 'How do I register an agreement with the customer?'),
    title: tx('Registrere avtale / kontrakt', 'Register an agreement / contract'),
    ask: tx(['ny avtale', 'ny kontrakt', 'registrere avtale', 'registrere kontrakt', 'rammeavtale', 'opprette avtale', 'avtale med kunde', 'avtale med kunden', 'kontrakt med kunde'], ['new agreement', 'new contract', 'register contract', 'register agreement', 'agreement with customer', 'framework agreement']),
    intro: tx('Avtaler registreres under Kunder og oppdrag → Kontrakt / avtale. Veiviseren tar deg gjennom resten.', 'Agreements are registered under Customers and assignments → Contract / agreement. The wizard takes you through the rest.'),
    steps: [
      s(tx('Ny avtale', 'New agreement'), 'Trykk «Ny avtale».', 'Tap “New agreement”.', gate('kontrakt', 0)),
      s(tx('Inngått eller utkast', 'Signed or draft'), '«Registrer inngått» når avtalen er signert — last opp dokumentene, så fyller AI ut feltene. «Registrering nytt utkast» lager en ny avtale.', '“Register signed” when the agreement is signed — upload the documents and AI fills in the fields. “Register new draft” creates a new agreement.', gate('kontrakt', 1)),
      s(tx('Type, kunde og mal', 'Type, customer and template'), 'For utkast: velg avtaletype (enkeltoppdrag, rammeavtale eller avrop), kunde og avtalemal.', 'For a draft: pick the agreement type (single assignment, framework or call-off), customer and template.', gate('kontrakt', 2)),
      s(tx('Prosjekt med en gang', 'Project straight away'), 'Huk av «Opprett også prosjekt» og trykk «Fortsett til utkast».', 'Tick “Also create project” and tap “Continue to draft”.', gate('kontrakt', 3)),
    ],
    show: [at('kontrakt', 0)],
    related: ['task.nyttProsjekt', 'task.nyKunde'],
  }),

  /* ───────────── Økonomi ───────────── */
  task({
    id: 'task.faktura',
    q: tx('Hvordan lager jeg en faktura?', 'How do I create an invoice?'),
    title: tx('Lage faktura', 'Create an invoice'),
    ask: tx(['lage faktura', 'lage en faktura', 'ny faktura', 'opprette faktura', 'fakturere', 'fakturere timer', 'fakturere kunden', 'fakturagrunnlag', 'sende regning'], ['create invoice', 'new invoice', 'invoice the customer', 'bill the customer', 'invoice basis']),
    intro: tx('En faktura lages fra timer, utlegg, kjøring og produktsalg under Til fakturering, og får nummer når den ferdigstilles.', 'An invoice is created from hours, expenses, mileage and product sales under To invoice, and gets its number when it is finalized.'),
    steps: [
      s(tx('Godkjenn timene', 'Approve the hours'), 'Timene må være godkjent under Timer / arbeid per ansatt → Godkjenninger.', 'The hours must be approved under Hours / work per employee → Approvals.', gate('arbeid.godkjenning', 2)),
      s(tx('Til fakturering', 'To invoice'), 'Gå til Økonomi → Til fakturering og velg periode. Åpne prosjektet for å se linjene.', 'Go to Finance → To invoice and pick the period. Open the project to see the lines.', gate('okonomi.fakturagrunnlag', 0)),
      s(tx('Lag utkast', 'Create draft'), 'Kryss av prosjektet og trykk «Lag fakturautkast av utvalg». Mangler timepris, sett den under prosjektets Faktureringsvalg.', 'Tick the project and tap “Create invoice drafts”. If the hourly rate is missing, set it under the project’s Billing options.', gate('okonomi.fakturagrunnlag', 1)),
      s(tx('Ferdigstill og send', 'Finalize and send'), '«Gå til fakturautkast» → kontroller → «Ferdigstill og send».', '“Go to invoice draft” → check → “Finalize and send”.', gate('okonomi.fakturagrunnlag', 2)),
    ],
    show: [at('okonomi.fakturagrunnlag', 1)],
    related: ['task.sendFaktura', 'task.betaling', 'task.godkjennTimer'],
  }),
  task({
    id: 'task.sendFaktura',
    q: tx('Hvordan sender jeg en faktura?', 'How do I send an invoice?'),
    title: tx('Sende faktura (EHF, e-post, PDF)', 'Send an invoice (EHF, email, PDF)'),
    ask: tx(['sende faktura', 'sende fakturaen', 'send faktura', 'ehf', 'peppol', 'faktura pdf', 'faktura på e-post'], ['send invoice', 'ehf', 'peppol', 'invoice pdf']),
    intro: tx('Fakturaer sendes fra Økonomi → Faktura.', 'Invoices are sent from Finance → Invoices.'),
    steps: [
      s(tx('Finn fakturaen', 'Find the invoice'), 'Søk på fakturanummer, kunde, prosjekt eller KID, og åpne fakturaen.', 'Search by invoice number, customer, project or KID, and open the invoice.', gate('okonomi.faktura', 0)),
      s(tx('Ferdigstill og send', 'Finalize and send'), 'Trykk «Ferdigstill og send» og velg EHF, e-post eller «Send selv». En ferdigstilt faktura sendes igjen med «Send på nytt».', 'Tap “Finalize and send” and choose EHF, email or “Send yourself”. An issued invoice is resent with “Send again”.', gate('okonomi.faktura', 1)),
      s(tx('PDF og EHF', 'PDF and EHF'), '«Last ned» gir PDF, timespesifikasjon og EHF-filen (Peppol BIS 3.0).', '“Download” gives the PDF, time specification and the EHF file (Peppol BIS 3.0).', gate('okonomi.faktura', 2)),
    ],
    show: [at('okonomi.faktura', 1)],
    related: ['task.betaling', 'task.faktura'],
  }),
  task({
    id: 'task.betaling',
    q: tx('Hvordan registrerer jeg at en faktura er betalt?', 'How do I record that an invoice is paid?'),
    title: tx('Registrere betaling', 'Record a payment'),
    ask: tx(['registrere betaling', 'faktura betalt', 'fakturaen er betalt', 'innbetaling', 'utestående', 'betalt faktura', 'registrere innbetaling'], ['record payment', 'invoice paid', 'payment received', 'outstanding']),
    intro: tx('Betaling registreres på fakturaen under Økonomi → Faktura.', 'Payment is recorded on the invoice under Finance → Invoices.'),
    steps: [
      s(tx('Åpne fakturaen', 'Open the invoice'), 'Søk opp fakturaen og åpne den.', 'Search for the invoice and open it.', gate('okonomi.faktura', 0)),
      s(tx('Registrer betaling', 'Record payment'), 'Trykk «Registrer betaling», eller betalingsikonet på raden i listen. Skriv dato og beløp. Utestående oppdateres.', 'Tap “Record payment”, or the payment icon on the row in the list. Enter date and amount. Outstanding updates.', gate('okonomi.faktura', 3)),
    ],
    show: [at('okonomi.faktura', 3)],
    related: ['task.sendFaktura'],
  }),

  /* ───────────── Ansatte og tilgang ───────────── */
  task({
    id: 'task.nyAnsatt',
    q: tx('Hvordan legger jeg til en ny ansatt?', 'How do I add a new employee?'),
    title: tx('Registrere ny ansatt', 'Register a new employee'),
    ask: tx(['ny ansatt', 'ny medarbeider', 'registrere ansatt', 'legge til ansatt', 'opprette ansatt', 'nyansatt', 'ansette'], ['new employee', 'add employee', 'register employee', 'new hire']),
    intro: tx('Ansatte registreres under Ansatte og arbeidstid → Ansatte og eksterne.', 'Employees are registered under Employees and working hours → Employees and externals.'),
    steps: [
      s(tx('Ny ansatt', 'New employee'), 'Trykk «Ny ansatt» → «Registrer medarbeider».', 'Tap “New employee” → “Register employee”.', gate('ansatte', 0)),
      s(tx('Fyll ut', 'Fill in'), 'Fyll inn fornavn, etternavn, e-post, mobil, ansatt siden og avdeling, og velg tilgangsnivå.', 'Fill in first and last name, email, mobile, start date and department, and pick the access level.', gate('ansatte', 0)),
      s(tx('Send invitasjon', 'Send the invitation'), 'Huk av «Send velkomstmal», så får personen e-post med lenke til å sette passord. Lagre.', 'Tick “Send welcome template” so the person gets an email with a link to set a password. Save.', gate('ansatte', 1)),
    ],
    after: tx('Husk å legge personen inn i teamet på prosjektene de skal føre timer på.', 'Remember to add the person to the team on the projects they will log hours on.'),
    show: [at('ansatte', 0)],
    related: ['task.inviter', 'task.tilgang', 'task.teamProsjekt'],
  }),
  task({
    id: 'task.inviter',
    q: tx('Hvordan inviterer jeg en bruker?', 'How do I invite a user?'),
    title: tx('Invitere brukere til ProTop', 'Invite users to ProTop'),
    ask: tx(['invitere', 'invitasjon', 'inviter brukere', 'invitere bruker', 'invitere ansatt', 'velkomstmal', 'gi innlogging', 'sende innlogging'], ['invite', 'invitation', 'invite users', 'welcome email']),
    intro: tx('Ansatte får innlogging via en invitasjon på e-post.', 'Employees get a login through an email invitation.'),
    steps: [
      s(tx('Inviter brukere', 'Invite users'), 'Gå til Ansatte → «Ny ansatt» → «Inviter brukere», og velg dem som skal få invitasjon.', 'Go to Employees → “New employee” → “Invite users”, and pick who should be invited.', gate('ansatte', 1)),
      s(tx('Eller én person', 'Or one person'), 'Åpne personen, sjekk e-posten og huk av «Send velkomstmal».', 'Open the person, check the email and tick “Send welcome template”.', gate('ansatte', 1)),
    ],
    after: tx('Personen får e-post med lenke til å sette passord. Kommer den ikke, sjekk søppelpost og at e-postadressen er riktig.', 'The person gets an email with a link to set a password. If it doesn’t arrive, check spam and that the address is right.'),
    show: [at('ansatte', 1)],
    related: ['task.tilgang', 'task.nyAnsatt'],
  }),
  task({
    id: 'task.tilgang',
    q: tx('Hvordan gir jeg en ansatt mer tilgang?', 'How do I give an employee more access?'),
    title: tx('Endre tilgang for en ansatt', 'Change an employee’s access'),
    ask: tx(['gi tilgang', 'gir tilgang', 'ansatt tilgang', 'endre tilgang', 'mer tilgang', 'tilgangsnivå', 'endre nivå', 'rettigheter', 'gi rettigheter', 'gjøre til admin', 'administrator rettigheter', 'tilgangsstyring'], ['give access', 'change access', 'access level', 'permissions', 'make admin']),
    intro: tx('Tilgang styres under Bedriftsinnstillinger → Tilgangsstyring. Hver ansatt plasseres i et nivå.', 'Access is managed under Company settings → Access control. Each employee is placed in a level.'),
    steps: [
      s(tx('Åpne Tilgangsstyring', 'Open Access control'), 'Gå til Bedriftsinnstillinger → Tilgangsstyring.', 'Go to Company settings → Access control.', { ...gate('selskap.tilgang', 1), go: true }),
      s(tx('Flytt personen', 'Move the person'), 'Under «Personer» drar du den ansatte til riktig nivå (f.eks. Avdelingsleder eller Administrator).', 'Under “People”, drag the employee to the right level (e.g. Department manager or Administrator).', gate('selskap.tilgang', 1)),
      s(tx('Eller unntak', 'Or an exception'), 'Trenger bare én person mer på ett område: åpne personen og bruk «Lagre unntak for personen».', 'If only one person needs more in one area: open the person and use “Save exception for the person”.', gate('selskap.tilgang', 2)),
      s(tx('Sjekk', 'Check'), '«Vis som» øverst viser appen slik personen ser den.', '“View as” at the top shows the app as the person sees it.', gate('selskap.tilgang', 3)),
    ],
    show: [at('selskap.tilgang', 1)],
    related: ['task.inviter'],
  }),

  /* ───────────── HMS, kvalitet og ressurser ───────────── */
  task({
    id: 'task.avvik',
    q: tx('Hvordan melder jeg et avvik?', 'How do I report a deviation?'),
    title: tx('Melde avvik', 'Report a deviation'),
    ask: tx(['melde avvik', 'meld avvik', 'registrere avvik', 'nytt avvik', 'avvik', 'rue', 'nestenulykke', 'uønsket hendelse', 'skade på jobb', 'ulykke'], ['report deviation', 'report incident', 'near miss', 'deviation', 'incident']),
    intro: tx('Avvik meldes i ISO / K-HMS — «Meld avvik» ligger øverst på Oversikt og på Avvik og forbedring.', 'Deviations are reported in ISO / QHSE — “Report deviation” is at the top of Overview and of Deviations and improvement.'),
    steps: [
      s(tx('Meld avvik', 'Report deviation'), 'Gå til ISO / K-HMS → Avvik og forbedring (eller Oversikt) og trykk «Meld avvik».', 'Go to ISO / QHSE → Deviations and improvement (or Overview) and tap “Report deviation”.', gate('iso.avvik', 0)),
      s(tx('Fyll ut', 'Fill in'), 'Velg type, skriv «Tittel» (kort hva som skjedde) og «Beskrivelse» med fakta. Sett dato, prosjekt og sted. Ved personskade velger du skadeklasse, og ved mulig meldeplikt hvem som varsler myndighet. Ikke legg inn helseopplysninger.', 'Pick the type, write the “Title” (briefly what happened) and a factual “Description”. Set the date, project and place. For an injury, pick the injury class, and for a possible duty to notify, who notifies the authorities. Don’t add health information.', gate('iso.avvik', 0)),
      s(tx('Send inn', 'Send'), 'Trykk «Send inn». Ansvarlig vurderer saken og lager tiltak, som blir oppgaver i Oppgaver.', 'Tap “Send”. The person responsible assesses the case and creates actions, which become tasks in Tasks.'),
    ],
    show: [at('iso.avvik', 0)],
    related: ['task.skjema'],
  }),
  task({
    id: 'task.skjema',
    q: tx('Hvordan fyller jeg ut et skjema eller en sjekkliste?', 'How do I fill in a form or checklist?'),
    title: tx('Fylle ut skjema / sjekkliste', 'Fill in a form / checklist'),
    ask: tx(['fylle ut skjema', 'fylle ut sjekkliste', 'sjekkliste', 'sja', 'vernerunde', 'fyll ut', 'utfylling', 'skjema'], ['fill in form', 'checklist', 'fill in', 'safe job analysis']),
    // Å lage et nytt skjema er Skjemabygger.
    avoid: tx(['nytt', 'ny', 'lage', 'lager', 'bygge', 'mal', 'opprette'], ['new', 'create', 'build', 'template']),
    intro: tx('Godkjente skjema og sjekklister fylles ut under ISO / K-HMS → Skjemaer.', 'Approved forms and checklists are filled in under ISO / QHSE → Forms.'),
    steps: [
      s(tx('Åpne Skjemaer', 'Open Forms'), 'Gå til ISO / K-HMS → Skjemaer.', 'Go to ISO / QHSE → Forms.', { ...gate('iso.skjema', 2), go: true }),
      s(tx('Fyll ut', 'Fill in'), 'Trykk «Fyll ut» på skjemaet, svar på feltene og trykk «Send inn».', 'Tap “Fill in” on the form, answer the fields and tap “Send”.', gate('iso.skjema', 2)),
    ],
    after: tx('Nye skjema lages i Skjemabygger («Nytt skjema» eller «Les inn en mal»), og må «Godkjenn for ISO» før de vises her.', 'New forms are made in the Form builder (“New form” or “Read a template”), and must be “Approved for ISO” before they show here.'),
    show: [at('iso.skjema', 2)],
    related: ['task.avvik'],
  }),
  task({
    id: 'task.utstyr',
    q: tx('Hvordan reserverer jeg utstyr?', 'How do I book equipment?'),
    title: tx('Reservere utstyr', 'Book equipment'),
    ask: tx(['reservere utstyr', 'reservere maskin', 'booke utstyr', 'låne utstyr', 'reservasjon', 'reservere bil', 'booke bil'], ['book equipment', 'reserve equipment', 'book a car']),
    intro: tx('Utstyr reserveres i kalenderen under Produkter og driftsressurser → Utstyr.', 'Equipment is booked in the calendar under Products and resources → Equipment.'),
    steps: [
      s(tx('Åpne Utstyr', 'Open Equipment'), 'Gå til Utstyr og åpne kalenderen.', 'Go to Equipment and open the calendar.', gate('utstyr', 1)),
      s(tx('Velg dag og tid', 'Pick day and time'), 'Velg en dag, sett fra/til og hensikt.', 'Pick a day, set from/to and purpose.', gate('utstyr', 1)),
      s(tx('Reserver', 'Book'), 'Trykk «Reserver». «Avbestill» fjerner reservasjonen.', 'Tap “Book”. “Cancel” removes the booking.', gate('utstyr', 1)),
    ],
    show: [at('utstyr', 1)],
    related: [],
  }),
  task({
    id: 'task.kilometerstand',
    q: tx('Hvordan registrerer jeg kilometerstand på firmabilen?', 'How do I record the odometer on the company car?'),
    title: tx('Kilometerstand på kjøretøy', 'Odometer on a vehicle'),
    ask: tx(['kilometerstand', 'km-stand', 'tell kilometer', 'kilometerteller', 'kilometer på bilen', 'kilometer på firmabilen'], ['odometer', 'mileage reading']),
    intro: tx('Kilometerstand føres på kjøretøyet under Produkter og driftsressurser → Utstyr.', 'The odometer is recorded on the vehicle under Products and resources → Equipment.'),
    steps: [
      s(tx('Åpne kjøretøyet', 'Open the vehicle'), 'Gå til Utstyr og åpne kjøretøyet (eller «Registrer» det første gang — «Hent fra Vegvesenet» fyller ut fra skiltnummeret).', 'Go to Equipment and open the vehicle (or “Register” it the first time — “Fetch from the road authority” fills in from the plate).', gate('utstyr', 0)),
      s(tx('Tell kilometer', 'Count kilometres'), 'Slå på «Tell kilometer» og skriv kilometerstanden.', 'Turn on “Count kilometres” and enter the odometer reading.', gate('utstyr', 2)),
      s(tx('Lagre', 'Save'), 'Trykk «Lagre kilometerstand».', 'Tap “Save odometer”.', gate('utstyr', 2)),
    ],
    after: tx('Kjøreturer med rute og bom føres i Kjørebok («Registrer kjøretur»).', 'Trips with route and tolls are logged in the Mileage log (“Register trip”).'),
    show: [at('utstyr', 2)],
    related: ['task.kjoring', 'task.utstyr'],
  }),
  task({
    id: 'task.anbudsvarsling',
    q: tx('Hvordan setter jeg opp anbudsvarsling?', 'How do I set up tender alerts?'),
    title: tx('Sette opp anbudsvarsling', 'Set up tender alerts'),
    ask: tx(['sette opp anbudsvarsling', 'anbudsvarsling', 'søkeord anbud', 'cpv', 'cpv-koder', 'ingen anbudstreff', 'få anbud', 'varsel om anbud', 'anbud på e-post'], ['tender alerts', 'set up tenders', 'cpv codes', 'tender keywords']),
    intro: tx('Anbudsvarslingen søker etter dine CPV-koder og søkeord. Det settes opp under Anbud → Innstillinger.', 'Tender alerts search for your CPV codes and keywords. It is set up under Tenders → Settings.'),
    steps: [
      s(tx('AI-profil', 'AI profile'), 'Gå til Anbud → Innstillinger. Skriv kort hva dere leverer (eller lim inn hjemmesiden) og trykk «La AI tolke bedriften». Lagre profilen.', 'Go to Tenders → Settings. Briefly write what you deliver (or paste your website) and tap “Let AI interpret the company”. Save the profile.', gate('anbud.innstillinger', 0)),
      s(tx('CPV og søkeord', 'CPV and keywords'), '«Legg til CPV», «Legg til søkeord» og «Legg til næringskode». Trykk «Lagre kriterier».', '“Add CPV”, “Add keyword” and “Add industry code”. Tap “Save criteria”.', gate('anbud.innstillinger', 1)),
      s(tx('Varsling', 'Notifications'), 'Under Varsling slår du på e-post og push, og «Legg til e-post» for mottakere.', 'Under Notifications, turn on email and push, and “Add email” for recipients.', gate('anbud.innstillinger', 3)),
      s(tx('Hent treff', 'Fetch matches'), 'Gå til 1.1 Anbudsvarsling og trykk «Oppdater nå».', 'Go to 1.1 Tender alerts and tap “Update now”.', gate('anbud.varsling', 1)),
    ],
    show: [at('anbud.innstillinger', 0)],
    related: [],
  }),

  /* ───────────── Personlig og konto ───────────── */
  task({
    id: 'task.kalender',
    q: tx('Hvordan legger jeg inn en avtale i kalenderen?', 'How do I add an event to the calendar?'),
    title: tx('Legge inn en hendelse i kalenderen', 'Add an event to the calendar'),
    ask: tx(['avtale i kalenderen', 'hendelse i kalenderen', 'ny hendelse', 'møte i kalenderen', 'legge inn møte', 'kalender'], ['calendar event', 'new event', 'add meeting', 'calendar']),
    intro: tx('Hendelser legges inn under Menyen → Kalender.', 'Events are added under Menu → Calendar.'),
    steps: [
      s(tx('Ny hendelse', 'New event'), 'Trykk «Ny hendelse» øverst til høyre.', 'Tap “New event” at the top right.'),
      s(tx('Fyll ut og lagre', 'Fill in and save'), 'Gi den tittel, tid og eventuelt gjentakelse, og trykk Lagre.', 'Give it a title, time and optional repeat, and tap Save.'),
    ],
    show: [at('plan', 0)],
    related: ['task.outlook'],
  }),
  task({
    id: 'task.outlook',
    q: tx('Hvordan kobler jeg Outlook?', 'How do I connect Outlook?'),
    title: tx('Koble Outlook (kalender og e-post)', 'Connect Outlook (calendar and email)'),
    ask: tx(['koble outlook', 'outlook', 'microsoft konto', 'koble kalender', 'koble e-post', 'synkronisere kalender', 'microsoft'], ['connect outlook', 'outlook', 'microsoft account', 'sync calendar']),
    intro: tx('Outlook kobles én gang for kalenderen og én gang for e-posten.', 'Outlook is connected once for the calendar and once for email.'),
    steps: [
      s(tx('Kalender', 'Calendar'), 'Menyen → Kalender → «Koble til kalender» (også under kalenderinnstillingene), og logg inn med Microsoft.', 'Menu → Calendar → “Connect calendar” (also in the calendar settings), and sign in with Microsoft.'),
      s(tx('E-post', 'Email'), 'Menyen → E-post → «Innstillinger» ved mappene, og koble Microsoft-kontoen.', 'Menu → Email → “Settings” by the folders, and connect the Microsoft account.'),
    ],
    show: [at('plan', 2)],
    related: ['task.kalender'],
  }),
  task({
    id: 'task.oppgave',
    q: tx('Hvordan lager jeg en oppgave?', 'How do I create a task?'),
    title: tx('Lage en oppgave', 'Create a task'),
    ask: tx(['ny oppgave', 'lage oppgave', 'lage en oppgave', 'gjøremål', 'huskeliste', 'todo'], ['new task', 'create task', 'to-do']),
    intro: tx('Oppgaver ligger under Menyen → Oppgaver, sammen med tiltak fra HR og ISO.', 'Tasks are under Menu → Tasks, together with actions from HR and ISO.'),
    steps: [
      s(tx('Ny oppgave', 'New task'), 'Trykk «Ny oppgave».', 'Tap “New task”.'),
      s(tx('Fyll ut', 'Fill in'), 'Skriv hva som skal gjøres, sett frist og lagre. Kryss av når den er ferdig.', 'Write what needs doing, set a deadline and save. Tick it off when done.'),
    ],
    show: [at('stars', 0)],
    related: [],
  }),
  task({
    id: 'task.logo',
    q: tx('Hvordan endrer jeg logoen?', 'How do I change the logo?'),
    title: tx('Endre bedriftens logo', 'Change the company logo'),
    ask: tx(['logo', 'endre logo', 'last opp logo', 'bytte logo'], ['logo', 'change logo', 'upload logo']),
    intro: tx('Logoen brukes på faktura, avtaler, skjema og CV, og settes under Bedriftsinnstillinger.', 'The logo is used on invoices, agreements, forms and CVs, and is set under Company settings.'),
    steps: [
      s(tx('Last opp logo', 'Upload logo'), 'Gå til Bedriftsinnstillinger og trykk «Last opp logo».', 'Go to Company settings and tap “Upload logo”.', gate('selskap.innstillinger', 0)),
      s(tx('Lagre', 'Save'), 'Trykk «Lagre innstillinger».', 'Tap “Save settings”.', gate('selskap.innstillinger', 3)),
    ],
    show: [at('selskap.innstillinger', 0)],
    related: [],
  }),
  task({
    id: 'task.fravaerstype',
    q: tx('Hvordan legger jeg til en fraværstype?', 'How do I add an absence type?'),
    title: tx('Legge til eller endre fraværstyper', 'Add or change absence types'),
    ask: tx(['fraværstype', 'fraværstyper', 'ny fraværstype', 'legge til fraværstype', 'endre fraværstype'], ['absence type', 'absence types', 'new absence type']),
    intro: tx('Fraværstypene styres under Fravær → Innstillinger.', 'Absence types are managed under Absence → Settings.'),
    steps: [
      s(tx('Fraværstyper', 'Absence types'), 'Gå til Fravær → Innstillinger → «Fraværstyper».', 'Go to Absence → Settings → “Absence types”.', gate('selskap.fravaerstyper', 0)),
      s(tx('Legg til', 'Add'), 'Trykk «+ Legg til fraværstype», gi den navn og velg om den er betalt og påvirker timebalansen. Lagre.', 'Tap “+ Add absence type”, name it and choose whether it is paid and affects the hour balance. Save.', gate('selskap.fravaerstyper', 0)),
    ],
    show: [at('selskap.fravaerstyper', 0)],
    related: ['task.fravaer'],
  }),
  task({
    id: 'task.nyttSkjema',
    q: tx('Hvordan lager jeg et nytt skjema?', 'How do I make a new form?'),
    title: tx('Lage skjema eller sjekkliste', 'Make a form or checklist'),
    ask: tx(['nytt skjema', 'lage skjema', 'lage et skjema', 'lage sjekkliste', 'ny sjekkliste', 'skjemabygger', 'bygge skjema', 'skjema fra papir', 'skjemamal'], ['new form', 'create form', 'form builder', 'build a checklist']),
    intro: tx('Skjema og sjekklister lages i Skjemabygger — fra bunnen eller fra en mal du har på papir eller fil.', 'Forms and checklists are made in the Form builder — from scratch or from a template you have on paper or file.'),
    steps: [
      s(tx('Åpne Skjemabygger', 'Open the form builder'), 'Gå til Konto → Skjemabygger.', 'Go to Account → Form builder.', { ...gate('skjema', 0), go: true }),
      s(tx('Nytt eller fra mal', 'New or from a template'), '«Nytt skjema» gir et tomt skjema. «Les inn en mal» → «Last opp fil» eller «Ta bilde av papir» bygger det med AI.', '“New form” gives an empty form. “Read a template” → “Upload file” or “Photograph paper” builds it with AI.', gate('skjema', 0)),
      s(tx('Bygg', 'Build'), '«Legg til felt», endre spørsmålene og bruk «Innstillinger» for logo, varsler og om svar kan endres.', '“Add field”, edit the questions and use “Settings” for logo, notifications and whether answers can be changed.', gate('skjema', 1)),
    ],
    after: tx('Skal skjemaet brukes i ISO / K-HMS, må det «Godkjenn for ISO» under ISO → Skjemaer.', 'To use the form in ISO / QHSE, it must be “Approved for ISO” under ISO → Forms.'),
    show: [at('skjema', 0)],
    related: ['task.skjema'],
  }),
  task({
    id: 'task.passord',
    q: tx('Hvordan endrer jeg passordet?', 'How do I change my password?'),
    title: tx('Glemt eller endre passord', 'Forgotten or change password'),
    ask: tx(['passord', 'glemt passord', 'endre passord', 'bytte passord', 'nytt passord', 'tilbakestille passord', 'passordet'], ['password', 'forgot password', 'change password', 'reset password']),
    intro: tx('Du får en lenke på e-post for å sette nytt passord.', 'You get a link by email to set a new password.'),
    steps: [
      s(tx('Glemt passord', 'Forgot password'), 'På innloggingen: skriv e-postadressen og trykk «Glemt passord».', 'On the sign-in page: enter your email and tap “Forgot password”.'),
      s(tx('Endre når du er innlogget', 'Change while signed in'), 'Innstillinger → «Rediger profil» → «Send lenke for å endre passord».', 'Settings → “Edit profile” → “Send a link to change password”.'),
      s(tx('For en ansatt', 'For an employee'), 'Administrator: Ansatte → personen → Innstillinger → «Endre passord» → «Send passordlenke».', 'Administrator: Employees → the person → Settings → “Change password” → “Send password link”.', gate('ansatte', 0)),
    ],
    after: tx('Kommer ikke e-posten, sjekk søppelpost og at adressen er riktig.', 'If the email doesn’t arrive, check spam and that the address is right.'),
    show: [at('settings', 0)],
    related: ['task.inviter'],
  }),
  task({
    id: 'task.indeks',
    q: tx('Hvordan regulerer jeg prisen etter indeks?', 'How do I adjust the price by index?'),
    title: tx('Indeksregulere en avtale', 'Index-adjust an agreement'),
    ask: tx(['indeksregulering', 'indeksregulere', 'regulere pris', 'prisjustering', 'indeks', 'kpi', 'ssb indeks', 'varsle prisendring'], ['index adjustment', 'price adjustment', 'adjust the price', 'price by index', 'indexation', 'index', 'cpi']),
    intro: tx('Avtaler med indeksklausul reguleres under Økonomi → Indeksregulering. Ny pris beregnes etter avtalen.', 'Agreements with an index clause are adjusted under Finance → Index adjustment. The new price follows the agreement.'),
    steps: [
      s(tx('Velg avtale', 'Pick the agreement'), 'Søk i prosjekt, oppdragsgiver og avtale, og velg avtalen i listen.', 'Search projects, clients and agreements, and pick the agreement in the list.', gate('okonomi.indeks', 0)),
      s(tx('Hent indeks', 'Fetch the index'), 'Trykk «Åpne indeksbehandling» og så «Hent siste indeks».', 'Tap “Open index handling” and then “Fetch latest index”.', gate('okonomi.indeks', 1)),
      s(tx('Varsle kunden', 'Notify the customer'), '«Lagre utkast» lagrer brevet på avtalen. «Send varsel på e-post» sender det til kunden.', '“Save draft” stores the letter on the agreement. “Send notice by email” sends it to the customer.', gate('okonomi.indeks', 2)),
    ],
    show: [at('okonomi.indeks', 1)],
    related: ['task.sendFaktura'],
  }),
  task({
    id: 'task.cv',
    q: tx('Hvordan lager jeg CV for en ansatt?', 'How do I make an employee CV?'),
    title: tx('CV og referanseprosjekter', 'CV and reference projects'),
    ask: tx(['cv', 'lage cv', 'cv-en', 'referanseprosjekt', 'referanser', 'importer cv', 'eksporter cv'], ['cv', 'resume', 'reference projects']),
    intro: tx('CV-en ligger på den ansatte under Ansatte. Den kan fylles ut med AI og eksporteres til tilbud.', 'The CV is on the employee under Employees. It can be filled in with AI and exported for bids.'),
    steps: [
      s(tx('Åpne personen', 'Open the person'), 'Gå til Ansatte og trykk personen.', 'Go to Employees and tap the person.', gate('ansatte', 3)),
      s(tx('Fyll ut', 'Fill in'), '«Importer CV» leser en eksisterende CV med AI og fyller ut profilen. Legg til referanseprosjekter.', '“Import CV” reads an existing CV with AI and fills in the profile. Add reference projects.', gate('ansatte', 2)),
      s(tx('Eksporter', 'Export'), '«Eksporter CV som PDF» — referanseark i Word/PDF brukes i tilbud.', '“Export CV as PDF” — reference sheets in Word/PDF are used in bids.', gate('ansatte', 3)),
    ],
    show: [at('ansatte', 3)],
    related: ['task.nyAnsatt'],
  }),
];

export function getTask(id) {
  return ASSISTANT_TASKS.find((t) => t.id === id) || null;
}
