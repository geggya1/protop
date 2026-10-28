/**
 * Drift-bot 1 – samtidighet og datatap (DS-01, DS-02, DS-03, DS-04, DS-11).
 *
 * Tre ekte nettlesere i samme selskap:
 *   A = ansatt med Timeliste åpen, L = leder (Øverste leder), E = eier.
 * Hvert steg sjekker FORVENTET korrekt oppførsel og skriver OK/AVVIK.
 * Firestore-dokumentene dumpes før/etter til e2e-out/drift/.
 *
 *   NODE_PATH=$(npm root -g) node scripts/e2e/scenarios/drift-1-samtidighet.mjs
 */
import { Bot, closeBrowser } from '../lib/bot.mjs';
import { getDoc, putDoc, listDocs } from '../lib/emu.mjs';
import {
  Report, seedCompany, stamp, projectState, customers, dump, fillAfterLabel, go, jsClick, guard, newBot,
  openTimesheetCell, enterHours, osloDay, osloDate, patchAs, token, clickInRow, OUT,
} from './drift-lib.mjs';
import { join } from 'node:path';

const R = new Report('drift-1-samtidighet');
const SHOTS = join(OUT, '1-samtidighet');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nums = (st) => (st.projects || []).map((p) => p.number);

const tag = `s${stamp()}`;
const S = await seedCompany(tag);
const C = S.companyId;
const statePath = `families/${C}/projects/state`;
console.log(`Selskap ${C} (${S.name})`);

// Et prosjektutlegg som alle ser fra start (DS-03).
{
  const d = await getDoc(statePath);
  d.state.expenses = [{
    id: 'utl-seed-e2', date: osloDate(), employeeId: 'emp-eier', employeeName: S.users.eier.name, category: 'travel',
    description: 'Hotell E2', amountExVat: 1200, vatCode: 'HIGH', vatPercent: 25, vatAmount: 300, amountInclVat: 1500,
    markupPercent: 10, chargeType: 'reinvoice', billable: true, customerId: 'cust-k1', customerName: 'Kunde En AS',
    projectId: 'prj-100', projectNumber: '100', projectName: 'Rehab Kundeveien', status: 'draft', invoiceId: '',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }];
  await putDoc(statePath, { state: d.state, updatedAt: new Date() });
}
dump('1-00-projects-state-start', await getDoc(statePath));

const today = osloDate();
const day = osloDay();
let A; let L; let E;

async function createProject(bot, number, name, customerLabel) {
  await go(bot, 'projects', null, 3500);
  await bot.click('Nytt prosjekt');
  await bot.click('Opprett prosjekt');
  await bot.page.waitForTimeout(1200);
  await fillAfterLabel(bot, 'Prosjektnummer', number);
  await fillAfterLabel(bot, 'Navn', name);
  await bot.click('Velg kunde');
  await bot.click(customerLabel);
  await bot.click('Velg prismodell');
  await bot.click('Timepris');
  await bot.click('Opprett prosjekt');
  await bot.page.waitForTimeout(3000);
}

try {
  /* ───── DS-01: ansatt med åpen timeliste skriver tilbake gammel prosjektliste ───── */
  A = await newBot(Bot, 'A-ansatt', S.users.ansatt, { outDir: SHOTS });
  await go(A, 'arbeid', 'timeliste', 4500);
  R.check('1.01', 'Ansatt åpner Timeliste og ser prosjekt #100', await A.hasText('#100 Rehab Kundeveien', { timeout: 15000 }), {
    expected: 'Prosjektet med stjerne vises', actual: 'se skjermbilde', shot: await A.shot('timeliste-start'),
  });

  // Prosjekt der den ansatte er deltaker uten stjerne (slik Team-fanen legger til) – kan hen få det inn i listen?
  await guard(R, '1.02', 'Ansatt legger til prosjekt hen allerede er deltaker på', async () => {
    await A.click('Legg til prosjekt');
    await A.click('#101 Tilbygg Oslo');
    await A.page.waitForTimeout(1500);
    const err = await A.hasText('Medarbeideren er allerede deltaker', { timeout: 2000 });
    const shown = await A.hasText('#101 Tilbygg Oslo', { timeout: 1000 });
    R.check('1.02', '«Legg til prosjekt» på et prosjekt der den ansatte allerede er deltaker', !err, {
      expected: 'Prosjektet legges i timelisten (stjerne)', actual: err ? 'Feilmelding «Medarbeideren er allerede deltaker.», prosjektet vises ikke' : `vist=${shown}`,
      shot: await A.shot('legg-til-deltakerprosjekt'),
    });
    await A.page.keyboard.press('Escape').catch(() => {});
  });

  L = await newBot(Bot, 'L-leder', S.users.okonomi, { outDir: SHOTS });
  await guard(R, '1.03', 'Leder oppretter prosjekt #200', async () => {
    await createProject(L, '200', 'Nytt prosjekt fra leder', '10001 · Kunde En AS');
    const st = await projectState(C);
    R.check('1.03', 'Leder oppretter prosjekt #200 i Prosjekt', nums(st).includes('200'), {
      expected: '#200 i projects/state', actual: `projects=${nums(st).join(',')}`, shot: await L.shot('prosjekt-200-opprettet'),
    });
    dump('1-03-projects-state-etter-200', await getDoc(statePath));
  });

  await guard(R, '1.04', 'DS-01', async () => {
    await openTimesheetCell(A, '#100 Rehab Kundeveien', day);
    await enterHours(A, '7,5', 'Riving bad');
    await sleep(2500);
    const st = await projectState(C);
    const te = (await listDocs(`families/${C}/timeEntries`)).filter((t) => t.employeeId === 'emp-ansatt');
    dump('1-04-projects-state-etter-timeforing', await getDoc(statePath));
    R.check('1.04a', 'Timeføringen er lagret i timeEntries', te.some((t) => Number(t.hours) === 7.5), {
      expected: '7,5 t', actual: te.map((t) => `${t.date}:${t.hours}`).join(','),
    });
    R.check('1.04', 'DS-01: prosjekt #200 finnes fortsatt etter at ansatt fører timer', nums(st).includes('200'), {
      expected: 'projects inneholder 200', actual: `projects=${nums(st).join(',')}`, shot: await A.shot('etter-timeforing'),
    });
  });

  E = await newBot(Bot, 'E-eier', S.users.eier, { outDir: SHOTS });
  await guard(R, '1.05', 'Eier ser #200', async () => {
    await go(E, 'projects', null, 4000);
    const sees = await E.hasText('Nytt prosjekt fra leder', { timeout: 4000 });
    R.check('1.05', 'Eier (ny innlogging) ser prosjekt #200 som leder opprettet', sees, {
      expected: '#200 i listen', actual: sees ? 'vises' : 'mangler', shot: await E.shot('eier-prosjektliste'),
    });
  });

  /* ───── DS-02: å åpne Økonomi/ISO skriver gammel kopi ───── */
  await guard(R, '1.06', 'Eier oppretter #201', async () => {
    await createProject(E, '201', 'Prosjekt fra eier', '10002 · Kunde To AS');
    const st = await projectState(C);
    R.check('1.06', 'Eier oppretter prosjekt #201', nums(st).includes('201'), { actual: `projects=${nums(st).join(',')}` });
  });

  await guard(R, '1.07', 'ISO skriver ikke', async () => {
    const before = await getDoc(statePath);
    await go(L, 'iso', 'oversikt', 6000);
    const after = await getDoc(statePath);
    R.check('1.07', 'DS-02 (ISO-delen): å åpne ISO med gammel kopi skriver ikke prosjektdokumentet', before.updatedAt === after.updatedAt, {
      expected: 'updatedAt uendret', actual: `${before.updatedAt} → ${after.updatedAt}`, shot: await L.shot('iso-apnet'),
    });
  });

  await guard(R, '1.08', 'DS-02', async () => {
    const before = await projectState(C);
    await go(L, 'okonomi', 'oversikt', 6000);
    await sleep(1500);
    const after = await projectState(C);
    dump('1-08-projects-state-etter-okonomi', await getDoc(statePath));
    R.check('1.08', 'DS-02: leder bare åpner Økonomi – prosjekt #201 (nyere) finnes fortsatt', nums(after).includes('201'), {
      expected: '#201 beholdes', actual: `før=${nums(before).join(',')} etter=${nums(after).join(',')}`, shot: await L.shot('okonomi-apnet'),
    });
  });

  /* ───── DS-03: slettet utlegg kommer tilbake ───── */
  await guard(R, '1.09', 'DS-03', async () => {
    await go(E, 'projects', null, 3000);
    await E.click('Rehab Kundeveien');
    await E.page.waitForTimeout(1500);
    await E.click('Prosjektutlegg');
    await E.page.waitForTimeout(1500);
    const had = await E.hasText('Hotell E2', { timeout: 4000 });
    await clickInRow(E, 'Hotell E2', 'last', { minChildren: 6 });
    await E.click('Slett');
    await sleep(3000);
    const gone = !(await E.hasText('Hotell E2', { timeout: 1000 }));
    const st = await projectState(C);
    const inFs = (st.expenses || []).some((x) => x.description === 'Hotell E2');
    dump('1-09-projects-state-etter-sletting', await getDoc(statePath));
    R.check('1.09a', 'Eier sletter prosjektutlegget «Hotell E2» (forsvinner i skjermbildet)', had && gone, { shot: await E.shot('utlegg-slettet') });
    R.check('1.09', 'DS-03: slettet utlegg er borte i Firestore', !inFs, {
      expected: 'expenses uten Hotell E2', actual: inFs ? 'Hotell E2 ligger fortsatt i projects/state.expenses' : 'borte',
    });
    await E.page.reload();
    await E.waitShell();
    await go(E, 'projects', null, 3000);
    await E.click('Rehab Kundeveien');
    await E.page.waitForTimeout(1200);
    await E.click('Prosjektutlegg');
    await E.page.waitForTimeout(1500);
    const back = await E.hasText('Hotell E2', { timeout: 3000 });
    R.check('1.09b', 'DS-03: slettet utlegg er fortsatt borte etter ny lasting', !back, {
      expected: 'ikke i listen', actual: back ? 'utlegget er tilbake' : 'borte', shot: await E.shot('utlegg-etter-reload'),
    });
  });

  /* ───── DS-04: kunderegister – gammel kopi vinner ───── */
  await guard(R, '1.10', 'DS-04', async () => {
    await go(L, 'kunder', null, 3500);
    await L.click('Kunde To AS');
    await go(E, 'kunder', null, 3500);
    await E.click('Kunde En AS');
    await E.page.waitForTimeout(800);
    await jsClick(E, 'Endre kunde');
    await fillAfterLabel(E, 'E-post', 'k1-ny-fra-eier@protop.test');
    await jsClick(E, 'Lagre kunde');
    await sleep(3000);
    const c1 = await customers(C);
    R.check('1.10a', 'Eier endrer e-post på Kunde En AS', c1.find((c) => c.id === 'cust-k1')?.email === 'k1-ny-fra-eier@protop.test', {
      actual: c1.find((c) => c.id === 'cust-k1')?.email, shot: await E.shot('kunde1-epost-lagret'),
    });
    dump('1-10-anbud-customers-etter-eier', await getDoc(`families/${C}/anbud/customers`));
    await jsClick(L, 'Endre kunde');
    await fillAfterLabel(L, 'Telefon', '48888888');
    await jsClick(L, 'Lagre kunde');
    await sleep(3000);
    const c2 = await customers(C);
    dump('1-10-anbud-customers-etter-leder', await getDoc(`families/${C}/anbud/customers`));
    const k1 = c2.find((c) => c.id === 'cust-k1');
    const k2 = c2.find((c) => c.id === 'cust-k2');
    R.check('1.10b', 'Leder (gammel kopi) endrer telefon på Kunde To AS', k2?.phone === '48888888', { actual: k2?.phone, shot: await L.shot('kunde2-telefon-lagret') });
    R.check('1.10', 'DS-04: e-posten eier lagret på Kunde En AS står seg etter at leder lagrer en annen kunde', k1?.email === 'k1-ny-fra-eier@protop.test', {
      expected: 'k1-ny-fra-eier@protop.test', actual: k1?.email,
    });
  });

  await guard(R, '1.10c', 'Begge endrer samme e-post', async () => {
    // Begge har kunden åpen. Eier lagrer først, leder (som ikke har lastet på nytt) lagrer etterpå.
    for (const b of [E, L]) {
      await go(b, 'kunder', null, 3000);
      if (await b.hasText('Til kundelisten', { timeout: 1500 })) await jsClick(b, 'Til kundelisten');
      await b.page.waitForTimeout(800);
      await b.click('Kunde En AS');
      await b.page.waitForTimeout(800);
    }
    await jsClick(E, 'Endre kunde');
    await jsClick(L, 'Endre kunde');
    await fillAfterLabel(E, 'E-post', 'k1-eier-andre@protop.test');
    await jsClick(E, 'Lagre kunde');
    await sleep(3000);
    await fillAfterLabel(L, 'E-post', 'k1-leder@protop.test');
    await jsClick(L, 'Lagre kunde');
    await sleep(3000);
    const k1 = (await customers(C)).find((c) => c.id === 'cust-k1');
    const t = await L.visibleText();
    const warned = /endret av en annen|nyere versjon|konflikt|oppdatert av/i.test(t);
    dump('1-10c-anbud-customers-begge', await getDoc(`families/${C}/anbud/customers`));
    R.check('1.10c', 'DS-04: Når to endrer samme e-post, får den som lagrer sist varsel om at kunden er endret av en annen', warned, {
      expected: 'Konfliktvarsel (eller sammenslåing med beskjed)', actual: `vinner: ${k1?.email}; varsel til leder: ${warned ? 'ja' : 'nei – siste lagring vinner stille'}`,
      shot: await L.shot('kunde1-begge-endret'),
    });
  });

  /* ───── Godkjenning: låst liste vises for leder, og godkjenning står seg ───── */
  await guard(R, '1.11', 'Låsing og godkjenning', async () => {
    await go(A, 'arbeid', 'timeliste', 2500);
    await A.page.getByRole('button', { name: `Lås timer til ${today}` }).click();
    await sleep(2500);
    await A.shot('timeliste-last');
    await go(L, 'arbeid', 'timeliste', 1500);
    await go(L, 'arbeid', 'godkjenning', 4000);
    const lockedSection = async () => {
      const t = await L.visibleText();
      const a = t.indexOf('Låst til kontroll');
      const b = t.indexOf('Ikke låst', a);
      return a >= 0 ? t.slice(a, b > a ? b : undefined) : '';
    };
    const seen = /Anne Ansatt/.test(await lockedSection());
    R.check('1.11', 'Leder ser ansattes nylig låste timeliste i Godkjenninger uten å laste siden på nytt', seen, {
      expected: 'Anne Ansatt under «Låst til kontroll»', actual: seen ? 'vises' : '«Aldri låst» til siden lastes på nytt', shot: await L.shot('godkjenning-uten-reload'),
    });
    if (!seen) {
      await L.page.reload();
      await L.waitShell();
      await go(L, 'arbeid', 'godkjenning', 4500);
    }
    R.check('1.11b', 'Etter ny lasting står Anne Ansatt under «Låst til kontroll»', /Anne Ansatt/.test(await lockedSection()), { shot: await L.shot('godkjenning-etter-reload') });
    await L.click('Kontroller');
    await L.page.waitForTimeout(2000);
    await L.click('Godkjenn');
    await sleep(3000);
    const te = (await listDocs(`families/${C}/timeEntries`)).filter((t) => t.employeeId === 'emp-ansatt');
    const lock = ((await projectState(C)).timesheetLocks || []).find((l) => l.employeeId === 'emp-ansatt');
    R.check('1.11a', 'Leder godkjenner: timen får status godkjent og låsen readyForBilling', te[0]?.status === 'godkjent' && lock?.readyForBilling === true, {
      actual: `status=${te[0]?.status} readyForBilling=${lock?.readyForBilling}`, shot: await L.shot('godkjent'),
    });
    dump('1-11-projects-state-etter-godkjenning', await getDoc(statePath));
  });

  await guard(R, '1.12', 'Stjerne angrer godkjenning', async () => {
    await A.page.getByRole('button', { name: 'Stjernemerk prosjekt' }).first().click();
    await sleep(3000);
    const lock = ((await projectState(C)).timesheetLocks || []).find((l) => l.employeeId === 'emp-ansatt');
    dump('1-12-projects-state-etter-stjerne', await getDoc(statePath));
    R.check('1.12', 'Ansatt (gammel kopi) setter stjerne på prosjekt – lederens godkjenning står seg', !!lock?.approvedAt && lock?.readyForBilling === true, {
      expected: 'approvedAt satt, readyForBilling=true', actual: `approvedAt="${lock?.approvedAt}" readyForBilling=${lock?.readyForBilling}`, shot: await A.shot('stjerne-etter-godkjenning'),
    });
  });

  /* ───── DS-11: fakturert time endres fra gammel kopi og blir fakturerbar igjen ───── */
  let invoiceId = '';
  await guard(R, '1.13', 'Fakturautkast', async () => {
    await L.page.reload();
    await L.waitShell();
    await go(L, 'okonomi', 'fakturagrunnlag', 5000);
    await L.click('T.o.m. i dag');
    await L.page.waitForTimeout(2500);
    await L.page.locator('#billing-check-all').click();
    await L.page.waitForTimeout(600);
    if (await L.page.locator('#billing-approve-selected').isEnabled()) {
      await L.page.locator('#billing-approve-selected').click();
      await sleep(2500);
    }
    if (!(await L.page.locator('#billing-draft-selected').isEnabled())) {
      await L.page.locator('#billing-check-all').click().catch(() => {});
      await L.page.waitForTimeout(600);
    }
    await L.page.locator('#billing-draft-selected').click({ timeout: 8000 });
    await sleep(3500);
    const te = (await listDocs(`families/${C}/timeEntries`)).filter((t) => t.employeeId === 'emp-ansatt');
    invoiceId = te[0]?.invoiceId || '';
    R.check('1.13', 'Leder lager fakturautkast av godkjente timer (timen kobles til fakturaen)', !!invoiceId, {
      actual: `invoiceId=${invoiceId} status=${te[0]?.status}`, shot: await L.shot('fakturautkast'),
    });
  });

  await guard(R, '1.14', 'DS-11', async () => {
    await A.page.getByRole('button', { name: `Lås opp timeliste ${today}` }).click().catch(() => {});
    await sleep(2000);
    await openTimesheetCell(A, '#100 Rehab Kundeveien', day);
    const lockedMsg = await A.hasText('Låst', { timeout: 800 });
    await A.shot('apner-fakturert-time');
    let edited = false;
    try {
      await enterHours(A, '8', '');
      edited = true;
    } catch { /* knappen kan være sperret */ }
    await sleep(2500);
    const te = (await listDocs(`families/${C}/timeEntries`)).filter((t) => t.employeeId === 'emp-ansatt');
    dump('1-14-timeentries-etter-endring', te);
    R.check('1.14', 'DS-11: fakturert time kan ikke endres fra gammel kopi (invoiceId og timer beholdes)', te[0]?.invoiceId === invoiceId && Number(te[0]?.hours) === 7.5, {
      expected: `invoiceId=${invoiceId}, 7,5 t`, actual: `forsøk=${edited} låstmelding=${lockedMsg} invoiceId=${te[0]?.invoiceId} timer=${te[0]?.hours} status=${te[0]?.status}`,
      shot: await A.shot('etter-endring-fakturert-time'),
    });
  });

  await guard(R, '1.15', 'Dobbel fakturering', async () => {
    await L.page.reload();
    await L.waitShell();
    await go(L, 'okonomi', 'fakturagrunnlag', 5000);
    await L.click('T.o.m. i dag');
    await L.page.waitForTimeout(2500);
    const text = await L.visibleText();
    const again = /Rehab Kundeveien/.test(text) && !/Ingenting å fakturere/.test(text);
    R.check('1.15', 'Timer som allerede ligger på en faktura dukker ikke opp igjen i «Til fakturering»', !again, {
      expected: 'Ingenting å fakturere for #100 (timene er på utkastet)', actual: again ? (text.match(/Totalt å faktureres:[^\n]*/) || [''])[0] : 'ikke i listen',
      shot: await L.shot('til-fakturering-igjen'),
    });
  });

  await guard(R, '1.16', 'Regel for timeEntries', async () => {
    const te = (await listDocs(`families/${C}/timeEntries`)).filter((t) => t.employeeId === 'emp-ansatt');
    const id = te[0]?.id;
    // Bjørn (annen ansatt) prøver å nullstille fakturakobling og status på Annes time via REST.
    const tok = await token(S.users.ansatt2);
    const res = await patchAs(tok, `families/${C}/timeEntries/${id}`, { invoiceId: null, status: 'registrert', hours: 0.5 });
    R.check('1.16', 'Reglene nekter en annen ansatt å endre fakturakobling/status/timer på en kollegas time (REST)', res.status === 403, {
      expected: '403', actual: `HTTP ${res.status}`,
    });
  });
} catch (e) {
  R.step('X', 'Uventet feil i boten', { ok: false, actual: e?.stack || e });
} finally {
  for (const b of [A, L, E]) {
    const errs = (b?.errors || []).filter((x) => !/listCalendarConnections|CORS policy/.test(x.message));
    if (errs.length) R.info('JS', `JS-feil hos ${b.name}`, errs.slice(0, 3).map((x) => x.message).join(' | '));
  }
  await closeBrowser();
}

const bad = R.summary();
process.exit(bad ? 1 : 0);
