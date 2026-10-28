/**
 * Sosial-bot (team B): Notater med to kolleger i samme selskap.
 *
 *   eier    = Eva Eier (PC)
 *   kollega = Kim Kollega (mobil)
 *
 * Dekker: opprett, rediger/lagre, privat vs. delt, deling i sanntid, Hjem-widgeten,
 * sletting, søk, FL-13 (private notater via reglene), FL-19 (Tilbake uten lagring,
 * lagring uten nett, samtidig redigering) og FL-22 (/note/new).
 *
 *   cd /home/user/protop && NODE_PATH=$(npm root -g) node scripts/e2e/scenarios/sosial-notater.mjs
 */
import { Bot, BASE, closeBrowser } from '../lib/bot.mjs';
import { listDocs } from '../lib/emu.mjs';
import {
  setupWorld, startBots, Report, asUser, tap, seen, gone, go, clearOverlays, dismissPopup,
  visibleIdx, snippet, sleep, revive,
} from './sosial-lib.mjs';

const R = new Report('sosial-notater');
const world = await setupWorld();
const { people: P, companyId } = world;
R.info(`Verden: ${world.companyName} (${companyId})`);

const bots = await startBots(world, [['eier', 'desktop'], ['kollega', 'phone']], Bot);
const { eier, kollega } = bots;
R.bots = Object.values(bots);
const BODY = 'Skriv notatet ditt her…';
const title = `Lønnsforhandling ${Date.now().toString().slice(-5)}`;
const secret = 'Hemmelig: Kim får 5 % tillegg fra januar.';
let noteId = null;

async function findNote() {
  const all = await listDocs(`families/${companyId}/notes`);
  return all.find((n) => n.title === title) || null;
}
async function openSettings(bot) {
  // Tannhjulet har tilgjengelig navn etter UX-rettingen («Notatinnstillinger: …»).
  const gear = bot.page.getByLabel(/^Notatinnstillinger/);
  const gv = await visibleIdx(gear);
  if (gv.length) {
    await gear.nth(gv[gv.length - 1]).click();
    await sleep(1500);
    return;
  }
  // Eldre utgave: trykk knappen til venstre for «Lagre».
  const lagre = bot.page.getByText('Lagre', { exact: true });
  const vis = await visibleIdx(lagre);
  const b = await lagre.nth(vis[vis.length - 1]).boundingBox();
  await bot.page.mouse.click(b.x - 40, b.y + b.height / 2);
  await sleep(1500);
}
/** Går fra editor/innstillinger tilbake til notatlisten (openShell nullstiller ikke visningen). */
async function toList(bot) {
  for (let i = 0; i < 2; i += 1) {
    if ((await visibleIdx(bot.page.getByLabel('Tilbake til notat', { exact: true }))).length) {
      await tap(bot, bot.page.getByLabel('Tilbake til notat', { exact: true }));
      await sleep(800);
    }
    if ((await visibleIdx(bot.page.getByLabel('Alle notater', { exact: true }))).length) {
      await tap(bot, bot.page.getByLabel('Alle notater', { exact: true }));
      await sleep(1000);
    }
  }
}
async function okDialog(bot) {
  await tap(bot, 'OK', { last: true, timeout: 3000 }).catch(() => {});
}

try {
  await Promise.all([go(eier, 'notes'), go(kollega, 'home', null, 3500)]);

  await R.step('N-01', 'Hjem-widgeten «Notater» hos Kim uten notater', 'Viser «Tomt»/ingen notater, ikke huskelapper som notater', async () => {
    const t = await kollega.visibleText();
    const tile = snippet(t, 'Notater\n', 60);
    const shot = await kollega.shot('n01-hjem-uten-notater');
    return { ok: /Tomt|Ingen notater/.test(tile) && !/\d+ notat/.test(tile), actual: `Kortet viser: «${tile}»`, shot };
  }, { bot: kollega });
  {
    const t = await kollega.visibleText();
    R.ux('N-UX1', 'Hjem for ansatt er uten familie-forslag', 'Ingen «Planlegg middag»', !t.includes('Planlegg middag'), snippet(t, 'Husk', 60));
  }

  await R.step('N-02', 'Eva oppretter et nytt notat', 'Editoren åpnes', async () => {
    await tap(eier, 'Nytt notat');
    await eier.fill('Tittel…', title);
    await tap(eier, 'Opprett', { last: true });
    const ok = await seen(eier, eier.page.getByPlaceholder(BODY), 10000);
    const shot = await eier.shot('n02-editor');
    noteId = (await findNote())?.id || null;
    return { ok: ok && !!noteId, actual: `editor=${ok} id=${noteId}`, shot };
  }, { bot: eier });

  // FL-19: lagring viser status i editoren («Lagret»), ikke et eget vindu.
  await R.step('N-03', 'Eva skriver og trykker «Lagre»', 'Status «Lagret» og teksten ligger i databasen', async () => {
    await eier.page.getByPlaceholder(BODY).fill(secret);
    await tap(eier, 'Lagre', { last: true });
    const ok = await seen(eier, eier.page.getByText(/Notatet er lagret|^Lagret$/), 10000);
    const shot = await eier.shot('n03-lagret');
    await okDialog(eier);
    const n = await findNote();
    return { ok: ok && n?.body === secret && n?.visibility === 'private', actual: `dialog=${ok} body=«${n?.body}» visibility=${n?.visibility} memberIds=${(n?.memberIds || []).length}`, shot };
  }, { bot: eier });

  await R.step('N-04', 'Kim ser ikke Evas private notat i Notater', 'Notatet vises ikke hos Kim', async () => {
    await go(kollega, 'notes');
    const vis = await seen(kollega, title, 4000);
    const shot = await kollega.shot('n04-kim-notater');
    return { ok: !vis, actual: `synlig=${vis}`, shot };
  }, { bot: kollega });

  const kim = await asUser(P.kollega);
  await R.step('N-05', 'FL-13: Kim leser Evas private notat via reglene (REST GET)', '403 nektet', async () => {
    const r = await kim.get(`families/${companyId}/notes/${noteId}`);
    return { ok: r.status === 403, actual: `HTTP ${r.status}${r.body?.fields?.body ? ` body=«${r.body.fields.body.stringValue}»` : ''}` };
  });
  await R.step('N-06', 'FL-13: Kim lister alle notater i selskapet (REST LIST)', '403 eller uten Evas private notat', async () => {
    const r = await kim.list(`families/${companyId}/notes`);
    const ids = (r.body.documents || []).map((d) => d.name.split('/').pop());
    return { ok: r.status === 403 || !ids.includes(noteId), actual: `HTTP ${r.status}, ${ids.length} notat(er), inkl. Evas private=${ids.includes(noteId)}` };
  });
  await R.step('N-07', 'FL-13: Kim endrer Evas private notat (REST PATCH)', '403 nektet', async () => {
    const r = await kim.patch(`families/${companyId}/notes/${noteId}`, { body: 'Endret av Kim via REST' }, ['body']);
    const after = await findNote();
    if (r.status === 200) {
      const eva = await asUser(P.eier);
      await eva.patch(`families/${companyId}/notes/${noteId}`, { body: secret }, ['body']);
    }
    return { ok: r.status === 403, actual: `HTTP ${r.status}, tekst etterpå=«${after?.body}» (satt tilbake av Eva)` };
  });
  await R.step('N-08', 'Utenforstående kan ikke lese notatet', '403', async () => {
    const u = await asUser(P.utenfor);
    const r = await u.get(`families/${companyId}/notes/${noteId}`);
    return { ok: r.status === 403, actual: `HTTP ${r.status}` };
  });

  await R.step('N-09', 'FL-19: Eva endrer teksten og trykker Tilbake uten å lagre', 'Advarsel om ulagrede endringer eller autolagring', async () => {
    await eier.page.getByPlaceholder(BODY).fill(`${secret}\nUlagret tillegg`);
    eier.dialogs.length = 0;
    await tap(eier, eier.page.getByLabel('Alle notater', { exact: true }));
    await sleep(2000);
    const warned = eier.dialogs.length > 0 || await seen(eier, 'Ulagrede', 1000) || await seen(eier, 'ikke lagret', 500);
    const n = await findNote();
    const shot = await eier.shot('n09-tilbake-uten-lagring');
    return { ok: warned || String(n?.body).includes('Ulagret tillegg'), actual: `advarsel=${warned} lagret tekst=«${String(n?.body).replace(/\n/g, ' ')}»`, shot };
  }, { bot: eier });

  await R.step('N-10', 'FL-19: «Lagre» uten nett', 'Melding om feil eller at den lagres senere innen 10 s (ikke evig «Lagrer…»)', async () => {
    if (!(await seen(eier, title, 2000))) { await go(eier, 'notes'); await toList(eier); }
    await tap(eier, title, { exact: false });
    await sleep(1500);
    await eier.ctx.setOffline(true);
    await eier.page.getByPlaceholder(BODY).fill(`${secret}\nOffline-endring`);
    await tap(eier, 'Lagre', { last: true });
    await sleep(10000);
    const hanging = await seen(eier, 'Lagrer…', 1000);
    const feedback = await seen(eier, 'Klarte ikke', 500) || await seen(eier, 'Notatet er lagret', 500) || await seen(eier, 'Ingen nettforbindelse', 500) || await seen(eier, 'lagres når', 500) || await seen(eier, 'Venter på nett', 500);
    const shot = await eier.shot('n10-lagrer-uten-nett');
    await eier.ctx.setOffline(false);
    await sleep(6000);
    await okDialog(eier);
    return { ok: !hanging && feedback, actual: `«Lagrer…» etter 10 s=${hanging}, tilbakemelding=${feedback}`, shot };
  }, { bot: eier });

  try {
    await revive(eier);
    await go(eier, 'notes');
    await toList(eier);
    const t = await eier.visibleText();
    const hasSearch = (await visibleIdx(eier.page.getByPlaceholder(/Søk i notater|Søk notat/i))).length > 0;
    const menu = eier.page.getByPlaceholder('Søk…').first();
    await menu.fill(title).catch(() => {});
    await sleep(1500);
    const hit = !(await seen(eier, 'Ingen treff', 1000));
    const shot = await eier.shot('n-ux2-sok');
    await menu.fill('').catch(() => {});
    R.ux('N-UX2', 'Søk etter notat', 'Søkefelt på Notat-siden eller treff i menysøket', hasSearch || hit, `søkefelt på siden=${hasSearch}, menysøk «${title}» → ${hit ? 'treff' : 'Ingen treff'}${t.includes('Søk') ? '' : ''}`, shot);
  } catch (err) {
    R.info(`N-UX2 hoppet over: ${String(err?.message || err).slice(0, 120)}`);
  }

  await R.step('N-11', 'Eva deler notatet med Kim → Kim ser det i sanntid (Notater og Hjem)', 'Notatet dukker opp hos Kim uten omlasting', async () => {
    await toList(eier);
    await tap(eier, title, { exact: false });
    await sleep(1500);
    await openSettings(eier);
    const shotS = await eier.shot('n11-innstillinger');
    await tap(eier, 'Kim Kollega', { last: true });
    await tap(eier, 'Lagre endringer', { last: true });
    const saved = await seen(eier, 'Innstillingene for notatet er lagret', 8000);
    await okDialog(eier);
    const inList = await seen(kollega, title, 20000);
    const shot = await kollega.shot('n11-delt-hos-kim');
    await dismissPopup(kollega);
    await go(kollega, 'home', null, 3000);
    const home = await seen(kollega, title, 10000);
    await kollega.shot('n11-hjem-kim');
    return { ok: saved && inList && home, actual: `lagret=${saved} i Notater=${inList} på Hjem=${home}`, shot: shot || shotS };
  }, { bot: kollega });

  await R.step('N-12', 'FL-19: samtidig redigering – Evas åpne editor får Kims endring', 'Evas editor viser Kims tekst, eller Eva varsles før overskriving', async () => {
    // Eva tilbake til editoren
    if ((await visibleIdx(eier.page.getByLabel('Tilbake til notat', { exact: true }))).length) {
      await tap(eier, eier.page.getByLabel('Tilbake til notat', { exact: true }));
      await sleep(1000);
    }
    if (!(await visibleIdx(eier.page.getByPlaceholder(BODY))).length) {
      await go(eier, 'notes');
      await toList(eier);
      await tap(eier, title, { exact: false });
    }
    await sleep(1500);
    await go(kollega, 'notes');
    await toList(kollega);
    await tap(kollega, title, { exact: false });
    await sleep(2000);
    const kimText = 'Kim: stillas er bestilt til mandag.';
    await kollega.page.getByPlaceholder(BODY).fill(kimText);
    await tap(kollega, 'Lagre', { last: true });
    const kimSaved = await seen(kollega, kollega.page.getByText(/Notatet er lagret|^Lagret$/), 8000);
    await okDialog(kollega);
    await sleep(3000);
    const evaSees = (await eier.page.getByPlaceholder(BODY).inputValue().catch(() => '')).includes('stillas');
    eier.dialogs.length = 0;
    await tap(eier, 'Lagre', { last: true });
    await sleep(2500);
    const warned = eier.dialogs.length > 0 || await seen(eier, 'endret av', 500);
    await okDialog(eier);
    const after = (await findNote())?.body || '';
    const shot = await eier.shot('n12-overskrevet');
    return { ok: evaSees || warned || after.includes('stillas'), actual: `Kim lagret=${kimSaved}; Evas editor viser Kims tekst=${evaSees}; etter Evas «Lagre»: «${after.replace(/\n/g, ' ').slice(0, 80)}»`, shot };
  }, { bot: eier });

  await R.step('N-13', 'Kim (ikke eier) kan ikke endre deling eller slette', 'Ingen innstillinger/slett for Kim, eller «Kun eier eller admin…»', async () => {
    await openSettings(kollega);
    const opened = await seen(kollega, 'Deling', 2500);
    const msg = await seen(kollega, 'Kun eier eller admin', 1500);
    const del = (await visibleIdx(kollega.page.getByText('Slett permanent', { exact: true }))).length;
    const shot = await kollega.shot('n13-kim-innstillinger');
    if ((await visibleIdx(kollega.page.getByLabel('Tilbake til notat', { exact: true }))).length) await tap(kollega, kollega.page.getByLabel('Tilbake til notat', { exact: true }));
    return { ok: (!opened || msg) && del === 0, actual: `innstillinger tilgjengelig=${opened} melding=${msg} slett-knapp=${del} (Kim kan likevel endre teksten og lagre, se N-12)`, shot };
  }, { bot: kollega });

  await R.step('N-14', 'Eva sletter notatet («Slett permanent») → borte hos begge i sanntid', 'Bekreftelse, notatet forsvinner hos Eva og Kim', async () => {
    await go(kollega, 'notes');
    await toList(kollega);
    const kimHad = await seen(kollega, title, 5000);
    if (!(await visibleIdx(eier.page.getByPlaceholder(BODY))).length) { await go(eier, 'notes'); await toList(eier); await tap(eier, title, { exact: false }); await sleep(1500); }
    await openSettings(eier);
    await tap(eier, 'Slett permanent');
    await sleep(800);
    const asked = await seen(eier, 'Notatet slettes permanent', 3000);
    const shotC = await eier.shot('n14-bekreft-slett');
    await tap(eier, 'Slett', { last: true });
    await sleep(2000);
    const e = await gone(eier, title, 10000);
    const k = await gone(kollega, title, 20000);
    const shot = await kollega.shot('n14-slettet-hos-kim');
    return { ok: asked && kimHad && e && k, actual: `bekreftelse=${asked} (Kim hadde den i listen=${kimHad}) borte hos Eva=${e} hos Kim=${k}`, shot: shot || shotC };
  }, { bot: eier });

  await R.step('N-15', '«Slett permanent» fjerner innholdet (ikke lesbart for kolleger etterpå)', 'REST GET som Kim gir 404/403', async () => {
    const r = await kim.get(`families/${companyId}/notes/${noteId}`);
    const f = r.body?.fields || {};
    return { ok: r.status === 404 || r.status === 403, actual: `HTTP ${r.status}${f.body ? `, tekst fortsatt lagret: «${f.body.stringValue.slice(0, 60)}», permanentlyDeleted=${f.permanentlyDeleted?.booleanValue}` : ''}` };
  });

  await R.step('N-16', 'FL-22: /note/new på mobil', 'Åpner Notater med nytt notat (ikke barnas dagsnotat)', async () => {
    await kollega.page.goto(`${BASE}/note/new`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await kollega.page.waitForFunction(() => !!window.__protopBot, null, { timeout: 180000 }).catch(() => {});
    await sleep(5000);
    await clearOverlays(kollega);
    const t = await kollega.visibleText();
    const childNote = /svømmetrening|Legg til notat/.test(t);
    const ta = kollega.page.locator('textarea').first();
    if (await ta.count()) await ta.fill('Test fra /note/new');
    kollega.dialogs.length = 0;
    await tap(kollega, 'Lagre notat', { timeout: 3000 }).catch(() => {});
    await sleep(2500);
    const after = await kollega.visibleText();
    const feedback = kollega.dialogs.join(' ') || (after.includes('Mangler') ? 'Mangler nøkkeldata' : '');
    const shot = await kollega.shot('n16-note-new');
    return { ok: !childNote, actual: `barnas dagsnotat=${childNote} («${snippet(t, 'Legg til notat', 40)}»), etter «Lagre notat»: ${feedback || 'ingen tilbakemelding'}`, shot };
  }, { bot: kollega });
} catch (err) {
  R.add('N-XX', 'Uventet stopp i skriptet', 'Ingen unntak', false, String(err?.stack || err).slice(0, 400));
} finally {
  await closeBrowser();
}
const bad = R.finish({ world: { tag: world.tag, companyId } });
process.exit(bad ? 1 : 0);
