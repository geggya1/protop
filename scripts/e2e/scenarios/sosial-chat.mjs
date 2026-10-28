/**
 * Sosial-bot (team B): chat mellom kolleger (ChatDock) med tre boter.
 *
 *   eier     = Eva Eier (PC)
 *   kollega  = Kim Kollega (mobil)
 *   kollega2 = Kari Kollega (PC)
 *
 * Dekker: direktemelding begge veier i sanntid, varsel-popup og innboks, ulest-teller,
 * «Alle ansatte»-gruppen, lesetilgang for utenforstående og sending uten nett.
 *
 *   cd /home/user/protop && NODE_PATH=$(npm root -g) node scripts/e2e/scenarios/sosial-chat.mjs
 */
import { Bot, closeBrowser } from '../lib/bot.mjs';
import { listDocs, getDoc } from '../lib/emu.mjs';
import {
  setupWorld, startBots, Report, asUser, tap, seen, gone, go, closeDock, dismissPopup,
  visibleIdx, snippet, sleep, notifs,
} from './sosial-lib.mjs';

const R = new Report('sosial-chat');
const world = await setupWorld();
const { people: P, companyId } = world;
R.info(`Verden: ${world.companyName} (${companyId})`);

const bots = await startBots(world, [['eier', 'desktop'], ['kollega', 'phone'], ['kollega2', 'desktop']], Bot);
const { eier, kollega, kollega2 } = bots;
R.bots = Object.values(bots);
const dmId = `dm_${[P.eier.uid, P.kollega.uid].sort().join('_')}`;

async function openCompose(bot) {
  const label = bot.view === 'phone' ? 'Chat' : 'Ny chat';
  await tap(bot, bot.page.getByLabel(label, { exact: true }).last());
  await sleep(1200);
}
async function threadOpen(bot) {
  return (await visibleIdx(bot.page.getByPlaceholder('Skriv en melding…'))).length > 0;
}
/** Tallet som står rett etter en rad i chatlisten (ulest-merket), ellers 0. */
async function badgeAfter(bot, rowName, subtitle) {
  const t = await bot.visibleText();
  const i = t.lastIndexOf(`${rowName}\n${subtitle}`);
  if (i < 0) return null;
  const lines = t.slice(i).split('\n').map((s) => s.trim()).filter(Boolean);
  return /^\d+$/.test(lines[2] || '') ? Number(lines[2]) : 0;
}

try {
  await Promise.all([go(eier, 'home'), go(kollega, 'home'), go(kollega2, 'home')]);

  await R.step('C-01', 'Eva åpner «Ny chat»', 'Kolleger (Kari, Kim) og «Alle ansatte» vises', async () => {
    await openCompose(eier);
    await seen(eier, 'Kim Kollega', 20000);
    await seen(eier, 'Alle ansatte', 5000);
    const t = await eier.visibleText();
    const shot = await eier.shot('c01-ny-chat');
    R.ux('C-UX1', 'Chatlisten i bedrift er uten familie-ord', 'Ingen «middag»', !/middag/i.test(t), snippet(t, 'Chat med AI', 60), shot);
    return { ok: t.includes('Kim Kollega') && t.includes('Kari Kollega') && t.includes('Alle ansatte'), actual: snippet(t, 'Ny chat', 220) || snippet(t, 'ANSATTE', 120), shot };
  }, { bot: eier });

  const m1 = `Hei Kim, møte kl 14? ${Date.now().toString().slice(-5)}`;
  await R.step('C-02', 'Eva sender direktemelding til Kim', 'Meldingen vises i Evas tråd', async () => {
    await tap(eier, 'Kim Kollega', { last: true });
    await sleep(2000);
    await eier.fill('Skriv en melding…', m1);
    await tap(eier, eier.page.getByLabel('Send', { exact: true }).last());
    const ok = await seen(eier, m1, 10000);
    const shot = await eier.shot('c02-dm-sendt');
    return { ok, actual: `synlig=${ok}`, shot };
  }, { bot: eier });

  await R.step('C-03', 'Kim (mobil) varsles i sanntid med avsenderens navn', 'Popup med meldingen og «Eva»', async () => {
    const got = await seen(kollega, m1, 20000);
    const t = await kollega.visibleText();
    const shot = await kollega.shot('c03-popup');
    const head = snippet(t, 'MELDING', 80) || snippet(t, 'Melding', 80);
    return { ok: got && /Eva/.test(head), actual: `popup=${got} tekst: «${head}»`, shot };
  }, { bot: kollega });

  await R.step('C-04', 'Én melding gir ett varsel i Kims innboks, med riktig tittel', '1 varsel, tittel «Eva Eier»', async () => {
    await sleep(3000);
    const n = (await notifs(listDocs, P.kollega.uid)).filter((x) => x.body === m1);
    return { ok: n.length === 1 && /Eva/.test(n[0].title || ''), actual: n.map((x) => `${x.id.split('_')[0]}…: «${x.title}»`).join(' | ') || 'ingen' };
  });

  await R.step('C-05', 'Ulest-teller ved Eva i Kims chatliste', 'Viser 1', async () => {
    await dismissPopup(kollega);
    await openCompose(kollega);
    const b = await badgeAfter(kollega, 'Eva Eier', 'Daglig leder');
    const shot = await kollega.shot('c05-ulest-teller');
    return { ok: b === 1, actual: `teller=${b}`, shot };
  }, { bot: kollega });

  await R.step('C-06', 'Kim åpner tråden på mobil: meldingen vises og Send-knappen er på skjermen', 'Melding synlig, Send-knapp innenfor 390 px', async () => {
    await tap(kollega, 'Eva Eier', { last: true });
    await sleep(2500);
    const msg = await seen(kollega, m1, 8000);
    const box = await kollega.page.evaluate(() => {
      const el = [...document.querySelectorAll('[aria-label="Send"]')].find((e) => e.getBoundingClientRect().width > 0);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), vw: window.innerWidth };
    });
    const shot = await kollega.shot('c06-trad-mobil');
    return { ok: msg && !!box && box.right <= box.vw, actual: `melding=${msg} Send-knapp ${box ? `${box.left}–${box.right} px av ${box.vw}` : 'mangler'}`, shot };
  }, { bot: kollega });

  const m2 = `Ja, kl 14 passer ${Date.now().toString().slice(-5)}`;
  await R.step('C-07', 'Kim svarer (Enter) → Eva ser svaret i sanntid', 'Svaret vises i Evas åpne tråd', async () => {
    if (!(await threadOpen(eier))) { await openCompose(eier); await tap(eier, 'Kim Kollega', { last: true }); await sleep(1500); }
    await kollega.fill('Skriv en melding…', m2);
    await kollega.page.keyboard.press('Enter');
    const t0 = Date.now();
    const ok = await seen(eier, m2, 20000);
    const shot = await eier.shot('c07-svar-hos-eva');
    return { ok, actual: `synlig=${ok} etter ${((Date.now() - t0) / 1000).toFixed(1)} s`, shot };
  }, { bot: eier });

  await R.step('C-08', 'Etter lesing er Kims ulest-teller nullstilt', 'Ingen tall ved Eva i chatlisten', async () => {
    await closeDock(kollega);
    await openCompose(kollega);
    const b = await badgeAfter(kollega, 'Eva Eier', 'Daglig leder');
    const shot = await kollega.shot('c08-etter-lest');
    await closeDock(kollega);
    return { ok: b === 0, actual: `teller=${b}`, shot };
  }, { bot: kollega });

  await R.step('C-09', 'Ulest-tellingen lagres i chat-dokumentets unreadCounts-kart', 'unreadCounts.{uid} som kart, ikke felt med punktum i navnet', async () => {
    const d = await getDoc(`families/${companyId}/chats/${dmId}`);
    const dotted = Object.keys(d || {}).filter((k) => /^(unreadCounts|reads)\./.test(k));
    return { ok: dotted.length === 0, actual: dotted.length ? `toppnivåfelt med punktum: ${dotted.map((k) => k.split('.')[0] + '.<uid>').join(', ')}; kart: ${JSON.stringify(Object.keys(d.unreadCounts || {}).length)} nøkkel(er)` : 'ok' };
  });

  const m3 = `Til alle: HMS-møte fredag ${Date.now().toString().slice(-4)}`;
  await R.step('C-10', '«Alle ansatte»: Eva skriver → Kim og Kari får det i sanntid', 'Kim (mobil) og Kari (PC) ser meldingen', async () => {
    await closeDock(eier);
    await openCompose(eier);
    await tap(eier, 'Alle ansatte', { last: true });
    await sleep(2000);
    await eier.fill('Skriv en melding…', m3);
    await tap(eier, eier.page.getByLabel('Send', { exact: true }).last());
    const k = await seen(kollega, m3, 20000);
    const ka = await seen(kollega2, m3, 20000);
    const shot = await kollega2.shot('c10-alle-ansatte-kari');
    await kollega.shot('c10-alle-ansatte-kim');
    return { ok: k && ka, actual: `Kim=${k} Kari=${ka}`, shot };
  }, { bot: kollega2 });

  const m4 = `Kari her: jeg tar med kaffe ${Date.now().toString().slice(-4)}`;
  await R.step('C-11', 'Kari svarer i «Alle ansatte» → Eva og Kim ser svaret', 'Svaret når begge i sanntid', async () => {
    await dismissPopup(kollega2);
    await openCompose(kollega2);
    await tap(kollega2, 'Alle ansatte', { last: true });
    await sleep(2000);
    const hist = await seen(kollega2, m3, 8000);
    await kollega2.fill('Skriv en melding…', m4);
    await tap(kollega2, kollega2.page.getByLabel('Send', { exact: true }).last());
    const e = await seen(eier, m4, 20000);
    const k = await seen(kollega, m4, 20000);
    const shot = await eier.shot('c11-svar-alle');
    return { ok: hist && e && k, actual: `Kari ser historikk=${hist} Eva=${e} Kim=${k}`, shot };
  }, { bot: eier });

  await R.step('C-12', 'Utenforstående kan ikke lese bedriftens chat via reglene', 'REST-lesing gir 403', async () => {
    const u = await asUser(P.utenfor);
    const r = await u.list(`families/${companyId}/chats/${dmId}/messages`);
    return { ok: r.status === 403, actual: `HTTP ${r.status}` };
  });

  const m5 = `Sendt uten nett ${Date.now().toString().slice(-4)}`;
  await R.step('C-13', 'Uten nett: Eva sender, meldingen kommer fram når nettet er tilbake', 'Meldingen leveres til Kim etter gjenoppkobling', async () => {
    await closeDock(eier);
    await openCompose(eier);
    await tap(eier, 'Kim Kollega', { last: true });
    await sleep(1500);
    await eier.ctx.setOffline(true);
    await eier.fill('Skriv en melding…', m5);
    await tap(eier, eier.page.getByLabel('Send', { exact: true }).last());
    await sleep(5000);
    const shotOff = await eier.shot('c13-uten-nett');
    const local = await seen(eier, m5, 2000);
    const t = await eier.visibleText();
    const hint = /ikke sendt|venter på nett|uten nett|offline|frakoblet|sendes når/i.test(t);
    await eier.ctx.setOffline(false);
    const delivered = await seen(kollega, m5, 30000);
    R.ux('C-UX2', 'Sending uten nett gir beskjed', 'Tekst om at meldingen venter/ikke er sendt', hint, `lokal visning=${local}, ingen statusmerking`, shotOff);
    return { ok: delivered, actual: `vist lokalt=${local}, levert etter gjenoppkobling=${delivered}`, shot: shotOff };
  }, { bot: eier });
} catch (err) {
  R.add('C-XX', 'Uventet stopp i skriptet', 'Ingen unntak', false, String(err?.stack || err).slice(0, 400));
} finally {
  await closeBrowser();
}
const bad = R.finish({ world: { tag: world.tag, companyId } });
process.exit(bad ? 1 : 0);
