/**
 * Frør Auth- og Firestore-emulatorene med én testbedrift og én eier,
 * så hjelpe-boten kan logge inn og gå gjennom alle sidene.
 * Kjører bare mot 127.0.0.1 — aldri mot protop-c189c i skyen.
 *
 *   node scripts/help-bot/seed.mjs
 */

export const PROJECT_ID = 'protop-c189c';
export const AUTH_HOST = process.env.HELPBOT_AUTH_HOST || '127.0.0.1:9099';
export const FIRESTORE_HOST = process.env.HELPBOT_FIRESTORE_HOST || '127.0.0.1:8085';

export const BOT_USER = {
  email: 'hjelpebot@protop.test',
  password: 'Hjelpebot-2026!',
  name: 'Hjelpe Bot',
};
export const BOT_COMPANY_ID = 'helpbot-bygg';
export const LEGAL_VERSION = '2.0.0';
export const ACTIVATED_MODULES = ['home', 'chat', 'friends', 'plan', 'mail', 'stars', 'notes', 'timeliste'];

function assertLocal(host) {
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) {
    throw new Error(`Nekter å frø ${host}: bare lokale emulatorer er lov.`);
  }
}

/** JS-verdi → Firestore REST Value. */
export function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = toValue(val);
    return { mapValue: { fields } };
  }
  throw new Error(`Ukjent verdi: ${typeof v}`);
}

async function putDoc(path, data) {
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

async function authCall(endpoint, body, { owner = false } = {}) {
  assertLocal(AUTH_HOST);
  const url = `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/${endpoint}?key=fake-api-key`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(owner ? { Authorization: 'Bearer owner' } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

async function ensureUser() {
  const signIn = await authCall('accounts:signInWithPassword', {
    email: BOT_USER.email,
    password: BOT_USER.password,
    returnSecureToken: true,
  });
  let uid = signIn.ok ? signIn.json.localId : null;
  if (!uid) {
    const created = await authCall('accounts:signUp', {
      email: BOT_USER.email,
      password: BOT_USER.password,
      displayName: BOT_USER.name,
      returnSecureToken: true,
    });
    if (!created.ok) throw new Error(`signUp: ${JSON.stringify(created.json)}`);
    uid = created.json.localId;
  }
  const verified = await authCall(
    `projects/${PROJECT_ID}/accounts:update`,
    { localId: uid, emailVerified: true, displayName: BOT_USER.name },
    { owner: true },
  );
  if (!verified.ok) throw new Error(`verify: ${JSON.stringify(verified.json)}`);
  return uid;
}

export async function seed() {
  const uid = await ensureUser();
  const now = new Date();
  const stamp = now.toISOString();
  const consents = {
    version: LEGAL_VERSION,
    termsAt: stamp,
    privacyAt: stamp,
    gdprAt: stamp,
    dataAt: stamp,
    copyrightAt: stamp,
    language: 'nb',
    marketingOptIn: false,
  };

  await putDoc(`users/${uid}`, {
    uid,
    email: BOT_USER.email,
    name: BOT_USER.name,
    displayName: BOT_USER.name,
    profileComplete: true,
    homeSetupComplete: true,
    consents,
    language: 'nb',
    familyId: BOT_COMPANY_ID,
    familyIds: [BOT_COMPANY_ID],
    activeFamilyId: BOT_COMPANY_ID,
    createdAt: now,
  });
  await putDoc(`parents/${uid}`, {
    uid,
    name: BOT_USER.name,
    email: BOT_USER.email,
    familyId: BOT_COMPANY_ID,
    familyIds: [BOT_COMPANY_ID],
    admin: true,
  });
  // Personlige moduler er aktivert, så boten ser selve sidene og ikke aktiveringskortet.
  const moduleAccess = {};
  for (const id of ACTIVATED_MODULES) {
    moduleAccess[id] = { activated: true, activatedAt: stamp, entitlement: 'included' };
  }
  await putDoc(`families/${BOT_COMPANY_ID}`, {
    name: 'Hjelpebot Bygg AS',
    type: 'company',
    ownerUid: uid,
    ownerId: uid,
    adminUids: [uid],
    members: [uid],
    active: true,
    createdAt: now,
    moduleAccessInitialized: true,
    moduleAccess,
    company: {
      navn: 'Hjelpebot Bygg AS',
      organisasjonsnummer: '999999999',
      naeringskode: '41.000',
      naeringsbeskrivelse: 'Oppføring av bygninger',
    },
  });
  await putDoc(`families/${BOT_COMPANY_ID}/parents/${uid}`, {
    uid,
    name: BOT_USER.name,
    email: BOT_USER.email,
    admin: true,
    active: true,
    role: 'admin',
  });
  const employee = (id, person, company, extra = {}) => putDoc(`families/${BOT_COMPANY_ID}/employees/${id}`, {
    id,
    version: 1,
    createdAt: stamp,
    updatedAt: stamp,
    person: { language: 'Norsk bokmål', ...person },
    company: {
      personnelKind: 'staff',
      status: 'active',
      external: false,
      canLogin: false,
      workPercent: '100',
      ...company,
    },
    ...extra,
  });
  await employee('emp-bot', { firstName: 'Hjelpe', lastName: 'Bot', email: BOT_USER.email }, {
    title: 'Daglig leder', canLogin: true, email: BOT_USER.email,
  }, { personUid: uid });
  await employee('emp-ola', { firstName: 'Ola', lastName: 'Tømrer', email: 'ola@protop.test' }, {
    title: 'Tømrer', email: 'ola@protop.test', accessLevel: 'ansatt',
  });
  await employee('emp-kari', { firstName: 'Kari', lastName: 'Prosjektleder', email: 'kari@protop.test' }, {
    title: 'Prosjektleder', email: 'kari@protop.test', accessLevel: 'avdelingsleder',
  });

  // Én kunde, ett prosjekt og et fakturautkast, så stegene inne i kundekort,
  // prosjekt og faktura også blir testet (markering og «trykk for å åpne»).
  await putDoc(`families/${BOT_COMPANY_ID}/anbud/customers`, {
    customers: [{
      id: 'cust-bot-1',
      name: 'Fjordbygg AS',
      kind: 'org',
      orgnr: '987654321',
      address: 'Fjordgata 1',
      postalCode: '5003',
      place: 'Bergen',
      contactName: 'Per Fjord',
      email: 'per@fjordbygg.test',
      phone: '40000000',
      customerNumber: '1',
      ownerUid: uid,
      ownerName: BOT_USER.name,
      createdAt: stamp,
      updatedAt: stamp,
    }],
    updatedAt: stamp,
  });
  await putDoc(`families/${BOT_COMPANY_ID}/projects/state`, {
    projects: [{
      id: 'prj-bot-1',
      name: 'Kontorbygg Fjordgata',
      number: '1001',
      customerId: 'cust-bot-1',
      client: 'Fjordbygg AS',
      manager: BOT_USER.name,
      phase: 'planlegging',
      status: 'aktiv',
      wasteGoal: 70,
      imageUrl: '',
    }],
    activeProjectId: 'prj-bot-1',
    syncedAt: stamp,
  });
  const today = stamp.slice(0, 10);
  const due = new Date(now.getTime() + 14 * 86400000).toISOString().slice(0, 10);
  await putDoc(`families/${BOT_COMPANY_ID}/invoices/inv-bot-1001`, {
    id: 'inv-bot-1001',
    invoiceNumber: '1001',
    invoiceDate: today,
    dueDate: due,
    customerId: 'cust-bot-1',
    customerNumber: '1',
    customerName: 'Fjordbygg AS',
    projectId: 'prj-bot-1',
    projectNumber: '1001',
    projectName: 'Kontorbygg Fjordgata',
    status: 'draft',
    currency: 'NOK',
    amountExVat: 10000,
    vat: 2500,
    amountInclVat: 12500,
    createdAt: stamp,
    updatedAt: stamp,
  });
  return { uid, companyId: BOT_COMPANY_ID };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .then((r) => console.log('seeded', r))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
