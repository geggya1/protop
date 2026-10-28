/**
 * Drift-bot 3 – utlegg, kjørebok, fravær/ferie (søk → godkjenn) og timesaldo.
 * Sjekker at samme tall vises likt i Arbeid, Økonomi, Prosjekt og Hjem.
 *
 *   A = ansatt (fører timer, utlegg, kjøring og ferie fra Timeliste)
 *   L = Øverste leder/økonomi (ser utlegg, kjørebok, godkjenner ferie, timesaldo)
 *
 *   NODE_PATH=$(npm root -g) node scripts/e2e/scenarios/drift-3-drift.mjs
 */
import { join } from 'node:path';
import { Bot, closeBrowser } from '../lib/bot.mjs';
import { getDoc, putDoc, listDocs } from '../lib/emu.mjs';
import {
  Report, seedCompany, stamp, dump, go, guard, newBot, openTimesheetCell, enterHours, osloDay, osloDate,
  projectState, OUT,
} from './drift-lib.mjs';

const R = new Report('drift-3-drift');
const SHOTS = join(OUT, '3-drift');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (t) => String(t || '').replace(/[  ]/g, ' ');

const S = await seedCompany(`d${stamp()}`);
const C = S.companyId;
console.log(`Selskap ${C}`);
const today = osloDate();
const day = osloDay();
const monthStart = `${today.slice(0, 8)}01`;

// Bjørn begynte 1. i denne måneden («Ansatt fra»). Timesaldoen skal ikke telle før det.
{
  const p = `families/${C}/employees/emp-ansatt2`;
  const emp = await getDoc(p);
  emp.company.periodFrom = monthStart;
  emp.company.startDate = monthStart;
  await putDoc(p, emp);
}

/** Neste mandag–tirsdag i neste måned (ferie fram i tid, samme år hvis mulig). */
function nextMonthWeekday() {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 1);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const ferieDate = nextMonthWeekday();

/** «Flere valg» i føringsdialogen → valg. */
async function moreChoice(bot, label) {
  await bot.page.getByRole('button', { name: 'Flere valg' }).click();
  await bot.page.waitForTimeout(600);
  await bot.click(label);
  await bot.page.waitForTimeout(800);
}

let A; let L;
try {
  A = await newBot(Bot, 'A-ansatt', S.users.ansatt, { outDir: SHOTS });
  await go(A, 'arbeid', 'timeliste', 4500);

  await guard(R, '3.01', 'Utlegg fra timelisten', async () => {
    await openTimesheetCell(A, '#100 Rehab Kundeveien', day);
    await moreChoice(A, 'Legg til utlegg');
    await A.fill('Beskrivelse', 'Parkering byggeplass');
    await A.fill('Beløp inkl. mva', '250');
    await A.shot('utlegg-skjema');
    await A.click('Lagre', { nth: 1 });
    await sleep(3000);
    const ex = ((await projectState(C)).expenses || []).find((e) => e.description === 'Parkering byggeplass');
    dump('3-01-utlegg', ex || null);
    R.check('3.01', 'Ansatt registrerer utlegg fra føringsdialogen (koblet til ansatt og prosjekt)', ex && ex.employeeId === 'emp-ansatt' && ex.projectId === 'prj-100' && Number(ex.amountInclVat) === 250, {
      actual: ex ? `ansatt=${ex.employeeId} prosjekt=${ex.projectId} inkl=${ex.amountInclVat} eks=${ex.amountExVat} mva=${ex.vatAmount}` : 'ikke lagret', shot: await A.shot('utlegg-lagret'),
    });
    await A.page.keyboard.press('Escape').catch(() => {});
    await A.click('Avbryt').catch(() => {});
  });

  await guard(R, '3.02', 'Kjøring fra timelisten', async () => {
    await openTimesheetCell(A, '#100 Rehab Kundeveien', day);
    await moreChoice(A, 'Legg til bilgodtgjørelse');
    await A.fill('Formål', 'Befaring hos kunde');
    await A.fill('Fra', 'Driftveien 7, Oslo');
    await A.fill('Til', 'Kundeveien 1, Bergen');
    await A.fill('Kilometer', '42');
    await A.shot('kjoring-skjema');
    await A.click('Lagre', { nth: 1 });
    await sleep(3000);
    const trip = ((await projectState(C)).mileageTrips || []).find((t) => Number(t.km) === 42);
    dump('3-02-kjoretur', trip || null);
    R.check('3.02', 'Ansatt registrerer bilgodtgjørelse 42 km fra føringsdialogen', !!trip && trip.employeeId === 'emp-ansatt', {
      actual: trip ? `km=${trip.km} beløp=${trip.amount ?? trip.allowance ?? ''} sats=${trip.rate ?? ''} prosjekt=${trip.projectId}` : 'ikke lagret', shot: await A.shot('kjoring-lagret'),
    });
    await A.click('Avbryt').catch(() => {});
  });

  await guard(R, '3.03', 'Ferie fram i tid', async () => {
    await A.click('Legg til fravær / ferie');
    await A.click('Ferie');
    await A.click('Legg til fravær / ferie', { nth: 2 }).catch(() => {});
    await sleep(1500);
    // Neste måned i rutenettet.
    await A.page.evaluate(() => {
      const mid = document.querySelector('[aria-label="Velg måned og år"]');
      const kids = [...mid.parentElement.querySelectorAll('[tabindex="0"],[role=button]')];
      kids[kids.indexOf(mid) + 1]?.setAttribute('data-drift-next', '1');
    });
    await A.page.locator('[data-drift-next]').click();
    await sleep(2500);
    await openTimesheetCell(A, 'Ferie', Number(ferieDate.slice(8, 10)));
    await A.click('Lagre');
    await sleep(3000);
    const ab = (await listDocs(`families/${C}/absences`)).filter((x) => x.employeeId === 'emp-ansatt');
    R.check('3.03', `Ansatt registrerer ferie ${ferieDate} (venter på godkjenning)`, ab.some((x) => x.date === ferieDate && x.type === 'ferie' && x.status === 'registrert'), {
      actual: ab.map((x) => `${x.date} ${x.type} ${x.status}`).join(';') || 'ingen', shot: await A.shot('ferie-registrert'),
    });
  });

  L = await newBot(Bot, 'L-leder', S.users.okonomi, { outDir: SHOTS });

  await guard(R, '3.04', 'Utlegg på tvers', async () => {
    await go(L, 'okonomi', 'utlegg', 4500);
    const okonomi = norm(await L.visibleText()).includes('Parkering byggeplass');
    const s1 = await L.shot('okonomi-utlegg');
    await go(L, 'arbeid', 'utlegg', 4500);
    const arbeidText = norm(await L.visibleText());
    const arbeid = arbeidText.includes('Parkering byggeplass');
    const s2 = await L.shot('arbeid-prosjektutlegg');
    await go(L, 'projects', null, 3500);
    await L.click('Rehab Kundeveien');
    await L.page.waitForTimeout(1500);
    await L.click('Prosjektutlegg');
    await L.page.waitForTimeout(1500);
    const prosjektText = norm(await L.visibleText());
    const prosjekt = prosjektText.includes('Parkering byggeplass');
    const s3 = await L.shot('prosjekt-utlegg');
    R.check('3.04a', 'Utlegget vises i Arbeid → Prosjektutlegg (250,00 kr)', arbeid && /250,00 kr/.test(arbeidText), { actual: `vises=${arbeid}`, shot: s2 });
    R.check('3.04b', 'Utlegget vises på prosjektet (#100 → Prosjektutlegg, 200,00 kr eks. mva)', prosjekt && /200,00 kr/.test(prosjektText), { actual: `vises=${prosjekt}`, shot: s3 });
    R.check('3.04', 'Utlegget ansatt registrerte vises også i Økonomi → Utlegg', okonomi, {
      expected: 'Samme utlegg i Økonomi → Utlegg', actual: okonomi ? 'vises' : 'vises ikke (Økonomi → Utlegg viser bare utlegg registrert der)', shot: s1,
    });
  });

  await guard(R, '3.05', 'Kjørebok på tvers', async () => {
    await go(L, 'okonomi', 'kjorebok', 4500);
    const t = norm(await L.visibleText());
    const shown = /42/.test(t) && /Befaring|Kundeveien|Driftveien/.test(t);
    const trip = ((await projectState(C)).mileageTrips || []).find((x) => Number(x.km) === 42);
    R.check('3.05', 'Kjøreturen vises i Økonomi → Kjørebok med 42 km', shown, {
      actual: shown ? 'vises' : 'vises ikke', shot: await L.shot('kjorebok'), note: trip ? `beløp i dokumentet: ${JSON.stringify({ amount: trip.amount, allowance: trip.allowance, rate: trip.rate })}` : '',
    });
    await go(L, 'okonomi', 'fakturagrunnlag', 4500);
    await L.click('T.o.m. i dag');
    await L.page.waitForTimeout(2500);
    const g = norm(await L.visibleText());
    R.info('3.05b', 'Til fakturering før utlegget er godkjent: utkast («draft») tas ikke med, og siden sier ikke at noe venter på godkjenning', (g.match(/Totalt å faktureres:[^\n]*/) || [''])[0]);
    // Leder godkjenner utlegget i Økonomi → Utlegg; da skal det komme med i Til fakturering.
    await go(L, 'okonomi', 'utlegg', 4500);
    await L.click('Godkjenn');
    await sleep(3000);
    const ex = ((await projectState(C)).expenses || []).find((e) => e.description === 'Parkering byggeplass');
    await go(L, 'okonomi', 'fakturagrunnlag', 4500);
    await L.click('T.o.m. i dag');
    await L.page.waitForTimeout(2500);
    const g2 = norm(await L.visibleText());
    R.check('3.05c', 'Godkjent utlegg (200,00 kr eks. mva, ev. med påslag) kommer med i Til fakturering for #100', ex?.status === 'approved' && /Totalt å faktureres: (200|220),00 kr/.test(g2), {
      actual: `status=${ex?.status}; ${(g2.match(/Totalt å faktureres:[^\n]*/) || [''])[0]}`, shot: await L.shot('til-fakturering-etter-godkjent-utlegg'),
    });
  });

  await guard(R, '3.06', 'Ferie → godkjenn', async () => {
    await go(L, 'arbeid', 'planlagt', 5000);
    await L.page.getByText('Skal godkjennes', { exact: true }).first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
    await L.page.waitForTimeout(1500);
    const t = await L.visibleText();
    const pendingCard = t.slice(t.indexOf('Skal godkjennes'), t.indexOf('Godkjent', t.indexOf('Skal godkjennes') + 15));
    const listed = /Anne Ansatt/.test(pendingCard);
    R.check('3.06', `Leder ser ferien ${ferieDate} under «Skal godkjennes» i Planlagt fravær`, listed, {
      expected: 'Anne Ansatt venter på godkjenning', actual: listed ? 'vises' : `«${pendingCard.replace(/\s+/g, ' ').slice(0, 160)}» (planåret er ${(t.match(/Ferieplan (\d{4})/) || [])[1]})`,
      shot: await L.shot('planlagt-fravaer'),
    });
    if (listed) {
      const ab = (await listDocs(`families/${C}/absences`)).find((x) => x.employeeId === 'emp-ansatt' && x.date === ferieDate);
      await L.page.locator(`[id="ferieplan-godkjenn-${ab.id}"]`).first().click();
      await sleep(3000);
      const after = (await listDocs(`families/${C}/absences`)).find((x) => x.id === ab.id);
      R.check('3.06a', 'Leder godkjenner ferien', after?.status === 'godkjent', { actual: after?.status, shot: await L.shot('ferie-godkjent') });
    }
  });

  await guard(R, '3.07', 'Timesaldo ny ansatt', async () => {
    await go(L, 'arbeid', 'timesaldo', 4500);
    await L.click('Bjørn Bas');
    await L.page.waitForTimeout(3500);
    const t = norm(await L.visibleText());
    const total = (t.match(/Totalt\n[\s\S]*?\n(-?\d+:\d\d)\n?$/m) || [])[1] || '';
    const saldoLines = t.split('\n').filter((x) => /^-?\d+:\d\d$/.test(x.trim()));
    const last = saldoLines[saldoLines.length - 1] || '';
    const hours = Math.abs(Number(last.split(':')[0]) || 0);
    R.check('3.07', 'Timesaldo for ansatt som begynte 1. denne måneden teller ikke måneder før ansettelsen', hours <= 200, {
      expected: `saldo omtrent −(avtalte timer siden ${monthStart})`, actual: `saldo ${last} ${total}`, shot: await L.shot('timesaldo-ny-ansatt'),
    });
  });

  await guard(R, '3.08', 'Timesaldo vs timeliste', async () => {
    // Den ansatte ser sin egen timesaldo og sin egen timeliste.
    await go(A, 'arbeid', 'timesaldo', 5000);
    await A.page.getByText('Totalt', { exact: true }).first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
    const ts = norm(await A.visibleText());
    const tsLines = ts.split('\n').filter((x) => /^-?\d+:\d\d$/.test(x.trim()));
    const saldo = tsLines[tsLines.length - 1];
    const s1 = await A.shot('timesaldo-egen');
    await go(A, 'arbeid', 'timeliste', 4500);
    await A.page.getByText('Utgående', { exact: true }).first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
    const tl = norm(await A.visibleText());
    const ut = (tl.match(/Utgående\n(-?\d+:\d\d)/) || [])[1];
    const s2 = await A.shot('timeliste-utgaaende');
    R.check('3.08', 'Saldoen i Timeliste («Utgående») og Timesaldo er like for samme ansatt i dag', ut === saldo, {
      actual: `Timeliste Utgående=${ut} · Timesaldo=${saldo}`, shot: s2, note: s1,
    });
  });

  await guard(R, '3.09', 'Hjem', async () => {
    await go(A, 'home', null, 4000);
    const t = norm(await A.visibleText());
    const hasNumbers = /timer|saldo|ferie|utlegg/i.test(t);
    R.info('3.09', 'Hjem (ansatt, PC) viser ingen timer, saldo, ferie eller utlegg – ingenting å sammenligne', hasNumbers ? 'fant noen nøkkelord' : 'ingen slike tall', await A.shot('hjem'));
  });
} catch (e) {
  R.step('X', 'Uventet feil i boten', { ok: false, actual: e?.stack || e });
} finally {
  for (const b of [A, L]) {
    const errs = (b?.errors || []).filter((x) => !/listCalendarConnections|CORS policy/.test(x.message));
    if (errs.length) R.info('JS', `JS-feil hos ${b.name}`, errs.slice(0, 3).map((x) => x.message).join(' | '));
  }
  await closeBrowser();
}
process.exit(R.summary() ? 1 : 0);
