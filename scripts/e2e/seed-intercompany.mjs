/**
 * Frør emulatorene med to selskaper for testen av konsernintegrasjonen:
 * Mor Bygg AS (eier mor@protop.test) og Datter Elektro AS (eier datter@protop.test).
 * Mor har et prosjekt med timepris og en sluttkunde. Datter har en elektriker og en lift til utleie.
 * Kjører bare mot 127.0.0.1, aldri mot skyen.
 */
import { toValue, PROJECT_ID, AUTH_HOST, FIRESTORE_HOST, LEGAL_VERSION, ACTIVATED_MODULES } from '../help-bot/seed.mjs';

export const MOR = { id: 'e2e-mor', name: 'Mor Bygg AS', orgnr: '911111111', email: 'mor@protop.test', person: 'Marit Mor' };
export const DATTER = { id: 'e2e-datter', name: 'Datter Elektro AS', orgnr: '922222222', email: 'datter@protop.test', person: 'Dag Datter' };
export const PARTNER = { id: 'e2e-partner', name: 'Partner Rør AS', orgnr: '944444444', email: 'partner@protop.test', person: 'Pia Partner' };
export const PASSWORD = 'E2e-Konsern-2026!';
export const MOR_PROJECT = { id: 'prj_e2e_mor1', number: '24017', name: 'Skole Fjordgata' };
export const DATTER_EMP = { id: 'emp-per', name: 'Per Elektriker' };

function assertLocal(host) {
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) throw new Error(`Nekter å frø ${host}.`);
}

export async function putDoc(path, data) {
  assertLocal(FIRESTORE_HOST);
  const fields = {};
  for (const [k, v] of Object.entries(data)) fields[k] = toValue(v);
  const url = `http://${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Firestore ${path}: ${res.status} ${await res.text()}`);
}

function fromValue(v) {
  if (!v || typeof v !== 'object') return v;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) {
    const out = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) out[k] = fromValue(val);
    return out;
  }
  return null;
}

export async function getDoc(path) {
  assertLocal(FIRESTORE_HOST);
  const url = `http://${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
  const res = await fetch(url, { headers: { Authorization: 'Bearer owner' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore get ${path}: ${res.status}`);
  const json = await res.json();
  const out = {};
  for (const [k, v] of Object.entries(json.fields || {})) out[k] = fromValue(v);
  return out;
}

export async function listDocs(path) {
  assertLocal(FIRESTORE_HOST);
  const url = `http://${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}?pageSize=300`;
  const res = await fetch(url, { headers: { Authorization: 'Bearer owner' } });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.documents || []).map((doc) => {
    const out = { id: doc.name.split('/').pop() };
    for (const [k, v] of Object.entries(doc.fields || {})) out[k] = fromValue(v);
    return out;
  });
}

async function authCall(endpoint, body, { owner = false } = {}) {
  assertLocal(AUTH_HOST);
  const res = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/${endpoint}?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(owner ? { Authorization: 'Bearer owner' } : {}) },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, json: await res.json().catch(() => ({})) };
}

async function ensureUser(email, name) {
  const signIn = await authCall('accounts:signInWithPassword', { email, password: PASSWORD, returnSecureToken: true });
  let uid = signIn.ok ? signIn.json.localId : null;
  if (!uid) {
    const created = await authCall('accounts:signUp', { email, password: PASSWORD, displayName: name, returnSecureToken: true });
    if (!created.ok) throw new Error(`signUp ${email}: ${JSON.stringify(created.json)}`);
    uid = created.json.localId;
  }
  await authCall(`projects/${PROJECT_ID}/accounts:update`, { localId: uid, emailVerified: true, displayName: name }, { owner: true });
  return uid;
}

async function seedCompany(company, uid, { employees = [], state = {}, customers = [], equipment = null }) {
  const now = new Date();
  const stamp = now.toISOString();
  const consents = { version: LEGAL_VERSION, termsAt: stamp, privacyAt: stamp, gdprAt: stamp, dataAt: stamp, copyrightAt: stamp, language: 'nb', marketingOptIn: false };
  const moduleAccess = {};
  for (const id of ACTIVATED_MODULES) moduleAccess[id] = { activated: true, activatedAt: stamp, entitlement: 'included' };
  await putDoc(`users/${uid}`, {
    uid, email: company.email, name: company.person, displayName: company.person, profileComplete: true, homeSetupComplete: true,
    consents, language: 'nb', familyId: company.id, familyIds: [company.id], activeFamilyId: company.id, createdAt: now,
  });
  await putDoc(`parents/${uid}`, { uid, name: company.person, email: company.email, familyId: company.id, familyIds: [company.id], admin: true });
  await putDoc(`families/${company.id}`, {
    name: company.name, type: 'company', ownerUid: uid, ownerId: uid, adminUids: [uid], members: [uid], activeUsers: [uid], active: true,
    createdAt: now, moduleAccessInitialized: true, moduleAccess, orgnr: company.orgnr,
    company: { navn: company.name, organisasjonsnummer: company.orgnr, naeringskode: '41.000', naeringsbeskrivelse: 'Oppføring av bygninger' },
  });
  await putDoc(`orgnrIndex/${company.orgnr}`, { orgnr: company.orgnr, familyId: company.id, source: 'claim' });
  await putDoc(`families/${company.id}/parents/${uid}`, { uid, name: company.person, email: company.email, admin: true, active: true, role: 'admin' });
  const [first, ...rest] = company.person.split(' ');
  await putDoc(`families/${company.id}/employees/emp-owner`, {
    id: 'emp-owner', version: 1, createdAt: stamp, updatedAt: stamp, personUid: uid,
    person: { firstName: first, lastName: rest.join(' '), email: company.email, language: 'Norsk bokmål' },
    company: { personnelKind: 'staff', status: 'active', external: false, canLogin: true, workPercent: '100', title: 'Daglig leder', email: company.email },
  });
  for (const emp of employees) {
    const [f, ...l] = emp.name.split(' ');
    await putDoc(`families/${company.id}/employees/${emp.id}`, {
      id: emp.id, version: 1, createdAt: stamp, updatedAt: stamp,
      person: { firstName: f, lastName: l.join(' '), email: emp.email || '', language: 'Norsk bokmål' },
      company: { personnelKind: 'staff', status: 'active', external: false, canLogin: false, workPercent: '100', title: emp.title || '', accessLevel: 'ansatt' },
    });
  }
  await putDoc(`families/${company.id}/anbud/customers`, { customers, updatedAt: stamp });
  await putDoc(`families/${company.id}/projects/state`, { state: { syncedAt: stamp, ...state }, updatedAt: now });
  if (equipment) await putDoc(`families/${company.id}/projects/equipment`, { equipment, equipmentBookings: [], personalVehicles: [], updatedAt: now });
}

export async function seedIntercompany() {
  const morUid = await ensureUser(MOR.email, MOR.person);
  const datterUid = await ensureUser(DATTER.email, DATTER.person);
  const stamp = new Date().toISOString();
  await seedCompany(MOR, morUid, {
    customers: [{ id: 'cust-slutt', name: 'Sluttkunde Kommune', kind: 'org', orgnr: '933333333', customerNumber: '1', createdAt: stamp, updatedAt: stamp }],
    state: {
      projects: [{
        id: MOR_PROJECT.id, name: MOR_PROJECT.name, number: MOR_PROJECT.number, customerId: 'cust-slutt', customerNumber: '1',
        client: 'Sluttkunde Kommune', manager: MOR.person, phase: 'utførelse', status: 'aktiv', pricingModel: 'hourly',
        pricingSettings: { hourlyRate: 1200 }, wasteGoal: 70, imageUrl: '',
      }],
      activeProjectId: MOR_PROJECT.id,
    },
  });
  await seedCompany(DATTER, datterUid, {
    employees: [{ id: DATTER_EMP.id, name: DATTER_EMP.name, title: 'Elektriker', email: 'per@datter.test' }],
    customers: [],
    state: { projects: [] },
    equipment: [{
      id: 'eq-lift', name: 'Saksheis 12 m', group: 'utstyr', category: 'annet', scope: 'company', status: 'available', bookable: true,
      rental: { enabled: true, price: 950, unit: 'dag', account: '3600', since: '2020-01-01' },
    }],
  });
  const partnerUid = await ensureUser(PARTNER.email, PARTNER.person);
  await seedCompany(PARTNER, partnerUid, { customers: [], state: { projects: [] } });
  return { morUid, datterUid, partnerUid };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedIntercompany().then((r) => console.log('seeded', r)).catch((e) => { console.error(e); process.exit(1); });
}
