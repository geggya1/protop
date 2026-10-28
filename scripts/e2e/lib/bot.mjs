/**
 * En test-bruker i sin egen nettleser (Playwright). Flere boter kan kjøre
 * samtidig og jobbe mot hverandre: én inviterer, en annen godtar, osv.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Fant ikke Playwright. Bruk miljøet med forhåndsinstallert Playwright.');
  process.exit(2);
}

export const VIEWS = {
  phone: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1440, height: 900 },
};

export const BASE = process.env.E2E_BASE || 'http://localhost:8081';

/** Feil som kommer fra testmiljøet (ingen nett), ikke fra appen. */
const ENV_NOISE = /jsQR|importScripts|L is not defined|Failed to fetch dynamically|ERR_INTERNET|net::ERR|Leaflet|fonts\.g|tile\.openstreetmap/i;

let sharedBrowser = null;
export async function browser() {
  if (!sharedBrowser) sharedBrowser = await chromium.launch();
  return sharedBrowser;
}
export async function closeBrowser() {
  if (sharedBrowser) await sharedBrowser.close().catch(() => {});
  sharedBrowser = null;
}

export class Bot {
  constructor(name, { email, password, view = 'desktop', outDir, consents = true } = {}) {
    this.name = name;
    this.email = email;
    this.password = password;
    this.view = view;
    this.outDir = outDir;
    this.consents = consents;
    this.errors = [];
    this.failedCalls = [];
    this.shotNo = 0;
  }

  async start() {
    const b = await browser();
    this.ctx = await b.newContext({
      viewport: VIEWS[this.view],
      locale: 'nb-NO',
      timezoneId: 'Europe/Oslo',
      deviceScaleFactor: 1,
      isMobile: this.view === 'phone',
      hasTouch: this.view !== 'desktop',
    });
    // Varsler tillatt, ellers dekker «Varsler er blokkert»-stripen toppen av hver side.
    await this.ctx.grantPermissions(['notifications'], { origin: BASE }).catch(() => {});
    if (this.consents) {
      // Init-skript kjører også i sandkassede rammer (kart) uten localStorage; hopp over dem.
      await this.ctx.addInitScript(() => {
        if (window.top !== window) return;
        const now = new Date().toISOString();
        localStorage.setItem('protop.lang', 'nb');
        localStorage.setItem('protop.consents', JSON.stringify({
          version: '2.0.0', termsAt: now, privacyAt: now, gdprAt: now, dataAt: now, copyrightAt: now, language: 'nb',
        }));
      });
    } else {
      await this.ctx.addInitScript(() => { if (window.top === window) localStorage.setItem('protop.lang', 'nb'); });
    }
    this.page = await this.ctx.newPage();
    this.page.on('pageerror', (e) => {
      const m = String(e?.message || e);
      if (ENV_NOISE.test(m)) return;
      this.errors.push({ at: this.where || '', message: m.slice(0, 400) });
    });
    this.page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const m = msg.text();
      if (ENV_NOISE.test(m)) return;
      if (/Download the React DevTools|ResizeObserver loop|Failed to load resource/.test(m)) return;
      this.errors.push({ at: this.where || '', console: true, message: m.slice(0, 400) });
    });
    this.page.on('response', async (res) => {
      const url = res.url();
      if (res.status() === 404 && !/:5001\//.test(url)) {
        this.missing = this.missing || [];
        this.missing.push({ at: this.where || '', url: url.slice(0, 200) });
      }
      if (!/127\.0\.0\.1:5001|:5001\//.test(url)) return;
      if (res.status() >= 400) {
        let body = '';
        try { body = (await res.text()).slice(0, 300); } catch { /* ignore */ }
        this.failedCalls.push({ at: this.where || '', url: url.split('/').pop(), status: res.status(), body });
      }
    });
    return this;
  }

  async goto(path = '/') {
    await this.page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  }

  /** Logger inn med e-post og passord via innloggingssiden. */
  async login({ expectShell = true } = {}) {
    this.where = 'innlogging';
    await this.goto('/login');
    await this.page.waitForSelector('input[type=password]', { timeout: 300000 });
    await this.page.fill('input >> nth=0', this.email);
    await this.page.fill('input[type=password]', this.password);
    const consent = this.page.getByText('Jeg har lest og forstått', { exact: false });
    if (await consent.count()) await consent.first().click().catch(() => {});
    await this.page.getByText('Logg inn', { exact: true }).last().click();
    if (expectShell) await this.waitShell();
  }

  async waitShell(timeout = 240000) {
    await this.page.waitForFunction(() => !!window.__protopBot, null, { timeout });
    await this.page.waitForTimeout(2000);
    await this.dismissTours();
  }

  async dismissTours() {
    const el = this.page.getByText('Hopp over rundturen', { exact: true });
    if (await el.count().catch(() => 0)) {
      if (await el.first().isVisible().catch(() => false)) {
        await el.first().click({ force: true }).catch(() => {});
        await this.page.waitForTimeout(400);
      }
    }
  }

  /** Åpner en side i skallet direkte (test-krok, bare i emulator-bygg). */
  async open(tab, subView = null, wait = 2200) {
    this.where = subView ? `${tab}.${subView}` : tab;
    await this.page.evaluate(([t, s]) => window.__protopBot.openShell(t, s || null), [tab, subView]);
    await this.page.waitForTimeout(wait);
  }

  async shot(label) {
    if (!this.outDir) return null;
    mkdirSync(this.outDir, { recursive: true });
    this.shotNo += 1;
    const file = join(this.outDir, `${String(this.shotNo).padStart(2, '0')}-${this.name}-${label}.png`.replace(/[^\w.\-æøåÆØÅ]+/g, '_'));
    await this.page.screenshot({ path: file }).catch(() => {});
    return file;
  }

  /** Synlig tekst på skjermen (bare elementer innenfor visningen). */
  async visibleText() {
    return this.page.evaluate(() => document.body.innerText || '');
  }

  async hasText(text, { timeout = 8000 } = {}) {
    try {
      await this.page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  }

  /** Trykker den første synlige knappen/teksten som matcher. */
  async click(text, { exact = true, timeout = 8000, nth = 0, force = false } = {}) {
    const loc = this.page.getByText(text, { exact });
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const n = await loc.count();
      const vis = [];
      for (let i = 0; i < n; i += 1) {
        if (await loc.nth(i).isVisible().catch(() => false)) vis.push(i);
      }
      if (vis.length > nth) {
        await loc.nth(vis[nth]).click({ force, timeout: 5000 });
        await this.page.waitForTimeout(500);
        return true;
      }
      await this.page.waitForTimeout(300);
    }
    throw new Error(`Fant ikke «${text}» på skjermen (${this.where})`);
  }

  async clickRole(role, name, { timeout = 8000 } = {}) {
    const loc = this.page.getByRole(role, { name });
    await loc.first().waitFor({ state: 'visible', timeout });
    await loc.first().click();
    await this.page.waitForTimeout(500);
  }

  /** Fyller feltet med gitt plassholder eller aria-label. */
  async fill(labelOrPlaceholder, value, { nth = 0 } = {}) {
    let loc = this.page.getByPlaceholder(labelOrPlaceholder, { exact: false });
    if (!(await loc.count())) loc = this.page.getByLabel(labelOrPlaceholder, { exact: false });
    const n = await loc.count();
    const vis = [];
    for (let i = 0; i < n; i += 1) {
      if (await loc.nth(i).isVisible().catch(() => false)) vis.push(i);
    }
    if (vis.length <= nth) throw new Error(`Fant ikke feltet «${labelOrPlaceholder}» (${this.where})`);
    await loc.nth(vis[nth]).fill(value);
    await this.page.waitForTimeout(150);
  }

  async stop() {
    await this.ctx?.close().catch(() => {});
  }
}
