import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const OUT = '/opt/cursor/artifacts/screenshots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: false,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--window-size=1280,900',
    '--window-position=40,40',
  ],
  defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
});

const page = await browser.newPage();
page.setDefaultTimeout(120000);

async function shot(name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log('saved', file);
}

async function waitBoard() {
  await page.waitForSelector('[data-testid="home-widget-board"]', { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 900));
}

async function tap(id) {
  await page.waitForSelector(`[data-testid="${id}"]`);
  await page.$eval(`[data-testid="${id}"]`, (el) => {
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    el.click();
  });
}

async function scrollWidget(type) {
  const el = await page.$(`[data-testid="home-widget-${type}"]`);
  if (el) {
    await el.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await new Promise((r) => setTimeout(r, 350));
    return true;
  }
  console.log('missing widget', type);
  return false;
}

try {
  await page.goto('http://localhost:8081/dashboard-themes', { waitUntil: 'networkidle2', timeout: 120000 });
  await waitBoard();
  await shot('parent_home_top_weather_clock_date');

  for (const type of ['timeline', 'tasks', 'family']) {
    if (!(await scrollWidget(type))) throw new Error(`missing parent widget ${type}`);
    await shot(`parent_widget_${type}`);
  }

  for (const type of ['messages', 'shopping', 'meals', 'weekPlan']) {
    if (await page.$(`[data-testid="home-widget-${type}"]`)) {
      throw new Error(`unexpected parent widget ${type}`);
    }
  }

  if (await page.$('[data-testid="home-edit-bar"]') || await page.$('[data-testid="home-edit-add"]')) {
    throw new Error('home editing UI should be gone');
  }

  await tap('preview-role-child');
  await waitBoard();
  await shot('child_home_top');
  for (const type of ['timeline', 'tasks']) {
    if (!(await scrollWidget(type))) throw new Error(`missing child widget ${type}`);
    await shot(`child_widget_${type}`);
  }

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await tap('preview-role-parent');
  await waitBoard();
  await shot('parent_mobile_top');
  await scrollWidget('family');
  await shot('parent_mobile_family');
  await tap('preview-role-child');
  await waitBoard();
  await shot('child_mobile_top');

  console.log('ok');
} catch (err) {
  console.error('VERIFY_FAIL', err);
  await shot('verify_error');
  process.exitCode = 1;
} finally {
  await browser.close();
}
