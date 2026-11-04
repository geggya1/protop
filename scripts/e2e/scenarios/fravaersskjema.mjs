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

async function check(step, fn) {
  try {
    const detail = await fn();
    log(true, step, typeof detail === 'string' ? detail : '');
  } catch (err) {
    log(false, step, String(err?.message || err).slice(0, 400));
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

// ---------------------------------------------------------------- 2. Timeliste (telefon)
const phone = await new Bot('eier-telefon', { ...BOT_USER, view: 'phone', outDir: OUT }).start();
const consoleLog = [];
phone.page.on('console', (msg) => { if (['warning', 'error', 'log'].includes(msg.type())) consoleLog.push(`${msg.type()}: ${msg.text().slice(0, 200)}`); });
await phone.login();
await phone.open('timeliste', null, 4000);
const first = workday(0);
// Timelisten står på i dag. Er det helg, går vi fram til mandag.
for (let i = 0; i < first.offset; i += 1) {
  await phone.page.getByRole('button', { name: 'Neste dag' }).first().click().catch(() => {});
  await phone.page.waitForTimeout(400);
}
await phone.shot('timeliste');

await check('2.1 «Annet fravær med lønn» åpner timedialogen', async () => {
  await clickId(phone, 'timesheet-absence-annet_med', 20000);
  await expectText(phone, 'Timer på denne dagen');
});
await check('2.2 Lagre gir spørsmålet «Vil du registrere fraværet?»', async () => {
  await phone.click('Lagre');
  await expectText(phone, 'Vil du registrere fraværet?');
  await phone.shot('sporsmal');
});
await check('2.3 «Senere» gir påminnelsen «Mangler fraværsskjema»', async () => {
  await clickId(phone, 'fravaersskjema-senere');
  await expectText(phone, 'Mangler fraværsskjema');
  let row = null;
  const until = Date.now() + 30000;
  while (!row && Date.now() < until) {
    row = (await absences()).find((r) => r.date === first.iso && r.type === 'annet_med');
    if (!row) await phone.page.waitForTimeout(1000);
  }
  if (!row) {
    const all = await listDocs(`families/${BOT_COMPANY_ID}/absences`).catch((e) => [String(e)]);
    const screen = await phone.visibleText();
    console.log('DIAG absences:', JSON.stringify(all).slice(0, 1500));
    const flat = screen.replace(/\s+/g, ' ');
    const i = flat.indexOf('Fravær registrert');
    console.log('DIAG skjerm:', flat.slice(Math.max(0, i - 300), i + 300));
    console.log('DIAG feiltekst:', /Kunne ikke|feilet|avvist|ikke lagret/i.test(flat) ? flat.match(/.{0,120}(Kunne ikke|feilet|avvist|ikke lagret).{0,160}/i)?.[0] : 'ingen');
    console.log('DIAG konsoll:', JSON.stringify(consoleLog.filter((m) => !/CORS|ERR_FAILED/.test(m)).slice(-30)).slice(0, 3000));
    const local = await phone.page.evaluate(() => Object.keys(localStorage).filter((k) => /absen|frav|pending|queue|outbox/i.test(k)).map((k) => `${k}=${String(localStorage.getItem(k)).slice(0, 200)}`));
    console.log('DIAG localStorage:', JSON.stringify(local).slice(0, 2000));
  }
  if (!row) throw new Error(`Fant ikke fraværet ${first.iso} i skyen`);
  if (row.formId) throw new Error('Fraværet har skjema allerede');
  await phone.shot('mangler-skjema');
});
await check('2.4 «Fyll ut» åpner fraværsskjemaet', async () => {
  await clickId(phone, 'husk-fravaersskjema');
  await expectText(phone, 'Fraværsskjema');
  await expectText(phone, 'Hva gjelder fraværet?');
});
await check('2.5 Sende uten grunnlag og bekreftelse gir feil', async () => {
  await clickId(phone, 'fravaersskjema-send');
  await expectText(phone, 'Velg hva fraværet gjelder.');
  await expectText(phone, 'Bekreft at opplysningene er riktige.');
});
await check('2.6 Legetime hos spesialist for meg selv: føres som «Legebesøk med lønn»', async () => {
  await phone.click('Velg grunnlag', { exact: false });
  await phone.click('Lege, tannlege, spesialist eller behandling');
  await expectText(phone, 'Ingen lovfestet rett etter aml.');
  await phone.click('Meg selv');
  await phone.click('Spesialisthelsetjenesten / sykehus');
  await expectText(phone, 'Føres som: Legebesøk med lønn');
  await expectText(phone, 'Med lønn etter bedriftens avtale (legetime).');
  await phone.shot('skjema-lege');
});
await check('2.7 Send skjema: dagen får skjema og riktig type', async () => {
  await phone.click('Jeg bekrefter at opplysningene er riktige, og at dokumentasjon kan kreves.');
  await clickId(phone, 'fravaersskjema-send');
  await expectText(phone, 'Fraværsskjema sendt til leder.');
  await expectNoText(phone, 'Mangler fraværsskjema');
  const deadline = Date.now() + 15000;
  let row = null;
  while (Date.now() < deadline) {
    row = (await absences()).find((r) => r.date === first.iso && r.formId);
    if (row) break;
    await phone.page.waitForTimeout(800);
  }
  if (!row) throw new Error('Fraværet i skyen har ikke formId');
  if (row.type !== 'lege_med') throw new Error(`type = ${row.type}, ventet lege_med`);
  if (row.formCategory !== 'lege') throw new Error(`formCategory = ${row.formCategory}`);
  if (row.formDetails?.provider !== 'spesialist' || row.formDetails?.whoFor !== 'selv') throw new Error(`formDetails = ${JSON.stringify(row.formDetails)}`);
  const dup = (await absences()).filter((r) => r.date === first.iso);
  if (dup.length !== 1) throw new Error(`${dup.length} fraværsrader på dagen, ventet 1`);
  return `${row.date} ${row.type}`;
});

// ---------------------------------------------------------------- 3. Med barn til lege
const second = workday(first.offset + 1);
await check('3.1 Neste arbeidsdag: legetime med barnet spør om barnet er sykt', async () => {
  for (let i = first.offset; i < second.offset; i += 1) {
    await phone.page.getByRole('button', { name: 'Neste dag' }).first().click();
    await phone.page.waitForTimeout(500);
  }
  await clickId(phone, 'timesheet-absence-annet_med');
  await phone.click('Lagre');
  await clickId(phone, 'fravaersskjema-apne');
  await phone.click('Velg grunnlag', { exact: false });
  await phone.click('Lege, tannlege, spesialist eller behandling');
  await phone.click('Barnet mitt');
  await expectText(phone, 'Er barnet sykt?');
  const day2 = (await absences()).find((r) => r.date === second.iso);
  console.log('DIAG dag 2 i skyen (før skjema):', day2 ? `${day2.type} ${day2.hours}` : 'nei');
  await expectText(phone, 'Føres som: Legebesøk uten lønn');
  await phone.shot('skjema-barn');
});
await check('3.2 «Ja, meld sykt barn» åpner egenmelding for sykt barn', async () => {
  await clickId(phone, 'fravaersskjema-meld-sykt-barn');
  await expectText(phone, 'Meld sykefravær');
  await expectText(phone, 'Omsorgsdager');
  await phone.shot('sykt-barn');
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
