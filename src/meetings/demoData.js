/**
 * Eksempeldata for /moter-demo og testene. Datoene regnes fra «i dag»,
 * så demoen alltid har kommende og holdte møter.
 */
import { addDays, normalizeMeeting } from './model.js';
import { agendaFromTemplate, builtinTemplates } from './templates.js';

export const DEMO_PEOPLE = [
  { id: 'emp_goa', employeeId: 'emp_goa', uid: 'demo-user', name: 'Geir Ove Andersen', company: 'Consult1 AS', title: 'Prosjektleder', email: 'goa@consult1.no', phone: '90 24 20 75' },
  { id: 'emp_lo', employeeId: 'emp_lo', name: 'Linda Øie', company: 'Consult1 AS', title: 'Anleggsleder', email: 'linda@consult1.no', phone: '91 22 33 44' },
  { id: 'emp_ms', employeeId: 'emp_ms', name: 'Martin Solberg', company: 'Consult1 AS', title: 'HMS-leder', email: 'martin@consult1.no', phone: '92 11 22 33' },
  { id: 'emp_ib', employeeId: 'emp_ib', name: 'Ingrid Berg', company: 'Consult1 AS', title: 'Daglig leder', email: 'ingrid@consult1.no', phone: '93 44 55 66' },
  { id: 'emp_th', employeeId: 'emp_th', name: 'Thomas Haugen', company: 'Consult1 AS', title: 'Økonomisjef', email: 'thomas@consult1.no', phone: '94 55 66 77' },
];

const EXTERNAL = [
  { name: 'Hanne Lund', company: 'Sandnes Kommune', title: 'Byggherrens representant', email: 'hanne.lund@sandnes.kommune.no', phone: '48 44 47 40', external: true },
  { name: 'Kari Nilsen', company: 'Rør & Varme AS', title: 'Prosjektleder VVS', email: 'kari@rorvarme.no', phone: '45 67 89 01', external: true },
  { name: 'Ola Dahl', company: 'Elektro Vest AS', title: 'Prosjektleder elektro', email: 'ola@elektrovest.no', phone: '47 12 34 56', external: true },
];

function person(row, role, attendance = 'ukjent', extra = {}) {
  return { ...row, id: `dlt_${(row.id || row.name).replace(/\W+/g, '').toLowerCase()}`, role, attendance, ...extra };
}

function template(id) {
  return builtinTemplates().find((row) => row.id === id);
}

/** Fyller dagsordenen fra en mal og legger inn innhold for gitte punkt-titler. */
function agenda(templateId, content = {}) {
  return agendaFromTemplate(template(templateId)).map((chapter) => ({
    ...chapter,
    items: chapter.items.map((item) => ({ ...item, ...(content[item.title] || {}) })),
  }));
}

const BYGG_SERIES = 'serie_kino';

function byggemote(number, date, status, content, extra = {}) {
  const [goa, lo] = DEMO_PEOPLE;
  const [bh, kn, od] = EXTERNAL;
  const attendance = status === 'ferdigstilt' || status === 'sendt';
  return normalizeMeeting({
    id: `mote_kino_${number}`,
    title: 'Byggemøte Kino Kino',
    typeId: 'byggemote',
    templateId: 'mal_byggemote',
    source: number === 1 ? 'mal' : 'serie',
    seriesId: BYGG_SERIES,
    number,
    projectId: 'prj_10610',
    projectName: 'Kino Kino',
    projectNumber: '10610',
    status,
    date,
    start: '09:00',
    end: '10:30',
    location: 'Brakkerigg, Langgata 12, Sandnes',
    purpose: 'Fast byggemøte mellom byggherre og entreprenørene.',
    recurrence: { freq: 'biweekly' },
    participants: [
      person(bh, 'deltaker', attendance ? 'tilstede' : 'ukjent'),
      person(goa, 'leder', attendance ? 'tilstede' : 'ukjent'),
      person(lo, 'referent', attendance ? 'tilstede' : 'ukjent'),
      person(kn, 'deltaker', attendance ? (number === 3 ? 'forfall' : 'tilstede') : 'ukjent'),
      person(od, 'deltaker', attendance ? 'tilstede' : 'ukjent'),
      person(DEMO_PEOPLE[2], 'kopi'),
    ],
    chapters: agenda('mal_byggemote', content),
    nextDate: extra.nextDate || '',
    nextStart: extra.nextDate ? '09:00' : '',
    nextLocation: extra.nextDate ? 'Brakkerigg, Langgata 12, Sandnes' : '',
    finalizedAt: attendance ? `${date}T10:42:00.000Z` : '',
    finalizedBy: attendance ? 'demo-user' : '',
    finalizedByName: attendance ? 'Geir Ove Andersen' : '',
    revision: attendance ? 1 : 0,
    deliveries: [
      { kind: 'innkalling', at: `${addDays(date, -4)}T08:00:00.000Z`, to: ['hanne.lund@sandnes.kommune.no', 'kari@rorvarme.no', 'ola@elektrovest.no'] },
      ...(status === 'sendt' ? [{ kind: 'referat', at: `${date}T12:15:00.000Z`, to: ['hanne.lund@sandnes.kommune.no', 'kari@rorvarme.no'], revision: 1 }] : []),
    ],
    summary: extra.summary || '',
    summarySource: extra.summary ? 'ai' : '',
    createdAt: `${addDays(date, -10)}T08:00:00.000Z`,
    createdBy: 'demo-user',
    createdByName: 'Geir Ove Andersen',
    log: extra.log || [],
    ...extra.meeting,
  });
}

const RUH_ACTION = {
  id: 'akt_rekkverk',
  text: 'Montere midlertidig rekkverk langs trapp 2 i plan 3',
  assigneeId: 'dlt_emplo',
  assigneeName: 'Linda Øie',
  originMeetingId: 'mote_kino_2',
  originNumber: 2,
};

export function demoMeetings(today) {
  const t = today;
  const m2 = addDays(t, -28);
  const m3 = addDays(t, -14);
  const m4 = addDays(t, 0);
  const m5 = addDays(t, 14);

  const meeting2 = byggemote(2, m2, 'sendt', {
    'HMS-status og uønskede hendelser (RUH)': {
      notes: 'To RUH siden forrige møte:\n- Manglende rekkverk ved trapp 2 i plan 3.\n- Stillas uten fotlist på østfasaden. Utbedret samme dag.',
      actions: [{ ...RUH_ACTION, due: addDays(m2, 5), originMeetingId: 'mote_kino_2', originNumber: 2, originDate: m2 }],
    },
    'Status mot fremdriftsplan': {
      notes: 'Råbygg ferdig etter plan. Tett hus forsinket én uke på grunn av vind i uke 40.',
      decisions: [{ text: 'Fremdriftsplanen revideres og legges fram i neste møte. Sluttdato holdes.' }],
    },
    'Endringsmeldinger og varsler': {
      notes: 'EM-04 (ekstra gjennomføringer i plan 2) er priset av Rør & Varme.',
      actions: [{ id: 'akt_em04', text: 'Gi tilbakemelding på pris for EM-04', assigneeName: 'Hanne Lund', due: addDays(m2, 7), originMeetingId: 'mote_kino_2', originNumber: 2, originDate: m2 }],
    },
  }, { nextDate: m3, summary: 'Fremdriften følger planen bortsett fra tett hus, som er forsinket én uke. To RUH ble gjennomgått. Byggherren gir svar på EM-04.' });

  const meeting3 = byggemote(3, m3, 'ferdigstilt', {
    'HMS-status og uønskede hendelser (RUH)': {
      notes: 'Ingen nye skader. Én RUH om løse plater på stillas, utbedret.',
      actions: [{ ...RUH_ACTION, due: addDays(m2, 5), done: true, doneAt: `${m3}T09:10:00.000Z`, originMeetingId: 'mote_kino_2', originNumber: 2, originDate: m2 }],
      carried: true,
    },
    'Status mot fremdriftsplan': {
      notes: 'Revidert fremdriftsplan gjennomgått. Tett hus nås i uke 44. Innvendige arbeider starter plan 1 i uke 45.',
      decisions: [{ text: 'Revidert fremdriftsplan rev. C godkjennes.' }],
    },
    'Bemanning': { notes: 'Elektro øker til 4 montører fra uke 45.' },
    'Endringsmeldinger og varsler': {
      notes: 'Byggherren har ikke rukket å vurdere EM-04.',
      actions: [
        { id: 'akt_em04', text: 'Gi tilbakemelding på pris for EM-04', assigneeName: 'Hanne Lund', due: addDays(m3, 3), originMeetingId: 'mote_kino_2', originNumber: 2, originDate: m2 },
        { id: 'akt_varsel', text: 'Sende varsel om forsinket tegningsleveranse fra RIV', assigneeName: 'Geir Ove Andersen', due: addDays(m3, 2), originMeetingId: 'mote_kino_3', originNumber: 3, originDate: m3 },
      ],
    },
    'Åpne avklaringer': {
      notes: 'Fargevalg på fasadeplater må avklares før bestilling.',
      actions: [{ id: 'akt_farge', text: 'Avklare fargevalg på fasadeplater med arkitekt', assigneeName: 'Hanne Lund', due: addDays(t, 5), originMeetingId: 'mote_kino_3', originNumber: 3, originDate: m3 }],
    },
  }, { nextDate: m4, summary: 'Revidert fremdriftsplan (rev. C) ble godkjent, og tett hus nås i uke 44. RUH om rekkverk er lukket. Byggherren mangler fortsatt svar på EM-04, og fargevalg på fasade må avklares.' });

  const meeting4 = byggemote(4, m4, 'innkalt', {
    'Endringsmeldinger og varsler': {
      actions: [{ id: 'akt_em04', text: 'Gi tilbakemelding på pris for EM-04', assigneeName: 'Hanne Lund', due: addDays(m3, 3), originMeetingId: 'mote_kino_2', originNumber: 2, originDate: m2 }],
      carried: true,
    },
    'Åpne avklaringer': {
      actions: [{ id: 'akt_farge', text: 'Avklare fargevalg på fasadeplater med arkitekt', assigneeName: 'Hanne Lund', due: addDays(t, 5), originMeetingId: 'mote_kino_3', originNumber: 3, originDate: m3 }],
      carried: true,
    },
  }, { nextDate: m5 });

  const [goa, lo, ms, ib, th] = DEMO_PEOPLE;

  const styre = normalizeMeeting({
    id: 'mote_styre_q4',
    title: 'Styremøte 4. kvartal',
    typeId: 'styre',
    templateId: 'mal_styre',
    source: 'mal',
    status: 'utkast',
    date: addDays(t, 9),
    start: '16:00',
    end: '18:00',
    location: 'Møterom Fjorden, hovedkontoret',
    visibility: 'deltakere',
    purpose: 'Ordinært styremøte. Budsjett 2027 legges fram til beslutning.',
    participants: [
      person(ib, 'deltaker'),
      person({ name: 'Per Eriksen', company: 'Styreleder', email: 'per@eriksen.no', phone: '90 00 11 22', external: true }, 'leder'),
      person(th, 'referent'),
      person({ name: 'Anne Lie', company: 'Styremedlem', email: 'anne.lie@lie.no', external: true }, 'deltaker'),
    ],
    chapters: agenda('mal_styre', {
      'Sak til beslutning': { title: 'Budsjett 2027', description: 'Forslag til budsjett for 2027 med investeringsplan.\nForslag til vedtak: Styret godkjenner budsjettet slik det er lagt fram.', minutes: 30 },
    }),
    createdAt: `${addDays(t, -3)}T08:00:00.000Z`,
    createdBy: 'demo-user',
  });

  const hms = normalizeMeeting({
    id: 'mote_amu_q3',
    title: 'Arbeidsmiljøutvalg (AMU)',
    typeId: 'hms',
    templateId: 'mal_hms',
    source: 'mal',
    status: 'pagar',
    date: addDays(t, -3),
    start: '13:00',
    end: '14:00',
    location: 'Kantina',
    endedAt: `${addDays(t, -3)}T14:05:00.000Z`,
    startedAt: `${addDays(t, -3)}T13:02:00.000Z`,
    participants: [
      person(ms, 'leder', 'tilstede'),
      person(ib, 'deltaker', 'tilstede'),
      person(lo, 'referent', 'tilstede'),
      person({ name: 'Jonas Vik', company: 'Verneombud', email: 'jonas@consult1.no', employeeId: 'emp_jv' }, 'deltaker', 'forfall'),
    ],
    chapters: agenda('mal_hms', {
      'Skader, RUH og avvik siden sist': {
        notes: 'Tre RUH i perioden, ingen fraværsskader. Flest meldinger om orden og ryddighet.',
        decisions: [{ text: 'Ryddekampanje på alle byggeplasser i uke 46.' }],
      },
      'Sykefravær': { notes: 'Sykefraværet er 3,1 % mot mål på 4 %.' },
      'Vernerunder og funn': {
        notes: 'To vernerunder gjennomført. Funn knyttet til merking av kjemikalier.',
        actions: [{ id: 'akt_kjem', text: 'Oppdatere stoffkartotek og merking i containerlager', assigneeName: 'Martin Solberg', due: addDays(t, -1), originMeetingId: 'mote_amu_q3', originDate: addDays(t, -3) }],
      },
    }),
    createdBy: 'demo-user',
  });

  const leder = normalizeMeeting({
    id: 'mote_leder_uke',
    title: 'Ledermøte',
    typeId: 'ledelse',
    templateId: 'mal_ledelse',
    source: 'mal',
    seriesId: 'serie_leder',
    number: 12,
    status: 'innkalt',
    date: addDays(t, 2),
    start: '08:00',
    end: '09:30',
    location: 'Møterom Fjorden',
    videoUrl: 'https://teams.microsoft.com/l/meetup-join/demo',
    visibility: 'deltakere',
    recurrence: { freq: 'weekly' },
    participants: [person(ib, 'leder'), person(goa, 'deltaker'), person(th, 'referent'), person(ms, 'deltaker')],
    chapters: agenda('mal_ledelse'),
    deliveries: [{ kind: 'innkalling', at: `${addDays(t, -1)}T08:00:00.000Z`, to: ['ingrid@consult1.no'] }],
    createdBy: 'demo-user',
  });

  const oppstart = normalizeMeeting({
    id: 'mote_oppstart_jasund',
    title: 'Oppstartsmøte Jåsund skole',
    typeId: 'oppstart',
    templateId: 'mal_oppstart',
    source: 'ai',
    projectId: 'prj_10791',
    projectName: 'Jåsund Skole',
    projectNumber: '10791',
    status: 'utkast',
    date: '',
    purpose: 'Avklare organisering, SHA og fremdrift før byggestart.',
    participants: [person(goa, 'leder'), person(lo, 'referent')],
    chapters: agenda('mal_oppstart'),
    createdBy: 'demo-user',
  });

  const kunde = normalizeMeeting({
    id: 'mote_kunde_sola',
    title: 'Statusmøte Sola kommune',
    typeId: 'kunde',
    templateId: 'mal_kunde',
    status: 'sendt',
    date: addDays(t, -40),
    start: '10:00',
    end: '11:00',
    location: 'Sola rådhus',
    participants: [person(goa, 'leder', 'tilstede'), person({ name: 'Siri Sola', company: 'Sola Kommune', email: 'siri@sola.kommune.no', external: true }, 'deltaker', 'tilstede'), person(th, 'referent', 'tilstede')],
    chapters: agenda('mal_kunde', {
      'Leveranser siden sist': { notes: 'Forprosjekt levert i henhold til avtale.' },
      'Økonomi og fakturering': { notes: 'Fakturert 72 % av fastpris.', decisions: [{ text: 'Neste faktura sendes ved godkjent detaljprosjekt.' }] },
      'Neste steg og ansvar': { actions: [{ id: 'akt_sola', text: 'Sende oppdatert fremdriftsplan for detaljprosjekt', assigneeName: 'Geir Ove Andersen', due: addDays(t, -30), done: true, originMeetingId: 'mote_kunde_sola', originDate: addDays(t, -40) }] },
    }),
    summary: 'Forprosjektet er levert. Neste faktura sendes når detaljprosjektet er godkjent.',
    finalizedAt: `${addDays(t, -40)}T11:30:00.000Z`,
    revision: 1,
    deliveries: [{ kind: 'referat', at: `${addDays(t, -40)}T12:00:00.000Z`, to: ['siri@sola.kommune.no'], revision: 1 }],
    createdBy: 'demo-user',
  });

  return [meeting2, meeting3, meeting4, styre, hms, leder, oppstart, kunde];
}

export const DEMO_PROJECTS = [
  { id: 'prj_10610', number: '10610', name: 'Kino Kino' },
  { id: 'prj_10791', number: '10791', name: 'Jåsund Skole' },
  { id: 'prj_10869', number: '10869', name: 'Golhaug VVA - Kontroll VA' },
];
