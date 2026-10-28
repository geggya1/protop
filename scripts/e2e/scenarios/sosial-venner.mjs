/**
 * Sosial-bot (team B): Venner og venne-chat med tre brukere mot hverandre.
 * Maskinen har lite minne, så maks to nettleserkontekster er åpne samtidig:
 *   fase A: Eva (PC) + Ulf (PC) · fase B: Kim (mobil) + Ulf (PC) · fase C: Eva (PC) + ny bruker (mobil)
 *
 *   eier    = Eva Eier (PC)       – Sosial Bygg AS
 *   kollega = Kim Kollega (mobil) – Sosial Bygg AS
 *   utenfor = Ulf Utenfor (PC)    – Annen Bygg AS (ikke i selskapet)
 *
 * Dekker: legg til via e-post/brukernavn/QR-lenke, godta, avslå, trekk tilbake,
 * send på nytt, fjern venn, sanntid begge veier, ny e-post → invitasjon i fangeren
 * → registrering via lenken, venne-chat og ulest-teller, FL-12 og FL-25.
 *
 *   cd /home/user/protop && NODE_PATH=$(npm root -g) node scripts/e2e/scenarios/sosial-venner.mjs
 *
 * Skriver OK/AVVIK per steg og avslutter med kode 1 ved avvik.
 */
import { Bot, BASE, closeBrowser } from '../lib/bot.mjs';
import {
  listDocs, mailsTo, linksIn, callFn,
} from '../lib/emu.mjs';
import {
  setupWorld, startBots, Report, asUser, tap, seen, gone, go, clearOverlays, closeDock,
  dismissPopup, visibleIdx, snippet, sleep, notifs, OUT,
} from './sosial-lib.mjs';

const R = new Report('sosial-venner');
const world = await setupWorld();
const { people: P } = world;
R.info(`Verden: ${world.companyName} (${world.companyId}), utenfor: ${world.otherCompanyId}`);

const allBots = [];
let { eier, utenfor } = await startBots(world, [['eier', 'desktop'], ['utenfor', 'desktop']], Bot);
let kollega = null;
allBots.push(eier, utenfor);
R.bots = [eier, utenfor];
const ID_FIELD = '@brukernavn, e-post eller +47…';
const chatIdOf = (a, b) => `dm_${[a, b].sort().join('_')}`;

async function threadOpen(bot) {
  return (await visibleIdx(bot.page.getByPlaceholder('Skriv en melding…'))).length > 0;
}

/** Åpner venne-tråden fra Venner-siden hvis den ikke alt er åpen. */
async function openFriendThread(bot, name) {
  if (await threadOpen(bot)) return;
  await go(bot, 'more', 'friends');
  await tap(bot, name, { timeout: 15000 });
  await sleep(2500);
}

async function sendRequest(bot, value) {
  await tap(bot, 'Legg til venn');
  await bot.fill(ID_FIELD, value);
  await tap(bot, bot.page.getByText('Send venneforespørsel', { exact: true }), { last: true });
  const ok = await seen(bot, 'Invitasjon sendt', 30000);
  const text = await bot.visibleText();
  return { ok, text: snippet(text, 'Invitasjon sendt', 260) };
}

try {
  await Promise.all([go(eier, 'more', 'friends'), go(utenfor, 'more', 'friends')]);

  // ── UX: familie-rester på Venner-siden ──
  {
    const t = await eier.visibleText();
    const shot = await eier.shot('venner-start');
    R.ux('V-UX1', 'Venner-siden i bedrift bruker ikke familie-ord', 'Ingen «Familien din»/«familieplattformen»',
      !/Familien din|familieplattformen/.test(t), snippet(t, 'Familien din', 120), shot);
  }

  // ── V-01..05: e-post til eksisterende bruker, avslå ──
  const mails0 = mailsTo(P.utenfor.email).length;
  await R.step('V-01', 'Eva legger til Ulf med e-post (eksisterende bruker)', '«Invitasjon sendt» og «E-post sendt.»', async () => {
    const t0 = Date.now();
    const r = await sendRequest(eier, P.utenfor.email);
    const shot = await eier.shot('v01-invitasjon-sendt');
    return { ok: r.ok && r.text.includes('E-post sendt'), actual: `${r.text} (${((Date.now() - t0) / 1000).toFixed(1)} s)`, shot };
  }, { bot: eier });
  await tap(eier, 'OK').catch(() => {});

  await R.step('V-02', 'Invitasjons-e-post til Ulf er fanget med lenke', 'E-post med /friend-invite/<id>', async () => {
    await sleep(1500);
    const m = mailsTo(P.utenfor.email).slice(mails0);
    const links = m.flatMap(linksIn);
    return { ok: m.length >= 1 && links.some((l) => /friend-invite\//.test(l)), actual: `${m.length} e-post: «${m[0]?.subject || ''}» ${links.join(' ')}` };
  });

  await R.step('V-03', 'Ulf ser forespørselen i sanntid uten omlasting', 'Popup «Vil du godta invitasjonen?» og «Forespørsler (1)»', async () => {
    const popup = await seen(utenfor, 'Vil du godta invitasjonen?', 20000);
    const list = await seen(utenfor, 'Forespørsler (1)', 5000);
    const shot = await utenfor.shot('v03-forespørsel-mottatt');
    return { ok: popup && list, actual: `popup=${popup} liste=${list}`, shot };
  }, { bot: utenfor });

  await R.step('V-04', 'Ulf avslår → Eva ser «Avslått» i sanntid', 'Status «Avslått» hos Eva innen 20 s', async () => {
    await tap(utenfor, 'Avslå', { last: true });
    const t0 = Date.now();
    const ok = await seen(eier, 'Avslått', 20000);
    const shot = await eier.shot('v04-avslatt');
    const ulfClean = await gone(utenfor, 'Vil gjerne bli venn med deg', 8000);
    return { ok: ok && ulfClean, actual: `Eva ser Avslått=${ok} etter ${((Date.now() - t0) / 1000).toFixed(1)} s, Ulf sin liste ryddet=${ulfClean}`, shot };
  }, { bot: eier });

  await R.step('V-05', 'Eva fjerner den avslåtte raden', 'Bekreftelse spørres, raden forsvinner', async () => {
    eier.dialogs.length = 0;
    await tap(eier, eier.page.getByLabel('Fjern', { exact: true }));
    await sleep(1200);
    const ok = await gone(eier, 'Avslått', 8000);
    return { ok: ok && eier.dialogs.length === 1, actual: `dialog=${JSON.stringify(eier.dialogs)} borte=${ok}` };
  }, { bot: eier });

  // ── V-06..09: brukernavn, send på nytt, trekk tilbake ──
  let withdrawnReqId = null;
  await R.step('V-06', 'Eva sender ny forespørsel med @brukernavn', 'Ulf får forespørselen i sanntid', async () => {
    const r = await sendRequest(eier, `@${P.utenfor.username}`);
    await tap(eier, 'OK').catch(() => {});
    const got = await seen(utenfor, 'Vil du godta invitasjonen?', 20000);
    const shot = await utenfor.shot('v06-ny-forespørsel');
    const reqs = await listDocs(`users/${P.utenfor.uid}/friendRequests`);
    withdrawnReqId = reqs.find((q) => q.status === 'pending')?.id || null;
    return { ok: r.ok && got, actual: `sendt=${r.ok} mottatt=${got}`, shot };
  }, { bot: eier });

  // L-33: «Send på nytt» fornyer varselet i appen, men sender høyst én e-post i uken til en med konto.
  await R.step('V-07', '«Send på nytt» gir kvittering, og ingen ny e-post innen en uke (L-33)', 'Toast «Forespørsel sendt på nytt» / «Varselet i appen er fornyet …»; e-post bare hvis kvitteringen sier det', async () => {
    const before = mailsTo(P.utenfor.email).length;
    await tap(eier, 'Send på nytt');
    const toast = await seen(eier, eier.page.getByText(/Forespørsel sendt på nytt|Varselet i appen er fornyet/), 15000);
    const limited = await seen(eier, 'høyst én gang i uken', 1000);
    const shot = await eier.shot('v07-sendt-pa-nytt');
    await sleep(1500);
    const n = mailsTo(P.utenfor.email).length - before;
    return { ok: toast && (limited ? n === 0 : n === 1), actual: `toast=${toast} begrenset=${limited} nye e-poster=${n}`, shot };
  }, { bot: eier });

  await R.step('V-07b', 'Ulf åpner lenken i e-posten (/friend-invite/<id>)', 'Siden viser forespørselen fra Eva med Godta/Avslå', async () => {
    const m = mailsTo(P.utenfor.email).slice(-1)[0];
    let link = linksIn(m).find((l) => /friend-invite\//.test(l));
    // L-33: den nye forespørselen fikk ingen ny e-post. Lenken i den første e-posten gjelder en avslått
    // forespørsel; samme side åpnes da for den ventende forespørselen (samme lenkeformat som i e-posten).
    if (withdrawnReqId && (!link || !link.includes(withdrawnReqId))) link = `${BASE}/friend-invite/${withdrawnReqId}`;
    if (!link) return { ok: false, actual: 'ingen lenke i siste e-post' };
    const u = new URL(link);
    await utenfor.page.goto(`${BASE}${u.pathname}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await utenfor.waitShell();
    await clearOverlays(utenfor);
    const who = await seen(utenfor, 'Eva Eier', 15000);
    const btn = await seen(utenfor, 'Godta', 5000);
    const shot = await utenfor.shot('v07b-epostlenke');
    const t = await utenfor.visibleText();
    const back = (await visibleIdx(utenfor.page.getByText(/Tilbake|Lukk|Gå til venner/))).length > 0;
    R.ux('V-UX6', 'E-postlenken (/friend-invite) har vei tilbake til appen', 'Tilbake-/lukk-knapp på siden', back, 'Fullskjerm med bare Godta/Avslå, ingen tilbake-knapp eller meny', shot);
    // Siden ligger utenfor skallet (openShell flytter ikke derfra): last appen på nytt.
    await utenfor.goto('/');
    await utenfor.waitShell();
    await clearOverlays(utenfor);
    await go(utenfor, 'more', 'friends');
    return { ok: who && btn && !/Fant ikke/.test(t), actual: `${u.pathname}: Eva vist=${who} Godta-knapp=${btn}${/Fant ikke/.test(t) ? ' («Fant ikke …»)' : ''}`, shot };
  }, { bot: utenfor });

  await R.step('V-08', '«Trekk tilbake» → Ulf mister forespørselen i sanntid', 'Bekreftelse, status «Trukket tilbake», borte hos Ulf', async () => {
    eier.dialogs.length = 0;
    await tap(eier, 'Trekk tilbake');
    const st = await seen(eier, 'Trukket tilbake', 15000);
    const t0 = Date.now();
    const goneModal = await gone(utenfor, 'Vil du godta invitasjonen?', 20000);
    const goneList = await gone(utenfor, 'Vil gjerne bli venn med deg', 20000);
    const shot = await utenfor.shot('v08-trukket-tilbake');
    return { ok: st && goneModal && goneList && eier.dialogs.length === 1, actual: `dialog=${eier.dialogs.length} status=${st} borte hos Ulf=${goneModal && goneList} (${((Date.now() - t0) / 1000).toFixed(1)} s)`, shot };
  }, { bot: eier });

  await R.step('V-09', 'Varselet om en tilbaketrukket forespørsel blir ikke stående som ulest', 'Ingen ulest «Venneforespørsel» for trukket forespørsel', async () => {
    await sleep(1500);
    const list = await notifs(listDocs, P.utenfor.uid);
    const stale = list.filter((n) => n.eventType === 'friendInvite' && withdrawnReqId && n.id.includes(withdrawnReqId) && n.read !== true);
    await tap(utenfor, utenfor.page.getByLabel('Varslinger', { exact: true }).first()).catch(() => {});
    await sleep(1500);
    const shot = await utenfor.shot('v09-varsler-etter-tilbaketrekking');
    const visible = await seen(utenfor, 'Eva Eier vil gjerne bli venn med deg', 3000);
    return { ok: stale.length === 0 && !visible, actual: `varsel for trukket forespørsel finnes fortsatt (read≠true)=${stale.length}, vises i Varslinger=${visible}`, shot };
  }, { bot: utenfor });
  if (await seen(utenfor, 'Eva Eier vil gjerne bli venn med deg', 1000)) {
    await tap(utenfor, 'Eva Eier vil gjerne bli venn med deg', { exact: false });
    await sleep(2500);
    const where = await utenfor.visibleText();
    const shot = await utenfor.shot('v09b-klikk-varsel');
    R.ux('V-UX2', 'Trykk på varsel om (trukket) venneforespørsel', 'Åpner Venner med forklaring', /Venner/.test(snippet(where, 'Bedrift ·', 80)) || where.includes('Mine venner'), `Havnet på: ${snippet(where, 'Hei,', 40) || snippet(where, 'Bedrift ·', 60)}`, shot);
  }

  // ── V-10..12: QR / lenke, godta ──
  await go(utenfor, 'more', 'friends');
  await R.step('V-10', 'Ulf viser «Min QR»', 'QR-bilde og @brukernavn vises', async () => {
    await tap(utenfor, 'Min QR');
    await sleep(1200);
    const ok = await seen(utenfor, `@${P.utenfor.username}`, 5000);
    const img = await utenfor.page.evaluate(() => [...document.querySelectorAll('img,svg,canvas')].some((e) => e.getBoundingClientRect().width >= 140));
    const shot = await utenfor.shot('v10-min-qr');
    await closeDock(utenfor);
    return { ok: ok && img, actual: `brukernavn=${ok} qr=${img}`, shot };
  }, { bot: utenfor });

  // ── Fase B: Eva ut, Kim (mobil) inn ──
  await eier.stop();
  ({ kollega } = await startBots(world, [['kollega', 'phone']], Bot));
  allBots.push(kollega);
  R.bots = [kollega, utenfor];

  await R.step('V-11', 'Kim (mobil) åpner QR-lenken /add-friend/<brukernavn>', '«Legg til venn» åpnes med @brukernavn utfylt', async () => {
    await kollega.page.goto(`${BASE}/add-friend/${P.utenfor.username}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await kollega.waitShell();
    let open = false;
    for (let i = 0; i < 3 && !open; i += 1) {
      await sleep(2000);
      await clearOverlays(kollega);
      open = await seen(kollega, 'QR-koden pekte på', 8000);
    }
    const val = await kollega.page.getByPlaceholder(ID_FIELD).inputValue().catch(() => '');
    const shot = await kollega.shot('v11-qr-lenke');
    const t = await kollega.visibleText();
    R.ux('V-UX3', 'QR-teksten matcher knappen', 'Teksten nevner samme knapp som vises', !t.includes('trykk Inviter'), 'Teksten sier «trykk Inviter», knappen heter «Send venneforespørsel»', shot);
    return { ok: open && val === `@${P.utenfor.username}`, actual: `åpnet=${open} felt=«${val}»`, shot };
  }, { bot: kollega });

  await R.step('V-12', 'Kim sender, Ulf godtar → begge ser hverandre i sanntid', 'Begge viser «Mine venner (1)» uten omlasting', async () => {
    await tap(kollega, kollega.page.getByText('Send venneforespørsel', { exact: true }), { last: true });
    const sent = await seen(kollega, 'Invitasjon sendt', 30000);
    await tap(kollega, 'OK').catch(() => {});
    await go(kollega, 'more', 'friends');
    await seen(utenfor, 'Vil du godta invitasjonen?', 20000);
    await tap(utenfor, 'Godta invitasjon');
    const t0 = Date.now();
    const u = await seen(utenfor, 'Mine venner (1)', 15000);
    const k = await seen(kollega, 'Mine venner (1)', 20000);
    const shot = await kollega.shot('v12-venner');
    await utenfor.shot('v12-venner-ulf');
    return { ok: sent && u && k, actual: `sendt=${sent} Ulf=${u} Kim=${k} (${((Date.now() - t0) / 1000).toFixed(1)} s)`, shot };
  }, { bot: kollega });

  // ── V-13..17: venne-chat ──
  const fChat = chatIdOf(P.kollega.uid, P.utenfor.uid);
  const msg1 = `Hei Ulf fra Kim ${Date.now().toString().slice(-5)}`;
  await R.step('V-13', 'Kim åpner venne-chat på mobil: Send-knappen er på skjermen', 'Send-knappen ligger innenfor 390 px', async () => {
    await openFriendThread(kollega, 'Ulf Utenfor');
    const box = await kollega.page.evaluate(() => {
      const el = [...document.querySelectorAll('[aria-label="Send"]')].find((e) => e.getBoundingClientRect().width > 0);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), vw: window.innerWidth };
    });
    const shot = await kollega.shot('v13-chat-mobil');
    return { ok: !!box && box.right <= box.vw, actual: box ? `Send-knapp x=${box.left}–${box.right}, skjermbredde ${box.vw}` : 'fant ingen Send-knapp', shot };
  }, { bot: kollega });

  await R.step('V-14', 'Kim sender melding (Enter) → Ulf varsles i sanntid', 'Popup hos Ulf med meldingen', async () => {
    await openFriendThread(kollega, 'Ulf Utenfor');
    await kollega.fill('Skriv en melding…', msg1);
    await kollega.page.keyboard.press('Enter');
    const mine = await seen(kollega, msg1, 10000);
    const got = await seen(utenfor, msg1, 20000);
    const shot = await utenfor.shot('v14-melding-mottatt');
    return { ok: mine && got, actual: `Kim ser egen=${mine} Ulf varslet=${got}`, shot };
  }, { bot: utenfor });

  await R.step('V-15', 'Én melding gir ett varsel og ulest-teller 1 hos Ulf', '1 varsel i innboksen og «1» ved Kim i chatlisten', async () => {
    await sleep(3500);
    await dismissPopup(utenfor);
    await closeDock(utenfor);
    const n = (await notifs(listDocs, P.utenfor.uid)).filter((x) => x.eventType === 'messageReceived' && x.body === msg1);
    await tap(utenfor, utenfor.page.getByLabel('Ny chat', { exact: true }).last());
    await sleep(1500);
    const t = await utenfor.visibleText();
    const after = t.slice(t.lastIndexOf(`@${P.kollega.username}`)).split('\n').map((s) => s.trim()).filter(Boolean);
    const badge = /^\d+$/.test(after[1] || '') ? after[1] : '0';
    const shot = await utenfor.shot('v15-ulest-teller');
    return { ok: n.length === 1 && badge === '1', actual: `varsler=${n.length} (${n.map((x) => x.id.split('_').slice(0, 2).join('_')).join(', ')}), teller=${badge}`, shot };
  }, { bot: utenfor });

  const reply = `Svar fra Ulf ${Date.now().toString().slice(-5)}`;
  await R.step('V-16', 'Ulf svarer → Kim ser svaret i åpen tråd i sanntid', 'Svaret vises hos Kim innen 20 s', async () => {
    if (!(await threadOpen(utenfor))) {
      await tap(utenfor, 'Kim Kollega', { last: true });
      await sleep(2000);
    }
    await openFriendThread(kollega, 'Ulf Utenfor');
    const old = await seen(utenfor, msg1, 8000);
    await utenfor.fill('Skriv en melding…', reply);
    await tap(utenfor, utenfor.page.getByLabel('Send', { exact: true }).last());
    const got = await seen(kollega, reply, 20000);
    const shot = await kollega.shot('v16-svar-mottatt');
    return { ok: old && got, actual: `Ulf ser historikk=${old} Kim fikk svar=${got}`, shot };
  }, { bot: kollega });

  await R.step('V-16b', 'FL-14: venne-melding uten nett på mobil gir synlig feilmelding', '«Kunne ikke sende» eller ventende-merking vises', async () => {
    await openFriendThread(kollega, 'Ulf Utenfor');
    const offMsg = `Offline-test ${Date.now().toString().slice(-4)}`;
    await kollega.ctx.setOffline(true);
    kollega.dialogs.length = 0;
    await kollega.fill('Skriv en melding…', offMsg);
    await kollega.page.keyboard.press('Enter');
    await sleep(8000);
    const t = await kollega.visibleText();
    const shown = /Kunne ikke sende|ikke sendt|uten nett|frakoblet/i.test(t) || kollega.dialogs.length > 0;
    const back = await kollega.page.getByPlaceholder('Skriv en melding…').last().inputValue().catch(() => '');
    const shot = await kollega.shot('v16b-uten-nett');
    await kollega.ctx.setOffline(false);
    await kollega.page.getByPlaceholder('Skriv en melding…').last().fill('').catch(() => {});
    await sleep(2000);
    const pendingInThread = back === '' && t.includes(offMsg);
    return { ok: shown || pendingInThread, actual: `feilmelding=${shown}, vist som ventende i tråden=${pendingInThread}, tekst i feltet=«${back}»`, shot };
  }, { bot: kollega });

  await R.step('V-17', 'Ulf fjerner Kim som venn → Kims liste oppdateres i sanntid', 'Bekreftelse, «Mine venner (0)» hos begge', async () => {
    await closeDock(utenfor);
    utenfor.dialogs.length = 0;
    await tap(utenfor, utenfor.page.getByLabel('Fjern venn', { exact: true }).first());
    await sleep(1500);
    const u = await seen(utenfor, 'Mine venner (0)', 10000);
    const k = await seen(kollega, 'Mine venner (0)', 20000);
    const shot = await utenfor.shot('v17-venn-fjernet');
    R.ux('V-UX4', 'Bekreftelsen for «Fjern venn» bruker bedriftsord', 'Ingen «Familien påvirkes ikke»', !utenfor.dialogs.join(' ').includes('Familien'), utenfor.dialogs.join(' | '), shot);
    return { ok: u && k && utenfor.dialogs.length === 1, actual: `dialog=${utenfor.dialogs.length} Ulf(0)=${u} Kim(0)=${k}`, shot };
  }, { bot: utenfor });

  // ── V-18..20: FL-12 ──
  const msgAfter = `Etter fjerning ${Date.now().toString().slice(-5)}`;
  await R.step('V-18', 'FL-12 (UI): Kim sender i den gamle tråden etter fjerning', 'Sendingen avvises med melding; ingenting lagres, Ulf varsles ikke', async () => {
    const before = (await listDocs(`friendChats/${fChat}/messages`)).length;
    const nBefore = (await notifs(listDocs, P.utenfor.uid)).length;
    const threadOpen = await seen(kollega, reply, 3000);
    await kollega.fill('Skriv en melding…', msgAfter);
    await kollega.page.keyboard.press('Enter');
    await sleep(4000);
    const stored = (await listDocs(`friendChats/${fChat}/messages`)).filter((m) => m.text === msgAfter).length;
    const nNew = (await notifs(listDocs, P.utenfor.uid)).length - nBefore;
    const popup = await seen(utenfor, msgAfter, 6000);
    const shot = await utenfor.shot('v18-fl12-melding-fra-fjernet');
    await kollega.shot('v18-fl12-kim-sendte');
    return { ok: stored === 0 && !popup, actual: `tråd åpen=${threadOpen} lagret=${stored} (før ${before}) nye varsler hos Ulf=${nNew} popup hos Ulf=${popup}`, shot };
  }, { bot: kollega });

  await R.step('V-19', 'FL-12 (regler): Kim skriver direkte i venne-chatten via REST', 'Firestore avviser (403)', async () => {
    const k = await asUser(P.kollega);
    const r = await k.create(`friendChats/${fChat}/messages`, { text: 'REST etter fjerning', type: 'text', senderId: P.kollega.uid, senderName: 'Kim', createdAtMs: Date.now() });
    return { ok: r.status === 403, actual: `HTTP ${r.status}` };
  });

  await R.step('V-20', 'Fremmed (Kari, aldri venn med Ulf) slår opp Ulf på e-post og skriver til ham via REST', 'Firestore avviser; Ulf får ikke varsel', async () => {
    const kari = await asUser(P.kollega2);
    const look = await callFn('lookupFriendProfile', { identifier: P.utenfor.email }, kari.token);
    const ulfUid = look?.result?.profile?.uid || null;
    if (!ulfUid) return { ok: true, actual: `oppslag ga ingen uid (${JSON.stringify(look).slice(0, 120)})` };
    const cid = chatIdOf(P.kollega2.uid, ulfUid);
    const c = await kari.patch(`friendChats/${cid}`, { type: 'dm', title: 'Chat', memberIds: [P.kollega2.uid, ulfUid].sort(), lastText: 'Hei fra en fremmed', lastSenderId: P.kollega2.uid });
    const m = await kari.create(`friendChats/${cid}/messages`, { text: 'Hei fra en fremmed', type: 'text', senderId: P.kollega2.uid, senderName: 'Kari', createdAtMs: Date.now() });
    await sleep(5000);
    const n = (await notifs(listDocs, P.utenfor.uid)).filter((x) => x.body === 'Hei fra en fremmed');
    const shot = await utenfor.shot('v20-melding-fra-fremmed');
    return { ok: c.status === 403 && m.status === 403 && n.length === 0, actual: `lookupFriendProfile ga uid=${ulfUid === P.utenfor.uid}; opprett tråd HTTP ${c.status}, melding HTTP ${m.status}; varsler hos Ulf=${n.length} (${n.map((x) => `«${x.title}»`).join(', ')})`, shot };
  }, { bot: utenfor });

  // ── V-21..23: FL-25 feilmeldinger på mobil ──
  await closeDock(kollega);
  await go(kollega, 'more', 'friends');
  await R.step('V-21', 'FL-25: ukjent brukernavn på mobil gir synlig feilmelding', '«Fant ingen bruker …» vises i arket', async () => {
    await tap(kollega, 'Legg til venn');
    await kollega.fill(ID_FIELD, `@finnesikke${Date.now().toString().slice(-6)}`);
    await tap(kollega, kollega.page.getByText('Send venneforespørsel', { exact: true }), { last: true });
    const ok = await seen(kollega, 'Fant ingen bruker', 15000);
    const shot = await kollega.shot('v21-ukjent-bruker');
    return { ok, actual: `feilmelding=${ok}`, shot };
  }, { bot: kollega });

  await R.step('V-22', 'FL-25: egen e-post på mobil gir synlig feilmelding', '«Du kan ikke invitere deg selv.»', async () => {
    await kollega.fill(ID_FIELD, P.kollega.email);
    await tap(kollega, kollega.page.getByText('Send venneforespørsel', { exact: true }), { last: true });
    const ok = await seen(kollega, 'Du kan ikke invitere deg selv', 15000);
    const shot = await kollega.shot('v22-seg-selv');
    return { ok, actual: `feilmelding=${ok}`, shot };
  }, { bot: kollega });
  {
    await kollega.fill(ID_FIELD, 'ola@');
    await sleep(500);
    const t = await kollega.visibleText();
    const shot = await kollega.shot('v-ux5-ugyldig-epost');
    R.ux('V-UX5', 'Ugyldig e-post («ola@») forklares', 'Tekst om ugyldig e-post når knappen er grå', /ugyldig|gyldig e-post/i.test(t), 'Knappen blir bare grå, ingen forklaring', shot);
  }
  await closeDock(kollega);

  await R.step('V-23', 'FL-25: tjenestefeil ved «Godta» (simulert 500) på mobil', 'Forståelig norsk feilmelding, ikke regelfeil fra reserveløsningen', async () => {
    await closeDock(utenfor);
    await go(utenfor, 'more', 'friends');
    await sendRequest(utenfor, P.kollega.email);
    await tap(utenfor, 'OK').catch(() => {});
    await seen(kollega, 'Vil du godta invitasjonen?', 20000);
    await kollega.page.route('**/respondFriendRequestAdmin', (route) => route.fulfill({
      status: 500, contentType: 'application/json', body: JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'Tjenesten er midlertidig nede (test)' } }),
    }));
    kollega.dialogs.length = 0;
    await tap(kollega, 'Godta invitasjon');
    await sleep(5000);
    const t = await kollega.visibleText();
    const raw = (t.match(/(PERMISSION_DENIED[^\n]*|Missing or insufficient permissions[^\n]*)/) || [])[0] || '';
    const shot = await kollega.shot('v23-godta-feiler');
    await kollega.page.unroute('**/respondFriendRequestAdmin');
    const shown = raw || kollega.dialogs.join(' | ') || snippet(t, 'Vil du godta invitasjonen?', 160);
    return { ok: !raw && /(feil|nede|prøv igjen)/i.test(t + kollega.dialogs.join(' ')), actual: `Vist: «${shown}»`, shot };
  }, { bot: kollega });
  await tap(kollega, 'Avslå', { last: true }).catch(() => {});

  // ── Fase C: Kim og Ulf ut, Eva inn (+ ny bruker i V-25) ──
  await kollega.stop();
  await utenfor.stop();
  ({ eier } = await startBots(world, [['eier', 'desktop']], Bot));
  allBots.push(eier);
  R.bots = [eier];

  // ── V-24..26: ny e-post → registrering via lenken ──
  const nyEmail = `sosial-${world.tag}-ny@protop.test`;
  let regLink = null;
  await R.step('V-24', 'Eva inviterer en ny e-post (ikke bruker)', '«Invitasjon sendt» og e-post med registreringslenke i fangeren', async () => {
    await go(eier, 'more', 'friends');
    const r = await sendRequest(eier, nyEmail);
    await tap(eier, 'OK').catch(() => {});
    await sleep(1500);
    const m = mailsTo(nyEmail);
    regLink = m.flatMap(linksIn).find((l) => /register\?friendInvite=/.test(l)) || null;
    const shot = await eier.shot('v24-ny-epost');
    return { ok: r.ok && !!regLink, actual: `${r.text.slice(0, 120)} | e-poster=${m.length} lenke=${regLink}`, shot };
  }, { bot: eier });

  let ny = null;
  await R.step('V-25', 'Lenken i invitasjonen åpner registrering med invitasjonen', 'E-post forhåndsutfylt og boksen «Venneinvitasjon» vises', async () => {
    if (!regLink) return { ok: false, actual: 'mangler lenke' };
    ny = await new Bot('ny', { email: nyEmail, password: P.eier.password, view: 'phone', outDir: OUT }).start();
    const u = new URL(regLink);
    await ny.page.goto(`${BASE}${u.pathname}${u.search}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await ny.page.waitForSelector('input[type=password]', { timeout: 240000 });
    await sleep(2500);
    const emailVal = await ny.page.getByPlaceholder('navn@domene.no').inputValue().catch(() => '');
    const box = await seen(ny, 'Venneinvitasjon', 2000);
    const url = ny.page.url().replace(BASE, '');
    const shot = await ny.shot('v25-registreringslenke');
    return { ok: emailVal === nyEmail && box, actual: `adresse nå: ${url}, e-postfelt=«${emailVal}», invitasjonsboks=${box}`, shot };
  }, { bot: eier });

  await R.step('V-26', 'Den nye personen registrerer seg → Eva ser ny venn i sanntid', '«Nina Ny» under Mine venner hos Eva uten omlasting', async () => {
    if (!ny) return { ok: false, actual: 'ingen registreringsfane' };
    try {
      await ny.fill('Ditt navn', 'Nina Ny');
      const emailVal = await ny.page.getByPlaceholder('navn@domene.no').inputValue().catch(() => '');
      if (!emailVal) await ny.fill('navn@domene.no', nyEmail);
      await ny.fill('Minst 8 tegn', 'Sosial-Ny-2026!');
      const consent = ny.page.getByText('Jeg har lest og forstått', { exact: false });
      if (await consent.count()) await consent.first().click().catch(() => {});
      await tap(ny, 'Registrer', { last: true });
      const registered = await seen(ny, 'Bekreft e-posten din', 60000);
      const ok = await seen(eier, 'Nina Ny', 30000);
      const shot = await eier.shot('v26-ny-venn-hos-eva');
      await ny.shot('v26-etter-registrering');
      const pend = (await listDocs('pendingFriendInvites')).filter((x) => x.fromUid === P.eier.uid && x.toEmail === nyEmail);
      return { ok: registered && ok, actual: `konto opprettet=${registered}, Nina hos Eva=${ok}, invitasjon status=${pend.map((x) => x.status).join(',')}`, shot };
    } finally {
      await ny.stop();
    }
  }, { bot: eier });
} catch (err) {
  R.add('V-XX', 'Uventet stopp i skriptet', 'Ingen unntak', false, String(err?.stack || err).slice(0, 400));
} finally {
  for (const b of allBots) {
    if (b.errors.length) R.info(`${b.name}: ${b.errors.length} JS-/konsollfeil, første: ${b.errors.find((e) => !/CORS|listCalendarConnections|fetchExternalCalendarEvents/.test(e.message))?.message || '(bare kalender-CORS i emulator)'}`);
  }
  await closeBrowser();
}
const bad = R.finish({ world: { tag: world.tag, companyId: world.companyId } });
process.exit(bad ? 1 : 0);
