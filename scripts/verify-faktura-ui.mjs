/**
 * Tre UI-sykluser: åpne /faktura-demo → last Excel → kontroller → importer → åpne detalj.
 */
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const OUT = '/opt/cursor/artifacts';
const SHOTS = path.join(OUT, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const EXCEL = '/home/ubuntu/.cursor/projects/workspace/uploads/invoices_eafb.xlsx';
const BASE = process.env.FAKTURA_DEMO_URL || 'http://localhost:8081/faktura-demo';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
  defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
});

const page = await browser.newPage();
page.setDefaultTimeout(180000);

async function shot(name) {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log('saved', file);
}

async function waitText(re, timeout = 120000) {
  await page.waitForFunction(
    (pattern) => {
      const body = document.body?.innerText || '';
      return new RegExp(pattern, 'i').test(body);
    },
    { timeout },
    re.source || String(re),
  );
}

async function clickText(re) {
  const handle = await page.evaluateHandle((pattern) => {
    const rx = new RegExp(pattern, 'i');
    const nodes = [...document.querySelectorAll('div,span,p,button,a')];
    return nodes.find((el) => rx.test((el.innerText || '').trim()) && (el.innerText || '').trim().length < 80) || null;
  }, re.source || String(re));
  const el = handle.asElement();
  if (!el) throw new Error(`Fant ikke klikkbar tekst: ${re}`);
  await el.click();
}

async function runCycle(cycle) {
  console.log(`--- syklus ${cycle} ---`);
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 180000 });
  await waitText(/Fakturaer|Faktura/);
  await waitText(/Importer Excel/);
  await shot(`faktura-cycle${cycle}-list`);

  // Skjul file input finnes ikke alltid synlig — trigger via knappen og sett fil på input
  const [fileChooser] = await Promise.all([
    page.waitForFileChooser({ timeout: 30000 }).catch(() => null),
    clickText(/^Importer Excel$/).catch(() => clickText(/Importer Excel/)),
  ]);
  if (fileChooser) {
    await fileChooser.accept([EXCEL]);
  } else {
    // fallback: finn input[type=file]
    const input = await page.$('input[type="file"]');
    if (!input) throw new Error('Ingen filvelger');
    await input.uploadFile(EXCEL);
    await input.evaluate((el) => {
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  await waitText(/Kontroller fakturaimport|Kontroller/, 180000);
  await waitText(/Importer \d+ fakturaer/);
  await shot(`faktura-cycle${cycle}-review`);

  const imported = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('div,span,p,button,a')];
    const btn = nodes.find((el) => /^Importer \d+ fakturaer$/.test((el.innerText || '').trim()));
    if (!btn) return false;
    btn.scrollIntoView({ block: 'center' });
    btn.click();
    return true;
  });
  if (!imported) throw new Error('Fant ikke Importer-knappen');

  await page.waitForFunction(() => {
    const text = document.body?.innerText || '';
    return /fakturaer er lagret/i.test(text)
      || (/registrerte fakturaer/i.test(text) && !/0 registrerte/.test(text) && /Viser \d+/i.test(text));
  }, { timeout: 180000 });
  await page.waitForFunction(() => /16713|RYFYLKE|Sandnes/i.test(document.body?.innerText || ''), { timeout: 60000 });
  await shot(`faktura-cycle${cycle}-imported`);

  // Søk og åpne detalj
  const search = await page.$('input[placeholder*="Søk"]');
  if (!search) throw new Error('Mangler søkefelt');
  await search.click({ clickCount: 3 });
  await search.type('16713');
  await page.waitForFunction(() => /Viser 1/i.test(document.body?.innerText || ''), { timeout: 30000 });
  await page.waitForSelector('button');
  const opened = await page.evaluate(() => {
    const row = [...document.querySelectorAll('button')].find((el) => {
      const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
      return /^16713\b/.test(text) && /Sendt|RYFYLKE|70/i.test(text);
    });
    if (!row) return false;
    row.scrollIntoView({ block: 'center' });
    row.click();
    return true;
  });
  if (!opened) throw new Error('Fant ikke fakturarad 16713 å klikke');
  await page.waitForFunction(
    () => /Fakturafremvisning/i.test(document.body?.innerText || '')
      && (/Økonomi \/ Fakturaer/i.test(document.body?.innerText || '')
        || /Tilbake til listen/i.test(document.body?.innerText || '')
        || /Fakturaoversikt/i.test(document.body?.innerText || '')),
    { timeout: 60000 },
  );
  await shot(`faktura-cycle${cycle}-detail`);

  await page.evaluate(() => {
    const hit = [...document.querySelectorAll('button,[role="button"],div,span')].find((el) => (
      /Økonomi \/ Fakturaer/.test(el.innerText || '')
      || /Tilbake til listen/.test(el.innerText || '')
    ));
    hit?.click();
  });
  await waitText(/Importer Excel/);
  console.log(`syklus ${cycle}: ok`);
}

try {
  for (let cycle = 1; cycle <= 3; cycle += 1) {
    await runCycle(cycle);
  }
  console.log('verify-faktura-ui: 3 sykluser ok');
} catch (err) {
  await shot('faktura-ui-error');
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
