/**
 * Malbibliotek for KS-systemet. Bygd fra bedriftens KS-dokumenter (C1-A … C1-H).
 *
 * To slags oppføringer:
 *   - kind 'mal': et dokument som fylles ut og skrives ut fra Skjemabygger.
 *   - kind 'system': dokumentet er erstattet av en innebygd modul (avvik, risiko,
 *     fravær, ansatte …). Biblioteket peker dit, så det ikke registreres to steder.
 *
 * Firmaopplysninger skrives som flettefelt ({{firma}}, {{orgnr}} …), se tokens.js.
 * Personopplysninger fra de gamle dokumentene (navn, adresser, fødselsnummer) er ikke med.
 */
import { blankDocInfo, blankSettings, emptyAnswer, normalizeBuilderField, tableColumn, tableRow, tableRows } from '../anbud/formBuilder.js';

export const LIBRARY_GROUPS = [
  { id: 'generelt', label: 'Generelt', icon: 'document-text-outline' },
  { id: 'hms', label: 'HMS', icon: 'medkit-outline' },
  { id: 'miljo', label: 'Miljø', icon: 'leaf-outline' },
  { id: 'personal', label: 'Personal', icon: 'people-outline' },
  { id: 'styring', label: 'Styring og kvalitet', icon: 'git-network-outline' },
];

const SYSTEM = '{{firma}} - Ledelsessystem';
const JNI = ['J', 'N', 'I'];
const JNI_LEGEND = 'J = Utbedret · N = Ikke utbedret · I = Ikke relevant';
const JA_NEI = ['Ja', 'Nei'];

/* ───────── Byggesteiner ───────── */

function field(kind, label, extra = {}) {
  return { kind, label, required: false, help: '', placeholder: '', width: 'full', editor: kind === 'title' || kind === 'note' ? 'fast' : 'avsender', options: [], ...extra };
}

const title = (label) => field('title', label);
const note = (label) => field('note', label);
const text = (label, extra) => field('text', label, extra);
const half = (label, extra) => field('text', label, { width: 'half', ...extra });
const long = (label, extra) => field('long', label, extra);
const date = (label, extra) => field('date', label, { placeholder: 'Dato', ...extra });
const halfDate = (label, extra) => date(label, { width: 'half', ...extra });
const number = (label, extra) => field('number', label, extra);
const sign = (label, extra) => field('sign', label, extra);
const check = (label, extra) => field('check', label, extra);
const locked = (label, value, extra) => field('text', label, { editor: 'fast', value, ...extra });

function choice(label, options, extra = {}) {
  const kind = extra.kind || 'choice';
  return field(kind, label, { ...extra, kind, options: options.map((row, index) => ({ id: `o${index + 1}`, label: row })) });
}

/** Kolonner: [type, etikett, bredde | { width, options }]. */
function columns(spec) {
  return spec.map(([type, label, extra], index) => tableColumn(type, label, {
    id: `c${index + 1}`,
    ...(typeof extra === 'number' ? { width: extra } : (extra || {})),
  }));
}

/**
 * Rader: «# Overskrift» gir mellomoverskrift. En tekst fyller første faste kolonne,
 * en liste fyller de faste kolonnene i rekkefølge. Et objekt gir celler etter kolonne-id.
 */
function rows(cols, items) {
  const fixed = cols.filter((col) => col.type !== 'check' && col.type !== 'mark');
  return items.map((item, index) => {
    const id = `r${index + 1}`;
    if (typeof item === 'string' && item.startsWith('# ')) return tableRow(item.slice(2), { id });
    if (typeof item === 'string') return tableRow(fixed[0] ? { [fixed[0].id]: item } : {}, { id });
    if (Array.isArray(item)) {
      const cells = {};
      item.forEach((value, i) => {
        if (fixed[i] && value) cells[fixed[i].id] = value;
      });
      return tableRow(cells, { id });
    }
    return tableRow(item || {}, { id });
  });
}

/** Nummererte sjekkpunkter: «1.», «2.» … i første kolonne, overskrifter teller ikke. */
function numbered(items, suffix = '.') {
  let n = 0;
  return items.map((item) => {
    if (typeof item === 'string' && item.startsWith('# ')) return item;
    n += 1;
    return [`${n}${suffix}`, item];
  });
}

function blanks(count) {
  return Array.from({ length: count }, () => ({}));
}

function table(label, spec, items, extra = {}) {
  const cols = columns(spec);
  return field('table', label, { columns: cols, rows: rows(cols, items), allowAdd: true, legend: '', ...extra });
}

function docInfo(ref, extra = {}) {
  return { ...blankDocInfo(), system: SYSTEM, docId: ref, version: '1', ...extra };
}

/* ───────── Maler ───────── */

function brev() {
  return {
    title: 'Brev',
    intro: '',
    layout: 'brev',
    fields: [
      half('Til', { placeholder: 'Firma' }),
      half('Vår dato', { kind: 'date', placeholder: 'Dato' }),
      half('Att.', { placeholder: 'Kontaktperson' }),
      half('Vårt prosjektnummer', { placeholder: 'Prosjektnummer' }),
      half('Adresse'),
      half('Vår saksbehandler', { placeholder: '{{bruker}}' }),
      half('Postnr. og sted'),
      half('Prosjektnavn'),
      text('Tittel', { required: true, placeholder: 'Brevets tittel' }),
      long('Brevtekst', { required: true, placeholder: 'Skriv brevet her' }),
      note('Med hilsen\n{{firma}}'),
      sign('Signatur'),
    ],
  };
}

function motereferat() {
  const deltakere = table('Deltakere', [
    ['text', 'Rolle', 2], ['text', 'Navn', 4], ['text', 'Firma', 4], ['text', 'Telefon', 3], ['text', 'E-post', 4], ['check', 'T*', 1], ['check', 'I*', 1],
  ], [{ c1: 'BH' }, { c1: 'BHR', c3: '{{firma}}' }, ...blanks(6)], { legend: 'T* = Til stede under møtet · I* = Innkalles til neste møte' });
  const saker = table('Saker', [
    ['text', 'Pos', 2], ['long', 'Tekst', 9], ['text', 'Ansvarlig', 3], ['date', 'Frist', 2], ['check', 'Ferdig', 1],
  ], [
    '# 1. Overskrift', { c1: '1.01' }, { c1: '1.02' },
    '# 2. Overskrift', { c1: '2.01' }, { c1: '2.02' },
    '# 3. Overskrift', { c1: '3.01' },
    '# 4. Overskrift', { c1: '4.01' },
  ], { legend: 'Nummerering: møtenummer.punkt, for eksempel 2.03 er møte 2, punkt 3. Bytt overskriftene i malen.' });
  return {
    title: 'Møtereferat',
    layout: 'skjema',
    fields: [
      title('Møtet'),
      half('Prosjektnavn', { required: true }),
      half('Prosjektnummer'),
      choice('Type referat', ['Byggemøte', 'Prosjekteringsmøte', 'Oppstartsmøte', 'Befaring', 'Internt møte', 'Annet'], { kind: 'dropdown', width: 'half' }),
      half('Møte nr.', { placeholder: '01' }),
      half('Møtetidspunkt', { placeholder: 'Dato og klokkeslett' }),
      half('Møtested', { placeholder: 'Adresse' }),
      half('Referent', { placeholder: '{{bruker}}' }),
      title('Neste møte'),
      half('Tidspunkt for neste møte'),
      half('Sted for neste møte', { placeholder: 'Adresse' }),
      title('Deltakere'),
      deltakere,
      title('Referat'),
      saker,
      sign('Referent'),
    ],
  };
}

function sjekklisteGenerell() {
  return {
    title: 'Sjekkliste',
    layout: 'skjema',
    fields: [
      title('Om sjekklisten'),
      half('Prosjektnavn'),
      half('Sjekkliste nr.', { placeholder: '01' }),
      choice('Type sjekkliste', ['Egenkontroll', 'Befaring', 'Overtakelse', 'Ferdigbefaring', 'Internkontroll', 'Annet'], { kind: 'dropdown', width: 'half' }),
      half('Tittel'),
      half('Prosjektnummer'),
      halfDate('Dato'),
      half('Lokasjon', { placeholder: 'Område eller lokasjon' }),
      half('Referent', { placeholder: '{{bruker}}' }),
      title('Sjekkpunkter'),
      table('Sjekkpunkter', [
        ['fixed', 'Pos', 1], ['text', 'Lokasjon', 3], ['long', 'Sjekkpunkt', 6], ['text', 'Ansvar', 3], ['text', 'Status/merk', 4], ['mark', 'J/N/I', { options: JNI }],
      ], Array.from({ length: 15 }, (_, i) => ({ c1: `${i + 1}.` })), { legend: JNI_LEGEND }),
      sign('Utført av'),
    ],
  };
}

function hmsAarlig() {
  const items = [
    'Bedriftens målsetting. Er de konkrete målene nådd?',
    'Er meldinger om avvik og feil blitt behandlet på en ordentlig måte?',
    'Er planlagte tiltak gjennomført innen tidsfristene?',
    'Har vi fulgt opp de sykmeldte slik vi skal?',
    'Er lover og forskrifter oppdatert?',
    'Følges rutinene?',
    'Er systemet og rutinene godt nok kjent av alle i bedriften?',
    'Er rutinene gode nok?',
    'Bør rutinene endres?',
    'Bør noen rutiner kuttes ut?',
    'Bør noen nye rutiner inn?',
    'Har noen behov for mer eller bedre opplæring?',
    'Er tjenestene fra bedriftshelsetjenesten (BHT) tilfredsstillende?',
  ];
  return {
    title: 'Sjekkliste for årlig gjennomgang av HMS-systemet',
    layout: 'skjema',
    fields: [
      title('Gjennomgangen'),
      halfDate('Dato', { required: true }),
      half('Deltakere'),
      title('Sjekkpunkter'),
      table('Sjekkpunkter', [
        ['fixed', 'Sjekkpunkt', 7], ['check', 'Vurdert', 1], ['check', 'N/A', 1], ['long', 'Forslag til forbedring', 6],
      ], items, { legend: 'Nye sjekkpunkt legges til nederst. Forbedringer som skal gjennomføres, registreres som tiltak i ISO / K-HMS › Avvik og forbedring.' }),
      sign('Signatur ansattes representant'),
      sign('Signatur daglig leder'),
    ],
  };
}

function elKontroll() {
  const items = [
    '# Generelle forhold',
    'Finnes det ajourført dokumentasjon for anlegget?',
    'Føres det journaler over driftstekniske forstyrrelser på installasjoner og utstyr?',
    'Har det siden forrige kontroll vært noe unormalt ved installasjoner og utstyr?',
    'Er det synlige feil, mangler eller skader på installasjoner og utstyr?',
    'Finnes det bruks- og monteringsanvisninger for installasjoner og utstyr?',
    'Føres det avviksmeldinger dersom det oppstår skader på installasjoner og utstyr?',
    '# Inntak',
    'Er sikringene unormalt varme?',
    'Er sikringene godt tilskrudd?',
    'Er det synlig skade på kabelen?',
    '# Hovedtavle/sikringsskap',
    'Er kursoversikten(e) ajourført?',
    'Er sikringer og brytere merket i henhold til kursoversikt?',
    'Er skrusikringer godt tilskrudd (se også inntak)?',
    'Er sikringer, brytere eller vern unormalt varme?',
    'Fungerer testknapp på jordfeilbryter og -varsler?',
    'Er det ryddig og rent i tavlerom/sikringsskap?',
    'Er hovedtavle/sikringsskap lukket og låst?',
    'Er hovedtavlerom/sikringsskap forskriftsmessig branntettet?',
    '# Ledningsopplegg',
    'Er det utstrakt (overdreven) bruk av bevegelige ledninger?',
    'Benyttes skjøteledninger som permanent opplegg?',
    'Er bevegelige ledninger uskadet, og er eventuelle reparasjoner forsvarlig utført?',
    'Ligger bevegelige ledninger utsatt til for skader og andre unormale påkjenninger?',
    'Er de bevegelige ledningene dimensjonert for formålet?',
    'Brukes bevegelige ledninger kun i samme rom som de er tilkoblet?',
    'Benyttes kabeltrommel (for skjøteledninger) i henhold til leverandørens anvisninger?',
    '# Fast opplegg',
    'Er ledninger forlagt slik at de ikke kan bli påført skader under normale forhold?',
    'Er ledninger, koblingsbokser og stikkontakter uten skader?',
    'Er ledninger, koblingsbokser og stikkontakter forsvarlig festet til underlaget?',
    'Er ledninger, koblingsbokser og stikkontakter dimensjonert for bruksområdet?',
    '# Materiell/utstyr',
    'Gjennomføres det systematisk service og vedlikehold av løst elektrisk utstyr?',
    'Følges bruksanvisninger for elektrisk utstyr?',
    'Er det elektriske utstyret uten skader?',
    'Skiftes tennere til lysstoffrør samtidig som lysstoffrørene skiftes ut?',
    'Finnes det sikkerhetsrutiner for bruk av kaffetraktere (for eksempel montert tidsur)?',
  ];
  return {
    title: 'Sjekkliste elektriske installasjoner',
    layout: 'skjema',
    fields: [
      title('EL-kontroll'),
      half('Sted / lokaler', { required: true }),
      half('Sjekkliste nr.', { placeholder: '01' }),
      halfDate('Dato', { required: true }),
      half('Kontrollert av', { placeholder: '{{bruker}}' }),
      note('Kommer svaret i feltet under «N», må forholdet utbedres. Registrer avvik i ISO / K-HMS › Avvik og forbedring.'),
      table('Sjekkpunkter', [
        ['fixed', 'Pos', 1], ['fixed', 'Sjekkpunkt', 8], ['text', 'Ansvar', 3], ['text', 'Status/merk', 4], ['mark', 'J/N/I', { options: JNI }],
      ], numbered(items), { legend: JNI_LEGEND }),
      sign('Utført av'),
    ],
  };
}

function sja() {
  const items = [
    'Er det en kjent arbeidsoperasjon?',
    'Finnes det dekkende instrukser for arbeidet?',
    'Har vi kjennskap til eller erfaringer med uønskede hendelser fra tilsvarende jobber?',
    'Har vi nødvendig personell og kompetanse for arbeidet?',
    'Har utførende personell fått tilstrekkelig informasjon om jobben?',
    'Er det andre som burde deltatt i SJA-møtet?',
    'Krever jobben koordinering mellom flere bedrifter?',
    'Er signalmetoder og kommunikasjon avklart og kjent for alle?',
    'Er det mulighet for konflikter med samtidige aktiviteter?',
    'Er det avklart hvem som leder arbeidet?',
    'Er det planlagt tilstrekkelig med tid for arbeidet?',
    'Har vi tenkt gjennom håndtering av eventuell alarm- eller beredskapssituasjon?',
    'Er det tilstrekkelig brannbeskyttelse?',
    'Er og forblir fysiske barrierer/sikkerhetssystemer på plass?',
    'Er nødvendig isolering mot energi ivaretatt (rotasjon, trykk, spenning osv.)?',
    'Kan høy temperatur være en fare?',
    'Er det tilstrekkelig maskinvern/skjerming (tildekking av utstyr)?',
    'Er løfteutstyr og annet utstyr/materiell kjent, tilgjengelig, sjekket og funnet i orden?',
    'Er førbrukssjekk utført på løfteutstyret?',
    'Har alle riktig og tilstrekkelig verneutstyr?',
    'Er det fare for ukontrollert bevegelse av utstyr/verktøy?',
    'Er det påkrevd med befaring på arbeidsområdet (er løfteområdet kontrollert, og er alle i sikker sone hvis last faller eller svinger)?',
    'Er det tatt hensyn til arbeid i høyden (over to meter), arbeid over flere nivåer og fallende gjenstander?',
    'Er det tatt hensyn til brannfarlig gass, væske eller materialer i området?',
    'Er det tatt hensyn til mulig eksponering for støy, vibrasjon, giftig gass/væsker, røyk, damp, kjemikalier, løsemidler eller radioaktivitet?',
    'Er nødvendige sikkerhetsdatablad på plass?',
    'Er det tilstrekkelig ventilasjon?',
    'Er arbeidsplassen ren og ryddig?',
    'Er det tatt hensyn til behov for markering, skilting eller avsperring?',
    'Er det tatt hensyn til transportforhold?',
    'Er det tatt hensyn til behov for sikkerhetsvakt?',
    'Er det tatt hensyn til sikt og belysning / behov for arbeidslys?',
    'Skaper været noen utfordringer for oppgaven?',
    'Er det tatt hensyn til tilkomst og rømning?',
    'Er det tatt hensyn til arbeidsstilling og fare for arbeidsbetinget sykdom?',
    'Er det fare for utslipp til luft, grunn eller sjø?',
    'Har vi tilgang til førstehjelpsskrin?',
    'Har noen førstehjelpskunnskap?',
  ];
  return {
    title: 'Sjekkliste for gjennomføring av SJA (Sikker Jobb Analyse)',
    layout: 'skjema',
    fields: [
      title('Jobben'),
      half('Prosjekt', { required: true }),
      half('Kunde'),
      half('Arbeidsoperasjon', { required: true }),
      halfDate('Dato', { required: true }),
      half('Utført av', { placeholder: '{{bruker}}' }),
      half('Sted'),
      table('Deltakere', [['text', 'Navn', 4], ['text', 'Firma', 4], ['text', 'Rolle', 3]], blanks(4)),
      title('Sjekkpunkter'),
      table('Sjekkpunkter', [
        ['fixed', 'Nr', 1], ['fixed', 'Sjekkpunkt', 7], ['mark', 'Ja/Nei', { options: JA_NEI }], ['long', 'Tekst/tiltak', 5], ['date', 'Frist', 2], ['text', 'OK/signert', 2],
      ], numbered(items, ''), { legend: 'Svar «Nei» der det trengs tiltak. Skriv tiltaket, fristen og hvem som signerer når det er utført.' }),
      sign('Signatur ansvarlig for jobben'),
    ],
  };
}

function vernerunde() {
  const items = [
    '# 1. Trivsel og organisatorisk arbeidsmiljø',
    'Opplæring', 'Informasjon og medbestemmelse', 'Mellommenneskelige forhold', 'Produksjon',
    '# 2. Fysiske og kjemiske forhold',
    'Ergonomi og arbeidsstillinger', 'Ventilasjon, klima og luftkvalitet', 'Kjemikalier, gasser og løsemidler', 'HMS-datablad / stoffkartotek', 'Støv', 'Belysning', 'Støy',
    '# 3. Utstyr og lokaler',
    'Arbeidslokaler', 'Redskapsrom', 'Personalrom', 'Vedlikehold av maskiner og utstyr', 'Arbeidsområde utendørs',
    '# 4. Miljø, orden og avfall',
    'Orden og rengjøring', 'Spesialavfall', 'Søppelhåndtering', 'Fare for utslipp',
    '# 5. Sikkerhet',
    'Verneutstyr', 'Nødstopp maskiner', 'Førstehjelpsutstyr', 'Ulykker og uønskede hendelser',
    '# 6. Brannvern og elektrisk anlegg/utstyr',
    'Brannvernapparater', 'Rømningsveier', 'Røykvarslere', 'Opplæring i brannslukking', 'Kontroll og vedlikehold av elektrisk utstyr',
    '# 7. Produktkontroll',
    'Skadelige produkter', 'Innkjøpsrutiner',
  ];
  return {
    title: 'Sjekkliste vernerunde (intern)',
    layout: 'skjema',
    fields: [
      title('Vernerunden'),
      half('Kartleggingssted', { required: true }),
      halfDate('Dato', { required: true }),
      half('Leder'),
      half('Verneombud'),
      table('Deltakere', [
        ['text', 'Navn', 4], ['text', 'Rolle', 3], ['text', 'Firma', 3], ['text', 'Telefon', 3], ['text', 'Initialer', 2], ['check', 'Til stede', 1], ['check', 'Distr.', 1],
      ], blanks(5), { legend: 'Distr. = får referatet.' }),
      title('Sjekkpunkter'),
      table('Sjekkpunkter', [
        ['fixed', 'Sjekkpunkt', 5], ['mark', 'Status', { options: ['OK', 'Avvik', 'I/R'] }], ['long', 'Kommentar / tiltak', 6], ['date', 'Tidsfrist', 2], ['text', 'Ansvarlig', 3],
      ], items, { legend: 'Avvik registreres i ISO / K-HMS › Avvik og forbedring, slik at tiltaket følges opp. I/R = ikke relevant.' }),
      sign('Signatur leder'),
      sign('Signatur verneombud'),
    ],
  };
}

function handlingsplan() {
  return {
    title: 'Handlingsplan',
    layout: 'skjema',
    fields: [
      title('Handlingsplan'),
      half('Gjelder', { placeholder: 'For eksempel vernerunde, risikovurdering eller årlig gjennomgang' }),
      halfDate('Dato'),
      table('Tiltak', [
        ['long', 'Hva skal forbedres?', 5], ['long', 'Hvordan skal det gjennomføres?', 6], ['date', 'Når (innen dato)', 2], ['text', 'Hvem er ansvarlig?', 3], ['text', 'Kvittering når avsluttet', 3],
      ], blanks(6), { legend: 'Ansvarlig kvitterer når arbeidet er avsluttet. Tiltak som skal følges opp med varsel, legges også inn i ISO / K-HMS › Avvik og forbedring.' }),
    ],
  };
}

function verneutstyr() {
  return {
    title: 'Skjema over påbudt verneutstyr',
    layout: 'skjema',
    fields: [
      title('Påbudt verneutstyr per arbeidsoppgave'),
      table('Verneutstyr', [
        ['fixed', 'Arbeidsoppgaver', 4], ['check', 'Vernehansker', 1], ['check', 'Verneforkle', 1], ['check', 'Hjelm', 1], ['check', 'Vernesko', 1], ['check', 'Hørselsvern', 1], ['check', 'Støvmaske', 1], ['text', 'Annet', 3],
      ], ['Produksjon', 'Varmt arbeid', 'Metallarbeid', 'Lager', 'Bygningsarbeid', 'Truckkjøring', 'Vask/renhold', 'Vedlikehold'], { legend: 'Kryss av for verneutstyr som er påbudt. Skriv for eksempel øyevern under «Annet».' }),
      halfDate('Sist gjennomgått'),
      half('Gjennomgått av', { placeholder: '{{bruker}}' }),
    ],
  };
}

function innkjop() {
  return {
    title: 'Sjekkliste – innkjøp',
    layout: 'brev',
    fields: [
      note('Vi skal så langt det er mulig bruke leverandører og produkter som forbedrer våre egne miljøprestasjoner. Ved innkjøp skal vi alltid stille miljøkrav.'),
      half('Innkjøp / leverandør', { required: true }),
      halfDate('Dato'),
      table('Sjekkliste ved innkjøp og valg av leverandør', [
        ['fixed', 'Sjekkpunkt', 7], ['mark', 'Svar', { options: JA_NEI }], ['text', 'Kommentar', 5],
      ], [
        'Har vi behov for det, eller klarer vi oss uten?',
        'Kan vi reparere eller gjenbruke?',
        'Finnes det miljømerkede alternativer?',
        'Unngår vi engangsartikler og produkter med tilsatt mikroplast?',
        'Tar leverandøren miljøansvar?',
        'Har viktige leverandører fortalt hvordan de tar miljøansvar?',
        'Ved reise: hvilken reisemåte er mest miljøvennlig?',
      ], { allowAdd: false, legend: 'Oversikt over offisielle miljømerker: Svanemerket, EU Ecolabel og Blomsten.' }),
      half('Utført av', { placeholder: '{{bruker}}' }),
    ],
  };
}

function hmsEgenerklaering() {
  return {
    title: 'HMS-egenerklæring',
    layout: 'brev',
    fields: [
      title('Denne bekreftelsen gjelder'),
      locked('Virksomhetens navn', '{{firma}}', { width: 'half' }),
      locked('Organisasjonsnummer', '{{orgnr}}', { width: 'half' }),
      locked('Adresse', '{{adresse}}'),
      note('Det bekreftes med dette at virksomheten arbeider systematisk for å oppfylle kravene i helse-, miljø- og sikkerhetslovgivningen, og ved det tilfredsstiller kravene i forskrift om systematisk helse-, miljø- og sikkerhetsarbeid i virksomheter (internkontrollforskriften), FOR-1996-12-06-1127.'),
      note('Det bekreftes at virksomheten er lovlig organisert i henhold til gjeldende skatte- og arbeidsmiljøregelverk når det gjelder ansattes faglige og sosiale rettigheter. Det aksepteres at oppdragsgiver etter anmodning får rett til å gjennomgå og verifisere virksomhetens system for ivaretakelse av helse, miljø og sikkerhet.'),
      title('For virksomheten'),
      half('Daglig leder', { required: true }),
      half('Sted', { placeholder: '{{adresse}}' }),
      halfDate('Dato', { required: true }),
      sign('Signatur daglig leder'),
      title('Representant for de ansatte'),
      note('Det bekreftes med dette at det er iverksatt systematiske tiltak for å oppfylle ovennevnte krav i helse-, miljø- og sikkerhetslovgivningen.'),
      half('Navn / tittel', { placeholder: 'Navn / verneombud' }),
      half('Sted'),
      halfDate('Dato'),
      sign('Signatur ansattes representant'),
    ],
  };
}

function verneombudsavtale() {
  return {
    title: 'Avtale om at det ikke etableres verneombudsordning',
    layout: 'brev',
    fields: [
      locked('Virksomhetens navn', '{{firma}}', { width: 'half' }),
      locked('Organisasjonsnummer', '{{orgnr}}', { width: 'half' }),
      locked('Adresse', '{{adresse}}'),
      note('Denne avtalen er inngått mellom samtlige arbeidstakere og ledelsen i virksomheten.'),
      note('Avtalen innebærer at det ikke velges verneombud i virksomheten, jf. arbeidsmiljøloven § 6-1 første ledd. Unntaket gjelder bare virksomheter med færre enn ti arbeidstakere. Arbeidstilsynet kan bestemme at virksomheten likevel skal ha verneombud.'),
      note('Avtalen forutsetter at arbeidstakerne og ledelsen samarbeider om vernetjenesten i den daglige driften.'),
      halfDate('Avtalen gjelder fra', { required: true }),
      halfDate('Avtalen gjelder til', { help: 'Avtalen har en gyldighet på 2 år.' }),
      title('Signatur for alle arbeidstakere'),
      table('Arbeidstakere', [['text', 'Navn', 5], ['date', 'Dato', 2], ['text', 'Signatur', 5]], blanks(8)),
      title('For ledelsen'),
      half('Daglig leder', { required: true }),
      half('Sted'),
      halfDate('Dato'),
      sign('Signatur daglig leder'),
    ],
  };
}

function miljofyrtarnTiltak() {
  return {
    title: 'Tiltak til forbedringsforslag – Miljøfyrtårn',
    layout: 'skjema',
    fields: [
      title('Gjennomgang av idébanken'),
      locked('Virksomhet', '{{firma}}', { width: 'half' }),
      half('Bransje / kriteriesett', { placeholder: 'For eksempel prosjekterende (arkitekter og rådgivende ingeniører)' }),
      halfDate('Dato for gjennomgang', { required: true }),
      half('Gjennomgått av', { placeholder: '{{bruker}}' }),
      table('Tiltak virksomheten vurderer', [
        ['fixed', 'Tiltak', 3], ['fixed', 'Beskrivelse', 6], ['mark', 'Vurdering', { options: ['Ja', 'Nei', 'Utført'] }], ['text', 'Ansvarlig', 3], ['date', 'Frist', 2],
      ], [
        '# Arbeidsmiljø',
        ['Studentoppgaver', 'Inngå samarbeid med et universitet eller en høyskole og tilby studenter å skrive master- eller bacheloroppgave om et tema virksomheten arbeider med.'],
        ['Kosthold', 'Tilby de ansatte frukt og grønt ukentlig, og ha fokus på å servere sunn mat.'],
        ['Rolleavklaringer', 'Etabler rolleavklaringer for å sikre at ansatte har eierskap og opplever ansvar knyttet til sine arbeidsoppgaver.'],
        '# Avfall',
        ['Markedsmateriell', 'Reduser mengden papirbasert markedsmateriell, og motta produktkataloger og tidsskrifter mest mulig elektronisk.'],
        ['Vareinnkjøp', 'Prioriter vareinnkjøp i store forpakninger.'],
        '# Energi',
        ['Samme kaffekopp', 'Oppfordre de ansatte til å bruke samme kaffekopp hele dagen.'],
        ['Innetemperatur', 'Sørg for at innetemperaturen er 21,5 grader ved normal brukstid, og juster ned temperaturen i helger og ferier.'],
        '# Innkjøp',
        ['Profileringsartikler', 'Unngå profileringsartikler som har begrenset verdi for mottaker, altså ting som aldri blir brukt eller som går fort i stykker.'],
        ['Unngå tropisk tømmer', 'Unngå møbler, byggevarer, gulv og andre produkter med tropisk tømmer. Spør leverandøren hvor tømmeret kommer fra.'],
        '# Transport',
        ['Sykkelvennlig arbeidsplass', 'Tilrettelegg for en sykkelvennlig arbeidsplass.'],
        ['Konkurranser', 'Gjennomfør skrittellerkonkurranser, «sykle til jobben»-aksjon og lignende.'],
        '# Annet',
        ['Krav til valg av bank', 'Krev at banken anerkjenner miljøinnsats og prioriterer lån til bedrifter med god miljøprofil.'],
      ], { legend: 'Nye tiltak legges til nederst. Tiltak som vedtas, kan følges opp i ISO / K-HMS › Miljø.' }),
    ],
  };
}

function leverandorKartlegging() {
  return {
    title: 'Kartlegging av leverandørers miljøstatus',
    layout: 'skjema',
    fields: [
      title('Miljøstatus leverandører'),
      locked('Virksomhet', '{{firma}}', { width: 'half' }),
      half('Revidert av', { placeholder: '{{bruker}}' }),
      halfDate('Sist revidert', { required: true }),
      note('Legg inn de vesentlige leverandørene, både tjenester og varer. Sjekk om leverandøren har miljøsertifisering, for eksempel i Miljøfyrtårns register over sertifiserte virksomheter, på leverandørens nettside eller ved å spørre leverandøren direkte.'),
      table('Leverandører', [
        ['text', 'Leverandør', 4], ['check', 'ISO 14001', 1], ['check', 'EMAS', 1], ['check', 'Miljøfyrtårn', 1], ['check', 'Svanemerket', 1], ['check', 'Ingen', 1], ['mark', 'Innkjøp', { options: ['Vare', 'Tjeneste'] }], ['text', 'Hva slags produkter?', 3], ['text', 'Kommentar', 3],
      ], blanks(8), { legend: 'Summen av leverandører med og uten miljøsertifisering brukes i den årlige klima- og miljørapporten. Leverandører kan også evalueres i ISO / K-HMS › Leverandører.' }),
    ],
  };
}

function miljofyrtarnAnsvarlig() {
  return {
    title: 'Oppgaver og ansvar for miljøfyrtårnansvarlig',
    layout: 'brev',
    fields: [
      title('Hovedoppgaver og hovedansvar'),
      note('1. Lede miljøarbeidet, herunder:\n• Planlegge, informere og gjennomføre miljøtiltak, inkludert intern opplæring i ytre miljø.\n• Forberede, gjennomføre og følge opp resertifisering hvert tredje år.\n• Være virksomhetens ressursperson på miljø, og miljøansvarlig utad.\n• Holde HMS- og miljøstyringssystemet oppdatert.\n• Ha ansvar for intern informasjon og dokumenter i Miljøfyrtårnportalen.'),
      title('Viktige deloppgaver og ansvar'),
      note('a) Årlig klima- og miljørapportering før 1. april:\n• Lage utkast til den årlige klima- og miljørapporten. Innhente data, beskrive gjennomførte tiltak og foreslå handlingsplan for kommende år med tilhørende miljømål.\n• Legge rapportutkastet fram for ledelsens godkjenning. Har virksomheten arbeidsmiljøutvalg, behandles rapporten der før endelig godkjenning.'),
      note('b) Bidra til kontinuerlig forbedring:\n• Samle miljøgruppen to ganger i året (høst og vår) for å gå gjennom status for miljømål, handlingsplaner og gjennomførte tiltak. Melde endringsforslag og avvik til ledelsen.'),
      note('c) Intern informasjon til medarbeiderne:\n• Den årlige klima- og miljørapporten.\n• Nyhetsbrevene fra Stiftelsen Miljøfyrtårn.\n• Sertifiseringsrapporter.'),
      half('Miljøfyrtårnansvarlig', { required: true }),
      half('Sted'),
      halfDate('Dato', { required: true }),
      sign('Daglig leder'),
      sign('Miljøfyrtårnansvarlig'),
    ],
  };
}

function branninstruks() {
  return {
    title: 'Branninstruks',
    layout: 'brev',
    fields: [
      note('1. VARSLE\n2. EVAKUERE\n3. SLOKKE'),
      table('Nødnummer', [['fixed', 'Kontakt', 4], ['fixed', 'Telefonnummer', 3]], [['Brannvesen', '110'], ['Politi', '112'], ['Ambulanse', '113']], { allowAdd: true, legend: 'Legg til vaktselskap, byggeier eller andre kontakter nederst.' }),
      text('Møteplass', { required: true, placeholder: 'For eksempel ute nord for hovedinngangen' }),
      half('Gjelder lokaler', { placeholder: '{{adresse}}' }),
      half('Brannvernleder'),
      note('Husk når du ringer:\n• Hvor ringer jeg fra?\n• Hva er navnet mitt?\n• Hva har skjedd?\n• Hvor skal brannvesen, politi eller ambulanse møte?\n• Annet som er viktig?'),
      halfDate('Sist oppdatert'),
    ],
  };
}

function avfallsinstruks() {
  return {
    title: 'Avfallsinstruks',
    layout: 'brev',
    fields: [
      note('Alle har ansvar for å kildesortere og for å tømme beholderne ved behov. Tilpass behandlingen til lokalene, og skriv inn hvor beholderne står.'),
      table('Avfall', [['fixed', 'Avfall', 3], ['fixed', 'Eksempler', 5], ['text', 'Behandling og ansvar', 6]], [
        ['Papir og papp', 'Papp og kartonger, aviser og blader, konvolutter, reklame. Julepapir, gavepapir og servietter er restavfall.', 'Samles i miljøeskene på kontorene. Full eske tømmes i beholderen for papp og papir. Alle har ansvar for å kildesortere og tømme.'],
        ['EE-avfall', 'Lamper, ledninger, lysrør, sparepærer og annet elektrisk og elektronisk utstyr.', 'Samles og leveres til miljøstasjonen for forsvarlig avhending. Alle har ansvar for innsamling og håndtering.'],
        ['Farlig avfall', 'Maling, beis, lim og lakk, løsemidler, rengjøringsmidler, batterier, CD- og DVD-plater.', 'Kan selv i små mengder skade mennesker, dyr og natur. Leveres til miljøstasjonen. Alle har ansvar for innsamling og håndtering.'],
        ['Restavfall', 'Papir som ikke er rent, uren emballasje og avfall som ikke sorteres etter denne instruksen.', 'Kastes i beholderne for blandet avfall. Alle har ansvar for å tømme ved behov.'],
        ['Glass og metall', 'Glassflasker og hermetikkbokser.', 'Kastes i egen container på miljøstasjonen. Alle har ansvar for å tømme ved behov.'],
        ['Matavfall', 'Mat- og fruktrester, kaffegrut. Dette er det dyreste avfallet, så vi bør ha minst mulig av det.', 'Kastes i egen beholder for våtorganisk avfall.'],
      ], { allowAdd: true, legend: 'Farlig avfall og EE-avfall leveres til godkjent mottak (miljøstasjon). Skriv inn hvor beholderne står i lokalene.' }),
      halfDate('Sist oppdatert'),
      half('Ansvarlig'),
    ],
  };
}

function instruksArbeidsutstyr() {
  return {
    title: 'Instruks for bruk av arbeidsutstyr',
    layout: 'brev',
    fields: [
      table('Rekkefølge', [['fixed', 'Nr', 1], ['fixed', 'Ansvarlig', 2], ['fixed', 'Aktivitet', 9]], [
        ['1', 'Daglig leder', 'Sørge for at nødvendig sikkerhetsopplæring er gitt dem som skal utføre arbeidet.'],
        ['2', 'Ansatt', 'Utføre arbeidet i tråd med de påbud og instruksjoner som er gitt. Alltid gjøre en enkel HMS-vurdering før arbeidet starter: kryssende interesser, gnister, fallmuligheter, bruk av kjemikalier, lakk osv.'],
        ['3', 'Ansatt', 'Melde fra om feil og mangler ved utstyret, og eventuelt rette dem straks. Avvik meldes i ProTop (ISO / K-HMS › Avvik og forbedring).'],
        ['4', 'Daglig leder', 'Følge opp at de ansatte bruker arbeidsutstyret forsvarlig og bruker nødvendig verneutstyr. Avvik dokumenteres.'],
        ['5', 'Daglig leder', 'Kalle inn til samtale ansatte som ikke utfører arbeidet i tråd med instruksen. Undersøke hva som kan gjøres for å rette opp forholdet, og gjøre klart at fortsatt brudd på instruksen er likestilt med brudd på arbeidsavtalen. Samtalen dokumenteres i HR.'],
      ], { allowAdd: false }),
      halfDate('Sist gjennomgått'),
      half('Godkjent av'),
    ],
  };
}

function taushetserklaering() {
  return {
    title: 'Taushetserklæring',
    layout: 'brev',
    fields: [
      note('For personer som er ansatt i eller utfører arbeid for {{firma}}.'),
      half('Navn', { required: true }),
      locked('Firma', '{{firma}}', { width: 'half' }),
      halfDate('Fødselsdato', { help: 'Fødselsnummer skal ikke skrives her.' }),
      half('Stilling'),
      note('Selskapet behandler en rekke typer informasjon, blant annet opplysninger om selskap, konsern, kunder, prosjekter, tekniske innretninger og fremgangsmåter, samt drifts- eller forretningsforhold som det vil være av konkurransemessig betydning å hemmeligholde av hensyn til den opplysningen angår.'),
      note('Dersom jeg gjennom arbeid for {{firma}} får kjennskap til slik informasjon, forplikter jeg meg til ikke å bruke, utlevere eller på annen måte gjøre denne kunnskapen tilgjengelig for uvedkommende, internt eller eksternt, og ikke bruke den til andre formål enn oppgavene som er avtalt med {{firma}}.'),
      note('Arbeidstaker er forpliktet til å bevare taushet om sensitive opplysninger vedkommende får kjennskap til i arbeidet. Sensitive opplysninger omfatter blant annet:\n• Strategiske opplysninger om konsern og selskap\n• Resultater, rapporter, fakturaer, avtaler, underlagsdokumentasjon, planer, forretningsmessige analyser og forretningshemmeligheter\n• Opplysninger om lønn, godtgjørelser, inntekter og utgifter, budsjett og kalkyler\n• Opplysninger om produktutvikling og markedsføringstiltak\n• Hvem som er kunder i selskapet\n• Opplysninger om kunder og kunders virksomhet\n• Opplysninger om oppdrag, leietakere og prosjektinformasjon\n• Personopplysninger om ansatte i selskapet\n• Andre opplysninger som er definert som taushetsbelagte eller som har karakter av forretningshemmelighet'),
      note('Taushetsplikten gjelder overfor personer som ikke er ansatt i selskapet. Den gjelder også overfor andre ansatte i selskapet (eventuelt konsernet), med mindre vedkommende trenger opplysningen for å utføre arbeidet.'),
      note('Taushetsbelagte opplysninger skal bare oppbevares utenfor bedriften i den grad det er nødvendig for å løse en bestemt arbeidsoppgave. Opplysningene skal oppbevares forsvarlig og bringes tilbake så snart oppgaven er løst, om ikke annet er avtalt. Er det tvil om hva som omfattes av taushetsplikten, avgjør nærmeste leder spørsmålet.'),
      note('Arbeidstaker har plikt til å være lojal mot bedriften, slik at bedriftens gode navn og rykte ikke blir skadet. Ingen skal uttale seg til media på vegne av bedriften uten at det er klarert med ledelsen. Arbeidstaker skal ikke påta seg lønnet arbeid eller tillitsverv som går ut over arbeidet, og skal ikke engasjere seg i konkurrerende virksomhet innenfor bedriftens virksomhetsområde.'),
      note('Taushetsplikten gjelder også etter at arbeidsforholdet er avsluttet. Brudd på taushetsplikten kan blant annet føre til oppsigelse, erstatningsansvar og straffeansvar, jf. forretningshemmelighetsloven og straffeloven §§ 207 og 209.'),
      title('Sikkerhetsgradert informasjon'),
      note('{{firma}} arbeider tidvis med kunder og prosjekter som er sikkerhetsgradert.\n• Jeg forplikter meg til å bevare taushet om sikkerhetsgradert informasjon etter sikkerhetsloven, og er kjent med at mottak og håndtering av slik informasjon krever sikkerhetsklarering.\n• Jeg erklærer at jeg vil lese og sette meg inn i regelverket og dokumentene det blir vist til i forbindelse med slike oppdrag.\n• Jeg er innforstått med at brudd på forpliktelsene kan føre til straffansvar, utestengelse fra oppdraget og erstatningsansvar.'),
      title('Offentlige oppdrag'),
      note('Jeg er kjent med taushetsbestemmelsene i forvaltningsloven § 13 og forskrift om offentlige anskaffelser § 7-4, og plikter å følge dem. Enhver som utfører tjeneste eller arbeid for et forvaltningsorgan, plikter å hindre at andre får adgang eller kjennskap til det vedkommende i forbindelse med tjenesten eller arbeidet får vite om 1) noens personlige forhold, eller 2) tekniske innretninger og fremgangsmåter samt drifts- eller forretningsforhold som det vil være av konkurransemessig betydning å hemmeligholde av hensyn til den opplysningen angår.'),
      note('Denne taushetserklæringen er underlagt norsk rett. Taushetsplikten gjelder uten tidsbegrensning, eventuelt til {{firma}} har løst meg fra den. Jeg har lest og forstått taushetserklæringen og forplikter meg til å overholde den.'),
      half('Sted', { required: true }),
      halfDate('Dato', { required: true }),
      sign('Signatur arbeidstaker'),
      sign('Signatur for {{firma}}'),
    ],
  };
}

function nyansatt() {
  const items = [
    '# Før oppstart',
    'Ansettelsestilbud signert',
    'Arbeidsplass tilrettelagt (kontor)',
    'Bestille ny brukerprofil og tilganger. Kontroller at den ansatte bare får tilgang til det stillingen trenger',
    'Opprette personen i ProTop (Ansatte) og sende invitasjon',
    'Bestille pc, dokkingstasjon, skjermer, mus og tastatur',
    'Bestille kontorrekvisita',
    'Bestille visittkort',
    'Orientere regnskapsfører om nyansatt og betingelser',
    'Tilpasse CV og referanseprosjekter til selskapets profil',
    'Informasjon sendt til kolleger',
    'Implementere personlig e-postsignatur',
    'Legge inn bruker i delte postbokser og felles mapper',
    'Invitere den ansatte til faste møter',
    '# Første arbeidsdag',
    'Arbeidsavtale signert (HR › Avtaler)',
    'Gjennomgang av kvalitetssystemet (ISO / K-HMS)',
    'Gjennomgang av personalhåndboken, med lesebekreftelse (HR › Personalhåndbok)',
    'Taushetserklæring signert',
    'Introduksjon til arbeidsplass, lokaler, fasiliteter og rutiner',
    'Informasjon om verneombud, beredskap og branninstruks',
    'Presentasjon av personalet',
    'Innføring i timeregistrering',
    'Bestille arbeidsklær og verneutstyr (jakke med logo, hjelm, vernesko)',
    'Melde inn i pensjons- og forsikringsordning',
    'Avklare telefonnummer (videreføre eget eller nytt)',
    'Pårørendeskjema fylt ut',
    '# I løpet av første arbeidsuke',
    'Bilde av den ansatte',
    'Bestille adgangskort',
    'Bestille HMS-kort / byggeplasskort (bilde, signatur og kopi av legitimasjon)',
    'Orientering om faste rutiner og gjøremål',
    'Delt møterom, poolbil og lignende',
    'Arkiveringsrutiner og navngiving av filer (ÅÅMMDD)',
    'Gjennomgang av dokumentstruktur, arbeidsmetodikk og rutiner',
    'Gjennomgang av e-postrutiner: arkivering, kategorisering, flagg og delt kalender',
    'Utfyllende informasjon om arbeidsplassens og stillingens hovedoppgaver',
    'Opplæring i dataprogrammer',
    'Gjennomgang av nødvendige kurs (registreres i ISO / K-HMS › Kompetanse)',
    'Avsatt tid til oppfølgingssamtaler i prøvetiden (Oppfølgingsplan nyansatt)',
    'Ferdigstilt CV og prosjektreferanser',
  ];
  return {
    title: 'Sjekkliste nyansatt (introduksjonsprogram)',
    layout: 'skjema',
    fields: [
      title('Om den ansatte'),
      half('Navn', { required: true }),
      half('Ansattnummer'),
      half('Privat e-post'),
      half('Privat telefon'),
      half('Adresse'),
      half('Postnr. og sted'),
      half('Pårørende'),
      half('Telefon pårørende'),
      note('Fødselsnummer og kontonummer registreres på personkortet under Ansatte, med begrenset tilgang. De skal ikke stå i sjekklisten.'),
      title('Ansettelsesforhold'),
      halfDate('Kontraktsdato'),
      halfDate('Tiltredelsesdato', { required: true }),
      half('Stilling'),
      half('Nærmeste leder'),
      half('E-post arbeid'),
      half('Telefon arbeid'),
      title('Sjekkpunkter'),
      table('Sjekkpunkter', [
        ['fixed', 'Pos', 1], ['fixed', 'Sjekkpunkt', 8], ['text', 'Status/merk', 4], ['mark', 'J/N/I', { options: JNI }],
      ], numbered(items), { legend: 'J = Gjennomgått og forstått/utført · N = Gjennomgått, men krever videre oppfølging (skriv kommentar) · I = Ikke relevant for arbeidstakeren' }),
      sign('Signatur for {{firma}}'),
      sign('Signatur nyansatt'),
    ],
  };
}

function oppfolgingsplan() {
  return {
    title: 'Oppfølgingsplan nyansatt',
    layout: 'skjema',
    fields: [
      note('Nærmeste leder skal i prøvetiden (de første 6 månedene) ha jevnlige evalueringer med den nyansatte. Normalt gjøres dette etter 1, 3 og 5 måneder. Bruk ett skjema per samtale.'),
      title('Om den ansatte'),
      half('Navn', { required: true }),
      half('Ansattnummer'),
      halfDate('Tiltredelsesdato'),
      half('Stilling'),
      half('Avdeling'),
      half('Nærmeste leder'),
      choice('Samtale', ['Etter 1 måned', 'Etter 3 måneder', 'Etter 5 måneder', 'Annen'], { width: 'half', required: true }),
      halfDate('Dato for samtalen', { required: true }),
      title('Samtalen'),
      table('Sjekkpunkter', [['fixed', 'Pos', 1], ['fixed', 'Sjekkpunkt', 6], ['long', 'Status/merk', 7]], numbered([
        '# Klargjøring',
        'Er alt det praktiske rundt arbeidsplassen på plass?',
        'Trives du i firmaet og i avdelingen?',
        'Er rutinene klare?',
        '# Forutsetninger',
        'Er opplæringen kommet ordentlig i gang?',
        'Er det klart hva som er dine arbeidsoppgaver og ditt ansvarsområde?',
        'Forslag til forbedring og endringer?',
        'Er det noe jeg som din nærmeste leder kan gjøre?',
        '# Vurdering',
        'Vurdering av resultatet av arbeidet: hva er bra, og hva er mindre bra? Eventuelle avvik skal påpekes, og det skal gå tydelig fram hva som kan forventes.',
        'Hvilke tiltak og mål skal settes i verk før neste møte?',
        '# Oppfølging – hva skjer videre?',
        'Opplæringstiltak',
        'Tilrettelegging',
        'Øvrige tiltak',
        'Tidspunkt for neste møte',
        'Annet',
      ]), { allowAdd: false }),
      sign('Signatur arbeidsgiver'),
      sign('Signatur arbeidstaker'),
    ],
  };
}

function medarbeidersamtale() {
  const tema = [
    ['1.', 'Oppfølging av forrige samtales handlingsplan\n• Hva er gjennomført?\n• Hva er ikke gjennomført, og hvorfor?\n• Skal tiltak som ikke er gjennomført, overføres til neste plan eller slettes?'],
    ['2.', 'Mål og resultat\n• Hva er de viktigste målene for stillingen din, og hvilke resultater er oppnådd?\n• Drøfting av de viktigste målene for bedriften og avdelingen, og i hvilken grad de er nådd.\n• Bidrar målene for stillingen din til målene for bedriften? Hvordan?\n• Vurder resultatene opp mot mål og forventninger.\n• Har du forslag til forbedringstiltak eller endrede mål?'],
    ['3.', 'Arbeidsmetoder og arbeidsmengde\n• Har du innflytelse på din egen arbeidssituasjon?\n• Ønsker du endringer: flere eller færre oppgaver, andre typer oppgaver?\n• Har du forslag til bedre rutiner eller kvalitetssikring?'],
    ['4.', 'Kompetanseutvikling og faglig utvikling\n• Har du ønsker eller behov for læring og utvikling? Hvilke?\n• Trenger du mer eller annen kompetanse for å utføre arbeidet?\n• Fører endrede oppgaver eller omstilling til behov for annen kompetanse?\n• Har arbeidsgiver behov for mer eller annen kompetanse?\n• Tiltak: kurs, studier, kollegaveiledning, hospitering, jobbrotasjon. Hva kan gjennomføres før neste samtale?'],
    ['5.', 'Arbeidsmiljøet\n• Hvordan er samarbeidet med kollegene?\n• Hvordan er samarbeidet mellom leder og medarbeider?\n• Får du informasjonen du trenger for å fungere i jobben?\n• Får du konstruktive tilbakemeldinger fra lederen din?\n• Har du forslag til forbedringer av arbeidsmiljøet?'],
    ['6.', 'Andre tema som ønskes tatt opp'],
  ];
  return {
    title: 'Medarbeidersamtale',
    layout: 'skjema',
    fields: [
      title('Om samtalen'),
      half('Medarbeider', { required: true }),
      half('Ansatt siden', { kind: 'date' }),
      half('Leder', { required: true, placeholder: '{{bruker}}' }),
      halfDate('Dato for samtalen', { required: true }),
      note('Alle ansatte skal ha medarbeidersamtale minst én gang i året. Nyansatte skal ha samtale i løpet av de seks første månedene. Samtalen er planlagt, strukturert og fortrolig, og gjennomføres i gjensidig respekt mellom likeverdige, men ikke likestilte parter. Leder kan ikke delegere medarbeidersamtaler.'),
      note('Forberedelse: Tidspunkt avtales én til to uker før. Skjemaet deles ut i god tid, slik at begge kan forberede seg. Sett av nok tid, og sørg for et uforstyrret rom.\nEtterarbeid: Samtalen skal munne ut i en forpliktende handlingsplan som begge signerer. Leder gir snarest mulig tilbakemelding på beslutninger som har betydning for oppfølgingen.'),
      title('Tema'),
      table('Tema', [['fixed', 'Pos', 1], ['fixed', 'Tema', 6], ['long', 'Før samtalen (notater)', 5], ['long', 'Under samtalen (notater)', 5]], tema, { allowAdd: false }),
      title('Handlingsplan'),
      note('Partene er i medarbeidersamtalen blitt enige om følgende tiltak, endringer og forbedringer:'),
      table('Handlingsplan', [['fixed', 'Pos', 1], ['long', 'Tiltak', 8], ['text', 'Ansvar', 3], ['date', 'Frist', 2]], [['1.'], ['2.'], ['3.'], ['4.']]),
      sign('Signatur for {{firma}}'),
      sign('Signatur medarbeider'),
    ],
  };
}

/* ───────── Katalog ───────── */

const MAL = (key, ref, group, build, summary, extra = {}) => ({ key, ref, group, kind: 'mal', build, summary, ...extra });
const SYS = (key, ref, group, title, target, summary) => ({ key, ref, group, kind: 'system', title, target, summary });

export const KS_LIBRARY = [
  MAL('brev', 'C1-E-05-001', 'generelt', brev, 'Brevmal med mottaker, prosjekt, saksbehandler og signatur.'),
  MAL('motereferat', 'C1-E-05-002', 'generelt', motereferat, 'Møtereferat med deltakerliste, saker, ansvarlig og frist.'),
  MAL('sjekkliste', 'C1-E-03-001', 'generelt', sjekklisteGenerell, 'Generell sjekkliste med lokasjon, ansvar og J/N/I.'),
  MAL('hms-aarlig', 'C1-B-03-001', 'hms', hmsAarlig, 'Årlig gjennomgang av HMS-systemet med signatur fra leder og ansattes representant.'),
  MAL('el-kontroll', 'C1-B-03-002', 'hms', elKontroll, '33 sjekkpunkter for elektriske installasjoner, gruppert.'),
  MAL('sja', 'C1-B-03-003', 'hms', sja, 'Sikker Jobb Analyse med 38 sjekkpunkter, deltakere og tiltak.'),
  MAL('vernerunde', 'C1-B-03-004', 'hms', vernerunde, 'Intern vernerunde med deltakere og sjekkpunkter i sju områder.'),
  MAL('handlingsplan', 'C1-B-03-006', 'hms', handlingsplan, 'Hva, hvordan, når og hvem, med kvittering når tiltaket er avsluttet.'),
  MAL('verneutstyr', 'C1-B-03-007', 'hms', verneutstyr, 'Påbudt verneutstyr per arbeidsoppgave.'),
  MAL('hms-egenerklaering', 'C1-B-01-005', 'hms', hmsEgenerklaering, 'Egenerklæring til oppdragsgivere. Firmaopplysninger fylles fra bedriftsprofilen.'),
  MAL('verneombudsavtale', 'C1-B-01-006', 'hms', verneombudsavtale, 'Avtale etter arbeidsmiljøloven § 6-1 for virksomheter under ti ansatte.'),
  MAL('branninstruks', 'C1-B-02-004', 'hms', branninstruks, 'Varsle, evakuere, slokke. Nødnummer og møteplass for oppslag.'),
  MAL('instruks-arbeidsutstyr', 'C1-B-02-003', 'hms', instruksArbeidsutstyr, 'Ansvar og rekkefølge ved bruk av arbeidsutstyr.'),
  MAL('innkjop', 'C1-B-03-008', 'miljo', innkjop, 'Miljøkrav ved innkjøp og valg av leverandør.'),
  MAL('avfallsinstruks', 'C1-D01-002', 'miljo', avfallsinstruks, 'Sortering, behandling og ansvar per avfallstype.'),
  MAL('miljofyrtarn-tiltak', 'C1-B-01-008', 'miljo', miljofyrtarnTiltak, 'Tiltak fra Miljøfyrtårns idébank med vurdering, ansvar og frist.'),
  MAL('leverandor-miljo', 'C1-D-01-003', 'miljo', leverandorKartlegging, 'Miljøsertifisering hos vesentlige leverandører.'),
  MAL('miljofyrtarn-ansvarlig', 'C1-F-03-004', 'miljo', miljofyrtarnAnsvarlig, 'Rollebeskrivelse med signatur fra daglig leder og miljøfyrtårnansvarlig.'),
  SYS('parorende', 'C1-C-01-002', 'personal', 'Pårørendeskjema', { tab: 'ansatte', label: 'Ansatte › Min side' }, 'Den ansatte fyller inn pårørende selv på profilen. Mangler det, får hen en oppgave med varsel og påminnelse.'),
  MAL('taushetserklaering', 'C1-C-01-003', 'personal', taushetserklaering, 'Taushetserklæring med sikkerhetsgradert informasjon og offentlige oppdrag.', { hr: true }),
  MAL('nyansatt', 'C1-F-02-003', 'personal', nyansatt, 'Introduksjonsprogram: før oppstart, første dag og første uke.', { hr: true }),
  MAL('oppfolgingsplan', 'C1-F-02-004', 'personal', oppfolgingsplan, 'Samtaler i prøvetiden etter 1, 3 og 5 måneder.', { hr: true }),
  MAL('medarbeidersamtale', 'C1-F-03-001', 'personal', medarbeidersamtale, 'Tema før og under samtalen, og en signert handlingsplan.', { hr: true }),
  SYS('personalhandbok', 'C1-C-01-001', 'personal', 'Personalhåndbok', { tab: 'hr', subView: 'handbok', label: 'HR › Personalhåndbok' }, 'Kapitler som kan redigeres, med versjon og lesebekreftelse fra hver ansatt.'),
  SYS('likestilling', 'C1-KS', 'personal', 'Retningslinjer for likestilling, mangfold og inkludering', { tab: 'hr', subView: 'handbok', label: 'HR › Personalhåndbok' }, 'Eget kapittel i personalhåndboken.'),
  SYS('egenmelding', 'C1-C-01-004', 'personal', 'Egenmelding ved sykdom', { tab: 'arbeid', subView: 'fravaer', label: 'Fravær' }, 'Egenmelding og sykt barn registreres som fravær, med regler for antall dager.'),
  SYS('medarbeidere', 'C1-B-01-003', 'personal', 'Bedriftens medarbeidere', { tab: 'ansatte', label: 'Ansatte' }, 'Ansatteregisteret erstatter listen. Tiltredelse, stilling og status står på personkortet.'),
  SYS('parorendeliste', 'C1-B-01-004', 'personal', 'Bedriftens pårørende', { tab: 'ansatte', label: 'Ansatte' }, 'Pårørende står på personkortet, synlig bare for administrator og den ansatte.'),
  SYS('organisasjonskart', 'C1-B-01-002', 'personal', 'Organisasjonskart med erfaring', { tab: 'iso', subView: 'organisasjon', label: 'ISO / K-HMS › Organisasjon og roller' }, 'Organisasjonskartet bygges av rollene i ISO. Innehaverne velges blant de ansatte, og utdanning og erfaring hentes fra CV.'),
  SYS('kompetansematrise', 'C1-F-02-005', 'personal', 'Kompetansematrise', { tab: 'iso', subView: 'kompetanse', label: 'ISO / K-HMS › Kompetanse' }, 'Krav per rolle og bevis med gyldighet. Matrisen varsler når noe går ut.'),
  SYS('avviksrapport', 'C1-B-03-005', 'hms', 'Avviksrapport / RUH', { tab: 'iso', subView: 'avvik', label: 'ISO / K-HMS › Avvik og forbedring' }, 'Avvik, RUH og endring i KS-systemet meldes og behandles i avviksregisteret, med varsel, årsak og tiltak.'),
  SYS('risikovurdering', 'C1-B-02-005', 'hms', 'Kartlegging og risikovurdering HMS og ytre miljø', { tab: 'iso', subView: 'risiko', label: 'ISO / K-HMS › Risiko' }, 'Risikoregister med sannsynlighet, konsekvens, tiltak og handlingsplan.'),
  SYS('lover', 'C1-B-01-007', 'styring', 'Oversikt over relevante lover og forskrifter', { tab: 'iso', subView: 'lovkrav', label: 'ISO / K-HMS › Lovkrav og samsvar' }, 'Lovregister med kontrolldato og vurdering av samsvar.'),
  SYS('internkontroll', 'C1-B-01-001', 'styring', 'Internkontrollhåndbok og rutiner for HMS', { tab: 'iso', subView: 'dokumenter', label: 'ISO / K-HMS › Dokumenter' }, 'Styrte dokumenter med versjon, godkjenning og lesebekreftelse.'),
  SYS('kvalitetshandbok', 'C1-E-01-001', 'styring', 'Kvalitetshåndbok', { tab: 'iso', subView: 'dokumenter', label: 'ISO / K-HMS › Dokumenter' }, 'Styrte dokumenter med versjon, godkjenning og lesebekreftelse.'),
  SYS('verneombud', 'C1-B-02-001', 'hms', 'Verneombud', { tab: 'iso', subView: 'hms', label: 'ISO / K-HMS › HMS' }, 'Verneombudets rolle og oppgaver.'),
  SYS('samfunnsansvar', 'C1-D-01-001', 'styring', 'Politikk for samfunnsansvar og etiske retningslinjer', { tab: 'iso', subView: 'dokumenter', label: 'ISO / K-HMS › Dokumenter' }, 'Policy som alle ansatte leser og bekrefter.'),
  SYS('reisepolitikk', 'C1-B-02-006', 'miljo', 'Reisepolitikk', { tab: 'iso', subView: 'dokumenter', label: 'ISO / K-HMS › Dokumenter' }, 'Policy for miljøvennlige reiser.'),
  SYS('ledelsens-gjennomgang', 'C1-E-04-001', 'styring', 'Rapport fra ledelsens gjennomgang', { tab: 'iso', subView: 'ledelse', label: 'ISO / K-HMS › Ledelsens gjennomgang' }, 'Planlegges, gjennomføres og dokumenteres i ISO-modulen.'),
  SYS('dokumentliste', 'C1-A-01-001', 'styring', 'Dokumentliste internt og eksternt', { tab: 'iso', subView: 'dokumenter', label: 'ISO / K-HMS › Dokumenter' }, 'Dokumentregisteret erstatter listene.'),
  SYS('oppdragsavtale', 'C1-H-03-001', 'generelt', 'Oppdragsavtale NS 8403', { tab: 'kontrakt', label: 'Avtaler' }, 'Avtalemodulen lager, sender og signerer oppdragsavtalen.'),
];

/**
 * KS-sjekklister og vernerunder der et svar betyr avvik (ISO-17). Tabellen og kolonnene finnes på etiketten,
 * som er fast i malene. ISO viser radene under Avvik, og hver kan bli en sak med ett trykk.
 * type: sakstypen i ISO (farlige forhold fra vernerunde og kontroller er RUH).
 */
export const KS_DEVIATION_MARKS = {
  sjekkliste: { table: 'Sjekkpunkter', column: 'J/N/I', values: ['N'], point: ['Sjekkpunkt', 'Lokasjon', 'Pos'], comment: 'Status/merk', responsible: 'Ansvar', type: 'prosess' },
  'el-kontroll': { table: 'Sjekkpunkter', column: 'J/N/I', values: ['N'], point: ['Sjekkpunkt', 'Pos'], comment: 'Status/merk', responsible: 'Ansvar', type: 'nestenulykke' },
  sja: { table: 'Sjekkpunkter', column: 'Ja/Nei', values: ['Nei'], point: ['Sjekkpunkt', 'Nr'], comment: 'Tekst/tiltak', deadline: 'Frist', type: 'nestenulykke' },
  vernerunde: { table: 'Sjekkpunkter', column: 'Status', values: ['Avvik'], point: ['Sjekkpunkt'], comment: 'Kommentar / tiltak', deadline: 'Tidsfrist', responsible: 'Ansvarlig', type: 'nestenulykke' },
};

function columnId(field, label) {
  return (field?.columns || []).find((c) => String(c.label || '').trim() === label)?.id || '';
}

/**
 * Radene som er merket som avvik i en utfylt KS-sjekkliste (malen i Skjemabygger med libraryKey).
 * Både svar (responses) og det som er fylt ut i selve malen tas med. Hver rad får en fast nøkkel
 * (mal:svar:felt:rad), så den bare kan bli én sak.
 */
export function ksDeviationRows(template) {
  const mark = KS_DEVIATION_MARKS[template?.libraryKey];
  if (!mark) return [];
  const field = (template.fields || []).find((f) => f?.kind === 'table' && String(f.label || '').trim() === mark.table);
  const markCol = columnId(field, mark.column);
  if (!field || !markCol) return [];
  const pointCols = (mark.point || []).map((l) => columnId(field, l)).filter(Boolean);
  const pick = (cells, preset, label) => {
    const id = label ? columnId(field, label) : '';
    return id ? String(cells?.[id] || preset?.[id] || '').trim() : '';
  };
  const sources = [
    { id: 'mal', at: String(template.updatedAt || ''), value: field.value },
    ...(template.responses || []).map((r) => ({ id: r.id, at: String(r.at || ''), value: r.answers?.[field.id] })),
  ];
  const out = [];
  for (const src of sources) {
    if (!src.value || typeof src.value !== 'object') continue;
    for (const row of tableRows({ ...field, value: src.value })) {
      if (row.group) continue;
      const value = String(row.cells?.[markCol] || '').trim();
      if (!mark.values.includes(value)) continue;
      const point = pointCols.map((id) => String(row.cells?.[id] || row.preset?.[id] || '').trim()).filter(Boolean)[0] || 'Sjekkpunkt';
      out.push({
        key: `${template.id}:${src.id}:${field.id}:${row.id}`,
        point,
        mark: value,
        comment: pick(row.cells, row.preset, mark.comment),
        responsible: pick(row.cells, row.preset, mark.responsible),
        deadline: pick(row.cells, row.preset, mark.deadline),
        at: src.at,
        type: mark.type,
      });
    }
  }
  return out;
}

export function libraryEntry(key) {
  return KS_LIBRARY.find((row) => row.key === key) || null;
}

/** Fast id for en installert mal, så den ikke legges inn to ganger. */
export function libraryTemplateId(key) {
  return `ks_${String(key || '').replace(/[^a-z0-9-]/gi, '').toLowerCase()}`;
}

/** Bygg malen i Skjemabygger-format. Felt-id-ene er stabile per mal. */
export function libraryForm(key) {
  const entry = libraryEntry(key);
  if (!entry || entry.kind !== 'mal') return null;
  const built = entry.build();
  const fields = built.fields.map((raw, index) => normalizeBuilderField({
    ...raw,
    id: `${entry.key.replace(/[^a-z0-9]/gi, '')}_${index + 1}`.slice(0, 40),
    value: raw.editor === 'fast' ? raw.value : emptyAnswer(raw.kind),
  })).filter(Boolean);
  return {
    id: '',
    libraryKey: entry.key,
    title: built.title,
    category: built.category || 'skjema',
    intro: built.intro || '',
    cover: '',
    doc: docInfo(entry.ref),
    settings: { ...blankSettings(), layout: built.layout === 'skjema' ? 'skjema' : 'brev', useCompanyLogo: true },
    responses: [],
    fields,
  };
}

export function libraryGroups() {
  return LIBRARY_GROUPS.map((group) => ({
    ...group,
    entries: KS_LIBRARY.filter((row) => row.group === group.id),
  })).filter((group) => group.entries.length);
}

/** Søk på tittel, KS-nummer og beskrivelse. */
export function searchLibrary(query) {
  const needle = String(query || '').trim().toLocaleLowerCase('nb-NO');
  if (!needle) return KS_LIBRARY;
  return KS_LIBRARY.filter((row) => {
    const name = row.kind === 'mal' ? row.build().title : row.title;
    return [name, row.ref, row.summary].some((part) => String(part || '').toLocaleLowerCase('nb-NO').includes(needle));
  });
}

export function entryTitle(entry) {
  if (!entry) return '';
  return entry.kind === 'mal' ? entry.build().title : entry.title;
}
