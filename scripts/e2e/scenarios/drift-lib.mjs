/**
 * Felles hjelpere for drift-botene (team C): frøing av eget selskap,
 * REST som innlogget bruker (de ekte Firestore-reglene), Firestore-dump
 * og en enkel OK/AVVIK-rapport per steg.
 *
 * Alt går mot de lokale emulatorene. Hver kjøring lager et nytt selskap
 * med unikt prefiks, så skriptene kan kjøres om igjen uten å nullstille noe.
 */
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, FS, PROJECT_ID, createAuthUser, idToken, putDoc, getDoc, fromFields,
} from '../lib/emu.mjs';
import { toValue } from '../../help-bot/seed.mjs';

export const OUT = join(ROOT, 'e2e-out', 'drift');
mkdirSync(OUT, { recursive: true });

export const DOCS = `http://${FS}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
export const PASSWORD = 'Drift-2026!';

export function stamp() {
  return Date.now().toString(36);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function today(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

/** Mandag i inneværende uke (YYYY-MM-DD). */
export function mondayThisWeek() {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

/* ───────── Rapport ───────── */

export class Report {
  constructor(name) {
    this.name = name;
    this.rows = [];
    this.file = join(OUT, `${name}.jsonl`);
    writeFileSync(this.file, '');
  }

  /** Registrer et steg. ok=true → OK, false → AVVIK, null → INFO (miljø/begrensning). */
  step(id, title, { expected = '', actual = '', ok = true, shot = '', note = '' } = {}) {
    const status = ok === null ? 'INFO' : (ok ? 'OK' : 'AVVIK');
    const row = { id, title, expected, actual: String(actual).slice(0, 600), status, shot: shot || '', note };
    this.rows.push(row);
    appendFileSync(this.file, `${JSON.stringify(row)}\n`);
    const tag = status === 'OK' ? 'OK   ' : (status === 'AVVIK' ? 'AVVIK' : 'INFO ');
    console.log(`${tag} [${id}] ${title}${actual ? ` — ${String(actual).slice(0, 220)}` : ''}${shot ? ` (${shot.split('/').pop()})` : ''}`);
    return ok;
  }

  check(id, title, cond, { expected = '', actual = '', shot = '', note = '' } = {}) {
    return this.step(id, title, { expected, actual, ok: !!cond, shot, note });
  }

  info(id, title, actual = '', note = '') {
    return this.step(id, title, { actual, ok: null, note });
  }

  summary() {
    const bad = this.rows.filter((r) => r.status === 'AVVIK');
    const ok = this.rows.filter((r) => r.status === 'OK');
    console.log(`\n${this.name}: ${ok.length} OK, ${bad.length} AVVIK, ${this.rows.length - ok.length - bad.length} INFO`);
    for (const r of bad) console.log(`  AVVIK [${r.id}] ${r.title}: ${r.actual}`);
    writeFileSync(join(OUT, `${this.name}.summary.json`), JSON.stringify({ at: new Date().toISOString(), rows: this.rows }, null, 2));
    return bad.length;
  }
}

/* ───────── Firestore ───────── */

export function dump(label, data) {
  const file = join(OUT, `${label}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

/** Rå REST-kall som en innlogget bruker (de ekte reglene gjelder). */
export async function rest(token, method, path, body = null, query = '') {
  const res = await fetch(`${DOCS}/${path}${query}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, json, text: text.slice(0, 500) };
}

export function fieldsOf(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toValue(v);
  return fields;
}

/** PATCH bare de gitte feltene (updateMask) som brukeren. */
export async function patchAs(token, path, obj) {
  const mask = Object.keys(obj).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  return rest(token, 'PATCH', path, { fields: fieldsOf(obj) }, `?${mask}`);
}

export async function getAs(token, path) {
  const r = await rest(token, 'GET', path);
  return { status: r.status, data: r.json?.fields ? fromFields(r.json.fields) : null };
}

/** Kjør en spørring i en samling (runQuery) som admin. */
export async function queryAdmin(parentPath, collectionId) {
  const res = await fetch(`${DOCS}/${parentPath}:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId }] } }),
  });
  const json = await res.json().catch(() => []);
  return (Array.isArray(json) ? json : []).filter((r) => r.document).map((r) => ({
    id: r.document.name.split('/').pop(),
    ...fromFields(r.document.fields || {}),
  }));
}

export async function projectState(companyId) {
  const d = await getDoc(`families/${companyId}/projects/state`);
  return d?.state || d || {};
}

export async function customers(companyId) {
  const d = await getDoc(`families/${companyId}/anbud/customers`);
  return d?.customers || [];
}

/* ───────── Frøing av selskap ───────── */

const ROLE_DEFS = {
  eier: { first: 'Eva', last: 'Eier', title: 'Daglig leder', levels: ['administrator'], admin: true },
  okonomi: { first: 'Øystein', last: 'Økonomi', title: 'Økonomisjef', levels: ['leder'] },
  pl: { first: 'Per', last: 'Prosjektleder', title: 'Prosjektleder', levels: ['iso_rolle', 'avdelingsleder'] },
  ansatt: { first: 'Anne', last: 'Ansatt', title: 'Tømrer', levels: ['ansatt'] },
  ansatt2: { first: 'Bjørn', last: 'Bas', title: 'Tømrer', levels: ['ansatt'] },
  innleid: { first: 'Ivan', last: 'Innleid', title: 'Innleid tømrer', levels: ['innleie_ekstern'], kind: 'innleid' },
};

const LEVEL_LABEL = {
  administrator: 'Administrator',
  leder: 'Øverste leder',
  avdelingsleder: 'Avdelingsleder',
  iso_rolle: 'Rolle i ISO / K-HMS',
  ansatt: 'Ansatt',
  innleie_ekstern: 'Innleie eksternt',
};

/**
 * Lager et nytt selskap med eier, økonomi (Øverste leder, ikke admin),
 * prosjektleder, to ansatte og en innleid. Returnerer id-er, brukere og tokens.
 */
export async function seedCompany(tag, { roles = Object.keys(ROLE_DEFS), companyName } = {}) {
  const companyId = `drift-${tag}`;
  const name = companyName || `Drift Bygg ${tag.toUpperCase()} AS`;
  const now = new Date();
  const iso = now.toISOString();
  const users = {};
  for (const role of roles) {
    const def = ROLE_DEFS[role];
    const email = `drift-${tag}-${role}@protop.test`;
    const display = `${def.first} ${def.last}`;
    const uid = await createAuthUser({ email, password: PASSWORD, name: display });
    users[role] = { role, email, password: PASSWORD, uid, name: display, empId: `emp-${role}`, ...def };
  }
  const uids = Object.values(users).map((u) => u.uid);
  const owner = users.eier;
  const consents = {
    version: '2.0.0', termsAt: iso, privacyAt: iso, gdprAt: iso, dataAt: iso, copyrightAt: iso, language: 'nb', marketingOptIn: false,
  };
  const moduleAccess = {};
  for (const id of ['home', 'chat', 'friends', 'plan', 'mail', 'stars', 'notes', 'timeliste']) {
    moduleAccess[id] = { activated: true, activatedAt: iso, entitlement: 'included' };
  }
  await putDoc(`families/${companyId}`, {
    name,
    type: 'company',
    language: 'nb',
    ownerUid: owner.uid,
    ownerId: owner.uid,
    adminUids: [owner.uid],
    members: uids,
    activeUsers: uids,
    active: true,
    archived: false,
    deleted: false,
    createdAt: now,
    moduleAccessInitialized: true,
    moduleAccess,
    company: {
      navn: name,
      organisasjonsnummer: '912345678',
      organisasjonsform: 'AS',
      organisasjonsformKode: 'AS',
      mva: true,
      registrertIMvaregisteret: true,
      registrertIForetaksregisteret: true,
      naeringskode: '41.000',
      naeringsbeskrivelse: 'Oppføring av bygninger',
      forretning: { lines: ['Driftveien 7'], postnummer: '0150', poststed: 'Oslo' },
      bankAccount: '12345678903',
      epostadresse: `faktura-${tag}@protop.test`,
      telefon: '22000000',
    },
  });
  for (const u of Object.values(users)) {
    await putDoc(`users/${u.uid}`, {
      uid: u.uid,
      email: u.email,
      name: u.name,
      displayName: u.name,
      profileComplete: true,
      homeSetupComplete: true,
      consents,
      language: 'nb',
      familyId: companyId,
      familyIds: [companyId],
      activeFamilyId: companyId,
      createdAt: now,
    });
    await putDoc(`parents/${u.uid}`, {
      uid: u.uid, name: u.name, email: u.email, familyId: companyId, familyIds: [companyId], admin: !!u.admin,
    });
    await putDoc(`families/${companyId}/parents/${u.uid}`, {
      uid: u.uid, name: u.name, email: u.email, admin: !!u.admin, active: true, role: u.admin ? 'admin' : 'parent', placeholder: false,
    });
    const primary = u.levels[u.levels.length - 1];
    await putDoc(`families/${companyId}/employees/${u.empId}`, {
      id: u.empId,
      version: 1,
      createdAt: iso,
      updatedAt: iso,
      personUid: u.uid,
      person: { firstName: u.first, lastName: u.last, email: u.email, language: 'Norsk bokmål' },
      company: {
        personnelKind: u.kind || 'staff',
        status: 'active',
        external: false,
        canLogin: true,
        workPercent: '100',
        title: u.title,
        email: u.email,
        employeeNumber: String(100 + Object.keys(ROLE_DEFS).indexOf(u.role)),
        accessLevels: u.levels,
        accessLevel: primary,
        accessRole: LEVEL_LABEL[primary] || primary,
        ...(u.kind === 'innleid' ? { employmentType: 'Innleid' } : { employmentType: 'Fast ansatt' }),
      },
    });
  }

  const cust = [
    {
      id: 'cust-k1', name: 'Kunde En AS', kind: 'org', orgnr: '987654321', address: 'Kundeveien 1', postalCode: '5003', place: 'Bergen',
      contactName: 'Kari Kunde', email: 'k1-gammel@protop.test', invoiceEmail: `k1-faktura-${tag}@protop.test`, phone: '40000001', customerNumber: '10001',
      ownerUid: owner.uid, ownerName: owner.name, createdAt: iso, updatedAt: iso,
    },
    {
      id: 'cust-k2', name: 'Kunde To AS', kind: 'org', orgnr: '987654322', address: 'Kundeveien 2', postalCode: '0150', place: 'Oslo',
      contactName: 'Knut Kunde', email: 'k2@protop.test', invoiceEmail: `k2-faktura-${tag}@protop.test`, phone: '40000002', customerNumber: '10002',
      ownerUid: owner.uid, ownerName: owner.name, createdAt: iso, updatedAt: iso,
    },
  ];
  await putDoc(`families/${companyId}/anbud/customers`, { customers: cust, updatedAt: iso });

  const project = (id, number, nm, customer) => ({
    id,
    name: nm,
    number,
    customerId: customer.id,
    customerNumber: customer.customerNumber,
    client: customer.name,
    orgnr: customer.orgnr,
    manager: users.pl ? users.pl.name : owner.name,
    phase: 'gjennomforing',
    status: 'aktiv',
    wasteGoal: 70,
    imageUrl: '',
    pricingModel: 'hourly',
    pricingSettings: { hourlyRate: 1000 },
    workSettings: { showInAllTimesheets: true, allowSelfJoin: true, requireDescription: false, showEstimatedHours: false, notifyOnOverrun: false },
  });
  const projects = [project('prj-100', '100', 'Rehab Kundeveien', cust[0]), project('prj-101', '101', 'Tilbygg Oslo', cust[1])];
  const activities = projects.map((p) => ({ id: `act-${p.id}`, projectId: p.id, name: 'Hovedaktivitet', owner: p.manager, billable: true }));
  const members = [];
  for (const p of projects) {
    for (const u of Object.values(users)) {
      members.push({ id: `mem-${p.id}-${u.role}`, projectId: p.id, employeeId: u.empId, name: u.name, role: u.role === 'pl' ? 'Prosjektleder' : 'Prosjektmedlem' });
    }
  }
  await putDoc(`families/${companyId}/projects/state`, {
    state: {
      projects, activities, members, activeProjectId: projects[0].id, syncedAt: iso,
    },
    updatedAt: now,
  });

  const tokens = {};
  for (const u of Object.values(users)) tokens[u.role] = await idToken(u.email, u.password);
  return { companyId, name, users, tokens, customers: cust, projects };
}

/** Henter ferskt ID-token (de varer en time i emulatoren). */
export async function token(user) {
  return idToken(user.email, user.password);
}

/* ───────── UI-hjelpere ───────── */

/**
 * Fyller første synlige input/textarea som kommer etter en synlig etikett
 * med nøyaktig denne teksten (skjemaene har etikett over feltet, ikke <label>).
 */
export async function fillAfterLabel(bot, label, value, { nth = 0, within = null } = {}) {
  const ok = await bot.page.evaluate(([lbl, n, scope]) => {
    document.querySelectorAll('[data-drift-target]').forEach((e) => e.removeAttribute('data-drift-target'));
    const root = scope ? [...document.querySelectorAll('*')].find((e) => e.innerText?.trim() === scope) || document.body : document.body;
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const labels = [...root.querySelectorAll('div,span,label,p')].filter((e) => vis(e)
      && e.childElementCount === 0 && (e.innerText || '').trim() === lbl);
    const lab = labels[n];
    if (!lab) return false;
    const inputs = [...document.querySelectorAll('input,textarea')].filter(vis);
    const hit = inputs.find((i) => lab.compareDocumentPosition(i) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (!hit) return false;
    hit.setAttribute('data-drift-target', '1');
    return true;
  }, [label, nth, within]);
  if (!ok) throw new Error(`Fant ikke feltet etter «${label}» (${bot.where})`);
  const loc = bot.page.locator('[data-drift-target]');
  await loc.fill(String(value));
  await bot.page.waitForTimeout(150);
}

/** Tekst på hele siden. */
export async function pageText(bot) {
  return bot.page.evaluate(() => document.body.innerText || '');
}

/** Venter til teksten finnes på siden. */
export async function waitText(bot, text, timeout = 15000) {
  try {
    await bot.page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

/** Synlige knapper/elementer med aria-label eller tekst (for feilsøking). */
export async function buttons(bot) {
  return bot.page.evaluate(() => [...document.querySelectorAll('[role=button],button,[aria-label]')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .map((e) => `${e.getAttribute('aria-label') || ''} | ${(e.innerText || '').slice(0, 40).replace(/\n/g, ' ')}`));
}
