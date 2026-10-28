/**
 * Sosial-bot (team B): Oppgaver mellom to kolleger, og Hjem-widgeten.
 *
 *   eier    = Eva Eier (PC)
 *   kollega = Kim Kollega (mobil)
 *
 * Dekker: opprett, tildel kollega (sanntid i liste og på Hjem), fullfør, gjenåpne,
 * slett, papirkurv, gjenopprett, slett permanent (FL-20) og egen oppgave på Hjem.
 *
 *   cd /home/user/protop && NODE_PATH=$(npm root -g) node scripts/e2e/scenarios/sosial-oppgaver.mjs
 */
import { Bot, closeBrowser } from '../lib/bot.mjs';
import { listDocs } from '../lib/emu.mjs';
import {
  setupWorld, startBots, Report, asUser, tap, seen, gone, go, closeDock, dismissPopup,
  clickRowEnd, clickRowStart, visibleIdx, snippet, sleep,
} from './sosial-lib.mjs';

const R = new Report('sosial-oppgaver');
const world = await setupWorld();
const { people: P, companyId } = world;
R.info(`Verden: ${world.companyName} (${companyId})`);

const bots = await startBots(world, [['eier', 'desktop'], ['kollega', 'phone']], Bot);
const { eier, kollega } = bots;
R.bots = Object.values(bots);
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
const tag = Date.now().toString().slice(-4);
const delegated = `Bestill stillas ${tag}`;
const own = `Ring rørlegger ${tag}`;

async function todo(title) {
  return (await listDocs(`families/${companyId}/parentTodos`)).find((t) => t.title === title) || null;
}
async function createTask(bot, title, who) {
  await tap(bot, 'Ny oppgave');
  await sleep(800);
  const dlg = await bot.visibleText();
  if (!createTask.logged) createTask.logged = true; else return finishCreate(bot, title, who);
  R.ux('O-UX1', '«Ny oppgave» i bedrift uten familie-/belønningsord', 'Ingen «belønning»/«familiemedlemmer»', !/belønning|familiemedlemmer/i.test(dlg), [snippet(dlg, 'Inngår ikke', 50), snippet(dlg, 'Inviter familie', 50)].filter(Boolean).join(' | '));
  return finishCreate(bot, title, who);
}
async function finishCreate(bot, title, who) {
  await bot.fill('F.eks. Betale strøm, bestille time…', title);
  await bot.page.getByLabel('Velg fristdato').fill(today);
  if (who) await tap(bot, who, { last: true });
  await tap(bot, 'Opprett oppgave', { last: true });
  await sleep(1500);
}
async function phoneFilter(bot, label) {
  await tap(bot, bot.page.getByLabel('Filter og sortering'), { force: true });
  await sleep(700);
  await tap(bot, label, { exact: false, last: true });
  await tap(bot, 'Lukk', { last: true }).catch(() => {});
  await sleep(1000);
}

try {
  await Promise.all([go(eier, 'stars'), go(kollega, 'home', null, 3500)]);

  await R.step('O-01', 'Eva oppretter oppgave med frist i dag og tildeler Kim', 'Vises hos Eva under «Tildelt til andre» med «Til: Kim · Pågår»', async () => {
    await createTask(eier, delegated, 'Kim');
    const ok = await seen(eier, 'Til: Kim · Pågår', 10000) && await seen(eier, delegated, 2000);
    const shot = await eier.shot('o01-tildelt');
    const t = await todo(delegated);
    return { ok: ok && t?.assignedTo === P.kollega.uid, actual: `synlig=${ok} assignedTo=Kim:${t?.assignedTo === P.kollega.uid}`, shot };
  }, { bot: eier });

  await R.step('O-02', 'Kims Hjem oppdateres i sanntid', '«1 av 1 gjenstår» og tittelen på Hjem-widgeten', async () => {
    const ok = await seen(kollega, '1 av 1 gjenstår', 20000);
    const title = await seen(kollega, delegated, 3000);
    const shot = await kollega.shot('o02-hjem-kim');
    await dismissPopup(kollega);
    return { ok: ok && title, actual: `teller=${ok} tittel=${title}`, shot };
  }, { bot: kollega });

  await R.step('O-03', 'Kim ser oppgaven i Oppgaver på mobil', 'Oppgaven står under «Mine oppgaver · i dag»', async () => {
    await go(kollega, 'stars');
    await dismissPopup(kollega);
    const ok = await seen(kollega, delegated, 10000);
    const shot = await kollega.shot('o03-kim-liste');
    const t = await kollega.visibleText();
    R.ux('O-UX2', 'Oppgavesiden for ansatte uten «belønning»', 'Ingen «belønning»', !/belønning/i.test(t), snippet(t, 'Fristbaserte', 90), shot);
    return { ok, actual: `synlig=${ok}`, shot };
  }, { bot: kollega });

  await R.step('O-04', 'Kim krysser av → Eva ser «Ferdig» i sanntid', 'Oppgaven forsvinner fra Evas «Åpne»', async () => {
    await clickRowEnd(kollega, delegated, 29, { minWidth: 340 });
    await sleep(1500);
    const kGone = await gone(kollega, delegated, 8000);
    const eGone = await gone(eier, 'Til: Kim · Pågår', 20000);
    const t = await todo(delegated);
    const shot = await eier.shot('o04-eva-etter-fullfort');
    return { ok: kGone && eGone && (t?.completedDates || []).includes(today), actual: `borte hos Kim=${kGone} hos Eva=${eGone} completedDates=${JSON.stringify(t?.completedDates)}`, shot };
  }, { bot: eier });

  await R.step('O-05', 'Kim gjenåpner fra «Ferdig» → Eva ser «Pågår» igjen', '«Til: Kim · Pågår» hos Eva', async () => {
    await phoneFilter(kollega, 'Ferdig (');
    await clickRowEnd(kollega, delegated, 29, { minWidth: 340 });
    await sleep(1500);
    const e = await seen(eier, 'Til: Kim · Pågår', 20000);
    const shot = await eier.shot('o05-gjenapnet');
    await phoneFilter(kollega, 'Åpne');
    return { ok: e, actual: `Pågår hos Eva=${e}`, shot };
  }, { bot: eier });

  await R.step('O-06', 'Eva sletter oppgaven fra detaljvinduet («Slett oppgave»)', 'Bekreftelse vises og oppgaven flyttes til papirkurven', async () => {
    await tap(eier, delegated);
    await sleep(1500);
    const detail = await eier.visibleText();
    R.ux('O-UX3', 'Detaljvinduet viser riktig status og ansvarlig', 'Status og «Ansvarlig»-tekst stemmer med oppgaven', !/Oppgaven gjelder deg\./.test(detail), snippet(detail, 'Ansvarlig', 60));
    eier.dialogs.length = 0;
    await tap(eier, 'Slett oppgave');
    await sleep(2500);
    const asked = eier.dialogs.length > 0 || await seen(eier, `Slette «${delegated}»`, 1000);
    const t = await todo(delegated);
    const shot = await eier.shot('o06-slett-oppgave');
    return { ok: asked && t?.deleted === true, actual: `bekreftelse=${asked}${eier.dialogs.length ? ` («${eier.dialogs[0]}»)` : ''}, deleted i databasen=${t?.deleted}`, shot };
  }, { bot: eier });
  await closeDock(eier);
  await tap(eier, eier.page.getByLabel('Lukk', { exact: true }).last()).catch(() => {});

  // Får ikke UI-et slettet oppgaven, settes deleted via reglene som Eva (samme som appen gjør).
  if ((await todo(delegated))?.deleted !== true) {
    const t = await todo(delegated);
    const r = await (await asUser(P.eier)).patch(`families/${companyId}/parentTodos/${t.id}`, { deleted: true }, ['deleted']);
    R.info(`O-06b: deleted=true satt via REST som Eva (HTTP ${r.status}) for å teste papirkurven`);
  }

  await R.step('O-07', 'Slettet oppgave ligger i papirkurven hos Kim (ansvarlig)', 'Papirkurven viser oppgaven', async () => {
    await phoneFilter(kollega, 'Papirkurv');
    const ok = await seen(kollega, delegated, 8000);
    const t = await kollega.visibleText();
    const shot = await kollega.shot('o07-papirkurv-kim');
    return { ok, actual: ok ? 'synlig' : `«${snippet(t, 'PAPIRKURV', 40)}»`, shot };
  }, { bot: kollega });

  await R.step('O-08', 'Gjenopprett fra papirkurven', 'Oppgaven er tilbake under Åpne', async () => {
    if (!(await seen(kollega, delegated, 1000))) return { ok: false, actual: 'Kan ikke testes: papirkurven er tom (se O-07)' };
    await tap(kollega, kollega.page.getByLabel('Gjenopprett').first());
    await sleep(1500);
    const t = await todo(delegated);
    return { ok: t?.deleted === false, actual: `deleted=${t?.deleted}` };
  }, { bot: kollega });

  await R.step('O-09', 'FL-20: «Slett permanent» i papirkurven spør om bekreftelse', 'Bekreftelse før permanent sletting', async () => {
    if ((await todo(delegated))?.deleted !== true) {
      const t = await todo(delegated);
      await (await asUser(P.eier)).patch(`families/${companyId}/parentTodos/${t.id}`, { deleted: true }, ['deleted']);
      await sleep(1500);
    }
    if (!(await seen(kollega, delegated, 3000))) return { ok: false, actual: 'Kan ikke nås i UI: papirkurven er tom (se O-07). Koden sletter uten bekreftelse (RewardsScreen.jsx:938-941 → purgeParentTodo).' };
    kollega.dialogs.length = 0;
    await tap(kollega, kollega.page.getByLabel('Slett permanent').first());
    await sleep(2000);
    const exists = !!(await todo(delegated));
    const shot = await kollega.shot('o09-slett-permanent');
    return { ok: kollega.dialogs.length > 0 || await seen(kollega, 'Er du sikker', 500) || exists, actual: `bekreftelse=${kollega.dialogs.length > 0} finnes fortsatt=${exists}`, shot };
  }, { bot: kollega });

  await R.step('O-10', 'Eva oppretter egen oppgave → vises på Evas Hjem (PC) i sanntid', 'Hjem-widgeten «Oppgaver» viser oppgaven', async () => {
    await go(eier, 'stars');
    await createTask(eier, own, null);
    await go(eier, 'home', null, 3000);
    const ok = await seen(eier, own, 15000);
    const shot = await eier.shot('o10-hjem-eva');
    return { ok, actual: `synlig på Hjem=${ok}`, shot };
  }, { bot: eier });

  await R.step('O-11', 'Eva krysser av egen oppgave i listen → Hjem-widgeten oppdateres', 'Oppgaven er borte fra «Oppgaver» på Hjem', async () => {
    await go(eier, 'stars');
    await clickRowStart(eier, own, 28);
    await sleep(1500);
    const t = await todo(own);
    await go(eier, 'home', null, 3000);
    let updated = false;
    for (let i = 0; i < 20 && !updated; i += 1) {
      const txt = await eier.visibleText();
      updated = !txt.includes(own) || snippet(txt, own, 40).includes('Ferdig');
      if (!updated) await sleep(500);
    }
    const shot = await eier.shot('o11-hjem-etter-fullfort');
    return { ok: (t?.completedDates || []).includes(today) && updated, actual: `completedDates=${JSON.stringify(t?.completedDates)} Hjem viser den som ferdig/fjernet=${updated} («${snippet(await eier.visibleText(), own, 40)}»)`, shot };
  }, { bot: eier });
} catch (err) {
  R.add('O-XX', 'Uventet stopp i skriptet', 'Ingen unntak', false, String(err?.stack || err).slice(0, 400));
} finally {
  await closeBrowser();
}
const bad = R.finish({ world: { tag: world.tag, companyId } });
process.exit(bad ? 1 : 0);
