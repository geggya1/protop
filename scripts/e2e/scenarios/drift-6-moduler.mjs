/**
 * Drift-bot 6 – modulaktivering (Selskap → Moduler).
 * Eier slår av «Kunder». Leder har siden åpen: forsvinner modulen for ham i sanntid,
 * uten ny lasting? Og hva sier reglene om data i modulen? Høyst to kontekster samtidig.
 *
 *   NODE_PATH=$(npm root -g) node scripts/e2e/scenarios/drift-6-moduler.mjs
 */
import { join } from 'node:path';
import { Bot, closeBrowser } from '../lib/bot.mjs';
import { getDoc } from '../lib/emu.mjs';
import {
  Report, seedCompany, stamp, go, guard, newBot, token, getAs, OUT,
} from './drift-lib.mjs';

const R = new Report('drift-6-moduler');
const SHOTS = join(OUT, '6-moduler');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = await seedCompany(`m${stamp()}`);
const C = S.companyId;
console.log(`Selskap ${C}`);

let E; let L;
const lockedShown = (bot) => bot.hasText('Kunder er ikke aktivert', { timeout: 30000 });

try {
  L = await newBot(Bot, 'L-leder', S.users.okonomi, { outDir: SHOTS });
  await guard(R, '6.01', 'Kunder åpen', async () => {
    await go(L, 'kunder', null, 5000);
    R.check('6.01', 'Leder har Kunder åpen (modulen er aktiv)', await L.hasText('Kunde En AS', { timeout: 60000 }), { shot: await L.shot('kunder-aktiv') });
  });

  E = await newBot(Bot, 'E-eier', S.users.eier, { outDir: SHOTS });
  await guard(R, '6.02', 'Slå av Kunder', async () => {
    await go(E, 'selskap', 'moduler', 5000);
    const sw = E.page.getByRole('switch', { name: /^Kunder,/ }).first();
    await sw.waitFor({ state: 'visible', timeout: 20000 });
    await sw.click();
    await E.page.waitForTimeout(500);
    await E.click('Lagre moduler');
    await sleep(3000);
    const fam = await getDoc(`families/${C}`);
    R.check('6.02', 'Eier slår av «Kunder» i Modulinnstillinger', (fam?.company?.modules?.disabled || []).includes('kunder'), {
      actual: JSON.stringify(fam?.company?.modules || {}), shot: await E.shot('moduler-kunder-av'),
    });
  });

  await guard(R, '6.03', 'Sanntid hos leder', async () => {
    const live = await lockedShown(L);
    R.check('6.03', 'Leder som har Kunder åpen får «Kunder er ikke aktivert» i sanntid (uten ny lasting)', live, {
      actual: live ? 'låst side vises' : 'kundelisten vises fortsatt', shot: await L.shot('kunder-etter-av'),
    });
    await go(L, 'kunder', null, 3000);
    R.check('6.03a', 'Leder som åpner Kunder på nytt får låst side', await lockedShown(L), { shot: await L.shot('kunder-apnet-pa-nytt') });
  });

  await guard(R, '6.04', 'Meny hos leder', async () => {
    const menu = await L.page.evaluate(() => document.body.innerText);
    R.check('6.04', 'Menyen hos leder merker Kunder som «Ikke aktivert»', /Ikke aktivert/.test(menu), {
      actual: /Ikke aktivert/.test(menu) ? 'merket' : 'ikke merket', shot: await L.shot('meny-etter-av'),
    });
  });

  await guard(R, '6.05', 'Data i avslått modul', async () => {
    const tok = await token(S.users.okonomi);
    const res = await getAs(tok, `families/${C}/anbud/customers`);
    R.info('6.05', 'Kundedata kan fortsatt leses via REST når modulen er av (modulvalget håndheves bare i klienten)', `HTTP ${res.status}, ${(res.data?.customers || []).length} kunder`);
  });

  await guard(R, '6.06', 'Slå på igjen', async () => {
    const sw = E.page.getByRole('switch', { name: /^Kunder,/ }).first();
    await sw.click();
    await E.page.waitForTimeout(500);
    await E.click('Lagre moduler');
    await sleep(3000);
    const fam = await getDoc(`families/${C}`);
    const back = await L.hasText('Kunde En AS', { timeout: 15000 });
    R.check('6.06', 'Når eier slår Kunder på igjen, får leder kundelisten tilbake i sanntid', !(fam?.company?.modules?.disabled || []).includes('kunder') && back, {
      actual: `disabled=${JSON.stringify(fam?.company?.modules?.disabled || [])} listen vises=${back}`, shot: await L.shot('kunder-pa-igjen'),
    });
  });
} catch (e) {
  R.step('X', 'Uventet feil i boten', { ok: false, actual: e?.stack || e });
} finally {
  for (const b of [E, L]) {
    const errs = (b?.errors || []).filter((x) => !/listCalendarConnections|fetchExternalCalendarEvents|CORS policy/.test(x.message));
    if (errs.length) R.info('JS', `JS-feil hos ${b.name}`, errs.slice(0, 3).map((x) => x.message).join(' | '));
  }
  await closeBrowser();
}
process.exit(R.summary() ? 1 : 0);
