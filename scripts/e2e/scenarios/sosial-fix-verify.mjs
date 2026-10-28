/**
 * Kort kontroll av sosial-rettingene mot én dev-server (maks to nettleserkontekster):
 *   R-01  /register?friendInvite=…&email=… beholder invitasjonen (SOS-01, V-25)
 *   R-02  Eva sender DM til Kim → ett varsel med avsenderens navn (SOS-11/13, C-04)
 *   R-03  Send-knappen i chatten ligger innenfor 390 px på mobil (SOS-02, C-06)
 *   R-04  Chat-dokumentet har ikke felt med punktum i navnet (SOS-14, C-09)
 *   R-05  Ukeoverskriften i kalenderen (SOS-18)
 *
 *   E2E_BASE=http://localhost:8086 NODE_PATH=$(npm root -g) node scripts/e2e/scenarios/sosial-fix-verify.mjs
 */
import { Bot, closeBrowser } from '../lib/bot.mjs';
import { listDocs, getDoc } from '../lib/emu.mjs';
import {
  setupWorld, Report, tap, seen, go, dismissPopup, sleep, notifs, waitCompany, clearOverlays, watchCrash, OUT,
} from './sosial-lib.mjs';

const R = new Report('sosial-fix-verify');

async function start(world, who, view, opts = {}) {
  const b = await new Bot(who, { ...(world ? world.people[who] : {}), view, outDir: OUT, ...opts }).start();
  b.dialogs = [];
  b.page.on('dialog', async (d) => { b.dialogs.push(d.message()); await d.accept().catch(() => {}); });
  watchCrash(b);
  return b;
}

try {
  // R-01: utlogget, ingen verden trengs.
  const ny = await start(null, 'ny', 'phone', { consents: false });
  await R.step('R-01', 'Lenken /register?friendInvite=…&email=… åpner registreringen med invitasjonen', 'E-post utfylt og boksen «Venneinvitasjon»', async () => {
    await ny.goto('/register?friendInvite=testtoken123&email=nina.ny%40protop.test');
    await ny.page.waitForSelector('input', { timeout: 240000 });
    await sleep(2500);
    const values = await ny.page.$$eval('input', (els) => els.map((e) => e.value));
    const box = await seen(ny, 'Venneinvitasjon', 5000);
    const path = await ny.page.evaluate(() => `${location.pathname}${location.search}`);
    const shot = await ny.shot('r01-registreringslenke');
    return { ok: values.includes('nina.ny@protop.test') && box, actual: `adresse=${path} felt=${JSON.stringify(values.filter(Boolean))} boks=${box}`, shot };
  }, { bot: ny });
  await ny.ctx.close();

  const world = await setupWorld();
  const { people: P, companyId } = world;
  R.info(`Verden: ${world.companyName} (${companyId})`);
  const eier = await start(world, 'eier', 'desktop');
  await eier.login();
  await waitCompany(eier);
  await clearOverlays(eier);
  const kollega = await start(world, 'kollega', 'phone');
  await kollega.login();
  await waitCompany(kollega);
  await clearOverlays(kollega);
  const dmId = `dm_${[P.eier.uid, P.kollega.uid].sort().join('_')}`;

  await go(eier, 'home');
  await go(kollega, 'home');
  const m1 = `Hei Kim, møte kl 14? ${Date.now().toString().slice(-5)}`;
  await R.step('R-02', 'Eva sender DM til Kim: ett varsel hos Kim, med Evas navn', '1 varsel, tittel «Eva Eier»', async () => {
    await tap(eier, eier.page.getByLabel('Ny chat', { exact: true }).last());
    await sleep(1500);
    await tap(eier, 'Kim Kollega', { last: true });
    await sleep(2000);
    await eier.fill('Skriv en melding…', m1);
    await tap(eier, eier.page.getByLabel('Send', { exact: true }).last());
    await seen(kollega, m1, 20000);
    await sleep(4000);
    const n = (await notifs(listDocs, P.kollega.uid)).filter((x) => x.chatId === dmId);
    const shot = await kollega.shot('r02-popup');
    return { ok: n.length === 1 && /Eva/.test(n[0].title || ''), actual: n.map((x) => `${x.id}: «${x.title}» / «${x.body}»`).join(' | ') || 'ingen', shot };
  }, { bot: kollega });

  await R.step('R-03', 'Kim åpner tråden på mobil: Send-knappen er på skjermen', 'Send-knapp innenfor 390 px', async () => {
    await dismissPopup(kollega);
    await tap(kollega, kollega.page.getByLabel('Chat', { exact: true }).last());
    await sleep(1500);
    await tap(kollega, 'Eva Eier', { last: true });
    await sleep(2500);
    await kollega.fill('Skriv en melding…', 'Dette er en ganske lang melding som fyller feltet');
    const box = await kollega.page.evaluate(() => {
      const el = [...document.querySelectorAll('[aria-label="Send"]')].find((e) => e.getBoundingClientRect().width > 0);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), vw: window.innerWidth };
    });
    const shot = await kollega.shot('r03-trad-mobil');
    return { ok: !!box && box.right <= box.vw, actual: box ? `Send-knapp ${box.left}–${box.right} px av ${box.vw}` : 'mangler', shot };
  }, { bot: kollega });

  await R.step('R-04', 'Ulest-tellingen ligger i kartet unreadCounts, ikke i felt med punktum', 'Ingen toppnivåfelt «unreadCounts.<uid>»/«reads.<uid>»', async () => {
    const d = await getDoc(`families/${companyId}/chats/${dmId}`);
    const dotted = Object.keys(d || {}).filter((k) => /^(unreadCounts|reads)\./.test(k));
    return { ok: !!d && dotted.length === 0, actual: `punktum-felt=${dotted.length} kart=${JSON.stringify(d?.unreadCounts || {})} lastSenderName=${d?.lastSenderName || '-'}` };
  });

  await R.step('R-05', 'Ukeoverskriften på mobil viser måned med kortform', '«Uke N · d. mmm.–d. mmm.» eller «d.–d. mmm.»', async () => {
    await kollega.open('plan');
    await sleep(2000);
    const t = await kollega.visibleText();
    const m = t.match(/Uke \d+ · [^\n]+/);
    const shot = await kollega.shot('r05-ukeoverskrift');
    return { ok: !!m && /\d+\.( [a-zæøå]+\.?)?–\d+\. [a-zæøå]+\.?$/.test(m[0]), actual: m ? m[0] : 'fant ikke', shot };
  }, { bot: kollega });
} catch (e) {
  R.info(`UNNTAK: ${e?.message || e}`);
} finally {
  await closeBrowser();
}
const bad = R.finish({});
process.exit(bad ? 1 : 0);
