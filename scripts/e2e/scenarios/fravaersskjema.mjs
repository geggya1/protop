/**
 * Fraværsskjema, egenmelding og lønn – hele flyten i nettleseren mot emulatorene.
 *
 *  1. Bedrift → Fravær → Innstillinger → «Egenmelding og lønn»: lovpålagt dekning vises låst,
 *     alt annet er av som standard. Velg IA-ordning, drøftet, «Dekkes: egen legetime», lagre.
 *     Sjekker dokumentet hr/sickLeave.
 *  2. Timeliste (telefon): fører «Annet fravær med lønn» → spørsmålet «Vil du registrere
 *     fraværet?» → «Senere» → «Mangler fraværsskjema» → fyller ut skjemaet som legetime hos
 *     spesialist for seg selv → dagen føres som «Legebesøk med lønn» med skjemaet koblet.
 *  3. Neste dag: legetime med barnet → «Er barnet sykt?» → «Ja, meld sykt barn» åpner
 *     egenmeldingen for sykt barn.
 *  4. HR → Sykefravær viser reglene og peker til innstillingene. Ansattkortet har
 *     «Barn og omsorgsdager».
 *
 * Bruker hjelpe-botens testbedrift (scripts/help-bot/seed.mjs). Skriver OK/AVVIK per steg og
 * avslutter med kode 1 ved avvik.
 *   NODE_PATH=$(npm root -g) node scripts/e2e/scenarios/fravaersskjema.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Bot, closeBrowser } from '../lib/bot.mjs';
import { ROOT, getDoc, listDocs, putDoc } from '../lib/emu.mjs';
import { BOT_COMPANY_ID, BOT_USER } from '../../help-bot/seed.mjs';

const OUT = join(ROOT, 'e2e-out', 'fravaersskjema');
mkdirSync(OUT, { recursive: true });
const results = [];
let failed = 0;

function log(ok, step, detail = '') {
  results.push({ ok, step, detail });
  if (!ok) failed += 1;
  console.log(`${ok ? 'OK   ' : 'AVVIK'} ${step}${detail ? ` – ${detail}` : ''}`);
}

const bots = [];
async function check(step, fn) {
  try {
    const detail = await fn();
    log(true, step, typeof detail === 'string' ? detail : '');
  } catch (err) {
    log(false, step, String(err?.message || err).slice(0, 400));
    // Skjermbilde av det som sto, og lukk åpne vinduer så neste steg starter rent.
    for (const b of bots) {
      await b.shot(`avvik-${step.split(' ')[0]}`).catch(() => {});
      for (let i = 0; i < 3; i += 1) await b.page.keyboard.press('Escape').catch(() => {});
    }
  }
}

function osloToday(offset = 0) {
  const d = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(d);
}

/** Første arbeidsdag fra og med i dag (mandag–fredag). */
function workday(from = 0) {
  for (let i = from; i < from + 7; i += 1) {
    const iso = osloToday(i);
    const wd = new Date(`${iso}T12:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6) return { iso, offset: i };
  }
  return { iso: osloToday(from), offset: from };
}

async function absences() {
  const rows = await listDocs(`families/${BOT_COMPANY_ID}/absences`).catch(() => []);
  return (Array.isArray(rows) ? rows : []).filter((row) => row.employeeId === 'emp-bot');
}

async function expectText(bot, text, timeout = 10000) {
  if (!(await bot.hasText(text, { timeout }))) throw new Error(`Fant ikke «${text}»`);
}

async function expectNoText(bot, text) {
  await bot.page.waitForTimeout(800);
  const all = await bot.visibleText();
  if (all.includes(text)) throw new Error(`«${text}» står fortsatt på skjermen`);
}

async function clickId(bot, id, timeout = 10000) {
  const loc = bot.page.locator(`[id="${id}"]`).first();
  await loc.waitFor({ state: 'visible', timeout });
  await loc.click();
  await bot.page.waitForTimeout(600);
}

// Fraværskategoriene i timelisten: «Annet fravær med lønn» festet for boten.
await putDoc(`families/${BOT_COMPANY_ID}/employees/emp-bot/prefs/timesheet`, {
  absencePins: ['annet_med'],
  starred: {},
  hidden: {},
  updatedAt: new Date().toISOString(),
});

// ---------------------------------------------------------------- 1. Innstillinger (desktop)
const desk = await new Bot('eier-desktop', { ...BOT_USER, view: 'desktop', outDir: OUT }).start();
bots.push(desk);
await desk.login();
await desk.open('selskap', 'sykefravaer', 3500);
await desk.shot('innstillinger-for');

await check('1.1 Fanen «Egenmelding og lønn» åpnes fra Bedrift → Fravær → Innstillinger', async () => {
  await expectText(desk, 'Egenmelding og lønn');
  await expectText(desk, 'Lovens regler');
  await expectText(desk, 'IA-ordning');
});
await check('1.2 Lovpålagt dekning vises låst', async () => {
  await expectText(desk, 'Lovpålagt, alltid med lønn fra arbeidsgiver');
  await expectText(desk, 'Svangerskapskontroll (aml. § 12-1)');
  await expectText(desk, 'Ammefri inntil én time per dag');
});
await check('1.3 Alt som ikke er lovpålagt, er av som standard', async () => {
  const boxes = desk.page.getByRole('checkbox', { name: /^Dekkes:/ });
  const n = await boxes.count();
  if (n < 7) throw new Error(`Fant ${n} «Dekkes»-valg, ventet 7`);
  for (let i = 0; i < n; i += 1) {
    const on = await boxes.nth(i).getAttribute('aria-checked');
    if (on === 'true') throw new Error(`Valg ${i + 1} er på fra start`);
  }
  const doc = await getDoc(`families/${BOT_COMPANY_ID}/hr/sickLeave`);
  if (doc && Object.values(doc.paidLeave || {}).some(Boolean)) throw new Error('hr/sickLeave har dekning på fra før');
  return `${n} valg, alle av`;
});
await check('1.4 Velg IA-ordning, drøftet og egen legetime, lagre', async () => {
  await desk.click('IA-ordning');
  await desk.click('Drøftet med tillitsvalgte (ftrl § 8-24)');
  await desk.click('Dekkes: Egen lege-, tannlege- eller spesialisttime');
  await desk.click('Lagre');
  await expectText(desk, 'Reglene er lagret.');
  await desk.shot('innstillinger-lagret');
});
await check('1.5 hr/sickLeave er lagret riktig', async () => {
  const doc = await getDoc(`families/${BOT_COMPANY_ID}/hr/sickLeave`);
  if (!doc) throw new Error('Dokumentet finnes ikke');
  const want = { extendedSelfCert: true, extendedDays: 8, annualCapDays: 24, extendedDiscussed: true };
  for (const [k, v] of Object.entries(want)) if (doc[k] !== v) throw new Error(`${k} = ${JSON.stringify(doc[k])}, ventet ${v}`);
  if (doc.paidLeave?.lege !== true) throw new Error('paidLeave.lege er ikke på');
  const others = Object.entries(doc.paidLeave || {}).filter(([k, v]) => k !== 'lege' && v);
  if (others.length) throw new Error(`Andre valg ble slått på: ${others.map(([k]) => k).join(', ')}`);
});
await check('1.6 Etter ny innlasting står IA-ordning og «Gjelder nå: 8 kalenderdager»', async () => {
  await desk.page.reload({ waitUntil: 'domcontentloaded' });
  await desk.waitShell();
  await desk.open('selskap', 'sykefravaer', 3500);
  await expectText(desk, 'Gjelder nå: 8 kalenderdager om gangen, høyst 24 dager per 12 måneder.');
});
await check('1.7 HR → Sykefravær viser reglene og peker til innstillingene', async () => {
  await desk.open('hr', 'sykefravaer', 3500);
  if (!(await desk.hasText('Regler for egenmelding', { timeout: 6000 }))) {
    await desk.open('hr', null, 2500);
    await desk.click('Sykefravær', { timeout: 6000 }).catch(() => {});
  }
  await expectText(desk, 'IA-ordning: 8 kalenderdager om gangen, 24 per 12 måneder.');
  await expectText(desk, 'Settes under Bedrift → Fravær → Innstillinger → Egenmelding og lønn.');
  await expectText(desk, 'Bedriften dekker også: Egen lege-, tannlege- eller spesialisttime.');
  await desk.shot('hr-regler');
});
await check('1.8 Ansattkortet har «Barn og omsorgsdager»', async () => {
  await desk.open('ansatte', null, 3500);
  await desk.click('Ola Tømrer', { exact: false, timeout: 10000 });
  await desk.page.waitForTimeout(1500);
  await expectText(desk, 'Barn og omsorgsdager');
});
await check('1.9 Registrer 3 barn og alene om omsorgen: 30 omsorgsdager, lagret på ansatt', async () => {
  await desk.page.getByRole('button', { name: 'Rediger Barn og omsorgsdager' }).first().click();
  await desk.page.waitForTimeout(800);
  const box = desk.page.locator('[id="employee-inline-section-childCare"]');
  await box.waitFor({ state: 'visible', timeout: 8000 });
  const inputs = box.locator('input');
  await inputs.nth(0).fill('3');
  await inputs.nth(1).fill('0');
  await box.getByText('Alene om omsorgen', { exact: true }).first().click();
  await desk.page.getByText('Lagre', { exact: true }).last().click();
  await desk.page.waitForTimeout(2000);
  await expectText(desk, '30 dager');
  const deadline = Date.now() + 15000;
  let care = null;
  while (Date.now() < deadline) {
    care = (await getDoc(`families/${BOT_COMPANY_ID}/employees/emp-ola`))?.extras?.childCare;
    if (care?.alone === true) break;
    await desk.page.waitForTimeout(800);
  }
  if (String(care?.children) !== '3' || care?.alone !== true) throw new Error(`extras.childCare = ${JSON.stringify(care)}`);
  await desk.shot('ansatt-barn');
});

// ---------------------------------------------------------------- 2. Timeliste (telefon): linjen «Fravær»
const d1 = workday(0);
const d2 = workday(d1.offset + 1);
const d3 = workday(d2.offset + 1);
const d4 = workday(d3.offset + 1);
// Et eldre fravær uten skjema (ført før veiviseren): skal gi «Mangler fraværsskjema».
await putDoc(`families/${BOT_COMPANY_ID}/absences/fra-legacy`, {
  id: 'fra-legacy', employeeId: 'emp-bot', employeeName: 'Hjelpe Bot', date: d4.iso, hours: 7.5, type: 'annet_med',
  status: 'registrert', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});

const phone = await new Bot('eier-telefon', { ...BOT_USER, view: 'phone', outDir: OUT }).start();
bots.push(phone);
await phone.login();
await phone.open('timeliste', null, 4000);
async function goToDay(target, from) {
  for (let i = from; i < target; i += 1) {
    await phone.page.getByRole('button', { name: 'Neste dag' }).first().click();
    await phone.page.waitForTimeout(500);
  }
}
await goToDay(d1.offset, 0);
await phone.shot('timeliste');

async function waitAbsence(pred, label, timeout = 20000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const row = (await absences()).find(pred);
    if (row) return row;
    await phone.page.waitForTimeout(800);
  }
  throw new Error(`${label}: ikke i skyen`);
}

await check('2.1 Linjen «Fravær» står nederst og åpner «Registrer fravær»', async () => {
  await expectText(phone, 'Trykk for å registrere fravær');
  await clickId(phone, 'timesheet-absence', 20000);
  await expectText(phone, 'Registrer fravær');
  await expectText(phone, 'Hva gjelder fraværet? Velg det som passer best.');
  for (const id of ['syk', 'sykt_barn', 'ferie', 'avspasering', 'lege', 'familie', 'permisjon', 'kurs', 'annet']) {
    if (!(await phone.page.locator(`[id="fravaer-valg-${id}"]`).count())) throw new Error(`mangler valget ${id}`);
  }
  await phone.shot('valg');
});
await check('2.2 Lege: felt, lønn etter avtale og timer per dag', async () => {
  await clickId(phone, 'fravaer-valg-lege');
  await expectText(phone, 'Ingen lovfestet rett etter aml.');
  await phone.click('Meg selv');
  await phone.click('Spesialisthelsetjenesten / sykehus');
  await phone.page.locator('[id="fravaersskjema-timer"]').first().fill('2:00');
  await expectText(phone, 'Føres som: Legebesøk med lønn');
  await phone.shot('skjema-lege');
});
await check('2.3 Sende uten bekreftelse gir feil', async () => {
  await clickId(phone, 'fravaersskjema-send');
  await expectText(phone, 'Bekreft at opplysningene er riktige.');
});
await check('2.4 Send: legetime 2:00 med skjema i skyen', async () => {
  await phone.click('Jeg bekrefter at opplysningene er riktige, og at dokumentasjon kan kreves.');
  await clickId(phone, 'fravaersskjema-send');
  await expectText(phone, 'Fraværsskjema sendt til leder.');
  const row = await waitAbsence((r) => r.date === d1.iso && r.formId, 'legetimen');
  if (row.type !== 'lege_med' || row.hours !== 2) throw new Error(`${row.type} ${row.hours}`);
  if (row.formDetails?.provider !== 'spesialist' || row.formDetails?.whoFor !== 'selv') throw new Error(JSON.stringify(row.formDetails));
  return `${row.date} ${row.type} ${row.hours}`;
});
await check('2.5 Linjen viser dagens fravær, og trykk viser det først', async () => {
  await expectText(phone, 'Legebesøk med lønn');
  await clickId(phone, 'timesheet-absence');
  await expectText(phone, 'Registrer nytt fravær');
  if (!(await phone.page.locator('[id^="fravaer-rad-"]').count())) throw new Error('fraværet på dagen vises ikke');
  await phone.shot('dagen');
});
await check('2.6 Nytt fravær samme dag: velferd (flytting) via «Permisjon og velferd»', async () => {
  await clickId(phone, 'fravaer-nytt');
  await clickId(phone, 'fravaer-valg-permisjon');
  await clickId(phone, 'fravaer-undervalg-velferd');
  await expectText(phone, 'Anledning');
  await phone.shot('velferd');
  if (!(await phone.hasText('Flytting', { timeout: 1500 }))) {
    await phone.page.getByRole('button', { name: /Anledning/ }).first().click();
    await phone.page.waitForTimeout(600);
  }
  await phone.click('Flytting', { timeout: 10000 });
  await phone.page.locator('[id="fravaersskjema-timer"]').first().fill('4:00');
  await expectText(phone, 'Føres som: Annet fravær uten lønn');
  await phone.click('Jeg bekrefter at opplysningene er riktige, og at dokumentasjon kan kreves.');
  await clickId(phone, 'fravaersskjema-send');
  const row = await waitAbsence((r) => r.date === d1.iso && r.formCategory === 'velferd', 'velferden');
  if (row.type !== 'annet_uten' || row.hours !== 4) throw new Error(`${row.type} ${row.hours}`);
});
await check('2.7 Ferie neste arbeidsdag: lagres uten skjema, hel dag', async () => {
  await goToDay(d2.offset, d1.offset);
  await clickId(phone, 'timesheet-absence');
  await clickId(phone, 'fravaer-valg-ferie');
  await expectText(phone, 'Føres som: Ferie');
  await clickId(phone, 'fravaersskjema-send');
  const row = await waitAbsence((r) => r.date === d2.iso && r.type === 'ferie', 'ferien');
  if (row.formId) throw new Error('ferie skal ikke ha skjema');
  return `${row.date} ${row.hours} t`;
});
await check('2.8 Sykt barn går til egenmeldingen', async () => {
  await goToDay(d3.offset, d2.offset);
  await clickId(phone, 'timesheet-absence');
  await clickId(phone, 'fravaer-valg-sykt_barn');
  await expectText(phone, 'Meld sykefravær');
  await expectText(phone, 'Omsorgsdager');
  await phone.shot('sykt-barn');
  await phone.page.getByRole('button', { name: 'Lukk' }).first().click().catch(() => {});
  await phone.page.waitForTimeout(600);
});
await check('2.9 Eldre fravær uten skjema: «Mangler fraværsskjema» → skjema, typen byttes', async () => {
  await expectText(phone, 'Mangler fraværsskjema');
  await clickId(phone, 'husk-fravaersskjema');
  await expectText(phone, 'Dagene står som Annet fravær med lønn');
  await clickId(phone, 'fravaer-valg-lege');
  await phone.click('Meg selv');
  await phone.click('Tannlege');
  await expectText(phone, 'Føres som: Legebesøk med lønn');
  await phone.click('Jeg bekrefter at opplysningene er riktige, og at dokumentasjon kan kreves.');
  await clickId(phone, 'fravaersskjema-send');
  const row = await waitAbsence((r) => r.id === 'fra-legacy' && r.formId, 'det eldre fraværet');
  if (row.type !== 'lege_med' || row.hours !== 7.5) throw new Error(`${row.type} ${row.hours}`);
  const same = (await absences()).filter((r) => r.date === d4.iso);
  if (same.length !== 1) throw new Error(`${same.length} rader på dagen`);
  await expectNoText(phone, 'Mangler fraværsskjema');
});

// ---------------------------------------------------------------- 3. Timeliste på PC
await check('3.1 PC: «Fravær» nederst i rutenettet, knappene synlige over tabellen, uten «Åpne prosjekt»', async () => {
  await desk.open('timeliste', null, 4000);
  await desk.page.locator('[id="timesheet-absence-row-fravaer"]').first().waitFor({ state: 'visible', timeout: 20000 });
  await expectText(desk, 'Legg til prosjekt');
  await expectText(desk, 'Registrer fravær');
  const all = await desk.visibleText();
  if (all.includes('Åpne prosjekt')) throw new Error('«Åpne prosjekt» står fortsatt');
  const pos = await desk.page.evaluate(() => {
    const row = document.querySelector('[id="timesheet-absence-row-fravaer"]');
    const rows = [...document.querySelectorAll('[id="timesheet-grid"] [role=button]')];
    const add = document.querySelector('[id="timesheet-add-project"]');
    const grid = document.querySelector('[id="timesheet-grid"]');
    const a = add?.getBoundingClientRect();
    const g = grid?.getBoundingClientRect();
    return {
      visible: !!(a && a.width > 60 && a.right <= window.innerWidth && a.left >= 0),
      above: !!(a && g && a.bottom <= g.top + 2),
      size: a ? `${Math.round(a.width)}×${Math.round(a.height)}` : '',
      cells: rows.length,
    };
  });
  if (!pos.visible || !pos.above) throw new Error(`«Legg til prosjekt» ${pos.size}: synlig=${pos.visible} over=${pos.above}`);
  await desk.page.locator('[id="timesheet-absence-row-fravaer"] > [role=button]').nth(Number(d1.iso.slice(8, 10)) - 1).click();
  // PC-økten har ikke lastet fraværet telefonen førte: da går den rett til valgene.
  if (!(await desk.hasText('Registrer nytt fravær', { timeout: 3000 }))) await expectText(desk, 'Hva gjelder fraværet?');
  await desk.shot('pc-timeliste');
});

// Emulatoren laster bare konsernfunksjonene: CORS-feil fra andre funksjoner ved innlogging er miljøstøy.
const errors = [...desk.errors, ...phone.errors].filter((e) => !/blocked by CORS policy|net::ERR_FAILED/.test(e.message));
const calls = [...desk.failedCalls, ...phone.failedCalls];
log(!errors.length, '4.1 Ingen JS-feil', errors.map((e) => `${e.at}: ${e.message}`).join(' | ').slice(0, 600));
log(!calls.length, '4.2 Ingen funksjonskall feilet', calls.map((c) => `${c.at}: ${c.url} ${c.status}`).join(' | ').slice(0, 600));

writeFileSync(join(OUT, 'result.json'), JSON.stringify({ failed, results, errors, calls }, null, 2));
await desk.stop();
await phone.stop();
await closeBrowser();
console.log(failed ? `\n${failed} avvik` : '\nAlle steg OK');
process.exit(failed ? 1 : 0);
