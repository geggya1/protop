/**
 * Felles hjelpere for ansatt-botene (team A): stegrapport med OK/AVVIK,
 * REST mot Firestore-emulatoren med brukerens eget idToken (tester reglene,
 * ikke admin-bypass) og små UI-hjelpere oppå lib/bot.mjs.
 * Kjører bare mot lokale emulatorer og localhost:8081.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toValue } from '../../help-bot/seed.mjs';
import { fromFields, PROJECT_ID, FS } from '../lib/emu.mjs';
import { BASE } from '../lib/bot.mjs';

export const OUT_ROOT = '/home/user/protop/e2e-out/ansatt';
const DB = `projects/${PROJECT_ID}/databases/(default)/documents`;
const DOCS = `http://${FS}/v1/${DB}`;

/* ───────── Stegrapport ───────── */

export class Steps {
  constructor(name) {
    this.name = name;
    this.rows = [];
    this.started = new Date().toISOString();
  }

  /** Ett steg. ok=true → OK, ok=false → AVVIK. kind: 'app' (avvik i appen), 'env' (testmiljø), 'info'. */
  record({ step, expected = '', actual = '', ok, shot = '', id = '', sev = '', ref = '', kind = 'app' }) {
    const row = { step, expected, actual: String(actual).slice(0, 600), ok: !!ok, shot: shot || '', id, sev, ref, kind };
    this.rows.push(row);
    const tag = kind === 'env' ? 'MILJØ' : (kind === 'info' ? 'INFO ' : (ok ? 'OK   ' : 'AVVIK'));
    const extra = !ok && kind === 'app' ? ` [${[id, sev, ref].filter(Boolean).join(' · ')}]` : '';
    console.log(`${tag} ${step}${extra} — ${row.actual}`);
    return ok;
  }

  check(ok, step, expected, actual, opts = {}) {
    return this.record({ step, expected, actual, ok, ...opts });
  }

  info(step, actual, shot = '') {
    return this.record({ step, actual, ok: true, shot, kind: 'info' });
  }

  env(step, actual, shot = '') {
    return this.record({ step, actual, ok: true, shot, kind: 'env' });
  }

  get deviations() {
    return this.rows.filter((r) => !r.ok && r.kind === 'app');
  }

  save(extra = {}) {
    mkdirSync(OUT_ROOT, { recursive: true });
    const file = join(OUT_ROOT, `${this.name}-result.json`);
    writeFileSync(file, JSON.stringify({ name: this.name, started: this.started, finished: new Date().toISOString(), rows: this.rows, ...extra }, null, 2));
    const dev = this.deviations;
    console.log(`\n${this.name}: ${this.rows.filter((r) => r.kind === 'app').length} steg, ${dev.length} avvik. Resultat: ${file}`);
    for (const d of dev) console.log(`  AVVIK ${d.id || ''} ${d.sev || ''} ${d.step}`);
    return file;
  }
}

/* ───────── REST mot reglene (brukerens idToken) ───────── */

function fieldsOf(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toValue(v);
  return fields;
}

/** Feltstier for updateMask: { company: { status: 'x' } } → ['company.status']. */
function maskPaths(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : `\`${k}\``;
    const path = prefix ? `${prefix}.${key}` : key;
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && Object.keys(v).length) {
      out.push(...maskPaths(v, path));
    } else {
      out.push(path);
    }
  }
  return out;
}

async function call(method, url, token, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

/** GET som brukeren. { status, data } */
export async function rget(path, token) {
  const r = await call('GET', `${DOCS}/${path}`, token);
  return { status: r.status, data: r.json?.fields ? fromFields(r.json.fields) : null, error: r.json?.error?.message || '' };
}

/** LIST som brukeren. */
export async function rlist(path, token) {
  const r = await call('GET', `${DOCS}/${path}?pageSize=50`, token);
  return { status: r.status, count: (r.json?.documents || []).length, docs: (r.json?.documents || []).map((d) => ({ id: d.name.split('/').pop(), ...fromFields(d.fields || {}) })) };
}

/** PATCH bare feltene i obj (updateMask), som brukeren. */
export async function rpatch(path, token, obj, { create = false } = {}) {
  const mask = maskPaths(obj).map((p) => `updateMask.fieldPaths=${encodeURIComponent(p)}`).join('&');
  const exists = create ? '' : '&currentDocument.exists=true';
  const r = await call('PATCH', `${DOCS}/${path}?${mask}${exists}`, token, { fields: fieldsOf(obj) });
  return { status: r.status, error: r.json?.error?.message || '' };
}

/** arrayUnion/arrayRemove via commit, som brukeren. */
export async function rarray(path, token, field, values, { remove = false } = {}) {
  const transform = remove
    ? { fieldPath: field, removeAllFromArray: { values: values.map(toValue) } }
    : { fieldPath: field, appendMissingElements: { values: values.map(toValue) } };
  const r = await call('POST', `http://${FS}/v1/${DB}:commit`, token, {
    writes: [{ transform: { document: `${DB}/${path}`, fieldTransforms: [transform] } }],
  });
  return { status: r.status, error: r.json?.error?.message || '' };
}

export async function rdelete(path, token) {
  const r = await call('DELETE', `${DOCS}/${path}`, token);
  return { status: r.status, error: r.json?.error?.message || '' };
}

export const denied = (s) => s === 403;
export const allowed = (s) => s === 200;

/* ───────── UI ───────── */

export function tsId() {
  return Date.now().toString(36);
}

/** Lukker velkomstrunden og andre overlegg som legger seg over skallet. */
export async function skipTour(bot, rounds = 3) {
  // «Jobber…» dekker skjermen mens appen lagrer. Vent til den er borte (treg testmaskin).
  for (let w = 0; w < 60; w += 1) {
    const busy = await bot.page.evaluate(() => /Jobber…\s*\n?\s*Vent til operasjonen er ferdig/.test(document.body.innerText || '')).catch(() => false);
    if (!busy) break;
    await bot.page.waitForTimeout(1000);
  }
  for (let i = 0; i < rounds; i += 1) {
    const el = bot.page.getByText('Hopp over rundturen', { exact: true });
    let hit = false;
    if (await el.count().catch(() => 0)) {
      if (await el.first().isVisible().catch(() => false)) {
        await el.first().click({ force: true }).catch(() => {});
        hit = true;
      }
    }
    const x = bot.page.getByText('Skjønner', { exact: true });
    if (await x.count().catch(() => 0) && await x.first().isVisible().catch(() => false)) {
      await x.first().click({ force: true }).catch(() => {});
      hit = true;
    }
    if (!hit) return;
    await bot.page.waitForTimeout(400);
  }
}

/** Trykker synlig tekst. Legger rundturen seg over, lukkes den og det prøves igjen. */
export async function tap(bot, text, opts = {}) {
  await skipTour(bot, 1);
  let last;
  for (let i = 0; i < 3; i += 1) {
    try {
      return await bot.click(text, { timeout: 8000, ...opts });
    } catch (err) {
      last = err;
      await skipTour(bot, 3);
    }
  }
  // Treg maskin: siste forsøk med lengre tidsfrist på det første synlige treffet.
  const loc = bot.page.getByText(text, { exact: opts.exact !== false });
  const n = await loc.count().catch(() => 0);
  for (let i = 0; i < n; i += 1) {
    if (await loc.nth(i).isVisible().catch(() => false)) {
      await loc.nth(i).click({ timeout: 20000 });
      await bot.page.waitForTimeout(500);
      return true;
    }
  }
  throw last;
}

/** Krysser av «Jeg har lest og forstått …» hvis den ikke er krysset av. */
export async function checkConsent(bot) {
  const box = bot.page.getByRole('checkbox', { name: /Jeg har lest og forstått/ });
  if (await box.count()) {
    const on = await box.first().getAttribute('aria-checked').catch(() => null);
    if (on !== 'true') await box.first().click({ timeout: 20000 });
    return;
  }
  await tap(bot, 'Jeg har lest og forstått', { exact: false });
}

export async function tapId(bot, id, { timeout = 8000 } = {}) {
  await skipTour(bot, 1);
  const loc = bot.page.locator(`[id="${id}"]`);
  let last;
  for (let i = 0; i < 3; i += 1) {
    try {
      await loc.first().waitFor({ state: 'visible', timeout });
      await loc.first().click({ timeout: 4000 });
      await bot.page.waitForTimeout(500);
      return;
    } catch (err) {
      last = err;
      await skipTour(bot, 3);
    }
  }
  throw last;
}

export async function fillId(bot, id, value) {
  const loc = bot.page.locator(`[id="${id}"]`);
  await loc.first().waitFor({ state: 'visible', timeout: 8000 });
  await loc.first().fill(value);
  await bot.page.waitForTimeout(150);
}

export async function waitText(bot, re, timeout = 20000) {
  const until = Date.now() + timeout;
  let text = '';
  while (Date.now() < until) {
    text = await bot.visibleText().catch(() => '');
    if (re.test(text)) return text;
    await bot.page.waitForTimeout(500);
  }
  return null;
}

/** Innlogging via /login. Krysser av samtykket hvis det står ukrysset. */
export async function loginUI(bot, { wait = 8000 } = {}) {
  bot.where = 'innlogging';
  await bot.goto('/login');
  await bot.page.waitForSelector('input[type=password]', { timeout: 300000 });
  await bot.page.fill('input >> nth=0', bot.email);
  await bot.page.fill('input[type=password]', bot.password);
  const box = bot.page.getByRole('checkbox', { name: /Jeg har lest og forstått/ });
  if (await box.count()) {
    const checked = await box.first().getAttribute('aria-checked').catch(() => null);
    if (checked !== 'true') await box.first().click().catch(() => {});
  } else {
    const consent = bot.page.getByText('Jeg har lest og forstått', { exact: false });
    if (await consent.count()) await consent.first().click().catch(() => {});
  }
  await bot.page.getByText('Logg inn', { exact: true }).last().click();
  await bot.page.waitForTimeout(wait);
}

/** Venter til skallet er oppe (bryteren Privat/Bedrift finnes) og lukker rundturen. */
export async function waitShell(bot, timeout = 150000) {
  await bot.page.waitForFunction(() => !!window.__protopBot && !!document.querySelector('[id="platform-switch"]')
    && !/Laster ProTop…/.test(document.body.innerText || ''), null, { timeout });
  await bot.page.waitForTimeout(2500);
  await skipTour(bot);
}

/** Åpner en side og svarer: 'denied' (Ingen tilgang), 'locked' (modul av), 'allowed'. */
export async function pageAccess(bot, tab, sub = null) {
  await skipTour(bot, 1);
  await bot.open(tab, sub, 1800);
  let text = await bot.visibleText();
  for (let i = 0; i < 10 && /Henter tilgang…/.test(text); i += 1) {
    await bot.page.waitForTimeout(800);
    text = await bot.visibleText();
  }
  if (/Ingen tilgang\s*\n\s*Du har ikke tilgang til denne delen av bedriften/.test(text)) return 'denied';
  if (/Modulen er slått av|er slått av for bedriften/i.test(text)) return 'locked';
  return 'allowed';
}

/** Lenke fra e-post: produksjonsadressen byttes til den lokale web-serveren. */
export function localLink(url) {
  return String(url).replace(/^https:\/\/(www\.)?protop\.no/, BASE);
}

/** Tekst i navigasjonen til venstre (desktop) eller skuffen (telefon). */
export async function navText(bot) {
  return bot.page.evaluate(() => {
    const rail = document.querySelector('[data-wp-rail], nav, [role="navigation"]');
    return (rail?.innerText || '').trim();
  });
}

/* ───────── Flyter som flere skript bruker ───────── */

/** Første innlogging for en konto uten profil: profilsteget «Velkommen» → Fortsett. */
export async function loginAndSettle(bot, { name = '' } = {}) {
  await loginUI(bot);
  const until = Date.now() + 90000;
  let text = '';
  while (Date.now() < until) {
    text = await bot.visibleText().catch(() => '');
    if (/Bedriftsinvitasjon/i.test(text)) break;
    if (/Velkommen/.test(text) && /Fortsett/.test(text)) {
      if (name) {
        const field = bot.page.locator('input').first();
        if (!(await field.inputValue().catch(() => ''))) await field.fill(name).catch(() => {});
      }
      await bot.page.getByText('Fortsett', { exact: true }).first().click({ timeout: 3000 }).catch(() => {});
      await bot.page.waitForTimeout(2000);
      continue;
    }
    if (await bot.page.evaluate(() => !!window.__protopBot).catch(() => false)) break;
    await bot.page.waitForTimeout(1000);
  }
  await bot.page.waitForTimeout(2500);
  await skipTour(bot);
  return bot.visibleText();
}

/** Privat/Bedrift → Opprett ny bedrift → Registrer manuelt. */
export async function createCompanyUI(bot, name, address = '') {
  await skipTour(bot);
  await tapId(bot, 'platform-switch-bedrift');
  await bot.page.waitForTimeout(1500);
  const t = await bot.visibleText();
  if (!/Opprett ny bedrift/.test(t)) {
    // Har allerede bedrift: menyen åpnes. Bruk profilmenyen i stedet.
    await bot.page.keyboard.press('Escape').catch(() => {});
    await bot.page.evaluate(() => window.__protopBot.openShell('home', null));
    await bot.page.waitForTimeout(800);
    await bot.page.goto(`${BASE}/CreateCompany`, { waitUntil: 'domcontentloaded' });
  } else {
    await tap(bot, 'Opprett ny bedrift');
  }
  await waitText(bot, /Opprett bedrift/, 30000);
  await bot.fill('Bedriftsnavn', name);
  if (address) await bot.fill('Adresse, hvis kjent', address);
  await tap(bot, 'Registrer manuelt');
  await waitText(bot, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 30000);
  await waitShell(bot).catch(() => {});
}

/** Ansatte → Ny medarbeider → Inviter brukere. */
export async function openInvitePanel(bot) {
  await bot.open('ansatte');
  await skipTour(bot);
  await tap(bot, 'Ny medarbeider').catch(() => {});
  await tap(bot, 'Inviter brukere');
  await waitText(bot, /Inviter brukere/, 10000);
}

/** Legger én person i køen i «Inviter brukere». Panelet må være åpent. */
export async function addInvitePerson(bot, { first, last, email, level }) {
  await fillId(bot, 'employee-invite-first', first);
  await fillId(bot, 'employee-invite-last', last);
  await fillId(bot, 'employee-invite-email', email);
  await tap(bot, 'Velg');
  await bot.page.waitForTimeout(500);
  const opt = bot.page.getByText(level, { exact: true });
  const n = await opt.count();
  for (let i = n - 1; i >= 0; i -= 1) {
    if (await opt.nth(i).isVisible().catch(() => false)) { await opt.nth(i).click(); break; }
  }
  await bot.page.waitForTimeout(400);
  await tapId(bot, 'employee-invite-add');
  await bot.page.waitForTimeout(2500);
  return bot.visibleText();
}

/** Trykker Inviter og venter på svaret. */
export async function sendQueued(bot) {
  await tapId(bot, 'employee-invite-send');
  const t = await waitText(bot, /\d+ invitasjoner er sendt|Invitasjonen er sendt|ikke sendt|Kunne ikke|allerede|Du kan ikke/, 90000) || '';
  await bot.page.waitForTimeout(1500);
  return t;
}

/** Venter (maks 5 min) til maskinen har nok ledig minne før neste nettleserøkt. Testmaskinen er delt. */
export async function memGate(minMb = 3500, maxMs = 300000) {
  const { readFileSync } = await import('node:fs');
  const until = Date.now() + maxMs;
  let avail = 0;
  while (Date.now() < until) {
    const m = readFileSync('/proc/meminfo', 'utf8').match(/MemAvailable:\s+(\d+)/);
    avail = m ? Number(m[1]) / 1024 : 99999;
    if (avail >= minMb) return avail;
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log(`(lite minne: ${Math.round(avail)} MB ledig – fortsetter likevel)`);
  return avail;
}
