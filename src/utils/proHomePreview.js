/**
 * Eksempeldata til forhåndsvisningen av Hjem (/dashboard-themes): en vanlig arbeidsdag
 * i et byggfirma. Bygges med de samme funksjonene widgetene bruker, så formen er lik.
 */
import {
  isoDay, weekDays, weekHoursSummary, teamToday, mileageSummary,
} from './proHome.js';
import {
  awayToday, celebrations, tenderPeek, approvalSummary, myReportsSummary,
} from './proHomeMore.js';

function at(today, delta) {
  return isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() + delta, 12));
}

const PEOPLE = [
  ['e1', 'Geir', 'Olsen', '2014-03-01'],
  ['e2', 'Kari', 'Nordmann', '2019-06-15'],
  ['e3', 'Ola', 'Hansen', '2021-01-10'],
  ['e4', 'Sara', 'Lie', '2023-08-01'],
  ['e5', 'Ahmed', 'Ali', '2018-02-01'],
  ['e6', 'Ingrid', 'Berg', ''],
  ['e7', 'Jonas', 'Dahl', ''],
];

function employees(today) {
  return PEOPLE.map(([id, firstName, lastName, from], i) => {
    let periodFrom = from;
    // Ett jubileum om noen dager og én ny kollega, uansett når forhåndsvisningen åpnes.
    if (i === 1) periodFrom = `${today.getFullYear() - 5}-${at(today, 4).slice(5)}`;
    if (i === 5) periodFrom = at(today, -6);
    if (i === 6) periodFrom = `${today.getFullYear() - 2}-${at(today, 12).slice(5)}`;
    return { id, person: { firstName, lastName }, company: { periodFrom } };
  });
}

/** Avtalene i dag (klokkeslett relativt til nå, så båndet alltid har noe foran seg). */
export function previewTimeline(now = new Date()) {
  const h = Math.min(14, Math.max(8, now.getHours() + 1));
  const two = (n) => String(n).padStart(2, '0');
  return [
    { id: 'p1', time: '07:30', end: '08:00', title: 'Morgenmøte på riggen', place: 'Brattøra', color: '#2563eb' },
    { id: 'p2', time: `${two(h)}:00`, end: `${two(h + 1)}:00`, title: 'Byggemøte med byggherre', place: 'Teams', color: '#7c3aed' },
    { id: 'p3', time: `${two(h + 2)}:30`, end: `${two(h + 3)}:30`, title: 'Befaring Kirkeveien 12', place: 'Kirkeveien 12', color: '#059669' },
  ];
}

export function previewWeekCounts(today = new Date()) {
  const days = weekDays(today);
  return {
    [days[0].key]: 2, [days[1].key]: 4, [days[2].key]: 3, [days[3].key]: 5, [days[4].key]: 1,
  };
}

/** Felles for Privat og Bedrift: kalender, oppgaver og notater. */
export function previewDay(now = new Date()) {
  const timeline = previewTimeline(now);
  const next = timeline.find((ev) => Number(ev.time.slice(0, 2)) > now.getHours()) || timeline[timeline.length - 1];
  const openItems = [
    { id: 't1', title: 'Sende sluttrapport til Statsbygg', meta: 'Forfalt i går' },
    { id: 't2', title: 'Bestille stillas til uke 47', meta: 'I dag' },
    { id: 't3', title: 'Godkjenne SHA-plan', meta: 'Fredag' },
  ];
  return {
    isPreview: true,
    focusTomorrow: false,
    timeline,
    eventsToday: timeline,
    eventsTomorrow: [],
    nextEvent: { title: next.title, time: next.time, end: next.end, place: next.place, raw: null },
    taskProgress: {
      open: openItems.length, done: 2, total: openItems.length + 2, items: openItems, openItems, doneItems: [],
    },
    notes: [
      { id: 'n1', title: 'Spørsmål til byggemøtet', meta: 'Fremdrift fasade og levering vinduer' },
      { id: 'n2', title: 'Målinger bad 2. etasje', meta: 'I går' },
    ],
    remainingHints: ['Sluttrapport Statsbygg', 'Timer for mandag'],
    unreadByModule: { mail: 4, chat: 2 },
    weekCounts: previewWeekCounts(now),
  };
}

/** Bedriftens tall: timer, prosjekter, teamet, fravær, jubileer, anbud, godkjenning og RUH. */
export function previewCompany(now = new Date()) {
  const today = now;
  const days = weekDays(today);
  const hourRows = days.filter((d) => d.past && !d.weekend).map((d, i) => ({
    date: d.key, hours: i === 1 ? 6 : 7.5, projectId: i % 2 ? 'pr2' : 'pr1',
  }));
  hourRows.push({ date: isoDay(today), hours: 3.5, projectId: 'pr1' });
  const emps = employees(today);
  const todayKey = isoDay(today);
  const teamRows = [
    { employeeId: 'e1', date: todayKey, hours: 3.5 },
    { employeeId: 'e2', date: todayKey, hours: 4 },
    { employeeId: 'e5', date: todayKey, hours: 2 },
  ];
  const absences = [
    { employeeId: 'e3', date: todayKey, type: 'ferie' },
    { employeeId: 'e3', date: at(today, 1), type: 'ferie' },
    { employeeId: 'e4', date: todayKey, type: 'egenmelding' },
  ];
  const trips = [
    { id: 'm1', date: at(today, -1), km: 42, from: 'Trondheim', to: 'Melhus', purpose: 'duty', reimbursement: 210, status: 'draft', employeeId: 'e1' },
    { id: 'm2', date: at(today, -3), km: 18, from: 'Kontoret', to: 'Brattøra', purpose: 'duty', reimbursement: 90, status: 'sent', employeeId: 'e1' },
    { id: 'm3', date: at(today, -8), km: 65, from: 'Trondheim', to: 'Orkanger', purpose: 'duty', reimbursement: 325, status: 'sent', employeeId: 'e1' },
  ];
  const mileage = mileageSummary(trips, { today });
  mileage.yearKm = 3840;
  mileage.yearRatio = 3840 / 6000;
  return {
    hours: { summary: weekHoursSummary(hourRows, { today }), ready: true, linked: true },
    projects: {
      ready: true,
      total: 9,
      running: 6,
      items: [
        { id: 'pr1', number: 'P-2417', name: 'Rehabilitering Brattøra skole', phase: 'produksjon', phaseLabel: 'Pågår', place: 'Trondheim', mine: true },
        { id: 'pr2', number: 'P-2421', name: 'Kirkeveien 12, nybygg', phase: 'produksjon', phaseLabel: 'Pågår', place: 'Melhus', mine: true },
        { id: 'pr3', number: 'P-2430', name: 'Omsorgsboliger Lade', phase: 'tilbud', phaseLabel: 'Tilbud', place: 'Lade' },
        { id: 'pr4', number: 'P-2399', name: 'Fasade Solsiden', phase: 'overlevering', phaseLabel: 'Overlevering', place: 'Solsiden' },
      ],
    },
    team: { ...teamToday(emps, teamRows, { meId: 'e1', todayKey, limit: 8 }), ready: true, manager: true },
    news: {
      ready: true,
      total: 3,
      items: [
        { id: 'w1', title: 'Vi har vunnet Brattøra skole!', author: 'Daglig leder', date: todayKey, pinned: true },
        { id: 'w2', title: 'Ny HMS-rutine for arbeid i høyden', author: 'HMS-leder', date: at(today, -2) },
        { id: 'w3', title: 'Julebord 5. desember', author: 'Personal', date: at(today, -6) },
      ],
    },
    mileage: { summary: mileage, ready: true, linked: true },
    away: { ...awayToday(absences, emps, { todayKey, meId: 'e1' }), ready: true, manager: true, staff: emps.length },
    celebrations: { ...celebrations(emps, { today, limit: 4 }), ready: true },
    tenders: {
      ...tenderPeek({
        notices: [
          { id: 'a1', title: 'Rammeavtale tømrerarbeider', buyer: 'Trondheim kommune', decision: 'aktuell', deadline: at(today, 2) },
          { id: 'a2', title: 'Ny barnehage Byåsen', buyer: 'Trondheim kommune', decision: 'ubestemt', publishedAt: at(today, -1), deadline: at(today, 19) },
          { id: 'a3', title: 'Rehabilitering kirke', buyer: 'Kirkelig fellesråd', decision: 'ubestemt', publishedAt: at(today, -3), deadline: at(today, 26) },
          { id: 'a4', title: 'Vedlikehold boliger', buyer: 'TOBB', decision: 'tilbud', deadline: at(today, 9) },
        ],
      }, { today, limit: 4 }),
      ready: true,
    },
    approvals: {
      ...approvalSummary([
        { employeeId: 'e2', hours: 7.5 }, { employeeId: 'e2', hours: 7.5 }, { employeeId: 'e2', hours: 7.5 },
        { employeeId: 'e5', hours: 7.5 }, { employeeId: 'e5', hours: 4 },
        { employeeId: 'e7', hours: 6 },
      ], emps, { limit: 4 }),
      ready: true,
      manager: true,
    },
    reports: {
      ...myReportsSummary([
        { id: 'r1', title: 'Løst rekkverk i trapp 2', state: 'tiltak', reportedAt: `${at(today, -2)}T08:00:00Z` },
        { id: 'r2', title: 'Manglende sperring ved grøft', state: 'registrert', reportedAt: `${todayKey}T07:40:00Z` },
        { id: 'r3', title: 'Glatt rampe ved port', state: 'lukket', reportedAt: `${at(today, -20)}T09:00:00Z` },
      ]),
      ready: true,
    },
  };
}
