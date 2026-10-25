/**
 * Tilgangs-boten: hjelpen og assistenten skal følge brukerens tilgangsnivå.
 * Logger inn som eier av testbedriften og ser appen som eier, avdelingsleder
 * og ansatt («Se som bruker»). Kontrollerer at
 *
 * - «Importer fil» på Kunder bare finnes med Admin,
 * - import-steget i rundturen er låst og forklart uten Admin (ingen markering),
 * - assistenten sier hva som kreves og hvem som kan hjelpe, og ikke tilbyr
 *   «Vis meg» til sider brukeren ikke har tilgang til.
 *
 * Krever emulatorer og web som for run.mjs (se README.md):
 *   node scripts/help-bot/access.mjs --view=desktop
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { AUTH_HOST, BOT_COMPANY_ID, BOT_USER } from './seed.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

function arg(name, fallback = '') {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.includes('=') ? hit.split('=').slice(1).join('=') : 'true';
}

const BASE = arg('base', 'http://localhost:8081');
const OUT = arg('out', 'help-bot-out');
const VIEWS = { phone: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } };
const VIEW = VIEWS[arg('view', 'desktop')] ? arg('view', 'desktop') : 'desktop';
const IMPORT_STEP = 4; // «Importer kunder» på Kunder (steg 4)

const PERSONAS = [
  { id: 'eier', employeeId: '', admin: true, seesCustomers: true },
  { id: 'avdelingsleder', employeeId: 'emp-kari', admin: false, seesCustomers: true },
  { id: 'ansatt', employeeId: 'emp-ola', admin: false, seesCustomers: false },
];

const results = [];
function check(persona, name, ok, detail = '') {
  results.push({ persona, name, ok: !!ok, detail });
  console.log(`[${persona}] ${ok ? 'OK ' : 'FEIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** uid fra Auth-emulatoren (nøkkelen «Se som bruker» lagres under). */
async function botUid() {
  const res = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=helpbot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: BOT_USER.email, password: BOT_USER.password, returnSecureToken: true }),
  });
  const data = await res.json();
  if (!data.localId) throw new Error(`fant ikke bot-brukeren: ${JSON.stringify(data).slice(0, 200)}`);
  return data.localId;
}

async function open(uid, persona) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWS[VIEW] });
  await ctx.addInitScript(() => {
    const now = new Date().toISOString();
    localStorage.setItem('weekplan.lang', 'nb');
    localStorage.setItem('weekplan.consents', JSON.stringify({
      version: '2.0.0', termsAt: now, privacyAt: now, gdprAt: now, dataAt: now, copyrightAt: now, language: 'nb',
    }));
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => {
    const m = String(e?.message || e);
    if (/jsQR|importScripts|L is not defined/.test(m)) return;
    errors.push(m.slice(0, 300));
  });
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForSelector('input[type=password]', { timeout: 300000 });
  await page.fill('input >> nth=0', BOT_USER.email);
  await page.fill('input[type=password]', BOT_USER.password);
  await page.getByText('Jeg har lest og forstått', { exact: false }).first().click();
  await page.getByText('Logg inn', { exact: true }).last().click();
  await page.waitForFunction(() => !!window.__protopBot && !!document.getElementById('help-target-helpBtn'), null, { timeout: 240000 });
  await page.waitForTimeout(3000);
  const skip = page.getByText('Hopp over rundturen');
  if (await skip.count()) await skip.first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(500);
  if (persona.employeeId) {
    const banner = await viewAs(page, uid, persona.employeeId);
    check(persona.id, '«Se som bruker» er på', /Ser som/.test(banner), banner);
  }
  return { browser, page, errors };
}

async function reload(page) {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => !!window.__protopBot && !!document.getElementById('help-target-helpBtn'), null, { timeout: 240000 });
  await page.waitForTimeout(2500);
  const skip = page.getByText('Hopp over rundturen');
  if (await skip.count()) await skip.first().click({ force: true }).catch(() => {});
}

/** «Se som bruker» settes etter innlogging (innloggingen nullstiller valget). */
async function viewAs(page, uid, employeeId) {
  if (!employeeId) return '';
  await page.evaluate((sel) => sessionStorage.setItem('protop.viewAs', sel), JSON.stringify({ key: `${uid}:${BOT_COMPANY_ID}`, employeeId, lens: 'all' }));
  await reload(page);
  await page.waitForTimeout(1500);
  // «Ser som …» står som tekst (PC) eller som etikett på øyet (mobil).
  return page.evaluate(() => (document.body.innerText.match(/Ser som [^\n]*/) || [''])[0]
    || document.querySelector('[aria-label^="Ser som"]')?.getAttribute('aria-label') || '');
}

async function openShell(page, tab, subView = null) {
  await page.evaluate(([t, s]) => window.__protopBot.openShell(t, s), [tab, subView]);
  await page.waitForTimeout(2500);
}

async function escape(page, times = 3) {
  for (let i = 0; i < times; i += 1) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
}

/** Kunder: importknappen og import-steget i rundturen. */
async function customers(page, persona) {
  await openShell(page, 'kunder');
  const helpKey = await page.evaluate(() => window.__protopHelp?.pageKey || null);
  if (!persona.seesCustomers) {
    check(persona.id, 'Kunder er stengt (siden åpnes ikke)', helpKey !== 'kunder', `hjelpeside: ${helpKey}`);
    return;
  }
  check(persona.id, 'Kunder åpnes', helpKey === 'kunder', `hjelpeside: ${helpKey}`);
  await page.locator('[aria-label="Ny kunde"]').last().click({ force: true });
  await page.waitForTimeout(900);
  const menu = await page.evaluate(() => document.body.innerText);
  const hasImport = /Importer fil/.test(menu);
  check(persona.id, persona.admin ? '«Importer fil» finnes (Admin)' : '«Importer fil» er skjult (ikke Admin)', hasImport === persona.admin);
  // Menyen lukkes ikke av Escape på web: last siden på nytt («Se som» beholdes).
  await reload(page);
  await openShell(page, 'kunder');

  await page.locator('[data-testid="help-bulb"]').first().click({ force: true });
  await page.waitForTimeout(1000);
  const card = await page.locator('[data-testid="help-page-card"]').count();
  const cardLocks = await page.locator('[data-testid="help-page-card-lock"]').count();
  check(persona.id, persona.admin ? 'hjelpekortet har ingen låste steg' : 'hjelpekortet viser låst import-steg', card > 0 && (persona.admin ? cardLocks === 0 : cardLocks >= 1), `kort: ${card}, ${cardLocks} låst`);
  await page.locator('[data-testid="help-page-card-tour"]').click({ force: true });
  await page.waitForTimeout(1500);
  for (let i = 1; i < IMPORT_STEP; i += 1) {
    await page.locator('[data-testid="help-tour-next"]').click({ force: true });
    await page.waitForTimeout(1100);
  }
  const step = await page.evaluate(() => ({
    title: document.querySelector('[data-testid="help-step-title"]')?.textContent || '',
    locked: document.querySelector('[data-testid="help-step-locked"]')?.textContent || '',
    spotlight: !!document.querySelector('[data-testid="help-spotlight"]'),
  }));
  mkdirSync(join(OUT, 'tilgang'), { recursive: true });
  await page.screenshot({ path: join(OUT, 'tilgang', `${persona.id}-kunder-steg${IMPORT_STEP}.png`) });
  if (persona.admin) {
    check(persona.id, `steg ${IMPORT_STEP} «${step.title}» er åpent`, !step.locked);
  } else {
    // Bare eieren har Admin på Kunder i testbedriften: eieren nevnes som kontakt.
    check(persona.id, `steg ${IMPORT_STEP} «${step.title}» er låst og forklart`, /Admin/.test(step.locked) && /Spør Hjelpe Bot \(Eier\)/.test(step.locked) && !step.spotlight, step.locked.slice(0, 160));
  }
  await escape(page);
}

async function ask(page, question) {
  const before = await page.locator('[data-testid="assistant-msg-bot"]').count();
  await page.locator('[data-testid="assistant-input"]').fill(question);
  await page.locator('[data-testid="assistant-send"]').click({ force: true });
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid="assistant-msg-bot"]').length > n, before, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);
  const last = page.locator('[data-testid="assistant-msg-bot"]').last();
  return {
    text: (await last.textContent().catch(() => '')) || '',
    tour: await last.locator('[data-testid="assistant-action-tour"]').count(),
    lockedSteps: await last.locator('[data-testid="assistant-step-locked"]').count(),
    last,
  };
}

async function assistant(page, persona) {
  await escape(page);
  await openShell(page, 'home');
  const ROW = '[data-testid="chat-open-assistant"]';
  const clickRow = () => page.evaluate((sel) => {
    const el = [...document.querySelectorAll(sel)].find((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth;
    });
    if (el) el.click();
    return !!el;
  }, ROW);
  if (!(await clickRow())) {
    const desk = page.locator('[aria-label="Ny chat"]');
    const fab = page.locator('[data-testid="chat-fab"]');
    if (await fab.count()) await fab.first().click({ force: true });
    else if (await desk.count()) await desk.last().click({ force: true });
    await page.waitForTimeout(1200);
    await clickRow();
  }
  await page.waitForTimeout(1400);
  await page.locator('[data-testid="assistant-reset"]').click({ force: true }).catch(() => {});
  await page.waitForTimeout(600);

  const invoice = await ask(page, 'Hvordan lager jeg en faktura?');
  if (persona.admin) {
    check(persona.id, 'faktura: steg og «Vis meg»', invoice.tour > 0 && !/ikke tilgang/.test(invoice.text));
  } else {
    check(persona.id, 'faktura: «ikke tilgang» + hvem som kan hjelpe, uten «Vis meg»', /ikke tilgang/.test(invoice.text) && /Spør/.test(invoice.text) && invoice.tour === 0, invoice.text.slice(0, 160));
  }

  const imp = await ask(page, 'Hvordan importerer jeg kunder fra Excel?');
  if (persona.admin) {
    check(persona.id, 'import: ingen lås', !imp.text.includes('🔒') && imp.lockedSteps === 0);
  } else {
    check(persona.id, 'import: sier at Admin kreves og hvem som kan hjelpe', /🔒/.test(imp.text) && /Admin/.test(imp.text) && imp.lockedSteps > 0, imp.text.slice(0, 160));
  }
  await page.screenshot({ path: join(OUT, 'tilgang', `${persona.id}-assistent.png`) });

  if (persona.seesCustomers && imp.tour > 0) {
    // «Vis meg» går rett til import-steget (låst uten Admin).
    await imp.last.locator('[data-testid="assistant-action-tour"]').first().click({ force: true });
    await page.waitForTimeout(4200);
    const st = await page.evaluate(() => ({
      help: window.__protopHelp || null,
      title: document.querySelector('[data-testid="help-step-title"]')?.textContent || '',
      locked: document.querySelector('[data-testid="help-step-locked"]')?.textContent || '',
    }));
    const atImport = st.help?.tourPageKey === 'kunder' && st.help?.mode === 'module' && st.help?.tourIndex === IMPORT_STEP - 1;
    check(persona.id, '«Vis meg» starter på import-steget', atImport && (persona.admin ? !st.locked : /Admin/.test(st.locked)), `${st.title} ${JSON.stringify(st.help)}`);
    await page.screenshot({ path: join(OUT, 'tilgang', `${persona.id}-vis-meg.png`) });
    await escape(page);
  } else if (persona.seesCustomers) {
    check(persona.id, 'import: «Vis meg» tilbys', false, 'mangler knapp');
  } else {
    check(persona.id, 'import: ingen «Vis meg» til stengt side', imp.tour === 0);
  }
}

async function main() {
  mkdirSync(join(OUT, 'tilgang'), { recursive: true });
  const uid = await botUid();
  for (const persona of PERSONAS) {
    console.log(`\n=== ${persona.id} (${VIEW}) ===`);
    const { browser, page, errors } = await open(uid, persona);
    try {
      await customers(page, persona);
      await assistant(page, persona);
    } catch (err) {
      check(persona.id, 'kjøring', false, String(err?.message || err).slice(0, 300));
    }
    check(persona.id, 'ingen sidefeil', errors.length === 0, errors.slice(0, 3).join(' | '));
    await browser.close();
  }
  const failed = results.filter((r) => !r.ok);
  const md = [
    '# Tilgangs-bot — rapport', '',
    `Kjørt ${new Date().toISOString()} mot ${BASE} (${VIEW}).`, '',
    '| Rolle | Kontroll | Resultat |', '|---|---|---|',
    ...results.map((r) => `| ${r.persona} | ${r.name} | ${r.ok ? 'OK' : `FEIL ${r.detail}`} |`),
    '',
  ].join('\n');
  writeFileSync(join(OUT, 'tilgang', 'rapport.md'), md);
  console.log(`\n${results.length - failed.length}/${results.length} OK. Rapport: ${join(OUT, 'tilgang', 'rapport.md')}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
