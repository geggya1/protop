import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const outDir = '/opt/cursor/artifacts/screenshots';
mkdirSync(outDir, { recursive: true });

async function waitForToastHelper(page, timeoutMs = 90000) {
  await page.waitForFunction(
    () => typeof window.__weekplanShowToast === 'function',
    null,
    { timeout: timeoutMs },
  );
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const consoleLogs = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('weekplan-notif') || text.includes('__weekplan')) {
      consoleLogs.push(text);
    }
  });

  console.log('Opening http://localhost:8081 …');
  await page.goto('http://localhost:8081', { waitUntil: 'domcontentloaded', timeout: 120000 });

  // Expo web may redirect; wait for RN root or login UI
  try {
    await page.waitForSelector('body', { timeout: 30000 });
  } catch { /* ignore */ }

  // Give Metro bundle time to hydrate NotificationProvider
  let helperReady = false;
  for (let i = 0; i < 60; i += 1) {
    helperReady = await page.evaluate(() => typeof window.__weekplanShowToast === 'function');
    if (helperReady) break;
    await page.waitForTimeout(1000);
  }
  if (!helperReady) {
    // Try common app entry paths
    for (const path of ['/', '/start', '/app']) {
      await page.goto(`http://localhost:8081${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3000);
      helperReady = await page.evaluate(() => typeof window.__weekplanShowToast === 'function');
      if (helperReady) break;
    }
  }

  if (!helperReady) {
    await page.screenshot({ path: `${outDir}/varsel-helper-missing.png`, fullPage: true });
    console.error('FAIL: window.__weekplanShowToast not available');
    console.error('URL:', page.url());
    console.error('title:', await page.title());
    await browser.close();
    process.exit(1);
  }
  console.log('DEV toast helper ready');

  // Test 1: attest popup
  await page.evaluate(() => {
    window.__weekplanShowToast({
      title: 'Til attestering',
      body: 'Emma: Rydd rommet',
      eventType: 'attestPending',
    });
  });
  await page.waitForTimeout(800);
  const attestVisible = await page.getByText('Til attestering').first().isVisible().catch(() => false);
  const openBtn = await page.getByText('Åpne').first().isVisible().catch(() => false);
  await page.screenshot({ path: `${outDir}/varsel-popup-attest-1.png` });
  console.log('Test1 attest popup visible:', attestVisible, 'Åpne:', openBtn);
  if (!attestVisible || !openBtn) {
    console.error('FAIL test 1');
    await browser.close();
    process.exit(1);
  }

  // Dismiss
  await page.getByText('Lukk').first().click().catch(async () => {
    await page.keyboard.press('Escape');
  });
  await page.waitForTimeout(600);

  // Test 2: chat popup
  await page.evaluate(() => {
    window.__weekplanShowToast({
      title: 'Ny melding',
      body: 'Hei fra Geir',
      eventType: 'messageReceived',
    });
  });
  await page.waitForTimeout(800);
  const chatVisible = await page.getByText('Ny melding').first().isVisible().catch(() => false);
  const bodyVisible = await page.getByText('Hei fra Geir').first().isVisible().catch(() => false);
  await page.screenshot({ path: `${outDir}/varsel-popup-chat-2.png` });
  console.log('Test2 chat popup visible:', chatVisible, 'body:', bodyVisible);
  if (!chatVisible || !bodyVisible) {
    console.error('FAIL test 2');
    await browser.close();
    process.exit(1);
  }

  console.log('BOTH TESTS PASSED');
  console.log('logs:', consoleLogs);
  await browser.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
