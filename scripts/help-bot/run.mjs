/**
 * Hjelpe-boten: går gjennom alle ProTop-sidene i en ekte nettleser og
 * kontrollerer lyspæren, hjelpekortet, hvert steg i rundturen, alle
 * arbeidsflytene og ProTop-assistenten — på mobil, nettbrett og PC.
 *
 * Krever lokal web med emulatorer (se scripts/help-bot/README.md):
 *   node scripts/help-bot/run.mjs --views=phone,tablet,desktop
 *   node scripts/help-bot/run.mjs --views=desktop --pages=anbud.varsling,projects --no-assistant
 *
 * Skriver rapport.json, rapport.md og skjermbilder til --out (standard: help-bot-out).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { PROTOP_PAGES } from '../../src/help/protopPages.js';
import { PROTOP_PROCESSES } from '../../src/help/protopProcesses.js';
import { BOT_USER } from './seed.mjs';
import { markLimits } from '../../src/help/findTarget.js';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Fant ikke Playwright. Installer med «npm i -g playwright» (eller bruk miljøet med forhåndsinstallert Playwright).');
  process.exit(2);
}

const VIEWS = {
  phone: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1440, height: 900 },
};

function arg(name, fallback = '') {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  return process.argv.includes(`--${name}`) ? 'true' : fallback;
}

const BASE = arg('base', 'http://localhost:8081');
const OUT = arg('out', 'help-bot-out');
const VIEW_LIST = arg('views', 'phone,tablet,desktop').split(',').filter((v) => VIEWS[v]);
const PAGE_FILTER = arg('pages', '');
const RUN_ASSISTANT = arg('no-assistant') !== 'true';
const RUN_PROCESSES = arg('no-processes') !== 'true';
const SHOTS = arg('shots', 'first');

/**
 * Sider som ikke alltid kan åpnes som egen side i testbedriften:
 * underenheter krever registrerte enheter, og chat er en dokk/skuff på web.
 */
const OPTIONAL_PAGES = new Map([
  ['selskap.underenheter', 'krever registrerte underenheter'],
  ['chat', 'chat åpnes som dokk/skuff på web'],
]);

const pageKeys = Object.keys(PROTOP_PAGES)
  .filter((k) => !PAGE_FILTER || PAGE_FILTER.split(',').includes(k));

const report = {
  startedAt: new Date().toISOString(),
  base: BASE,
  views: {},
  processes: {},
  assistant: {},
};

function log(...a) { console.log(...a); }

/** Gjeldende side/fase, brukt til å merke konsollfeil. */
const phase = { now: 'innlogging' };
const RELOAD_PHASE = 'omlasting';
const isReloadError = (e) => String(e).startsWith(`[${RELOAD_PHASE}]`);

async function login(view) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWS[view] });
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
    // Kart-iframen laster Leaflet fra nettet; uten nett kaster den «L is not defined».
    if (/jsQR|importScripts|L is not defined/.test(m)) return;
    // Hvor i kjøringen feilen kom, så den kan spores til en side eller fase.
    errors.push(`[${phase.now}] ${m.slice(0, 300)}`);
  });
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForSelector('input[type=password]', { timeout: 300000 });
  await page.fill('input >> nth=0', BOT_USER.email);
  await page.fill('input[type=password]', BOT_USER.password);
  await page.getByText('Jeg har lest og forstått', { exact: false }).first().click();
  await page.getByText('Logg inn', { exact: true }).last().click();
  await page.waitForFunction(() => !!window.__protopBot && !!document.getElementById('help-target-helpBtn'), null, { timeout: 240000 });
  await page.waitForTimeout(2500);
  const skip = page.getByText('Hopp over rundturen');
  if (await skip.count()) {
    await skip.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
  }
  return { browser, page, errors };
}

async function openPage(page, nav) {
  await page.evaluate(([t, s]) => window.__protopBot.openShell(t, s || null), [nav.tab, nav.subView || null]);
  await page.waitForTimeout(2300);
}

async function closeOverlays(page) {
  for (let i = 0; i < 3; i += 1) {
    const open = await page.evaluate(() => !!document.querySelector('[data-wp-help-overlay], [data-help-card]'));
    if (!open) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
}

/**
 * Laster appen på nytt — brukes etter en rundtur der boten trykket via-knapper
 * (åpnet skjema, valgte ansatt …), så neste side starter rent.
 */
async function resetApp(page) {
  // Firestore kan kaste interne feil når lytterne rives ned midt i en
  // omlasting. Brukeren ser ikke den siden; feilene merkes og telles for seg.
  const before = phase.now;
  phase.now = RELOAD_PHASE;
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => !!window.__protopBot && !!document.getElementById('help-target-helpBtn'), null, { timeout: 240000 });
  await page.waitForTimeout(2000);
  const skip = page.getByText('Hopp over rundturen');
  if (await skip.count()) {
    await skip.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
  }
  phase.now = before;
}

/**
 * Trykker nr. `index` av elementene som faktisk ligger på skjermen.
 * Skjulte skjermer i navigasjonsstabelen har kopier av de samme knappene
 * utenfor bildet (til siden); de hoppes over. Under bretten rulles frem.
 */
async function clickOnScreen(page, selector, index = 0) {
  return page.evaluate(([sel, n]) => {
    const onScreen = [...document.querySelectorAll(sel)].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth;
    });
    const el = onScreen[n];
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  }, [selector, index]);
}

/** Lyspæren skal finnes, ligge innenfor skjermen og være øverst (ikke dekket). */
async function bulbCheck(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="help-bulb"]');
    if (!el) return { ok: false, reason: 'mangler' };
    const r = el.getBoundingClientRect();
    if (!(r.width > 10 && r.height > 10)) return { ok: false, reason: 'usynlig' };
    if (r.right > window.innerWidth || r.bottom > window.innerHeight || r.left < 0 || r.top < 0) {
      return { ok: false, reason: 'utenfor skjermen' };
    }
    const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 5, r.top + r.height / 2], [r.right - 5, r.top + r.height / 2]];
    const covered = pts.map(([x, y]) => {
      const top = document.elementFromPoint(x, y);
      return !(top && (top === el || el.contains(top)));
    });
    if (covered.some(Boolean)) return { ok: false, reason: 'dekket av annet element', covered };
    return { ok: true, rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } };
  });
}

function overlap(a, b) {
  if (!a || !b) return 0;
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

/** For bred (hel linje) eller for høy (hel seksjon) markering. Menyen (rail) er loddrett med vilje. */
function tooBig(st, anchor) {
  if (!st.hole) return false;
  const lim = markLimits(st.vw, st.vh);
  return st.hole.w > lim.buttonW + 40 || (anchor !== 'rail' && st.hole.h > lim.maxH + 40);
}

async function tourState(page) {
  return page.evaluate(() => {
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    };
    return {
      card: rect(document.querySelector('[data-testid="help-tour-card"]')),
      hole: rect(document.querySelector('[data-testid="help-spotlight"]')),
      title: document.querySelector('[data-testid="help-step-title"]')?.textContent || '',
      counter: document.querySelector('[data-testid="help-step-counter"]')?.textContent || '',
      via: document.querySelector('[data-testid="help-step-via"]')?.textContent || '',
      pending: document.querySelector('[data-testid="help-step-pending"]')?.textContent || '',
      // Markering midt i menyen (venstre) når steget ikke gjelder menyen.
      holeInMenu: (() => {
        const hole = document.querySelector('[data-testid="help-spotlight"]');
        if (!hole) return false;
        const h = hole.getBoundingClientRect();
        const cx = h.left + h.width / 2;
        const cy = h.top + h.height / 2;
        return [...document.querySelectorAll('#help-target-rail')].some((m) => {
          const r = m.getBoundingClientRect();
          return r.width > 40 && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
        });
      })(),
      help: window.__protopHelp || null,
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  });
}

/** Går gjennom rundturen og logger hvert steg. */
async function walkTour(page, expectedSteps, { shotPrefix = '' } = {}) {
  const steps = [];
  let dirty = false;
  for (let i = 0; i < expectedSteps.length + 2; i += 1) {
    await page.waitForTimeout(i === 0 ? 1600 : 1100);
    const st = await tourState(page);
    if (!st.card) break;
    const exp = expectedSteps[i] || {};
    const holeInView = !st.hole || (st.hole.x >= -2 && st.hole.y >= -2
      && st.hole.x + st.hole.w <= st.vw + 2 && st.hole.y + st.hole.h <= st.vh + 2);
    const covered = overlap(st.card, st.hole);
    const row = {
      i: i + 1,
      title: st.title,
      titleOk: !exp.title || st.title.trim() === exp.title.trim(),
      counter: st.counter,
      highlighted: !!st.hole,
      wantedButton: (exp.find || []).join(' | '),
      holeInView,
      cardCoversHole: covered > (st.hole ? st.hole.w * st.hole.h * 0.25 : 0),
      holeInMenu: st.holeInMenu && exp.anchor !== 'rail',
      // Markeringen skal være knappen, ikke en hel rad, tabell eller seksjon.
      holeTooBig: tooBig(st, exp.anchor),
      holeSize: st.hole ? `${Math.round(st.hole.w)}×${Math.round(st.hole.h)}` : null,
      pageKey: st.help?.pageKey || null,
      // Steg med knapp som verken markeres eller forklares («vises når …»).
      unexplained: !st.hole && !st.pending && (exp.find || []).length > 0,
    };
    if (shotPrefix && (SHOTS === 'all' || (SHOTS === 'first' && i === 0))) {
      await page.screenshot({ path: `${shotPrefix}-steg${i + 1}.png` });
    }
    // «Dette ligger bak …»: trykk markeringen slik en bruker gjør, og se at
    // den åpner veien videre (målknappen markeres, eller steget forklarer når).
    if (st.via && st.hole) {
      row.via = [];
      let cur = st;
      for (let k = 0; k < 3 && cur.via && cur.hole; k += 1) {
        const before = `${cur.via}|${Math.round(cur.hole.x)},${Math.round(cur.hole.y)}`;
        await page.locator('[data-testid="help-spotlight"]').click({ force: true });
        await page.waitForTimeout(1800);
        cur = await tourState(page);
        const after = `${cur.via}|${cur.hole ? `${Math.round(cur.hole.x)},${Math.round(cur.hole.y)}` : '-'}`;
        row.via.push({ click: k + 1, stuck: before === after, highlighted: !!cur.hole, via: !!cur.via, pending: !!cur.pending });
        if (before === after) break;
      }
      row.viaResolved = !!cur.card && ((cur.hole && !cur.via) || (!cur.hole && !!cur.pending));
      row.viaStuck = !row.viaResolved;
      row.viaTitleKept = cur.title.trim() === st.title.trim();
      if (shotPrefix && SHOTS !== 'none') {
        await page.screenshot({ path: `${shotPrefix}-steg${i + 1}-via.png` });
      }
      dirty = true;
    }
    steps.push(row);
    const next = page.locator('[data-testid="help-tour-next"]');
    if (!(await next.count())) break;
    await next.click({ force: true });
  }
  await page.waitForTimeout(600);
  const stillOpen = await page.evaluate(() => !!document.querySelector('[data-testid="help-tour-card"]'));
  return { steps, closedAtEnd: !stillOpen, dirty };
}

async function testPages(view, page) {
  const rows = [];
  const dir = join(OUT, view);
  mkdirSync(dir, { recursive: true });
  for (const key of pageKeys) {
    phase.now = `side ${key}`;
    const def = PROTOP_PAGES[key];
    const row = { key, label: def.label.nb, nav: def.nav };
    try {
      await closeOverlays(page);
      await openPage(page, def.nav);
      const help = await page.evaluate(() => window.__protopHelp || null);
      row.helpPageKey = help?.pageKey || null;
      row.pageMatches = row.helpPageKey === key;
      row.bulb = await bulbCheck(page);
      // Lyspæren åpner hjelpekortet for akkurat denne siden.
      await page.locator('[data-testid="help-bulb"]').first().click({ force: true });
      await page.waitForTimeout(900);
      const cardText = await page.locator('[data-testid="help-page-card"]').first().textContent().catch(() => '');
      row.card = {
        shown: !!cardText,
        titleOk: !!cardText && cardText.includes(def.title.nb),
        pathOk: !!cardText && cardText.includes(def.path.nb),
        stepsOk: !!cardText && def.steps.every((s) => cardText.includes(s.title.nb)),
      };
      if (SHOTS !== 'none') await page.screenshot({ path: join(dir, `${key}-kort.png`) });
      if (row.card.shown) {
        await page.locator('[data-testid="help-page-card-tour"]').click({ force: true });
        const expected = def.steps.map((s) => ({ title: s.title.nb, find: [...(s.find || []), ...(s.via || [])], anchor: s.anchor }));
        row.tour = await walkTour(page, expected, { shotPrefix: SHOTS === 'none' ? '' : join(dir, key) });
        row.tour.count = row.tour.steps.length;
        row.tour.expected = expected.length;
      }
    } catch (err) {
      row.error = String(err?.message || err).slice(0, 300);
    }
    const t = row.tour;
    row.ok = !row.error
      && row.bulb?.ok
      && row.pageMatches
      && row.card?.shown && row.card.titleOk && row.card.stepsOk
      && t && t.count === t.expected && t.closedAtEnd
      && t.steps.every((s) => s.titleOk && s.holeInView && !s.cardCoversHole && !s.holeInMenu && !s.holeTooBig && !s.viaStuck && s.viaTitleKept !== false);
    if (!row.ok && OPTIONAL_PAGES.has(key) && !row.pageMatches) row.skipped = OPTIONAL_PAGES.get(key);
    const unexplained = (row.tour?.steps || []).filter((s) => s.unexplained).map((s) => s.i);
    const viaSteps = (row.tour?.steps || []).filter((s) => s.via);
    log(`[${view}] ${row.ok ? 'OK ' : row.skipped ? 'SKIP' : 'FEIL'} ${key}`
      + `${row.tour ? ` — ${row.tour.steps.filter((s) => s.highlighted).length}/${row.tour.count} steg markert` : ''}`
      + `${viaSteps.length ? `, ${viaSteps.filter((s) => s.viaResolved).length}/${viaSteps.length} «trykk for å åpne» virket` : ''}`
      + `${unexplained.length ? `, uforklart steg ${unexplained.join(',')}` : ''}`
      + `${row.ok || row.skipped ? '' : ` ${JSON.stringify({
        bulb: row.bulb?.reason,
        page: row.pageMatches,
        card: row.card,
        tour: t ? {
          count: `${t.count}/${t.expected}`,
          closed: t.closedAtEnd,
          bad: t.steps.filter((s) => !s.titleOk || !s.holeInView || s.cardCoversHole || s.holeInMenu || s.holeTooBig || s.viaStuck || s.viaTitleKept === false)
            .map((s) => ({
              i: s.i, title: s.title, titleOk: s.titleOk, inView: s.holeInView, covered: s.cardCoversHole, menu: s.holeInMenu, tooBig: s.holeTooBig ? s.holeSize : undefined, via: s.via, viaTitleKept: s.viaTitleKept,
            })),
        } : null,
        err: row.error,
      })}`}`);
    rows.push(row);
    // Via-trykk og chat-siden (åpner «Ny chat» i dokken) etterlater tilstand: last på nytt.
    if (row.tour?.dirty || row.error || key === 'chat') await resetApp(page).catch(() => {});
  }
  return rows;
}

async function testProcesses(view, page) {
  const out = {};
  await resetApp(page).catch(() => {});
  for (const proc of Object.values(PROTOP_PROCESSES)) {
    phase.now = `arbeidsflyt ${proc.id}`;
    await closeOverlays(page);
    await openPage(page, { tab: 'more', subView: 'help' });
    const idx = Object.keys(PROTOP_PROCESSES).indexOf(proc.id);
    if (!(await clickOnScreen(page, '[data-testid="help-flow-start"]', idx))) {
      out[proc.id] = { ok: false, error: 'fant ikke Start-knappen i hjelpesenteret' };
      continue;
    }
    const steps = [];
    for (let i = 0; i < proc.steps.length; i += 1) {
      await page.waitForTimeout(2600);
      const st = await tourState(page);
      const want = proc.steps[i];
      steps.push({
        i: i + 1,
        wantPage: want.page,
        gotPage: st.help?.pageKey || null,
        pageOk: st.help?.pageKey === want.page,
        title: st.title,
        titleOk: st.title.trim() === want.title.nb,
        highlighted: !!st.hole,
        cardCoversHole: overlap(st.card, st.hole) > (st.hole ? st.hole.w * st.hole.h * 0.25 : 0),
        holeTooBig: tooBig(st, want.anchor),
      });
      if (i === 0 && SHOTS !== 'none') await page.screenshot({ path: join(OUT, view, `flyt-${proc.id}-steg1.png`) });
      const next = page.locator('[data-testid="help-tour-next"]');
      if (!(await next.count())) break;
      await next.click({ force: true });
    }
    await page.waitForTimeout(800);
    const closed = await page.evaluate(() => !document.querySelector('[data-testid="help-tour-card"]'));
    const ok = steps.length === proc.steps.length && steps.every((s) => s.pageOk && s.titleOk && !s.cardCoversHole && !s.holeTooBig) && closed;
    out[proc.id] = { ok, steps, closedAtEnd: closed };
    log(`[${view}] ${ok ? 'OK ' : 'FEIL'} arbeidsflyt ${proc.id} — ${steps.filter((s) => s.pageOk).length}/${proc.steps.length} sider riktig, ${steps.filter((s) => s.highlighted).length} markert`);
  }
  return out;
}

const QUESTIONS = [
  { q: 'Hvordan fører jeg timer?', expect: /Timeliste/ },
  { q: 'hvordan lager jeg faktura', expect: /Faktura/ },
  { q: 'Hvor finner jeg kjøreboken?', expect: /Kjørebok/ },
  { q: 'Hvordan legger jeg til en ny ansatt?', expect: /Ansatte/ },
  { q: 'Hvorfor får jeg ingen anbudstreff?', expect: /Anbudsvarsling/ },
  { q: 'Vis meg hele flyten fra anbud til faktura', expect: /Fra anbud til faktura/ },
  { q: 'Hvordan melder jeg et avvik?', expect: /Avvik/ },
  { q: 'Hvordan søker jeg ferie?', expect: /Planlagt fravær|ferie/i },
  { q: 'Hva blir været i morgen?', expect: /bare om ProTop/ },
  { q: 'Er Tripletex bedre enn ProTop?', expect: /ProTop/ },
  { q: 'Appen viser hvit skjerm', expect: /Kontakt support|support/i },
];

/** Åpner assistenten fra chatten (PC: skriv-knappen, mobil/nettbrett: chat-boblen). */
async function openAssistantPanel(page) {
  const ROW = '[data-testid="chat-open-assistant"]';
  if (await clickOnScreen(page, ROW)) return;
  const desk = page.locator('[aria-label="Ny chat"]');
  const fab = page.locator('[data-testid="chat-fab"]');
  if (await fab.count()) await fab.first().click({ force: true });
  else if (await desk.count()) await desk.last().click({ force: true });
  await page.waitForTimeout(1200);
  if (!(await clickOnScreen(page, ROW))) throw new Error('fant ikke «ProTop-assistent» i chatten');
}

/** Testbedriften får ledelsessystemet aktivert, så ISO-sidene har ekte knapper. */
async function prepareIso(page) {
  await openPage(page, { tab: 'iso', subView: 'innstillinger' });
  const activate = page.getByText('Aktiver ledelsessystemet', { exact: true });
  if (!(await activate.count())) return 'allerede aktivert';
  await activate.last().click({ force: true });
  await page.waitForTimeout(3500);
  const still = await page.getByText('Aktiver ledelsessystemet', { exact: true }).count();
  return still ? 'kunne ikke aktiveres automatisk' : 'aktivert';
}

async function testAssistant(view, page) {
  phase.now = 'assistent';
  const res = { answers: [] };
  await closeOverlays(page);
  await openPage(page, { tab: 'home' });
  await openAssistantPanel(page);
  await page.waitForTimeout(1400);
  // Ny samtale, så tidligere svar ikke teller med.
  await page.locator('[data-testid="assistant-reset"]').click({ force: true }).catch(() => {});
  await page.waitForTimeout(600);
  for (const { q, expect } of QUESTIONS) {
    const before = await page.locator('[data-testid="assistant-msg-bot"]').count();
    await page.locator('[data-testid="assistant-input"]').fill(q);
    await page.locator('[data-testid="assistant-send"]').click({ force: true });
    await page.waitForFunction((n) => document.querySelectorAll('[data-testid="assistant-msg-bot"]').length > n, before, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(400);
    const text = await page.locator('[data-testid="assistant-msg-bot"]').last().textContent().catch(() => '');
    const ok = expect.test(text || '');
    res.answers.push({ q, ok, excerpt: String(text || '').slice(0, 160) });
    log(`[${view}] ${ok ? 'OK ' : 'FEIL'} assistent: «${q}»`);
  }
  await page.screenshot({ path: join(OUT, view, 'assistent-svar.png') });
  // Supportflyt: be om et menneske og send sak.
  phase.now = 'assistent: supportsak';
  await page.locator('[data-testid="assistant-input"]').fill('Kan jeg snakke med et menneske?');
  await page.locator('[data-testid="assistant-send"]').click({ force: true });
  await page.waitForTimeout(1500);
  await page.locator('[data-testid="assistant-action-support"]').last().click({ force: true }).catch(() => {});
  await page.waitForTimeout(800);
  res.supportCard = (await page.locator('[data-testid="assistant-support-card"]').count()) > 0;
  if (res.supportCard) {
    await page.locator('[data-testid="assistant-support-title"]').fill('Test fra hjelpe-boten');
    await page.locator('[data-testid="assistant-support-send"]').click({ force: true });
    await page.waitForTimeout(6000);
    const last = await page.locator('[data-testid="assistant-msg-bot"]').last().textContent().catch(() => '');
    res.ticketSent = /Saken er sendt/.test(last || '');
  }
  log(`[${view}] ${res.supportCard && res.ticketSent ? 'OK ' : 'FEIL'} assistent: supportsak`);
  phase.now = 'assistent: vis meg';
  // «Vis meg» fra et svar åpner siden og starter rundturen.
  await page.locator('[data-testid="assistant-input"]').fill('Hvordan registrerer jeg en ny kunde?');
  await page.locator('[data-testid="assistant-send"]').click({ force: true });
  await page.waitForTimeout(1800);
  await page.locator('[data-testid="assistant-action-tour"]').last().click({ force: true }).catch(() => {});
  await page.waitForTimeout(3800);
  const st = await tourState(page);
  res.showMe = { pageKey: st.help?.pageKey, mode: st.help?.mode, title: st.title };
  res.showMeOk = st.help?.pageKey === 'kunder' && st.help?.mode === 'module' && !!st.card;
  await page.screenshot({ path: join(OUT, view, 'assistent-vis-meg.png') });
  log(`[${view}] ${res.showMeOk ? 'OK ' : 'FEIL'} assistent: «Vis meg» → ${JSON.stringify(res.showMe)}`);
  await closeOverlays(page);

  // Presisjon: oppgavesvar med eksakte steg, tips, og «Vis meg» fra riktig steg.
  phase.now = 'assistent: fravær';
  await openPage(page, { tab: 'home' });
  await openAssistantPanel(page);
  await page.waitForTimeout(1200);
  const before = await page.locator('[data-testid="assistant-msg-bot"]').count();
  await page.locator('[data-testid="assistant-input"]').fill('Hvordan føre fravær?');
  await page.locator('[data-testid="assistant-send"]').click({ force: true });
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid="assistant-msg-bot"]').length > n, before, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);
  const last = page.locator('[data-testid="assistant-msg-bot"]').last();
  const absenceText = (await last.textContent().catch(() => '')) || '';
  const hasTip = (await last.locator('[data-testid="assistant-after"]').count()) > 0;
  const processBtn = await last.locator('[data-testid="assistant-action-process"]').count();
  await page.screenshot({ path: join(OUT, view, 'assistent-fravaer.png') });
  await last.locator('[data-testid="assistant-action-tour"]').first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(4200);
  const ab = await tourState(page);
  res.absence = {
    steps: /Legg til fravær \/ ferie/.test(absenceText) && /7:30 er en hel dag/.test(absenceText),
    tip: hasTip,
    noFlow: processBtn === 0,
    tour: { pageKey: ab.help?.tourPageKey, index: ab.help?.tourIndex, title: ab.title },
  };
  res.absenceOk = res.absence.steps && res.absence.tip && res.absence.noFlow
    && ab.help?.tourPageKey === 'timeliste' && ab.help?.tourIndex === 2 && /Fravær/.test(ab.title);
  await page.screenshot({ path: join(OUT, view, 'assistent-fravaer-vis-meg.png') });
  log(`[${view}] ${res.absenceOk ? 'OK ' : 'FEIL'} assistent: «Hvordan føre fravær?» → ${JSON.stringify(res.absence)}`);
  await closeOverlays(page);

  res.ok = res.answers.every((a) => a.ok) && res.supportCard && res.ticketSent && res.showMeOk && res.absenceOk;
  return res;
}

function markdown() {
  const lines = ['# Hjelpe-bot — rapport', '', `Kjørt ${report.startedAt} mot ${report.base}.`, ''];
  for (const [view, data] of Object.entries(report.views)) {
    const rows = data.pages || [];
    const ok = rows.filter((r) => r.ok).length;
    const skipped = rows.filter((r) => r.skipped).length;
    const steps = rows.flatMap((r) => r.tour?.steps || []);
    lines.push(`## ${view}`, '');
    lines.push(`- Sider OK: ${ok}/${rows.length - skipped}${skipped ? ` (${skipped} hoppet over)` : ''}`);
    lines.push(`- Lyspære synlig og trykkbar: ${rows.filter((r) => r.bulb?.ok).length}/${rows.length}`);
    lines.push(`- Steg i rundturer: ${steps.length}, markert knapp: ${steps.filter((s) => s.highlighted).length}`);
    const via = steps.filter((s) => s.via);
    lines.push(`- «Trykk for å åpne» (via): ${via.filter((s) => s.viaResolved).length}/${via.length} førte videre`);
    const unexplained = rows.flatMap((r) => (r.tour?.steps || []).filter((s) => s.unexplained).map((s) => `${r.key} #${s.i}`));
    lines.push(`- Steg uten markering og uten forklaring: ${unexplained.length}${unexplained.length ? ` (${unexplained.join(', ')})` : ''}`);
    const reloadErrors = (data.errors || []).filter(isReloadError).length;
    lines.push(`- Konsollfeil: ${(data.errors || []).length - reloadErrors}${reloadErrors ? ` (+ ${reloadErrors} under boten sin omlasting av appen, ikke synlig for brukeren)` : ''}`);
    const bad = rows.filter((r) => !r.ok && !r.skipped);
    if (bad.length) {
      lines.push('', '| Side | Problem |', '|---|---|');
      for (const r of bad) {
        lines.push(`| ${r.key} | ${r.error || JSON.stringify({ bulb: r.bulb?.reason, page: r.pageMatches, card: r.card })} |`);
      }
    }
    if (data.processes) {
      lines.push('', '| Arbeidsflyt | Resultat |', '|---|---|');
      for (const [id, p] of Object.entries(data.processes)) {
        lines.push(`| ${id} | ${p.ok ? 'OK' : 'FEIL'} (${(p.steps || []).filter((s) => s.pageOk).length}/${(p.steps || []).length} sider) |`);
      }
    }
    if (data.assistant) {
      const a = data.assistant;
      lines.push('', `Assistent: ${a.ok ? 'OK' : 'FEIL'} — ${a.answers.filter((x) => x.ok).length}/${a.answers.length} svar, supportsak ${a.ticketSent ? 'sendt' : 'ikke sendt'}, «Vis meg» ${a.showMeOk ? 'OK' : 'feilet'}, presist fraværssvar ${a.absenceOk ? 'OK' : 'feilet'}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  let failed = false;
  for (const view of VIEW_LIST) {
    log(`\n=== ${view} (${VIEWS[view].width}×${VIEWS[view].height}) ===`);
    const { browser, page, errors } = await login(view);
    const data = {};
    data.iso = await prepareIso(page).catch((err) => `feil: ${err?.message || err}`);
    log(`[${view}] ISO: ${data.iso}`);
    data.pages = await testPages(view, page);
    if (RUN_PROCESSES) {
      data.processes = await testProcesses(view, page).catch((err) => ({ error: { ok: false, error: String(err?.message || err).slice(0, 300) } }));
    }
    if (RUN_ASSISTANT) {
      data.assistant = await testAssistant(view, page).catch((err) => ({ ok: false, answers: [], error: String(err?.message || err).slice(0, 300) }));
    }
    data.errors = errors;
    report.views[view] = data;
    failed = failed
      || data.pages.some((r) => !r.ok && !r.skipped)
      || Object.values(data.processes || {}).some((p) => !p.ok)
      || (data.assistant && !data.assistant.ok)
      || errors.some((e) => !isReloadError(e));
    await browser.close();
    writeFileSync(join(OUT, 'rapport.json'), JSON.stringify(report, null, 2));
    writeFileSync(join(OUT, 'rapport.md'), markdown());
  }
  log(`\nRapport: ${join(OUT, 'rapport.md')}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
