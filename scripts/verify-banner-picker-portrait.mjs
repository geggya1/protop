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
page.setDefaultTimeout(180000);

async function shot(name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log('saved', file);
}

async function tap(id) {
  await page.waitForSelector(`[data-testid="${id}"]`, { timeout: 90000 });
  await page.$eval(`[data-testid="${id}"]`, (el) => {
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    el.click();
  });
}

async function imgMetrics(testId) {
  return page.evaluate((id) => {
    const card = document.querySelector(`[data-testid="${id}"]`);
    const img = card?.querySelector('img');
    if (!img) return { error: 'no img', id };
    const r = img.getBoundingClientRect();
    return {
      id,
      imgW: Math.round(r.width),
      imgH: Math.round(r.height),
      naturalW: img.naturalWidth,
      naturalH: img.naturalHeight,
      aspect: Number((r.width / r.height).toFixed(3)),
      objectFit: getComputedStyle(img).objectFit,
      complete: img.complete,
    };
  }, testId);
}

try {
  await page.goto('http://localhost:8081/dashboard-themes', {
    waitUntil: 'networkidle2',
    timeout: 180000,
  });
  await new Promise((r) => setTimeout(r, 1500));

  // Ensure image step / group chips are visible
  let hasGroup = await page.$('[data-testid="home-banner-group-barn"]');
  if (!hasGroup) {
    for (const id of [
      'home-setup-step-image',
      'preview-open-setup',
      'home-banner-edit',
      'home-setup-wizard',
    ]) {
      const el = await page.$(`[data-testid="${id}"]`);
      if (el) {
        await el.evaluate((node) => {
          node.scrollIntoView({ block: 'center' });
          node.click();
        });
        await new Promise((r) => setTimeout(r, 600));
      }
    }
    hasGroup = await page.$('[data-testid="home-banner-group-barn"]');
  }

  await page.waitForSelector('[data-testid="home-banner-group-barn"]', { timeout: 90000 });

  await tap('home-banner-group-barn');
  await new Promise((r) => setTimeout(r, 700));
  const spark = await page.$('[data-testid="home-banner-gutt-barn-sparkesykkel"]');
  if (!spark) throw new Error('missing sparkesykkel card');
  await spark.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await new Promise((r) => setTimeout(r, 500));
  await shot('picker-barn-after-fix');

  const barnMetrics = await imgMetrics('home-banner-gutt-barn-sparkesykkel');
  console.log('barn metrics', barnMetrics);
  if (!barnMetrics.naturalW || barnMetrics.naturalH <= barnMetrics.naturalW) {
    throw new Error(`sparkesykkel not portrait: ${JSON.stringify(barnMetrics)}`);
  }
  // Thumb box must be ~9:16. Intrinsic PNG height must not leak into layout.
  if (barnMetrics.aspect < 0.45 || barnMetrics.aspect > 0.7) {
    throw new Error(`barn thumb not ~9:16: ${JSON.stringify(barnMetrics)}`);
  }
  if (barnMetrics.imgH > 500) {
    throw new Error(`barn thumb still oversized: ${JSON.stringify(barnMetrics)}`);
  }

  await tap('home-banner-group-voksen');
  await new Promise((r) => setTimeout(r, 700));
  const middag = await page.$('[data-testid="home-banner-voksen-middag-plan"]');
  if (!middag) throw new Error('missing middag-plan card');
  await middag.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await new Promise((r) => setTimeout(r, 500));
  await shot('picker-voksen-after-fix');

  const voksenMetrics = await imgMetrics('home-banner-voksen-middag-plan');
  console.log('voksen metrics', voksenMetrics);
  if (!voksenMetrics.naturalW || voksenMetrics.naturalH <= voksenMetrics.naturalW) {
    throw new Error(`middag not portrait: ${JSON.stringify(voksenMetrics)}`);
  }

  const childBtn = await page.$('[data-testid="preview-role-child"]');
  if (childBtn) {
    await childBtn.evaluate((el) => el.click());
    await new Promise((r) => setTimeout(r, 1000));
    if (await page.$('[data-testid="home-banner-group-barn"]')) {
      await tap('home-banner-group-barn');
      await new Promise((r) => setTimeout(r, 500));
      const b = await page.$('[data-testid="home-banner-gutt-barn-sparkesykkel"]');
      if (b) {
        await b.evaluate((el) => el.scrollIntoView({ block: 'center' }));
        await shot('picker-barn-child-role');
      }
    }
  }

  console.log('OK');
} catch (e) {
  console.error('FAIL', e);
  await page.screenshot({ path: path.join(OUT, 'picker-error.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
