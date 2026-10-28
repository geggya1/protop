/**
 * Drift-bot 7 – tregt nett på byggeplassen.
 * Den ansatte åpner Timeliste mens svarene fra Firestore er forsinket (> 12 s, som på dårlig
 * mobildekning). Lesingen av prosjektdokumentet gir da opp, og timelisten blir tom. Når den
 * ansatte så gjør en endring (låser timelisten), skal ikke det felles prosjektdokumentet
 * overskrives med en tom prosjektliste.
 *
 * Forsinkelsen lages med Playwright (page.route) bare i den ansattes nettleser.
 * Én nettleserkontekst.
 *
 *   NODE_PATH=$(npm root -g) node scripts/e2e/scenarios/drift-7-tregt-nett.mjs
 */
import { join } from 'node:path';
import { Bot, closeBrowser } from '../lib/bot.mjs';
import { getDoc } from '../lib/emu.mjs';
import {
  Report, seedCompany, stamp, dump, go, guard, newBot, osloDate, projectState, OUT,
} from './drift-lib.mjs';

const R = new Report('drift-7-tregt-nett');
const SHOTS = join(OUT, '7-tregt-nett');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = await seedCompany(`n${stamp()}`);
const C = S.companyId;
const today = osloDate();
console.log(`Selskap ${C}`);
const nums = (st) => (st.projects || []).map((p) => p.number);

let A;
try {
  A = await newBot(Bot, 'A-ansatt', S.users.ansatt, { outDir: SHOTS });
  await go(A, 'home', null, 3000);
  const before = await projectState(C);
  dump('7-00-projects-state-for', await getDoc(`families/${C}/projects/state`));

  await guard(R, '7.01', 'Tregt nett', async () => {
    // Forsink alle kall mot Firestore i 25 sekunder (hvert kall venter 15 s).
    const until = Date.now() + 25000;
    await A.page.route(/127\.0\.0\.1:8085/, async (route) => {
      if (Date.now() < until) await sleep(15000);
      await route.continue().catch(() => {});
    });
    await go(A, 'arbeid', 'timeliste', 4000);
    await sleep(Math.max(0, until - Date.now()) + 8000);
    const t = await A.visibleText();
    const empty = !/#100 Rehab Kundeveien/.test(t);
    const warned = /Kunne ikke|feil|frakoblet|offline|ikke lastet/i.test(t.slice(t.indexOf('Timeliste')));
    R.check('7.01', 'Når prosjektene ikke kunne lastes, sier timelisten fra (ikke bare en tom liste)', !empty || warned, {
      actual: `prosjekt #100 vises=${!empty}; feilmelding=${warned}`, shot: await A.shot('timeliste-etter-tregt-nett'),
    });
    await A.page.getByRole('button', { name: `Lås timer til ${today}` }).click({ timeout: 30000 });
    await sleep(5000);
    const after = await projectState(C);
    dump('7-01-projects-state-etter', await getDoc(`families/${C}/projects/state`));
    R.check('7.02', 'En endring fra en timeliste som ikke fikk lastet prosjektene, sletter ikke prosjektlisten for alle', nums(after).length >= nums(before).length, {
      expected: `projects=${nums(before).join(',')}`, actual: `projects=${nums(after).join(',') || '(tom)'}; members=${(after.members || []).length}; timesheetLocks=${(after.timesheetLocks || []).length}`,
      shot: await A.shot('etter-lasing'),
    });
  });
} catch (e) {
  R.step('X', 'Uventet feil i boten', { ok: false, actual: e?.stack || e });
} finally {
  await closeBrowser();
}
process.exit(R.summary() ? 1 : 0);
