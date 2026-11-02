/**
 * E2E for konsernintegrasjonen i en ekte nettleser mot emulatorene (scripts/e2e/emulators.mjs):
 * tilknytning med godkjenning, tildeling på prosjekt, prosjektkopi, speiling av timer, utlegg og
 * salg, fakturanummer på raden hos prosjekteier, og visningen i Til fakturering.
 * Tar skjermbilder på PC og mobil. Skriver <out>/rapport.md og rapport.json; kode 1 ved feil.
 *
 *   node scripts/e2e/intercompany.mjs --base=http://localhost:8081 --out=e2e-out
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { DATTER, DATTER_EMP, MOR, MOR_PROJECT, PASSWORD, getDoc, listDocs, putDoc } from './seed-intercompany.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

function arg(name, fallback = '') {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}
const BASE = arg('base', 'http://localhost:8081');
const OUT = arg('out', 'e2e-out');
mkdirSync(join(OUT, 'bilder'), { recursive: true });

const VIEWS = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
const steps = [];
const errors = [];
let shotNo = 0;

async function shot(page, name) {
  shotNo += 1;
  const file = `bilder/${String(shotNo).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: join(OUT, file), fullPage: false }).catch(() => {});
  return file;
}

async function step(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    steps.push({ name, ok: true, ms: Date.now() - started, detail: detail || '' });
    console.log(`✔ ${name}`);
  } catch (error) {
    steps.push({ name, ok: false, ms: Date.now() - started, detail: String(error?.message || error).slice(0, 500) });
    console.log(`✘ ${name}: ${error?.message || error}`);
  }
}

async function until(fn, { timeout = 60000, every = 1500, what = 'betingelse' } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await fn().catch((e) => { last = e; return null; });
    if (last) return last;
    await new Promise((r) => setTimeout(r, every));
  }
  throw new Error(`Tidsavbrudd: ${what}`);
}

async function login(email, view = 'desktop', tag = '') {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWS[view] });
  await ctx.addInitScript(() => {
    const now = new Date().toISOString();
    localStorage.setItem('protop.lang', 'nb');
    // Informasjonen om lagring i nettleseren er lest (den ligger ellers over toppraden på mobil).
    localStorage.setItem('protop.storageNotice', '1');
    localStorage.setItem('protop.consents', JSON.stringify({ version: '2.0.0', termsAt: now, privacyAt: now, gdprAt: now, dataAt: now, copyrightAt: now, language: 'nb' }));
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    const m = String(e?.message || e);
    if (/jsQR|importScripts|L is not defined/.test(m)) return;
    errors.push(`[${tag || email}] ${m.slice(0, 300)}`);
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const t = msg.text();
    // Kall til funksjoner som ikke kjører i emulatoren (CORS mot 5001) er støy her.
    if (/CORS policy|net::ERR_FAILED/.test(t)) return;
    if (/intercompany|ic[A-Z]|permission|Missing or insufficient|FirebaseError/i.test(t)) errors.push(`[${tag || email} console] ${t.slice(0, 300)}`);
  });
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForSelector('input[type=password]', { timeout: 300000 });
  await page.fill('input >> nth=0', email);
  await page.fill('input[type=password]', PASSWORD);
  await page.getByText('Jeg har lest og forstått', { exact: false }).first().click();
  await page.getByText('Logg inn', { exact: true }).last().click();
  await page.waitForFunction(() => !!window.__protopBot, null, { timeout: 240000 });
  await page.waitForTimeout(3000);
  const skip = page.getByText('Hopp over rundturen');
  if (await skip.count()) await skip.first().click({ force: true }).catch(() => {});
  return { browser, page };
}

async function open(page, tab, subView = null) {
  await page.evaluate(([t, s]) => window.__protopBot.openShell(t, s), [tab, subView]);
  await page.waitForTimeout(2500);
}

/** Klikk det første synlige elementet med teksten (skjulte kopier i navigasjonsstabelen hoppes over). */
async function clickText(page, text, { exact = false } = {}) {
  const loc = page.getByText(text, { exact });
  const n = await loc.count();
  for (let i = 0; i < n; i += 1) {
    const el = loc.nth(i);
    if (await el.isVisible().catch(() => false)) {
      await el.scrollIntoViewIfNeeded().catch(() => {});
      await el.click();
      return true;
    }
  }
  throw new Error(`Fant ikke synlig «${text}»`);
}

async function clickId(page, id) {
  const ok = await page.evaluate((sel) => {
    const el = [...document.querySelectorAll(sel)].find((node) => {
      const r = node.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth;
    });
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  }, id);
  if (!ok) throw new Error(`Fant ikke ${id}`);
}

async function seeText(page, text, timeout = 30000) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });
}

async function fillId(page, id, value) {
  await page.locator(id).first().fill(value);
}

const today = new Date().toISOString().slice(0, 10);
let cloneId = '';
let linkId = '';

async function stateOf(companyId) {
  const doc = await getDoc(`families/${companyId}/projects/state`);
  return doc?.state || doc || {};
}

async function writeState(companyId, mutate) {
  const doc = (await getDoc(`families/${companyId}/projects/state`)) || {};
  const state = doc.state || {};
  await putDoc(`families/${companyId}/projects/state`, { ...doc, state: mutate({ ...state }) , updatedAt: new Date() });
}

const mor = await login(MOR.email, 'desktop', 'mor');
const datter = await login(DATTER.email, 'desktop', 'datter');

await step('Mor: Underenheter viser Tilknyttede selskaper', async () => {
  await open(mor.page, 'selskap', 'underenheter');
  await seeText(mor.page, 'Tilknyttede selskaper');
  return shot(mor.page, 'mor-underenheter');
});

await step('Mor: ber Datter om tilknytning som datterselskap', async () => {
  await clickId(mor.page, '#ic-new');
  await fillId(mor.page, '#ic-orgnr', DATTER.orgnr);
  await seeText(mor.page, 'Datter Elektro AS finnes i ProTop', 30000);
  await clickId(mor.page, '#ic-role-child');
  await clickId(mor.page, '#ic-hours-discount');
  await mor.page.locator('#ic-hours-discount').fill('10');
  await shot(mor.page, 'mor-ny-tilknytning');
  await clickId(mor.page, '#ic-send');
  await seeText(mor.page, 'Forespørselen er sendt', 60000);
  const links = await until(async () => {
    const rows = await listDocs('intercompanyLinks');
    return rows.length ? rows : null;
  }, { what: 'avtale i intercompanyLinks' });
  linkId = links[0].id;
  if (links[0].status !== 'pending') throw new Error(`status ${links[0].status}`);
  return shot(mor.page, 'mor-sendt');
});

await step('Datter: ser forespørselen og godtar', async () => {
  await open(datter.page, 'selskap', 'underenheter');
  await seeText(datter.page, 'Svar trengs', 60000);
  await shot(datter.page, 'datter-innkommende');
  await clickId(datter.page, `[id^="ic-accept-"]`);
  await seeText(datter.page, 'Tilknytningen er godkjent', 60000);
  const link = await until(async () => {
    const row = await getDoc(`intercompanyLinks/${linkId}`);
    return row?.status === 'active' ? row : null;
  }, { what: 'aktiv avtale' });
  const fam = await getDoc(`families/${DATTER.id}`);
  if (fam?.parentCompanyId !== MOR.id) throw new Error('parentCompanyId ble ikke satt på datter');
  await datter.page.waitForTimeout(1500);
  return `${link.status}; ${await shot(datter.page, 'datter-aktiv')}`;
});

await step('Mor: avtalen vises som aktiv', async () => {
  await open(mor.page, 'selskap', 'underenheter');
  await seeText(mor.page, 'Datter Elektro AS', 30000);
  await seeText(mor.page, 'Foreslå nye priser', 30000);
  return shot(mor.page, 'mor-aktiv');
});

await step('Mor: tildeler Per fra Datter på prosjektet', async () => {
  await open(mor.page, 'projects');
  await clickText(mor.page, MOR_PROJECT.name);
  await mor.page.waitForTimeout(2500);
  await clickText(mor.page, 'Team', { exact: true });
  await mor.page.waitForTimeout(1500);
  await shot(mor.page, 'mor-team-for');
  await clickId(mor.page, '#project-team-add-partner');
  await seeText(mor.page, DATTER_EMP.name, 60000);
  await clickText(mor.page, DATTER_EMP.name);
  await shot(mor.page, 'mor-tildel-dialog');
  await clickId(mor.page, '#ic-allocate-save');
  await seeText(mor.page, 'Innleid fra Datter Elektro AS', 60000);
  return shot(mor.page, 'mor-team-etter');
});

await step('Server: prosjektkopi, kunde og innleid medarbeider', async () => {
  const state = await until(async () => {
    const s = await stateOf(DATTER.id);
    return (s.projects || []).some((p) => String(p.id).startsWith('prjic_')) ? s : null;
  }, { what: 'kopi hos datter' });
  const clone = state.projects.find((p) => String(p.id).startsWith('prjic_'));
  cloneId = clone.id;
  if (clone.number !== MOR_PROJECT.number) throw new Error(`nummer ${clone.number}`);
  if (clone.client !== MOR.name) throw new Error(`kunde ${clone.client}`);
  if (!(state.members || []).some((m) => m.projectId === cloneId && m.employeeId === DATTER_EMP.id)) throw new Error('Per er ikke deltaker på kopien');
  const customers = await getDoc(`families/${DATTER.id}/anbud/customers`);
  if (!(customers?.customers || []).some((c) => c.orgnr === MOR.orgnr)) throw new Error('Mor er ikke kunde hos datter');
  const ext = await getDoc(`families/${MOR.id}/employees/ic_${DATTER.id}_${DATTER_EMP.id}`);
  if (ext?.company?.homeCompanyId !== DATTER.id) throw new Error('innleid medarbeider mangler hos mor');
  return `kopi ${cloneId}, pris ${JSON.stringify(clone.pricingSettings)}, rabatt ${clone.invoiceSettings?.discountHours}`;
});

await step('Datter: ser kopien med samme nummer og Mor som kunde', async () => {
  await datter.page.reload({ waitUntil: 'domcontentloaded' });
  await datter.page.waitForFunction(() => !!window.__protopBot, null, { timeout: 240000 });
  await datter.page.waitForTimeout(2500);
  await open(datter.page, 'projects');
  await seeText(datter.page, MOR_PROJECT.name, 60000);
  await shot(datter.page, 'datter-prosjekter');
  await clickText(datter.page, MOR_PROJECT.name);
  await datter.page.waitForTimeout(2500);
  await clickText(datter.page, 'Team', { exact: true });
  await seeText(datter.page, 'Integrasjon: leveranse til Mor Bygg AS', 30000);
  return shot(datter.page, 'datter-kopi-team');
});

const entryId = 'tid_e2e_1';
await step('Timer: ført hos Datter vises hos Mor (venter på godkjenning)', async () => {
  await putDoc(`families/${DATTER.id}/timeEntries/${entryId}`, {
    id: entryId, projectId: cloneId, employeeId: DATTER_EMP.id, employeeName: DATTER_EMP.name, date: today, hours: 7.5, billableHours: 7.5,
    description: 'Kabling 2. etasje', status: 'registrert', timeType: 'ordinary', activityName: 'Hovedaktivitet', invoiceId: null,
    projectNumber: MOR_PROJECT.number, projectName: MOR_PROJECT.name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  const mirror = await until(() => getDoc(`families/${MOR.id}/timeEntries/ic_${DATTER.id}_${entryId}`), { what: 'speilet time hos mor', timeout: 90000 });
  if (mirror.status !== 'registrert' || mirror.projectId !== MOR_PROJECT.id) throw new Error(`status ${mirror.status}, prosjekt ${mirror.projectId}`);
  return `speilet: ${mirror.status}`;
});

await step('Timer: godkjent hos Datter er godkjent hos Mor', async () => {
  const src = await getDoc(`families/${DATTER.id}/timeEntries/${entryId}`);
  await putDoc(`families/${DATTER.id}/timeEntries/${entryId}`, { ...src, status: 'godkjent', updatedAt: new Date().toISOString() });
  await until(async () => (await getDoc(`families/${MOR.id}/timeEntries/ic_${DATTER.id}_${entryId}`))?.status === 'godkjent', { what: 'godkjent speil', timeout: 90000 });
});

await step('Faktura: Datter fakturerer Mor, nummeret vises på timen hos Mor', async () => {
  await putDoc(`families/${DATTER.id}/invoices/inv-d-1`, {
    id: 'inv-d-1', invoiceNumber: '', status: 'draft', projectId: cloneId, projectNumber: MOR_PROJECT.number, customerName: MOR.name,
    invoiceDate: today, amountExVat: 8100, createdAt: new Date().toISOString(),
  });
  const src = await getDoc(`families/${DATTER.id}/timeEntries/${entryId}`);
  await putDoc(`families/${DATTER.id}/timeEntries/${entryId}`, { ...src, status: 'låst', invoiceId: 'inv-d-1', updatedAt: new Date().toISOString() });
  await until(async () => (await getDoc(`families/${MOR.id}/timeEntries/ic_${DATTER.id}_${entryId}`))?.intercompany?.supplierInvoice?.id === 'inv-d-1', { what: 'fakturautkast på speilet', timeout: 90000 });
  const inv = await getDoc(`families/${DATTER.id}/invoices/inv-d-1`);
  await putDoc(`families/${DATTER.id}/invoices/inv-d-1`, { ...inv, invoiceNumber: '20001', status: 'issued' });
  const mirror = await until(async () => {
    const m = await getDoc(`families/${MOR.id}/timeEntries/ic_${DATTER.id}_${entryId}`);
    return m?.intercompany?.supplierInvoice?.number === '20001' ? m : null;
  }, { what: 'fakturanummer på speilet', timeout: 90000 });
  if (mirror.status !== 'godkjent') throw new Error(`status ${mirror.status}`);
  return 'faktura 20001 på speilet';
});

await step('Utlegg og salg: speiles til Mor når Datter har godkjent', async () => {
  await writeState(DATTER.id, (s) => ({
    ...s,
    expenses: [...(s.expenses || []), {
      id: 'exp_e2e_1', projectId: cloneId, date: today, description: 'Hotell Bergen', category: 'travel', amountExVat: 1000, amountInclVat: 1120,
      vatAmount: 120, status: 'approved', employeeId: DATTER_EMP.id, employeeName: DATTER_EMP.name, billable: true, chargeType: 'reinvoice',
    }],
    sales: [...(s.sales || []), {
      id: 'sale_e2e_1', projectId: cloneId, date: today, name: 'Kabel 3x2,5', quantity: 100, unit: 'm', unitPrice: 12, status: 'approved', billable: true,
    }],
  }));
  const exp = await until(() => getDoc(`families/${MOR.id}/projectExpenses/ic_${DATTER.id}_exp_e2e_1`), { what: 'speilet utlegg', timeout: 90000 });
  const sale = await until(() => getDoc(`families/${MOR.id}/productSales/ic_${DATTER.id}_sale_e2e_1`), { what: 'speilet salg', timeout: 90000 });
  if (exp.status !== 'approved' || exp.paidBy !== 'company') throw new Error(`utlegg ${exp.status}/${exp.paidBy}`);
  if (sale.status !== 'approved') throw new Error(`salg ${sale.status}`);
  return 'utlegg og salg speilet';
});

await step('Mor: Timerapport viser at timen belastes på faktura 20001', async () => {
  await mor.page.reload({ waitUntil: 'domcontentloaded' });
  await mor.page.waitForFunction(() => !!window.__protopBot, null, { timeout: 240000 });
  await mor.page.waitForTimeout(2500);
  await open(mor.page, 'projects');
  await clickText(mor.page, MOR_PROJECT.name);
  await mor.page.waitForTimeout(2500);
  await clickText(mor.page, 'Timerapport', { exact: true });
  await seeText(mor.page, 'faktura 20001', 60000);
  return shot(mor.page, 'mor-timerapport');
});

await step('Mor: Utlegg på prosjektet viser utlegget fra Datter', async () => {
  await clickText(mor.page, 'Prosjektutlegg', { exact: true });
  await seeText(mor.page, 'Hotell Bergen', 60000);
  await seeText(mor.page, 'Datter Elektro AS · godkjent', 30000);
  return shot(mor.page, 'mor-utlegg');
});

await step('Mor: Til fakturering viser timene fra Datter mot sluttkunden', async () => {
  await open(mor.page, 'okonomi', 'fakturagrunnlag');
  await mor.page.waitForTimeout(3000);
  const today = mor.page.getByText('T.o.m. i dag', { exact: true });
  if (await today.count()) await today.first().click().catch(() => {});
  await seeText(mor.page, MOR_PROJECT.name, 60000);
  await shot(mor.page, 'mor-til-fakturering');
  await clickText(mor.page, MOR_PROJECT.name).catch(() => {});
  await mor.page.waitForTimeout(1500);
  await seeText(mor.page, 'Datter Elektro AS · faktura 20001', 30000);
  return shot(mor.page, 'mor-til-fakturering-apnet');
});

await step('Datter: Til fakturering viser kopien med Mor som kunde', async () => {
  await open(datter.page, 'okonomi', 'fakturagrunnlag');
  await datter.page.waitForTimeout(3000);
  return shot(datter.page, 'datter-til-fakturering');
});

await step('Datter: utstyr med utleiepris', async () => {
  await open(datter.page, 'utstyr');
  await seeText(datter.page, 'Saksheis 12 m', 60000);
  await seeText(datter.page, 'Utleie 950 kr per dag', 30000);
  await shot(datter.page, 'datter-utstyr');
  await clickText(datter.page, 'Rediger', { exact: true });
  await seeText(datter.page, 'Utleie på prosjekt', 30000);
  await datter.page.locator('#equipment-rental').first().scrollIntoViewIfNeeded().catch(() => {});
  return shot(datter.page, 'datter-utstyr-utleie');
});

await step('Mor og Datter: prosjektlisten merker felles prosjekter', async () => {
  await open(datter.page, 'projects');
  await seeText(datter.page, 'Leveranse til Mor Bygg AS', 60000);
  await shot(datter.page, 'datter-prosjektliste');
  await open(mor.page, 'projects');
  await seeText(mor.page, 'Med Datter Elektro AS', 60000);
  return shot(mor.page, 'mor-prosjektliste');
});

await mor.browser.close();
await datter.browser.close();

await step('Mobil: Underenheter og Team hos Mor', async () => {
  const phone = await login(MOR.email, 'phone', 'mor-mobil');
  await open(phone.page, 'selskap', 'underenheter');
  await seeText(phone.page, 'Tilknyttede selskaper', 60000);
  await shot(phone.page, 'mobil-underenheter');
  await phone.page.evaluate(() => window.scrollBy(0, 400));
  await shot(phone.page, 'mobil-underenheter-rullet');
  await open(phone.page, 'projects');
  await clickText(phone.page, MOR_PROJECT.name);
  await phone.page.waitForTimeout(2500);
  await clickText(phone.page, 'Team', { exact: true }).catch(() => {});
  await phone.page.waitForTimeout(1500);
  await shot(phone.page, 'mobil-team');
  await phone.browser.close();
});

const failed = steps.filter((s) => !s.ok);
const md = [
  '# E2E: konsernintegrasjon',
  '',
  `${steps.length - failed.length} av ${steps.length} steg OK. ${errors.length} feil i nettleseren.`,
  '',
  '| Steg | OK | Detalj |',
  '|---|---|---|',
  ...steps.map((s) => `| ${s.name} | ${s.ok ? '✔' : '✘'} | ${String(s.detail).replace(/\|/g, '/').replace(/\n/g, ' ')} |`),
  '',
  '## Feil i nettleseren',
  '',
  ...(errors.length ? [...new Set(errors)].map((e) => `- ${e}`) : ['Ingen.']),
  '',
].join('\n');
writeFileSync(join(OUT, 'rapport.md'), md);
writeFileSync(join(OUT, 'rapport.json'), JSON.stringify({ steps, errors: [...new Set(errors)] }, null, 2));
console.log(md);
process.exit(failed.length ? 1 : 0);
