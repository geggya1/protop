/**
 * Drift-bot 10 – Økonomi → Utlegg (DRIFT-24, UX-17): utlegg koblet til ansatt, prosjekt og kunde,
 * norsk status, hint i Til fakturering mens det venter, og sletting med bekreftelse.
 * Utlegg er én side for prosjekt og internt: «Nytt utlegg» åpner skjemaet, og et utlegg åpnes
 * fra listen for å godkjenne eller slette.
 * Én nettleserkontekst (Øverste leder). Personvernmeldingen lukkes først (den dekker knappene).
 *
 *   NODE_PATH=$(npm root -g) node scripts/e2e/scenarios/drift-10-utlegg.mjs
 */
import { join } from 'node:path';
import { Bot, closeBrowser } from '../lib/bot.mjs';
import {
  Report, seedCompany, stamp, go, guard, newBot, fillAfterLabel, osloDate, projectState, OUT,
} from './drift-lib.mjs';

const R = new Report('drift-10-utlegg');
const SHOTS = join(OUT, '10-utlegg');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = await seedCompany(`u${stamp()}`);
const C = S.companyId;
const today = osloDate();
console.log(`Selskap ${C}`);

async function closeNotice(bot) {
  const ok = bot.page.getByRole('button', { name: 'OK', exact: true });
  if (await ok.count()) await ok.first().click().catch(() => {});
  await bot.page.waitForTimeout(400);
}

const find = async () => ((await projectState(C)).expenses || []).find((row) => row.description === 'Leie av lift');

let L;
try {
  L = await newBot(Bot, 'L-leder', S.users.okonomi, { outDir: SHOTS });
  await go(L, 'okonomi', 'utlegg', 5000);
  await closeNotice(L);

  await guard(R, '10.01', 'Nytt utlegg fra registrene', async () => {
    await L.click('Nytt utlegg');
    await L.page.waitForTimeout(800);
    await fillAfterLabel(L, 'Dato', today);
    await fillAfterLabel(L, 'Beløp eks. mva', '800');
    await fillAfterLabel(L, 'Beskrivelse', 'Leie av lift');
    await L.click('#100 Rehab Kundeveien');
    await L.page.waitForTimeout(600);
    await L.shot('skjema');
    await L.click('Lagre utlegg');
    await sleep(3000);
    const row = await find();
    R.check('10.01', 'Utlegget er koblet til ansatt, prosjekt og prosjektets kunde', row && row.employeeId === 'emp-okonomi' && row.projectId === 'prj-100' && row.customerId === 'cust-k1', {
      actual: row ? `ansatt=${row.employeeId} prosjekt=${row.projectId} kunde=${row.customerId}/${row.customerName}` : 'ikke lagret', shot: await L.shot('lagret'),
    });
    const text = await L.visibleText();
    R.check('10.02', 'Status vises på norsk («Venter på godkjenning»), ikke «draft»', /Venter på godkjenning/.test(text) && !/· draft ·/.test(text), {
      actual: (text.match(/[^\n]*Leie av lift[^\n]*\n[^\n]*/) || [''])[0].replace(/\n/g, ' | '),
    });
  });

  await guard(R, '10.03', 'Hint i Til fakturering', async () => {
    await go(L, 'okonomi', 'fakturagrunnlag', 5000);
    await L.click('T.o.m. i dag');
    await L.page.waitForTimeout(2500);
    const hint = await L.hasText('venter på godkjenning og er ikke med her', { exact: false, timeout: 8000 });
    R.check('10.03', 'Til fakturering sier at utlegg venter på godkjenning', hint, { shot: await L.shot('til-fakturering-hint') });
  });

  await guard(R, '10.04', 'Sletting med bekreftelse', async () => {
    await go(L, 'okonomi', 'utlegg', 5000);
    await closeNotice(L);
    const row = await find();
    await L.page.locator(`[id="expense-row-${row.id}"]`).click();
    await sleep(800);
    await L.page.locator('[id="expense-sheet-delete"]').click();
    await sleep(1500);
    const still = !!(await find());
    const asked = await L.hasText('Trykk «Slett nå» for å slette utlegget', { exact: false, timeout: 3000 });
    await L.shot('bekreft');
    await L.page.locator('[id="expense-sheet-delete"]').click();
    await sleep(3000);
    const gone = !(await find());
    R.check('10.04', 'Første trykk spør, andre sletter utlegget', still && asked && gone, {
      actual: `etter første trykk finnes=${still} spørsmål=${asked}; etter andre slettet=${gone}`, shot: await L.shot('slettet'),
    });
  });
} catch (e) {
  R.step('X', 'Uventet feil i boten', { ok: false, actual: e?.stack || e });
} finally {
  await closeBrowser();
}
process.exit(R.summary() ? 1 : 0);
