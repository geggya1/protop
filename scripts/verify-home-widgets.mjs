import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const OUT = '/opt/cursor/artifacts/screenshots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=430,980'],
  defaultViewport: { width: 430, height: 980, deviceScaleFactor: 2 },
});

const page = await browser.newPage();
page.setDefaultTimeout(120000);

async function shot(name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log('saved', file);
}

async function tap(id) {
  await page.waitForSelector(`[data-testid="${id}"]`);
  await page.$eval(`[data-testid="${id}"]`, (el) => {
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    el.click();
  });
}

try {
  await page.goto('http://localhost:8081/dashboard-themes', { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForSelector('[data-testid="home-widget-board"]', { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 1200));
  await shot('verify_adult_fixed_home');

  for (const type of ['weather', 'clock', 'date', 'timeline', 'tasks', 'family']) {
    const el = await page.$(`[data-testid="home-widget-${type}"]`);
    if (!el) throw new Error(`missing parent widget ${type}`);
  }
  for (const type of ['messages', 'shopping', 'meals', 'weekPlan']) {
    const el = await page.$(`[data-testid="home-widget-${type}"]`);
    if (el) throw new Error(`unexpected parent widget ${type}`);
  }

  const editBar = await page.$('[data-testid="home-edit-bar"]');
  if (editBar) throw new Error('edit bar should not exist');
  const addBtn = await page.$('[data-testid="home-edit-add"]');
  if (addBtn) throw new Error('add widget should not exist');

  await tap('home-banner-group-natur');
  await new Promise((r) => setTimeout(r, 300));
  const bannerSel = await page.$('[data-testid="home-banner-natur-terrasse"]')
    || await page.$('[data-testid="home-banner-natur-fjelltopp"]');
  if (bannerSel) {
    await bannerSel.evaluate((el) => { el.scrollIntoView({ block: 'center' }); el.click(); });
  }
  await new Promise((r) => setTimeout(r, 500));
  await shot('verify_banner_picker');

  await tap('preview-role-child');
  await page.waitForSelector('[data-testid="home-widget-board"]');
  await new Promise((r) => setTimeout(r, 800));
  await shot('verify_child_fixed_home');
  for (const type of ['weather', 'clock', 'date', 'timeline', 'tasks']) {
    const el = await page.$(`[data-testid="home-widget-${type}"]`);
    if (!el) throw new Error(`missing child widget ${type}`);
  }
} finally {
  await browser.close();
}
