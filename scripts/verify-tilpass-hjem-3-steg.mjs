/**
 * Verify Tilpass hjem 3-step flow on /dashboard-themes (no login).
 * Steps: Bilde → Meny → live home edit (board handoff).
 */
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const OUT = '/opt/cursor/artifacts';
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
  await page.screenshot({ path: file, fullPage: false });
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
  await page.goto('http://localhost:8081/dashboard-themes', {
    waitUntil: 'networkidle2',
    timeout: 120000,
  });
  await page.waitForSelector('[data-testid="home-setup-wizard"]', { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 800));

  // Stepper: image, dock, board — no widgets/preview form steps
  for (const id of ['image', 'dock', 'board']) {
    const el = await page.$(`[data-testid="home-setup-step-${id}"]`);
    if (!el) throw new Error(`missing stepper step ${id}`);
  }
  for (const id of ['widgets', 'preview']) {
    const el = await page.$(`[data-testid="home-setup-step-${id}"]`);
    if (el) throw new Error(`unexpected old step ${id}`);
  }

  // Panel is image first
  if (!(await page.$('[data-testid="home-setup-panel-image"]'))) {
    throw new Error('expected image panel');
  }
  if (await page.$('[data-testid="home-setup-panel-widgets"]')) {
    throw new Error('widgets panel should be gone');
  }

  await shot('tilpass_hjem_step1_bilde');

  await tap('home-setup-next');
  await page.waitForSelector('[data-testid="home-setup-panel-dock"]');
  await new Promise((r) => setTimeout(r, 400));
  await shot('tilpass_hjem_step2_meny');

  // Finish → live preview enters edit mode (gallery onComplete)
  await tap('home-setup-finish');
  await page.waitForSelector('[data-testid="home-edit-hint"]', { timeout: 10000 });
  await page.waitForSelector('[data-testid="home-add-widget"]');
  // Pencil should show checkmark (editing on)
  const editing = await page.$('[data-testid="home-edit-toggle"]');
  if (!editing) throw new Error('edit toggle missing after finish');

  // Scroll preview into view for screenshot
  await page.$eval('[data-testid="home-widget-board"]', (el) => {
    el.scrollIntoView({ block: 'start' });
  });
  await new Promise((r) => setTimeout(r, 500));
  await shot('tilpass_hjem_step3_live_edit');

  const hint = await page.$eval('[data-testid="home-edit-hint"]', (el) => el.textContent || '');
  console.log('edit hint:', hint);
  if (!/Standard widgets|Dra for å flytte/i.test(hint)) {
    throw new Error(`unexpected edit hint: ${hint}`);
  }
  if (!(await page.$('[data-testid="home-add-widget"]'))) {
    throw new Error('add widget not visible in edit mode');
  }

  // Tapping Widgets step in stepper also finishes
  await page.$eval('[data-testid="home-setup-wizard"]', (el) => {
    el.scrollIntoView({ block: 'start' });
  });
  await tap('home-setup-step-image');
  await page.waitForSelector('[data-testid="home-setup-panel-image"]');
  await tap('home-setup-step-board');
  await page.waitForSelector('[data-testid="home-add-widget"]');

  console.log('verify-tilpass-hjem-3-steg: ok');
} catch (err) {
  await shot('tilpass_hjem_error');
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
