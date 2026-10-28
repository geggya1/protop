/**
 * ISO / K-HMS ↔ resten av ProTop.
 *
 * Rene funksjoner som leser data fra eksisterende moduler (selskap, ansatte, HR,
 * prosjekt, kjørebok, avfall, fravær, utstyr, utlegg, kunder og kontrakter) og gjør
 * dem om til ISO-kunnskap: indikatorer, bevis og forslag. Ingen data kopieres inn i
 * ISO før brukeren velger det, og ingenting skrives tilbake til de andre modulene.
 */
import { addDays, isoDate, lastMonths, monthKey, text, todayKey, uniq } from './core.js';
import { NORWEGIAN_OBLIGATIONS, STANDARDS } from './catalog.js';
import { isOpenFinding, notificationTaskKey, openActions, urgentTriage } from './findings.js';
import { normalizeDiagram, versionOf } from './processes.js';
import { documentsDueForReview } from './documents.js';
import { matrixRows, requirementIdsForArea } from './requirements.js';
import { competenceMatrix, createRecord, decisionCompleted, overdueRecords } from './registers.js';
import { usableForms, templateIdFor } from './forms.js';
import { annualTaskEffects } from './planning.js';
import { gearControls } from '../equipment/model.js';

const SICK = new Set(['syk_melding', 'egenmelding', 'sykdom', 'syk_uten']);

/* ───────────────────────── Selskap → oppsett ───────────────────────── */

/** Forslag til omfang og standarder fra selskapsprofilen (Brønnøysund-data i ProTop). */
export function setupDefaultsFromCompany(company, { employees = [] } = {}) {
  const name = text(company?.navn, 200);
  const units = (company?.subUnits || []).map((u) => text(u?.name || u?.navn, 120)).filter(Boolean);
  const activity = text(company?.naeringsbeskrivelse, 300);
  const address = text(company?.addressLabel || company?.forretningsadresse?.adresse?.[0], 300);
  const lines = [
    name ? `${name}${company?.organisasjonsnummer ? ` (org.nr. ${company.organisasjonsnummer})` : ''}` : '',
    activity ? `Virksomhet: ${activity}${company?.naeringskode ? ` (NACE ${company.naeringskode})` : ''}.` : '',
    units.length ? `Omfatter ${units.join(', ')}.` : '',
    address ? `Lokasjon: ${address}.` : '',
  ].filter(Boolean);
  return {
    name: name ? `Integrert ledelsessystem – ${name}` : '',
    scopeText: lines.join(' '),
    units: units.join('\n'),
    locations: address,
    activities: activity,
    standards: STANDARDS.map((s) => s.code),
    staffCount: (employees || []).length,
  };
}

/* ───────────────────────── Kjørebok → miljødata ───────────────────────── */

/** Km per måned fra kjøreboken, delt i elbil og fossil (G02/U10). Leses direkte – ikke kopiert. */
export function mileageSeries(trips, { months = 12, now = new Date() } = {}) {
  const keys = lastMonths(months, now);
  const rows = keys.map((key) => ({ key, electric: 0, fossil: 0, trips: 0 }));
  const index = new Map(rows.map((r) => [r.key, r]));
  for (const t of trips || []) {
    const row = index.get(monthKey(t?.date));
    if (!row) continue;
    const km = Number(t.km) || 0;
    if (t.electric) row.electric += km; else row.fossil += km;
    row.trips += 1;
  }
  const total = rows.reduce((s, r) => s + r.electric + r.fossil, 0);
  return {
    rows: rows.map((r) => ({ ...r, electric: Math.round(r.electric), fossil: Math.round(r.fossil), total: Math.round(r.electric + r.fossil) })),
    totalKm: Math.round(total),
    electricShare: total ? Math.round((rows.reduce((s, r) => s + r.electric, 0) / total) * 100) : null,
    source: 'Kjørebok',
    quality: 'Målt',
  };
}

/** Avfall registrert på prosjekter: kg per fraksjon og sorteringsgrad. */
export function wasteSummary(waste, projects = []) {
  const byFraction = new Map();
  let total = 0;
  let sorted = 0;
  for (const w of waste || []) {
    const kg = Number(w?.kg) || 0;
    if (!kg) continue;
    total += kg;
    if (w.sorted !== false) sorted += kg;
    const row = byFraction.get(w.fraction) || { label: w.fraction || 'Ukjent', value: 0, ids: [] };
    row.value += kg;
    row.ids.push(w.id);
    byFraction.set(w.fraction, row);
  }
  return {
    rows: [...byFraction.values()].map((r) => ({ ...r, value: Math.round(r.value) })).sort((a, b) => b.value - a.value),
    totalKg: Math.round(total),
    sortingRate: total ? Math.round((sorted / total) * 100) : null,
    projects: uniq((waste || []).map((w) => w.projectId)).length,
    source: 'Prosjekt (avfall)',
  };
}

/* ───────────────────────── Fravær → HMS-indikator ───────────────────────── */

/** Sykefravær i dagsverk per måned fra fraværsmodulen (8 t = én dag). Ingen personnavn ut. */
export function sickLeaveSeries(absences, { months = 12, now = new Date() } = {}) {
  const keys = lastMonths(months, now);
  const rows = keys.map((key) => ({ key, days: 0, employees: new Set() }));
  const index = new Map(rows.map((r) => [r.key, r]));
  for (const a of absences || []) {
    if (!SICK.has(a?.type)) continue;
    const row = index.get(monthKey(a.date));
    if (!row) continue;
    row.days += (Number(a.hours) || 8) / 8;
    row.employees.add(a.employeeId);
  }
  const out = rows.map((r) => ({ key: r.key, days: Math.round(r.days * 10) / 10, people: r.employees.size }));
  return {
    rows: out,
    totalDays: Math.round(out.reduce((s, r) => s + r.days, 0) * 10) / 10,
    hasData: out.some((r) => r.days > 0),
    source: 'Fravær',
    method: 'Registrert sykefravær (sykemelding, egenmelding, sykdom) i fraværsmodulen, 8 timer = ett dagsverk. Aggregert uten navn.',
  };
}

/* ───────────────────────── Utstyr → ressurser (7.1) ───────────────────────── */

export function equipmentStatus(equipment, now = new Date()) {
  const today = todayKey(now);
  const soon = addDays(today, 60);
  const active = (equipment || []).filter((e) => e?.status !== 'retired');
  // Kontroll og kalibrering (7.1.5): Utstyr eier dataene, ISO leser dem.
  const controls = active.filter((e) => e.scope !== 'private').flatMap((e) => gearControls(e, today).map((c) => ({ equipment: e, control: c })));
  return {
    total: active.length,
    inService: active.filter((e) => e.status === 'service'),
    warrantySoon: active.filter((e) => e.warrantyUntil && e.warrantyUntil >= today && e.warrantyUntil <= soon),
    vehicles: active.filter((e) => e.kind === 'vehicle'),
    electricVehicles: active.filter((e) => e.kind === 'vehicle' && e.electric).length,
    controls,
    controlsOverdue: controls.filter((x) => x.control.state === 'forfalt'),
    controlsSoon: controls.filter((x) => x.control.state === 'snart'),
    measuringWithoutControl: active.filter((e) => e.measuring && !gearControls(e, today).length),
    source: 'Utstyr',
  };
}

/**
 * Påminnelser om kontroll og kalibrering (7.1.5): 30 dager før fristen og når den er passert.
 * Kalibrering går til kvalitetsleder, sakkyndig kontroll og EU-kontroll til HMS-leder.
 */
export function equipmentControlEffects(equipment, system, now = new Date()) {
  const roles = system?.roleMap || {};
  const qm = roles.quality_manager || roles.system_owner || {};
  const hse = roles.hse_manager || qm;
  const out = [];
  for (const { equipment: gear, control } of equipmentStatus(equipment, now).controls) {
    if (!['forfalt', 'snart'].includes(control.state)) continue;
    const late = control.state === 'forfalt';
    const [y, m, d] = String(control.next).split('-');
    out.push({
      type: 'createTask',
      key: `isoauto_ctl_${gear.id}_${control.id}_${control.next}`.replace(/[^A-Za-z0-9_-]/g, '_'),
      title: `${control.label} ${late ? 'forfalt' : 'forfaller'}: ${gear.name} (${d}.${m}.${y})`,
      deadline: control.next,
      assigneeUid: (control.kind === 'kalibrering' || control.kind === 'service' ? qm : hse)?.uid || '',
      description: [
        `${control.label} av ${gear.name}${gear.serial ? ` (serienr. ${gear.serial})` : ''} har frist ${d}.${m}.${y}.`,
        late && control.kind !== 'service' ? 'Utstyret kan ikke reserveres før kontrollen er registrert i Utstyr.' : 'Registrer kontrollen i Utstyr når den er gjort.',
        control.kind === 'kalibrering' ? 'Viser kalibreringen avvik, vurder om målinger gjort siden forrige kalibrering må kontrolleres (ISO 9001 7.1.5.2).' : '',
      ].filter(Boolean).join('\n'),
    });
  }
  return out;
}

/* ───────────────────────── HR → kompetanse ───────────────────────── */

/**
 * HMS-punktene som før var avkrysninger i HR-sjekklisten. Nå er de kompetansekrav for alle
 * ansatte i ISO, og HR viser statusen derfra. `hrId` er punktets id i HR-sjekklisten.
 */
export const HR_CARRY_OVER = [
  { hrId: 'ik_hms_intro', title: 'HMS-introduksjon', source: 'Internkontrollforskriften' },
  { hrId: 'ik_deviation_known', title: 'Kjenner rutinen for å melde avvik', source: 'Internkontrollforskriften' },
  { hrId: 'iso45001_hms', title: 'Arbeidsmiljøopplæring', source: 'Arbeidsmiljøloven og ISO 45001' },
];

const lower = (value) => text(value).toLowerCase();

function carryRequirement(requirements, def) {
  return (requirements || []).find((r) => r.state !== 'arkivert' && lower(r.title) === lower(def.title)) || null;
}

/**
 * Det som gjenstår for å flytte HR-punktene inn i kompetansematrisen: krav som mangler, og
 * OK-avkrysninger i HR som ennå ikke er kompetansebevis. people: ansatte med id, navn og uid.
 */
export function hrCarryOver({ hrCompliance = [], people = [], requirements = [], records = [] } = {}) {
  const missing = HR_CARRY_OVER.filter((def) => !carryRequirement(requirements, def));
  // Også arkiverte bevis teller som tatt med, så de ikke kommer tilbake.
  const taken = new Set((records || []).map((r) => r.importKey).filter(Boolean));
  const live = (records || []).filter((r) => r.state !== 'arkivert');
  const byId = new Map((people || []).map((p) => [String(p.id), p]));
  const evidence = [];
  for (const row of hrCompliance || []) {
    const def = HR_CARRY_OVER.find((d) => d.hrId === row?.catalogId);
    if (!def || row.status !== 'ok') continue;
    const person = byId.get(String(row.employeeId));
    if (!person) continue;
    const key = `hr:${def.hrId}:${row.employeeId}`;
    if (taken.has(key)) continue;
    const req = carryRequirement(requirements, def);
    const proven = req && live.some((r) => r.requirementId === req.id
      && ((person.uid && r.personUid === person.uid) || (!r.personUid && r.personName === person.name)));
    if (proven) continue;
    evidence.push({ def, person, key, completedAt: isoDate(row.completedAt), note: text(row.note, 300) });
  }
  return { missing, evidence };
}

/** Kravene og bevisene fra hrCarryOver som nye poster, klare til å lagres samlet. */
export function hrCarryOverRecords(plan, { actor, requirements = [], records = [], now = new Date() } = {}) {
  const created = [];
  const events = [];
  let reqs = [...(requirements || [])];
  let proofs = [...(records || [])];
  for (const def of plan?.missing || []) {
    const res = createRecord('kompetansekrav', {
      title: def.title, role: 'Alle ansatte', source: def.source, validityMonths: 0,
    }, { actor, existing: reqs, now });
    if (!res.ok) return res;
    reqs = [...reqs, res.record];
    created.push(res.record);
    events.push(...res.events);
  }
  for (const item of plan?.evidence || []) {
    const req = carryRequirement(reqs, item.def);
    if (!req) continue;
    const res = createRecord('kompetanse', {
      personName: item.person.name,
      personUid: item.person.uid || '',
      requirementId: req.id,
      title: item.note ? `Krysset av i HR: ${item.note}` : 'Krysset av i HR-sjekklisten',
      validFrom: item.completedAt,
      importKey: item.key,
      origin: { system: 'ProTop HR', ref: item.def.hrId, url: '' },
    }, { actor, existing: proofs, now });
    if (!res.ok) return res;
    proofs = [...proofs, res.record];
    created.push(res.record);
    events.push(...res.events);
  }
  return { ok: true, records: created, events };
}

/* ───────────────────────── Kunder, kontrakter, utlegg ───────────────────────── */

/** Interessenter foreslått fra kunderegisteret, ansatte og myndigheter i lovkravene. */
export function stakeholderSuggestions({ customers = [], contracts = [], requirements = [], existing = [] } = {}) {
  const have = new Set((existing || []).map((r) => text(r.title).toLowerCase()));
  const out = [];
  const add = (title, category, description, source) => {
    const key = text(title).toLowerCase();
    if (!key || have.has(key)) return;
    have.add(key);
    out.push({ title, category, description, source });
  };
  add('Ansatte og innleide', 'Ansatte', 'Trygt og godt arbeidsmiljø, medvirkning, opplæring og forutsigbarhet.', 'Ansatte');
  const active = new Map();
  for (const c of contracts || []) {
    if (c?.status === 'avsluttet' || c?.deletedAt) continue;
    const name = text(c.buyer);
    if (name) active.set(name, (active.get(name) || 0) + (Number(c.value) || 0));
  }
  [...active.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([name]) => add(name, 'Kunde', 'Leveranser etter avtale, kvalitet, frister og kontraktskrav.', 'Kontrakter'));
  (customers || []).filter((c) => c?.kind !== 'person').slice(0, 5).forEach((c) => add(text(c.name || c.navn), 'Kunde', 'Kundekrav og tilfredshet.', 'Kunder'));
  const authorities = uniq((requirements || []).filter((r) => r.kind === 'lov').map((r) => r.authority).filter(Boolean));
  for (const a of authorities) add(a, 'Myndighet', 'Etterlevelse av lov og forskrift, meldeplikt og tilsyn.', 'Lovkrav');
  return out;
}

/** Leverandører foreslått fra utlegg/inngående bilag (mest brukte først) som ikke er vurdert. */
export function supplierSuggestions(expenses, existing = []) {
  const have = new Set((existing || []).map((r) => text(r.title).toLowerCase()));
  const map = new Map();
  for (const e of expenses || []) {
    const name = text(e?.vendor || e?.supplierLabel, 160);
    if (!name || have.has(name.toLowerCase())) continue;
    const row = map.get(name) || { title: name, count: 0, amount: 0 };
    row.count += 1;
    row.amount += Number(e.amount || e.total || 0) || 0;
    map.set(name, row);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.amount - a.amount).slice(0, 12);
}

/** Kontrakter fra Kontrakt-modulen og om kontraktsgjennomgang (SF19) er registrert (8.2). */
export function contractReviewStatus(contracts, submissions = []) {
  const reviewed = new Set((submissions || []).filter((s) => s.templateKey === 'SF19_KONTRAKT' || s.templateId === templateIdFor('SF19_KONTRAKT'))
    .map((s) => s.subjectRef?.contractId).filter(Boolean));
  const rows = (contracts || []).filter((c) => c && !c.deletedAt && c.status !== 'avsluttet')
    .map((c) => ({ id: c.id, title: c.title, buyer: c.buyer, start: c.start, projectId: c.projectId, reviewed: reviewed.has(c.id) }));
  return { rows, missing: rows.filter((r) => !r.reviewed), source: 'Kontrakt / avtale' };
}

/* ───────────────────────── Prosjekt ───────────────────────── */

/** Kvalitetsstatus per aktivt prosjekt: plan, risiko, kontroller og avvik. */
export function projectQuality(projects, state, findings) {
  const plans = state.records.kvalitetsplan || [];
  const risks = state.records.risiko || [];
  return (projects || []).filter((p) => p && p.status !== 'arkivert' && p.status !== 'avsluttet').map((p) => ({
    project: p,
    plan: plans.find((r) => r.projectId === p.id && r.state !== 'arkivert') || null,
    risks: risks.filter((r) => r.projectId === p.id && r.state === 'aktiv').length,
    controls: (state.submissions || []).filter((s) => s.subjectRef?.projectId === p.id).length,
    open: (findings || []).filter((f) => f.projectId === p.id && isOpenFinding(f)).length,
  }));
}

/** Forslag til kvalitetsplan fra prosjektdata (ingen dobbel registrering av prosjektet). */
export function qualityPlanDraft(project, { contracts = [], roleMap = {} } = {}) {
  const contract = (contracts || []).find((c) => c.projectId === project.id);
  return {
    projectId: project.id,
    projectName: `${project.number || ''} ${project.name || ''}`.trim(),
    title: `Kvalitetsplan ${project.number || ''} ${project.name || ''}`.trim(),
    requirements: [contract ? `Kontrakt: ${contract.title}${contract.buyer ? ` (${contract.buyer})` : ''}` : '', 'Gjeldende lov- og forskriftskrav', 'Virksomhetens prosesser og prosedyrer'].filter(Boolean).join('\n'),
    roles: [project.manager || project.projectManager ? `Prosjektleder: ${project.manager || project.projectManager}` : '', roleMap.quality_manager?.name ? `Kvalitetsleder: ${roleMap.quality_manager.name}` : ''].filter(Boolean).join('\n'),
    controlPlan: 'Oppstart: kontraktsgjennomgang (SF19)\nProsjektering: egenkontroll og sidemannskontroll (SF21) før hver utsendelse\nLeveranse: frigivelse av revisjon\nAvslutning: erfaringsoverføring og kundetilfredshet (SF28)',
    ownerName: project.manager || project.projectManager || roleMap.project_manager?.name || '',
  };
}

/** Opprettelsestidspunkt fra prosjektets id (prj_<ms base36>_…). */
export function projectCreatedAt(project) {
  const part = String(project?.id || '').split('_')[1] || '';
  const ms = parseInt(part, 36);
  return Number.isFinite(ms) && ms > 1.5e12 && ms < 4e12 ? new Date(ms).toISOString() : '';
}

/**
 * Nye prosjekter (opprettet etter at ledelsessystemet ble aktivert) får kvalitetsplan automatisk,
 * fylt ut fra prosjekt og kontrakt. Fast id gjør det idempotent. Eldre prosjekter får forslag.
 */
export function autoQualityPlans(state, projects, { contracts = [] } = {}) {
  if (state.system?.autoQualityPlan === false || !state.system?.setupAt) return [];
  const since = String(state.system.setupAt);
  const has = new Set((state.records?.kvalitetsplan || []).map((r) => r.projectId));
  const roles = state.system.roleMap || {};
  const out = [];
  for (const p of projects || []) {
    if (!p?.id || p.status === 'arkivert' || p.status === 'avsluttet' || has.has(p.id)) continue;
    const created = projectCreatedAt(p);
    if (!created || created < since) continue;
    const draft = qualityPlanDraft(p, { contracts, roleMap: roles });
    const owner = draft.ownerName ? { name: draft.ownerName, uid: '' } : (roles.project_manager || roles.quality_manager || null);
    if (!owner?.name) continue;
    out.push({ id: `kvp_${p.id}`.replace(/[^A-Za-z0-9_-]/g, '_'), project: p, draft: { ...draft, ownerName: owner.name, ownerUid: owner.uid || '' }, notifyUid: owner.uid || roles.quality_manager?.uid || '' });
  }
  return out;
}

/** Eldre avvik og RUH registrert i prosjektmodulen som ikke er tatt inn i ISO ennå. */
export function legacyProjectCases(projectState, findings = []) {
  const taken = new Set((findings || []).map((f) => f.sourceRef?.id).filter(Boolean));
  const name = new Map((projectState?.projects || []).map((p) => [p.id, `${p.number || ''} ${p.name || ''}`.trim()]));
  const out = [];
  for (const d of projectState?.deviations || []) {
    if (taken.has(d.id) || d.status === 'lukket') continue;
    out.push({ id: d.id, module: 'project.deviations', title: d.title, description: d.description, projectId: d.projectId, projectName: name.get(d.projectId) || '', type: d.type === 'hms' ? 'hms' : (d.type === 'miljø' ? 'miljo' : 'prosess'), label: 'Avvik i prosjekt' });
  }
  for (const r of projectState?.incidents || []) {
    if (taken.has(r.id) || r.status === 'lukket') continue;
    out.push({ id: r.id, module: 'project.incidents', title: r.title, description: r.description, projectId: r.projectId, projectName: name.get(r.projectId) || '', type: 'nestenulykke', severity: r.severity === 'høy' ? 'hoy' : r.severity, label: 'RUH i prosjekt' });
  }
  return out;
}

/* ───────────────────────── Forslag til registre ───────────────────────── */

export function aspectSuggestions({ trips = [], waste = [], equipment = [], existing = [] } = {}) {
  const have = new Set((existing || []).map((r) => text(r.title).toLowerCase()));
  const out = [];
  const add = (row) => { if (!have.has(row.title.toLowerCase())) out.push(row); };
  if ((trips || []).length) add({ activity: 'Tjenestereiser og befaringer', lifecycle: 'Transport', title: 'Kjøring med bil', impact: 'Klimagassutslipp og lokal luftforurensning', control: 'Direkte kontroll', source: `Kjørebok (${trips.length} turer)` });
  if ((waste || []).length) add({ activity: 'Prosjektgjennomføring', lifecycle: 'Avfall', title: 'Avfall fra prosjekter', impact: 'Ressursbruk og forurensning ved feil håndtering', control: 'Direkte kontroll', source: `Prosjekt (${waste.length} avfallsregistreringer)` });
  if ((equipment || []).some((e) => e.kind === 'vehicle')) add({ activity: 'Drift av kjøretøy', lifecycle: 'Drift', title: 'Drivstoff- og energiforbruk kjøretøy', impact: 'Utslipp og energibruk', control: 'Direkte kontroll', source: 'Utstyr (kjøretøy)' });
  add({ activity: 'Prosjektering og rådgivning', lifecycle: 'Prosjektering', title: 'Materialvalg og løsninger i prosjektering', impact: 'Livsløpsutslipp, ressursbruk og naturmangfold i kundens prosjekt', control: 'Innflytelse', source: 'Standardforslag for rådgivende virksomhet' });
  add({ activity: 'Kontordrift', lifecycle: 'Drift', title: 'Energiforbruk kontor', impact: 'Indirekte utslipp fra energi', control: 'Direkte kontroll', source: 'Standardforslag' });
  return out;
}

export function hazardSuggestions({ projects = [], trips = [], existing = [] } = {}) {
  const have = new Set((existing || []).map((r) => text(r.title).toLowerCase()));
  const rows = [
    { activity: 'Befaring på byggeplass', title: 'Fall, fallende gjenstander og anleggstrafikk', hazardCategory: 'Sikkerhet', inherentL: 2, inherentC: 5, hierarchy: ['Administrative tiltak', 'Verneutstyr'], when: projects.length },
    { activity: 'Kjøring i tjeneste', title: 'Trafikkulykke', hazardCategory: 'Sikkerhet', inherentL: 2, inherentC: 5, hierarchy: ['Administrative tiltak'], when: trips.length },
    { activity: 'Kontor- og skjermarbeid', title: 'Belastningsplager (ergonomi)', hazardCategory: 'Ergonomisk', inherentL: 3, inherentC: 2, hierarchy: ['Tekniske tiltak', 'Administrative tiltak'], when: true },
    { activity: 'Prosjektarbeid med frister', title: 'Høyt arbeidspress og lange dager', hazardCategory: 'Psykososial', inherentL: 3, inherentC: 3, hierarchy: ['Administrative tiltak'], when: true },
    { activity: 'Alenearbeid ved befaring', title: 'Alenearbeid uten varsling', hazardCategory: 'Organisatorisk', inherentL: 2, inherentC: 4, hierarchy: ['Administrative tiltak'], when: projects.length },
  ];
  return rows.filter((r) => r.when && !have.has(r.title.toLowerCase())).map(({ when, ...r }) => ({ ...r, source: 'Forslag ut fra prosjekter og kjørebok' }));
}

/* ───────────────────────── Automatisk kravkobling ───────────────────────── */

const FINDING_AREAS = {
  prosess: ['nonconformity', 'operation'],
  leveranse: ['nonconformity', 'release'],
  kundeklage: ['nonconformity', 'satisfaction'],
  leverandor: ['nonconformity', 'suppliers'],
  revisjonsfunn: ['nonconformity', 'internalAudit'],
  risikofunn: ['nonconformity', 'risk'],
  miljo: ['nonconformity', 'aspects', 'emergency'],
  hms: ['nonconformity', 'hazards', 'emergency'],
  nestenulykke: ['nonconformity', 'hazards'],
  forbedring: ['improvement'],
  endringsforslag: ['change', 'improvement'],
  positiv: ['satisfaction', 'improvement'],
  omdomme: ['nonconformity', 'satisfaction'],
  varsling: ['participation', 'leadership'],
};

/**
 * Automatisk kobling fra en ny sak: ISO-klausulene for sakstypen. Egne krav (lov, kontrakt, internt) har brede
 * kravområder; de kobles bare når de faktisk gjelder saken (Koblinger i saken), ellers ville en RUH i en trapp
 * blitt koblet til byggherreforskriften og droneforskriften.
 */
export function requirementIdsForFinding(state, type) {
  const custom = new Set((state?.requirements || []).map((r) => r.id));
  return uniq((FINDING_AREAS[type] || ['nonconformity']).flatMap((a) => requirementIdsForArea(state, a))).filter((id) => !custom.has(id));
}

const DOC_AREAS = {
  policy: ['policy', 'leadership'],
  prosedyre: ['documented', 'operation'],
  instruks: ['operation', 'competence'],
  plan: ['objectives', 'operation'],
  handbok: ['processes', 'documented'],
  veileder: ['awareness', 'competence'],
  analyse: ['context', 'risk'],
  register: ['documented'],
  sjekkliste: ['operation', 'monitoring'],
  skjema: ['documented'],
  rapport: ['monitoring', 'review'],
  kravbevis: ['documented'],
  mal: ['documented'],
  ekstern: ['documented'],
};

export function requirementIdsForDocument(state, docType) {
  return uniq((DOC_AREAS[docType] || ['documented']).flatMap((a) => requirementIdsForArea(state, a)));
}

/** Automatisk ansvarlig for en ny sak ut fra rollene i innstillingene. */
export function autoAssignee(system, type) {
  const roles = system?.roleMap || {};
  // Varsling går til øverste leder (nærmeste leder kan være involvert; aml § 2 A-3).
  if (type === 'varsling') {
    const top = roles.top_management || roles.system_owner || null;
    return top?.name ? { name: top.name, uid: top.uid || '' } : null;
  }
  const domainHse = ['hms', 'nestenulykke', 'miljo'].includes(type);
  const pick = (domainHse ? roles.hse_manager : roles.quality_manager) || roles.quality_manager || roles.hse_manager || roles.system_owner || null;
  return pick?.name ? { name: pick.name, uid: pick.uid || '' } : null;
}

const NOTIFY_TEXT = 'Mulig meldeplikt. Alvorlig personskade eller dødsfall: ring 113 og varsle Arbeidstilsynet og politiet straks (aml § 5-2). '
  + 'ProTop melder ikke selv til myndighetene. Bekreft i ISO → Avvik og forbedring når varslingen er vurdert eller utført.';

/** Oppgaven til den som sørger for varsling til myndighet (frist samme dag). Tom liste uten meldeplikt eller uten innlogging. */
export function notificationTaskEffects(finding) {
  const key = notificationTaskKey(finding);
  if (!finding?.authorityNotificationRequired || !key) return [];
  return [{
    type: 'createTask',
    key,
    title: `Mulig meldeplikt – vurder varsling til myndighet: ${finding.number} ${finding.title}`,
    assigneeUid: finding.notificationAssigneeUid,
    deadline: finding.notificationDue || finding.triageDue || null,
    description: NOTIFY_TEXT,
    push: true,
  }];
}

/**
 * Oppgaver og varsler når en sak meldes. Behandler får oppgave med triagefristen.
 * Mulig meldeplikt eller alvorlig skade: oppgaven varsles straks, den som skal varsle myndighet
 * får egen oppgave med frist samme dag, og HMS-leder og øverste ledelse får varsel.
 */
export function newFindingEffects(finding, system) {
  if (!finding?.id) return [];
  const roles = system?.roleMap || {};
  const urgent = urgentTriage(finding);
  const out = [];
  if (finding.assigneeUid) {
    out.push({ type: 'createTask', key: `iso_${finding.id}_triage`, title: `Behandle ${finding.number}: ${finding.title}`, assigneeUid: finding.assigneeUid, deadline: finding.triageDue, ...(urgent ? { push: true } : {}) });
  }
  out.push(...notificationTaskEffects(finding));
  if (urgent) {
    const told = new Set(out.map((e) => e.assigneeUid).filter(Boolean));
    const uids = uniq([roles.hse_manager?.uid, roles.top_management?.uid]).filter((uid) => !told.has(uid));
    if (uids.length) {
      out.push({
        type: 'push',
        uids,
        title: finding.authorityNotificationRequired ? 'Mulig meldeplikt' : 'Alvorlig hendelse meldt',
        body: `${finding.number} ${finding.title}`,
      });
    }
  }
  return out;
}

/* ───────────────────────── Modenhet / neste steg ───────────────────────── */

/**
 * Datoen en ledelsens gjennomgang eller internrevisjon regnes som gjennomført: møtedato / revisjonsdato
 * (planlagt dato) når den er passert, ellers datoen rapporten eller referatet ble godkjent. Aldri siste
 * endring: en gjennomgang fra 2023 som redigeres i dag, er ikke gjennomført i dag.
 */
export function performedDate(record, now = new Date()) {
  const own = isoDate(record?.register === 'ledelse' ? record?.meetingDate : record?.plannedDate);
  if (own && own <= todayKey(now)) return own;
  const approved = [...(record?.history || [])].reverse().find((h) => /^Status: godkjent/.test(String(h?.action || '')))?.at;
  return isoDate(approved) || '';
}

/**
 * Intern beredskapsliste (spesifikasjon kap. 9). Ikke en sertifiseringsgrad:
 * viser hva som finnes og hva som mangler, med lenke til riktig side.
 */
export function readinessChecklist(state, { now = new Date(), people = [] } = {}) {
  const std = new Set(state.system?.standards || []);
  const year = addDays(todayKey(now), -365);
  const published = (state.processes || []).filter((p) => p.publishedVersion && !p.archived);
  const docs = (state.documents || []).filter((d) => d.publishedRevision && !d.archived);
  const rec = state.records || {};
  const items = [
    { key: 'scope', label: 'Omfang, standarder og roller er satt', done: !!state.system?.setupAt && Object.values(state.system?.roleMap || {}).filter(Boolean).length >= 2, page: 'innstillinger' },
    { key: 'policy', label: 'Policy er godkjent og publisert', done: docs.some((d) => d.docType === 'policy'), page: 'dokumenter' },
    { key: 'context', label: 'Kontekst og interessenter er kartlagt', done: (rec.kontekst || []).length > 0 && (rec.interessent || []).length > 0, page: 'kontekst' },
    { key: 'roles', label: 'Roller, ansvar og myndighet er beskrevet', done: (rec.rolle || []).some((r) => r.state !== 'arkivert'), page: 'organisasjon' },
    { key: 'communication', label: 'Kommunikasjonsplan er laget', done: (rec.kommunikasjon || []).some((r) => r.state !== 'arkivert'), page: 'kommunikasjon' },
    { key: 'processes', label: 'Kjerneprosesser er publisert (minst tre)', done: published.length >= 3, page: 'prosesser' },
    { key: 'risk', label: 'Risiko og muligheter er vurdert', done: (rec.risiko || []).some((r) => r.inherentL && r.inherentC), page: 'risiko' },
    ...(std.has('ISO14001') ? [{ key: 'aspects', label: 'Miljøaspekter er vurdert med vesentlighet', done: (rec.miljoaspekt || []).length > 0, page: 'miljo' }] : []),
    ...(std.has('ISO45001') ? [{ key: 'hazards', label: 'Farer er kartlagt med medvirkning', done: (rec.fare || []).length > 0, page: 'hms' }] : []),
    { key: 'legal', label: 'Lovkrav er registrert og vurdert', done: (rec.samsvar || []).length > 0, page: 'lovkrav' },
    { key: 'objectives', label: 'Mål med måling er etablert', done: (rec.mal || []).some((m) => (m.measurements || []).length), page: 'mal' },
    { key: 'competence', label: 'Kompetansekrav er definert', done: (rec.kompetansekrav || []).length > 0 && people.length > 0, page: 'kompetanse' },
    { key: 'nonconformity', label: 'Avviksbehandling er i bruk', done: (state.findings || []).length > 0, page: 'avvik' },
    { key: 'audit', label: 'Internrevisjon gjennomført siste 12 mnd', done: (rec.revisjon || []).some((a) => ['godkjent', 'oppfolging', 'lukket'].includes(a.state) && performedDate(a, now) >= year), page: 'revisjon' },
    { key: 'review', label: 'Ledelsens gjennomgang siste 12 mnd', done: (rec.ledelse || []).some((l) => l.state === 'godkjent' && performedDate(l, now) >= year), page: 'ledelse' },
  ];
  const done = items.filter((i) => i.done).length;
  return { items, done, total: items.length, method: 'Intern sjekkliste over hovedelementer i ledelsessystemet. Ikke en sertifiseringsgrad.' };
}

/* ───────────────────────── Automatiske oppgaver ───────────────────────── */

/**
 * Oppgaver som skal finnes uten at noen må huske det: forfalte dokumentgjennomganger,
 * kravvurderinger, leverandørevalueringer, risiko-/aspektrevurderinger, utløpt kompetanse,
 * øvelser og vedtak. Nøkkelen inneholder fristen, så hver frist gir én oppgave (idempotent).
 */
export function autoTaskEffects(state, { now = new Date(), people = [], tasks = null, equipment = [] } = {}) {
  const roles = state.system?.roleMap || {};
  const owner = (name, uid) => ({ assigneeUid: uid || '', who: name || '' });
  const qm = roles.quality_manager || roles.system_owner || {};
  const hse = roles.hse_manager || qm;
  const out = [];
  const push = (key, title, due, who = qm, description = '') => out.push({ type: 'createTask', key: `isoauto_${key}`.replace(/[^A-Za-z0-9_-]/g, '_'), title, deadline: due || todayKey(now), assigneeUid: who?.uid || '', description });
  for (const d of documentsDueForReview(state.documents, now)) push(`doc_${d.id}_${d.nextReview}`, `Gjennomgå dokument ${d.code} ${d.title}`, d.nextReview, { uid: d.ownerUid || qm.uid }, 'Dokumentet har passert gjennomgangsdato.');
  for (const r of matrixRows(state, { onlyOverdue: true }, now)) push(`req_${r.id}_${r.nextReview}`, `Ny vurdering: ${r.standard ? `${r.standard.replace('ISO', 'ISO ')} ${r.clause}` : r.title}`, r.nextReview, qm);
  for (const s of overdueRecords(state.records.leverandor, 'nextReview', now)) push(`sup_${s.id}_${s.nextReview}`, `Evaluer leverandør ${s.title}`, s.nextReview, { uid: s.ownerUid || qm.uid });
  for (const r of overdueRecords(state.records.risiko, 'nextReview', now)) push(`risk_${r.id}_${r.nextReview}`, `Revurder risiko ${r.number} ${r.title}`, r.nextReview, { uid: r.ownerUid || qm.uid });
  for (const r of overdueRecords(state.records.fare, 'nextReview', now)) push(`haz_${r.id}_${r.nextReview}`, `Revurder fare ${r.number} ${r.title}`, r.nextReview, { uid: r.ownerUid || hse.uid });
  for (const r of overdueRecords(state.records.miljoaspekt, 'nextReview', now)) push(`asp_${r.id}_${r.nextReview}`, `Revurder miljøaspekt ${r.title}`, r.nextReview, hse);
  for (const r of overdueRecords(state.records.samsvar, 'nextReview', now)) push(`eval_${r.id}_${r.nextReview}`, `Ny samsvarsvurdering: ${r.title}`, r.nextReview, qm);
  for (const b of (state.records.beredskap || []).filter((x) => x.state !== 'arkivert' && x.nextExercise && x.nextExercise <= todayKey(now))) push(`ex_${b.id}_${b.nextExercise}`, `Gjennomfør beredskapsøvelse: ${b.title}`, b.nextExercise, hse);
  const matrix = competenceMatrix(people, state.records.kompetansekrav, state.records.kompetanse, now, { roles: state.records.rolle });
  for (const row of matrix) {
    for (const cell of row.cells) {
      if (cell.status !== 'utlopt') continue;
      push(`comp_${row.person.id || row.person.name}_${cell.requirement.id}_${cell.record?.validTo || ''}`, `Fornye kompetanse «${cell.requirement.title}» for ${row.person.name}`, todayKey(now), qm);
    }
  }
  // Vedtak som er ferdig i Oppgaver (tasks = status lest fra Oppgaver), gir ingen påminnelse.
  for (const l of state.records.ledelse || []) {
    for (const d of l.decisions || []) if (!decisionCompleted(d, tasks) && d.dueAt && d.dueAt < todayKey(now)) push(`dec_${d.id}_${d.dueAt}`, `Forfalt vedtak: ${d.decision}`, d.dueAt, { uid: d.ownerUid });
  }
  // Årshjulet: aktiviteter merket «Lag oppgave» blir oppgave når måneden starter.
  // Kontroll og kalibrering av utstyr (7.1.5): frist om 30 dager eller passert.
  return [...out, ...equipmentControlEffects(equipment, state.system, now), ...annualTaskEffects(state, { now }), ...escalationEffects(state, now)];
}

/**
 * Hvem en ISO-oppgave går til: personen som er valgt, ellers personen i rollen, ellers ISO-ansvarlig
 * (systemansvarlig, kvalitetsleder, eieren av ledelsessystemet). Aldri den som tilfeldigvis kjørte
 * automatikken. via: valgt | rolle | ansvarlig | ingen.
 */
export function taskRecipient(effect, system) {
  const roles = system?.roleMap || {};
  const mapped = roles[effect?.roleKey] || Object.values(roles).find((r) => r?.label && r.label === effect?.roleLabel) || null;
  const chosen = text(effect?.assigneeUid, 128);
  if (chosen) return { uid: chosen, via: 'valgt' };
  if (mapped?.uid) return { uid: text(mapped.uid, 128), via: 'rolle' };
  const responsible = text(roles.system_owner?.uid || roles.quality_manager?.uid || system?.ownerUid, 128);
  return responsible ? { uid: responsible, via: 'ansvarlig' } : { uid: '', via: 'ingen' };
}

/** «Oppgave tildelt» for nye ISO-oppgaver, som HR: én melding per mottaker, flere oppgaver samles i én. */
export function assignmentNotices(created) {
  const by = new Map();
  for (const c of created || []) {
    const uid = text(c?.uid, 128);
    if (!uid || !text(c?.title)) continue;
    if (!by.has(uid)) by.set(uid, []);
    by.get(uid).push(text(c.title, 200));
  }
  return [...by.entries()].map(([uid, titles]) => (titles.length === 1
    ? { uid, title: 'Ny oppgave fra ISO', body: titles[0] }
    : { uid, title: `${titles.length} nye oppgaver fra ISO`, body: `${titles.slice(0, 3).join(' · ')}${titles.length > 3 ? ' …' : ''}` }));
}

/** Roller med navn men uten innlogging: de får ingen oppgaver, som går til ISO-ansvarlig i stedet. */
export function rolesWithoutLogin(system) {
  return Object.entries(system?.roleMap || {}).filter(([, p]) => p?.name && !p.uid).map(([role, p]) => ({ role, name: p.name }));
}

/* ───────────────────────── Varsling og eskalering ───────────────────────── */

const DAY = 24 * 3600 * 1000;

function daysLate(due, now) {
  if (!due) return 0;
  const d = Date.parse(`${String(due).slice(0, 10)}T00:00:00Z`);
  const t = Date.parse(`${todayKey(now)}T00:00:00Z`);
  return Number.isFinite(d) && t > d ? Math.round((t - d) / DAY) : 0;
}

/** Eskaleringsnivå: 1 = forfalt (påminnelse til ansvarlig og leder), 2 = mer enn 7 dager (øverste ledelse). */
export function escalationLevel(late) {
  if (late > 7) return 2;
  if (late > 0) return 1;
  return 0;
}

/**
 * Alt som har passert fristen: tiltak, triage av nye saker, åpne saker og aktive prosesstrinn.
 * Skjermede saker gir oppgaver uten detaljer.
 */
export function overdueItems(state, now = new Date()) {
  const out = [];
  for (const f of state.findings || []) {
    if (!isOpenFinding(f)) continue;
    const label = f.restricted ? `Skjermet sak ${f.number || ''}`.trim() : `${f.number} ${f.title}`;
    if (f.state === 'registrert' && f.triageDue) {
      const late = daysLate(f.triageDue, now);
      if (late) out.push({ kind: 'triage', id: f.id, findingId: f.id, restricted: !!f.restricted, hse: ['hms', 'nestenulykke', 'miljo'].includes(f.type), title: `Triage forfalt: ${label}`, due: f.triageDue, late, ownerUid: f.assigneeUid || '' });
    }
    for (const a of f.actions || []) {
      if (!['apen', 'pagar', 'returnert'].includes(a.state)) continue;
      const late = daysLate(a.dueAt, now);
      if (late) out.push({ kind: 'action', id: a.id, findingId: f.id, restricted: !!f.restricted, hse: ['hms', 'nestenulykke', 'miljo'].includes(f.type), title: `Tiltak forfalt: ${f.restricted ? label : a.title} (${f.number})`, due: a.dueAt, late, ownerUid: a.ownerUid || '' });
    }
    if (f.dueAt && !['registrert'].includes(f.state)) {
      const late = daysLate(f.dueAt, now);
      if (late) out.push({ kind: 'finding', id: f.id, findingId: f.id, restricted: !!f.restricted, hse: ['hms', 'nestenulykke', 'miljo'].includes(f.type), title: `Sak forfalt: ${label}`, due: f.dueAt, late, ownerUid: f.assigneeUid || '' });
    }
  }
  for (const inst of state.instances || []) {
    if (inst.state !== 'aktiv') continue;
    const proc = (state.processes || []).find((p) => p.id === inst.processId);
    const version = proc ? versionOf(proc, inst.version) : null;
    if (!version) continue;
    const diagram = normalizeDiagram(version.diagram);
    for (const nodeId of inst.active || []) {
      const node = diagram.nodes.find((n) => n.id === nodeId);
      if (!node?.dueDays) continue;
      const entered = [...(inst.log || [])].reverse().find((l) => l.nodeId === nodeId && l.type === 'activated')?.at;
      if (!entered) continue;
      const late = daysLate(addDays(String(entered).slice(0, 10), node.dueDays), now);
      if (late) out.push({ kind: 'step', id: `${inst.id}_${nodeId}`, instanceId: inst.id, title: `Prosesstrinn forfalt: ${node.label} – ${inst.title}`, due: addDays(String(entered).slice(0, 10), node.dueDays), late, ownerUid: '' });
    }
  }
  return out.map((x) => ({ ...x, level: escalationLevel(x.late) })).sort((a, b) => b.late - a.late);
}

/** Eskaleringsoppgaver (idempotente per frist og nivå): nivå 1 til leder for området, nivå 2 til øverste ledelse. */
export function escalationEffects(state, now = new Date()) {
  const roles = state.system?.roleMap || {};
  const qm = roles.quality_manager || roles.system_owner || {};
  const hse = roles.hse_manager || qm;
  const top = roles.top_management || qm;
  const out = [];
  for (const item of overdueItems(state, now)) {
    const lead = item.hse ? hse : qm;
    const to = item.level >= 2 ? top : lead;
    if (!to?.uid) continue;
    out.push({
      type: 'createTask',
      key: `isoesk_${item.kind}_${item.id}_${item.due}_${item.level}`.replace(/[^A-Za-z0-9_-]/g, '_'),
      title: `${item.level >= 2 ? 'Eskalert' : 'Forfalt'}: ${item.title}`,
      deadline: todayKey(now),
      assigneeUid: to.uid,
      description: item.restricted
        ? 'En skjermet sak har passert fristen. Detaljer vises bare i ISO for dem som har tilgang.'
        : `Fristen var ${item.due} (${item.late} dager siden).${item.level >= 2 ? ' Eskalert fordi den har vært forfalt i mer enn en uke.' : ''}`,
    });
  }
  return out;
}

/** Oppgaver fra ISO som er markert ferdig i Oppgaver, men ikke meldt utført i saken. */
export function actionsDoneInTasks(findings, taskStatus) {
  return openActions(findings).filter((a) => a.state === 'apen' || a.state === 'pagar' || a.state === 'returnert')
    .filter((a) => taskStatus?.[a.taskKey]?.done);
}

/* ───────────────────────── Startpakke ───────────────────────── */

/** Hva som opprettes automatisk når ledelsessystemet aktiveres (kan velges bort i veiviseren). */
export function starterPlan(system, now = new Date()) {
  const std = new Set(system?.standards || []);
  const processes = ['P02_avvik', 'P09_dokument', 'P10_internrevisjon', 'P11_ledelse', 'P06_risiko', 'P04_kundekrav', 'P05_prosjektering', 'P13_leverandor', 'P03_prosessdesign', 'P01_pdca'];
  if (std.has('ISO14001')) processes.push('P07_miljo');
  if (std.has('ISO45001')) processes.push('SJA');
  if (std.has('ISO14001') || std.has('ISO45001')) processes.push('P12_beredskap');
  const year = (now instanceof Date ? now : new Date(now)).getFullYear();
  return {
    processes,
    obligations: NORWEGIAN_OBLIGATIONS.filter((o) => o.key !== 'bhf' || std.has('ISO45001')).map((o) => o.key),
    documents: ['policy', 'avviksrutine'],
    review: { title: `Ledelsens gjennomgang ${year}`, period: String(year), meetingDate: `${year}-12-01` },
    audits: [...std].map((code, i) => ({
      title: `Internrevisjon ${STANDARDS.find((s) => s.code === code)?.label}`,
      plannedDate: addDays(todayKey(now), 60 + i * 60),
      standards: [STANDARDS.find((s) => s.code === code)?.label.replace(/:.*$/, '')],
    })),
  };
}

export function policyDraft(system) {
  const std = STANDARDS.filter((s) => (system?.standards || []).includes(s.code));
  const name = system?.name?.replace(/^Integrert ledelsessystem – /, '') || 'Virksomheten';
  return [
    `# Policy for kvalitet${std.some((s) => s.code === 'ISO14001') ? ', miljø' : ''}${std.some((s) => s.code === 'ISO45001') ? ' og arbeidsmiljø' : ''}`,
    '',
    `${name} skal levere tjenester som oppfyller kundens krav og gjeldende lover og forskrifter.`,
    '',
    'Vi forplikter oss til å:',
    '- forstå og oppfylle krav fra kunder, myndigheter og andre interessenter',
    ...(std.some((s) => s.code === 'ISO14001') ? ['- beskytte miljøet og redusere vesentlige miljøpåvirkninger i egen drift og i prosjektene vi påvirker'] : []),
    ...(std.some((s) => s.code === 'ISO45001') ? ['- sørge for et sikkert og helsefremmende arbeidsmiljø, fjerne farer og redusere risiko, og konsultere og involvere ansatte og verneombud'] : []),
    '- sette målbare mål og følge dem opp',
    '- melde, lære av og rette avvik',
    '- forbedre ledelsessystemet kontinuerlig',
    '',
    `Omfang: ${system?.scopeText || ''}`,
    '',
    '_Utkast generert av ProTop ut fra omfang og valgte standarder. Ledelsen må vurdere, tilpasse og godkjenne teksten._',
  ].join('\n');
}

export function deviationRoutineDraft() {
  return [
    '# Rutine for avvik, hendelser og forbedring',
    '',
    '1. Alle kan melde avvik, hendelser, nestenulykker og forbedringsforslag i ProTop under ISO → Avvik og forbedring.',
    '2. Kvalitets- eller HMS-leder triagerer innen tre virkedager, og samme dag ved akutt fare, mulig meldeplikt eller alvorlig personskade.',
    '3. Ved mulig meldeplikt varsles myndighet etter gjeldende regler (alvorlig personskade: Arbeidstilsynet og politi).',
    '4. Det besluttes om korrigerende tiltak trengs. Uten tiltak skal beslutningen begrunnes.',
    '5. Årsak vurderes for middels og høyere alvorlighet, og alltid for personskade, nestenulykke og miljøhendelse. Tiltak får ansvarlig og frist og blir oppgave i ProTop.',
    '6. Gjennomføring kontrolleres av en annen enn den som utførte tiltaket, og effekten verifiseres før saken lukkes av en godkjenner.',
    '7. Lukkede saker brukes som bevis i kravmatrisen og i ledelsens gjennomgang.',
    '',
    '_Utkast generert av ProTop og koblet til prosessen «Avviksbehandling». Tilpass og godkjenn._',
  ].join('\n');
}
