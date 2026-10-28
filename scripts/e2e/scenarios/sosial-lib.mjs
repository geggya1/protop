/**
 * Felles oppsett og rapportering for sosial-botene (team B):
 * venner, chat, notater, oppgaver, kalender, e-post og Hjem.
 *
 * Lager egne brukere og et eget selskap i emulatoren (aldri reset, aldri sky).
 */
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, createAuthUser, putDoc, getDoc, idToken,
} from '../lib/emu.mjs';
import { toValue } from '../../help-bot/seed.mjs';

export const OUT = join(ROOT, 'e2e-out', 'sosial');
export const FS_DOCS = 'http://127.0.0.1:8085/v1/projects/protop-c189c/databases/(default)/documents';
const MODULES = ['home', 'chat', 'friends', 'plan', 'mail', 'stars', 'notes', 'timeliste'];
const PASSWORD = 'Sosial-Bot-2026!';

/** Lager selskap med eier + kolleger, og én utenforstående med eget selskap. */
export async function setupWorld(tag = String(Date.now()).slice(-7)) {
  const p = `sosial-${tag}`;
  const companyId = `sosial-bygg-${tag}`;
  const otherCompanyId = `sosial-annen-${tag}`;
  const stamp = new Date().toISOString();
  const people = {
    eier: { email: `${p}-eier@protop.test`, name: 'Eva Eier', first: 'Eva', last: 'Eier', username: `sos${tag}eva`, company: companyId, admin: true, title: 'Daglig leder' },
    kollega: { email: `${p}-kollega@protop.test`, name: 'Kim Kollega', first: 'Kim', last: 'Kollega', username: `sos${tag}kim`, company: companyId, admin: false, title: 'Tømrer' },
    kollega2: { email: `${p}-kollega2@protop.test`, name: 'Kari Kollega', first: 'Kari', last: 'Kollega', username: `sos${tag}kari`, company: companyId, admin: false, title: 'Prosjektleder' },
    utenfor: { email: `${p}-utenfor@protop.test`, name: 'Ulf Utenfor', first: 'Ulf', last: 'Utenfor', username: `sos${tag}ulf`, company: otherCompanyId, admin: true, title: 'Daglig leder' },
  };
  const consents = {
    version: '2.0.0', termsAt: stamp, privacyAt: stamp, gdprAt: stamp, dataAt: stamp, copyrightAt: stamp, language: 'nb', marketingOptIn: false,
  };
  for (const [key, u] of Object.entries(people)) {
    u.key = key;
    u.password = PASSWORD;
    u.uid = await createAuthUser({ email: u.email, password: PASSWORD, name: u.name });
    await putDoc(`users/${u.uid}`, {
      uid: u.uid, email: u.email, name: u.name, displayName: u.name, username: u.username, usernameLower: u.username,
      profileComplete: true, homeSetupComplete: true, consents, language: 'nb', role: 'parent',
      familyId: u.company, familyIds: [u.company], activeFamilyId: u.company, createdAt: new Date(),
    });
    await putDoc(`parents/${u.uid}`, {
      uid: u.uid, name: u.name, email: u.email, username: u.username, usernameLower: u.username,
      familyId: u.company, familyIds: [u.company], admin: !!u.admin,
    });
    await putDoc(`usernames/${u.username}`, { uid: u.uid, type: 'adult', username: u.username, updatedAt: new Date() });
  }
  const moduleAccess = {};
  for (const id of MODULES) moduleAccess[id] = { activated: true, activatedAt: stamp, entitlement: 'included' };
  const mkCompany = async (id, name, members, owner) => {
    await putDoc(`families/${id}`, {
      name, type: 'company', ownerUid: owner.uid, ownerId: owner.uid, adminUids: [owner.uid],
      members: members.map((m) => m.uid), active: true, createdAt: new Date(), moduleAccessInitialized: true, moduleAccess,
      company: { navn: name, organisasjonsnummer: '999999998', naeringskode: '41.000', naeringsbeskrivelse: 'Oppføring av bygninger' },
    });
    for (const m of members) {
      await putDoc(`families/${id}/parents/${m.uid}`, {
        uid: m.uid, name: m.name, email: m.email, admin: !!m.admin, active: true, role: m.admin ? 'admin' : 'member',
      });
      await putDoc(`families/${id}/employees/emp-${m.key}`, {
        id: `emp-${m.key}`, version: 1, createdAt: stamp, updatedAt: stamp, personUid: m.uid,
        person: { firstName: m.first, lastName: m.last, email: m.email, language: 'Norsk bokmål' },
        company: {
          personnelKind: 'staff', status: 'active', external: false, canLogin: true, workPercent: '100',
          title: m.title, email: m.email, accessLevel: m.admin ? 'administrator' : 'ansatt',
        },
      });
    }
  };
  await mkCompany(companyId, `Sosial Bygg ${tag} AS`, [people.eier, people.kollega, people.kollega2], people.eier);
  await mkCompany(otherCompanyId, `Annen Bygg ${tag} AS`, [people.utenfor], people.utenfor);
  return { tag, companyId, otherCompanyId, companyName: `Sosial Bygg ${tag} AS`, people };
}

/** Firestore REST som en bestemt bruker (reglene gjelder). */
export async function asUser(user) {
  const token = await idToken(user.email, user.password);
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  return {
    token,
    async get(path) {
      const r = await fetch(`${FS_DOCS}/${path}`, { headers: h });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    },
    async list(path) {
      const r = await fetch(`${FS_DOCS}/${path}?pageSize=100`, { headers: h });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    },
    async patch(path, data, mask = null) {
      const fields = {};
      for (const [k, v] of Object.entries(data)) fields[k] = toValue(v);
      const qs = mask ? `?${mask.map((m) => `updateMask.fieldPaths=${encodeURIComponent(m)}`).join('&')}` : '';
      const r = await fetch(`${FS_DOCS}/${path}${qs}`, { method: 'PATCH', headers: h, body: JSON.stringify({ fields }) });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    },
    async create(collectionPath, data) {
      const fields = {};
      for (const [k, v] of Object.entries(data)) fields[k] = toValue(v);
      const r = await fetch(`${FS_DOCS}/${collectionPath}`, { method: 'POST', headers: h, body: JSON.stringify({ fields }) });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    },
    async del(path) {
      const r = await fetch(`${FS_DOCS}/${path}`, { method: 'DELETE', headers: h });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    },
  };
}

/** OK/AVVIK-logg per steg. Skriver JSON til e2e-out/sosial/<navn>.json. */
export class Report {
  constructor(name) {
    this.name = name;
    this.rows = [];
    mkdirSync(OUT, { recursive: true });
    this.logFile = join(OUT, `${name}.log`);
    writeFileSync(this.logFile, '');
  }

  log(line) {
    console.log(line);
    appendFileSync(this.logFile, `${line}\n`);
  }

  add(id, step, expected, ok, actual = '', shot = '', extra = {}) {
    const row = { id, step, expected, actual: String(actual || '').slice(0, 500), ok: !!ok, shot: shot ? shot.replace(`${ROOT}/`, '') : '', ...extra };
    this.rows.push(row);
    this.log(`${ok ? 'OK   ' : 'AVVIK'} [${id}] ${step}${actual ? ` — ${row.actual}` : ''}${row.shot ? ` (${row.shot})` : ''}`);
    return ok;
  }

  /** Kjør et steg; kast → AVVIK med feilmelding (merket som mulig bot-feil).
   *  Krasjer en fane (minnepress i testmiljøet), startes den på nytt og steget kjøres én gang til. */
  async step(id, step, expected, fn, { bot = null } = {}) {
    try {
      let r;
      try {
        r = await fn();
      } catch (err) {
        if (!/crash|Target closed|has been closed/i.test(String(err?.message || err)) || !this.bots) throw err;
        this.info(`${id}: nettleserfanen krasjet (miljø) — starter på nytt og prøver steget igjen`);
        for (const b of this.bots) await revive(b);
        r = await fn();
      }
      const ok = typeof r === 'object' && r !== null ? r.ok : !!r;
      const actual = typeof r === 'object' && r !== null ? r.actual : '';
      const shot = typeof r === 'object' && r !== null ? r.shot : '';
      return this.add(id, step, expected, ok, actual, shot || '');
    } catch (err) {
      const shot = bot ? await bot.shot(`feil-${id}`).catch(() => '') : '';
      return this.add(id, step, expected, false, `UNNTAK: ${String(err?.message || err).slice(0, 300)}`, shot || '', { exception: true });
    }
  }

  info(line) { this.log(`INFO  ${line}`); }

  /** UX-observasjon: logges og havner i rapporten, men gir ikke exit 1. */
  ux(id, step, expected, ok, actual = '', shot = '') {
    const row = { id, step, expected, actual: String(actual || '').slice(0, 500), ok: !!ok, ux: true, shot: shot ? shot.replace(`${ROOT}/`, '') : '' };
    this.rows.push(row);
    this.log(`${ok ? 'UX-OK' : 'UX   '} [${id}] ${step}${actual ? ` — ${row.actual}` : ''}${row.shot ? ` (${row.shot})` : ''}`);
    return ok;
  }

  finish(extra = {}) {
    const bad = this.rows.filter((r) => !r.ok && !r.ux);
    const uxBad = this.rows.filter((r) => !r.ok && r.ux);
    const total = this.rows.filter((r) => !r.ux).length;
    writeFileSync(join(OUT, `${this.name}.json`), JSON.stringify({ name: this.name, at: new Date().toISOString(), rows: this.rows, ...extra }, null, 2));
    this.log(`\n${this.name}: ${total - bad.length} OK, ${bad.length} AVVIK (+ ${uxBad.length} UX-merknader)`);
    return bad.length;
  }
}

/** Venter til en betingelse i nettleseren/node blir sann. */
export async function until(fn, { timeout = 20000, every = 500 } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); } catch { last = null; }
    if (last) return last;
    await new Promise((r) => setTimeout(r, every));
  }
  return last || null;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Teller synlige forekomster av en tekst. */
export async function visibleCount(page, text, { exact = false } = {}) {
  const loc = page.getByText(text, { exact });
  const n = await loc.count();
  let c = 0;
  for (let i = 0; i < n; i += 1) if (await loc.nth(i).isVisible().catch(() => false)) c += 1;
  return c;
}

export { getDoc };

/** Synlige elementer for en tekst (indekser). */
export async function visibleIdx(loc) {
  const n = await loc.count();
  const out = [];
  for (let i = 0; i < n; i += 1) if (await loc.nth(i).isVisible().catch(() => false)) out.push(i);
  return out;
}

/** Trykker synlig tekst; last:true velger den siste (øverste modal). */
export async function tap(bot, text, { exact = true, last = false, nth = 0, timeout = 10000, force = false } = {}) {
  const loc = typeof text === 'string' ? bot.page.getByText(text, { exact }) : text;
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const vis = await visibleIdx(loc);
    if (vis.length > nth) {
      const i = last ? vis[vis.length - 1] : vis[nth];
      try {
        await loc.nth(i).click({ timeout: 5000, force });
      } catch (err) {
        // Et varsel-popup eller en rundtur kan ligge over: lukk og prøv én gang til.
        if (!/intercepts pointer events|Timeout/.test(String(err?.message || err))) throw err;
        await clearOverlays(bot);
        await dismissPopup(bot);
        await loc.nth(i).click({ timeout: 5000, force });
      }
      await bot.page.waitForTimeout(400);
      return true;
    }
    await bot.page.waitForTimeout(300);
  }
  throw new Error(`Fant ikke «${typeof text === 'string' ? text : 'locator'}» (${bot.where})`);
}

/** Lukker rundtur og varselbanner hvis de står i veien. */
export async function clearOverlays(bot) {
  for (const label of ['Hopp over rundturen', 'Skjønner']) {
    const el = bot.page.getByText(label, { exact: true });
    for (const i of await visibleIdx(el)) {
      await el.nth(i).click({ force: true }).catch(() => {});
      await bot.page.waitForTimeout(300);
    }
  }
}

/** Åpner side og rydder overlegg. */
export async function go(bot, tab, sub = null, wait = 2500) {
  await clearOverlays(bot);
  await bot.open(tab, sub, wait);
  await clearOverlays(bot);
}

/** Venter til teksten er synlig (true/false) uten unntak. */
export async function seen(bot, text, timeout = 15000, { exact = false } = {}) {
  const loc = typeof text === 'string' ? bot.page.getByText(text, { exact }) : text;
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if ((await visibleIdx(loc)).length) return true;
    await bot.page.waitForTimeout(300);
  }
  return false;
}

/** Venter til teksten er borte. */
export async function gone(bot, text, timeout = 15000, { exact = false } = {}) {
  const loc = typeof text === 'string' ? bot.page.getByText(text, { exact }) : text;
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (!(await visibleIdx(loc)).length) return true;
    await bot.page.waitForTimeout(300);
  }
  return false;
}

/**
 * Klikker et punkt ved høyre kant av raden som inneholder teksten (for ikonknapper
 * uten navn, f.eks. avkrysningsboksen på oppgaver). dx = avstand fra høyre kant.
 */
export async function clickRowEnd(bot, text, dx = 28, { minWidth = 280 } = {}) {
  const loc = bot.page.getByText(text, { exact: false });
  const vis = await visibleIdx(loc);
  if (!vis.length) throw new Error(`Fant ikke raden «${text}»`);
  const handle = await loc.nth(vis[0]).elementHandle();
  const box = await bot.page.evaluate(([el, mw]) => {
    let cur = el;
    while (cur && cur.getBoundingClientRect().width < mw) cur = cur.parentElement;
    const r = (cur || el).getBoundingClientRect();
    return { x: r.right, y: r.top + r.height / 2 };
  }, [handle, minWidth]);
  await bot.page.mouse.click(box.x - dx, box.y);
  await bot.page.waitForTimeout(600);
}

/** Som clickRowEnd, men fra venstre kant (avkrysning på PC-tabellen). */
export async function clickRowStart(bot, text, dx = 28, { minWidth = 600 } = {}) {
  const loc = bot.page.getByText(text, { exact: false });
  const vis = await visibleIdx(loc);
  if (!vis.length) throw new Error(`Fant ikke raden «${text}»`);
  const handle = await loc.nth(vis[0]).elementHandle();
  const box = await bot.page.evaluate(([el, mw]) => {
    let cur = el;
    while (cur && cur.getBoundingClientRect().width < mw) cur = cur.parentElement;
    const r = (cur || el).getBoundingClientRect();
    return { x: r.left, y: r.top + r.height / 2 };
  }, [handle, minWidth]);
  await bot.page.mouse.click(box.x + dx, box.y);
  await bot.page.waitForTimeout(600);
}

/**
 * Starter og logger inn flere boter samtidig. spec: [['eier','desktop'], ...].
 * Hver bot får .dialogs (window.alert/confirm-tekster, godtas automatisk).
 */
export async function startBots(world, spec, BotClass) {
  const bots = {};
  await Promise.all(spec.map(async ([who, view, name]) => {
    const b = await new BotClass(name || who, { ...world.people[who], view, outDir: OUT }).start();
    b.dialogs = [];
    b.page.on('dialog', async (d) => { b.dialogs.push(d.message()); await d.accept().catch(() => {}); });
    watchCrash(b);
    await b.login();
    await waitCompany(b);
    await clearOverlays(b);
    bots[name || who] = b;
  }));
  return bots;
}

/** Tekst til venstre for/etter et merke (kort utdrag for rapporten). */
export function snippet(text, marker, len = 200) {
  const i = String(text || '').indexOf(marker);
  if (i < 0) return '';
  return text.slice(i, i + len).replace(/\s+/g, ' ');
}

/** Lukker ChatDock-vinduer og popup-er som kan ligge over innholdet. */
export async function closeDock(bot) {
  for (let i = 0; i < 3; i += 1) {
    const loc = bot.page.getByLabel('Lukk', { exact: true });
    const vis = await visibleIdx(loc);
    if (!vis.length) break;
    await loc.nth(vis[vis.length - 1]).click({ force: true }).catch(() => {});
    await bot.page.waitForTimeout(300);
  }
}

/** Lukker en varsel-popup («Lukk»/«Åpne») hvis den vises. */
export async function dismissPopup(bot) {
  const loc = bot.page.getByText('Lukk', { exact: true });
  const vis = await visibleIdx(loc);
  if (vis.length) await loc.nth(vis[vis.length - 1]).click({ force: true }).catch(() => {});
  await bot.page.waitForTimeout(300);
}

/** Varsler i innboksen til en bruker (admin-lesing). */
export async function notifs(listDocs, uid) {
  return (await listDocs(`users/${uid}/notifications`)).map((n) => ({
    id: n.id, eventType: n.eventType, title: n.title, body: n.body, chatId: n.chatId, seen: n.seen, read: n.read,
  }));
}


/** Følger med på om fanen krasjer (minnepress når mange boter kjører). */
export function watchCrash(bot) {
  bot.page.on('crash', () => { bot.crashed = true; });
}

/** Ny fane i samme kontekst (innloggingen ligger i IndexedDB) etter krasj. */
export async function revive(bot) {
  if (!bot.crashed && !bot.page.isClosed()) return false;
  try { await bot.page.close(); } catch { /* ignore */ }
  bot.page = await bot.ctx.newPage();
  bot.crashed = false;
  watchCrash(bot);
  bot.page.on('dialog', async (d) => { (bot.dialogs ||= []).push(d.message()); await d.accept().catch(() => {}); });
  await bot.goto('/');
  await bot.waitShell();
  await clearOverlays(bot);
  return true;
}


/**
 * Venter til bedriften er lastet og «Bedrift» er valgt (under last kan skallet en stund
 * stå i «Privat» med plassholdernavnet «Familien»). Velger «Bedrift» selv om nødvendig.
 */
export async function waitCompany(bot, timeout = 90000) {
  const sel = '#platform-switch-bedrift';
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const st = await bot.page.evaluate((q) => {
      const el = document.querySelector(q);
      return el ? el.getAttribute('aria-selected') : null;
    }, sel).catch(() => null);
    if (st === 'true') return true;
    if (st === 'false') await bot.page.locator(sel).first().click({ force: true }).catch(() => {});
    await bot.page.waitForTimeout(1000);
  }
  return false;
}
