/**
 * Personalhåndbok i HR: kapitlene som redigeres. Versjoner, godkjenning og
 * lesebekreftelse håndteres av dokumentstyringen (src/doccontrol, nøkkel «handbook»).
 *
 * Tekstformat i kapitlene:
 *   «## Overskrift»  underoverskrift
 *   «• tekst»        punkt i liste (også «- tekst»)
 *   [[verdi]]        bedriftens eget valg som skal bekreftes. Vises med gult til
 *                    klammene fjernes.
 *   {{firma}}        flettefelt fra bedriftsprofilen (se src/forms/tokens.js)
 * Tom linje skiller avsnitt.
 */

const MAX_CHAPTERS = 60;
const BODY_MAX = 20000;
const PLACEHOLDER = /\[\[([^\]]{1,200})\]\]/g;

function text(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

export function newChapterId() {
  return `kap_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeChapter(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const title = text(raw.title, 160);
  if (!title) return null;
  return {
    id: text(raw.id, 60) || `kap_${index + 1}`,
    title,
    body: String(raw.body ?? '').replace(/\r\n/g, '\n').slice(0, BODY_MAX),
  };
}

function normalizeChapters(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .map(normalizeChapter)
    .filter(Boolean)
    .map((row) => {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        return row;
      }
      const id = newChapterId();
      seen.add(id);
      return { ...row, id };
    })
    .slice(0, MAX_CHAPTERS);
}

export function emptyHandbook() {
  return {
    title: 'Personalhåndbok',
    chapters: [],
    changedAt: '',
  };
}

export function normalizeHandbook(raw) {
  const base = emptyHandbook();
  if (!raw || typeof raw !== 'object') return base;
  return {
    title: text(raw.title, 120) || base.title,
    chapters: normalizeChapters(raw.chapters),
    changedAt: text(raw.changedAt, 40),
  };
}

export function handbookHasContent(handbook) {
  return normalizeHandbook(handbook).chapters.length > 0;
}

/** Plassholdere [[…]] som ikke er bekreftet. */
export function openPlaceholders(chapters) {
  const out = [];
  for (const chapter of Array.isArray(chapters) ? chapters : []) {
    for (const match of String(chapter.body || '').matchAll(PLACEHOLDER)) {
      out.push({ chapterId: chapter.id, chapter: chapter.title, value: match[1] });
    }
    for (const match of String(chapter.title || '').matchAll(PLACEHOLDER)) {
      out.push({ chapterId: chapter.id, chapter: chapter.title, value: match[1] });
    }
  }
  return out;
}

export function setChapter(handbook, chapterId, part, { now = new Date() } = {}) {
  const h = normalizeHandbook(handbook);
  return {
    ...h,
    changedAt: now.toISOString(),
    chapters: h.chapters.map((row) => (row.id === chapterId ? { ...row, ...part } : row)),
  };
}

export function addChapter(handbook, { title = 'Nytt kapittel', body = '', after = '' } = {}, { now = new Date() } = {}) {
  const h = normalizeHandbook(handbook);
  const chapter = { id: newChapterId(), title, body };
  const index = after ? h.chapters.findIndex((row) => row.id === after) : -1;
  const chapters = h.chapters.slice();
  chapters.splice(index >= 0 ? index + 1 : chapters.length, 0, chapter);
  return { handbook: { ...h, changedAt: now.toISOString(), chapters: chapters.slice(0, MAX_CHAPTERS) }, chapter };
}

export function removeChapter(handbook, chapterId, { now = new Date() } = {}) {
  const h = normalizeHandbook(handbook);
  return { ...h, changedAt: now.toISOString(), chapters: h.chapters.filter((row) => row.id !== chapterId) };
}

export function moveChapter(handbook, chapterId, delta, { now = new Date() } = {}) {
  const h = normalizeHandbook(handbook);
  const from = h.chapters.findIndex((row) => row.id === chapterId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= h.chapters.length) return h;
  const chapters = h.chapters.slice();
  const [row] = chapters.splice(from, 1);
  chapters.splice(to, 0, row);
  return { ...h, changedAt: now.toISOString(), chapters };
}

/* ───────── Innlesing fra Word eller tekst ───────── */

const TOC_LINE = /\.{4,}\s*\d+\s*$/;
const TOP = /^(\d{1,2})\.?\s+([A-ZÆØÅa-zæøå].{1,100})$/;
const SUB = /^(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)\.?\s+(.{2,120})$/;

function cleanHeading(value) {
  const raw = String(value || '').trim().replace(/\s+/g, ' ');
  if (raw === raw.toUpperCase() && /[A-ZÆØÅ]/.test(raw)) {
    return raw.charAt(0) + raw.slice(1).toLocaleLowerCase('nb-NO');
  }
  return raw;
}

/**
 * Del en eksisterende håndbok i kapitler. «1 Tittel» blir kapittel, «1.2 Tittel» blir underoverskrift.
 * Nummererte linjer rett etter et kolon, eller flere nummererte linjer på rad, er en liste.
 */
export function chaptersFromText(source) {
  const lines = String(source || '').replace(/\r\n/g, '\n').split('\n')
    .map((line) => line.trim())
    .filter((line) => !TOC_LINE.test(line) && !/^innhold(sregister|sfortegnelse|sliste)?:?$/i.test(line));
  const filled = lines.map((line, index) => ({ line, index })).filter((row) => row.line);
  const topAt = (pos) => {
    const row = filled[pos];
    if (!row || SUB.test(row.line)) return null;
    const top = row.line.match(TOP);
    return top && top[2].length <= 80 && !/[.:;,]$/.test(top[2]) ? top : null;
  };
  const listItem = new Set();
  const numberAt = (pos) => Number(topAt(pos)?.[1] || 0);
  for (let pos = 0; pos < filled.length; pos += 1) {
    if (!topAt(pos)) continue;
    const prev = filled[pos - 1]?.line || '';
    const continues = listItem.has(pos - 1) && numberAt(pos) === numberAt(pos - 1) + 1;
    if (/:$/.test(prev) || continues || (topAt(pos + 1) && numberAt(pos + 1) === numberAt(pos) + 1)) listItem.add(pos);
  }
  const chapters = [];
  let current = null;
  let paragraph = [];
  const ensure = () => {
    if (!current) {
      current = { title: 'Innledning', body: [] };
      chapters.push(current);
    }
  };
  const flush = () => {
    if (current && paragraph.length) current.body.push(paragraph.join(' ').replace(/\s+/g, ' ').trim());
    paragraph = [];
  };
  const filledAt = new Map(filled.map((row, pos) => [row.index, pos]));
  lines.forEach((line, index) => {
    if (!line) {
      flush();
      return;
    }
    const pos = filledAt.get(index);
    const top = topAt(pos);
    if (top && !listItem.has(pos)) {
      flush();
      current = { title: cleanHeading(top[2]), body: [] };
      chapters.push(current);
      return;
    }
    const sub = line.match(SUB);
    if (sub && sub[2].length <= 80 && !/[.;,]$/.test(sub[2])) {
      flush();
      ensure();
      current.body.push(`## ${cleanHeading(sub[2])}`);
      return;
    }
    ensure();
    const bullet = line.match(/^(?:[•●▪❖\-–*]|o)\s+(.+)$/) || (listItem.has(pos) && top ? [line, line] : null);
    if (bullet) {
      flush();
      current.body.push(`• ${bullet[1].trim()}`);
      return;
    }
    paragraph.push(line);
  });
  flush();
  return normalizeChapters(chapters.map((row, index) => ({
    id: `kap_${index + 1}`,
    title: row.title,
    body: row.body.join('\n\n').replace(/\n\n(• )/g, '\n$1'),
  })));
}

/* ───────── Visning ───────── */

/** Del kapitteltekst i blokker for visning: overskrift, avsnitt eller liste. */
export function bodyBlocks(body) {
  const blocks = [];
  const parts = String(body || '').replace(/\r\n/g, '\n').split(/\n{2,}/);
  for (const part of parts) {
    const lines = part.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) continue;
    let paragraph = [];
    let list = [];
    const flushParagraph = () => {
      if (paragraph.length) blocks.push({ kind: 'p', text: paragraph.join(' ') });
      paragraph = [];
    };
    const flushList = () => {
      if (list.length) blocks.push({ kind: 'ul', items: list });
      list = [];
    };
    for (const line of lines) {
      if (line.startsWith('## ')) {
        flushParagraph();
        flushList();
        blocks.push({ kind: 'h', text: line.slice(3).trim() });
        continue;
      }
      const bullet = line.match(/^(?:[•\-–*])\s+(.+)$/);
      if (bullet) {
        flushParagraph();
        list.push(bullet[1]);
        continue;
      }
      flushList();
      paragraph.push(line);
    }
    flushParagraph();
    flushList();
  }
  return blocks;
}

/** Del en tekstlinje i biter, der [[…]] er markert som gul plassholder. */
export function placeholderParts(line) {
  const out = [];
  let last = 0;
  const raw = String(line || '');
  for (const match of raw.matchAll(PLACEHOLDER)) {
    if (match.index > last) out.push({ text: raw.slice(last, match.index), mark: false });
    out.push({ text: match[1], mark: true });
    last = match.index + match[0].length;
  }
  if (last < raw.length) out.push({ text: raw.slice(last), mark: false });
  return out;
}

/* ───────── Standardinnhold ───────── */

/** Overtidstillegget kan ikke gjøres avhengig av at kunden betaler (AML § 10-6 (11) og § 1-9). */
const OVERTIME_TEXT = 'Overtid er arbeid utover lovens grenser for alminnelig arbeidstid, som er 9 timer per døgn og 40 timer per uke (arbeidsmiljøloven §§ 10-4 og 10-6). Overtid skal avtales med eller pålegges av nærmeste leder på forhånd. Arbeid utover arbeidstiden som leder har godtatt eller kjent til, er også overtid. Overtidstillegget er minst 40 % av timelønnen, også når timene ikke kan faktureres til oppdragsgiveren.';

/** Vernet gjelder all forsvarlig varsling, ikke bare varsling i god tro (AML § 2 A-4). */
const RETALIATION_TEXT = 'Gjengjeldelse mot den som varsler, er forbudt (arbeidsmiljøloven § 2 A-4).';

/** Kapitler som kom i standardhåndboken etter lovgjennomgangen. Brukes også av lovsjekken. */
const LEGAL_CHAPTERS = {
  varsling: {
    title: 'Varsling av kritikkverdige forhold',
    body: `
Dette er varslingsrutinen i {{firma}} etter arbeidsmiljøloven kapittel 2 A. Virksomheter med minst fem ansatte skal ha en skriftlig rutine, laget i samarbeid med de ansatte og tillitsvalgte (§ 2 A-3). Rutinen er laget sammen med [[tillitsvalgt / de ansatte, dato]].

## Hva du kan varsle om
Alle arbeidstakere har rett til å varsle om kritikkverdige forhold i virksomheten (§ 2 A-1). Det gjelder også innleide, om forhold hos {{firma}}. Kritikkverdige forhold er brudd på lover og regler, på virksomhetens etiske retningslinjer eller på alminnelige etiske normer, for eksempel:
• fare for liv eller helse
• fare for klima eller miljø
• korrupsjon eller annen økonomisk kriminalitet
• myndighetsmisbruk
• uforsvarlig arbeidsmiljø, mobbing og trakassering
• brudd på personopplysningssikkerheten
Uenighet om eget arbeidsforhold er som hovedregel ikke varsling, med mindre forholdet også er kritikkverdig. Ta det opp med nærmeste leder.

## Slik varsler du
Du kan varsle muntlig eller skriftlig, og du kan be om å være anonym. Du kan varsle til:
• nærmeste leder eller daglig leder
• [[varslingsmottaker: navn og e-post]]
• verneombud eller tillitsvalgt
• advokat, for å få råd
• tilsynsmyndigheter eller andre offentlige myndigheter, for eksempel Arbeidstilsynet, Datatilsynet, Økokrim eller politiet
Varsling i samsvar med denne rutinen, eller til tilsynsmyndigheter, er alltid forsvarlig. Varsling til media eller offentligheten er forsvarlig når du er i god tro om innholdet, forholdet har allmenn interesse og du først har varslet internt, eller har grunn til å tro at det ikke ville være hensiktsmessig (§ 2 A-2).

## Hvordan varselet behandles
• Mottakeren bekrefter at varselet er mottatt.
• Varselet undersøkes innen rimelig tid og så konfidensielt som mulig. Bare de som må, får vite hvem som har varslet.
• Den som varslet, får tilbakemelding om hvordan saken følges opp.
• Den det varsles om, får vite hva saken gjelder og får uttale seg.
• Saken dokumenteres og avsluttes skriftlig. Opplysningene slettes når de ikke lenger trengs.

## Vern mot gjengjeldelse
${RETALIATION_TEXT} Gjengjeldelse er for eksempel trusler, trakassering, usaklig forskjellsbehandling, sosial ekskludering, oppsigelse eller endrede arbeidsoppgaver. Den som har varslet, kan kreve oppreisning og erstatning ved gjengjeldelse.
`,
  },
  personvern: {
    title: 'Personvern for ansatte',
    body: `
{{firma}} er behandlingsansvarlig for personopplysninger om de ansatte. Her står hvilke opplysninger vi behandler, hvorfor, hvem som ser dem og hvor lenge de lagres (personvernforordningen artikkel 13).

## Hvilke opplysninger vi behandler
• Navn, kontaktopplysninger, fødselsdato, personnummer og nærmeste pårørende
• Arbeidsavtale, stilling, lønn, skattetrekk og bankkonto
• Timeføring, fravær og ferie. Sykefravær registreres bare som type fravær, aldri med diagnose.
• Kompetanse, kurs, HMS-kort og medarbeidersamtaler
• Bruken av ProTop, se kapitlet om kontrolltiltak

## Hvorfor
Opplysningene trengs for å oppfylle arbeidsavtalen og lovpålagte plikter: lønn og a-melding, regnskap, arbeidsmiljøloven med arbeidstidsregler og HMS, og ferieloven. Noe behandles fordi bedriften har en berettiget interesse, for eksempel fakturering av timer til kunder.

## Hvem som ser opplysningene
Nærmeste leder og den som har ansvar for HR og lønn, ser det de trenger for jobben. [[Regnskapsfører / lønnsbyrå]] behandler lønn på vegne av bedriften. ProTop og andre leverandører er databehandlere og behandler opplysningene bare etter avtale med oss.

## Hvor lenge
• Personalmappen slettes [[3 år]] etter at arbeidsforholdet er slutt, med mindre noe må tas vare på lenger.
• Timer, lønnsgrunnlag og bilag oppbevares i fem år etter regnskapsårets slutt (bokføringsloven).
• Søknader fra søkere som ikke blir ansatt, slettes [[6 måneder]] etter at stillingen er besatt.

## Dine rettigheter
Du har rett til innsyn i opplysningene om deg, og til å få feil rettet. Du kan i noen tilfeller kreve sletting eller begrenset behandling, protestere og få utlevert dine data. Spørsmål rettes til [[personvernansvarlig: navn og e-post]]. Du kan klage til Datatilsynet.
`,
  },
  kontrolltiltak: {
    title: 'Kontrolltiltak',
    body: `
Kontrolltiltak overfor ansatte skal ha saklig grunn og ikke være en uforholdsmessig belastning (arbeidsmiljøloven § 9-1). Tiltakene drøftes med tillitsvalgte så tidlig som mulig, og de ansatte får vite formålet, hvordan tiltaket virker og hvor lenge det varer, før det tas i bruk (§ 9-2). Tiltakene evalueres jevnlig.

## Kontrolltiltak i {{firma}}
• Timeføring i ProTop: for lønn, fakturering og for å følge arbeidstidsreglene. Leder ser timene til sine ansatte.
• [[Aktivitetslogg i ProTop: innlogging og sist aktiv, for sikkerhet og support. Slettes etter 90 dager.]]
• [[Kjørebok for tjenestebil og bompenger.]]
• [[Adgangskontroll med HMS-kort på byggeplass.]]
• [[Kameraovervåking: hvor, hvorfor og hvor lenge opptak lagres.]]
Nye tiltak tas ikke i bruk før de er drøftet og de ansatte er informert.

## Innsyn i e-post og filer
Bedriften kan bare se i ansattes e-postkasse, filområder og annet elektronisk materiale når det er nødvendig for driften eller andre berettigede interesser, eller ved begrunnet mistanke om grovt brudd på pliktene i arbeidsforholdet (forskrift om arbeidsgivers innsyn i e-postkasse og annet elektronisk lagret materiale). Den ansatte varsles og får uttale seg før innsyn, og kan være til stede med en tillitsvalgt. Innsynet dokumenteres. Opplysninger som åpenbart er private, åpnes ikke.
`,
  },
  hmsKort: {
    title: 'HMS-kort og adgang til byggeplass',
    body: `
Alle som utfører arbeid på bygge- og anleggsplasser, skal ha gyldig HMS-kort og bære det synlig (forskrift om HMS-kort for bygge- og anleggsplasser). Kortet bestilles av arbeidsgiver. Kortnummer og utløpsdato registreres i HR under Lovpålagt, og leder får varsel før kortet går ut.

Byggherren fører en daglig oversiktsliste over hvem som arbeider på plassen (byggherreforskriften § 15). {{firma}} leverer listen fra timeføringen når byggherren ber om den. Mist du kortet, sier du fra til [[nærmeste leder]] samme dag.
`,
  },
};

/**
 * Standard personalhåndbok, bygd på en byggrådgivers personalhåndbok (revisjon 11) og
 * arbeidsmiljøloven. Bedriftens egne valg står i [[…]] og må bekreftes før publisering.
 */
export function standardHandbookChapters() {
  const c = (title, body) => ({ title, body: body.trim() });
  return normalizeChapters([
    c('Om personalhåndboken', `
Denne personalhåndboken gjelder for {{firma}}[[, inkludert datterselskaper og avdelinger]].

## Bakgrunn
Personalhåndboken gir en oversikt over de til enhver tid gjeldende ordningene for arbeidstid, rutiner og sosiale goder. Der ikke annet er omtalt, gjelder bestemmelsene i arbeidsmiljøloven.

[[Daglig leder]] er ansvarlig for å revidere personalhåndboken og for personaladministrasjonen i det daglige.

## Hvem gjelder personalhåndboken for
Arbeidsgiver pålegger alle arbeidstakere å gjøre seg kjent med personalhåndboken og vedleggene. Hver ansatt bekrefter i ProTop at de har lest gjeldende versjon.

## Plikter
Alle arbeidstakere plikter å overholde reglene i personalhåndboken og andre relevante lover og forskrifter. Brudd på lovpålagte eller kontraktsfestede krav kan føre til oppsigelse.

## Revisjon
Personalhåndboken revideres ved behov, for eksempel ved endring i rutiner, og gjennomgås i sin helhet minst én gang i året[[ i løpet av august]]. Alle har plikt til å melde behov for endring til [[K-HMS-leder]]. Hver godkjente versjon får nytt versjonsnummer, og endringene vises i revisjonsloggen.
`),
    c('Visjon og verdier', `
## Vår visjon
[[Skriv bedriftens visjon]]

## Våre verdier
Verdigrunnlaget vårt bygger på:
• [[Verdi 1]]
• [[Verdi 2]]
• [[Verdi 3]]
`),
    c('Personalpolitiske retningslinjer', `
Alle ansatte skal gjøre seg kjent med og arbeide etter selskapets politikk for samfunnsansvar og etiske retningslinjer. Politikken leses og bekreftes av alle ansatte.

## Grunnleggende prinsipp
Den ansatte kan ikke under ansettelsen ha annen stilling eller påta seg arbeid av betydning for andre uten samtykke fra daglig leder.

Har arbeidstakeren i arbeidsforholdet fått kunnskap om eller rådighet over en forretnings- eller driftshemmelighet, kan vedkommende ikke bruke den eller gi den videre til uvedkommende. Konfidensielle selskapspapirer og kundedokumenter skal makuleres.

Når en arbeidstaker slutter, kan vedkommende ta med private gjenstander og litteratur merket med eget navn. Alt skriftlig og produsert arbeid, uansett lagringsmedium, er bedriftens eiendom. Ønsker den som slutter kopi av utført arbeid, må daglig leder godkjenne det skriftlig. Opphavsretten til utførte arbeider tilfaller bedriften, så sant ikke annet er avtalt.

Ledelsen skal legge til rette for at arbeidsoppgavene kan utføres hensiktsmessig, at det er trivsel, og at hver ansatt får en faglig tilfredsstillende utvikling. Den enkelte medarbeider skal:
• vise medmenneskelig ansvar og bry seg om hverandre utover det formelle ansvaret
• være lojal overfor bedriften og kundene, og redelig i sin fremferd
• skille mellom egne og firmaets verdier, og ikke utnytte muligheter til misbruk
• ta ansvar for egen faglig utvikling og egen arbeidssituasjon
• vise respekt for fortrolig informasjon om firmaet og den enkelte medarbeider
`),
    c('Etiske retningslinjer', `
De etiske retningslinjene gjelder for alle ansatte og viser selskapets syn på ansvarlighet og etisk adferd. Retningslinjene er ikke uttømmende. Er du i tvil, søk veiledning hos nærmeste leder.

• Uavhengighet: Rådgivning og prosjektledelse skal være uavhengig og objektiv og bare fremme kundens formål med oppdraget. Vi har ingen skjulte bindinger til leverandører eller andre forretningsforbindelser.
• Gaver: Vi ber ikke om, tar ikke imot og tilbyr ikke gaver eller fordeler som kan påvirke, eller gi inntrykk av å påvirke, forretningsbeslutninger. Er du i tvil, avklar med nærmeste leder.
• Sosiale medier: Vi har et bevisst forhold til sosiale medier og lojalitetsplikt til arbeidsgiver. Vi deltar i den offentlige debatten som privatpersoner.
• Ambassadør: Vi opptrer profesjonelt, ryddig og tillitvekkende, og er bevisst på at handlinger og holdninger påvirker omdømmet til {{firma}}.
• Utgifter: Selskapet eller oppdragsgiveren dekker egne utgifter til forretningsreiser og kurs. Vi dekker ikke forretningsforbindelsers reise, opphold eller kurs. Vanlig representasjon avtales med nærmeste leder.
• Betalingsmidler: Vi betaler ikke med irregulære betalingsmidler som kontanter, sjekk, bankremisser eller naturalytelser.
• Skriftlighet: Avtaler skal være skriftlige.
• Miljø: Vi tar hensyn til miljøet og bidrar til lavere energiforbruk og klimautslipp, effektiv ressursbruk, riktig avfallshåndtering og vern av biologisk mangfold.
• Mellommenn: Avtaler med mellommenn om godtgjørelse skal være skriftlige og åpne overfor kunden.
• Habilitet: Ingen skal delta i eller påvirke en beslutning når det kan stilles spørsmål ved habiliteten. Konkurrerende virksomhet skal avklares.
• Integritet: Vi forplikter oss til langsiktige forretningsforbindelser med selskaper som har verdier som tilsvarer våre.
• Åpenhet: Vi gir korrekte opplysninger til myndigheter og kunder, og deler kunnskap.
• Selvstendig ansvar: Vi har rett til å nekte å følge pålegg som er ulovlige eller bryter med de etiske prinsippene.
• Respekt: Vi aksepterer ingen form for mobbing, diskriminering, trakassering eller uønsket seksuell oppmerksomhet. Vi inntar ikke alkohol i arbeidstiden og har nulltoleranse for narkotika. Det skal utvises måtehold på arrangementer i regi av arbeidsgiver.
• Regnskap: Regnskapet skal være korrekt og i samsvar med norsk lov og god regnskapsskikk.
• Hvitvasking: Selskapet skal påse at transaksjoner ikke misbrukes til hvitvasking.
• Konkurranse: Vi arbeider for åpen og redelig konkurranse, og unngår ulovlig prissamarbeid og markedsdeling.
• Svart arbeid: Vi bruker ikke svart arbeid eller ulovlig arbeidskraft.

Brudd på retningslinjene kan føre til disiplinære konsekvenser.
`),
    c('Likestilling, mangfold og inkludering', `
## Formål
{{firma}} skal være en arbeidsplass preget av likeverd, respekt og reelle muligheter for alle. Selskapet skal arbeide aktivt for å fremme likestilling, mangfold og inkludering, og motvirke diskriminering, trakassering og utenforskap.

## Virkeområde
Retningslinjene gjelder for alle ansatte, innleide, ledere og andre som utfører arbeid for eller på vegne av selskapet, i hele arbeidsforholdet: rekruttering, lønns- og arbeidsvilkår, utviklingsmuligheter, tilrettelegging, samarbeid og avslutning.

## Grunnleggende prinsipper
Alle skal møtes med respekt og verdighet. Ingen skal utsettes for usaklig forskjellsbehandling på grunn av kjønn, graviditet, permisjon ved fødsel eller adopsjon, omsorgsoppgaver, etnisitet, religion eller livssyn, funksjonsnedsettelse, seksuell orientering, kjønnsidentitet, kjønnsuttrykk, alder eller andre forhold vernet av lovgivningen.

## Rekruttering og utvikling
Rekruttering skal være saklig, åpen og inkluderende, og vurderinger skal bygge på kompetanse, erfaring og egnethet. Alle skal ha like muligheter til faglig utvikling, ansvar og lederoppgaver.

## Arbeidsmiljø og samhandling
Krenkende adferd, trakassering, mobbing og utilbørlig språkbruk aksepteres ikke. Alle bidrar til en profesjonell og inkluderende kultur, internt og eksternt.

## Tilrettelegging
Der det er mulig og rimelig, legger selskapet til rette for ansatte med ulike behov knyttet til helse, funksjonsevne, livssituasjon, religion, språk eller familieforpliktelser, i dialog med den enkelte.

## Ansvar, varsling og oppfølging
Ledelsen har ansvar for at retningslinjene er kjent og etterleves. Alle ansatte har ansvar for å si fra om kritikkverdige forhold, til nærmeste leder, daglig leder eller gjennom varslingsrutinen. Henvendelser behandles forsvarlig og så konfidensielt som mulig. ${RETALIATION_TEXT} Retningslinjene vurderes jevnlig som en del av det systematiske arbeidsmiljøarbeidet.
`),
    c('Medarbeidersamtaler, lojalitet og verneombud', `
## Medarbeidersamtaler
Selskapet gjennomfører medarbeidersamtale minst én gang i året. Samtalen er planlagt, forberedt og fortrolig, og tar opp samarbeid og trivsel, organisering av arbeidet, arbeidsinnhold, faglig og personlig utvikling og oppnådde resultater. Nærmeste leder er ansvarlig for å gjennomføre samtalene. Malen ligger i Skjemabygger, og samtalen registreres i HR.

Misnøye eller utfordringer i arbeidssituasjonen bør tas opp med overordnede så raskt som mulig, og konflikter løses på lavest mulig nivå.

## Lojalitet
Ansatte er bundet av en alminnelig opplysnings- og lojalitetsplikt gjennom hele arbeidsforholdet, og kan ikke drive eller delta i konkurrerende virksomhet.

## Tillitsvalgt og verneombud
[[Navn]] er tillitsvalgt og verneombud i {{firma}}. Virksomheter med færre enn ti ansatte kan avtale en annen ordning, jf. arbeidsmiljøloven § 6-1. Verneombudet overvåker det fysiske arbeidsmiljøet sammen med [[K/HMS-leder]], og det gjennomføres vernerunde minst én gang i året. Den tillitsvalgte er de ansattes representant overfor ledelsen.
`),
    c('Miljø og bærekraft', `
{{firma}} forholder seg til bærekraft innen miljø, sosiale forhold og ledelse (ESG).

Vårt miljøløfte:
• [[Klimanøytral innen 2030]]
• [[Bidra til bærekraftige byer og samfunn gjennom tjenestene våre]]
• [[Et konsistent og åpent ledelses- og styringssystem]]
• [[Samarbeid med relevante organisasjoner for å nå målene]]

Reisepolitikken og miljøinstruksene ligger i ISO / K-HMS › Dokumenter.
`),
    c('Arbeidsforhold og arbeidstid', `
## Generelt
Arbeidsbelastningen skal over en 12-månedersperiode (januar–desember) ikke være større enn et normalarbeidsår. I perioder kan det være nødvendig å arbeide utover vanlig arbeidstid. Dette avspaseres når det passer for den ansatte og selskapet, og ledere skal legge til rette for avspasering.

## Ansettelsesavtaler
Ved ansettelse inngås skriftlig arbeidsavtale, som er gjensidig bindende når den er signert. Oppsigelse skal være skriftlig, og fra arbeidsgiver saklig begrunnet. Det gjelder en gjensidig prøvetid på [[6 måneder]] med [[2 ukers]] oppsigelsestid. Etter prøvetiden er oppsigelsesfristen [[3 måneder]], regnet fra den 1. i måneden etter at oppsigelsen er meldt, om ikke annet er avtalt. Bruk av ulovlige narkotiske stoffer er grunnlag for oppsigelse.

## Alminnelig arbeidstid
Normal arbeidstid er [[8 timer per dag, fra kl. 07.00 til 15.00]], fem dager i uken. Den alminnelige arbeidstiden er [[40 timer]] per uke, inkludert [[30 minutters]] ubetalt spisepause. Selskapet praktiserer fleksitid med kjernetid [[kl. 09.00–15.00]], unntatt for stillinger som må være bemannet hele åpningstiden. Misbrukes fleksitiden, kan nærmeste leder pålegge fast arbeidstid.

## Arbeidstid på spesielle dager
Julaften, påskeaften og pinseaften er det arbeidshvile fra kl. 15.00 etter arbeidsmiljøloven. I {{firma}} gjelder:
• [[Onsdag før påske til kl. 16.00]]
• [[Julaften til kl. 12.00]]
• [[Nyttårsaften til kl. 12.00]]

## Redusert arbeidstid
Arbeidstaker som av helsemessige, sosiale eller andre viktige velferdsgrunner trenger redusert arbeidstid, har rett til det dersom det kan gjennomføres uten vesentlige ulemper for selskapet. Arbeidstaker over 62 år har rett til redusert arbeidstid på samme vilkår.

## Timeregistrering
Arbeidstiden føres daglig i ProTop (Timeliste) og sendes til godkjenning ukentlig.

## Plusstid og avspasering
Den ansatte skal tilstrebe maks [[10 timer plusstid per uke og 25 timer per måned]], og ingen arbeidsdag over [[13 timer]]. Negativ saldo bør ikke overstige [[37,5 timer]]. Plusstid avspaseres time mot time. Er det vanskelig å avspasere i løpet av året, varsles nærmeste leder, som setter opp en avspaseringsplan. Utbetaling av plusstid skjer bare unntaksvis.

## Overtid og mertid
${OVERTIME_TEXT} Det betales [[50 %]] tillegg. Timelønn beregnes som månedslønn delt på [[162,5]] timer. Mertid er arbeid utover avtalt arbeidstid, men innenfor lovens grenser, og avspaseres time for time. Ved årsslutt skal saldoen være 0, om ikke annet er avtalt.

## Unntatt fra arbeidstidsreglene
Arbeidstakere i ledende eller særlig uavhengig stilling er unntatt fra arbeidstidsreglene, jf. arbeidsmiljøloven § 10-12. Dette står i arbeidsavtalen.
`),
    c('Sykdom og fravær', `
## Sykdom
Sykefravær meldes til nærmeste leder så tidlig som mulig første fraværsdag, og registreres i ProTop under Fravær som egenmelding, sykmelding eller sykt barn.

Egenmelding kan brukes i [[fire perioder på inntil tre kalenderdager]] i løpet av 12 måneder, etter at den ansatte har vært ansatt i minst to måneder. Fravær utover dette krever sykmelding. Kopi av sykmeldingen leveres nærmeste leder[[ og regnskapsfører]].

## Sykt barn
Ansatte har rett til fri ved barns sykdom etter arbeidsmiljøloven § 12-9, med omsorgspenger etter folketrygdloven kapittel 9, til og med det kalenderåret barnet fyller 12 år. [[Antall dager per år følger folketrygdloven.]] Fraværet registreres i ProTop.

## Planlagt fravær
Planlagt fravær avtales med nærmeste leder og legges inn i ProTop. Fravær over én dag avtales med avdelingsleder eller daglig leder.

## Pensjonsalder
Arbeidsforholdet opphører ved [[72 år]], jf. arbeidsmiljøloven § 15-13 a. Den ansatte kan slutte tidligere etter alminnelige regler for oppsigelse.
`),
    c('Ferie', `
{{firma}} har [[5 uker]] ferie hvert år. [[Dagene mellom jul og nyttår og dagene mellom palmesøndag og skjærtorsdag utgjør én av ukene.]] [[Tre]] av ukene tas ut i perioden [[uke 27–32]].

Ferie utenom fellesferien avtales med daglig leder senest [[4 måneder]] i forkant. Ferieplanen legges inn i ProTop. Arbeidstakere over 60 år har en ekstra ferieuke. Ellers gjelder ferieloven.

## Ferie ved ansettelse i ferieåret
Begynner arbeidstakeren før 1. oktober, har vedkommende rett til full feriefritid det året. Fra og med 1. oktober er retten én uke. Ferie som allerede er avviklet hos tidligere arbeidsgiver, kommer til fradrag. Feriefritiden i ansettelsesåret er uten lønn.
`),
    c('Permisjoner og fri', `
## Spisepauser
Ved sammenhengende arbeidstid over fem og en halv time har arbeidstaker rett til pause, jf. arbeidsmiljøloven § 10-9. [[Pausen inngår i arbeidstiden dersom den ansatte må være tilgjengelig.]]

## Permisjon med lønn
Det gis permisjon med full lønn ved:
• Pålagt tjeneste i retten. Selskapet dekker differansen mellom godtgjørelse og ordinær lønn.
• Begravelse i nær familie: [[dødsdag og begravelsesdag]].
• [[Andre ordninger bedriften har]]

## Permisjon uten lønn
Arbeidstaker har rett til lovfestede permisjoner etter arbeidsmiljøloven, blant annet ved fødsel og adopsjon. Foreldrepenger utbetales etter folketrygdloven. Permisjon til private gjøremål avtales med arbeidsgiver.

## Lege og tannlege
Ansatte har rett til fri for å gå til lege og tannlege. [[Planlagte besøk er uten lønn.]] Fraværet registreres i ProTop.

## Studietur og fagsamling
Arbeidsgiver betaler lønn for timer med faglig innhold. Hvordan timene føres, opplyses for hver tur.

## Taushetsplikt
Alle ansatte har taushetsplikt om konfidensielle forhold, også etter at arbeidsforholdet er avsluttet. Taushetserklæringen signeres ved ansettelse.
`),
    c('Lønn og godtgjørelse', `
## Lønnsutbetaling
Lønn utbetales etterskuddsvis den [[15.]] hver måned, med digital lønnsslipp. I [[juli]] utbetales feriepenger i stedet for ordinær månedslønn. Feriepenger er [[12 %]], og [[14,3 %]] for ansatte over 60 år. I desember trekkes [[halv skatt]].

## Lønnsoppgjør
Lønn reguleres årlig per [[1. januar]], individuelt etter innsats og ansiennitet, i dialog mellom daglig leder, avdelingsleder og den ansatte.

## Bil og reise
Reise mellom hjem og fast arbeidssted dekkes av den ansatte. Reiser i tjeneste gjøres fortrinnsvis med selskapets [[poolbiler]], som bookes i kalenderen. Kjøring registreres i kjøreboken i ProTop.

## Diett og utlegg
Diett ved reiser over [[12 timer]] refunderes etter statens regulativ mot kvittering. Utlegg registreres i ProTop med kvittering og godkjennes av avdelingsleder. Utlegg eldre enn [[2 måneder]] godkjennes ikke. Ved representasjon skal deltakerne oppgis.

## Trekk i lønn
Arbeidsgiver kan trekke i lønn og feriepenger ved feilutbetaling, udokumentert forskudd eller utstyr som ikke er levert tilbake, jf. arbeidsmiljøloven § 14-15.
`),
    c('Lokaler og rutiner', `
## Låsing og alarm
Alle gjør seg kjent med låsing, alarm og adgangskontroll. Dørene er åpne [[hverdager kl. 07.00–15.00]]. Den som går sist, påser at dører og vinduer er lukket og låst, og at alarmen er satt på. Utløses alarmen ved et uhell, ringer den som utløste den vaktselskapet og kansellerer.

## Rydding og renhold
Alle rydder etter seg på møterom, kjøkken og fellesarealer. Inngangsparti og kjøkken skal alltid være presentable for kunder. [[Renholdsbyrået vasker ukentlig, så horisontale flater ryddes før vask.]]

## Rekvisita
Gi beskjed til [[ansvarlig]] når noe er i ferd med å gå tomt.

## Innkjøp
Mindre innkjøp opptil [[5 000 kr]] avtales med avdelingsleder. Større innkjøp, lisenser og IT-utstyr avtales med daglig leder.
`),
    c('Bedriftsordninger', `
## Pensjon
{{firma}} har innskuddsbasert tjenestepensjon i [[pensjonsleverandør]]. Innskudd: [[5 % av lønn mellom 0 og 7 G, og 8 % av lønn mellom 7,1 og 12 G]] (G = folketrygdens grunnbeløp). Den ansatte velger selv risikoprofil i leverandørens nettportal. Ordningen omfatter også [[uførepensjon]].

## Forsikringer
Ansatte er omfattet av bedriftens forsikringer i [[forsikringsselskap]]:
• Yrkesskadeforsikring
• [[Livsforsikring]]
• [[Reiseforsikring]]
• [[Helseforsikring]]

## Poolbiler
Poolbiler bookes i kalenderen og brukes til eksterne møter og prosjekter. Kjøring registreres i kjøreboken. [[Elbiler settes på lading ved halv batterikapasitet.]] Bøter dekkes ikke av arbeidsgiver.

## Telefon
Selskapet holder mobiltelefon[[ (inntil 10 000 kr)]] og dekker abonnement [[med inntil 8 GB data per måned]]. Dyrere telefon eller privat bruk utover dette trekkes i lønn. Den ansatte er selv ansvarlig for å slå av dataroaming i utlandet.
`),
    // Lagt til sist, så id-ene std_1–std_15 på kapitlene over står som før.
    ...LEGAL_CHAPTER_ORDER.map((key) => c(LEGAL_CHAPTERS[key].title, LEGAL_CHAPTERS[key].body)),
  ].map((row, index) => ({ ...row, id: `std_${index + 1}` })));
}

/* ───────── Lovsjekk av en håndbok som allerede er i bruk ───────── */

const LEGAL_CHAPTER_ORDER = ['varsling', 'personvern', 'kontrolltiltak', 'hmsKort'];

const OVERTIME_CUSTOMER = /[^.\n]*overtid[^.\n]*(?:oppdragsgiver|kunde)[a-zæøå]*\s+betaler[^.\n]*\.?/gi;
const GOOD_FAITH = /[^.\n]*gjengjeldelse[^.\n]*i god tro[^.\n]*\.?/gi;

function hasTitle(chapters, pattern) {
  return chapters.some((row) => pattern.test(row.title));
}

/**
 * Tekst i håndboken som strider mot loven, og kapitler som mangler.
 * [{ id, level: 'feil' | 'mangler', text, chapterId }]. Hvert funn kan rettes med applyHandbookFix.
 */
export function handbookLegalIssues(handbook) {
  const chapters = normalizeHandbook(handbook).chapters;
  const out = [];
  for (const row of chapters) {
    if (row.body.match(OVERTIME_CUSTOMER)) {
      out.push({ id: 'overtimeCustomer', level: 'feil', chapterId: row.id, text: `«${row.title}» knytter overtidstillegget til at oppdragsgiveren betaler. Tillegget på minst 40 % skal betales uansett (arbeidsmiljøloven § 10-6 (11)).` });
    }
    if (row.body.match(GOOD_FAITH)) {
      out.push({ id: 'goodFaith', level: 'feil', chapterId: row.id, text: `«${row.title}» sier at bare varsling i god tro er vernet. Vernet mot gjengjeldelse gjelder all forsvarlig varsling (arbeidsmiljøloven § 2 A-4).` });
    }
  }
  if (!hasTitle(chapters, /varsl/i)) {
    out.push({ id: 'varsling', level: 'mangler', chapterId: '', text: 'Håndboken mangler varslingsrutine. Virksomheter med minst fem ansatte skal ha en skriftlig rutine (arbeidsmiljøloven § 2 A-3).' });
  }
  if (!hasTitle(chapters, /personvern/i)) {
    out.push({ id: 'personvern', level: 'mangler', chapterId: '', text: 'Håndboken mangler et kapittel om personvern for ansatte: hvilke opplysninger, hvorfor, hvem som ser dem og hvor lenge (personvernforordningen artikkel 13).' });
  }
  if (!hasTitle(chapters, /kontrolltiltak/i)) {
    out.push({ id: 'kontrolltiltak', level: 'mangler', chapterId: '', text: 'Håndboken mangler et kapittel om kontrolltiltak, som timeføring, aktivitetslogg og innsyn i e-post (arbeidsmiljøloven kapittel 9).' });
  }
  if (!hasTitle(chapters, /hms-kort/i)) {
    out.push({ id: 'hmsKort', level: 'mangler', chapterId: '', text: 'Håndboken mangler et kapittel om HMS-kort og adgang til byggeplass.' });
  }
  return out;
}

/** Retter ett funn fra handbookLegalIssues: bytter ut teksten eller legger til kapitlet sist. */
export function applyHandbookFix(handbook, issueId, { now = new Date() } = {}) {
  const h = normalizeHandbook(handbook);
  if (issueId === 'overtimeCustomer' || issueId === 'goodFaith') {
    const pattern = issueId === 'overtimeCustomer' ? OVERTIME_CUSTOMER : GOOD_FAITH;
    const replacement = issueId === 'overtimeCustomer' ? OVERTIME_TEXT : RETALIATION_TEXT;
    return {
      ...h,
      changedAt: now.toISOString(),
      chapters: h.chapters.map((row) => {
        if (!row.body.match(pattern)) return row;
        const body = row.body.replace(pattern, (match) => `${/^\s/.test(match) ? ' ' : ''}${replacement}`);
        return { ...row, body };
      }),
    };
  }
  const chapter = LEGAL_CHAPTERS[issueId];
  if (!chapter) return h;
  return addChapter(h, { title: chapter.title, body: chapter.body.trim() }, { now }).handbook;
}
