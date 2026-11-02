/**
 * HR-årshjul: faste HR-aktiviteter måned for måned, med lovhenvisning der det er et lovkrav.
 * Bedriften kan slå av aktiviteter som ikke gjelder, krysse av det som er gjort i året, og la
 * ProTop lage en oppgave når måneden starter (annualTaskPlan).
 *
 * Lagres i HR-tilstanden som hr.annual (se normalizeAnnualSettings). Katalogen bør gås gjennom
 * ved lovendringer.
 */

export const HR_ANNUAL_SOURCE = 'hr-annual';

export const MONTHS_NB = [
  'Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Desember',
];

/**
 * kind: 'lov' = lovkrav, 'anbefalt' = god praksis.
 * minStaff: gjelder fra så mange egne ansatte (null = alle). note forklarer grensen.
 * page: hvor i ProTop det gjøres (HR-underside, eller 'fravaer' for ferieplanen). outside = utenfor ProTop.
 * iso: ISO-siden der det samme føres når bedriften har ISO / K-HMS, så det ikke føres to steder.
 */
export const HR_ANNUAL_ACTIVITIES = [
  {
    id: 'ferie_saldo',
    title: 'Sett feriesaldo og åpne ferieplanen',
    months: [0],
    kind: 'lov',
    law: 'Ferieloven §§ 5 og 6',
    description: 'Start fraværssaldo for alle egne ansatte, og åpne ferieplanen med frist for ønsker. Alle har rett til 25 virkedager ferie, og en ekstra uke fra året de fyller 60.',
    page: 'fravaer',
  },
  {
    id: 'verneombud',
    title: 'Sjekk at verneombudet er valgt',
    months: [0],
    kind: 'lov',
    law: 'Arbeidsmiljøloven §§ 6-1 og 6-5',
    description: 'Verneombudet velges for to år om gangen og skal ha opplæring (40 timer). Under 10 ansatte kan dere skriftlig avtale en annen ordning.',
    minStaff: 10,
    note: 'Fra 10 ansatte. Under 10 kan dere avtale en annen ordning skriftlig.',
  },
  {
    id: 'likestilling',
    title: 'Likestilling: lønnskartlegging og redegjørelse',
    months: [0, 1],
    kind: 'lov',
    law: 'Likestillings- og diskrimineringsloven §§ 26 og 26 a',
    description: 'Alle arbeidsgivere skal arbeide aktivt for likestilling. Med flere enn 50 ansatte skal lønn kartlegges fordelt på kjønn hvert andre år, og arbeidet redegjøres for i årsberetningen eller et annet offentlig dokument. Lønnskartleggingen ligger under HR → Lønn.',
    minStaff: 20,
    note: 'Over 50 ansatte alltid. 20–50 ansatte når arbeidsgiver eller en arbeidstakerorganisasjon krever det.',
    page: 'lonn',
  },
  {
    id: 'amu_rapport',
    title: 'Årsrapport fra arbeidsmiljøutvalget (AMU)',
    months: [1],
    kind: 'lov',
    law: 'Arbeidsmiljøloven §§ 7-1 og 7-2',
    description: 'AMU skal hvert år lage en rapport om arbeidet sitt. Bruk møtemalen «HMS- og vernemøte (AMU)» under Møter.',
    minStaff: 50,
    note: 'Fra 50 ansatte. 20–49 ansatte når en av partene krever det.',
  },
  {
    id: 'medarbeidersamtaler',
    title: 'Medarbeidersamtaler',
    months: [2, 3],
    kind: 'anbefalt',
    law: 'Arbeidsmiljøloven § 4-2 (medvirkning og utvikling)',
    description: 'Hold samtale med alle egne ansatte: trivsel, mål, kompetanse og utvikling. Registreres under HR → Oppfølging → Samtaler og saker (eller KS-skjemaet under Skjemaer). Avvik blir sak automatisk.',
    page: 'oppfolging',
  },
  {
    id: 'ferie_fastsett',
    title: 'Fastsett hovedferien',
    months: [2],
    kind: 'lov',
    law: 'Ferieloven § 6',
    description: 'Arbeidsgiver fastsetter ferien etter drøfting med de ansatte. De ansatte kan kreve å få vite det senest to måneder før ferien starter, altså innen 1. april når hovedferien starter 1. juni. De kan kreve tre uker (18 virkedager) hovedferie i perioden 1. juni–30. september.',
    page: 'fravaer',
  },
  {
    id: 'lonnsoppgjor',
    title: 'Lønnsoppgjør og lønnsjustering',
    months: [4],
    kind: 'anbefalt',
    description: 'Gå gjennom lønn for alle egne ansatte, legg inn ny lønn med begrunnelse, og sjekk tariffavtale om dere har det. Planlagt lønn ligger under HR → Lønn.',
    page: 'lonn',
  },
  {
    id: 'sommervikarer',
    title: 'Sommervikarer: avtale og opplæring',
    months: [4],
    kind: 'lov',
    law: 'Arbeidsmiljøloven §§ 14-5 og 14-6, kapittel 11 (unge arbeidstakere)',
    description: 'Skriftlig arbeidsavtale senest sju dager etter start, også for korte vikariater. HMS-opplæring før de begynner. Under 18 år gjelder egne regler for arbeidstid og arbeidsoppgaver.',
    page: 'avtaler',
  },
  {
    id: 'feriepenger',
    title: 'Utbetal feriepenger',
    months: [5],
    kind: 'lov',
    law: 'Ferieloven § 11',
    description: 'Feriepenger utbetales senest siste vanlige lønningsdag før ferien, som regel i juni. Gjøres i lønnssystemet.',
    outside: true,
  },
  {
    id: 'apenhetsloven',
    title: 'Åpenhetsloven: publiser redegjørelsen',
    months: [5],
    kind: 'lov',
    law: 'Åpenhetsloven §§ 3 og 5',
    description: 'Redegjørelse for aktsomhetsvurderinger av menneskerettigheter og arbeidsforhold i leverandørkjeden, publisert på nettsiden senest 30. juni.',
    minStaff: 50,
    note: 'Bare større virksomheter: minst to av tre — 50 årsverk, 70 mill. kr i salgsinntekt eller 35 mill. kr i balanse.',
    outside: true,
  },
  {
    id: 'oppstart_hosten',
    title: 'Oppstart etter sommeren: nyansatte og lærlinger',
    months: [7],
    kind: 'anbefalt',
    description: 'Arbeidsavtaler, HMS-introduksjon og personverninformasjon for alle som starter i august. Status per person ligger under HR → Lovpålagt.',
    page: 'compliance',
  },
  {
    id: 'medarbeiderundersokelse',
    title: 'Medarbeiderundersøkelse',
    months: [8],
    kind: 'anbefalt',
    law: 'Internkontrollforskriften § 5 andre ledd nr. 6 (kartlegge farer i arbeidsmiljøet)',
    description: 'Anonym undersøkelse om arbeidsmiljø, arbeidsmengde, ledelse og trakassering, under HR → Oppfølging → Medarbeiderundersøkelse. Resultatene vises når den er avsluttet og minst fem har svart.',
    page: 'undersokelse',
  },
  {
    id: 'vernerunde',
    title: 'Vernerunde og risikovurdering av arbeidsmiljøet',
    months: [8],
    kind: 'lov',
    law: 'Internkontrollforskriften § 5 andre ledd nr. 6',
    description: 'Kartlegg farer og vurder risiko, både fysisk og psykososialt arbeidsmiljø, sammen med verneombudet. Bruk KS-skjemaet «Vernerunde». Følg opp funn med tiltak og frist. Med ISO / K-HMS føres farer og tiltak der.',
    iso: 'hms',
  },
  {
    id: 'budsjett',
    title: 'Budsjett for bemanning, lønn og kompetanse',
    months: [9],
    kind: 'anbefalt',
    description: 'Planlegg nyansettelser, lønnsutvikling og opplæring for neste år. Lønnsplan for neste år legges inn under HR → Lønn.',
    page: 'lonn',
  },
  {
    id: 'restferie',
    title: 'Restferie og ferieplan for neste år',
    months: [10],
    kind: 'lov',
    law: 'Ferieloven § 7',
    description: 'Sørg for at ferien blir tatt før nyttår. Inntil 12 virkedager kan overføres til neste år ved skriftlig avtale. Ferie som ikke er tatt på grunn av arbeidsgiver, overføres uansett.',
    page: 'fravaer',
  },
  {
    id: 'hms_gjennomgang',
    title: 'Årlig gjennomgang av HMS-arbeidet og personalhåndboken',
    months: [11],
    kind: 'lov',
    law: 'Internkontrollforskriften § 5 andre ledd nr. 8',
    description: 'Gå gjennom at internkontrollen virker: mål, sykefravær, avvik, vernerunder og tiltak. Oppdater personalhåndboken og rutinene ved behov. Med ISO / K-HMS gjøres gjennomgangen i Ledelsens gjennomgang.',
    page: 'handbok',
    iso: 'ledelse',
  },
];

/** Plikter som gjelder hele året, uten fast måned. */
export const HR_ANNUAL_ONGOING = [
  {
    id: 'sykefravaer',
    title: 'Oppfølging ved sykefravær',
    law: 'Arbeidsmiljøloven § 4-6 og folketrygdloven § 8-7 a',
    description: 'Oppfølgingsplan innen 4 uker, dialogmøte 1 innen 7 uker, og dialogmøte 2 med NAV innen 26 uker. ProTop regner ut fristene fra fraværet og lager oppgave.',
    page: 'sykefravaer',
  },
  {
    id: 'arbeidsavtale',
    title: 'Skriftlig arbeidsavtale ved hver ansettelse',
    law: 'Arbeidsmiljøloven §§ 14-5 og 14-6',
    description: 'Senest sju dager etter tiltredelse. Status per person under HR → Lovpålagt.',
  },
  {
    id: 'a_melding',
    title: 'A-melding hver måned',
    law: 'A-opplysningsloven',
    description: 'Innen den 5. hver måned. Gjøres i lønnssystemet.',
  },
];

function text(value) {
  return String(value ?? '').trim();
}

/** «Januar–februar» for aktiviteter over flere måneder, ellers tom. */
export function activityPeriod(activity) {
  const months = activity?.months || [];
  if (months.length < 2) return '';
  const first = Math.min(...months);
  const last = Math.max(...months);
  return `${MONTHS_NB[first]}–${MONTHS_NB[last].toLowerCase()}`;
}

export function activityById(id) {
  return HR_ANNUAL_ACTIVITIES.find((row) => row.id === id) || null;
}

/** Lagret oppsett: av-slåtte aktiviteter, hva som er gjort per år, og om ProTop lager oppgaver. */
export function normalizeAnnualSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const known = new Set(HR_ANNUAL_ACTIVITIES.map((row) => row.id));
  const off = [...new Set((Array.isArray(src.off) ? src.off : []).map(text).filter((id) => known.has(id)))];
  const done = {};
  const doneSrc = src.done && typeof src.done === 'object' ? src.done : {};
  for (const [key, value] of Object.entries(doneSrc)) {
    const m = /^(\d{4}):([a-z_]+)$/.exec(key);
    if (!m || !known.has(m[2]) || !value || typeof value !== 'object') continue;
    done[key] = { at: text(value.at).slice(0, 10), by: text(value.by) };
  }
  return { off, done, tasks: src.tasks === true };
}

export function doneKey(year, id) {
  return `${Number(year)}:${id}`;
}

/** Gjelder aktiviteten bedriften? Ukjent antall ansatte (null) regnes som at den gjelder. */
export function activityApplies(activity, staffCount = null) {
  if (!activity?.minStaff || staffCount == null) return true;
  return Number(staffCount) >= activity.minStaff;
}

/**
 * Årshjulet for et år: 12 måneder med aktivitetene. Hver aktivitet får status:
 *   done (krysset av), off (slått av), na (gjelder ikke etter antall ansatte),
 *   late (måneden er passert), now (inneværende måned), later.
 * extra[id] gir automatisk fremdrift, f.eks. { label: '4 av 9 har hatt samtale', done: false }.
 */
export function hrAnnualWheel(settings, { year, today = new Date(), staffCount = null, extra = {} } = {}) {
  const s = normalizeAnnualSettings(settings);
  const y = Number(year) || today.getFullYear();
  const nowYear = today.getFullYear();
  const nowMonth = today.getMonth();
  const off = new Set(s.off);
  return MONTHS_NB.map((name, month) => {
    // En aktivitet over flere måneder står én gang, i første måned, med perioden (Januar–februar).
    const items = HR_ANNUAL_ACTIVITIES.filter((a) => Math.min(...a.months) === month).map((activity) => {
      const doneRow = s.done[doneKey(y, activity.id)] || null;
      const auto = extra[activity.id] || null;
      const lastMonth = Math.max(...activity.months);
      let status = 'later';
      if (off.has(activity.id)) status = 'off';
      else if (!activityApplies(activity, staffCount)) status = 'na';
      else if (doneRow || auto?.done) status = 'done';
      else if (y < nowYear || (y === nowYear && lastMonth < nowMonth)) status = 'late';
      else if (y === nowYear && activity.months.includes(nowMonth)) status = 'now';
      return { activity, status, done: doneRow, auto, period: activityPeriod(activity) };
    });
    return { month, name, items };
  });
}

/** Tall til toppen av siden: hvor mange lovkrav og anbefalinger som er gjort, og hva som er forsinket. */
export function annualSummary(wheel) {
  const seen = new Map();
  for (const m of wheel || []) {
    for (const item of m.items) seen.set(item.activity.id, item);
  }
  const rows = [...seen.values()].filter((row) => row.status !== 'off' && row.status !== 'na');
  return {
    total: rows.length,
    done: rows.filter((row) => row.status === 'done').length,
    late: rows.filter((row) => row.status === 'late').length,
    now: rows.filter((row) => row.status === 'now').length,
  };
}

/** Kryss av eller fjern avkrysning for en aktivitet i et år. */
export function toggleAnnualDone(settings, year, id, { by = '', today = new Date() } = {}) {
  const s = normalizeAnnualSettings(settings);
  const key = doneKey(year, id);
  const done = { ...s.done };
  if (done[key]) delete done[key];
  else done[key] = { at: isoDay(today), by: text(by) };
  return { ...s, done };
}

export function toggleAnnualOff(settings, id) {
  const s = normalizeAnnualSettings(settings);
  const off = s.off.includes(id) ? s.off.filter((row) => row !== id) : [...s.off, id];
  return { ...s, off };
}

function isoDay(date) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function lastDayOfMonth(year, month) {
  return isoDay(new Date(year, month + 1, 0));
}

export function annualTaskId(activityId, year, month) {
  return `hrahj_${activityId}_${year}_${String(month + 1).padStart(2, '0')}`;
}

/**
 * Oppgaver for aktiviteter som starter i inneværende måned: som gjelder, ikke er slått av eller krysset av,
 * og som ikke allerede har oppgave (fast id per aktivitet og måned). Bare når bedriften har slått
 * på oppgaver. existingIds er id-ene til oppgavene som finnes.
 */
export function annualTaskPlan(settings, { today = new Date(), staffCount = null, existingIds = [], uid = '' } = {}) {
  const s = normalizeAnnualSettings(settings);
  if (!s.tasks) return [];
  const year = today.getFullYear();
  const month = today.getMonth();
  const have = new Set(existingIds);
  const out = [];
  for (const activity of HR_ANNUAL_ACTIVITIES) {
    // Én oppgave per aktivitet: når perioden starter, med frist siste dag i perioden.
    if (Math.min(...activity.months) !== month) continue;
    if (s.off.includes(activity.id) || !activityApplies(activity, staffCount)) continue;
    if (s.done[doneKey(year, activity.id)]) continue;
    const id = annualTaskId(activity.id, year, month);
    if (have.has(id)) continue;
    out.push({
      id,
      title: `HR-årshjul: ${activity.title}`,
      description: [
        activity.description,
        activity.law ? `Grunnlag: ${activity.law}.` : '',
        'Kryss av under HR → Rutiner → Årshjul når det er gjort.',
      ].filter(Boolean).join('\n'),
      deadline: lastDayOfMonth(year, Math.max(...activity.months)),
      deadlineTime: null,
      participants: [],
      assignedTo: text(uid) || null,
      attachments: [],
      done: false,
      active: true,
      deleted: false,
      type: 'task',
      completedDates: [],
      createdBy: text(uid) || null,
      startKey: isoDay(today),
      order: 0,
      source: HR_ANNUAL_SOURCE,
      activityId: activity.id,
    });
  }
  return out;
}

/**
 * Fremdrift for medarbeidersamtaler: egne ansatte med gjennomført samtale i året.
 * Teller samtaler under Oppfølging (reviews) og ferdige KS-skjema «Medarbeidersamtale» under
 * Skjemaer (forms: [{ employeeId, date }]), så det ikke spiller noen rolle hvor samtalen ble ført.
 */
export function reviewProgress(reviews, staffIds, year, forms = []) {
  const ids = new Set((staffIds || []).map(text).filter(Boolean));
  const inYear = (date) => text(date).startsWith(`${year}-`);
  const had = new Set([
    ...(reviews || []).filter((r) => r?.status === 'done' && inYear(r.date)).map((r) => text(r.employeeId)),
    ...(forms || []).filter((f) => inYear(f?.date)).map((f) => text(f.employeeId)),
  ].filter((id) => ids.has(id)));
  if (!ids.size) return null;
  return { label: `${had.size} av ${ids.size} har hatt samtale i ${year}`, done: had.size >= ids.size };
}

/** Ferdige KS-skjema «Medarbeidersamtale» (HR → Skjemaer) som { employeeId, date }. */
export function reviewFormsFromFilled(docs) {
  return (docs || [])
    .filter((d) => d?.scope === 'hr' && d.libraryKey === 'medarbeidersamtale' && d.status === 'ferdig' && d.subject?.id)
    .map((d) => ({ employeeId: text(d.subject.id), date: text(d.completedAt).slice(0, 10) }));
}
