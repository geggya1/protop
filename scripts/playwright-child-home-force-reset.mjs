import { chromium, devices } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = '/opt/cursor/artifacts';
fs.mkdirSync(OUT, { recursive: true });
const base = process.env.BASE_URL || 'http://127.0.0.1:4178';

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const phone = devices['iPhone 13'];
const context = await browser.newContext({
  ...phone,
  locale: 'nb-NO',
});
const page = await context.newPage();

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'OK' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
}

await page.goto(`${base}/dashboard-themes`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1500);

// Switch to child role if a control exists
const childBtn = page.getByText('Barn', { exact: true }).first();
if (await childBtn.count()) {
  await childBtn.click();
  await page.waitForTimeout(1200);
}

const bodyText = await page.locator('body').innerText();
check('shows Dagens gjøremål', /Dagens gjøremål/i.test(bodyText), bodyText.slice(0, 120));
check('shows Gjenstår or nudge', /Gjenstår|ting igjen|digg jobba/i.test(bodyText));
check('shows Avtaler i morgen or I morgen', /Avtaler i morgen|I morgen/i.test(bodyText));
check('child-tasks-pastel mounted', await page.getByTestId('child-tasks-pastel').count() > 0);

// Capture full phone viewport
await page.screenshot({
  path: path.join(OUT, 'child_gallery_force_reset_phone.png'),
  fullPage: true,
});

// Scroll to chores card
const chores = page.getByTestId('child-tasks-pastel').first();
if (await chores.count()) {
  await chores.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await chores.screenshot({ path: path.join(OUT, 'child_chores_fullwidth.png') });
  const box = await chores.boundingBox();
  check('chores nearly full width', box && box.width >= 300, JSON.stringify(box));
}

// Simulate stale AsyncStorage layout under alias, then reload via in-page eval of storage key shape
await page.evaluate(() => {
  const oldBoard = [
    { id: 'w-today', type: 'timeline', col: 0, row: 0, gw: 5, gh: 3 },
    { id: 'w-tasks', type: 'tasks', col: 0, row: 3, gw: 2, gh: 3 },
    { id: 'w-homework', type: 'homework', col: 2, row: 3, gw: 3, gh: 3 },
    { id: 'w-school', type: 'school', col: 0, row: 6, gw: 5, gh: 2 },
    { id: 'w-shortcuts', type: 'shortcuts', col: 0, row: 8, gw: 5, gh: 2, variant: 'row' },
  ];
  const stale = JSON.stringify({
    templateVersion: 6,
    look: 'oversikt',
    widgets: oldBoard,
    bottomIds: ['home', 'plan', 'stars', 'more'],
    bottomNavEnabled: true,
  });
  // AsyncStorage on web prefixes differently; also set raw localStorage keys used by RN AsyncStorage
  const keys = [
    'weekplan.homeLayout.v1.child.child-doc-test',
    'weekplan.homeLayout.v1.child.child-auth-test',
  ];
  keys.forEach((k) => {
    try { localStorage.setItem(k, stale); } catch {}
  });
  return keys;
});

fs.writeFileSync(path.join(OUT, 'child_home_preview_checks.json'), JSON.stringify({ base, checks }, null, 2));
const failed = checks.filter((c) => !c.ok);
await browser.close();
if (failed.length) {
  console.error('FAILED', failed);
  process.exit(1);
}
console.log('playwright child gallery: ok');
