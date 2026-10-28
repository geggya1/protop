/**
 * Drift-bot 9 – «Legg til prosjekt» når den ansatte allerede er deltaker (DRIFT-09),
 * og at en ansatt ikke kan låse opp en timeliste lederen har godkjent (DRIFT-06).
 * Én nettleserkontekst om gangen. Personvernmeldingen nederst lukkes først (den dekker knappen).
 *
 *   NODE_PATH=$(npm root -g) node scripts/e2e/scenarios/drift-9-deltaker.mjs
 */
import { join } from 'node:path';
import { Bot, closeBrowser } from '../lib/bot.mjs';
import { getDoc, putDoc } from '../lib/emu.mjs';
import {
  Report, seedCompany, stamp, go, guard, newBot, osloDate, projectState, OUT,
} from './drift-lib.mjs';

const R = new Report('drift-9-deltaker');
const SHOTS = join(OUT, '9-deltaker');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = await seedCompany(`p${stamp()}`);
const C = S.companyId;
const today = osloDate();
console.log(`Selskap ${C}`);

async function closeNotice(bot) {
  const ok = bot.page.getByRole('button', { name: 'OK', exact: true });
  if (await ok.count()) await ok.first().click().catch(() => {});
  await bot.page.waitForTimeout(400);
}

let A;
try {
  A = await newBot(Bot, 'A-ansatt', S.users.ansatt, { outDir: SHOTS });
  await go(A, 'arbeid', 'timeliste', 4500);
  await A.hasText('#100 Rehab Kundeveien', { timeout: 60000 });
  await closeNotice(A);

  await guard(R, '9.01', 'Legg til prosjekt man er deltaker på', async () => {
    const before = await A.hasText('#101 Tilbygg Oslo', { timeout: 1500 });
    await A.click('Legg til prosjekt');
    await A.click('#101 Tilbygg Oslo');
    await sleep(2000);
    const err = await A.hasText('Medarbeideren er allerede deltaker', { timeout: 1500 });
    const shown = await A.hasText('#101 Tilbygg Oslo', { timeout: 4000 });
    R.check('9.01', 'DRIFT-09: prosjektet vises (stjerne) i stedet for feilmelding', !before && !err && shown, {
      actual: `før=${before} feil=${err} vist=${shown}`, shot: await A.shot('deltaker-lagt-til'),
    });
  });

  await guard(R, '9.02', 'Godkjent timeliste kan ikke låses opp av ansatt', async () => {
    // Lederen har låst og godkjent i skyen etter at den ansatte åpnet timelisten.
    const path = `families/${C}/projects/state`;
    const doc = await getDoc(path);
    doc.state.timesheetLocks = [{
      id: 'las-e2e', employeeId: 'emp-ansatt', throughDate: today, lockedAt: new Date().toISOString(),
      lockedByUid: '', readyForBilling: true, approvedAt: new Date().toISOString(), approvedByUid: 'leder',
      approvedThrough: today, dismissedFindingIds: [],
    }];
    await putDoc(path, doc);
    // Den ansatte har en gammel kopi uten låsen: knappen sier «Lås timer til …». Et trykk skal
    // ikke flytte eller fjerne lederens godkjenning (fersk status hentes først).
    await A.page.getByRole('button', { name: `Lås timer til ${today}` }).click({ timeout: 30000 });
    await sleep(3500);
    const lock = ((await projectState(C)).timesheetLocks || []).find((row) => row.employeeId === 'emp-ansatt');
    const already = await A.hasText(`Timelisten er allerede låst til ${today}.`, { timeout: 3000 });
    R.check('9.02a', 'Etter «Lås» fra gammel kopi står godkjenningen, og timelisten sier at den alt er låst', !!lock?.approvedAt && lock?.readyForBilling === true && already, {
      actual: `approvedAt=${lock?.approvedAt || ''} ready=${lock?.readyForBilling} melding=${already}`, shot: await A.shot('etter-trykk-gammel-kopi'),
    });
    // Nå viser timelisten låsen. Et nytt trykk er «Lås opp» – det skal avvises med forklaring.
    await A.page.getByRole('button', { name: `Lås opp timeliste ${today}` }).click({ timeout: 30000 });
    await sleep(3500);
    const msg = await A.hasText('godkjent og kan ikke låses opp', { exact: false, timeout: 5000 });
    const after = ((await projectState(C)).timesheetLocks || []).find((row) => row.employeeId === 'emp-ansatt');
    R.check('9.02', 'DRIFT-06: ansatt kan ikke låse opp godkjent timeliste, og får forklaring', !!after?.approvedAt && msg, {
      actual: `approvedAt=${after?.approvedAt || ''} melding=${msg}`, shot: await A.shot('las-opp-avvist'),
    });
  });
} catch (e) {
  R.step('X', 'Uventet feil i boten', { ok: false, actual: e?.stack || e });
} finally {
  await closeBrowser();
}
process.exit(R.summary() ? 1 : 0);
