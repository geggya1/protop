/**
 * Probe (sluttest): registrering → bekreftelseslenke i samme nettleser. Logger adresse og skjerm hvert 2. sekund.
 *   NODE_PATH=$(npm root -g) node scripts/e2e/scenarios/sluttest-probe-verify.mjs
 */
import { Bot, closeBrowser } from '../lib/bot.mjs';
import { linksIn, mailsTo, waitFor, authUserByEmail } from '../lib/emu.mjs';
import { checkConsent, tap, waitText } from './ansatt-lib.mjs';

const ID = Date.now().toString(36);
const email = `a-${ID}-probe@protop.test`;
const b = await new Bot('probe', { email, password: 'Bygg-2026!test', view: process.env.VIEW || 'desktop', outDir: '/home/user/protop/e2e-out/sluttest', consents: false }).start();
const log = [];
const t00 = Date.now();
b.page.on('console', (m) => { if (/sluttest|verify|Verify|error|Error/i.test(m.text())) log.push(`[${((Date.now() - t00) / 1000).toFixed(1)}s console.${m.type()}] ${m.text().slice(0, 300)}`); });
b.page.on('framenavigated', (f) => { if (f === b.page.mainFrame()) log.push(`[nav] ${f.url()}`); });
try {
  await b.goto('/login');
  await b.page.waitForSelector('input[type=password]', { timeout: 300000 });
  await tap(b, 'Registrer deg');
  await waitText(b, /Opprett konto/, 20000);
  await b.fill('Ditt navn', 'Pia Probe');
  await b.fill('navn@domene.no', email);
  await b.fill('Minst 8 tegn', 'Bygg-2026!test');
  await checkConsent(b);
  await tap(b, 'Registrer');
  await waitText(b, /Bekreft e-posten din/, 30000);
  const mail = await waitFor(() => mailsTo(email).find((m) => /Bekreft/i.test(m.subject)), { timeout: 30000 });
  const link = linksIn(mail).find((l) => /verify-email\?vt=/.test(l));
  console.log('lenke', link);
  if (process.env.WAIT_BEFORE) await b.page.waitForTimeout(Number(process.env.WAIT_BEFORE));
  await b.page.goto(link, { waitUntil: 'domcontentloaded' });
  const t0 = Date.now();
  for (let i = 0; i < 30; i += 1) {
    await b.page.waitForTimeout(2000);
    const url = b.page.url().replace('http://localhost:8081', '');
    const txt = (await b.visibleText()).split('\n').filter(Boolean).slice(0, 3).join(' | ');
    const ver = (await authUserByEmail(email))?.emailVerified;
    console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s url=${url} verified=${ver} :: ${txt}`);
    if (i === 3) await b.shot('probe-verify-8s');
  }
  await b.shot('probe-verify-60s');
} finally {
  console.log(log.join('\n'));
  await closeBrowser();
}
