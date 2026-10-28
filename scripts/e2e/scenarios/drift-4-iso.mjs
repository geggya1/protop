/**
 * Drift-bot 4 – ISO / K-HMS.
 *   B = ansatt på telefon melder RUH (teller trykk, ISO-03), I = innleid (ISO-04),
 *   E = eier/systemansvarlig (saksbehandling, dokument, revisjon, LGJ),
 *   P = prosjektleder med ISO-rolle (tiltaksansvarlig, utpekt godkjenner, vedtakseier).
 *
 * Høyst to nettleserkontekster er åpne samtidig.
 *
 *   NODE_PATH=$(npm root -g) node scripts/e2e/scenarios/drift-4-iso.mjs
 */
import { join } from 'node:path';
import { Bot, closeBrowser } from '../lib/bot.mjs';
import { getDoc, listDocs } from '../lib/emu.mjs';
import {
  Report, seedCompany, stamp, dump, go, guard, newBot, fillAfterLabel, rest, patchAs, token, fieldsOf, clickLast, OUT,
} from './drift-lib.mjs';

const R = new Report('drift-4-iso');
const SHOTS = join(OUT, '4-iso');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = await seedCompany(`i${stamp()}`);
const C = S.companyId;
console.log(`Selskap ${C}`);
const findings = () => listDocs(`families/${C}/isoFindings`);
const records = () => listDocs(`families/${C}/isoRecords`);
const documents = () => listDocs(`families/${C}/isoDocuments`);
const TITLE = 'Løs planke på stillas';

let B; let E; let P;
async function pickPerson(bot, name, which = 'first') {
  const loc = bot.page.getByRole('button', { name: /Velg ansatt/ });
  await (which === 'last' ? loc.last() : (typeof which === 'number' ? loc.nth(which) : loc.first())).click();
  await bot.page.waitForTimeout(700);
  await bot.click(name);
  await bot.page.waitForTimeout(400);
}
async function openCase(bot) {
  await go(bot, 'iso', 'avvik', 5000);
  await bot.page.getByText(TITLE, { exact: false }).first().waitFor({ state: 'visible', timeout: 90000 });
  await bot.click(TITLE, { exact: false });
  await bot.page.waitForTimeout(2500);
}

try {
  /* ───── Oppsett: eier aktiverer ledelsessystemet ───── */
  E = await newBot(Bot, 'E-eier', S.users.eier, { outDir: SHOTS });
  await guard(R, '4.00', 'Aktiver ISO', async () => {
    await go(E, 'iso', 'oversikt', 6000);
    // ISO laster tilgangsspeilet og alle samlinger før siden vises; på en tungt lastet maskin tar det tid.
    if (!(await E.hasText('Sett opp ledelsessystemet', { timeout: 90000 }))) {
      await E.shot('iso-oversikt-uten-oppsett');
      await go(E, 'iso', 'oversikt', 6000);
    }
    await E.click('Sett opp ledelsessystemet', { timeout: 90000 });
    await E.page.waitForTimeout(3000);
    await E.click('Aktiver ledelsessystemet', { timeout: 60000 });
    await sleep(15000);
    const sys = await getDoc(`families/${C}/isoSystem/main`);
    R.check('4.00', 'Eier setter opp og aktiverer ledelsessystemet', !!sys, { actual: sys ? `godkjennere=${(sys.approverUids || []).length}` : 'isoSystem/main mangler', shot: await E.shot('iso-aktivert') });
  });

  /* ───── ISO-03: melde RUH fra telefon ───── */
  B = await newBot(Bot, 'B-ansatt-telefon', S.users.ansatt2, { view: 'phone', outDir: SHOTS });
  await guard(R, '4.01', 'RUH fra telefon', async () => {
    const skip = B.page.getByText('Hopp over rundturen', { exact: true });
    if (await skip.count()) await skip.first().click({ force: true }).catch(() => {});
    await go(B, 'home', null, 3000);
    // ISO-03: «Meld RUH» ligger på bedriftens Hjem og åpner hurtigmeldingen (type → tekst/foto → Send).
    let taps = 0;
    await B.shot('hjem');
    await B.click('Meld RUH', { timeout: 60000 }); taps += 1;
    await B.page.waitForTimeout(1500);
    await B.page.locator('[id="quick-type-nestenulykke"]').first().click({ timeout: 30000 }); taps += 1;
    await B.page.waitForTimeout(800);
    await B.page.locator('[id="quick-text"]').first().fill(`${TITLE}. Planke på stillas i 2. etasje lå løst. Ingen skadet.`); taps += 1;
    const form = await B.visibleText();
    const photo = /Ta bilde/.test(form);
    await B.shot('ruh-skjema');
    await B.page.getByRole('button', { name: 'Send', exact: true }).last().click({ timeout: 30000 }); taps += 1;
    await sleep(5000);
    const thanks = await B.hasText('Takk for meldingen', { timeout: 15000 });
    const f = (await findings()).find((x) => String(x.title || '').startsWith(TITLE));
    dump('4-01-ruh', f || null);
    R.check('4.01a', 'Ansatt melder RUH fra telefon (lagres som registrert sak)', !!f && f.state === 'registrert', { actual: f ? `${f.number} ${f.type} ${f.state} skjermet=${f.restricted} prosjekt=${f.projectName || '-'} kvittering=${thanks}` : `ikke lagret (kvittering=${thanks})`, shot: await B.shot('ruh-sendt') });
    R.check('4.01', 'ISO-03: RUH kan meldes med høyst 5 trykk fra hjem-skjermen på telefon', taps <= 5, {
      expected: '≤ 5 trykk (hurtigskjema)', actual: `${taps} trykk/felt (Meld RUH → RUH / nestenulykke → tekst → Send)`,
    });
    R.check('4.01b', 'ISO-03: Skjemaet for avvik/RUH lar deg legge ved foto', photo, { actual: photo ? '«Ta bilde» i hurtigmeldingen' : 'ingen mulighet for foto/vedlegg i skjemaet' });
  });
  await B.stop();
  B = null;

  await guard(R, '4.02', 'Hvem kan lese RUH', async () => {
    const tok = await token(S.users.ansatt);
    const res = await rest(tok, 'GET', `families/${C}/isoFindings`);
    const n = (res.json?.documents || []).length;
    const reporter = (res.json?.documents || []).map((d) => d.fields?.reportedBy?.stringValue).filter(Boolean);
    R.check('4.02', 'ISO-04: En annen ansatt (ikke involvert) kan ikke lese andres RUH med navn på melder', !(res.status === 200 && n > 0), {
      expected: '403 eller tom liste', actual: `HTTP ${res.status}, ${n} saker, melder=${reporter.join(',')}`,
    });
  });

  await guard(R, '4.03', 'Innleid melder RUH', async () => {
    // ISO-04: innleide får «Meld RUH» og «Mine meldinger» i ISO i stedet for «Ingen tilgang», og kan sende.
    const I = await newBot(Bot, 'I-innleid', S.users.innleid, { outDir: SHOTS });
    let ui = false; let t = ''; let sent = null; let shot = '';
    try {
      await go(I, 'iso', 'avvik', 6000);
      await I.page.getByText('Kontrollerer tilgang', { exact: false }).first().waitFor({ state: 'hidden', timeout: 90000 }).catch(() => {});
      await I.page.waitForTimeout(2000);
      t = await I.visibleText();
      ui = (await I.page.getByRole('button', { name: /Meld RUH/ }).count()) > 0 && !/Ingen tilgang/.test(t);
      shot = await I.shot('innleid-iso');
      if (ui) {
        await I.page.getByRole('button', { name: /Meld RUH/ }).first().click();
        await I.page.waitForTimeout(1200);
        await I.page.locator('[id="quick-type-nestenulykke"]').first().click({ timeout: 30000 });
        await I.page.locator('[id="quick-text"]').first().fill('RUH fra innleid. Manglende rekkverk ved trapp.');
        await I.page.getByRole('button', { name: 'Send', exact: true }).last().click({ timeout: 30000 });
        await sleep(5000);
        sent = (await findings()).find((x) => String(x.title || '').startsWith('RUH fra innleid'));
        await I.shot('innleid-sendt');
      }
    } finally { await I.stop(); }
    R.check('4.03', 'ISO-04: Innleid kan melde RUH (UI og regler)', ui && !!sent, {
      expected: '«Meld RUH» tilgjengelig og saken lagres', actual: `UI: ${ui ? '«Meld RUH» vises' : (t.match(/Ingen tilgang[^\n]*/) || ['ingen «Meld RUH»'])[0]}; lagret=${sent ? `${sent.number} ${sent.state}` : 'nei'}`, shot,
    });
  });

  /* ───── Saksbehandling til lukking ───── */
  await guard(R, '4.04', 'Triage/årsak/tiltak', async () => {
    // Ny avviksflyt (#554): «Start behandling» (alvorlighet + saksbehandler), «Vurder» (tiltak trengs + årsak),
    // «Nytt tiltak» (ansvarlig + frist). Hvert steg i eget ark.
    await openCase(E);
    await E.click('Start behandling');
    await E.page.waitForTimeout(1200);
    await E.page.getByRole('radio', { name: 'Middels' }).first().click();
    await pickPerson(E, 'Per Prosjektleder', 'last');
    await clickLast(E, 'Start behandling');
    await sleep(3500);
    await E.click('Vurder');
    await E.page.waitForTimeout(1200);
    await E.page.getByRole('radio', { name: 'Ja' }).first().click();
    await E.page.getByPlaceholder('Hva i rutiner, planlegging, utstyr eller opplæring gjorde at det skjedde?').last().fill('Mangler rutine for daglig stillaskontroll');
    await clickLast(E, 'Lagre');
    await sleep(3500);
    await E.click('Nytt tiltak');
    await E.page.waitForTimeout(1200);
    await E.page.getByPlaceholder('Hva skal gjøres?').last().fill('Innfør daglig stillaskontroll med sjekkliste');
    await pickPerson(E, 'Per Prosjektleder', 'last');
    await E.page.locator('input[type=date]').last().fill('2026-11-15');
    await clickLast(E, 'Legg til og lag oppgave');
    await sleep(3500);
    const f = (await findings()).find((x) => String(x.title || '').startsWith(TITLE));
    const todos = await listDocs(`families/${C}/parentTodos`);
    R.check('4.04', 'Eier starter behandlingen, vurderer (tiltak trengs + årsak) og legger inn tiltak (oppgave til Per)', ['tiltak', 'vurdert'].includes(f?.state) && f?.rootCause?.systemCause && (f?.actions || []).length === 1 && todos.some((t) => /Tiltak/.test(t.title || '')), {
      actual: `state=${f?.state} alvorlighet=${f?.severity} saksbehandler=${f?.assigneeName} årsak=${!!f?.rootCause?.systemCause} tiltak=${(f?.actions || []).length} oppgaver=${todos.map((t) => t.title).join(' | ')}`, shot: await E.shot('sak-tiltak'),
    });
    // «Lukk saken» før kontroll og effekt: knappen finnes ikke, eller lukking er sperret.
    const closeBtn = await E.page.getByText('Lukk saken', { exact: true }).count();
    if (closeBtn) {
      await E.page.getByText('Lukk saken', { exact: true }).first().click({ force: true }).catch(() => {});
      await E.page.waitForTimeout(800);
      await E.page.getByText('Godkjenn lukking', { exact: true }).last().click({ force: true }).catch(() => {});
      await sleep(2500);
      await E.page.getByText('Avbryt', { exact: true }).last().click().catch(() => {});
    }
    const early = (await findings()).find((x) => String(x.title || '').startsWith(TITLE))?.state === 'lukket';
    R.check('4.04a', 'Lukking er sperret før tiltak er kontrollert og effekt verifisert', !early, { actual: early ? 'saken ble lukket' : `saken er ikke lukket («Lukk saken» vises=${closeBtn > 0})` });
    const tokB = await token(S.users.ansatt2);
    const res = await patchAs(tokB, `families/${C}/isoFindings/${f.id}`, { state: 'lukket', closeNote: 'lukker selv', closedByUid: S.users.ansatt2.uid });
    R.check('4.04b', 'Reglene nekter melderen (ansatt) å lukke saken selv (REST)', res.status === 403, { expected: '403', actual: `HTTP ${res.status}` });
  });

  P = await newBot(Bot, 'P-prosjektleder', S.users.pl, { outDir: SHOTS });
  await guard(R, '4.05', 'Tiltak utført av ansvarlig', async () => {
    await openCase(P);
    await P.fill('Hva er gjort?', 'Sjekkliste innført og gjennomgått på morgenmøte');
    await P.click('Meld utført');
    await sleep(3500);
    const f = (await findings()).find((x) => x.title === TITLE);
    R.check('4.05', 'Tiltaksansvarlig (Per) melder tiltaket utført', f?.actions?.[0]?.state === 'til_verifisering', { actual: f?.actions?.[0]?.state, shot: await P.shot('tiltak-utfort') });
    await sleep(4000);
    const live = await E.hasText('Til verifisering', { timeout: 8000 });
    R.check('4.05a', 'Eier som har saken åpen ser at tiltaket er meldt utført uten å laste siden på nytt', live, { actual: live ? 'oppdatert' : 'viser fortsatt gammel status', shot: await E.shot('eier-ser-tiltak') });
  });

  await guard(R, '4.06', 'Kontroll, effekt og lukking', async () => {
    // DRIFT-23: saken oppdateres i sanntid, men en ny lasting skal heller ikke skade.
    if (!(await E.hasText('Godkjenn gjennomføring', { timeout: 3000 }))) {
      await E.page.reload();
      await E.waitShell();
      await openCase(E);
    }
    await E.click('Godkjenn gjennomføring');
    await sleep(3500);
    await E.click('Kontroller effekt');
    await E.page.waitForTimeout(1200);
    await E.page.getByPlaceholder('Stikkprøve, måling, oppfølgingssamtale …').last().fill('Stikkprøve av sjekklister to uker etter');
    await E.page.getByLabel('Resultat').last().fill('Alle stikkprøver OK, ingen nye funn.');
    await E.page.getByRole('radio', { name: 'Effekt verifisert' }).first().click();
    await clickLast(E, 'Lagre effektkontroll');
    await sleep(3500);
    await E.click('Lukk saken');
    await E.page.waitForTimeout(1200);
    await E.page.getByPlaceholder('Hva ble gjort, og hvorfor er saken ferdig?').last().fill('Tiltak gjennomført og effekt verifisert.');
    await clickLast(E, 'Godkjenn lukking');
    await sleep(3500);
    const f = (await findings()).find((x) => String(x.title || '').startsWith(TITLE));
    dump('4-06-sak-lukket', f);
    R.check('4.06', 'Saken lukkes med årsak, kontrollert tiltak, verifisert effekt og lukkebegrunnelse', f?.state === 'lukket' && f?.effect?.outcome === 'verifisert' && f?.closeNote && f?.actions?.[0]?.state === 'verifisert', {
      actual: `state=${f?.state} effekt=${f?.effect?.outcome} tiltak=${f?.actions?.[0]?.state} lukket av=${f?.closedBy}`, shot: await E.shot('sak-lukket'),
    });
  });

  /* ───── ISO-11: dokumentgodkjenning ───── */
  const DOC = 'Rutine for stillaskontroll';
  await guard(R, '4.07', 'Dokumentgodkjenning', async () => {
    await go(E, 'iso', 'dokumenter', 5000);
    await E.click('Nytt dokument', { timeout: 60000 });
    await E.page.waitForTimeout(1200);
    await fillAfterLabel(E, 'Tittel', DOC, { nth: 'last' });
    await pickPerson(E, 'Per Prosjektleder', 1);
    await E.click('Krever lesebekreftelse fra ansatte');
    await E.click('Opprett');
    await sleep(3500);
    await E.page.locator('textarea:visible').first().fill('# Stillaskontroll\n\nStillas kontrolleres hver morgen med sjekkliste før bruk.');
    await E.click('Send til godkjenning');
    await sleep(3500);
    // Utpekt godkjenner (Per) åpner dokumentet.
    await go(P, 'iso', 'dokumenter', 5000);
    await P.page.getByText(DOC, { exact: false }).first().waitFor({ state: 'visible', timeout: 60000 }).catch(() => {});
    await P.click(DOC, { exact: false });
    await P.page.waitForTimeout(2500);
    const perCan = await P.hasText('Godkjenn og publiser', { timeout: 3000 });
    R.check('4.07a', 'Utpekt godkjenner (Per) får «Godkjenn og publiser»', perCan, { actual: perCan ? 'vises' : 'vises ikke – bare godkjennerroller i ISO kan godkjenne', shot: await P.shot('per-godkjenner') });
    const selfCan = await E.hasText('Godkjenn og publiser', { timeout: 3000 });
    if (selfCan) {
      await E.click('Godkjenn og publiser');
      await sleep(3500);
    }
    const d = (await documents()).find((x) => x.title === DOC);
    const rev = (d?.revisions || [])[0] || {};
    dump('4-07-dokument', d);
    R.check('4.07', 'ISO-11: Den som sendte dokumentet til godkjenning kan ikke godkjenne og publisere det selv', !(rev.state === 'publisert' && rev.submittedBy === rev.approvedBy), {
      expected: 'Egengodkjenning sperret', actual: `rev.1 ${rev.state}, sendt av ${rev.submittedBy}, godkjent av ${rev.approvedBy}, utpekt godkjenner ${d?.approverName}`, shot: await E.shot('egengodkjent'),
    });
  });

  // Høyst to nettleserkontekster samtidig: prosjektlederen logger ut mens den ansatte leser.
  if (P) { await P.stop(); P = null; }
  await guard(R, '4.08', 'Lesebekreftelse', async () => {
    const A = await newBot(Bot, 'A-ansatt', S.users.ansatt, { outDir: SHOTS });
    try {
    await go(A, 'iso', 'dokumenter', 6000);
    await A.page.getByText(DOC, { exact: false }).first().waitFor({ state: 'visible', timeout: 60000 }).catch(() => {});
    await A.click(DOC, { exact: false });
    await A.page.waitForTimeout(2500);
    await A.click('Jeg har lest rev. 1');
    await sleep(3000);
    const d = (await documents()).find((x) => x.title === DOC);
    R.check('4.08', 'Ansatt bekrefter lest (readAcks)', (d?.readAcks || []).some((a) => a.uid === S.users.ansatt.uid), { actual: (d?.readAcks || []).map((a) => a.name).join(',') || 'ingen', shot: await A.shot('lest') });
    } finally { await A.stop(); }
    // ISO-data lastes én gang: last siden på nytt for å se kvitteringen (jf. 4.05a).
    await E.page.reload();
    await E.waitShell();
    await go(E, 'iso', 'dokumenter', 4000);
    await E.page.getByText(DOC, { exact: false }).first().waitFor({ state: 'visible', timeout: 60000 }).catch(() => {});
    await E.click(DOC, { exact: false });
    await E.page.waitForTimeout(2500);
    const t = await E.visibleText();
    R.info('4.08a', 'Eier ser antall lesebekreftelser, men ikke hvem som mangler (ISO-12)', (t.match(/\d+ har bekreftet[^\n]*/) || ['–'])[0], await E.shot('eier-lesebekreftelser'));
  });

  /* ───── ISO-08: internrevisjon og ledelsens gjennomgang ───── */
  await guard(R, '4.09', 'Internrevisjon', async () => {
    await go(E, 'iso', 'revisjon', 5000);
    await E.click('Planlegg revisjon', { timeout: 60000 });
    await E.page.waitForTimeout(1500);
    await fillAfterLabel(E, 'Revisjon', 'Revisjon drift-test', { nth: 'last' });
    await fillAfterLabel(E, 'Omfang (prosesser/enheter)', 'Byggeplass og stillas');
    await fillAfterLabel(E, 'Kriterier', 'ISO 45001 kap. 8');
    await pickPerson(E, 'Per Prosjektleder', 'last');
    // Påkrevd uavhengighetserklæring (avkrysning uten «*» i skjemaet).
    await E.page.getByRole('checkbox', { name: 'Revisor reviderer ikke eget arbeid' }).last().click({ timeout: 30000 });
    await E.page.locator('input[type=date]').last().fill('2026-10-27');
    await E.shot('revisjon-skjema');
    await clickLast(E, 'Lagre');
    await sleep(3500);
    const rec = (await records()).find((x) => x.title === 'Revisjon drift-test');
    if (!rec) throw new Error(`revisjonen ble ikke lagret (${(await E.visibleText()).match(/[^\n]*(må|påkrevd|Fyll)[^\n]*/)?.[0] || 'ingen melding'})`);
    await E.page.getByText(`${rec.number} · Revisjon drift-test`, { exact: false }).first().waitFor({ state: 'visible', timeout: 30000 });
    await E.click(`${rec.number} · Revisjon drift-test`, { exact: false });
    await E.page.waitForTimeout(2000);
    await E.click('Godkjenn rapport (låser)');
    await sleep(3000);
    const r = (await records()).find((x) => x.title === 'Revisjon drift-test');
    const buttons = await E.page.evaluate(() => [...document.querySelectorAll('[role=button]')].map((b) => (b.innerText || '').trim()).filter((x) => /^(Oppfølging|Lukket|Pågår|Rapport)$/.test(x)));
    R.check('4.09', 'Godkjent revisjonsrapport er låst', r?.state === 'godkjent' && r?.locked === true, { actual: `state=${r?.state} locked=${r?.locked}`, shot: await E.shot('revisjon-godkjent') });
    R.info('4.09a', 'ISO-08 (oppfølging låser opp): statusknappene skjules når rapporten er låst – overgang til «Oppfølging»/«Lukket» finnes ikke i UI', buttons.join(',') || 'ingen statusknapper');
    const tokP = await token(S.users.pl);
    const res = await patchAs(tokP, `families/${C}/isoRecords/${r.id}`, { state: 'oppfolging', locked: false });
    R.check('4.09b', 'Reglene nekter en ikke-godkjenner å låse opp godkjent rapport (REST)', res.status === 403, { expected: '403', actual: `HTTP ${res.status}` });
    await E.page.keyboard.press('Escape').catch(() => {});
  });

  await guard(R, '4.10', 'Ledelsens gjennomgang', async () => {
    await go(E, 'iso', 'ledelse', 5000);
    await E.click('Ny gjennomgang', { timeout: 60000 });
    await E.page.waitForTimeout(1500);
    await fillAfterLabel(E, 'Gjennomgang', 'LGJ drift-test', { nth: 'last' });
    await fillAfterLabel(E, 'Periode', '2026');
    await E.page.locator('input[type=date]').last().fill('2026-10-27');
    await fillAfterLabel(E, 'Deltakere', 'Eva Eier, Per Prosjektleder');
    await fillAfterLabel(E, 'Vurdering av systemets egnethet, tilstrekkelighet og effektivitet', 'Systemet er egnet.');
    await clickLast(E, 'Lagre');
    await sleep(3500);
    await E.click('LGJ drift-test', { exact: false });
    await E.page.waitForTimeout(2000);
    await E.click('Hent grunnlag');
    await sleep(2500);
    await fillAfterLabel(E, 'Vedtak', 'Innføre stillaskontroll i alle prosjekter', { nth: 'last' });
    await pickPerson(E, 'Per Prosjektleder', 'last');
    await E.page.locator('input[type=date]').last().fill('2026-11-30');
    await E.click('Legg til vedtak og lag oppgave');
    await sleep(3000);
    await E.click('Godkjenn referat (låser grunnlag)');
    await sleep(3000);
    let r = (await records()).find((x) => x.title === 'LGJ drift-test');
    R.check('4.10a', 'LGJ med vedtak godkjennes og låses', r?.locked === true && (r?.decisions || []).length === 1, { actual: `state=${r?.state} locked=${r?.locked} vedtak=${(r?.decisions || []).length}`, shot: await E.shot('lgj-godkjent') });
    P = await newBot(Bot, 'P-prosjektleder', S.users.pl, { outDir: SHOTS });
    await go(P, 'iso', 'ledelse', 5000);
    await P.page.getByText('LGJ drift-test', { exact: false }).first().waitFor({ state: 'visible', timeout: 60000 }).catch(() => {});
    await P.click('LGJ drift-test', { exact: false });
    await P.page.waitForTimeout(2500);
    await P.click('Utført');
    await sleep(3500);
    r = (await records()).find((x) => x.title === 'LGJ drift-test');
    const t = await P.visibleText();
    dump('4-10-lgj', r);
    R.check('4.10', 'ISO-08: Vedtakseier (Per, ISO-rolle uten godkjennerrolle) kan markere vedtaket utført på godkjent LGJ', r?.decisions?.[0]?.done === true, {
      expected: 'decision.done = true', actual: `done=${r?.decisions?.[0]?.done}; feilmelding vist: ${/tilgang|Kunne ikke|nektet|permission|endret av/i.test(t.slice(t.indexOf('Vedtak'))) ? 'ja' : 'nei (knappen gjør ingenting synlig)'}`,
      shot: await P.shot('vedtak-utfort'),
    });
  });
} catch (e) {
  R.step('X', 'Uventet feil i boten', { ok: false, actual: e?.stack || e });
} finally {
  for (const b of [B, E, P]) {
    const errs = (b?.errors || []).filter((x) => !/listCalendarConnections|fetchExternalCalendarEvents|CORS policy/.test(x.message));
    if (errs.length) R.info('JS', `JS-feil hos ${b.name}`, errs.slice(0, 3).map((x) => x.message).join(' | '));
  }
  await closeBrowser();
}
process.exit(R.summary() ? 1 : 0);
