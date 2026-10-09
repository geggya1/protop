/**
 * Tre UI-sykluser: åpne /faktura-demo → last Excel → kontroller → importer → åpne detalj.
 * Syklus 2–3 gjenbruker samme side (uten reload) for å verifisere filtrering av eksisterende.
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

async function onInvoiceList() {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll('div,span,p,button,a')];
    return nodes.some((el) => /^(Importer Excel)$/.test((el.innerText || '').trim()));
  });
}

async function ensureList() {
  if (await onInvoiceList()) return;
  await page.evaluate(() => {
    const hit = [...document.querySelectorAll('button,[role="button"],div,span,a')].find((el) => {
      const text = (el.innerText || '').trim();
      return text === 'Økonomi / Fakturaer'
        || text === '← Økonomi / Fakturaer'
        || /Tilbake til listen/.test(text)
        || text === 'Avbryt';
    });
    hit?.click();
  });
  await page.waitForFunction(() => {
    const nodes = [...document.querySelectorAll('div,span,p,button,a')];
    return nodes.some((el) => /^(Importer Excel)$/.test((el.innerText || '').trim()));
  }, { timeout: 60000 });
}

async function uploadExcel() {
  await ensureList();
  const [fileChooser] = await Promise.all([
    page.waitForFileChooser({ timeout: 30000 }).catch(() => null),
    clickText(/^Importer Excel$/).catch(() => clickText(/Importer Excel/)),
  ]);
  if (fileChooser) {
    await fileChooser.accept([EXCEL]);
    return;
  }
  // Skjult input kan finnes uten synlig file chooser (web)
  const input = await page.$('input[type="file"]');
  if (input) {
    await input.uploadFile(EXCEL);
    await input.evaluate((el) => {
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    return;
  }
  // Siste utvei: opprett midlertidig input og trigg pickDocument-fallback via DOM
  throw new Error('Ingen filvelger');
}

async function assertTopButtons() {
  const topButtons = await page.evaluate(() => {
    const root = document.getElementById('invoice-import-review') || document.body;
    const text = (root.innerText || '').slice(0, 900);
    return /Avbryt/.test(text) && /Importer \d+ fakturaer/.test(text);
  });
  if (!topButtons) throw new Error('Avbryt/Importer mangler øverst i gjennomgangen');
}

async function openDemo() {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 180000 });
    const ready = await page.waitForFunction(() => {
      const nodes = [...document.querySelectorAll('div,span,p,button,a')];
      if (nodes.some((el) => /^(Importer Excel)$/.test((el.innerText || '').trim()))) return 'demo';
      const text = document.body?.innerText || '';
      if (/Log in|Logg inn/i.test(text) && !/Faktura-demo/i.test(text)) return 'login';
      if (/Faktura-demo/i.test(text)) return 'demo-shell';
      return false;
    }, { timeout: 90000 }).then((h) => h.jsonValue()).catch(() => 'timeout');
    if (ready === 'demo' || ready === 'demo-shell') {
      if (ready === 'demo-shell') {
        await page.waitForFunction(() => {
          const nodes = [...document.querySelectorAll('div,span,p,button,a')];
          return nodes.some((el) => /^(Importer Excel)$/.test((el.innerText || '').trim()));
        }, { timeout: 60000 }).catch(() => null);
      }
      if (await onInvoiceList()) return;
    }
    console.log(`demo ikke klar (attempt ${attempt}: ${ready}), prøver igjen…`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error('Klarte ikke å åpne /faktura-demo');
}

try {
  await openDemo();
  await page.evaluate(() => {
    try {
      sessionStorage.removeItem('protop.fakturaDemo.invoiceIndex');
      sessionStorage.removeItem('protop.fakturaDemo.invoices');
    } catch {}
  });
  await ensureList();
  await shot('faktura-cycle1-list');

  // --- Syklus 1: import ---
  console.log('--- syklus 1 ---');
  await uploadExcel();
  await waitText(/Kontroller fakturaimport|Kontroller/, 180000);
  await waitText(/Importer \d+ fakturaer/);
  await waitText(/Klare uten avvik|Må kontrolleres/);
  await assertTopButtons();
  await shot('faktura-cycle1-review');

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
  await shot('faktura-cycle1-imported');

  const search = await page.$('input[placeholder*="Søk"]');
  if (!search) throw new Error('Mangler søkefelt');
  await search.click({ clickCount: 3 });
  await search.type('16713');
  await page.waitForFunction(() => /Viser 1/i.test(document.body?.innerText || ''), { timeout: 30000 });
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
  await shot('faktura-cycle1-detail');
  await ensureList();
  console.log('syklus 1: ok');

  // --- Syklus 2 og 3: samme fil skal filtrere bort eksisterende ---
  for (const cycle of [2, 3]) {
    console.log(`--- syklus ${cycle} ---`);
    await uploadExcel();
    await waitText(/Kontroller fakturaimport/, 180000);
    await waitText(/finnes allerede|fjernet fra importen/i, 180000);
    await assertTopButtons();
    // Skal ikke tilby import av alle 6713 på nytt
    const importLabel = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('div,span,p,button,a')];
      const btn = nodes.find((el) => /^Importer \d+ fakturaer$/.test((el.innerText || '').trim()));
      return (btn?.innerText || '').trim();
    });
    if (/Importer 6713/.test(importLabel)) {
      throw new Error(`Syklus ${cycle}: eksisterende ble ikke filtrert (${importLabel})`);
    }
    await shot(`faktura-cycle${cycle}-existing-filtered`);
    await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('div,span,p,button,a')];
      const btn = nodes.find((el) => /^(Avbryt)$/.test((el.innerText || '').trim()));
      if (btn) btn.click();
    });
    await ensureList();
    console.log(`syklus ${cycle}: ok`);
  }

  console.log('verify-faktura-ui: 3 sykluser ok');
} catch (err) {
  await shot('faktura-ui-error');
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
