/**
 * Sosial-bot (team B): Kalender mellom kolleger, Hjem «Dagens avtaler»,
 * og kobling av Outlook/Google/ICS og e-post uten nett.
 *
 *   eier    = Eva Eier (PC)
 *   kollega = Kim Kollega (mobil)
 *   (Kari Kollega brukes bare via REST for å teste hva reglene slipper gjennom)
 *
 *   cd /home/user/protop && NODE_PATH=$(npm root -g) node scripts/e2e/scenarios/sosial-kalender.mjs
 */
import { Bot, closeBrowser } from '../lib/bot.mjs';
import { listDocs } from '../lib/emu.mjs';
import {
  setupWorld, startBots, Report, asUser, tap, seen, gone, go, closeDock, dismissPopup,
  visibleIdx, snippet, sleep,
} from './sosial-lib.mjs';

const R = new Report('sosial-kalender');
const world = await setupWorld();
const { people: P, companyId } = world;
R.info(`Verden: ${world.companyName} (${companyId})`);

const bots = await startBots(world, [['eier', 'desktop'], ['kollega', 'phone']], Bot);
const { eier, kollega } = bots;
R.bots = Object.values(bots);
const tag = Date.now().toString().slice(-4);
const title = `Byggemøte ${tag}`;
const title2 = `Byggemøte FLYTTET ${tag}`;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

async function event(t) {
  return (await listDocs(`families/${companyId}/events`)).find((e) => e.title === t) || null;
}
async function rawInternal(bot) {
  const t = await bot.visibleText();
  return /(^|\n)internal(\n|$)/.test(t);
}

try {
  await Promise.all([go(eier, 'plan'), go(kollega, 'home', null, 3500)]);

  await R.step('K-01', 'Eva lager ukentlig hendelse i dag, inviterer Kim', 'Hendelsen vises i Evas uke', async () => {
    await tap(eier, 'Ny hendelse');
    await sleep(1200);
    const dlg = await eier.visibleText();
    R.ux('K-UX1', '«Hvem skal se denne?» i bedrift', 'Ingen «Hele familien»', !/Hele familien/.test(dlg), snippet(dlg, 'Hvem skal se denne?', 90));
    await eier.fill('Tittel', title);
    await eier.fill('Sted (valgfritt)', 'Brakka');
    await tap(eier, 'Kim Kollega', { last: true });
    await tap(eier, 'Gjenta');
    await tap(eier, 'Hver uke', { last: true });
    await sleep(500);
    const shotF = await eier.shot('k01-skjema');
    await tap(eier, 'Lagre', { last: true });
    await sleep(2000);
    const ok = await seen(eier, title, 8000);
    const ev = await event(title);
    const shot = await eier.shot('k01-lagret');
    return { ok: ok && !!ev && ev.recurring === true && (ev.memberIds || []).includes(P.kollega.uid), actual: `synlig=${ok} gjentas=${ev?.recurring}/${ev?.recurrenceType} medlemmer=${(ev?.memberIds || []).length}`, shot: shot || shotF };
  }, { bot: eier });

  await R.step('K-02', 'Kims Hjem «Dagens avtaler» oppdateres i sanntid', 'Hendelsen vises på Kims Hjem', async () => {
    const ok = await seen(kollega, title, 20000);
    await sleep(1000);
    await dismissPopup(kollega);
    const still = await seen(kollega, title, 5000);
    const shot = await kollega.shot('k02-hjem-kim');
    return { ok: ok && still, actual: `varsel/visning=${ok} på Hjem etter popup=${still}`, shot };
  }, { bot: kollega });

  await R.step('K-03', 'Kim ser hendelsen i Kalender (mobil)', 'Hendelsen står i ukelisten med «Eva, Kim»', async () => {
    await go(kollega, 'plan');
    await dismissPopup(kollega);
    const ok = await seen(kollega, title, 10000);
    const t = await kollega.visibleText();
    const shot = await kollega.shot('k03-kalender-kim');
    R.ux('K-UX2', 'Kalendervisninger på mobil i bedrift', 'Ingen «Mat»-fane', !/\nMat\n/.test(t), snippet(t, 'Dag\n', 30));
    return { ok, actual: `synlig=${ok}`, shot };
  }, { bot: kollega });

  await R.step('K-04', 'Ukeoverskriften på mobil viser riktige måneder', 'F.eks. «26. okt – 1. nov» når uka går over månedsskiftet', async () => {
    const t = await kollega.visibleText();
    const label = (t.match(/Uke \d+ · [^\n]+/) || [''])[0];
    const now = new Date();
    const dow = (now.getDay() + 6) % 7;
    const mon = new Date(now); mon.setDate(now.getDate() - dow);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const spans = mon.getMonth() !== sun.getMonth();
    const ok = !spans || (label.toLowerCase().includes(MONTHS[mon.getMonth()]) && label.toLowerCase().includes(MONTHS[sun.getMonth()]));
    return { ok, actual: `«${label}» (uka ${mon.getDate()}.${mon.getMonth() + 1}–${sun.getDate()}.${sun.getMonth() + 1}${spans ? ', over månedsskifte' : ''})` };
  });

  await R.step('K-05', 'Gjentakelsen vises for Kim neste uke', 'Samme hendelse i neste uke', async () => {
    await tap(kollega, kollega.page.getByLabel('Neste periode').first());
    await sleep(1500);
    const ok = await seen(kollega, title, 8000);
    const shot = await kollega.shot('k05-neste-uke');
    await tap(kollega, kollega.page.getByLabel('Forrige periode').first());
    await sleep(1000);
    return { ok, actual: `synlig neste uke=${ok}`, shot };
  }, { bot: kollega });

  await R.step('K-06', 'Kari (ikke invitert) kan ikke lese hendelsen via reglene', 'REST GET som Kari gir 403', async () => {
    const ev = await event(title);
    const r = await (await asUser(P.kollega2)).get(`families/${companyId}/events/${ev.id}`);
    return { ok: r.status === 403, actual: `HTTP ${r.status}${r.body?.fields?.title ? ` tittel=«${r.body.fields.title.stringValue}»` : ''}` };
  });

  await R.step('K-07', 'Eva endrer tittel → Kim ser endringen i sanntid', 'Ny tittel hos Kim uten omlasting', async () => {
    await tap(eier, title);
    await sleep(1500);
    const inputs = eier.page.locator('input');
    const n = await inputs.count();
    for (let i = 0; i < n; i += 1) {
      if ((await inputs.nth(i).inputValue().catch(() => '')) === title) { await inputs.nth(i).fill(title2); break; }
    }
    await tap(eier, 'Oppdater', { last: true });
    await sleep(1500);
    const e = await seen(eier, title2, 8000);
    const k = await seen(kollega, title2, 20000);
    const shot = await kollega.shot('k07-endret-hos-kim');
    await dismissPopup(kollega);
    return { ok: e && k, actual: `Eva=${e} Kim=${k}`, shot };
  }, { bot: kollega });

  await R.step('K-08', 'Eva sletter hendelsen → bekreftelse, borte hos Kim i sanntid', '«Dette kan ikke angres», hendelsen forsvinner hos begge', async () => {
    await tap(eier, title2);
    await sleep(1500);
    await tap(eier, 'Slett hendelse', { last: true });
    const asked = await seen(eier, 'Dette kan ikke angres', 4000);
    const shotC = await eier.shot('k08-bekreft');
    await tap(eier, 'Ja, slett', { last: true });
    await sleep(1500);
    const e = await gone(eier, title2, 8000);
    const k = await gone(kollega, title2, 20000);
    const shot = await kollega.shot('k08-slettet-hos-kim');
    return { ok: asked && e && k && !(await event(title2)), actual: `bekreftelse=${asked} borte hos Eva=${e} Kim=${k}`, shot: shot || shotC };
  }, { bot: eier });

  // ── Punkt 6: koble eksterne kontoer uten nett ──
  await R.step('K-09', 'Uten nett: «Koble til kalender» gir forståelig norsk melding og henger ikke', 'Siden åpnes innen 10 s, ev. feil forklares på norsk (ikke rå kode)', async () => {
    await go(eier, 'plan');
    await eier.ctx.setOffline(true);
    const t0 = Date.now();
    await tap(eier, 'Koble til kalender');
    const open = await seen(eier, 'Kalenderinnstillinger', 10000);
    await sleep(3000);
    const raw = await rawInternal(eier);
    const t = await eier.visibleText();
    const shot = await eier.shot('k09-koble-kalender-uten-nett');
    R.ux('K-UX3', 'Kalenderinnstillinger i bedrift', 'Ingen «Delt bosted»/barn', !/DELT BOSTED|barna/i.test(t), snippet(t, 'DELT BOSTED', 110));
    R.info(`K-09: Outlook-knappen viser «${snippet(t, 'Microsoft Outlook', 40)}», Google «${snippet(t, 'Google Kalender', 45)}» (ikke konfigurert i emulatorbygget — testmiljø)`);
    await tap(eier, 'OK', { last: true, timeout: 2000 }).catch(() => {});
    return { ok: open && !raw, actual: `åpnet=${open} etter ${((Date.now() - t0) / 1000).toFixed(1)} s, rå «internal» vist=${raw}`, shot };
  }, { bot: eier });

  await R.step('K-10', 'Uten nett: «Legg til ICS-kalender» gir forståelig melding', 'Norsk melding om manglende nett, ikke «internal», innen 15 s', async () => {
    await eier.fill('Navn (valgfritt)', 'Test ICS');
    await eier.fill('https://', 'https://outlook.office365.com/owa/calendar/abc/reachcalendar.ics').catch(() => {});
    const t0 = Date.now();
    await tap(eier, 'Legg til ICS-kalender');
    let done = false;
    for (let i = 0; i < 15 && !done; i += 1) { await sleep(1000); done = await seen(eier, 'Feil', 200) || await seen(eier, 'Kunne ikke', 200); }
    const raw = await rawInternal(eier);
    const shot = await eier.shot('k10-ics-uten-nett');
    await tap(eier, 'OK', { last: true, timeout: 2000 }).catch(() => {});
    return { ok: done && !raw, actual: `svar etter ${((Date.now() - t0) / 1000).toFixed(1)} s, rå «internal»=${raw}`, shot };
  }, { bot: eier });

  await R.step('K-11', 'Uten nett: E-post → «Koble til ny e-postkonto» gir synlig, forståelig melding', 'Melding i vinduet brukeren ser på, ikke «internal» bak vinduet', async () => {
    await go(eier, 'mail', null, 3000);
    await tap(eier, 'Innstillinger');
    await sleep(1500);
    const t0 = Date.now();
    await tap(eier, 'Koble til ny e-postkonto');
    await sleep(6000);
    const t = await eier.visibleText();
    const modalPart = t.slice(t.lastIndexOf('E-postinnstillinger'));
    const inModal = /(nett|feil|kunne ikke|klarte ikke)/i.test(modalPart);
    const raw = await rawInternal(eier);
    const busy = await seen(eier, 'Kobler til…', 500);
    const shot = await eier.shot('k11-epost-uten-nett');
    await eier.ctx.setOffline(false);
    return { ok: inModal && !raw && !busy, actual: `melding i vinduet=${inModal}, rå «internal» på siden=${raw}, henger=«Kobler til…»:${busy} (${((Date.now() - t0) / 1000).toFixed(1)} s)`, shot };
  }, { bot: eier });
} catch (err) {
  R.add('K-XX', 'Uventet stopp i skriptet', 'Ingen unntak', false, String(err?.stack || err).slice(0, 400));
} finally {
  await eier?.ctx?.setOffline(false).catch(() => {});
  await closeBrowser();
}
const bad = R.finish({ world: { tag: world.tag, companyId } });
process.exit(bad ? 1 : 0);
